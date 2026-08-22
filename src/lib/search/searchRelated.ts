import { isSearchableTopicCategory } from './categorySearchProfiles';
import { applySearchFilters } from './filters';
import {
  matchesParsedSearchStructuredScope,
  type ParsedSearchQuery,
} from './queryLanguage';
import {
  expandCategoryCandidates,
  rankEmbeddingCandidates,
  scoreCategoryAffinity,
  scoreEmbedding,
} from './ranking';
import type {
  HybridSearchResult,
  SearchFilters,
  SearchIndex,
  SearchResult,
} from './types';

export interface RelatedTopic {
  categoryId: string;
  name: string;
  count: number;
  source: 'query' | 'results';
}

export interface RelatedTag {
  tag: string;
  count: number;
}

export interface SearchRelatedFacets {
  topics: RelatedTopic[];
  tags: RelatedTag[];
  /** Semantically / categorically related items not in the main result list. */
  relatedLinks: SearchResult[];
}

export interface HybridSearchResultWithRelated extends HybridSearchResult {
  related: SearchRelatedFacets;
}

export interface ExtractSearchRelatedOptions {
  excludeItemIds?: Set<string>;
  relatedLimit?: number;
  tagSampleFromTop?: number;
  filters?: SearchFilters;
  queryEmbedding?: number[];
  embeddingScores?: Record<string, number>;
  matchedCategoryScores?: ReadonlyMap<string, number>;
  parsedQuery?: ParsedSearchQuery;
}

