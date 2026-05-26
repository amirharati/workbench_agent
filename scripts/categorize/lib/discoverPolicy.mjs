/** CLI discover hardening — keep aligned with app discoverBatch sampling (Task 03.1). */

import { isGeneralLeafId } from './classifyPolicy.mjs';

export const MIN_DISCOVER_POOL = 3;
export const DEFAULT_DISCOVER_BATCH_SIZE = 32;

/** Classify states that qualify for gap-fill discover (when stuck-only). */
export const DISCOVER_STUCK_STATES = new Set([
  'pending_discover',
  'classified_general',
  'manual_review',
]);

export function discoverStuckKind(classifyState, primaryCategoryId) {
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

export function discoverSamplePriority(stuckKind) {
  if (stuckKind === 'pending_discover') return 0;
  if (stuckKind === 'general') return 1;
  if (stuckKind === 'unassigned') return 2;
  if (stuckKind === 'manual_review') return 3;
  return 4;
}

export function isDiscoverFairGame({ eligible, classifyState, primaryCategoryId, stuckOnly = true }) {
  if (!eligible) return false;
  if (classifyState === 'ineligible' || classifyState === 'skipped') return false;
  if (!stuckOnly) return true;
  const kind = discoverStuckKind(classifyState, primaryCategoryId);
  if (!kind) return false;
  if (kind === 'manual_review') return false; // CLI retry via classify --retry-stuck first
  return (
    DISCOVER_STUCK_STATES.has(classifyState) ||
    kind === 'general' ||
    kind === 'pending_discover' ||
    kind === 'unassigned'
  );
}

export function emptyDiscoverRunSummary() {
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

export function bumpFailureBucket(buckets, key) {
  return { ...buckets, [key]: (buckets[key] ?? 0) + 1 };
}

/**
 * Build discover sample pool from corpus + classify-state.
 * @returns {{ pool: object[], summaryPatch: object }}
 */
export function buildDiscoverPool(items, classifyStateByItem, opts = {}) {
  const stuckOnly = opts.stuckOnly !== false;
  const summary = emptyDiscoverRunSummary();
  const pool = [];

  for (const item of items) {
    summary.totalConsidered++;
    if (item.categorizationEligible === false) {
      summary.skippedIneligible++;
      summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'ineligible');
      continue;
    }
    summary.eligiblePool++;

    const st = classifyStateByItem.get(item.itemId);
    const classifyState = st?.classifyState;
    const primaryCategoryId = st?.primaryCategoryId ?? null;

    const stuckKind = discoverStuckKind(classifyState, primaryCategoryId);
    if (stuckKind && summary.stuckKindBreakdown[stuckKind] != null) {
      summary.stuckKindBreakdown[stuckKind]++;
    }

    if (classifyState === 'manual_review') {
      summary.skippedManualReview++;
    }

    if (
      !isDiscoverFairGame({
        eligible: true,
        classifyState,
        primaryCategoryId,
        stuckOnly,
      })
    ) {
      if (stuckOnly && classifyState === 'classified') {
        summary.skippedNotStuck++;
      }
      continue;
    }

    const summaryText = (item.aiSummary ?? '').trim();
    const text = (item.classifyText ?? item.text ?? summaryText).trim();
    if (text.length < 40 && summaryText.length < 40) {
      summary.skippedTooShort++;
      continue;
    }

    pool.push({
      itemId: item.itemId,
      title: item.title || '',
      aiSummary: summaryText || text.slice(0, 2000),
      stuckKind,
      classifyState,
      primaryCategoryId,
    });
    summary.stuckPool++;
  }

  pool.sort((a, b) => discoverSamplePriority(a.stuckKind) - discoverSamplePriority(b.stuckKind));

  return { pool, summary };
}
