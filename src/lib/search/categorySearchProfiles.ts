import { cosineSimilarity, l2Normalize } from '../categorization/math';
import { isLinkQualityLeafId, isLinkQualityParentId } from '../categorization/linkQuality';
import type { AiCategory } from '../categorization/types';

export const CATEGORY_MEMBER_SAMPLE_LIMIT = 256;

export interface CategorySearchMemberStats {
  memberCount: number;
  linkUpdatedAt: number;
  signalUpdatedAt: number;
  scoreSum: number;
}

export interface RankedCategoryProfile {
  categoryId: string;
  score: number;
  metadataScore: number;
  memberScore: number;
  memberCount: number;
}

/** Category-management matching includes parents, but never pipeline-status taxonomy. */
export function isManageableTopicCategory(category: AiCategory): boolean {
  return (
    category.status !== 'deprecated' &&
    !isLinkQualityParentId(category.id) &&
    !isLinkQualityLeafId(category.id) &&
    !isLinkQualityParentId(category.parentId)
  );
}

/** Search discovery is topical; pipeline quality/attention leaves live elsewhere. */
export function isSearchableTopicCategory(category: AiCategory): boolean {
  return (
    category.kind === 'leaf' &&
    category.assignable !== false &&
    isManageableTopicCategory(category)
  );
}

export function buildCategorySearchText(
  category: AiCategory,
  parentDescription?: string
): string {
  return [
    category.parentName?.trim(),
    parentDescription?.trim(),
    category.name.trim(),
    category.description?.trim(),
    ...(category.canonicalTags ?? []).map((tag) => tag.trim()),
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n');
}

export function categoryMemberRevision(stats: CategorySearchMemberStats): string {
  return [
    stats.memberCount,
    stats.linkUpdatedAt,
    stats.signalUpdatedAt,
    stats.scoreSum.toFixed(6),
  ].join(':');
}

/** Member evidence gradually dominates, while taxonomy text retains a 20% anchor. */
export function categoryMemberWeight(memberCount: number): number {
  if (memberCount <= 0) return 0;
  return Math.min(0.8, memberCount / (memberCount + 5));
}

export function blendCategorySearchVectors(
  metadataEmbedding: number[],
  memberCentroid: number[],
  memberCount: number
): number[] {
  if (!metadataEmbedding.length) return l2Normalize(memberCentroid);
  if (!memberCentroid.length || metadataEmbedding.length !== memberCentroid.length) {
    return l2Normalize(metadataEmbedding);
  }
  const memberWeight = categoryMemberWeight(memberCount);
  const metadataWeight = 1 - memberWeight;
  return l2Normalize(
    metadataEmbedding.map(
      (value, index) => metadataWeight * value + memberWeight * memberCentroid[index]
    )
  );
}

export function scoreCategoryProfileVector(query: number[], profile: number[]): number {
  if (!query.length || !profile.length || query.length !== profile.length) return 0;
  return Math.max(0, Math.min(1, cosineSimilarity(query, profile)));
}
