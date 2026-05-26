import { cosineSimilarity, meanVector } from './math.mjs';

export function mergeSimilarCategories(categories, mergeMinCosine, membersByCategoryId, now = Date.now()) {
  if (categories.length < 2) {
    return { categories, mergedCount: 0, idRemap: membersByCategoryId };
  }

  const remaining = categories.map((c) => ({ ...c }));
  let mergedCount = 0;
  let changed = true;
  const membersMap = membersByCategoryId ? new Map(membersByCategoryId) : null;

  while (changed) {
    changed = false;
    outer: for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const sim = cosineSimilarity(remaining[i].centroid, remaining[j].centroid);
        if (sim < mergeMinCosine) continue;

        const a = remaining[i];
        const b = remaining[j];
        const keep = (a.canonicalTags?.length ?? 0) >= (b.canonicalTags?.length ?? 0) ? a : b;
        const drop = keep === a ? b : a;
        const tags = new Set([...(keep.canonicalTags ?? []), ...(drop.canonicalTags ?? [])]);

        remaining[i] = {
          ...keep,
          centroid: meanVector([keep.centroid, drop.centroid]),
          canonicalTags: [...tags].slice(0, 8),
          updated_at: now,
        };

        if (membersMap) {
          const mergedMembers = [...(membersMap.get(keep.id) ?? []), ...(membersMap.get(drop.id) ?? [])]
            .sort((x, y) => (y.score ?? 0) - (x.score ?? 0))
            .slice(0, 8);
          membersMap.set(keep.id, mergedMembers);
          membersMap.delete(drop.id);
        }

        remaining.splice(j, 1);
        mergedCount++;
        changed = true;
        break outer;
      }
    }
  }

  return { categories: remaining, mergedCount, idRemap: membersMap };
}
