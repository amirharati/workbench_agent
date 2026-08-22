/**
 * Compare live DB content vs an incoming backup before destructive import.
 */

import {
  createConnectionFromDatabase,
  deserializeFromBytes,
  initSqlite3,
} from './sqlite/connectionShared';
import { normalizeSqliteFileBytes } from './sqlite/folderPersistence';
import { SqliteStore, type IdbCompatStore } from './sqlite/store';
import type { Item, Note } from '../db';

export type DbContentFingerprint = {
  maxUpdatedAt: number;
  itemCount: number;
  notesRowCount: number;
  itemsWithNotes: number;
};

/**
 * Read-only inventory used by the recovery inspector. This is deliberately a
 * compact summary, not a hydrated second library: it can be computed from an
 * isolated SQLite connection and sent safely back to the Settings page.
 */
export type DbSnapshotSummary = DbContentFingerprint & {
  projectCount: number;
  collectionCount: number;
  workspaceCount: number;
};

type SnapshotSummaryStore = Pick<
  IdbCompatStore,
  | 'getAllItems'
  | 'getAllNotes'
  | 'getAllProjects'
  | 'getAllCollections'
  | 'getAllWorkspaces'
>;

export function fingerprintFromStore(
  store: Pick<IdbCompatStore, 'getAllItems' | 'getAllNotes'>
): DbContentFingerprint {
  const items = store.getAllItems();
  const notes = store.getAllNotes();
  let maxUpdatedAt = 0;
  for (const item of items) {
    maxUpdatedAt = Math.max(maxUpdatedAt, item.updated_at ?? 0);
  }
  for (const note of notes) {
    maxUpdatedAt = Math.max(maxUpdatedAt, note.updated_at ?? 0);
  }
  const itemsWithNotes = items.filter((item) => {
    if (item.notes?.trim()) return true;
    return Object.values(item.placements || {}).some((p) => !!p.notes?.trim());
  }).length;
  return {
    maxUpdatedAt,
    itemCount: items.length,
    notesRowCount: notes.length,
    itemsWithNotes,
  };
}

/** Compute a safe, displayable inventory without modifying either database. */
export function snapshotSummaryFromStore(store: SnapshotSummaryStore): DbSnapshotSummary {
  return {
    ...fingerprintFromStore(store),
    projectCount: store.getAllProjects().length,
    collectionCount: store.getAllCollections().length,
    workspaceCount: store.getAllWorkspaces().length,
  };
}

export function fingerprintFromBackupData(data: unknown): DbContentFingerprint {
  const record = data as { items?: Item[]; notes?: Note[] } | null;
  const items = Array.isArray(record?.items) ? record.items : [];
  const notes = Array.isArray(record?.notes) ? record.notes : [];
  return fingerprintFromStore({
    getAllItems: () => items,
    getAllNotes: () => notes,
  });
}

/** Open bytes in an isolated in-memory SQLite database and return its inventory. */
export async function snapshotSummarySqliteBytes(bytes: Uint8Array): Promise<DbSnapshotSummary> {
  const s3 = await initSqlite3();
  const tempDb = deserializeFromBytes(s3, normalizeSqliteFileBytes(bytes));
  try {
    const conn = createConnectionFromDatabase(tempDb, 'memory');
    const store = new SqliteStore(conn);
    return snapshotSummaryFromStore(store);
  } finally {
    try {
      tempDb.close();
    } catch {
      // ignore
    }
  }
}

/** Legacy/import compatibility fingerprint derived from the same isolated read. */
export async function fingerprintSqliteBytes(bytes: Uint8Array): Promise<DbContentFingerprint> {
  return snapshotSummarySqliteBytes(bytes);
}

export function isLiveNewerThanBackup(
  live: DbContentFingerprint,
  incoming: DbContentFingerprint
): boolean {
  if (live.maxUpdatedAt > incoming.maxUpdatedAt) return true;
  if (live.itemCount > incoming.itemCount) return true;
  if (live.itemsWithNotes > incoming.itemsWithNotes) return true;
  if (live.notesRowCount > incoming.notesRowCount) return true;
  return false;
}

/** True when live and incoming backups describe the same library (for skip-reimport). */
export function fingerprintsEqual(a: DbContentFingerprint, b: DbContentFingerprint): boolean {
  return (
    a.maxUpdatedAt === b.maxUpdatedAt &&
    a.itemCount === b.itemCount &&
    a.notesRowCount === b.notesRowCount &&
    a.itemsWithNotes === b.itemsWithNotes
  );
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
