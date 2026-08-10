/**
 * OPFS-backed SQLite — live runtime database in the DB worker.
 * Falls back to in-memory when OPFS is unavailable (missing COOP/COEP).
 */

import type { SqliteConnection, SqliteConfig, SqliteStorageMode } from './types';
import { DEFAULT_CONFIG } from './types';
import { normalizeSqliteFileBytes } from './folderPersistence';
import { resetConnectionInit } from './connectionProvider';
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

/** SAH pool handle — importDb persists a full sqlite file into OPFS. */
type SahPoolUtil = {
  OpfsSAHPoolDb?: new (filename: string) => Database;
  importDb?: (name: string, data: Uint8Array | ArrayBuffer) => number | Promise<number>;
};

type SqliteWithOpfsInstall = Sqlite3Static & {
  installOpfsSAHPoolVfs?: (opts: {
    name?: string;
    directory?: string;
    initialCapacity?: number;
  }) => Promise<SahPoolUtil>;
};

type SqliteCapiWithVfsCreate = Sqlite3Static['capi'] & {
  sqlite3_js_vfs_create_file?: (
    vfsName: string,
    name: string,
    data: Uint8Array | ArrayBuffer,
    dataLen: number
  ) => number;
};

let db: Database | null = null;
let storageMode: SqliteStorageMode = 'opfs';
let initPromise: Promise<SqliteConnection> | null = null;
/** Bumped on import/reset so in-flight OPFS opens cannot overwrite a imported DB. */
let openGeneration = 0;
let opfsDbCtor: (new (filename: string) => Database) | null = null;
let opfsDbUsesLeadingSlash = true;
let opfsInitPromise: Promise<(new (filename: string) => Database) | null> | null = null;
/** Kept so force-import / restore can overwrite the durable OPFS file (not just RAM). */
let sahPoolUtil: SahPoolUtil | null = null;

function bumpOpenGeneration(): void {
  openGeneration += 1;
}

function resolveLiveDb(): Database {
  if (!db) throw new Error('SQLite database is not open');
  return db;
}

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

