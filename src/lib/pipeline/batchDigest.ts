import type { DiscoverBatchResult, TopicClassifySummary } from '../categorization/types';
import type { EnrichmentResult } from '../enrichment';
import { formatItemPipelineProgress, type ItemPipelineProgress } from './itemPipeline';

export type BatchDigestPhase = ItemPipelineProgress['phase'];
export type BatchDigestProgress = ItemPipelineProgress;

export interface BatchDigestResult {
  enriched: number;
  skipped: number;
  failed: number;
  classified: number;
  classifySummary?: TopicClassifySummary;
  discoverResult?: DiscoverBatchResult;
  enrichCancelled?: boolean;
  classifyError?: string;
  embedError?: string;
  embedded?: number;
  embedFailed?: number;
  remaining?: number;
  message: string;
  itemEnrichResults?: EnrichmentResult[];
}

export function formatClassifyBatchMessage(
  selected: number,
  summary: TopicClassifySummary
): string {
  const categorized = summary.classifiedSpecific + summary.classifiedGeneral;
  const bits = [`${selected} selected`];
  if (summary.processed) bits.push(`${summary.processed} sent to AI`);
  if (categorized) bits.push(`${categorized} categorized`);
  if (summary.llmErrors) bits.push(`${summary.llmErrors} AI errors`);
  return bits.join(' · ');
}

export function formatBatchDigestProgress(update: BatchDigestProgress): string {
  return formatItemPipelineProgress(update);
}
