import type { Item, ItemPlacement, RemovedItemPlacement } from './db';

/**
 * Keep `placements` aligned with `collectionIds`.
 * Preserves notes/tags/source for kept collections; stubs new ones; drops removed.
 */
export function syncItemPlacementsWithCollectionIds(
  item: Pick<Item, 'collectionIds' | 'placements' | 'removedPlacements' | 'notes' | 'tags' | 'source'>,
  collectionIds: string[],
  now: number
): {
  collectionIds: string[];
  placements: Record<string, ItemPlacement>;
  removedPlacements?: Record<string, RemovedItemPlacement>;
} {
  const ids = [...new Set(collectionIds.filter(Boolean))];
  const prev = item.placements || {};
  const removed = { ...(item.removedPlacements || {}) };
  const placements: Record<string, ItemPlacement> = {};

  for (const [collectionId, placement] of Object.entries(prev)) {
    if (ids.includes(collectionId)) continue;
    removed[collectionId] = {
      ...placement,
      collectionId,
      removedAt: removed[collectionId]?.removedAt ?? now,
    };
  }

  for (const cid of ids) {
    const existing = prev[cid];
    if (existing) {
      placements[cid] = { ...existing, collectionId: cid };
      continue;
    }
    const previouslyRemoved = removed[cid];
    if (previouslyRemoved) {
      const { removedAt: _removedAt, ...restored } = previouslyRemoved;
      placements[cid] = { ...restored, collectionId: cid };
      delete removed[cid];
      continue;
    }
    // First placement may inherit legacy item-level notes/tags when seeding from empty placements.
    const seedFromLegacy = Object.keys(prev).length === 0 && ids.length === 1;
    placements[cid] = {
      collectionId: cid,
      addedAt: now,
      source: item.source || 'manual',
      notes: seedFromLegacy ? item.notes : undefined,
      tags: seedFromLegacy ? item.tags : undefined,
    };
  }

  return {
    collectionIds: ids,
    placements,
    ...(Object.keys(removed).length > 0 ? { removedPlacements: removed } : {}),
  };
}