function databaseHasDomainData(database: Database): boolean {
  try {
    const count = (sql: string) => {
      const rows = database.exec({
        sql,
        returnValue: 'resultRows',
        rowMode: 'object',
      }) as { c: number }[];
      return rows[0]?.c ?? 0;
    };
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

/** Resolve an OPFS-backed DB constructor (SAH pool first — works without SharedArrayBuffer). */
async function resolveOpfsDbConstructor(
  s3: Sqlite3Static,
  config: SqliteConfig = DEFAULT_CONFIG
): Promise<(new (filename: string) => Database) | null> {
  if (opfsDbCtor) return opfsDbCtor;
  if (opfsInitPromise) return opfsInitPromise;

  opfsInitPromise = (async () => {
    const install = (s3 as SqliteWithOpfsInstall).installOpfsSAHPoolVfs;
    if (typeof install === 'function') {
      try {
        const pool = await install({
          name: config.opfsVfsName ?? 'workbench-opfs',
          directory: config.opfsDirectory ?? '.workbench-opfs',
          initialCapacity: 8,
        });
        if (pool?.OpfsSAHPoolDb) {
          sahPoolUtil = pool as SahPoolUtil;
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
      sahPoolUtil = null;
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

function opfsOpenPath(config: SqliteConfig = DEFAULT_CONFIG): string {
  return opfsDbUsesLeadingSlash ? `/${config.dbName}` : config.dbName;
}

/** SAH importDb requires a leading slash even when open() does not. */
function opfsImportPath(config: SqliteConfig = DEFAULT_CONFIG): string {
  const open = opfsOpenPath(config);
  return open.startsWith('/') ? open : `/${open}`;
}

/**
 * Replace the durable OPFS sqlite file, then open it.
 * Critical for Restore: in-memory-only import is lost on reload, and startup
 * merge then unions the old OPFS library back (extras reappear).
 */
async function persistBytesToOpfsAndOpen(
  s3: Sqlite3Static,
  bytes: Uint8Array,
  config: SqliteConfig = DEFAULT_CONFIG
): Promise<{ database: Database; mode: SqliteStorageMode }> {
  const OpfsDbClass = await resolveOpfsDbConstructor(s3, config);
  if (!OpfsDbClass) {
    return { database: deserializeFromBytes(s3, bytes), mode: 'memory' };
  }

  const openPath = opfsOpenPath(config);
  const importPath = opfsImportPath(config);

  if (sahPoolUtil?.importDb) {
    const written = await Promise.resolve(sahPoolUtil.importDb(importPath, bytes));
    console.log('[SQLite] OPFS SAH importDb wrote', written, 'bytes to', importPath);
    const database = new OpfsDbClass(openPath);
    return { database, mode: 'opfs' };
  }

  // Classic OpfsDb: write VFS file then open (must not be open already — caller closed).
  const createFile = (s3.capi as SqliteCapiWithVfsCreate).sqlite3_js_vfs_create_file;
  if (typeof createFile === 'function') {
    createFile('opfs', importPath, bytes, bytes.byteLength);
    const database = new OpfsDbClass(openPath);
    console.log('[SQLite] OPFS vfs_create_file + open', importPath, bytes.byteLength);
    return { database, mode: 'opfs' };
  }

  // Last resort: open empty OPFS db and deserialize into it (still durable if VFS syncs).
  try {
    const database = new OpfsDbClass(
      opfsDbUsesLeadingSlash
        ? `file:${config.dbName}?delete-before-open=1`
        : openPath
    );
    const p = s3.wasm.allocFromTypedArray(bytes);
    const flags =
      s3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
    const dbPtr = database.pointer;
    if (dbPtr == null) throw new Error('OPFS db pointer unavailable');
    const rc = s3.capi.sqlite3_deserialize(
      dbPtr,
      'main',
      p,
      bytes.byteLength,
      bytes.byteLength,
      flags
    );
    s3.oo1.DB.checkRc(database, rc);
    console.log('[SQLite] OPFS deserialize-into-file', openPath, bytes.byteLength);
    return { database, mode: 'opfs' };
  } catch (e) {
    console.warn('[SQLite] Durable OPFS import failed, using memory:', e);
    return { database: deserializeFromBytes(s3, bytes), mode: 'memory' };
  }
}

async function openWorkerDatabase(config: SqliteConfig): Promise<{ database: Database; mode: SqliteStorageMode }> {
  const s3 = await initSqlite3();
  const OpfsDbClass = await resolveOpfsDbConstructor(s3, config);
  if (OpfsDbClass) {
    try {
      const path = opfsOpenPath(config);
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

/**
 * Open a caller-owned SQLite file. This is used from a separate worker, so it
 * deliberately does not touch the core DB singleton in this module.
 */
export async function openNamedOpfsDatabase(
  config: SqliteConfig
): Promise<{ database: Database; mode: SqliteStorageMode }> {
  return openWorkerDatabase(config);
}

/** Replace a caller-owned OPFS SQLite file from already validated bytes. */
export async function importNamedOpfsDatabaseBytes(
  bytes: Uint8Array,
  config: SqliteConfig
): Promise<{ database: Database; mode: SqliteStorageMode }> {
  const normalized = normalizeSqliteFileBytes(bytes);
  if (!normalized || normalized.byteLength < 16) {
    throw new Error(`Invalid sqlite bytes for ${config.dbName}`);
  }
  const s3 = await initSqlite3();
  await resolveOpfsDbConstructor(s3, config);
  return persistBytesToOpfsAndOpen(s3, normalized, config);
}

/** Export one caller-owned database without routing through the core connection. */
export async function exportNamedDatabaseBytes(database: Database): Promise<Uint8Array> {
  const s3 = await initSqlite3();
  return s3.capi.sqlite3_js_db_export(database);
}

function connectionFromCurrentDb(): SqliteConnection {
  return createConnectionFromDatabase(
    resolveLiveDb(),
    storageMode,
    () => {
      db = null;
      initPromise = null;
    },
    resolveLiveDb
  );
}

export async function openOpfsConnection(
  config: SqliteConfig = DEFAULT_CONFIG
): Promise<SqliteConnection> {
  if (initPromise) return initPromise;

  const gen = openGeneration;
  initPromise = (async () => {
    try {
      if (!db) {
        const opened = await openWorkerDatabase(config);
        if (gen !== openGeneration) {
          try {
            opened.database.close();
          } catch {
            // ignore stale OPFS open discarded after import
          }
          if (db) {
            return connectionFromCurrentDb();
          }
          initPromise = null;
          return openOpfsConnection(config);
        }
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
      const deadline = Date.now() + 3000;
      while (!db && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return connectionFromCurrentDb();
    } catch (e) {
      if (gen === openGeneration) {
        initPromise = null;
      }
      throw e;
    }
  })();

  return initPromise;
}

/**
 * Replace the live worker DB with folder/restore bytes.
 * Persists into OPFS when available so a page/extension reload does not revive
 * the previous OPFS library and undo a replace-restore via startup merge.
 */
export async function importFolderBytesIntoOpfs(bytes: Uint8Array): Promise<void> {
  bumpOpenGeneration();
  const s3 = await initSqlite3();
  const normalized = normalizeSqliteFileBytes(bytes);
  if (!normalized || normalized.byteLength < 16) {
    throw new Error('Invalid sqlite bytes for import');
  }

  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
  initPromise = null;
  resetConnectionInit();
  resetTxnDepth();

  // Ensure SAH/Opfs constructors are resolved before persist.
  await resolveOpfsDbConstructor(s3, DEFAULT_CONFIG);
  const opened = await persistBytesToOpfsAndOpen(s3, normalized, DEFAULT_CONFIG);
  db = opened.database;
  storageMode = opened.mode;
  if (storageMode === 'memory') {
    console.warn(
      '[SQLite] Import is memory-only — reload may re-merge older OPFS data; folder remains source of truth after restore'
    );
  }
  initSchema(db, DEFAULT_CONFIG.schemaVersion);
  ensureDefaultData(db);
  initPromise = Promise.resolve(connectionFromCurrentDb());
}

export async function exportOpfsDatabaseBytes(): Promise<Uint8Array> {
  if (db) {
    const s3 = await initSqlite3();
    return s3.capi.sqlite3_js_db_export(db);
  }
  const conn = await openOpfsConnection();
  return conn.exportDatabase();
}

export async function resetOpfsConnection(): Promise<void> {
  bumpOpenGeneration();
  if (db) {
    db.close();
    db = null;
  }
  initPromise = null;
  opfsDbCtor = null;
  opfsInitPromise = null;
  sahPoolUtil = null;
  opfsDbUsesLeadingSlash = true;
  resetTxnDepth();
  resetConnectionInit();
  storageMode = 'opfs';
}

export function getOpfsDatabaseSync(): Database | null {
  return db;
}

export async function workerDatabaseHasDomainData(): Promise<boolean> {
  const live = getOpfsDatabaseSync();
  if (!live) return false;
  return databaseHasDomainData(live);
}

export function workerDatabaseHasDomainDataSync(): boolean {
  const live = getOpfsDatabaseSync();
  if (!live) return false;
  return databaseHasDomainData(live);
}
