/**
 * Folder-backed SQLite: deserialize workbench.sqlite from user backup folder.
 */

import {
  BackupFolderPermissionPausedError,
  BackupFolderRequiredError,
  getBackupDirectoryHandle,
  hasWritableBackupFolder,
} from '../../backupFolder';
import {
  normalizeSqliteFileBytes,
  readLiveDatabaseBytes,
} from './folderPersistence';
import type { SqliteConnection, SqliteConfig } from './types';
import { DEFAULT_CONFIG } from './types';
import {
  createConnectionFromDatabase,
  deserializeFromBytes,
  ensureDefaultData,
  initSchema,
  initSqlite3,
  resetTxnDepth,
  type Database,
} from './connectionShared';

let db: Database | null = null;

async function openFolderDatabase(config: SqliteConfig): Promise<Database> {
  const s3 = await initSqlite3();
  const dbPath = `/${config.dbName}`;

  if (!(await hasWritableBackupFolder())) {
    if (await getBackupDirectoryHandle()) {
      throw new BackupFolderPermissionPausedError();
    }
    throw new BackupFolderRequiredError();
  }

  const bytes = await readLiveDatabaseBytes();
  if (bytes) {
    const normalized = normalizeSqliteFileBytes(bytes);
    console.log('[SQLite] Opened live database from backup folder');
    return deserializeFromBytes(s3, normalized);
  }

  console.log('[SQLite] New database — live copy will be workbench.sqlite in backup folder');
  return new s3.oo1.DB(dbPath, 'ct');
}

export async function openFolderConnection(
  config: SqliteConfig = DEFAULT_CONFIG
): Promise<SqliteConnection> {
  if (!db) {
    db = await openFolderDatabase(config);
    initSchema(db, config.schemaVersion);
    ensureDefaultData(db);
  }
  return createConnectionFromDatabase(db, 'folder', () => {
    db = null;
  });
}

export async function reloadFolderConnectionFromBytes(): Promise<SqliteConnection> {
  if (!(await hasWritableBackupFolder())) {
    if (await getBackupDirectoryHandle()) {
      throw new BackupFolderPermissionPausedError();
    }
    throw new BackupFolderRequiredError();
  }
  const bytes = await readLiveDatabaseBytes();
  if (!bytes) {
    return openFolderConnection();
  }
  const s3 = await initSqlite3();
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
  resetTxnDepth();
  db = deserializeFromBytes(s3, normalizeSqliteFileBytes(bytes));
  initSchema(db, DEFAULT_CONFIG.schemaVersion);
  ensureDefaultData(db);
  return createConnectionFromDatabase(db, 'folder', () => {
    db = null;
  });
}

export async function resetFolderConnection(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  resetTxnDepth();
}
