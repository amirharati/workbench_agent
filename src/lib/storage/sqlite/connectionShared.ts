/**
 * Shared SQLite WASM helpers used by folder and OPFS connection backends.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import SCHEMA_SQL from '../schema/v1.sql?raw';
import type {
  SqliteConnection,
  SqliteStorageMode,
  TransactionContext,
  TransactionMode,
} from './types';
import { DEFAULT_CONFIG } from './types';
import { nowMs } from '../../time/clock';
import { INBOX_PROJECT_NAME, INCOMING_COLLECTION_NAME } from '../../systemDataModel';
import { PIPELINE_JOB_SCHEMA_SQL } from '../dbWorker/pipelineJobStore';

function runSchemaMigrations(database: Database, from: number, to: number): void {
  if (from < 3 && to >= 3) {
    try {
      database.exec('ALTER TABLE item_enrichment ADD COLUMN references_json TEXT;');
    } catch {
      /* column may already exist */
    }
  }
  if (from < 4 && to >= 4) {
    try {
      database.exec(`
        CREATE TABLE IF NOT EXISTS deleted_items (
          id TEXT PRIMARY KEY,
          purged_at INTEGER NOT NULL,
          reason TEXT
        );
      `);
      database.exec(
        'CREATE INDEX IF NOT EXISTS idx_deleted_items_purged ON deleted_items(purged_at);'
      );
    } catch {
      /* table may already exist */
    }
  }
  if (from < 5 && to >= 5) {
    database.exec(PIPELINE_JOB_SCHEMA_SQL);
  }
}

export type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>;
export type Database = InstanceType<Sqlite3Static['oo1']['DB']>;

let sqlite3: Sqlite3Static | null = null;
/** Nesting depth for withTransaction (outer BEGIN, inner SAVEPOINT). */
let txnDepth = 0;

export async function initSqlite3(): Promise<Sqlite3Static> {
  if (sqlite3) return sqlite3;
  console.log('[SQLite] Loading SQLite3 WASM module...');
  sqlite3 = await sqlite3InitModule();
  console.log(`[SQLite] Loaded SQLite3 version ${sqlite3.version.libVersion}`);
  return sqlite3;
}

export function resetTxnDepth(): void {
  txnDepth = 0;
}

export function deserializeFromBytes(s3: Sqlite3Static, bytes: Uint8Array): Database {
  const p = s3.wasm.allocFromTypedArray(bytes);
  const database = new s3.oo1.DB();
  const flags =
    s3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
  const dbPtr = database.pointer;
  if (dbPtr == null) {
    throw new Error('Database pointer unavailable for deserialize');
  }
  const rc = s3.capi.sqlite3_deserialize(
    dbPtr,
    'main',
    p,
    bytes.byteLength,
    bytes.byteLength,
    flags
  );
  s3.oo1.DB.checkRc(database, rc);
  return database;
}

export function initSchema(database: Database, schemaVersion: number): void {
  console.log('[SQLite] Initializing schema...');

  let currentVersion = 0;
  try {
    const result = database.exec({
      sql: 'PRAGMA user_version;',
      returnValue: 'resultRows',
    });
    currentVersion = (result[0]?.[0] as number) ?? 0;
  } catch {
    currentVersion = 0;
  }

  if (currentVersion >= schemaVersion) {
    console.log(`[SQLite] Schema up to date (version ${currentVersion})`);
    return;
  }

  console.log(`[SQLite] Upgrading schema from v${currentVersion} to v${schemaVersion}`);

  if (currentVersion === 0) {
    database.exec(SCHEMA_SQL);

    const metaCount = database.exec({
      sql: 'SELECT COUNT(*) FROM app_meta;',
      returnValue: 'resultRows',
    })[0]?.[0] as number;

    if (metaCount === 0) {
      const now = nowMs();
      const deviceId = crypto.randomUUID();
      database.exec({
        sql: `INSERT INTO app_meta (id, schema_version, created_at, device_id)
              VALUES ('default', ?, ?, ?);`,
        bind: [schemaVersion, now, deviceId],
      });
      database.exec({
        sql: `INSERT INTO sync_meta (id, local_revision, last_exported_at)
              VALUES ('default', 0, NULL);`,
      });
    }
  }

  runSchemaMigrations(database, currentVersion, schemaVersion);

  database.exec(`PRAGMA user_version = ${schemaVersion};`);
  database.exec({
    sql: `UPDATE app_meta SET schema_version = ? WHERE id = 'default';`,
    bind: [schemaVersion],
  });
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA synchronous = NORMAL;');
  database.exec('PRAGMA foreign_keys = ON;');
  console.log(`[SQLite] Schema initialized (version ${schemaVersion})`);
}

