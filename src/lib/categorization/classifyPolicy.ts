import type { ClassifyState } from './types';
import { isGeneralLeafId } from './taxonomyCatalog';
import { hasSpecificPrimaryTopic } from './categorizationFairGame';

/** Automatic LLM retries for general/unassigned before manual-review bucket. */
export const MAX_CLASSIFY_RETRIES = 2;

export type ClassifySkipReason =
  | 'unchanged_hash_specific'
  | 'unchanged_hash_skipped'
  | 'manual_review'
  | 'not_fair_game';

export interface ClassifySkipDecision {
  skip: boolean;
  reason?: ClassifySkipReason;
  /** When hash changed but item was stable — queue for reclassify. */
  markPendingReclassify?: boolean;
}

export interface ClassifyRetryDecision {
  nextState: ClassifyState;
  nextRetryCount: number;
  routedToManualReview: boolean;
}

/** Whether classify LLM should run for this item. */
export function shouldSkipClassify(input: {
  classifyState?: ClassifyState;
  primaryCategoryId?: string | null;
  hashMatch: boolean;
  eligible: boolean;
  forceReclassify?: boolean;
  retryManualReview?: boolean;
}): ClassifySkipDecision {
  const {
    classifyState: st,
    primaryCategoryId,
    hashMatch,
    eligible,
    forceReclassify = false,
    retryManualReview = false,
  } = input;

  if (!eligible) {
    return { skip: true, reason: 'not_fair_game' };
  }

  if (forceReclassify) {
    return { skip: false };
  }

  if (st === 'manual_review' && !retryManualReview) {
    return { skip: true, reason: 'manual_review' };
  }

  if (st === 'skipped' && hashMatch) {
    return { skip: true, reason: 'unchanged_hash_skipped' };
  }

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

/** Whether item enters classify batch (fair game + not skipped). */
export function itemNeedsClassifyFromPolicy(
  st: ClassifyState | undefined,
  primaryCategoryId: string | null | undefined,
  hashMatch: boolean,
  eligible: boolean,
  opts: { forceReclassify?: boolean; retryManualReview?: boolean } = {}
): boolean {
  const decision = shouldSkipClassify({
    classifyState: st,
    primaryCategoryId,
    hashMatch,
    eligible,
    forceReclassify: opts.forceReclassify,
    retryManualReview: opts.retryManualReview,
  });
  if (decision.skip) return false;
  if (opts.forceReclassify) return true;
  if (st === 'manual_review' && opts.retryManualReview) return true;
  if (st === 'skipped' && hashMatch) return false;
  const pid = primaryCategoryId ?? null;
  if (pid && !isGeneralLeafId(pid) && hashMatch && !opts.forceReclassify) return false;
  return true;
}

/** After a general/unassigned outcome, bump retry count or route to manual review. */
export function applyClassifyRetryPolicy(
  prevRetryCount: number,
  outcome: 'specific' | 'general' | 'unassigned' | 'error'
): ClassifyRetryDecision {
  if (outcome === 'specific') {
    return { nextState: 'classified', nextRetryCount: 0, routedToManualReview: false };
  }

  const nextRetryCount = prevRetryCount + 1;
  if (nextRetryCount >= MAX_CLASSIFY_RETRIES) {
    return {
      nextState: 'manual_review',
      nextRetryCount,
      routedToManualReview: true,
    };
  }

  if (outcome === 'error') {
    return {
      nextState: 'pending_classify',
      nextRetryCount,
      routedToManualReview: false,
    };
  }

  if (outcome === 'general') {
    return {
      nextState: 'classified_general',
      nextRetryCount,
      routedToManualReview: false,
    };
  }

  return {
    nextState: 'pending_discover',
    nextRetryCount,
    routedToManualReview: false,
  };
}

export function classifyOutcomeFromDecision(input: {
  decisionType?: string;
  primaryCategoryId?: string | null;
  status?: string;
}): 'specific' | 'general' | 'unassigned' | 'error' {
  if (input.status === 'error') return 'error';
  const primaryId = input.primaryCategoryId;
  if (primaryId && !isGeneralLeafId(primaryId)) return 'specific';
  if (primaryId && isGeneralLeafId(primaryId)) return 'general';
  if (input.decisionType === 'existing' && primaryId) {
    return isGeneralLeafId(primaryId) ? 'general' : 'specific';
  }
  return 'unassigned';
}

export function emptyTopicClassifySummary(): import('./types').TopicClassifySummary {
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
    classifiedRemoval: 0,
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

export function bumpFailureBucket(
  buckets: Record<string, number>,
  key: string
): Record<string, number> {
  return { ...buckets, [key]: (buckets[key] ?? 0) + 1 };
}
