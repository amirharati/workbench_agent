import type { ClassifyState, AiCategory, DiscoverRunSummary } from './types';
import { isGeneralLeafId } from './taxonomyCatalog';
import type { DiscoverSampleItem } from './discoverTaxonomy';
import type { AISettings } from '../ai/types';
import { callDiscoveryBatch } from './discoverTaxonomy';

export const MIN_DISCOVER_POOL = 3;
export const DEFAULT_DISCOVER_BATCH_SIZE = 32;

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

/** Call discover LLM; on batch parse failure retry each item individually. */
export async function callDiscoveryBatchWithRetry(
  settings: AISettings,
  parents: Array<{ id: string; name: string; description?: string }>,
  leavesSoFar: AiCategory[],
  batchItems: DiscoverSampleItem[],
  opts: { maxNewParents: number; maxNewLeaves: number; gapFillMode?: boolean }
): Promise<{
  ok: boolean;
  data?: import('./discoverTaxonomy').DiscoveryBatchResponse;
  error?: string;
  singleErrors?: number;
}> {
  const resp = await callDiscoveryBatch(settings, parents, leavesSoFar, batchItems, opts);
  if (resp.ok || batchItems.length <= 1) {
    return resp.ok ? resp : { ok: false, error: resp.error, singleErrors: batchItems.length };
  }

  const merged: import('./discoverTaxonomy').DiscoveryBatchResponse = {
    newParents: [],
    newLeaves: [],
    itemResults: [],
  };
  let singleErrors = 0;
  for (const single of batchItems) {
    const one = await callDiscoveryBatch(settings, parents, leavesSoFar, [single], opts);
    if (!one.ok || !one.data) {
      singleErrors++;
      continue;
    }
    merged.newParents!.push(...(one.data.newParents ?? []));
    merged.newLeaves!.push(...(one.data.newLeaves ?? []));
    merged.itemResults!.push(...(one.data.itemResults ?? []));
  }
  if (!merged.itemResults!.length && singleErrors === batchItems.length) {
    return { ok: false, error: resp.error, singleErrors };
  }
  return { ok: true, data: merged, singleErrors };
}