export function ensureDefaultData(database: Database): void {
  const now = nowMs();
  const projectCount = database.exec({
    sql: `SELECT COUNT(*) FROM projects WHERE id = 'project_default';`,
    returnValue: 'resultRows',
  })[0]?.[0] as number;

  if (projectCount === 0) {
    console.log('[SQLite] Creating Inbox and Incoming collection...');
    database.exec({
      sql: `INSERT INTO projects (id, name, is_default, created_at, updated_at)
            VALUES ('project_default', '${INBOX_PROJECT_NAME}', 1, ?, ?);`,
      bind: [now, now],
    });
    database.exec({
      sql: `INSERT INTO collections (id, name, color, is_default, created_at, updated_at, primary_project_id, project_ids)
            VALUES ('collection_project_default_unsorted', '${INCOMING_COLLECTION_NAME}', '#3b82f6', 1, ?, ?, 'project_default', '["project_default"]');`,
      bind: [now, now],
    });
  }
}

export function createConnectionFromDatabase(
  database: Database,
  storageMode: SqliteStorageMode,
  onClose?: () => void,
  resolveDatabase: () => Database = () => database
): SqliteConnection {
  const exec = (sql: string, bind?: unknown[]): void => {
    resolveDatabase().exec({ sql, bind: bind as Parameters<Database['exec']>[0]['bind'] });
  };

  const selectAll = <T>(sql: string, bind?: unknown[]): T[] => {
    const result = resolveDatabase().exec({
      sql,
      bind: bind as Parameters<Database['exec']>[0]['bind'],
      returnValue: 'resultRows',
      rowMode: 'object',
    });
    return result as T[];
  };

  const selectOne = <T>(sql: string, bind?: unknown[]): T | undefined => {
    const rows = selectAll<T>(sql, bind);
    return rows[0];
  };

  const transactionCtx: TransactionContext = {
    exec,
    selectAll,
    selectOne,
  };

  const withTransaction = <T>(
    fn: (ctx: TransactionContext) => T,
    _mode?: TransactionMode
  ): T => {
    const live = resolveDatabase();
    const savepoint = txnDepth > 0 ? `sp_${txnDepth}` : null;
    if (savepoint) {
      live.exec(`SAVEPOINT ${savepoint};`);
    } else {
      live.exec('BEGIN IMMEDIATE;');
    }
    txnDepth += 1;
    try {
      const result = fn(transactionCtx);
      txnDepth -= 1;
      if (savepoint) {
        live.exec(`RELEASE ${savepoint};`);
      } else {
        live.exec('COMMIT;');
      }
      return result;
    } catch (e) {
      txnDepth = Math.max(0, txnDepth - 1);
      try {
        if (savepoint) {
          live.exec(`ROLLBACK TO ${savepoint};`);
          live.exec(`RELEASE ${savepoint};`);
        } else {
          live.exec('ROLLBACK;');
        }
      } catch {
        // ignore rollback errors
      }
      throw e;
    }
  };

  const exportDatabase = async (): Promise<Uint8Array> => {
    const s3 = await initSqlite3();
    return s3.capi.sqlite3_js_db_export(resolveDatabase());
  };

  const importDatabase = async (_data: Uint8Array): Promise<void> => {
    console.warn('[SQLite] importDatabase not implemented for active connection');
  };

  return {
    isReady: () => true,
    getStorageMode: () => storageMode,
    exec,
    selectAll,
    selectOne,
    withTransaction,
    exportDatabase,
    importDatabase,
    close: () => {
      resolveDatabase().close();
      onClose?.();
    },
  };
}

export { DEFAULT_CONFIG };
