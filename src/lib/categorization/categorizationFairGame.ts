import type { ClassifyState } from './types';
import { isLinkQualityLeafId } from './linkQuality';
import { isGeneralLeafId } from './taxonomyCatalog';
import { itemNeedsClassifyFromPolicy } from './classifyPolicy';

/**
 * Bookmark is in scope for classify / discover when it has enough semantic text
 * (not failed fetch / empty AI) and either has no specific topic yet or sits on
 * a parent *-general ("Other") fallback.
 */
export function isFairGameForCategorization(input: {
  eligible: boolean;
  classifyState?: ClassifyState;
  primaryCategoryId?: string | null;
  forceReclassify?: boolean;
  retryManualReview?: boolean;
}): boolean {
  if (!input.eligible) return false;
  const force = input.forceReclassify || input.retryManualReview;
  if (force) return true;

  const st = input.classifyState;
  if (
    st === 'ineligible' ||
    st === 'classified_removal' ||
    st === 'classified_attention' ||
    st === 'manual_only' ||
    st === 'manual_review'
  ) {
    return false;
  }
  if (st === 'skipped') return false;

  const primaryId = input.primaryCategoryId ?? null;
  if (primaryId && isGeneralLeafId(primaryId)) return true;
  if (st === 'classified_general' || st === 'pending_discover') return true;
  if (st === 'pending_classify' || st === 'pending_reclassify') return true;

  // Specific topic with a real primary link — done unless force reclassify.
  if (primaryId && !isGeneralLeafId(primaryId)) return false;

  // Orphan signal: classified but no primary link — allow reclassify.
  if (st === 'classified') return true;

  return true;
}

/** Whether item has a specific (non-general) primary category assignment. */
export function hasSpecificPrimaryTopic(
  primaryCategoryId: string | null | undefined,
  _classifyState?: ClassifyState
): boolean {
  return Boolean(
    primaryCategoryId &&
      !isGeneralLeafId(primaryCategoryId) &&
      !isLinkQualityLeafId(primaryCategoryId)
  );
}

/** Whether this item should enter the next classify batch. */
export function itemNeedsClassify(
  st: ClassifyState | undefined,
  primaryCategoryId: string | null | undefined,
  hashMatch: boolean,
  eligible: boolean,
  forceReclassify = false,
  retryManualReview = false
): boolean {
  if (
    !isFairGameForCategorization({
      eligible,
      classifyState: st,
      primaryCategoryId,
      forceReclassify,
      retryManualReview,
    })
  ) {
    return false;
  }
  return itemNeedsClassifyFromPolicy(st, primaryCategoryId, hashMatch, eligible, {
    forceReclassify,
    retryManualReview,
  });
}
