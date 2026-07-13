/**
 * Shared scoped-wave entry for Hub, Inspector, and single-link full digest.
 * Stage-only runs (classify-only, fetch-only) stay on runItemPipeline for now.
 */
import type { BatchDigestResult } from './batchDigest';
import type { ItemPipelineProgress } from './itemPipeline';
import {
  createImportPipelineJob,
  writeImportPipelineJob,
} from './importPipelineJob';
import {
  runScopedPipelineJob,
  type RunScopedPipelineJobOptions,
  type ScopedPipelineJobProgress,
} from './scopedPipelineJobRunner';

export type RunPipelineScopeBatchOptions = RunScopedPipelineJobOptions & {
  /** Persist job file for resume (default true for Hub batches). */
  writeJobFile?: boolean;
};

export function isFullPipelineBatch(options?: {
  enrich?: boolean;
  classify?: boolean;
}): boolean {
  return options?.enrich !== false && options?.classify !== false;
}

/** Full single-link digest stays on the light runItemPipeline path (not the wave runner). */
export function shouldUseScopedPipelineForSingle(_options?: {
  skipClassify?: boolean;
  skipAi?: boolean;
  preferTabSession?: boolean;
  tabId?: number;
  tabSessionOnly?: boolean;
}): boolean {
  // Wave runner + pollEnrichReady(getAll) OOMs Chrome on large libraries for 1-item digests.
  return false;
}

export function scopedProgressToItemProgress(
  p: ScopedPipelineJobProgress,
  scopeCount: number
): ItemPipelineProgress {
  if (p.phase === 'enrich' && p.enrichDone != null && p.enrichTotal != null) {
    return {
      phase: 'enrich',
      label: p.label,
      current: p.enrichDone,
      total: p.enrichTotal,
    };
  }
  if (p.phase === 'wave' || p.phase === 'embed') {
    return {
      phase: 'embed',
      label: p.label,
      current: Math.min(p.waveIndex + 1, p.waveTotal),
      total: Math.max(p.waveTotal, 1),
    };
  }
  if (p.phase === 'classify') {
    return {
      phase: 'classify',
      label: p.label,
      current: Math.min(p.waveIndex + 1, p.waveTotal),
      total: Math.max(p.waveTotal, 1),
    };
  }
  if (p.phase === 'prep') {
    return { phase: 'prep', label: p.label, current: 0, total: Math.max(scopeCount, 1) };
  }
  return {
    phase: 'done',
    label: p.label,
    current: scopeCount,
    total: Math.max(scopeCount, 1),
  };
}

function buildScopedBatchMessage(
  outcome: Awaited<ReturnType<typeof runScopedPipelineJob>>,
  itemCount: number
): string {
  const parts: string[] = [];
  const { enriched, skipped, failed, classifySummary: s } = outcome;
  if (enriched > 0) parts.push(`${enriched} enriched`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (s) {
    const categorized = s.classifiedSpecific + s.classifiedGeneral + s.classifiedRemoval;
    if (categorized > 0) parts.push(`${categorized} classified`);
    if (s.pendingDiscover > 0) parts.push(`${s.pendingDiscover} pending discover`);
  }
  if (outcome.job.status !== 'completed' && outcome.job.lastError === 'Cancelled') {
    return 'Cancelled';
  }
  if (parts.length === 0) {
    return itemCount === 1 ? '1 item processed' : `${itemCount} items processed`;
  }
  return parts.join(' · ');
}

export async function runPipelineScopeBatch(
  itemIds: string[],
  options: RunPipelineScopeBatchOptions = {}
): Promise<BatchDigestResult> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return {
      enriched: 0,
      skipped: 0,
      failed: 0,
      classified: 0,
      message: 'No items to process',
    };
  }

  const { writeJobFile = true, ...runnerOpts } = options;
  const job = createImportPipelineJob(uniqueIds);
  if (writeJobFile) {
    await writeImportPipelineJob(job);
  }

  const outcome = await runScopedPipelineJob(job, runnerOpts);
  const classified =
    (outcome.classifySummary?.classifiedSpecific ?? 0) +
    (outcome.classifySummary?.classifiedGeneral ?? 0) +
    (outcome.classifySummary?.classifiedRemoval ?? 0);

  const cancelled =
    outcome.job.lastError === 'Cancelled' || runnerOpts.signal?.aborted === true;

  return {
    enriched: outcome.enriched,
    skipped: outcome.skipped,
    failed: outcome.failed,
    classified,
    classifySummary: outcome.classifySummary,
    enrichCancelled: cancelled,
    classifyError: cancelled ? 'classification cancelled' : undefined,
    message: buildScopedBatchMessage(outcome, uniqueIds.length),
    itemEnrichResults: outcome.itemEnrichResults,
  };
}
