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
    expect(result.removedPlacements?.['collection-b']).toMatchObject({
      collectionId: 'collection-b',
      addedAt: 2,
      removedAt: 10,
    });
  });

  it('preserves content recency for marker-only updates when requested', () => {
    const result = buildUpdatedItem(
      item(),
      { favoriteAt: 10 },
      { preserveUpdatedAt: true },
      'incoming',
      10
    );

    expect(result.favoriteAt).toBe(10);
    expect(result.updated_at).toBe(2);
  });

  it('clears markers after Chrome messaging strips undefined properties', () => {
    const favorite = { ...item(), favoriteAt: 10 };
    const serializedUpdates = JSON.parse(JSON.stringify({ favoriteAt: undefined }));
    const result = buildUpdatedItem(
      favorite,
      serializedUpdates,
      { preserveUpdatedAt: true, clearItemMarkers: ['favoriteAt'] },
      'incoming',
      20
    );

    expect(result.favoriteAt).toBeUndefined();
    expect(result.updated_at).toBe(2);
  });
});
