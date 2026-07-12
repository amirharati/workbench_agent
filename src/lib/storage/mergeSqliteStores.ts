/**
 * Item-level merge for folder (A) ↔ browser/live (B).
 * Higher updated_at wins; tie → folder (A). Missing ≠ deleted unless in deleted_items.
 */

export type EntityWithIdAndUpdatedAt = {
  id: string;
  updated_at: number;
};

export type DeletedItemRow = {
  id: string;
  purgedAt: number;
  reason?: string | null;
};

export type MergeEntityStats = {
  keptFromFolder: number;
  keptFromLive: number;
  conflictsFolderWins: number;
  conflictsLiveWins: number;
};

export function mergeDeletedItems(
  folder: DeletedItemRow[],
  live: DeletedItemRow[]
): DeletedItemRow[] {
  const map = new Map<string, DeletedItemRow>();
  for (const row of folder) {
    if (!row?.id) continue;
    map.set(row.id, { id: row.id, purgedAt: row.purgedAt ?? 0, reason: row.reason ?? null });
  }
  for (const row of live) {
    if (!row?.id) continue;
    const existing = map.get(row.id);
    if (!existing || (row.purgedAt ?? 0) > existing.purgedAt) {
      map.set(row.id, { id: row.id, purgedAt: row.purgedAt ?? 0, reason: row.reason ?? null });
    } else if ((row.purgedAt ?? 0) === existing.purgedAt) {
      // tie → folder (already in map)
    }
  }
  return Array.from(map.values());
}

/**
 * Union by id. Conflict: higher updated_at wins; equal → prefer folder (A).
 */
export function mergeByUpdatedAt<T extends EntityWithIdAndUpdatedAt>(
  folderRows: T[],
  liveRows: T[],
  getUpdatedAt: (row: T) => number = (row) => row.updated_at ?? 0
): { merged: T[]; stats: MergeEntityStats } {
  const stats: MergeEntityStats = {
    keptFromFolder: 0,
    keptFromLive: 0,
    conflictsFolderWins: 0,
    conflictsLiveWins: 0,
  };
  const map = new Map<string, { row: T; from: 'folder' | 'live' }>();

  for (const row of folderRows) {
    if (!row?.id) continue;
    map.set(row.id, { row, from: 'folder' });
  }
  for (const row of liveRows) {
    if (!row?.id) continue;
    const existing = map.get(row.id);
    if (!existing) {
      map.set(row.id, { row, from: 'live' });
      continue;
    }
    const a = getUpdatedAt(existing.row);
    const b = getUpdatedAt(row);
    if (b > a) {
      map.set(row.id, { row, from: 'live' });
      stats.conflictsLiveWins += 1;
    } else {
      // b < a → keep folder; b === a → prefer folder
      stats.conflictsFolderWins += 1;
    }
  }

  const merged: T[] = [];
  for (const { row, from } of map.values()) {
    merged.push(row);
    if (from === 'folder') stats.keptFromFolder += 1;
    else stats.keptFromLive += 1;
  }
  return { merged, stats };
}

/** Drop entity rows whose id is in the deleted registry. */
export function dropDeletedEntities<T extends { id: string }>(
  rows: T[],
  deletedIds: Iterable<string>
): T[] {
  const set = deletedIds instanceof Set ? deletedIds : new Set(deletedIds);
  if (set.size === 0) return rows;
  return rows.filter((row) => !set.has(row.id));
}

/** Satellite keyed by itemId (enrichment / signals). */
export function mergeByItemIdUpdatedAt<T extends { itemId: string }>(
  folderRows: T[],
  liveRows: T[],
  getUpdatedAt: (row: T) => number,
  deletedItemIds: Set<string>
): T[] {
  const map = new Map<string, T>();
  for (const row of folderRows) {
    if (!row?.itemId || deletedItemIds.has(row.itemId)) continue;
    map.set(row.itemId, row);
  }
  for (const row of liveRows) {
    if (!row?.itemId || deletedItemIds.has(row.itemId)) continue;
    const existing = map.get(row.itemId);
    if (!existing) {
      map.set(row.itemId, row);
      continue;
    }
    const a = getUpdatedAt(existing);
    const b = getUpdatedAt(row);
    if (b > a) map.set(row.itemId, row);
    // tie / older → keep folder
  }
  return Array.from(map.values());
}

