import { isGeneralLeafId } from './taxonomyCatalog';
import type { ClassifyState } from './types';

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
}): boolean {
  if (!input.eligible) return false;
  if (input.forceReclassify) return true;

  const st = input.classifyState;
  if (st === 'ineligible' || st === 'manual_only') return false;
  if (st === 'skipped') return false;

  const primaryId = input.primaryCategoryId ?? null;
  if (primaryId && isGeneralLeafId(primaryId)) return true;
  if (st === 'classified_general' || st === 'pending_discover') return true;
  if (st === 'pending_classify' || st === 'pending_reclassify') return true;

  if (primaryId && !isGeneralLeafId(primaryId)) return false;
  if (st === 'classified') return false;

  return true;
}

/** Whether this item should enter the next classify batch. */
export function itemNeedsClassify(
  st: ClassifyState | undefined,
  primaryCategoryId: string | null | undefined,
  hashMatch: boolean,
  eligible: boolean,
  forceReclassify = false
): boolean {
  if (
    !isFairGameForCategorization({
      eligible,
      classifyState: st,
      primaryCategoryId,
      forceReclassify,
    })
  ) {
    return false;
  }
  if (forceReclassify) return true;
  if (st === 'skipped' && hashMatch) return false;
  const pid = primaryCategoryId ?? null;
  if (pid && !isGeneralLeafId(pid) && hashMatch) return false;
  return true;
}

export function hasSpecificPrimaryTopic(
  primaryCategoryId: string | null | undefined,
  classifyState?: ClassifyState
): boolean {
  if (primaryCategoryId && !isGeneralLeafId(primaryCategoryId)) return true;
  return classifyState === 'classified';
}
