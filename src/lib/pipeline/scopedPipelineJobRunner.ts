/**
 * Wave orchestrator for scoped pipeline jobs (≥96 items, A5b-2).
 *
 * Overlap model: enrichBatch runs concurrently with downstream classify waves.
 * Each wave = embed + classifyIncremental (autoDiscover: false). No discoverBatch.
 */
import { classifyIncremental } from '../categorization';
import { mergeTopicClassifySummaries } from '../categorization/classifyPolicy';
import type { TopicClassifySummary } from '../categorization/types';
import type { EnrichmentResult } from '../enrichment';
import { notifyDataChanged } from '../dataChangeNotifier';
import { commitPendingDbWrites, refreshPipelineCacheFromWorker } from '../db';
import { enrichBatch } from '../enrichment';
import {
  prepBatchPipelineItems,
  runEnrichmentBatchPostProcess,
} from './batchPostProcess';
import { fetchAttemptedForLinkQuality } from '../categorization/linkQuality';
import { isDownstreamClassifyEligible } from './downstreamEligible';
import {
  type ImportPipelineJob,
  type ImportPipelineWaveCheckpoint,
  clearImportPipelineJob,
  preflightImportPipelineStart,
  writeImportPipelineJob,
  writeScopedPipelineRunSummary,
} from './importPipelineJob';
import { isPipelineHardCancel } from './pipelineRunLock';

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
  forceEnrich?: boolean;
  forceReclassify?: boolean;
  skipAi?: boolean;
  refetchCompare?: boolean;
  collectItemResults?: boolean;
};

