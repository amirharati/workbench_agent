import type { ClassifyState, AiCategory, DiscoverRunSummary } from './types';
import { isGeneralLeafId } from './taxonomyCatalog';
import type { DiscoverSampleItem } from './discoverTaxonomy';
import type { AISettings } from '../ai/types';
import { callDiscoveryBatch } from './discoverTaxonomy';
import { chunk } from './parseReview';
import { LLM_BATCH_RETRY_ROUNDS, LLM_SINGLE_FALLBACK_CAP } from './llmBatchRetry';

export const MIN_DISCOVER_POOL = 3;
export const DEFAULT_DISCOVER_BATCH_SIZE = 32;

/** Map batch size for app + Hub (v3 eval default; full pool = ceil(n / this)). */
export const APP_DISCOVER_MAP_BATCH_SIZE = DEFAULT_DISCOVER_BATCH_SIZE;

export type DiscoverStuckKind = 'pending_discover' | 'general' | 'unassigned' | 'manual_review';

export const DISCOVER_STUCK_STATES = new Set<ClassifyState>([
  'pending_discover',
  'classified_general',
  'manual_review',
]);

export function emptyDiscoverRunSummary(): DiscoverRunSummary {
  return {
    totalConsidered: 0,
    eligiblePool: 0,
    stuckPool: 0,
    skippedIneligible: 0,
    skippedNotStuck: 0,
    skippedManualReview: 0,
    skippedTooShort: 0,
    itemsSampled: 0,
    discoverBatches: 0,
    newParents: 0,
    newLeaves: 0,
    proposedParentsRaw: 0,
    proposedLeavesRaw: 0,
    duplicateLeavesSkipped: 0,
    llmErrors: 0,
    itemsMarkedForReclassify: 0,
    failureBuckets: {},
    stuckKindBreakdown: {
      pending_discover: 0,
      general: 0,
      unassigned: 0,
      manual_review: 0,
    },
  };
}

export function bumpDiscoverFailureBucket(
  buckets: Record<string, number>,
  key: string
): Record<string, number> {
  return { ...buckets, [key]: (buckets[key] ?? 0) + 1 };
}

export function discoverStuckKind(
  classifyState?: ClassifyState,
  primaryCategoryId?: string | null
): DiscoverStuckKind | undefined {
  if (classifyState === 'pending_discover') return 'pending_discover';
  if (
    classifyState === 'classified_general' ||
    (primaryCategoryId && isGeneralLeafId(primaryCategoryId))
  ) {
    return 'general';
  }
  if (
    !primaryCategoryId &&
    classifyState &&
    classifyState !== 'classified' &&
    classifyState !== 'skipped' &&
    classifyState !== 'ineligible' &&
    classifyState !== 'manual_review'
  ) {
    return 'unassigned';
  }
  if (classifyState === 'manual_review') return 'manual_review';
  return undefined;
}

export function discoverSamplePriority(stuckKind?: DiscoverStuckKind): number {
  if (stuckKind === 'pending_discover') return 0;
  if (stuckKind === 'general') return 1;
  if (stuckKind === 'unassigned') return 2;
  if (stuckKind === 'manual_review') return 3;
  return 4;
}

/** True when classify finished but the bookmark still has no primary category link. */
export function itemNeedsDiscoverGapFill(input: {
  eligible: boolean;
  classifyState?: ClassifyState;
  primaryCategoryId?: string | null;
}): boolean {
  if (!input.eligible) return false;
  if (input.classifyState === 'ineligible' || input.classifyState === 'skipped') return false;
  if (input.primaryCategoryId) return false;
  return (
    input.classifyState === 'pending_discover' ||
    input.classifyState === 'pending_classify' ||
    input.classifyState === 'pending_reclassify' ||
    input.classifyState === 'manual_review' ||
    input.classifyState === 'classified'
  );
}

export function isDiscoverFairGame(input: {
  eligible: boolean;
  classifyState?: ClassifyState;
  primaryCategoryId?: string | null;
  stuckOnly?: boolean;
}): boolean {
  if (!input.eligible) return false;
  if (input.classifyState === 'ineligible' || input.classifyState === 'skipped') return false;
  if (input.stuckOnly === false) return true;

  const kind = discoverStuckKind(input.classifyState, input.primaryCategoryId);
  if (!kind || kind === 'manual_review') return false;
  return (
    DISCOVER_STUCK_STATES.has(input.classifyState as ClassifyState) ||
    kind === 'general' ||
    kind === 'pending_discover' ||
    kind === 'unassigned'
  );
}

export function shouldMarkReclassifyAfterDiscover(
  classifyState?: ClassifyState,
  discoverState?: string
): boolean {
  return (
    classifyState === 'pending_discover' ||
    classifyState === 'classified_general' ||
    discoverState === 'pending'
  );
}

