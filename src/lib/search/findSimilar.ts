import { applySearchFilters } from './filters';
import {
  expandCategoryCandidates,
  rankEmbeddingCandidates,
  scoreCategoryAffinity,
  scoreEmbedding,
} from './ranking';
import type { SearchDocument, SearchFilters, SearchIndex } from './types';

const SIMILAR_WEIGHTS = {
  withEmbedding: { embedding: 0.55, category: 0.3, tags: 0.15 },
  withoutEmbedding: { category: 0.45, tags: 0.25, lexical: 0.3 },
};

export interface SimilarItemBreakdown {
  embedding: number;
  category: number;
  tags: number;
  lexical: number;
  finalScore: number;
}

export interface SimilarItemResult {
  itemId: string;
  title: string;
  url: string;
  domain: string;
  primaryCategoryId?: string;
  primaryCategoryName?: string;
  breakdown: SimilarItemBreakdown;
  sources: Array<'embedding' | 'category' | 'tags' | 'lexical'>;
}

export interface FindSimilarOptions {
  itemId: string;
  limit?: number;
  candidateLimit?: number;
  filters?: SearchFilters;
  excludeSelf?: boolean;
}

export interface FindSimilarResult {
  itemId: string;
  anchorTitle: string;
  anchorHasEmbedding: boolean;
  results: SimilarItemResult[];
  totalCandidates: number;
}

/** Worker-provided vector ranking; vectors themselves never leave their owner. */
export interface FindSimilarEmbeddingContext {
  anchorHasEmbedding: boolean;
  embeddingScores: Readonly<Record<string, number>>;
  /** Pretokenized/inverted local fallback; consulted only without an anchor vector. */
  fallbackScores?: Readonly<Record<string, number>>;
}

