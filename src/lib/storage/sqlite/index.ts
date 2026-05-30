/**
 * SQLite WASM Storage Layer
 *
 * Runtime DB is deserialized from `{backupFolder}/workbench.sqlite`.
 */

export {
  getConnection,
  getConnectionSync,
  resetDatabase,
  getStorageMode,
  reloadConnection,
  reloadConnectionFromFolderBytes,
} from './connection';
export {
  startFolderLivePersistence,
  flushLiveDatabaseNow,
  flushLiveDatabaseToFolder,
  readLiveDatabaseBytes,
  WORKBENCH_DB_FILE,
  WORKBENCH_META_FILE,
} from './folderPersistence';
export type { SqliteStorageMode } from './types';
export { 
  getSqliteStore, 
  getSqliteStoreSync, 
  getIdbCompatStore,
  getIdbCompatStoreSync,
  SqliteStore,
  IdbCompatStore,
} from './store';
export type { SqliteConnection, SqliteConfig, TransactionContext } from './types';
export { purgeLegacyLocalDomainStorage, LEGACY_DOMAIN_IDB_NAME } from '../legacyStorageCleanup';
export type { LegacyStoragePurgeReport } from '../legacyStorageCleanup';
