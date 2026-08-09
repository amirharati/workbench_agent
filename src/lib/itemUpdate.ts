import type { Item, UpdateItemOptions } from './db';
import { syncItemPlacementsWithCollectionIds } from './itemPlacements';

/**
 * Build one item update from the latest canonical row.
 *
 * This stays pure so the DB worker can apply a patch atomically after every
 * earlier write, instead of callers overwriting unrelated fields from a stale
 * page/offscreen cache.
 */
export function buildUpdatedItem(
  item: Item,
  updates: Partial<Omit<Item, 'id' | 'created_at'>>,
  options: UpdateItemOptions | undefined,
  defaultCollectionId: string,
  now: number
): Item {
  const hasNotesUpdate = Object.prototype.hasOwnProperty.call(updates, 'notes');
  const hasCollectionIdsUpdate = Object.prototype.hasOwnProperty.call(updates, 'collectionIds');
  const notesValue = hasNotesUpdate ? updates.notes : undefined;
  const restUpdates = { ...updates } as Partial<Item>;
  if (hasNotesUpdate) delete restUpdates.notes;

  const next: Item = { ...item, ...restUpdates, updated_at: now };

  if (!Array.isArray(next.collectionIds) || next.collectionIds.length === 0) {
    next.collectionIds = [defaultCollectionId];
  }

  if (hasCollectionIdsUpdate || !item.placements || Object.keys(item.placements).length === 0) {
    const synced = syncItemPlacementsWithCollectionIds(
      { ...item, ...next },
      next.collectionIds,
      now
    );
    next.collectionIds = synced.collectionIds;
    next.placements = synced.placements;
  }

  if (hasNotesUpdate) {
    const multi =
      (next.collectionIds?.length ?? 0) > 1 || Object.keys(next.placements || {}).length > 1;

    let placementId = options?.notesPlacementCollectionId;
    if (!placementId && !multi) {
      placementId = next.collectionIds?.[0] || Object.keys(next.placements || {})[0];
    }
    if (!placementId && multi && updates.collectionIds?.length === 1) {
      const only = updates.collectionIds[0];
      if ((next.collectionIds || []).includes(only)) placementId = only;
    }

    if (placementId && (next.collectionIds || []).includes(placementId)) {
      const placements = { ...(next.placements || {}) };
      const previous = placements[placementId];
      placements[placementId] = {
        collectionId: placementId,
        addedAt: previous?.addedAt ?? now,
        source: previous?.source ?? 'manual',
        tags: previous?.tags,
        notes: notesValue || undefined,
      };
      next.placements = placements;
      next.notes = undefined;
    } else if (!multi && !placementId) {
      next.notes = notesValue || undefined;
    } else if (multi && !placementId) {
      next.notes = undefined;
    }
  }

  for (const key of ['pinnedAt', 'favoriteAt', 'deletedAt'] as const) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key] === undefined) {
      delete (next as unknown as Record<string, unknown>)[key];
    }
  }

  return next;
}
