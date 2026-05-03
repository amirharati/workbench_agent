/**
 * Meta DB — small IndexedDB separate from the main app data DB.
 *
 * Owns:
 *   - `handles`: persisted FileSystemDirectoryHandle for the backup folder.
 *   - `kv`: free-form key/value store for backup metadata
 *           (deviceId, localRevision, lastSeenRemote, etc.).
 *
 * Why separate from `db.ts`:
 *   - We want backup metadata to survive even if the user (or a migration
 *     bug) clears the main DB. Keeping it in its own database limits
 *     blast-radius.
 *   - The main DB is the user's data; this one is the system's bookkeeping.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

const META_DB_NAME = 'workbench-agent-meta';
const META_DB_VERSION = 2;

interface WorkbenchMetaSchema extends DBSchema {
  handles: {
    key: string;
    value: FileSystemDirectoryHandle;
  };
  kv: {
    key: string;
    value: unknown;
  };
}

let metaDbPromise: Promise<IDBPDatabase<WorkbenchMetaSchema>> | null = null;

export function getMetaDB(): Promise<IDBPDatabase<WorkbenchMetaSchema>> {
  if (!metaDbPromise) {
    metaDbPromise = openDB<WorkbenchMetaSchema>(META_DB_NAME, META_DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1: handles store (introduced before this slice).
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('handles')) {
            db.createObjectStore('handles');
          }
        }
        // v2: kv store for backup envelope bookkeeping.
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('kv')) {
            db.createObjectStore('kv');
          }
        }
      },
    });
  }
  return metaDbPromise;
}

// --- kv helpers -------------------------------------------------------------

export async function kvGet<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getMetaDB();
  return (await db.get('kv', key)) as T | undefined;
}

export async function kvPut<T = unknown>(key: string, value: T): Promise<void> {
  const db = await getMetaDB();
  await db.put('kv', value as unknown, key);
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getMetaDB();
  await db.delete('kv', key);
}
