/**
 * Apply folder↔live row merge into the worker OPFS store.
 * Caller uses force-import when live is empty; this path assumes live has data.
 */
import {
  createConnectionFromDatabase,
  deserializeFromBytes,
  initSchema,
  initSqlite3,
} from './sqlite/connectionShared';
import { DEFAULT_CONFIG } from './sqlite/types';
import { normalizeSqliteFileBytes } from './sqlite/folderPersistence';
import { SqliteStore } from './sqlite/store';
import {
  mergeLibrarySnapshots,
  type MergeableLibrarySnapshot,
  type MergedLibrarySnapshot,
} from './mergeSqliteStores';
import { fingerprintFromStore, fingerprintsEqual } from './importFingerprint';
import type { DeletedItemEntry } from '../deletedItems';
import type { Item, Note, Project, Collection, Workspace } from '../db';
import type { ItemEnrichment } from '../enrichment/types';
import type { AiCategory, AiItemCategoryLink, AiItemSignal } from '../categorization/types';

function snapshotFromStore(store: SqliteStore): MergeableLibrarySnapshot {
  const deleted: DeletedItemEntry[] = store.getAllDeletedItems();
  return {
    projects: store.getAllProjects() as Project[],
    collections: store.getAllCollections() as Collection[],
    items: store.getAllItems() as Item[],
    notes: store.getAllNotes() as Note[],
    workspaces: store.getAllWorkspaces() as Workspace[],
    deletedItems: deleted.map((d) => ({
      id: d.id,
      purgedAt: d.purgedAt,
      reason: d.reason,
    })),
    enrichment: store.getAllEnrichment() as ItemEnrichment[],
    categories: store.getAllCategories() as AiCategory[],
    links: store.getAllLinks() as AiItemCategoryLink[],
    signals: store.getAllSignals() as AiItemSignal[],
  };
}

function applyMergedToStore(store: SqliteStore, merged: MergedLibrarySnapshot): void {
  store.withTransaction(() => {
    const mergedItemIds = new Set(merged.items.map((m) => m.id));
    const mergedNoteIds = new Set(merged.notes.map((m) => m.id));
    const mergedWsIds = new Set(merged.workspaces.map((m) => m.id));
    const mergedColIds = new Set(merged.collections.map((m) => m.id));
    const mergedProjIds = new Set(merged.projects.map((m) => m.id));
    const deletedIds = new Set(merged.deletedItems.map((d) => d.id));

    for (const item of store.getAllItems()) {
      if (!mergedItemIds.has(item.id)) store.deleteItem(item.id);
    }
    for (const note of store.getAllNotes()) {
      if (!mergedNoteIds.has(note.id)) store.deleteNote(note.id);
    }
    for (const ws of store.getAllWorkspaces()) {
      if (!mergedWsIds.has(ws.id)) store.deleteWorkspace(ws.id);
    }
    for (const col of store.getAllCollections()) {
      if (!mergedColIds.has(col.id)) store.deleteCollection(col.id);
    }
    for (const proj of store.getAllProjects()) {
      if (proj.id === 'project_default' || proj.isDefault) continue;
      if (!mergedProjIds.has(proj.id)) store.deleteProject(proj.id);
    }

    for (const row of merged.deletedItems) {
      store.putDeletedItem({
        id: row.id,
        purgedAt: row.purgedAt,
        reason: row.reason,
      });
    }
    for (const row of merged.projects) store.putProject(row as Project);
    for (const row of merged.collections) store.putCollection(row as Collection);
    for (const row of merged.items) store.putItem(row as Item);
    for (const row of merged.notes) store.putNote(row as Note);
    for (const row of merged.workspaces) store.putWorkspace(row as Workspace);
    for (const row of merged.categories) store.putCategory(row as AiCategory);
    for (const row of merged.enrichment) {
      store.putEnrichment(row as ItemEnrichment);
    }
    for (const row of merged.signals) {
      store.putSignal(row as AiItemSignal);
    }
    for (const row of merged.links) {
      store.putLink(row as AiItemCategoryLink);
    }

    for (const e of store.getAllEnrichment()) {
      if (deletedIds.has(e.itemId) || !mergedItemIds.has(e.itemId)) {
        store.deleteEnrichment(e.itemId);
      }
    }
    for (const s of store.getAllSignals()) {
      if (deletedIds.has(s.itemId) || !mergedItemIds.has(s.itemId)) {
        store.deleteSignal(s.itemId);
      }
    }
    for (const l of store.getAllLinks()) {
      if (deletedIds.has(l.itemId) || !mergedItemIds.has(l.itemId)) {
        store.deleteLink(l.id);
      }
    }
  });
}

export type MergeWithFolderResult = {
  merged: boolean;
  mode: 'merge' | 'unchanged' | 'empty';
  itemCount: number;
  reason?: string;
  /** Live OPFS is ahead of folder file — caller must mirror out to heal disk. */
  folderOutOfDate?: boolean;
};

/**
 * Merge folder DB bytes into the live SqliteStore (union + updated_at + deleted_items).
 */
export async function mergeFolderBytesIntoLiveStore(
  folderBytes: Uint8Array,
  liveStore: SqliteStore
): Promise<MergeWithFolderResult> {
  const normalized = normalizeSqliteFileBytes(folderBytes);
  if (!normalized || normalized.byteLength < 16) {
    return { merged: false, mode: 'empty', itemCount: 0, reason: 'empty' };
  }

  const s3 = await initSqlite3();
  const tempDb = deserializeFromBytes(s3, normalized);
  try {
    initSchema(tempDb, DEFAULT_CONFIG.schemaVersion);
    const folderConn = createConnectionFromDatabase(tempDb, 'memory');
    const folderStore = new SqliteStore(folderConn);
    const folderSnap = snapshotFromStore(folderStore);
    const liveSnap = snapshotFromStore(liveStore);
    const liveFp = fingerprintFromStore(liveStore);
    const folderFp = fingerprintFromStore(folderStore);

    const folderOutOfDate =
      liveFp.itemCount > folderFp.itemCount ||
      liveFp.maxUpdatedAt > folderFp.maxUpdatedAt ||
      liveFp.notesRowCount > folderFp.notesRowCount ||
      liveFp.itemsWithNotes > folderFp.itemsWithNotes;

    const merged = mergeLibrarySnapshots(folderSnap, liveSnap);

    if (fingerprintsEqual(liveFp, folderFp)) {
      const liveIds = new Set(liveSnap.items.map((i) => i.id));
      const mergedIds = new Set(merged.items.map((i) => i.id));
      const sameItems =
        liveIds.size === mergedIds.size && [...liveIds].every((id) => mergedIds.has(id));
      const sameDeletes = merged.deletedItems.length === liveSnap.deletedItems.length;
      if (sameItems && sameDeletes) {
        return {
          merged: false,
          mode: 'unchanged',
          itemCount: liveFp.itemCount,
          folderOutOfDate,
        };
      }
    }

    applyMergedToStore(liveStore, merged);
    const afterFp = fingerprintFromStore(liveStore);
    const stillOutOfDate =
      afterFp.itemCount > folderFp.itemCount ||
      afterFp.maxUpdatedAt > folderFp.maxUpdatedAt ||
      afterFp.notesRowCount > folderFp.notesRowCount ||
      afterFp.itemsWithNotes > folderFp.itemsWithNotes;
    return {
      merged: true,
      mode: 'merge',
      itemCount: merged.stats.itemCount,
      folderOutOfDate: stillOutOfDate || folderOutOfDate,
    };
  } finally {
    try {
      tempDb.close();
    } catch {
      /* ignore */
    }
  }
}
