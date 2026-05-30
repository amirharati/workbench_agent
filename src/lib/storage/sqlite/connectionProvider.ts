/**
 * Pluggable SQLite connection backend (OPFS worker vs legacy folder deserialize).
 */

import type { SqliteConnection } from './types';

export type StorageBackend = 'folder' | 'opfs';

let backend: StorageBackend = 'folder';
let initPromise: Promise<SqliteConnection> | null = null;

export function setStorageBackend(next: StorageBackend): void {
  backend = next;
  initPromise = null;
}

export function getStorageBackend(): StorageBackend {
  return backend;
}

export function resetConnectionInit(): void {
  initPromise = null;
}

export async function resolveConnection(): Promise<SqliteConnection> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (backend === 'opfs') {
      const { openOpfsConnection } = await import('./connectionOpfs');
      return openOpfsConnection();
    }
    const { openFolderConnection } = await import('./connectionFolder');
    return openFolderConnection();
  })();

  return initPromise;
}
