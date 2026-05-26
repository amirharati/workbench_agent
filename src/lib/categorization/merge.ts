import { cosineSimilarity, meanVector } from './math';
import type { AiCategory } from './types';

export interface MergeCategoriesResult {
  categories: AiCategory[];
  mergedCount: number;
}

/**
 * Merge categories with centroid cosine >= threshold (keeps larger id by member count proxy: name length / first).
 */
export function mergeSimilarCategories(
  categories: AiCategory[],
  mergeMinCosine: number,
  now = Date.now()
): MergeCategoriesResult {
  if (categories.length < 2) return { categories, mergedCount: 0 };

  const remaining = categories.map((c) => ({ ...c }));
  let mergedCount = 0;

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const ci = remaining[i].centroid;
        const cj = remaining[j].centroid;
        if (!ci?.length || !cj?.length) continue;
        const sim = cosineSimilarity(ci, cj);
        if (sim < mergeMinCosine) continue;

        const a = remaining[i];
        const b = remaining[j];
        const keep = (a.canonicalTags?.length ?? 0) >= (b.canonicalTags?.length ?? 0) ? a : b;
        const drop = keep === a ? b : a;
        const tags = new Set([...(keep.canonicalTags ?? []), ...(drop.canonicalTags ?? [])]);

        remaining[i] = {
          ...keep,
          centroid: meanVector([keep.centroid!, drop.centroid!]),
          canonicalTags: [...tags].slice(0, 8),
          updated_at: now,
        };
        remaining.splice(j, 1);
        mergedCount++;
        changed = true;
        break outer;
      }
    }
  }

  return { categories: remaining, mergedCount };
}
