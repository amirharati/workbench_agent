import { cosineSimilarity } from '../categorization/math';
import { isGeneralLeafId } from '../categorization/taxonomyCatalog';
import type { AiCategory } from '../categorization/types';
import { tokenize } from './tokenize';
import type { SearchDocument, SearchIndex, SearchWeights } from './types';
import { DEFAULT_SEARCH_WEIGHTS } from './types';

export function mergeWeights(partial?: Partial<SearchWeights>): SearchWeights {
  return { ...DEFAULT_SEARCH_WEIGHTS, ...partial };
}

export function scoreEmbedding(queryEmbedding: number[], doc: SearchDocument): number {
  if (!queryEmbedding.length || !doc.embedding?.length) return 0;
  const sim = cosineSimilarity(queryEmbedding, doc.embedding);
  return Math.max(0, Math.min(1, (sim + 1) / 2));
}

export function matchCategoriesByName(
  query: string,
  categories: AiCategory[]
): Array<{ categoryId: string; score: number; name: string }> {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const hits: Array<{ categoryId: string; score: number; name: string }> = [];
  for (const cat of categories) {
    if (cat.kind !== 'leaf' || cat.status === 'deprecated') continue;
    const nameTokens = new Set(tokenize(`${cat.name} ${cat.parentName ?? ''}`));
    let overlap = 0;
    for (const t of tokens) {
      if (nameTokens.has(t)) overlap++;
    }
    if (overlap > 0) {
      hits.push({
        categoryId: cat.id,
        score: overlap / tokens.length,
        name: cat.name,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

export function matchCategoriesByCentroid(
  queryEmbedding: number[],
  categories: AiCategory[],
  topK: number
): Array<{ categoryId: string; score: number; name: string }> {
  if (!queryEmbedding.length) return [];

  const scored = categories
    .filter((c) => c.kind === 'leaf' && c.centroid?.length && c.status !== 'deprecated')
    .map((c) => ({
      categoryId: c.id,
      score: Math.max(0, cosineSimilarity(queryEmbedding, c.centroid!)),
      name: c.name,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.filter((s) => s.score > 0.2);
}

export function scoreCategoryAffinity(
  doc: SearchDocument,
  matchedCategoryIds: Set<string>,
  _categoryById: Map<string, AiCategory>
): { score: number; matched: string[] } {
  if (!matchedCategoryIds.size) return { score: 0, matched: [] };

  const matched: string[] = [];
  let best = 0;

  for (const catId of matchedCategoryIds) {
    if (!doc.categoryIds.includes(catId)) continue;
    matched.push(catId);
    const linkScore = doc.categoryScores[catId] ?? 0.5;
    const primaryBoost = doc.primaryCategoryId === catId ? 1.15 : 1;
    best = Math.max(best, Math.min(1, linkScore * primaryBoost));
  }

  if (matched.length && best < 0.3) best = 0.3;

  return { score: best, matched };
}

export function computeBoostsAndPenalties(
  doc: SearchDocument,
  domainHint: string | undefined,
  weights: SearchWeights,
  _index: SearchIndex
): {
  qualityBoost: number;
  freshnessBoost: number;
  domainBoost: number;
  generalPenalty: number;
  manualReviewPenalty: number;
} {
  let qualityBoost = 0;
  if (doc.hasQualityEnrichment) qualityBoost = weights.qualityBoost;

  const ageMs = Date.now() - doc.updatedAt;
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const freshnessBoost =
    ageMs < ninetyDays ? weights.freshnessBoost * (1 - ageMs / ninetyDays) : 0;

  let domainBoost = 0;
  if (domainHint && doc.domain.toLowerCase().includes(domainHint.toLowerCase())) {
    domainBoost = weights.domainBoost;
  }

  let generalPenalty = 0;
  if (doc.primaryCategoryId && isGeneralLeafId(doc.primaryCategoryId)) {
    const hasSpecificAlt = doc.categoryIds.some(
      (id) => id !== doc.primaryCategoryId && !isGeneralLeafId(id)
    );
    if (hasSpecificAlt || _index.documents.some(
      (d) =>
        d.itemId !== doc.itemId &&
        d.primaryCategoryId &&
        !isGeneralLeafId(d.primaryCategoryId) &&
        d.categoryIds.some((id) => doc.categoryIds.includes(id) && !isGeneralLeafId(id))
    )) {
      generalPenalty = weights.generalPenalty;
    } else if (isGeneralLeafId(doc.primaryCategoryId)) {
      generalPenalty = weights.generalPenalty * 0.5;
    }
  }

  const manualReviewPenalty =
    doc.classifyState === 'manual_review' ? weights.manualReviewPenalty : 0;

  return {
    qualityBoost,
    freshnessBoost,
    domainBoost,
    generalPenalty,
    manualReviewPenalty,
  };
}

export function computeFinalScore(
  lexical: number,
  embedding: number,
  category: number,
  boosts: ReturnType<typeof computeBoostsAndPenalties>,
  weights: SearchWeights,
  phraseMatch: boolean
): { baseScore: number; finalScore: number } {
  let lex = lexical;
  if (phraseMatch) lex = Math.min(1, lex + weights.phraseBoost);

  const baseScore =
    weights.lexical * lex + weights.embedding * embedding + weights.category * category;

  const finalScore =
    baseScore +
    boosts.qualityBoost +
    boosts.freshnessBoost +
    boosts.domainBoost -
    boosts.generalPenalty -
    boosts.manualReviewPenalty;

  return { baseScore, finalScore: Math.max(0, finalScore) };
}

export function rankEmbeddingCandidates(
  queryEmbedding: number[],
  documents: SearchDocument[],
  limit: number
): Array<{ doc: SearchDocument; score: number }> {
  const scored = documents
    .filter((d) => d.embedding?.length)
    .map((doc) => ({ doc, score: scoreEmbedding(queryEmbedding, doc) }))
    .sort((a, b) => b.score - a.score || b.doc.updatedAt - a.doc.updatedAt);
  return scored.filter((s) => s.score > 0.05).slice(0, limit);
}

export function expandCategoryCandidates(
  index: SearchIndex,
  matchedCategoryIds: Set<string>,
  limit: number
): Array<{ doc: SearchDocument; score: number }> {
  const itemScores = new Map<string, number>();

  for (const catId of matchedCategoryIds) {
    const itemIds = index.itemsByCategory.get(catId) ?? [];
    for (const itemId of itemIds) {
      const prev = itemScores.get(itemId) ?? 0;
      itemScores.set(itemId, Math.max(prev, 0.5));
    }
  }

  const docById = new Map(index.documents.map((d) => [d.itemId, d]));
  const scored = [...itemScores.entries()]
    .map(([itemId, score]) => {
      const doc = docById.get(itemId);
      return doc ? { doc, score } : null;
    })
    .filter(Boolean) as Array<{ doc: SearchDocument; score: number }>;

  scored.sort((a, b) => b.score - a.score || b.doc.updatedAt - a.doc.updatedAt);
  return scored.slice(0, limit);
}

export function resolveMatchedCategories(
  query: string,
  queryEmbedding: number[] | undefined,
  index: SearchIndex,
  categoryTopK: number
): { ids: Set<string>; labels: string[] } {
  const byName = matchCategoriesByName(query, index.categories);
  const byCentroid = queryEmbedding?.length
    ? matchCategoriesByCentroid(queryEmbedding, index.categories, categoryTopK)
    : [];

  const merged = new Map<string, { score: number; name: string }>();
  for (const hit of [...byName, ...byCentroid]) {
    const prev = merged.get(hit.categoryId);
    if (!prev || hit.score > prev.score) {
      merged.set(hit.categoryId, { score: hit.score, name: hit.name });
    }
  }

  const sorted = [...merged.entries()].sort((a, b) => b[1].score - a[1].score);
  const ids = new Set(sorted.map(([id]) => id));
  const labels = sorted.map(([, v]) => v.name);
  return { ids, labels };
}
