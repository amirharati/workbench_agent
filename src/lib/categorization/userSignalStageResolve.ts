import { isDiscoverFairGame } from './discoverPolicy';

/** Pure helper — export for unit tests without DB */
export function resolveStagedClassifyStateAfterReject(input: {
  eligible: boolean;
  primaryCategoryId?: string | null;
}): 'pending_discover' | 'pending_classify' | 'ineligible' {
  if (!input.eligible) return 'ineligible';
  const primaryCategoryId = input.primaryCategoryId ?? null;
  if (
    isDiscoverFairGame({
      eligible: true,
      classifyState: 'pending_discover',
      primaryCategoryId,
      stuckOnly: true,
    }) &&
    !primaryCategoryId
  ) {
    return 'pending_discover';
  }
  return 'pending_classify';
}
