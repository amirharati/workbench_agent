import { describe, expect, it } from 'vitest';
import {
  dropDeletedEntities,
  mergeByUpdatedAt,
  mergeDeletedItems,
  mergeLibrarySnapshots,
} from './mergeSqliteStores';

describe('mergeByUpdatedAt', () => {
  it('keeps unique ids from both sides (union)', () => {
    const folder = [{ id: 'a', updated_at: 1, name: 'A' }];
    const live = [{ id: 'b', updated_at: 2, name: 'B' }];
    const { merged } = mergeByUpdatedAt(folder, live);
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('newer updated_at wins', () => {
    const folder = [{ id: 'a', updated_at: 10, name: 'folder' }];
    const live = [{ id: 'a', updated_at: 20, name: 'live' }];
    const { merged, stats } = mergeByUpdatedAt(folder, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('live');
    expect(stats.conflictsLiveWins).toBe(1);
  });

  it('tie prefers folder', () => {
    const folder = [{ id: 'a', updated_at: 5, name: 'folder' }];
    const live = [{ id: 'a', updated_at: 5, name: 'live' }];
    const { merged, stats } = mergeByUpdatedAt(folder, live);
    expect(merged[0].name).toBe('folder');
    expect(stats.conflictsFolderWins).toBe(1);
  });
});

describe('mergeDeletedItems + drop', () => {
  it('unions tombstones and max purgedAt wins', () => {
    const merged = mergeDeletedItems(
      [{ id: 'x', purgedAt: 10 }],
      [
        { id: 'x', purgedAt: 20 },
        { id: 'y', purgedAt: 5 },
      ]
    );
    expect(merged.find((d) => d.id === 'x')?.purgedAt).toBe(20);
    expect(merged.find((d) => d.id === 'y')?.purgedAt).toBe(5);
  });

  it('drops entity present only on other side when tombstoned', () => {
    const items = [
      { id: 'keep', updated_at: 1 },
      { id: 'gone', updated_at: 1 },
    ];
    const deleted = mergeDeletedItems([{ id: 'gone', purgedAt: 9 }], []);
    const kept = dropDeletedEntities(
      items,
      deleted.map((d) => d.id)
    );
    expect(kept.map((i) => i.id)).toEqual(['keep']);
  });
});

describe('mergeLibrarySnapshots', () => {
  it('empty live + full folder keeps folder library', () => {
    const folder = {
      projects: [{ id: 'p1', updated_at: 1 }],
      collections: [{ id: 'c1', updated_at: 1 }],
      items: [
        { id: 'i1', updated_at: 1 },
        { id: 'i2', updated_at: 2 },
      ],
      notes: [],
      workspaces: [],
      deletedItems: [],
    };
    const live = {
      projects: [],
      collections: [],
      items: [],
      notes: [],
      workspaces: [],
      deletedItems: [],
    };
    const merged = mergeLibrarySnapshots(folder, live);
    expect(merged.stats.itemCount).toBe(2);
    expect(merged.items.map((i) => i.id).sort()).toEqual(['i1', 'i2']);
  });

  it('applies deleted_items so folder-only row is removed', () => {
    const folder = {
      projects: [],
      collections: [],
      items: [{ id: 'doomed', updated_at: 100 }],
      notes: [],
      workspaces: [],
      deletedItems: [],
    };
    const live = {
      projects: [],
      collections: [],
      items: [],
      notes: [],
      workspaces: [],
      deletedItems: [{ id: 'doomed', purgedAt: 200, reason: 'empty_trash' }],
    };
    const merged = mergeLibrarySnapshots(folder, live);
    expect(merged.items).toHaveLength(0);
    expect(merged.deletedItems.map((d) => d.id)).toEqual(['doomed']);
  });

  it('does not treat missing-without-tombstone as delete', () => {
    const folder = {
      projects: [],
      collections: [],
      items: [{ id: 'only-folder', updated_at: 1 }],
      notes: [],
      workspaces: [],
      deletedItems: [],
    };
    const live = {
      projects: [],
      collections: [],
      items: [{ id: 'only-live', updated_at: 1 }],
      notes: [],
      workspaces: [],
      deletedItems: [],
    };
    const merged = mergeLibrarySnapshots(folder, live);
    expect(merged.items.map((i) => i.id).sort()).toEqual(['only-folder', 'only-live']);
  });
});
