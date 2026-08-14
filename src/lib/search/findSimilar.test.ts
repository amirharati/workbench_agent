import { describe, expect, it } from 'vitest';
import { findSimilarItems } from './findSimilar';
import type { SearchDocument, SearchIndex } from './types';

function document(
  itemId: string,
  title: string,
  options: Partial<SearchDocument> = {}
): SearchDocument {
  return {
    itemId,
    title,
    url: options.url ?? `https://example.com/${itemId}`,
    domain: options.domain ?? 'example.com',
    notes: '',
    tags: [],
    summary: '',
    keyPoints: [],
    updatedAt: 1,
    createdAt: 1,
    collectionIds: [],
    projectIds: [],
    categoryIds: [],
    categoryScores: {},
    hasQualityEnrichment: false,
    ...options,
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

describe('findSimilarItems', () => {
  it('uses worker-owned embedding scores without copying vectors into documents', () => {
    const result = findSimilarItems(index([
      document('anchor', 'Pipeline design', { hasEmbedding: true }),
      document('related', 'Queue architecture', { hasEmbedding: true }),
      document('unrelated', 'Cooking', { hasEmbedding: true, domain: 'food.example' }),
    ]), { itemId: 'anchor' }, {
      anchorHasEmbedding: true,
      embeddingScores: { related: 0.99, unrelated: 0 },
    });

    expect(result.anchorHasEmbedding).toBe(true);
    expect(result.results[0]?.itemId).toBe('related');
    expect(result.results[0]?.sources).toContain('embedding');
  });

  it('uses the original tag fallback when the anchor has no embedding', () => {
    const result = findSimilarItems(index([
      document('anchor', 'Reliable import pipeline', { tags: ['pipelines', 'recovery'] }),
      document('tag-match', 'Queue architecture', { tags: ['pipelines'] }),
      document('unrelated', 'Completely different subject'),
    ]), { itemId: 'anchor' });

    expect(result.results.map((row) => row.itemId)).toEqual(['tag-match']);
    expect(result.results[0]?.sources).toContain('tags');
  });

  it('accepts worker-indexed text fallback scores only when the anchor has no embedding', () => {
    const result = findSimilarItems(index([
      document('anchor', 'Reliable import pipeline'),
      document('related', 'Import pipeline recovery'),
    ]), { itemId: 'anchor' }, {
      anchorHasEmbedding: false,
      embeddingScores: {},
      fallbackScores: { related: 0.8 },
    });

    expect(result.results[0]?.itemId).toBe('related');
    expect(result.results[0]?.sources).toContain('lexical');
    expect(result.results[0]?.breakdown.lexical).toBe(0.8);
  });
});
