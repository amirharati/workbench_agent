/**
 * Remove legacy browser-side domain databases from pre–folder-live eras.
 *
 * Keeps `workbench-agent-meta` (folder handle + revision kv) and UI prefs.
 * Domain data must live only in `{backupFolder}/workbench.sqlite`.
 */

import { DEFAULT_CONFIG } from './sqlite/types';

/** IndexedDB name from the IDB-era app database (`db-idb-backup.ts`). */
export const LEGACY_DOMAIN_IDB_NAME = 'personal-tools-db';

export interface LegacyStoragePurgeReport {
  idbDeleted: boolean;
  localStorageKeysRemoved: string[];
  opfsRemoved: boolean;
}

function collectLegacySqliteLocalStorageKeys(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const dbName = DEFAULT_CONFIG.dbName;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key.includes(dbName) ||
      key.startsWith('sqlite3:') ||
      key.startsWith(`/${dbName}`)
    ) {
      keys.push(key);
    }
  }
  return keys;
}

async function deleteLegacyIndexedDb(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(LEGACY_DOMAIN_IDB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
      req.onblocked = () => {
        console.warn(
          `[Storage] Legacy IndexedDB "${LEGACY_DOMAIN_IDB_NAME}" delete blocked — close other extension tabs`
        );
        resolve();
      };
    });
    return true;
  } catch (e) {
    console.warn('[Storage] Could not remove legacy IndexedDB:', e);
    return false;
  }
}

async function deleteLegacyOpfsSqlite(): Promise<boolean> {
  if (typeof navigator.storage?.getDirectory !== 'function') return false;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(DEFAULT_CONFIG.dbName);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort purge of old local domain DB copies (IDB, kvvfs localStorage, OPFS). */
export async function purgeLegacyLocalDomainStorage(): Promise<LegacyStoragePurgeReport> {
  const localStorageKeysRemoved = collectLegacySqliteLocalStorageKeys();
  for (const key of localStorageKeysRemoved) {
    localStorage.removeItem(key);
  }

  const [idbDeleted, opfsRemoved] = await Promise.all([
    deleteLegacyIndexedDb(),
    deleteLegacyOpfsSqlite(),
  ]);

  if (idbDeleted || localStorageKeysRemoved.length > 0 || opfsRemoved) {
    console.log('[Storage] Purged legacy local domain storage', {
      idbDeleted,
      localStorageKeysRemoved: localStorageKeysRemoved.length,
      opfsRemoved,
    });
  }

  return { idbDeleted, localStorageKeysRemoved, opfsRemoved };
}
