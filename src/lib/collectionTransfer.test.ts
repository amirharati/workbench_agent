import { describe, expect, it } from 'vitest';
import type { Item } from './db';
import { buildCollectionTransferPatch } from './collectionTransfer';

const item: Item = {
  id: 'item-1',
  title: 'Saved note',
  url: '',
  collectionIds: ['source'],
  tags: [],
  source: 'manual',
  created_at: 1,
  updated_at: 1,
  placements: {
    source: {
      collectionId: 'source',
      notes: 'Source context',
      tags: ['research'],
      source: 'manual',
      addedAt: 1,
    },
  },
};

describe('collection transfer patches', () => {
  it('copies membership without removing or rewriting source placement data', () => {
    const patch = buildCollectionTransferPatch({
      item,
      targetCollectionId: 'target',
      operation: 'copy',
    });
    expect(patch.collectionIds).toEqual(['source', 'target']);
    expect(patch.placements?.source.notes).toBe('Source context');
  });

  it('moves source placement notes and tags to a new destination', () => {
    const patch = buildCollectionTransferPatch({
      item,
      sourceCollectionId: 'source',
      targetCollectionId: 'target',
      operation: 'move',
      now: 42,
    });
    expect(patch.collectionIds).toEqual(['target']);
    expect(patch.placements?.source).toBeUndefined();
    expect(patch.placements?.target).toMatchObject({
      collectionId: 'target',
      notes: 'Source context',
      tags: ['research'],
      addedAt: 42,
    });
  });

  it('merges placement data when moving into an existing membership', () => {
    const patch = buildCollectionTransferPatch({
      item: {
        ...item,
        collectionIds: ['source', 'target'],
        placements: {
          ...item.placements,
          target: {
            collectionId: 'target',
            notes: 'Target context',
            tags: ['kept'],
            source: 'manual',
            addedAt: 2,
          },
        },
      },
      sourceCollectionId: 'source',
      targetCollectionId: 'target',
      operation: 'move',
    });
    expect(patch.collectionIds).toEqual(['target']);
    expect(patch.placements?.target.notes).toBe('Target context\n\nSource context');
    expect(patch.placements?.target.tags).toEqual(['kept', 'research']);
  });
});
