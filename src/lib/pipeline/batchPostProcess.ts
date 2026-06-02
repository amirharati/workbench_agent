import {
  markItemsPendingClassify,
  reconcileOrphanClassifiedSignals,
  reconcileStaleIneligibleSignals,
} from '../categorization/classifyTopicExtract';
import { commitPendingDbWrites, refreshPipelineCacheFromWorker } from '../db';
import { embedIncrementalBatch, type EmbedBatchSummary, type EmbedBackfillProgress } from '../enrichment/embedItemSignal';
import { getAllEnrichments } from '../enrichment/storage';

export interface EnrichmentBatchPostProcessResult {
  embed: EmbedBatchSummary;
  markedClassify: number;
  orphansReset: number;
}

/** Before a full import batch: flush pending writes and re-queue stale/orphan classify state. */
export async function prepBatchPipelineItems(
  itemIds: string[],
  opts?: { queueClassify?: boolean }
): Promise<void> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await commitPendingDbWrites();
  await reconcileOrphanClassifiedSignals();
  if (opts?.queueClassify !== false) {
    await markItemsPendingClassify(uniqueIds);
    await commitPendingDbWrites();
  }
}

/** Flush enrich writes, reset orphan classify states, queue classify, embed in API batches. */
export async function runEnrichmentBatchPostProcess(
  itemIds: string[],
  opts?: {
    onEmbedProgress?: (p: EmbedBackfillProgress) => void;
  }
): Promise<EnrichmentBatchPostProcessResult> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return {
      embed: {
        considered: 0,
        embedded: 0,
        skippedHash: 0,
        skippedIneligible: 0,
        skippedNoKey: 0,
        embedFailed: 0,
        pendingAfter: 0,
      },
      markedClassify: 0,
      orphansReset: 0,
    };
  }

  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();
  // Orphan reconcile is handled in prepBatchPipelineItems before the pipeline run.
  const orphansReset = 0;

  const idSet = new Set(uniqueIds);
  const enrichments = await getAllEnrichments();
  const aiOkIds = enrichments
    .filter((e) => idSet.has(e.itemId) && e.aiStatus === 'ok')
    .map((e) => e.itemId);

  if (aiOkIds.length) {
    await markItemsPendingClassify(aiOkIds);
  }

  const embed = await embedIncrementalBatch({
    itemIds: aiOkIds,
    max: aiOkIds.length,
    onProgress: opts?.onEmbedProgress,
  });

  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();
  await reconcileStaleIneligibleSignals();
  await commitPendingDbWrites();

  return {
    embed,
    markedClassify: aiOkIds.length,
    orphansReset,
  };
}

export function formatEmbedBatchMessage(summary: EmbedBatchSummary): string | undefined {
  const parts: string[] = [];
  if (summary.embedded > 0) parts.push(`${summary.embedded} embedded`);
  if (summary.embedFailed > 0) parts.push(`${summary.embedFailed} embed failed`);
  if (summary.skippedNoKey > 0) parts.push('embed skipped (no AI key)');
  if (summary.skippedIneligible > 0 && summary.embedded === 0 && summary.embedFailed === 0) {
    parts.push(`${summary.skippedIneligible} not embeddable yet`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}
