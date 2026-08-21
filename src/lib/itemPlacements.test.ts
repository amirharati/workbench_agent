import { describe, expect, it } from 'vitest';
import { syncItemPlacementsWithCollectionIds } from './itemPlacements';
import type { Item } from './db';

const baseItem = (overrides: Partial<Item> = {}): Item =>
  ({
    id: 'i1',
    url: 'https://example.com',
    title: 'Example',
    collectionIds: ['c1'],
    tags: ['alpha'],
    notes: 'legacy note',
    source: 'manual',
    created_at: 1,
    updated_at: 1,
    placements: {
      c1: {
        collectionId: 'c1',
        notes: 'c1 notes',
        tags: ['p1'],
        addedAt: 1,
        source: 'manual',
      },
    },
    ...overrides,
  }) as Item;

describe('syncItemPlacementsWithCollectionIds', () => {
  it('keeps existing placement notes when membership expands', () => {
    const item = baseItem();
    const { collectionIds, placements } = syncItemPlacementsWithCollectionIds(
      item,
      ['c1', 'c2'],
      99
    );
    expect(collectionIds).toEqual(['c1', 'c2']);
    expect(placements.c1.notes).toBe('c1 notes');
    expect(placements.c1.tags).toEqual(['p1']);
    expect(placements.c2).toMatchObject({
      collectionId: 'c2',
      addedAt: 99,
      source: 'manual',
    });
    expect(placements.c2.notes).toBeUndefined();
  });

  it('soft-removes placements for removed collections and keeps their placement data', () => {
    const item = baseItem({
      collectionIds: ['c1', 'c2'],
      placements: {
        c1: { collectionId: 'c1', notes: 'keep', addedAt: 1, source: 'manual' },
        c2: { collectionId: 'c2', notes: 'gone', addedAt: 1, source: 'manual' },
      },
    });
    const { collectionIds, placements, removedPlacements } = syncItemPlacementsWithCollectionIds(item, ['c1'], 50);
    expect(collectionIds).toEqual(['c1']);
    expect(placements.c1.notes).toBe('keep');
    expect(placements.c2).toBeUndefined();
    expect(removedPlacements?.c2).toMatchObject({
      collectionId: 'c2',
      notes: 'gone',
      removedAt: 50,
    });
  });

  it('restores a soft-removed placement with its original metadata', () => {
    const removed = baseItem({
      collectionIds: ['c1'],
      placements: {
        c1: { collectionId: 'c1', notes: 'active', addedAt: 1, source: 'manual' },
      },
      removedPlacements: {
        c2: {
          collectionId: 'c2', notes: 'restore me', tags: ['original'], addedAt: 2, source: 'import', removedAt: 50,
        },
      },
    });
    const { collectionIds, placements, removedPlacements } = syncItemPlacementsWithCollectionIds(
      removed,
      ['c1', 'c2'],
      99
    );
    expect(collectionIds).toEqual(['c1', 'c2']);
    expect(placements.c2).toMatchObject({
      collectionId: 'c2', notes: 'restore me', tags: ['original'], addedAt: 2, source: 'import',
    });
    expect(removedPlacements).toBeUndefined();
  });

  it('dedupes collection ids', () => {
    const { collectionIds } = syncItemPlacementsWithCollectionIds(baseItem(), ['c1', 'c1', 'c2'], 1);
    expect(collectionIds).toEqual(['c1', 'c2']);
  });

  it('seeds legacy item notes onto first placement when placements were empty', () => {
    const item = baseItem({
      placements: {},
      notes: 'from item',
      tags: ['t1'],
    });
    const { placements } = syncItemPlacementsWithCollectionIds(item, ['c9'], 7);
    expect(placements.c9.notes).toBe('from item');
    expect(placements.c9.tags).toEqual(['t1']);
  });
});
