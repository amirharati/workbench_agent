/**
 * Live database persistence in the user-chosen backup folder.
 *
 * The canonical runtime copy is `{folder}/workbench.sqlite` (not browser
 * localStorage). A tiny `workbench.meta.json` sidecar carries revision /
 * deviceId for conflict detection without rewriting full JSON on every edit.
 *
 * Occasional snapshots (manual-*.sqlite / manual-*.json) are handled by
 * BackupCoordinator + ManualFolderBackupSink — not on every mutation.
 */

import { wrapExport } from '../../backupEnvelope';
import {
  WORKBENCH_DB_FILE,
  WORKBENCH_META_FILE,
  LEGACY_LATEST_SQLITE,
  hasWritableBackupFolder,
  readBinaryFromBackupFolder,
  writeBinaryAtomicallyToBackupFolder,
  writeJsonAtomicallyToBackupFolder,
} from '../../backupFolder';
import { revisionTracker } from '../../revisionTracker';

const FLUSH_DEBOUNCE_MS = 800;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;

/** Read canonical or legacy sqlite bytes from the backup folder. */
export async function readLiveDatabaseBytes(): Promise<Uint8Array | null> {
  const primary = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  if (primary.ok && primary.data && primary.data.byteLength > 16) {
    return primary.data;
  }
  const legacy = await readBinaryFromBackupFolder(LEGACY_LATEST_SQLITE);
  if (legacy.ok && legacy.data && legacy.data.byteLength > 16) {
    return legacy.data;
  }
  return null;
}

/** Force rollback journal mode in header so deserialize works (WAL bytes break import). */
export function normalizeSqliteFileBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  if (copy.byteLength >= 20) {
    copy[18] = 0x01;
    copy[19] = 0x01;
  }
  return copy;
}

export async function flushLiveDatabaseToFolder(): Promise<{ ok: boolean; error?: string }> {
  if (!(await hasWritableBackupFolder())) {
    return { ok: false, error: 'No backup folder configured' };
  }

  try {
    const { getConnection } = await import('./connection');
    const conn = await getConnection();
    const bytes = await conn.exportDatabase();
    if (!bytes || bytes.byteLength < 16) {
      return { ok: false, error: 'Export produced empty database' };
    }

    const binRes = await writeBinaryAtomicallyToBackupFolder(WORKBENCH_DB_FILE, bytes);
    if (!binRes.ok) return binRes;

    await revisionTracker.load();
    const metaJson = wrapExport(
      JSON.stringify({ _liveMeta: true }),
      {
        revision: revisionTracker.getLocalRevisionSync(),
        deviceId: revisionTracker.getDeviceIdSync(),
        writerKind: 'live',
      }
    );
    const metaRes = await writeJsonAtomicallyToBackupFolder(WORKBENCH_META_FILE, metaJson);
    if (!metaRes.ok) {
      console.warn('[FolderDB] workbench.sqlite saved but meta write failed:', metaRes.error);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void runFlush();
  }, FLUSH_DEBOUNCE_MS);
}

async function runFlush(): Promise<void> {
  if (flushInFlight) {
    scheduleFlush();
    return;
  }
  if (!(await hasWritableBackupFolder())) return;
  flushInFlight = true;
  try {
    await flushLiveDatabaseToFolder();
  } catch (e) {
    console.error('[FolderDB] flush failed:', e);
  } finally {
    flushInFlight = false;
  }
}

/** @deprecated Mirror runs in DB worker (V2.1.1). */
export function startFolderLivePersistence(): void {
  // no-op
}

export async function flushLiveDatabaseNow(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { mirrorNow } = await import('../dbClient');
    return mirrorNow(true);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export { WORKBENCH_DB_FILE, WORKBENCH_META_FILE };
