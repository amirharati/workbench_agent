import type { Item, ItemPlacement } from './db';

/**
 * Keep `placements` aligned with `collectionIds`.
 * Preserves notes/tags/source for kept collections; stubs new ones; drops removed.
 */
export function syncItemPlacementsWithCollectionIds(
  item: Pick<Item, 'collectionIds' | 'placements' | 'notes' | 'tags' | 'source'>,
  collectionIds: string[],
  now: number
): { collectionIds: string[]; placements: Record<string, ItemPlacement> } {
  const ids = [...new Set(collectionIds.filter(Boolean))];
  const prev = item.placements || {};
  const placements: Record<string, ItemPlacement> = {};

  for (const cid of ids) {
    const existing = prev[cid];
    if (existing) {
      placements[cid] = { ...existing, collectionId: cid };
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

  return { collectionIds: ids, placements };
}
