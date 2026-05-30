/**
 * SQLite WASM connection facade.
 *
 * Tabs use the DB worker (OPFS) via RPC — they should not call getConnection().
 * Worker code uses resolveConnection() with backend = opfs.
 */

import type { SqliteConnection, SqliteConfig, SqliteStorageMode } from './types';
import { DEFAULT_CONFIG } from './types';
import { getStorageBackend, resolveConnection, resetConnectionInit } from './connectionProvider';
import {
  reloadFolderConnectionFromBytes,
  resetFolderConnection,
} from './connectionFolder';
import { resetOpfsConnection } from './connectionOpfs';

export async function getConnection(config: SqliteConfig = DEFAULT_CONFIG): Promise<SqliteConnection> {
  void config;
  return resolveConnection();
}

export function getConnectionSync(): SqliteConnection | null {
  return null;
}

export function getStorageMode(): SqliteStorageMode {
  const backend = getStorageBackend();
  if (backend === 'opfs') return 'opfs';
  return 'folder';
}

export async function reloadConnection(): Promise<SqliteConnection> {
  return reloadConnectionFromFolderBytes();
}

export async function reloadConnectionFromFolderBytes(): Promise<SqliteConnection> {
  resetConnectionInit();
  await resetFolderConnection();
  await resetOpfsConnection();
  return reloadFolderConnectionFromBytes();
}

export async function resetDatabase(): Promise<void> {
  resetConnectionInit();
  await resetFolderConnection();
  await resetOpfsConnection();
}

export { DEFAULT_CONFIG };
