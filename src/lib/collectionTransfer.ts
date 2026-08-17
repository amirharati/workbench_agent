import type { Item, ItemPlacement } from './db';
import {
  mergeImportedPlacementNotes,
  mergeImportedPlacementTags,
} from './import/xImportHygiene';

export interface CollectionTransferPatch {
  collectionIds: string[];
  placements?: Record<string, ItemPlacement>;
  changed: boolean;
}

/**
 * Build a lossless collection membership patch.
 *
 * Copy keeps the source placement contextual data at the source. Move carries
 * it to the destination; if the destination already exists, distinct notes
 * and tags are merged rather than overwritten.
 */
export function buildCollectionTransferPatch({
  item,
  targetCollectionId,
  sourceCollectionId,
  operation,
  now = Date.now(),
}: {
  item: Item;
  targetCollectionId: string;
  sourceCollectionId?: string;
  operation: 'copy' | 'move';
  now?: number;
}): CollectionTransferPatch {
  const previousIds = [...new Set(item.collectionIds ?? [])];
  const alreadyInTarget = previousIds.includes(targetCollectionId);
  if (operation === 'copy') {
    return {
      collectionIds: alreadyInTarget ? previousIds : [...previousIds, targetCollectionId],
      placements: item.placements,
      changed: !alreadyInTarget,
    };
  }

  if (!sourceCollectionId || sourceCollectionId === targetCollectionId) {
    return { collectionIds: previousIds, placements: item.placements, changed: false };
  }

  const nextIds = previousIds.filter((collectionId) => collectionId !== sourceCollectionId);
  if (!nextIds.includes(targetCollectionId)) nextIds.push(targetCollectionId);
  const placements = item.placements ? { ...item.placements } : undefined;
  if (placements) {
    const sourcePlacement = placements[sourceCollectionId];
    const targetPlacement = placements[targetCollectionId];
    delete placements[sourceCollectionId];
    if (sourcePlacement) {
      placements[targetCollectionId] = targetPlacement
        ? {
            ...targetPlacement,
            collectionId: targetCollectionId,
            notes: mergeImportedPlacementNotes(targetPlacement.notes, sourcePlacement.notes),
            tags: mergeImportedPlacementTags(targetPlacement.tags, sourcePlacement.tags),
          }
        : {
            ...sourcePlacement,
            collectionId: targetCollectionId,
            addedAt: now,
          };
    }
  }

  return {
    collectionIds: nextIds,
    placements,
    changed: previousIds.includes(sourceCollectionId) || !alreadyInTarget,
  };
}