function aggregateTagsFromResults(
  index: SearchIndex,
  resultItemIds: string[],
  topN: number
): RelatedTag[] {
  const counts = new Map<string, number>();
  const docById = new Map(index.documents.map((d) => [d.itemId, d]));

  for (const itemId of resultItemIds.slice(0, topN)) {
    const doc = docById.get(itemId);
    if (!doc) continue;
    for (const tag of doc.tags) {
      const t = tag.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 20);
}

function aggregateTopicsFromResults(
  index: SearchIndex,
  resultItemIds: string[],
  queryMatchedIds: Set<string>
): RelatedTopic[] {
  const counts = new Map<string, number>();
  const docById = new Map(index.documents.map((d) => [d.itemId, d]));

  for (const itemId of resultItemIds) {
    const doc = docById.get(itemId);
    if (!doc) continue;
    for (const catId of doc.categoryIds) {
      const category = index.categoryById.get(catId);
      if (!category || !isSearchableTopicCategory(category)) continue;
      counts.set(catId, (counts.get(catId) ?? 0) + 1);
    }
  }

  const topics: RelatedTopic[] = [];

  for (const catId of queryMatchedIds) {
    const cat = index.categoryById.get(catId);
    if (!cat || !isSearchableTopicCategory(cat)) continue;
    topics.push({
      categoryId: catId,
      name: cat.name,
      // Query-matched categories are real navigation targets; show the full
      // category size rather than only how many exact top results used it.
      count: index.itemsByCategory.get(catId)?.length ?? 0,
      source: 'query',
    });
  }

  for (const [catId, count] of counts.entries()) {
    if (queryMatchedIds.has(catId)) continue;
    const cat = index.categoryById.get(catId);
    if (!cat || !isSearchableTopicCategory(cat)) continue;
    topics.push({ categoryId: catId, name: cat.name, count, source: 'results' });
  }

  topics.sort(
    (a, b) =>
      (a.source === 'query' ? 0 : 1) - (b.source === 'query' ? 0 : 1) ||
      b.count - a.count ||
      a.name.localeCompare(b.name)
  );

  return topics.slice(0, 15);
}

export function findRelatedBeyondTopResults(
  index: SearchIndex,
  options: {
    matchedCategoryIds: Set<string>;
    queryEmbedding?: number[];
    embeddingScores?: Record<string, number>;
    matchedCategoryScores?: ReadonlyMap<string, number>;
    excludeItemIds: Set<string>;
    filters?: SearchFilters;
    parsedQuery?: ParsedSearchQuery;
    limit?: number;
    candidateLimit?: number;
  }
): SearchResult[] {
  const limit = options.limit ?? 15;
  const candidateLimit = options.candidateLimit ?? 200;
  const organizationScopedDocs = applySearchFilters(index.documents, options.filters);
  const scopedDocs = options.parsedQuery
    ? organizationScopedDocs.filter((doc) =>
        matchesParsedSearchStructuredScope(doc, options.parsedQuery!, index)
      )
    : organizationScopedDocs;
  const scopedIndex: SearchIndex = { ...index, documents: scopedDocs };

  const candidateMap = new Map<
    string,
    { doc: (typeof scopedDocs)[0]; sources: Set<'embedding' | 'category'> }
  >();

  if (options.embeddingScores) {
    const docById = new Map(scopedDocs.map((doc) => [doc.itemId, doc]));
    const ranked = Object.entries(options.embeddingScores)
      .sort((left, right) => right[1] - left[1])
      .slice(0, candidateLimit);
    for (const [itemId] of ranked) {
      if (options.excludeItemIds.has(itemId)) continue;
      const doc = docById.get(itemId);
      if (!doc) continue;
      candidateMap.set(itemId, { doc, sources: new Set(['embedding']) });
    }
  }

  if (options.queryEmbedding?.length) {
    for (const hit of rankEmbeddingCandidates(
      options.queryEmbedding,
      scopedDocs,
      candidateLimit
    )) {
      if (options.excludeItemIds.has(hit.doc.itemId)) continue;
      const entry = candidateMap.get(hit.doc.itemId) ?? {
        doc: hit.doc,
        sources: new Set<'embedding' | 'category'>(),
      };
      entry.sources.add('embedding');
      candidateMap.set(hit.doc.itemId, entry);
    }
  }

  if (options.matchedCategoryIds.size) {
    for (const hit of expandCategoryCandidates(
      scopedIndex,
      options.matchedCategoryIds,
      candidateLimit
    )) {
      if (options.excludeItemIds.has(hit.doc.itemId)) continue;
      const entry = candidateMap.get(hit.doc.itemId) ?? {
        doc: hit.doc,
        sources: new Set<'embedding' | 'category'>(),
      };
      entry.sources.add('category');
      candidateMap.set(hit.doc.itemId, entry);
    }
  }

  const scored: SearchResult[] = [];

  for (const { doc, sources } of candidateMap.values()) {
    const embedding = options.queryEmbedding?.length
      ? options.embeddingScores?.[doc.itemId] ?? scoreEmbedding(options.queryEmbedding, doc)
      : 0;
    const cat = scoreCategoryAffinity(
      doc,
      options.matchedCategoryIds,
      index.categoryById,
      options.matchedCategoryScores
    );
    const finalScore = 0.6 * embedding + 0.4 * cat.score;
    if (finalScore < 0.08) continue;

    scored.push({
      itemId: doc.itemId,
      title: doc.title,
      url: doc.url,
      domain: doc.domain,
      primaryCategoryId: doc.primaryCategoryId,
      primaryCategoryName: doc.primaryCategoryId
        ? index.categoryById.get(doc.primaryCategoryId)?.name
        : undefined,
      breakdown: {
        lexical: 0,
        embedding,
        category: cat.score,
        qualityBoost: 0,
        freshnessBoost: 0,
        domainBoost: 0,
        generalPenalty: 0,
        manualReviewPenalty: 0,
        baseScore: finalScore,
        finalScore,
        matchedTerms: [],
        matchedCategories: cat.matched.map(
          (id) => index.categoryById.get(id)?.name ?? id
        ),
        candidateSources: [...sources],
      },
    });
  }

  scored.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);
  return scored.slice(0, limit);
}

export function extractSearchRelated(
  index: SearchIndex,
  searchResult: HybridSearchResult,
  options: ExtractSearchRelatedOptions = {}
): SearchRelatedFacets {
  const topIds = searchResult.results.map((r) => r.itemId);
  const exclude = new Set([...(options.excludeItemIds ?? []), ...topIds]);
  const queryMatched = new Set(searchResult.matchedCategoryIds);

  const topics = aggregateTopicsFromResults(index, topIds, queryMatched);
  const tags = aggregateTagsFromResults(
    index,
    topIds,
    options.tagSampleFromTop ?? 20
  );

  const relatedLinks = findRelatedBeyondTopResults(index, {
    matchedCategoryIds: queryMatched,
    queryEmbedding: options.queryEmbedding,
    embeddingScores: options.embeddingScores,
    matchedCategoryScores: options.matchedCategoryScores,
    excludeItemIds: exclude,
    filters: options.filters,
    parsedQuery: options.parsedQuery,
    limit: options.relatedLimit ?? 15,
  });

  return { topics, tags, relatedLinks };
}
