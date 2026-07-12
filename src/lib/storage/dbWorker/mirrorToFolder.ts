/**
 * Debounced folder mirror — worker schedules, offscreen writes bytes.
 */

import { revisionTracker } from '../../revisionTracker';
import { normalizeBinaryPayload } from '../../binaryPayload';

const DEBOUNCE_MS = 3000;
/** Min time between automatic folder writes (forced mirrorNow bypasses this). */
const MIN_INTERVAL_MS = 15_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastMirrorAt = 0;
let lastMirroredRevision = -1;
let lastMirrorError: string | null = null;
let mirrorInFlight = false;
let pendingForce = false;
let pendingAllowEmptyMirror = false;
/** When true, skip all mirrors (restore/replace must not be clobbered by stale OPFS export). */
let mirrorSuspended = false;
const mirrorWaiters: Array<(result: { ok: boolean; error?: string }) => void> = [];

export type MirrorExportFn = () => Promise<Uint8Array>;
export type MirrorWriteFn = (
  bytes: Uint8Array,
  revision: number
) => Promise<{ ok: boolean; error?: string }>;
export type MirrorFetchFolderFn = () => Promise<Uint8Array | null>;

let exportFn: MirrorExportFn | null = null;
let writeFn: MirrorWriteFn | null = null;
let getRevisionFn: (() => number) | null = null;
let fetchFolderFn: MirrorFetchFolderFn | null = null;

export function configureFolderMirror(opts: {
  exportDatabase: MirrorExportFn;
  writeToFolder: MirrorWriteFn;
  getRevision: () => number;
  fetchFolderBytes?: MirrorFetchFolderFn;
}): void {
  exportFn = opts.exportDatabase;
  writeFn = opts.writeToFolder;
  getRevisionFn = opts.getRevision;
  fetchFolderFn = opts.fetchFolderBytes ?? null;
}

function scheduleFolderMirrorAfter(delayMs: number): void {
  const delay = Math.max(0, Math.ceil(delayMs));
  if (debounceTimer != null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runFolderMirror(false, false);
  }, delay);
}

export function scheduleFolderMirror(): void {
  if (mirrorSuspended) return;
  scheduleFolderMirrorAfter(DEBOUNCE_MS);
}

