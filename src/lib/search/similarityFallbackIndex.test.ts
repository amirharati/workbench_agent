import { describe, expect, it } from 'vitest';
import { WorkerSimilarityFallbackIndex } from './similarityFallbackIndex';
import type { SearchDocument } from './types';

function document(itemId: string, title: string, domain = 'example.com'): SearchDocument {
  return {
    itemId,
    title,
    url: `https://${domain}/${itemId}`,
    domain,
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
  };
}

describe('WorkerSimilarityFallbackIndex', () => {
  it('uses indexed text/domain candidates and applies incremental updates', () => {
    const index = new WorkerSimilarityFallbackIndex();
    index.load([
      document('anchor', 'Reliable import pipeline'),
      document('text', 'Import pipeline recovery', 'docs.example'),
      document('domain', 'Unrelated title'),
    ]);

    expect(index.query('anchor', { limit: 10 }).map((hit) => hit.itemId)).toEqual([
      'text',
      'domain',
    ]);

    index.upsert(document('domain', 'Cooking recipes', 'food.example'));
    expect(index.query('anchor', { limit: 10 }).map((hit) => hit.itemId)).toEqual(['text']);
    index.remove('text');
    expect(index.query('anchor', { limit: 10 })).toEqual([]);
  });
});
