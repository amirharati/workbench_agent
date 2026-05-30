/**
 * OPFS-backed SQLite — live runtime database in the DB worker.
 * Falls back to in-memory when OPFS is unavailable (missing COOP/COEP).
 */

import type { SqliteConnection, SqliteConfig, SqliteStorageMode } from './types';
import { DEFAULT_CONFIG } from './types';
import { normalizeSqliteFileBytes } from './folderPersistence';
import {
  createConnectionFromDatabase,
  deserializeFromBytes,
  ensureDefaultData,
  initSchema,
  initSqlite3,
  resetTxnDepth,
  type Database,
  type Sqlite3Static,
} from './connectionShared';

let db: Database | null = null;
let storageMode: SqliteStorageMode = 'opfs';
let initPromise: Promise<SqliteConnection> | null = null;
let opfsDbCtor: (new (filename: string) => Database) | null = null;
let opfsDbUsesLeadingSlash = true;
let opfsInitPromise: Promise<(new (filename: string) => Database) | null> | null = null;

type SqliteWithOpfsInstall = Sqlite3Static & {
  installOpfsSAHPoolVfs?: (opts: {
    name?: string;
    directory?: string;
    initialCapacity?: number;
  }) => Promise<{ OpfsSAHPoolDb?: new (filename: string) => Database }>;
};

function isDatabaseEmpty(database: Database): boolean {
  try {
    const rows = database.exec({
      sql: 'SELECT COUNT(*) AS c FROM sqlite_master WHERE type = ? AND name NOT LIKE ?;',
      bind: ['table', 'sqlite_%'],
      returnValue: 'resultRows',
      rowMode: 'object',
    }) as { c: number }[];
    return (rows[0]?.c ?? 0) === 0;
  } catch {
    return true;
  }
}

/** Resolve an OPFS-backed DB constructor (SAH pool first — works without SharedArrayBuffer). */
async function resolveOpfsDbConstructor(
  s3: Sqlite3Static
): Promise<(new (filename: string) => Database) | null> {
  if (opfsDbCtor) return opfsDbCtor;
  if (opfsInitPromise) return opfsInitPromise;

  opfsInitPromise = (async () => {
    const install = (s3 as SqliteWithOpfsInstall).installOpfsSAHPoolVfs;
    if (typeof install === 'function') {
      try {
        const pool = await install({
          name: 'workbench-opfs',
          directory: '.workbench-opfs',
          initialCapacity: 8,
        });
        if (pool?.OpfsSAHPoolDb) {
          opfsDbCtor = pool.OpfsSAHPoolDb;
          opfsDbUsesLeadingSlash = false;
          console.log('[SQLite] OPFS SAH pool VFS ready');
          return opfsDbCtor;
        }
      } catch (e) {
        console.warn('[SQLite] installOpfsSAHPoolVfs failed:', e);
      }
    }

    if (s3.oo1?.OpfsDb) {
      opfsDbCtor = s3.oo1.OpfsDb as new (filename: string) => Database;
      opfsDbUsesLeadingSlash = true;
      console.log('[SQLite] OPFS VFS (OpfsDb) available');
      return opfsDbCtor;
    }

    console.warn(
      '[SQLite] OPFS unavailable in this worker context. Using in-memory DB; folder mirror remains canonical.'
    );
    return null;
  })();

  return opfsInitPromise;
}

async function openWorkerDatabase(config: SqliteConfig): Promise<{ database: Database; mode: SqliteStorageMode }> {
  const s3 = await initSqlite3();
  const OpfsDbClass = await resolveOpfsDbConstructor(s3);
  if (OpfsDbClass) {
    try {
      const path = opfsDbUsesLeadingSlash ? `/${config.dbName}` : config.dbName;
      const database = new OpfsDbClass(path);
      console.log('[SQLite] Opened OPFS database at', database.filename);
      return { database, mode: 'opfs' };
    } catch (e) {
      console.warn('[SQLite] OpfsDb open failed, falling back to in-memory:', e);
    }
  }
  const database = new s3.oo1.DB(':memory:', 'c');
  return { database, mode: 'memory' };
}

export async function openOpfsConnection(
  config: SqliteConfig = DEFAULT_CONFIG
): Promise<SqliteConnection> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!db) {
        const opened = await openWorkerDatabase(config);
        db = opened.database;
        storageMode = opened.mode;
        if (isDatabaseEmpty(db)) {
          initSchema(db, config.schemaVersion);
          ensureDefaultData(db);
        } else {
          initSchema(db, config.schemaVersion);
          ensureDefaultData(db);
        }
      }
      return createConnectionFromDatabase(db, storageMode, () => {
        db = null;
        initPromise = null;
      });
    } catch (e) {
      initPromise = null;
      throw e;
    }
  })();

  return initPromise;
}

/** Import folder bytes into the worker DB (deserialize — works without OPFS). */
export async function importFolderBytesIntoOpfs(bytes: Uint8Array): Promise<void> {
  const s3 = await initSqlite3();
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
  initPromise = null;
  resetTxnDepth();
  db = deserializeFromBytes(s3, normalizeSqliteFileBytes(bytes));
  storageMode = 'memory';
  initSchema(db, DEFAULT_CONFIG.schemaVersion);
  ensureDefaultData(db);
  initPromise = Promise.resolve(
    createConnectionFromDatabase(db, storageMode, () => {
      db = null;
      initPromise = null;
    })
  );
}

export async function exportOpfsDatabaseBytes(): Promise<Uint8Array> {
  const conn = await openOpfsConnection();
  return conn.exportDatabase();
}

export async function resetOpfsConnection(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  initPromise = null;
  opfsDbCtor = null;
  opfsInitPromise = null;
  opfsDbUsesLeadingSlash = true;
  resetTxnDepth();
  storageMode = 'opfs';
}

export function getOpfsDatabaseSync(): Database | null {
  return db;
}

export async function workerDatabaseHasDomainData(): Promise<boolean> {
  try {
    const conn = await openOpfsConnection();
    const count = (sql: string) =>
      conn.selectAll<{ c: number }>(sql)[0]?.c ?? 0;
    if (count('SELECT COUNT(*) AS c FROM items;') > 0) return true;
    if (count('SELECT COUNT(*) AS c FROM notes;') > 0) return true;
    if (count('SELECT COUNT(*) AS c FROM workspaces;') > 0) return true;
    if (count('SELECT COUNT(*) AS c FROM item_enrichment;') > 0) return true;
    if (count("SELECT COUNT(*) AS c FROM projects WHERE id != 'project_default';") > 0) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
