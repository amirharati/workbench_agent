import {
  isLinkQualityAttentionLeafId,
  isLinkQualityParentId,
  isLinkQualityRedirectMismatchLeafId,
  isLinkQualityRemovalLeafId,
  LINK_QUALITY_PARENT_ID,
} from './linkQuality';
import { isGeneralLeafId } from './taxonomyCatalog';
import type { ClassifyState } from './types';

export type ClassificationPresentationTier =
  | 'topic'
  | 'general'
  | 'quality_removal'
  | 'quality_attention';

export interface ClassificationPresentation {
  tier: ClassificationPresentationTier;
  /** Inspector / stage header — not a normal topic assignment. */
  headline: string;
  /** Categories queue topic column — replaces Assigned / Model selected. */
  sourceTag: string;
  color: string;
  /** Taxonomy tree parent badge (link-quality parent only). */
  taxonomyParentBadge?: string;
  /** Taxonomy leaf prefix glyph. */
  leafPrefix?: string;
}

const REMOVAL: ClassificationPresentation = {
  tier: 'quality_removal',
  headline: 'Quality tagged · removal',
  sourceTag: 'Quality tagged',
  color: 'var(--error, #f85149)',
  taxonomyParentBadge: 'Pipeline quality — not topic taxonomy',
  leafPrefix: '⚠ ',
};

const ATTENTION_LOGIN: ClassificationPresentation = {
  tier: 'quality_attention',
  headline: 'Needs attention · login/auth',
  sourceTag: 'Needs attention',
  color: 'var(--er-warn, #d29922)',
  taxonomyParentBadge: 'Pipeline quality — not topic taxonomy',
  leafPrefix: '◉ ',
};

const ATTENTION_REDIRECT: ClassificationPresentation = {
  tier: 'quality_attention',
  headline: 'Needs attention · URL redirect',
  sourceTag: 'Needs attention',
  color: 'var(--er-warn, #d29922)',
  taxonomyParentBadge: 'Pipeline quality — not topic taxonomy',
  leafPrefix: '◉ ',
};

const GENERAL: ClassificationPresentation = {
  tier: 'general',
  headline: 'General / Other — incomplete topic',
  sourceTag: 'General fallback',
  color: 'var(--er-warn, #d29922)',
  leafPrefix: '◦ ',
};

export function resolveClassificationPresentation(input: {
  primaryCategoryId?: string | null;
  classifyState?: ClassifyState;
}): ClassificationPresentation | null {
  const { primaryCategoryId = null, classifyState } = input;

  if (
    isLinkQualityRemovalLeafId(primaryCategoryId) ||
    classifyState === 'classified_removal'
  ) {
    return REMOVAL;
  }
  if (isLinkQualityRedirectMismatchLeafId(primaryCategoryId)) {
    return ATTENTION_REDIRECT;
  }
  if (
    isLinkQualityAttentionLeafId(primaryCategoryId) ||
    classifyState === 'classified_attention'
  ) {
    return ATTENTION_LOGIN;
  }
  if (
    classifyState === 'classified_general' ||
    (primaryCategoryId && isGeneralLeafId(primaryCategoryId))
  ) {
    return GENERAL;
  }
  return null;
}

export function isLinkQualityTaxonomyParent(parentId: string | null | undefined): boolean {
  return isLinkQualityParentId(parentId) || parentId === LINK_QUALITY_PARENT_ID;
}
