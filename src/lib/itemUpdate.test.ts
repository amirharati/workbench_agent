import { describe, expect, it } from 'vitest';
import type { Item } from './db';
import { buildUpdatedItem } from './itemUpdate';

function item(): Item {
  return {
    id: 'item-1',
    url: 'https://example.com',
    title: 'Original',
    collectionIds: ['collection-a', 'collection-b'],
    tags: ['manual'],
    placements: {
      'collection-a': {
        collectionId: 'collection-a',
        addedAt: 1,
        source: 'manual',
      },
      'collection-b': {
        collectionId: 'collection-b',
        addedAt: 2,
        source: 'manual',
      },
    },
    created_at: 1,
    updated_at: 2,
    source: 'bookmark',
  };
}

describe('buildUpdatedItem', () => {
  it('preserves canonical organization when enrichment patches unrelated fields', () => {
    const result = buildUpdatedItem(
      item(),
      { title: 'AI-improved title', metadata: { platform: 'article' } },
      undefined,
      'incoming',
      10
    );

    expect(result.collectionIds).toEqual(['collection-a', 'collection-b']);
    expect(Object.keys(result.placements ?? {})).toEqual(['collection-a', 'collection-b']);
    expect(result.title).toBe('AI-improved title');
  });

  it('keeps placements synchronized when organization itself changes', () => {
    const result = buildUpdatedItem(
      item(),
      { collectionIds: ['collection-a', 'collection-c'] },
      undefined,
      'incoming',
      10
    );

    expect(result.collectionIds).toEqual(['collection-a', 'collection-c']);
    expect(Object.keys(result.placements ?? {})).toEqual(['collection-a', 'collection-c']);
    expect(result.placements?.['collection-a'].addedAt).toBe(1);
    expect(result.placements?.['collection-c']).toMatchObject({
      collectionId: 'collection-c',
      addedAt: 10,
      source: 'bookmark',
    });
  });
});
