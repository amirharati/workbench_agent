/**
 * Wave orchestrator for scoped pipeline jobs (≥96 items, A5b-2).
 *
 * Overlap model: enrichBatch runs concurrently with downstream classify waves.
 * Each wave = embed + classifyIncremental (autoDiscover: false). No discoverBatch.
 */
import { classifyIncremental } from '../categorization';
import { notifyDataChanged } from '../dataChangeNotifier';
import { commitPendingDbWrites, refreshPipelineCacheFromWorker } from '../db';
import { enrichBatch, getAllEnrichments } from '../enrichment';
import {
  prepBatchPipelineItems,
  runEnrichmentBatchPostProcess,
} from './batchPostProcess';
import {
  type ImportPipelineJob,
  preflightImportPipelineStart,
  writeImportPipelineJob,
} from './importPipelineJob';

// ── Public types ──────────────────────────────────────────────────────────────

export type ScopedPipelineJobProgress = {
  phase: 'prep' | 'enrich' | 'embed' | 'classify' | 'wave' | 'done';
  waveIndex: number;
  /** Math.ceil(scopeRemaining / waveSize) estimate */
  waveTotal: number;
  label: string;
  enrichDone?: number;
  enrichTotal?: number;
};

export type RunScopedPipelineJobOptions = {
  signal?: AbortSignal;
  onProgress?: (p: ScopedPipelineJobProgress) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateWaveTotal(remainingScope: number, waveSize: number): number {
  return Math.max(1, Math.ceil(remainingScope / waveSize));
}

/**
 * Scan DB and add any scope ids with aiStatus === 'ok' that are not yet in
 * completedSet or readySet. Returns true when at least one id was added.
 * Re-queries on each call — do not rely solely on in-memory state (resume safety).
 */
async function pollEnrichReady(
  scopeIds: string[],
  completedSet: Set<string>,
  readySet: Set<string>
): Promise<boolean> {
  const enrichments = await getAllEnrichments();
  const byId = new Map(enrichments.map((e) => [e.itemId, e]));
  let added = false;
  for (const id of scopeIds) {
    if (completedSet.has(id) || readySet.has(id)) continue;
    if (byId.get(id)?.aiStatus === 'ok') {
      readySet.add(id);
      added = true;
    }
  }
  return added;
}

/**
 * Take up to `count` ids from `readySet` in the stable order of `scopeIds`.
 * Preserves original itemIds ordering for deterministic wave composition.
 */
function takeScopedWave(
  scopeIds: string[],
  readySet: Set<string>,
  count: number
): string[] {
  const wave: string[] = [];
  for (const id of scopeIds) {
    if (readySet.has(id)) {
      wave.push(id);
      if (wave.length >= count) break;
    }
  }
  return wave;
}

// ── Downstream wave ───────────────────────────────────────────────────────────

/**
 * Downstream pipeline for one wave: embed → classifyIncremental (no discover).
 * Mirror of itemPipeline per-wave steps; never calls runItemPipeline / discoverBatch.
 */
export async function runWaveDownstream(
  waveIds: string[],
  signal?: AbortSignal
): Promise<void> {
  if (waveIds.length === 0) return;
  await runEnrichmentBatchPostProcess(waveIds);
  if (signal?.aborted) return;
  await classifyIncremental({
    itemIds: waveIds,
    maxItems: waveIds.length,
    autoDiscover: false,
    signal,
  });
  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();
  notifyDataChanged('enrichment.update');
  notifyDataChanged('categorization.update');
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Wave orchestrator for one job's `itemIds` scope.
 *
 * Algorithm:
 * 1. Preflight + prepBatchPipelineItems.
 * 2. Start enrichBatch (deferPostProcess:true) on remaining un-enriched scope ids.
 * 3. Poll DB in a loop; when ≥ waveSize ids are aiStatus=ok, classify that slice.
 * 4. After enrich settles, tail-flush any remaining scope ids (failed/skipped go
 *    through downstream too; classify skips ineligible ones).
 * 5. Checkpoint job file after every wave (waveIndex, completedItemIds, status).
 * 6. Resume: caller passes job loaded from disk; completedItemIds are skipped.
 */
export async function runScopedPipelineJob(
  job: ImportPipelineJob,
  options: RunScopedPipelineJobOptions = {}
): Promise<ImportPipelineJob> {
  const { signal, onProgress } = options;

  const report = (
    phase: ScopedPipelineJobProgress['phase'],
    label: string,
    waveIdx: number,
    waveTot: number,
    extra?: Pick<ScopedPipelineJobProgress, 'enrichDone' | 'enrichTotal'>
  ) => onProgress?.({ phase, waveIndex: waveIdx, waveTotal: waveTot, label, ...extra });

  // ── Preflight ──
  const pre = await preflightImportPipelineStart();
  if (!pre.ok) {
    const errorJob: ImportPipelineJob = {
      ...job,
      status: 'paused',
      lastError: pre.reason ?? 'Preflight failed',
    };
    await writeImportPipelineJob(errorJob);
    return errorJob;
  }

  if (signal?.aborted) {
    const cancelled: ImportPipelineJob = { ...job, status: 'paused', lastError: 'Cancelled' };
    await writeImportPipelineJob(cancelled);
    return cancelled;
  }

  // ── Prep ──
  const waveSize = job.waveSize;
  report('prep', 'Preparing pipeline…', job.waveIndex, estimateWaveTotal(job.itemIds.length, waveSize));
  await prepBatchPipelineItems(job.itemIds, { queueClassify: true });

  // Mark running
  const currentJob: ImportPipelineJob = { ...job, status: 'running', lastError: null };
  await writeImportPipelineJob(currentJob);

  // ── Mutable state ──
  const completedSet = new Set<string>(currentJob.completedItemIds);
  // readySet = enriched but not yet classified; seed from prior run's pendingDownstream
  const readySet = new Set<string>(currentJob.pendingDownstream.filter((id) => !completedSet.has(id)));

  // Rehydrate: pick up any ids already enriched (aiStatus=ok) in this DB
  await pollEnrichReady(currentJob.itemIds, completedSet, readySet);

  // Ids that still need enrich (not completed, not already ready)
  const remainingEnrich = currentJob.itemIds.filter(
    (id) => !completedSet.has(id) && !readySet.has(id)
  );

  let waveIndex = currentJob.waveIndex;
  const enrichTotal = remainingEnrich.length;
  let enrichProcessed = 0;

  const scopeWaveTotal = () =>
    estimateWaveTotal(currentJob.itemIds.length - completedSet.size, waveSize);

  // Checkpoint — persist after every downstream wave
  const checkpoint = async () => {
    currentJob.waveIndex = waveIndex;
    currentJob.completedItemIds = [...completedSet];
    currentJob.pendingDownstream = currentJob.itemIds.filter(
      (id) => readySet.has(id) && !completedSet.has(id)
    );
    await writeImportPipelineJob(currentJob);
  };

  // Run one downstream wave and checkpoint
  const runWave = async (waveIds: string[]) => {
    report(
      'wave',
      `Wave ${waveIndex + 1}: embed + classify ${waveIds.length} item${waveIds.length === 1 ? '' : 's'}…`,
      waveIndex,
      scopeWaveTotal()
    );
    await runWaveDownstream(waveIds, signal);
    for (const id of waveIds) {
      completedSet.add(id);
      readySet.delete(id);
    }
    waveIndex++;
    await checkpoint();
  };

  // ── Overlap: start enrichBatch, poll + classify in parallel ──
  let enrichSettled = false;
  let enrichError: unknown = null;

  const enrichPromise = (async () => {
    if (remainingEnrich.length === 0) {
      enrichSettled = true;
      return;
    }
    try {
      await enrichBatch({
        mode: 'full',
        itemIds: remainingEnrich,
        deferPostProcess: true,
        force: false,
        signal,
        onProgress: (p) => {
          enrichProcessed = p.processed + p.skipped + p.failed;
          report(
            'enrich',
            `Enriching ${enrichProcessed}/${enrichTotal}…`,
            waveIndex,
            scopeWaveTotal(),
            { enrichDone: enrichProcessed, enrichTotal }
          );
        },
      });
    } catch (e) {
      enrichError = e;
    } finally {
      enrichSettled = true;
    }
  })();

  // Polling loop — interleaves with enrichBatch via event-loop yields
  const POLL_SLEEP_MS = 350;

  try {
    while (true) {
      if (signal?.aborted) {
        currentJob.status = 'paused';
        currentJob.lastError = 'Cancelled';
        await checkpoint();
        break;
      }

      if (!enrichSettled) {
        // Yield to event loop so enrichBatch workers can make progress
        await sleep(POLL_SLEEP_MS);
      }

      // Scan DB for newly ready ids
      await pollEnrichReady(currentJob.itemIds, completedSet, readySet);

      // Drain full waves (classify wave 1 while enrich still running on later ids)
      while (readySet.size >= waveSize) {
        if (signal?.aborted) break;
        const waveIds = takeScopedWave(currentJob.itemIds, readySet, waveSize);
        await runWave(waveIds);
      }

      if (signal?.aborted) break;

      if (enrichSettled) {
        // Tail flush: include ALL remaining scope ids (enrich-failed / skipped)
        // classify will skip ineligible ones; marking all completed prevents infinite retry
        for (const id of currentJob.itemIds) {
          if (!completedSet.has(id)) readySet.add(id);
        }
        // Flush in waveSize chunks for granular checkpointing
        while (readySet.size > 0) {
          if (signal?.aborted) break;
          const count = Math.min(waveSize, readySet.size);
          const waveIds = takeScopedWave(currentJob.itemIds, readySet, count);
          await runWave(waveIds);
        }
        break;
      }
    }
  } catch (e) {
    if (!enrichError) enrichError = e;
  }

  // Ensure enrichBatch Promise is settled before we read enrichError
  try {
    await enrichPromise;
  } catch {
    // already captured in enrichError above
  }

  // ── Final status ──
  const allCompleted = completedSet.size >= currentJob.itemIds.length;

  if (signal?.aborted || currentJob.lastError === 'Cancelled') {
    currentJob.status = 'paused';
    currentJob.lastError = 'Cancelled';
  } else if (enrichError) {
    const msg = enrichError instanceof Error ? enrichError.message : String(enrichError);
    currentJob.status = 'paused';
    currentJob.lastError = msg === 'Cancelled' ? 'Cancelled' : msg;
  } else if (allCompleted) {
    currentJob.status = 'completed';
    currentJob.lastError = null;
  } else {
    // Partial — some ids not completed (shouldn't normally happen but handle gracefully)
    currentJob.status = 'paused';
    currentJob.lastError = null;
  }

  currentJob.completedItemIds = [...completedSet];
  currentJob.waveIndex = waveIndex;
  currentJob.pendingDownstream = [];

  await writeImportPipelineJob(currentJob);
  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();

  report('done', 'Pipeline complete', waveIndex, scopeWaveTotal());
  return currentJob;
}

/** Alias until P2 rename to runScopedPipelineJob */
export const runImportPipelineJob = runScopedPipelineJob;
