import { describe, expect, it } from 'vitest';
import { WorkerSimilarityIndex } from './similarityIndex';

describe('WorkerSimilarityIndex', () => {
  it('normalizes vectors and returns the closest current rows', () => {
    const index = new WorkerSimilarityIndex();
    index.load([
      { itemId: 'anchor', embeddingModel: 'model-a', embedding: [10, 0] },
      { itemId: 'near', embeddingModel: 'model-a', embedding: [9, 1] },
      { itemId: 'far', embeddingModel: 'model-a', embedding: [-1, 0] },
    ]);

    expect(index.ready).toBe(true);
    expect(index.size).toBe(3);
    expect(index.query('anchor', { limit: 2 }).hits.map((hit) => hit.itemId)).toEqual(['near']);
  });

  it('applies updates and removals without rebuilding the index', () => {
    const index = new WorkerSimilarityIndex();
    index.load([
      { itemId: 'anchor', embeddingModel: 'model-a', embedding: [1, 0] },
      { itemId: 'candidate', embeddingModel: 'model-a', embedding: [-1, 0] },
      { itemId: 'other', embeddingModel: 'model-a', embedding: [0, 1] },
    ]);

    index.upsert({ itemId: 'candidate', embeddingModel: 'model-a', embedding: [1, 0] });
    expect(index.query('anchor', { limit: 1 }).hits[0]?.itemId).toBe('candidate');

    expect(index.remove('candidate')).toBe(true);
    expect(index.has('candidate')).toBe(false);
    expect(index.size).toBe(2);
    expect(index.query('anchor', { limit: 2 }).hits.map((hit) => hit.itemId)).toEqual(['other']);
  });

  it('does not compare vectors from different models or dimensions', () => {
    const index = new WorkerSimilarityIndex();
    index.load([
      { itemId: 'anchor', embeddingModel: 'model-a', embedding: [1, 0] },
      { itemId: 'same-model', embeddingModel: 'model-a', embedding: [1, 0] },
      { itemId: 'other-model', embeddingModel: 'model-b', embedding: [1, 0] },
      { itemId: 'other-size', embeddingModel: 'model-a', embedding: [1, 0, 0] },
    ]);

    expect(index.query('anchor', { limit: 10 }).hits.map((hit) => hit.itemId)).toEqual([
      'same-model',
    ]);
  });

  it('filters during the scan instead of filtering a pre-trimmed result', () => {
    const index = new WorkerSimilarityIndex();
    index.load([
      { itemId: 'anchor', embeddingModel: 'model-a', embedding: [1, 0] },
      { itemId: 'blocked', embeddingModel: 'model-a', embedding: [1, 0] },
      { itemId: 'allowed', embeddingModel: 'model-a', embedding: [0.8, 0.2] },
    ]);

    const result = index.query('anchor', {
      limit: 1,
      allowedItemIds: new Set(['anchor', 'allowed']),
    });
    expect(result.hits[0]?.itemId).toBe('allowed');
  });
});
