import { cosineSimilarity } from './math';
import type { AiCategory, CategoryAssignment, CategorizationThresholds } from './types';
import { DEFAULT_THRESHOLDS } from './types';

export function scoreCategories(
  embedding: number[],
  categories: AiCategory[]
): { categoryId: string; score: number }[] {
  return categories
    .filter((c) => c.centroid?.length)
    .map((c) => ({
      categoryId: c.id,
      score: cosineSimilarity(embedding, c.centroid!),
    }))
    .sort((a, b) => b.score - a.score);
}

export function assignToCategories(
  embedding: number[],
  categories: AiCategory[],
  thresholds: CategorizationThresholds = DEFAULT_THRESHOLDS
): { assignments: CategoryAssignment[]; isNovelty: boolean } {
  if (!categories.length) {
    return { assignments: [], isNovelty: true };
  }

  const ranked = scoreCategories(embedding, categories);
  const best = ranked[0];
  const primaryFloor = Math.max(thresholds.primaryMin, thresholds.noveltyMaxPrimary);
  if (!best || best.score < primaryFloor) {
    return { assignments: [], isNovelty: true };
  }

  const assignments: CategoryAssignment[] = [
    { categoryId: best.categoryId, score: best.score, isPrimary: true },
  ];

  let secondaries = 0;
  for (let i = 1; i < ranked.length && secondaries < thresholds.maxSecondaries; i++) {
    const r = ranked[i];
    if (r.score < thresholds.secondaryMin) break;
    if (best.score - r.score > thresholds.secondaryMaxGapFromPrimary) break;
    assignments.push({
      categoryId: r.categoryId,
      score: r.score,
      isPrimary: false,
    });
    secondaries++;
  }

  return { assignments, isNovelty: false };
}