export type MergeableLibrarySnapshot = {
  projects: EntityWithIdAndUpdatedAt[];
  collections: EntityWithIdAndUpdatedAt[];
  items: EntityWithIdAndUpdatedAt[];
  notes: EntityWithIdAndUpdatedAt[];
  workspaces: EntityWithIdAndUpdatedAt[];
  deletedItems: DeletedItemRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichment?: any[];
  categories?: EntityWithIdAndUpdatedAt[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  links?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signals?: any[];
};

export type MergedLibrarySnapshot = {
  projects: EntityWithIdAndUpdatedAt[];
  collections: EntityWithIdAndUpdatedAt[];
  items: EntityWithIdAndUpdatedAt[];
  notes: EntityWithIdAndUpdatedAt[];
  workspaces: EntityWithIdAndUpdatedAt[];
  deletedItems: DeletedItemRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichment: any[];
  categories: EntityWithIdAndUpdatedAt[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  links: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signals: any[];
  stats: {
    deletedCount: number;
    itemCount: number;
  };
};

/**
 * Merge folder (A) + live (B). Folder wins on updated_at ties.
 */
export function mergeLibrarySnapshots(
  folder: MergeableLibrarySnapshot,
  live: MergeableLibrarySnapshot
): MergedLibrarySnapshot {
  const deletedItems = mergeDeletedItems(folder.deletedItems ?? [], live.deletedItems ?? []);
  const deletedIds = new Set(deletedItems.map((d) => d.id));

  const projects = dropDeletedEntities(
    mergeByUpdatedAt(folder.projects ?? [], live.projects ?? []).merged,
    deletedIds
  );
  const collections = dropDeletedEntities(
    mergeByUpdatedAt(folder.collections ?? [], live.collections ?? []).merged,
    deletedIds
  );
  const items = dropDeletedEntities(
    mergeByUpdatedAt(folder.items ?? [], live.items ?? []).merged,
    deletedIds
  );
  const notes = dropDeletedEntities(
    mergeByUpdatedAt(folder.notes ?? [], live.notes ?? []).merged,
    deletedIds
  );
  const workspaces = dropDeletedEntities(
    mergeByUpdatedAt(folder.workspaces ?? [], live.workspaces ?? []).merged,
    deletedIds
  );

  const categories = mergeByUpdatedAt(folder.categories ?? [], live.categories ?? []).merged;

  const enrichment = mergeByItemIdUpdatedAt(
    folder.enrichment ?? [],
    live.enrichment ?? [],
    (r: { updated_at?: number }) => r.updated_at ?? 0,
    deletedIds
  );

  const signals = mergeByItemIdUpdatedAt(
    folder.signals ?? [],
    live.signals ?? [],
    (r: { lastProcessedAt?: number }) => r.lastProcessedAt ?? 0,
    deletedIds
  );

  const linkMap = new Map<string, { id: string; itemId: string; updated_at: number }>();
  for (const row of folder.links ?? []) {
    if (!row?.id || deletedIds.has(row.itemId)) continue;
    linkMap.set(row.id, row);
  }
  for (const row of live.links ?? []) {
    if (!row?.id || deletedIds.has(row.itemId)) continue;
    const existing = linkMap.get(row.id);
    if (!existing || (row.updated_at ?? 0) > (existing.updated_at ?? 0)) {
      linkMap.set(row.id, row);
    }
  }

  return {
    projects,
    collections,
    items,
    notes,
    workspaces,
    deletedItems,
    enrichment,
    categories,
    links: Array.from(linkMap.values()),
    signals,
    stats: {
      deletedCount: deletedItems.length,
      itemCount: items.length,
    },
  };
}
