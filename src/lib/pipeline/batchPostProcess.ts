import { markItemsPendingClassify } from '../categorization/classifyTopicExtract';
import { commitPendingDbWrites, refreshPipelineCacheFromWorker } from '../db';
import { embedIncrementalBatch, type EmbedBatchSummary, type EmbedBackfillProgress } from '../enrichment/embedItemSignal';
import { getEnrichment } from '../enrichment/storage';

export interface EnrichmentBatchPostProcessResult {
  embed: EmbedBatchSummary;
  markedClassify: number;
  orphansReset: number;
}

/** Before a pipeline batch: flush pending writes only (no full-library scans). */
export async function prepBatchPipelineItems(
  itemIds: string[],
  opts?: { queueClassify?: boolean }
): Promise<void> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await commitPendingDbWrites();
  void opts?.queueClassify;
}

/** Flush enrich writes, queue classify, embed in API batches — scoped to itemIds. */
export async function runEnrichmentBatchPostProcess(
  itemIds: string[],
  opts?: {
    onEmbedProgress?: (p: EmbedBackfillProgress) => void;
    /** Re-embed even when hash matches (full digest / re-digest). */
    forceEmbed?: boolean;
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
  const orphansReset = 0;

  const idSet = new Set(uniqueIds);
  const enrichById = new Map<string, NonNullable<Awaited<ReturnType<typeof getEnrichment>>>>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      const row = await getEnrichment(id);
      if (row) enrichById.set(id, row);
    })
  );
  const aiOkIds = [...enrichById.values()]
    .filter((e) => idSet.has(e.itemId) && e.aiStatus === 'ok')
    .map((e) => e.itemId);

  if (aiOkIds.length) {
    await markItemsPendingClassify(aiOkIds);
  }

  const embed = await embedIncrementalBatch({
    itemIds: aiOkIds,
    max: aiOkIds.length,
    force: opts?.forceEmbed,
    onProgress: opts?.onEmbedProgress,
  });

  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();

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
