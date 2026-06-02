/** CLI mirror of src/lib/categorization/classifyPolicy.ts — keep in sync. */

export const MAX_CLASSIFY_RETRIES = 2;

export function isGeneralLeafId(id) {
  return typeof id === 'string' && /-general$/.test(id);
}

export function hasSpecificPrimaryTopic(primaryCategoryId, _classifyState) {
  return Boolean(primaryCategoryId && !isGeneralLeafId(primaryCategoryId));
}

export function shouldSkipClassify(input) {
  const {
    classifyState: st,
    primaryCategoryId,
    hashMatch,
    eligible,
    forceReclassify = false,
    retryManualReview = false,
  } = input;

  if (!eligible) return { skip: true, reason: 'not_fair_game' };
  if (forceReclassify) return { skip: false };
  if (st === 'manual_review' && !retryManualReview) return { skip: true, reason: 'manual_review' };
  if (st === 'skipped' && hashMatch) return { skip: true, reason: 'unchanged_hash_skipped' };

  const hasSpecific = hasSpecificPrimaryTopic(primaryCategoryId, st);
  if (hashMatch && hasSpecific && st === 'classified') {
    return { skip: true, reason: 'unchanged_hash_specific' };
  }
  if (
    hashMatch &&
    hasSpecific &&
    primaryCategoryId &&
    !isGeneralLeafId(primaryCategoryId) &&
    st !== 'pending_reclassify'
  ) {
    return { skip: true, reason: 'unchanged_hash_specific' };
  }
  if (!hashMatch && hasSpecific && st === 'classified') {
    return { skip: false, markPendingReclassify: true };
  }
  return { skip: false };
}

export function applyClassifyRetryPolicy(prevRetryCount, outcome) {
  if (outcome === 'specific') {
    return { nextState: 'classified', nextRetryCount: 0, routedToManualReview: false };
  }
  const nextRetryCount = prevRetryCount + 1;
  if (nextRetryCount >= MAX_CLASSIFY_RETRIES) {
    return { nextState: 'manual_review', nextRetryCount, routedToManualReview: true };
  }
  if (outcome === 'error') {
    return { nextState: 'pending_classify', nextRetryCount, routedToManualReview: false };
  }
  if (outcome === 'general') {
    return { nextState: 'classified_general', nextRetryCount, routedToManualReview: false };
  }
  return { nextState: 'pending_discover', nextRetryCount, routedToManualReview: false };
}

export function emptyTopicClassifySummary() {
  return {
    totalConsidered: 0,
    processed: 0,
    skippedIneligible: 0,
    skippedHash: 0,
    skippedLlm: 0,
    skippedManualReview: 0,
    assignedPrimary: 0,
    classifiedSpecific: 0,
    classifiedGeneral: 0,
    assignedSecondary: 0,
    multiLabel: 0,
    unassigned: 0,
    pendingDiscover: 0,
    llmErrors: 0,
    batches: 0,
    failureBuckets: {},
    inputQuality: { high: 0, medium: 0, low: 0 },
  };
}

export function bumpFailureBucket(buckets, key) {
  return { ...buckets, [key]: (buckets[key] ?? 0) + 1 };
}