function scoreTagOverlap(anchorTags: string[], docTags: string[]): number {
  if (!anchorTags.length || !docTags.length) return 0;
  const a = new Set(anchorTags.map((t) => t.toLowerCase().trim()).filter(Boolean));
  const b = new Set(docTags.map((t) => t.toLowerCase().trim()).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const t of a) {
    if (b.has(t)) overlap++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? overlap / union : 0;
}

function anchorCategoryIds(doc: SearchDocument): Set<string> {
  const ids = new Set(doc.categoryIds);
  if (doc.primaryCategoryId) ids.add(doc.primaryCategoryId);
  return ids;
}

export function findSimilarItems(
  index: SearchIndex,
  options: FindSimilarOptions,
  embeddingContext?: FindSimilarEmbeddingContext
): FindSimilarResult {
  const limit = options.limit ?? 20;
  const candidateLimit = options.candidateLimit ?? 200;
  const excludeSelf = options.excludeSelf !== false;

  const scopedDocs = applySearchFilters(index.documents, options.filters);
  const scopedIndex: SearchIndex = { ...index, documents: scopedDocs };
  const anchor = scopedDocs.find((d) => d.itemId === options.itemId);

  if (!anchor) {
    return {
      itemId: options.itemId,
      anchorTitle: '',
      anchorHasEmbedding: false,
      results: [],
      totalCandidates: 0,
    };
  }

  const anchorCats = anchorCategoryIds(anchor);
  const hasEmbedding = embeddingContext
    ? embeddingContext.anchorHasEmbedding
    : Boolean(anchor.embedding?.length);

  const candidateMap = new Map<
    string,
    { doc: SearchDocument; sources: Set<'embedding' | 'category' | 'tags' | 'lexical'> }
  >();

  if (hasEmbedding) {
    const scopedDocumentById = embeddingContext
      ? new Map(scopedDocs.map((document) => [document.itemId, document]))
      : undefined;
    const embeddingHits = embeddingContext
      ? Object.entries(embeddingContext.embeddingScores)
          .flatMap(([itemId, score]) => {
            const doc = scopedDocumentById?.get(itemId);
            return doc ? [{ doc, score }] : [];
          })
          .sort((left, right) => right.score - left.score)
          .slice(0, candidateLimit)
      : anchor.embedding
        ? rankEmbeddingCandidates(anchor.embedding, scopedDocs, candidateLimit)
        : [];
    for (const hit of embeddingHits) {
      if (excludeSelf && hit.doc.itemId === anchor.itemId) continue;
      const entry = candidateMap.get(hit.doc.itemId) ?? {
        doc: hit.doc,
        sources: new Set<'embedding' | 'category' | 'tags' | 'lexical'>(),
      };
      entry.sources.add('embedding');
      candidateMap.set(hit.doc.itemId, entry);
    }
  }

  if (anchorCats.size) {
    for (const hit of expandCategoryCandidates(scopedIndex, anchorCats, candidateLimit)) {
      if (excludeSelf && hit.doc.itemId === anchor.itemId) continue;
      const entry = candidateMap.get(hit.doc.itemId) ?? {
        doc: hit.doc,
        sources: new Set<'embedding' | 'category' | 'tags' | 'lexical'>(),
      };
      entry.sources.add('category');
      candidateMap.set(hit.doc.itemId, entry);
    }
  }

  if (anchor.tags.length) {
    for (const doc of scopedDocs) {
      if (excludeSelf && doc.itemId === anchor.itemId) continue;
      if (scoreTagOverlap(anchor.tags, doc.tags) <= 0) continue;
      const entry = candidateMap.get(doc.itemId) ?? {
        doc,
        sources: new Set<'embedding' | 'category' | 'tags' | 'lexical'>(),
      };
      entry.sources.add('tags');
      candidateMap.set(doc.itemId, entry);
    }
  }

  if (!hasEmbedding && embeddingContext?.fallbackScores) {
    const scopedDocumentById = new Map(scopedDocs.map((document) => [document.itemId, document]));
    for (const itemId of Object.keys(embeddingContext.fallbackScores)) {
      if (excludeSelf && itemId === anchor.itemId) continue;
      const doc = scopedDocumentById.get(itemId);
      if (!doc) continue;
      const entry = candidateMap.get(itemId) ?? {
        doc,
        sources: new Set<'embedding' | 'category' | 'tags' | 'lexical'>(),
      };
      entry.sources.add('lexical');
      candidateMap.set(itemId, entry);
    }
  }

  const results: SimilarItemResult[] = [];

  for (const { doc, sources } of candidateMap.values()) {
    const embedding = embeddingContext
      ? embeddingContext.embeddingScores[doc.itemId] ?? 0
      : hasEmbedding && anchor.embedding?.length
        ? scoreEmbedding(anchor.embedding, doc)
        : 0;
    const category = scoreCategoryAffinity(doc, anchorCats, index.categoryById).score;
    const tags = scoreTagOverlap(anchor.tags, doc.tags);
    const lexical = !hasEmbedding ? embeddingContext?.fallbackScores?.[doc.itemId] ?? 0 : 0;

    const finalScore = hasEmbedding
      ? SIMILAR_WEIGHTS.withEmbedding.embedding * embedding +
        SIMILAR_WEIGHTS.withEmbedding.category * category +
        SIMILAR_WEIGHTS.withEmbedding.tags * tags
      : SIMILAR_WEIGHTS.withoutEmbedding.category * category +
        SIMILAR_WEIGHTS.withoutEmbedding.tags * tags +
        SIMILAR_WEIGHTS.withoutEmbedding.lexical * lexical;

    if (finalScore < 0.05) continue;

    results.push({
      itemId: doc.itemId,
      title: doc.title,
      url: doc.url,
      domain: doc.domain,
      primaryCategoryId: doc.primaryCategoryId,
      primaryCategoryName: doc.primaryCategoryId
        ? index.categoryById.get(doc.primaryCategoryId)?.name
        : undefined,
      breakdown: { embedding, category, tags, lexical, finalScore },
      sources: [...sources],
    });
  }

  results.sort(
    (a, b) =>
      b.breakdown.finalScore - a.breakdown.finalScore ||
      b.breakdown.embedding - a.breakdown.embedding
  );

  return {
    itemId: options.itemId,
    anchorTitle: anchor.title,
    anchorHasEmbedding: hasEmbedding,
    results: results.slice(0, limit),
    totalCandidates: results.length,
  };
}
