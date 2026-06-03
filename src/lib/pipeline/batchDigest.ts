import type { TopicClassifySummary } from '../categorization/types';
import type { EnrichmentResult } from '../enrichment';
import type { PipelineReportAction } from './pipelineBatchReport';
import {
  runItemPipeline,
  formatItemPipelineProgress,
  PIPELINE_DEFAULTS,
  type ItemPipelineProgress,
} from './itemPipeline';

export const BATCH_DIGEST_DEFAULTS = PIPELINE_DEFAULTS;

export type BatchDigestPhase = ItemPipelineProgress['phase'];
export type BatchDigestProgress = ItemPipelineProgress;

export interface BatchDigestResult {
  enriched: number;
  skipped: number;
  failed: number;
  classified: number;
  classifySummary?: TopicClassifySummary;
  enrichCancelled?: boolean;
  classifyError?: string;
  embedError?: string;
  embedded?: number;
  embedFailed?: number;
  remaining?: number;
  message: string;
  itemEnrichResults?: EnrichmentResult[];
  pipelineDebugSavedTo?: string;
}

export function formatClassifyBatchMessage(
  selected: number,
  summary: TopicClassifySummary
): string {
  const parts: string[] = [`${selected} selected`];
  const skipTotal =
    summary.skippedIneligible + summary.skippedHash + summary.skippedManualReview;

  if (skipTotal > 0) {
    const bits: string[] = [];
    if (summary.skippedIneligible > 0) bits.push(`${summary.skippedIneligible} ineligible`);
    if (summary.skippedHash > 0) bits.push(`${summary.skippedHash} unchanged`);
    if (summary.skippedManualReview > 0) bits.push(`${summary.skippedManualReview} in manual review`);
    parts.push(`${skipTotal} skipped (${bits.join(', ')})`);
  }

  if (summary.processed > 0) {
    parts.push(`${summary.processed} sent to AI`);
  }

  const categorized = summary.classifiedSpecific + summary.classifiedGeneral;
  if (categorized > 0) {
    const catBits: string[] = [];
    if (summary.classifiedSpecific > 0) catBits.push(`${summary.classifiedSpecific} specific`);
    if (summary.classifiedGeneral > 0) catBits.push(`${summary.classifiedGeneral} general/Other`);
    parts.push(`${categorized} got a category (${catBits.join(', ')})`);
  }

  if (summary.pendingDiscover > 0) {
    parts.push(`${summary.pendingDiscover} still unmatched after discover`);
  }

  if (summary.llmErrors > 0) {
    parts.push(`${summary.llmErrors} AI errors — check Inspector or retry`);
  }

  if (summary.processed === 0 && skipTotal === 0 && categorized === 0) {
    return `${selected} selected — nothing to run (queue may have updated)`;
  }

  return parts.join(' · ');
}

export function formatBatchDigestProgress(update: BatchDigestProgress): string {
  return formatItemPipelineProgress(update);
}

/** @deprecated Use runItemPipeline — kept as alias for existing callers. */
export async function runBatchDigest(
  itemIds: string[],
  options?: {
    enrich?: boolean;
    classify?: boolean;
    maxEnrich?: number;
    maxClassify?: number;
    processAll?: boolean;
    onProgress?: (update: BatchDigestProgress) => void;
    signal?: AbortSignal;
    collectItemResults?: boolean;
    refetchCompare?: boolean;
    forceEnrich?: boolean;
    skipAi?: boolean;
    forceReclassify?: boolean;
    pipelineRunAction?: PipelineReportAction;
    skipDiscover?: boolean;
    drainPendingClassifyQueue?: boolean;
  }
): Promise<BatchDigestResult> {
  const result = await runItemPipeline({
    itemIds,
    enrich: options?.enrich,
    classify: options?.classify,
    maxEnrich: options?.maxEnrich,
    maxClassify: options?.maxClassify,
    processAll: options?.processAll,
    onProgress: options?.onProgress,
    signal: options?.signal,
    collectItemResults: options?.collectItemResults,
    refetchCompare: options?.refetchCompare,
    forceEnrich: options?.forceEnrich,
    skipAi: options?.skipAi,
    forceClassify: options?.forceReclassify !== false,
    pipelineRunAction: options?.pipelineRunAction,
    skipDiscover: options?.skipDiscover,
    drainPendingClassifyQueue: options?.drainPendingClassifyQueue,
  });

  return {
    ...result,
    embedError: result.embedMessage?.includes('failed') ? result.embedMessage : undefined,
  };
}
