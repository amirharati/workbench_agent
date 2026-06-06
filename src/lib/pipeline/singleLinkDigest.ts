import { getEnrichment } from '../enrichment';
import type { EnrichmentResult } from '../enrichment';
import { PIPELINE_STAGE_LABELS } from './pipelineDictionary';
import {
  runPipelineScopeBatch,
  scopedProgressToItemProgress,
  shouldUseScopedPipelineForSingle,
} from './pipelineScopeRun';
import { runItemPipeline, type ItemPipelineProgress } from './itemPipeline';

export type SingleLinkDigestPhase = ItemPipelineProgress['phase'];

export interface SingleLinkDigestProgress extends ItemPipelineProgress {}

export interface SingleLinkDigestResult {
  itemId: string;
  enrich: EnrichmentResult;
  classifyAttempted: boolean;
  classifyProcessed: number;
  classifyError?: string;
  message: string;
}

const inFlight = new Set<string>();

export function isAnyDigestInFlight(): boolean {
  return inFlight.size > 0;
}

export function isDigestInFlight(itemId: string): boolean {
  return inFlight.has(itemId);
}

export function formatDigestProgressLabel(phase: SingleLinkDigestPhase): string {
  switch (phase) {
    case 'prep':
      return 'Preparing…';
    case 'enrich':
      return `${PIPELINE_STAGE_LABELS.fetch} & ${PIPELINE_STAGE_LABELS.enrich}…`;
    case 'embed':
      return `${PIPELINE_STAGE_LABELS.embed}…`;
    case 'classify':
      return `${PIPELINE_STAGE_LABELS.classify}…`;
    case 'discover':
      return `${PIPELINE_STAGE_LABELS.discover}…`;
    case 'save':
      return 'Saving…';
    case 'done':
      return 'Complete';
    default:
      return 'Processing…';
  }
}

/** Re-export for callers that build progress labels before running. */
export { resolveEnrichProgressLabel } from './singleLinkDigestLabels';

/**
 * Run full pipeline for one bookmark — delegates to runItemPipeline (same path as Hub/Import).
 */
export async function runSingleLinkDigest(
  itemId: string,
  options?: {
    forceEnrich?: boolean;
    skipClassify?: boolean;
    skipAi?: boolean;
    onProgress?: (update: ItemPipelineProgress) => void;
    signal?: AbortSignal;
    preferTabSession?: boolean;
    tabId?: number;
    tabSessionOnly?: boolean;
  }
): Promise<SingleLinkDigestResult> {
  if (inFlight.has(itemId)) {
    const enrich = await getEnrichment(itemId);
    return {
      itemId,
      enrich: {
        itemId,
        status: enrich?.status ?? 'none',
        skipped: true,
        message: 'digest_already_running',
      },
      classifyAttempted: false,
      classifyProcessed: 0,
      message: 'Digest already running for this item',
    };
  }

  inFlight.add(itemId);
  try {
    if (shouldUseScopedPipelineForSingle(options)) {
      const batch = await runPipelineScopeBatch([itemId], {
        forceEnrich: options?.forceEnrich === true,
        collectItemResults: true,
        writeJobFile: false,
        signal: options?.signal,
        onProgress: options?.onProgress
          ? (p) => options.onProgress!(scopedProgressToItemProgress(p, 1))
          : undefined,
      });
      const enrich =
        batch.itemEnrichResults?.[0] ??
        ({
          itemId,
          status: 'none' as const,
          skipped: true,
          message: 'no_enrich_result',
        } satisfies EnrichmentResult);
      return {
        itemId,
        enrich,
        classifyAttempted: batch.classifySummary !== undefined,
        classifyProcessed: batch.classifySummary?.processed ?? 0,
        classifyError: batch.classifyError,
        message: batch.message,
      };
    }

    const result = await runItemPipeline({
      itemIds: [itemId],
      enrich: true,
      classify: options?.skipClassify !== true,
      skipAi: options?.skipAi,
      forceEnrich: options?.forceEnrich === true,
      forceClassify: true,
      processAll: true,
      skipDiscover: true,
      collectItemResults: true,
      signal: options?.signal,
      enrichOneOptions: {
        preferTabSession: options?.preferTabSession,
        tabId: options?.tabId,
        tabSessionOnly: options?.tabSessionOnly,
      },
      onProgress: options?.onProgress,
    });

    const enrich =
      result.itemEnrichResults?.[0] ??
      ({
        itemId,
        status: 'none' as const,
        skipped: true,
        message: 'no_enrich_result',
      } satisfies EnrichmentResult);

    return {
      itemId,
      enrich,
      classifyAttempted: result.classifySummary !== undefined,
      classifyProcessed: result.classifySummary?.processed ?? 0,
      classifyError: result.classifyError,
      message: result.message,
    };
  } finally {
    inFlight.delete(itemId);
  }
}
