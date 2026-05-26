import { meanVector } from '../categorization/math';
import type { AiCategory } from '../categorization/types';
import type { SearchIndex } from './types';

/**
 * Derive leaf centroids from linked doc embeddings at search time (read-only;
 * does not persist to ai_categories). Enables query→centroid category expansion
 * when classify used topic-extract without stored centroids.
 */
export function withSearchCategoryCentroids(index: SearchIndex): SearchIndex {
  const docById = new Map(index.documents.map((d) => [d.itemId, d]));
  const vectorsByCategory = new Map<string, number[][]>();

  for (const [catId, itemIds] of index.itemsByCategory) {
    for (const itemId of itemIds) {
      const emb = docById.get(itemId)?.embedding;
      if (!emb?.length) continue;
      const list = vectorsByCategory.get(catId) ?? [];
      list.push(emb);
      vectorsByCategory.set(catId, list);
    }
  }

  const categories: AiCategory[] = index.categories.map((cat) => {
    if (cat.kind !== 'leaf' || cat.status === 'deprecated') return cat;
    if (cat.centroid?.length) return cat;
    const members = vectorsByCategory.get(cat.id);
    if (!members?.length) return cat;
    return { ...cat, centroid: meanVector(members) };
  });

  return {
    ...index,
    categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
  };
}

export function searchIndexStats(index: SearchIndex): {
  documents: number;
  withEmbeddings: number;
  withEnrichmentSummary: number;
  withCategoryLinks: number;
  leavesWithCentroid: number;
} {
  const leaves = index.categories.filter((c) => c.kind === 'leaf' && c.status !== 'deprecated');
  return {
    documents: index.documents.length,
    withEmbeddings: index.documents.filter((d) => d.embedding?.length).length,
    withEnrichmentSummary: index.documents.filter((d) => d.summary.trim()).length,
    withCategoryLinks: index.documents.filter((d) => d.categoryIds.length).length,
    leavesWithCentroid: leaves.filter((c) => c.centroid?.length).length,
  };
}