/** Call discover LLM; on batch failure re-chunk retries before single-item fallback. */
export async function callDiscoveryBatchWithRetry(
  settings: AISettings,
  parents: Array<{ id: string; name: string; description?: string }>,
  leavesSoFar: AiCategory[],
  batchItems: DiscoverSampleItem[],
  opts: {
    maxNewParents: number;
    maxNewLeaves: number;
    gapFillMode?: boolean;
    signal?: AbortSignal;
    onProgress?: (msg: string) => void;
    batchSize?: number;
  }
): Promise<{
  ok: boolean;
  data?: import('./discoverTaxonomy').DiscoveryBatchResponse;
  error?: string;
  singleErrors?: number;
}> {
  if (!batchItems.length) {
    return { ok: false, error: 'Empty discover batch' };
  }

  const merged: import('./discoverTaxonomy').DiscoveryBatchResponse = {
    newParents: [],
    newLeaves: [],
    itemResults: [],
  };
  const batchSize = Math.max(1, opts.batchSize ?? batchItems.length);
  let lastError: string | undefined;
  let singleErrors = 0;

  const absorb = (data?: import('./discoverTaxonomy').DiscoveryBatchResponse) => {
    if (!data) return;
    merged.newParents!.push(...(data.newParents ?? []));
    merged.newLeaves!.push(...(data.newLeaves ?? []));
    merged.itemResults!.push(...(data.itemResults ?? []));
  };

  const runBatch = async (items: DiscoverSampleItem[]): Promise<boolean> => {
    if (opts.signal?.aborted) throw new Error('Cancelled');
    const resp = await callDiscoveryBatch(settings, parents, leavesSoFar, items, opts);
    if (resp.ok && resp.data) {
      absorb(resp.data);
      return true;
    }
    lastError = resp.error ?? lastError;
    return false;
  };

  let pending = [...batchItems];
  if (await runBatch(pending)) {
    return { ok: true, data: merged };
  }
  if (pending.length <= 1) {
    return { ok: false, error: lastError, singleErrors: pending.length };
  }

  for (let round = 1; round <= LLM_BATCH_RETRY_ROUNDS && pending.length > 1; round++) {
    opts.onProgress?.(`Retry batch round ${round}/${LLM_BATCH_RETRY_ROUNDS} (${pending.length} items)…`);
    const chunks = chunk(pending, batchSize);
    const nextPending: DiscoverSampleItem[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkItems = chunks[i]!;
      opts.onProgress?.(
        chunks.length > 1
          ? `Retry batch ${round}.${i + 1} (${chunkItems.length} items)…`
          : `Retry batch ${round} (${chunkItems.length} items)…`
      );
      if (await runBatch(chunkItems)) continue;
      nextPending.push(...chunkItems);
    }
    pending = nextPending;
    if (!pending.length) {
      return { ok: true, data: merged };
    }
  }

  if (pending.length > 1) {
    opts.onProgress?.(`Final batch retry (${pending.length} items)…`);
    if (await runBatch(pending)) {
      return { ok: true, data: merged };
    }
  }

  if (pending.length > 0) {
    const singles = pending.slice(0, LLM_SINGLE_FALLBACK_CAP);
    opts.onProgress?.(`Single-item retry for ${singles.length} stubborn item(s)…`);
    for (let i = 0; i < singles.length; i++) {
      if (opts.signal?.aborted) throw new Error('Cancelled');
      opts.onProgress?.(`Single retry ${i + 1}/${singles.length}…`);
      if (!(await runBatch([singles[i]!]))) singleErrors++;
    }
  }

  const gotResults =
    (merged.newParents?.length ?? 0) > 0 ||
    (merged.newLeaves?.length ?? 0) > 0 ||
    (merged.itemResults?.length ?? 0) > 0;

  if (!gotResults && singleErrors >= batchItems.length) {
    return { ok: false, error: lastError, singleErrors };
  }
  if (!gotResults) {
    return { ok: false, error: lastError, singleErrors };
  }
  return { ok: true, data: merged, singleErrors: singleErrors || undefined };
}

/**
 * How many MAP batches to run for a pool.
 * Omit `maxBatches` (or pass ≤0 / non-finite) to cover **all** items: ceil(n / batchSize).
 * Pass `maxBatches` only when you want an explicit cap (eval cost, UI slider, single-batch test).
 */
export function planDiscoverMapBatches(
  itemCount: number,
  batchSize: number,
  maxBatches?: number
): { mapBatchCount: number; itemsSampled: number } {
  if (itemCount <= 0) return { mapBatchCount: 0, itemsSampled: 0 };
  const safeBatch = Math.max(1, batchSize);
  const needed = Math.ceil(itemCount / safeBatch);
  if (
    maxBatches === undefined ||
    maxBatches === null ||
    maxBatches <= 0 ||
    !Number.isFinite(maxBatches)
  ) {
    return { mapBatchCount: needed, itemsSampled: itemCount };
  }
  const mapBatchCount = Math.min(needed, Math.floor(maxBatches));
  const itemsSampled = Math.min(itemCount, mapBatchCount * safeBatch);
  return { mapBatchCount, itemsSampled };
}

/** Chunk pool into MAP batches; default runs until every item is covered. */
export function sliceDiscoverMapPool<T>(
  items: T[],
  batchSize: number,
  maxBatches?: number
): T[][] {
  const chunks = chunk(items, Math.max(1, batchSize));
  const { mapBatchCount } = planDiscoverMapBatches(items.length, batchSize, maxBatches);
  return chunks.slice(0, mapBatchCount);
}