export type ScopedPipelineJobOutcome = {
  job: ImportPipelineJob;
  classifySummary?: TopicClassifySummary;
  itemEnrichResults?: EnrichmentResult[];
  enriched: number;
  skipped: number;
  failed: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateWaveTotal(remainingScope: number, waveSize: number): number {
  return Math.max(1, Math.ceil(remainingScope / waveSize));
}

/**
 * Scan DB and add scope ids eligible for downstream classify that are not yet in
 * completedSet or readySet. Returns true when at least one id was added.
 * Re-queries on each call — do not rely solely on in-memory state (resume safety).
 */
async function pollEnrichReady(
  scopeIds: string[],
  completedSet: Set<string>,
  readySet: Set<string>
): Promise<boolean> {
  const { getEnrichment } = await import('../enrichment');
  let added = false;
  for (const id of scopeIds) {
    if (completedSet.has(id) || readySet.has(id)) continue;
    const enrichment = await getEnrichment(id);
    if (isDownstreamClassifyEligible(enrichment)) {
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
  opts?: {
    signal?: AbortSignal;
    forceReclassify?: boolean;
    forceEmbed?: boolean;
  }
): Promise<TopicClassifySummary | undefined> {
  const signal = opts?.signal;
  if (waveIds.length === 0) return undefined;
  if (signal?.aborted) return undefined;
  await runEnrichmentBatchPostProcess(waveIds, { forceEmbed: opts?.forceEmbed });
  if (signal?.aborted) return undefined;
  const classifyResult = await classifyIncremental({
    itemIds: waveIds,
    maxItems: waveIds.length,
    autoDiscover: false,
    forceReclassify: opts?.forceReclassify,
    signal,
  });
  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();
  notifyDataChanged('enrichment.update');
  notifyDataChanged('categorization.update');
  return classifyResult.summary;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Wave orchestrator for one job's `itemIds` scope.
 *
 * Algorithm:
 * 1. Preflight + prepBatchPipelineItems.
 * 2. Start enrichBatch (deferPostProcess:true) on remaining un-enriched scope ids.
 * 3. Poll DB in a loop; when ≥ waveSize ids are downstream-eligible, classify that slice.
 * 4. After enrich settles, tail-flush eligible ids through embed+classify; ineligible
 *    ids are marked completed without downstream (same gating as runItemPipeline).
 * 5. Checkpoint job file after every wave (waveIndex, completedItemIds, status).
 * 6. Resume: caller passes job loaded from disk; completedItemIds are skipped.
 */
export async function runScopedPipelineJob(
  job: ImportPipelineJob,
  options: RunScopedPipelineJobOptions = {}
): Promise<ScopedPipelineJobOutcome> {
  try {
    const { pauseAutoMirrorForDigest } = await import('../storage/dbClient');
    await pauseAutoMirrorForDigest();
  } catch {
    /* ignore */
  }
  try {
    return await runScopedPipelineJobBody(job, options);
  } finally {
    try {
      const { resumeAutoMirrorAfterDigest } = await import('../storage/dbClient');
      await resumeAutoMirrorAfterDigest();
    } catch {
      /* ignore */
    }
  }
}

async function runScopedPipelineJobBody(
  job: ImportPipelineJob,
  options: RunScopedPipelineJobOptions = {}
): Promise<ScopedPipelineJobOutcome> {
  const { signal, onProgress } = options;
  let classifySummary: TopicClassifySummary | undefined;
  let itemEnrichResults: EnrichmentResult[] | undefined;
  let enriched = 0;
  let skipped = 0;
  let failed = 0;

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
    return { job: errorJob, enriched: 0, skipped: 0, failed: 0 };
  }

  if (signal?.aborted) {
    const cancelled: ImportPipelineJob = {
      ...job,
      status: 'paused',
      lastError: isPipelineHardCancel(signal) ? 'Cancelled' : 'Paused for single digest',
    };
    try {
      await writeImportPipelineJob(cancelled);
    } catch {
      /* ignore */
    }
    return { job: cancelled, enriched: 0, skipped: 0, failed: 0 };
  }

  // ── Prep ──
  const waveSize = job.waveSize;
  report('prep', 'Preparing pipeline…', job.waveIndex, estimateWaveTotal(job.itemIds.length, waveSize));
  await prepBatchPipelineItems(job.itemIds, { queueClassify: true });

  // Mark running — runner fingerprint + wall-clock start (preserved on resume)
  const runStartedAt = job.startedAt ?? Date.now();
  const currentJob: ImportPipelineJob = {
    ...job,
    status: 'running',
    lastError: null,
    runner: 'scoped_wave',
    startedAt: runStartedAt,
    finishedAt: null,
    durationMs: null,
    waveCheckpoints: job.waveCheckpoints ?? [],
  };
  console.info('[scoped-pipeline-job] start', {
    scope: currentJob.itemIds.length,
    waveSize: currentJob.waveSize,
    resumed: currentJob.completedItemIds.length,
    waveIndex: currentJob.waveIndex,
    startedAt: new Date(runStartedAt).toISOString(),
  });
  await writeImportPipelineJob(currentJob);

  // ── Mutable state ──
  const completedSet = new Set<string>(currentJob.completedItemIds);
  // readySet = enriched but not yet classified; seed from prior run's pendingDownstream
  const readySet = new Set<string>(currentJob.pendingDownstream.filter((id) => !completedSet.has(id)));

  // Rehydrate: pick up any ids already enriched (aiStatus=ok) in this DB
  await pollEnrichReady(currentJob.itemIds, completedSet, readySet);

  // Full re-digest must re-fetch — do not treat prior enrich as "ready to classify only".
  if (options.forceEnrich === true) {
    for (const id of currentJob.itemIds) {
      readySet.delete(id);
      completedSet.delete(id);
    }
  }

  // Ids that still need enrich (not completed, not already ready)
  const remainingEnrich = currentJob.itemIds.filter(
    (id) => !completedSet.has(id) && !readySet.has(id)
  );

  let waveIndex = currentJob.waveIndex;
  const enrichTotal = remainingEnrich.length;
  let enrichProcessed = 0;

  const scopeWaveTotal = () =>
    estimateWaveTotal(currentJob.itemIds.length - completedSet.size, waveSize);

  const waveCheckpoints: ImportPipelineWaveCheckpoint[] = [...(currentJob.waveCheckpoints ?? [])];

  // Checkpoint — persist after every downstream wave
  const checkpoint = async (waveJustFinished?: number) => {
    currentJob.waveIndex = waveIndex;
    currentJob.completedItemIds = [...completedSet];
    currentJob.pendingDownstream = currentJob.itemIds.filter(
      (id) => readySet.has(id) && !completedSet.has(id)
    );
    if (waveJustFinished != null) {
      const entry: ImportPipelineWaveCheckpoint = {
        waveIndex: waveJustFinished,
        completedCount: completedSet.size,
        at: Date.now(),
      };
      waveCheckpoints.push(entry);
      currentJob.waveCheckpoints = waveCheckpoints;
      const elapsed = entry.at - runStartedAt;
      console.info('[scoped-pipeline-job] wave checkpoint', {
        waveIndex: entry.waveIndex,
        completedCount: entry.completedCount,
        elapsedMs: elapsed,
        elapsedMin: (elapsed / 60_000).toFixed(1),
      });
    }
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
    const waveSummary = await runWaveDownstream(waveIds, {
      signal,
      forceReclassify: options.forceReclassify,
      forceEmbed: options.forceReclassify || options.forceEnrich,
    });
    if (waveSummary) {
      classifySummary = classifySummary
        ? mergeTopicClassifySummaries(classifySummary, waveSummary)
        : waveSummary;
    }
    for (const id of waveIds) {
      completedSet.add(id);
      readySet.delete(id);
    }
    const finishedWave = waveIndex + 1;
    waveIndex++;
    await checkpoint(finishedWave);
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
      const enrichResult = await enrichBatch({
        mode: 'full',
        itemIds: remainingEnrich,
        deferPostProcess: true,
        force: options.forceEnrich === true,
        skipAi: options.skipAi,
        refetchCompare: options.refetchCompare,
        collectItemResults: options.collectItemResults,
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
      enriched = enrichResult.processed;
      skipped = enrichResult.skipped;
      failed = enrichResult.failed;
      if (options.collectItemResults) {
        itemEnrichResults = enrichResult.itemResults;
      }
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
        currentJob.lastError = isPipelineHardCancel(signal)
          ? 'Cancelled'
          : 'Paused for single digest';
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
        await commitPendingDbWrites();
        await refreshPipelineCacheFromWorker();
        await pollEnrichReady(currentJob.itemIds, completedSet, readySet);

        while (readySet.size >= waveSize) {
          if (signal?.aborted) break;
          const waveIds = takeScopedWave(currentJob.itemIds, readySet, waveSize);
          await runWave(waveIds);
        }

        const { getEnrichment } = await import('../enrichment');
        for (const id of currentJob.itemIds) {
          if (completedSet.has(id) || readySet.has(id)) continue;
          const enrichment = await getEnrichment(id);
          if (!fetchAttemptedForLinkQuality(enrichment)) {
            // Never enriched — leave incomplete for resume.
            continue;
          }
          if (!isDownstreamClassifyEligible(enrichment)) {
            completedSet.add(id);
          } else {
            readySet.add(id);
          }
        }
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

  // Prefer "completed" over abort: a late cancel after the last item must not
  // leave a finished job stuck as paused/running (banner would keep showing).
  if (allCompleted) {
    currentJob.status = 'completed';
    currentJob.lastError = null;
  } else if (signal?.aborted || currentJob.lastError === 'Cancelled') {
    currentJob.status = 'paused';
    currentJob.lastError =
      isPipelineHardCancel(signal) || currentJob.lastError === 'Cancelled'
        ? 'Cancelled'
        : 'Paused for single digest';
  } else if (enrichError) {
    const msg = enrichError instanceof Error ? enrichError.message : String(enrichError);
    currentJob.status = 'paused';
    currentJob.lastError = msg === 'Cancelled' ? 'Cancelled' : msg;
  } else {
    // Partial — some ids not completed (shouldn't normally happen but handle gracefully)
    currentJob.status = 'paused';
    currentJob.lastError = null;
  }

  currentJob.completedItemIds = [...completedSet];
  currentJob.waveIndex = waveIndex;
  currentJob.pendingDownstream = [];
  currentJob.waveCheckpoints = waveCheckpoints;

  const finishedAt = Date.now();
  currentJob.finishedAt = finishedAt;
  if (runStartedAt) {
    currentJob.durationMs = finishedAt - runStartedAt;
  }

  // Complete → remove job file. Soft-yield keeps a paused job for resume.
  // Hard Cancel leaves a cancel signal — clear instead of rewriting the job.
  if (currentJob.status === 'completed') {
    try {
      await clearImportPipelineJob();
    } catch {
      /* best-effort */
    }
  } else if (signal?.aborted) {
    const { hasActivePipelineCancelSignal } = await import('./pipelineRunLock');
    if (isPipelineHardCancel(signal) || (await hasActivePipelineCancelSignal())) {
      try {
        await clearImportPipelineJob();
      } catch {
        /* best-effort */
      }
    } else {
      currentJob.status = 'paused';
      currentJob.lastError = 'Paused for single digest';
      await writeImportPipelineJob(currentJob);
    }
  } else {
    await writeImportPipelineJob(currentJob);
  }

  if (currentJob.runner === 'scoped_wave' && currentJob.startedAt != null && currentJob.durationMs != null) {
    const summary = {
      runner: 'scoped_wave' as const,
      importRunId: currentJob.importRunId,
      scopeCount: currentJob.itemIds.length,
      waveSize: currentJob.waveSize,
      waveCount: waveIndex,
      status: currentJob.status,
      startedAt: currentJob.startedAt,
      finishedAt,
      durationMs: currentJob.durationMs,
      completedCount: currentJob.completedItemIds.length,
      waveCheckpoints: waveCheckpoints,
      lastError: currentJob.lastError,
    };
    await writeScopedPipelineRunSummary(summary);
    console.info('[scoped-pipeline-job] done', {
      status: currentJob.status,
      completed: currentJob.completedItemIds.length,
      scope: currentJob.itemIds.length,
      waves: waveIndex,
      durationMs: currentJob.durationMs,
      durationMin: (currentJob.durationMs / 60_000).toFixed(1),
      startedAt: new Date(currentJob.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
    });
  }

  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();

  report('done', 'Pipeline complete', waveIndex, scopeWaveTotal());
  return {
    job: currentJob,
    classifySummary,
    itemEnrichResults,
    enriched,
    skipped,
    failed,
  };
}

/** Alias until P2 rename to runScopedPipelineJob */
export const runImportPipelineJob = runScopedPipelineJob;

/** Human-readable progress line for Import Studio / dashboard toasts. */
export function formatScopedPipelineJobProgress(p: ScopedPipelineJobProgress): string {
  const wave = `Wave ${Math.min(p.waveIndex + 1, p.waveTotal)}/${p.waveTotal}`;
  if (p.phase === 'enrich' && p.enrichTotal != null && p.enrichDone != null) {
    return `${wave} · Enriching ${p.enrichDone}/${p.enrichTotal}…`;
  }
  if (p.phase === 'wave' || p.phase === 'embed' || p.phase === 'classify') {
    return `${wave} · ${p.label}`;
  }
  return p.label;
}