/** Pause/resume automatic + forced mirrors during explicit restore/replace. */
export function setMirrorSuspended(suspended: boolean): void {
  mirrorSuspended = suspended;
  if (suspended && debounceTimer != null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (suspended) {
    pendingForce = false;
    pendingAllowEmptyMirror = false;
  }
}

export function isMirrorSuspended(): boolean {
  return mirrorSuspended;
}

/**
 * After a replace-restore, OPFS already matches folder live — do not mirror/rotate
 * until the next real edit (avoids wiping prev undo because sqlite export ≠ file bytes).
 */
export function markFolderMirrorCurrent(): void {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingForce = false;
  pendingAllowEmptyMirror = false;
  lastMirrorError = null;
  lastMirrorAt = Date.now();
  if (getRevisionFn) {
    lastMirroredRevision = getRevisionFn();
  }
}

function notifyMirrorWaiters(result: { ok: boolean; error?: string }): void {
  const waiters = mirrorWaiters.splice(0);
  for (const resolve of waiters) resolve(result);
}

export async function mirrorNow(
  force = false,
  opts?: { allowEmptyMirror?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (mirrorSuspended) {
    return { ok: false, error: 'Mirror suspended during restore' };
  }
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingForce = pendingForce || force;
  pendingAllowEmptyMirror = pendingAllowEmptyMirror || opts?.allowEmptyMirror === true;
  return runFolderMirror(force || pendingForce, opts?.allowEmptyMirror === true);
}

async function runFolderMirror(
  force: boolean,
  allowEmptyMirror = false
): Promise<{ ok: boolean; error?: string }> {
  if (mirrorSuspended) {
    return { ok: false, error: 'Mirror suspended during restore' };
  }
  if (!exportFn || !writeFn || !getRevisionFn) {
    return { ok: false, error: 'Mirror not configured' };
  }
  if (mirrorInFlight) {
    if (force) {
      pendingForce = true;
      pendingAllowEmptyMirror = pendingAllowEmptyMirror || allowEmptyMirror;
      return new Promise((resolve) => {
        mirrorWaiters.push(resolve);
      });
    }
    scheduleFolderMirror();
    return { ok: true };
  }

  // Tab bumps revision in meta kv; worker must re-read (separate JS heap).
  await revisionTracker.refreshFromStorage();
  const revision = revisionTracker.getLocalRevisionSync();
  if (!force && revision === lastMirroredRevision) {
    return { ok: true };
  }

  const now = Date.now();
  if (!force && now - lastMirrorAt < MIN_INTERVAL_MS) {
    const remaining = lastMirrorAt + MIN_INTERVAL_MS - now;
    scheduleFolderMirrorAfter(Math.max(DEBOUNCE_MS, remaining));
    return { ok: true };
  }

  mirrorInFlight = true;
  const useAllowEmpty = allowEmptyMirror || pendingAllowEmptyMirror;
  pendingForce = false;
  pendingAllowEmptyMirror = false;
  let result: { ok: boolean; error?: string } = { ok: true };
  try {
    // allowEmptyMirror only creates a NEW file — never clobbers an existing one.
    if (!useAllowEmpty) {
      const { getIdbCompatStore } = await import('../sqlite/store');
      const { fingerprintFromStore } = await import('../importFingerprint');
      const store = await getIdbCompatStore();
      const liveFp = fingerprintFromStore(store);
      if (liveFp.itemCount === 0) {
        result = {
          ok: false,
          error:
            'Refusing to mirror an empty library to workbench.sqlite. Link your backup folder or restore from a .sqlite backup in Settings.',
        };
        lastMirrorError = result.error ?? 'Refusing to mirror empty library';
        return result;
      }
    } else {
      // Even "create empty" must not run if workbench.sqlite already exists.
      try {
        const { readBinaryFromBackupFolder, WORKBENCH_DB_FILE } = await import('../../backupFolder');
        const existing = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
        if (existing.ok && existing.data && existing.data.byteLength > 16) {
          result = {
            ok: false,
            error:
              'Refusing allowEmptyMirror: workbench.sqlite already exists in the backup folder. Load from folder instead.',
          };
          lastMirrorError = result.error ?? null;
          return result;
        }
      } catch {
        /* if we cannot check, fall through — shrink guard still applies on write */
      }
    }

    // Merge folder → live before export (not a blind replace of folder with live-only).
    if (fetchFolderFn) {
      try {
        const folderBytes = await fetchFolderFn();
        if (folderBytes && folderBytes.byteLength >= 16) {
          const { getSqliteStore } = await import('../sqlite/store');
          const { mergeFolderBytesIntoLiveStore } = await import('../applyFolderMerge');
          const { workerDatabaseHasDomainDataSync } = await import('../sqlite/connectionOpfs');
          if (workerDatabaseHasDomainDataSync()) {
            const liveStore = await getSqliteStore();
            await mergeFolderBytesIntoLiveStore(folderBytes, liveStore);
          }
        }
      } catch (e) {
        console.warn('[mirror] pre-export merge skipped:', e);
      }
    }

    const raw = await exportFn();
    const bytes = normalizeBinaryPayload(raw);
    if (!bytes || bytes.byteLength < 16) {
      result = { ok: false, error: 'Export produced empty database' };
      lastMirrorError = result.error ?? 'Export produced empty database';
      return result;
    }
    const res = await writeFn(bytes, revision);
    if (res.ok) {
      lastMirrorAt = Date.now();
      lastMirroredRevision = revision;
      lastMirrorError = null;
      result = res;
    } else {
      lastMirrorError = res.error ?? 'Mirror write failed';
      result = res;
      if (revision !== lastMirroredRevision) {
        scheduleFolderMirrorAfter(DEBOUNCE_MS);
      }
    }
    return result;
  } catch (e) {
    lastMirrorError = String(e);
    result = { ok: false, error: String(e) };
    return result;
  } finally {
    mirrorInFlight = false;
    if (pendingForce) {
      const forcedAllowEmpty = pendingAllowEmptyMirror;
      pendingForce = false;
      pendingAllowEmptyMirror = false;
      const forced = await runFolderMirror(true, forcedAllowEmpty);
      notifyMirrorWaiters(forced);
    } else {
      notifyMirrorWaiters(result);
    }
  }
}

export function getMirrorStatus(): {
  lastMirrorAt: number;
  lastMirroredRevision: number;
  pending: boolean;
  lastMirrorError: string | null;
} {
  return {
    lastMirrorAt,
    lastMirroredRevision,
    pending: debounceTimer != null || mirrorInFlight || mirrorWaiters.length > 0,
    lastMirrorError,
  };
}
