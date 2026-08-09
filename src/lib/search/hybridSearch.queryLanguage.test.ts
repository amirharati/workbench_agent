import { describe, expect, it } from 'vitest';
import { hybridSearch } from './hybridSearch';
import { parseSearchQuery } from './queryLanguage';
import { findRelatedBeyondTopResults } from './searchRelated';
import type { SearchDocument, SearchIndex } from './types';

function document(
  itemId: string,
  title: string,
  embedding?: number[],
  overrides: Partial<SearchDocument> = {}
): SearchDocument {
  return {
    itemId,
    title,
    url: `https://example.com/${itemId}`,
    domain: 'example.com',
    notes: '',
    tags: [],
    summary: '',
    keyPoints: [],
    updatedAt: 1,
    createdAt: 1,
    collectionIds: [],
    projectIds: [],
    embedding,
    categoryIds: [],
    categoryScores: {},
    hasQualityEnrichment: false,
    ...overrides,
  };
}

function index(documents: SearchDocument[]): SearchIndex {
  return {
    documents,
    categories: [],
    categoryById: new Map(),
    itemsByCategory: new Map(),
  };
}

describe('hybridSearch parsed query semantics', () => {
  const searchIndex = index([
    document('both', 'ML methods in trading', [0.95, 0.05]),
    document('trading', 'Trading methods and systems', [0.8, 0.2]),
    document('ml', 'ML engineering handbook', [0.75, 0.25]),
    document('semantic', 'Systematic market signal research', [1, 0]),
  ]);

  it('does not return one-term documents for an unquoted multi-term AND query', () => {
    const result = hybridSearch(searchIndex, {
      query: 'ml in trading',
      mode: 'hybrid',
      queryEmbedding: [1, 0],
    });

    expect(result.results.map((row) => row.itemId)).toEqual(['both']);
    expect(result.totalCandidates).toBe(1);
    expect(result.embeddingPathUsed).toBe(true);
  });

  it('supports exact phrases, OR, and exclusions in primary results', () => {
    expect(hybridSearch(searchIndex, {
      query: '"ml methods in trading"',
      mode: 'lexical-only',
    }).results.map((row) => row.itemId)).toEqual(['both']);

    expect(hybridSearch(searchIndex, {
      query: 'ml OR trading',
      mode: 'lexical-only',
    }).results.map((row) => row.itemId)).toEqual(expect.arrayContaining(['both', 'trading', 'ml']));

    expect(hybridSearch(searchIndex, {
      query: 'ml -trading',
      mode: 'lexical-only',
    }).results.map((row) => row.itemId)).toEqual(['ml']);
  });

  it('keeps semantic discoveries separate from deterministic matches', () => {
    const parsedQuery = parseSearchQuery('ai quant');
    const semanticIndex = index([
      document('exact', 'AI methods for quant research', [0.9, 0.1]),
      document('related', 'Systematic market signal research', [1, 0]),
    ]);
    const result = hybridSearch(semanticIndex, {
      query: 'ai quant',
      mode: 'hybrid',
      queryEmbedding: [1, 0],
    });

    expect(result.results.map((row) => row.itemId)).toEqual(['exact']);
    expect(findRelatedBeyondTopResults(semanticIndex, {
      matchedCategoryIds: new Set(),
      queryEmbedding: [1, 0],
      excludeItemIds: new Set(['exact']),
      parsedQuery,
    }).map((row) => row.itemId)).toEqual(['related']);
  });

  it('uses worker-computed semantic scores when document vectors stay out of the tab', () => {
    const workerOwnedIndex = index([
      document('lower', 'AI quant notes', undefined, { hasEmbedding: true }),
      document('higher', 'AI quant research', undefined, { hasEmbedding: true }),
    ]);
    const result = hybridSearch(workerOwnedIndex, {
      query: 'ai quant',
      mode: 'hybrid',
      queryEmbedding: [1, 0],
      embeddingScores: { lower: 0.6, higher: 0.95 },
    });

    expect(result.results.map((row) => row.itemId)).toEqual(['higher', 'lower']);
    expect(result.embeddingPathUsed).toBe(true);
  });
});
