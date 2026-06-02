import { getEnrichment } from '../enrichment';
import { runItemPipeline, type ItemPipelineProgress } from './itemPipeline';
import type { EnrichmentResult } from '../enrichment';

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
      return 'Fetching page…';
    case 'embed':
      return 'Building search embeddings…';
    case 'classify':
      return 'Classifying…';
    case 'discover':
      return 'Discovering topics…';
    case 'save':
      return 'Saving…';
    case 'done':
      return 'Digest complete';
    default:
      return 'Digesting…';
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
    const result = await runItemPipeline({
      itemIds: [itemId],
      enrich: true,
      classify: options?.skipClassify !== true,
      skipAi: options?.skipAi,
      forceEnrich: options?.forceEnrich === true,
      forceClassify: true,
      processAll: true,
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
