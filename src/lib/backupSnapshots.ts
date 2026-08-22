/**
 * Auto-rotating folder snapshots: workbench.prev.sqlite, prev2, …
 * Rotates before live workbench.sqlite overwrite (see backupFolder write choke-point).
 */
import { kvGet, kvPut } from './metaDb';
import {
  WORKBENCH_DB_FILE,
  WORKBENCH_CONTENT_DB_FILE,
  deleteFileFromBackupFolder,
  getBackupDirectoryHandle,
  readBinaryFromBackupFolder,
  writeBinaryAtomicallyToBackupFolder,
  type WriteBinaryToFolderOpts,
  WORKBENCH_UNDO_RESTORE_FILE,
  RESTORE_INCOMING_TEMP,
  IMPORT_STAGING_FILE,
} from './backupFolder';
import { bytesEqual } from './storage/importFingerprint';

export const KV_SNAPSHOT_DEPTH = 'backup.snapshotDepth';
export const DEFAULT_SNAPSHOT_DEPTH = 2;
export const MIN_SNAPSHOT_DEPTH = 1;
export const MAX_SNAPSHOT_DEPTH = 5;

/** Minimum live bytes to treat as worth rotating (same order as mirror guards). */
const MIN_LIVE_BYTES_FOR_ROTATION = 16;

/** Private temps / staging — never show in Settings backup list. */
const HIDDEN_SQLITE_FILES = new Set([
  WORKBENCH_CONTENT_DB_FILE,
  IMPORT_STAGING_FILE,
  RESTORE_INCOMING_TEMP,
  'import-staging.sqlite',
]);

function isHiddenSqliteTemp(filename: string): boolean {
  if (HIDDEN_SQLITE_FILES.has(filename)) return true;
  if (filename.startsWith('.')) return true; // .workbench.* pipeline temps
  if (filename.endsWith('.tmp.sqlite') || filename.endsWith('.sqlite.tmp')) return true;
  return false;
}

/** Defensive copy so FileSystemWritableFileStream cannot detach our buffer. */
function copyBytes(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

export type AutoSnapshotInfo = {
  filename: string;
  slot: number;
  byteLength: number;
  mtime?: number;
};

/** Any restore-able sqlite sitting in the backup folder (shown in Settings). */
export type FolderSqliteBackupKind = 'live' | 'auto' | 'manual' | 'safety' | 'undo' | 'other';

export type FolderSqliteBackupInfo = {
  filename: string;
  kind: FolderSqliteBackupKind;
  /** Auto slot when kind === 'auto' */
  slot?: number;
  byteLength: number;
  mtime?: number;
};

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

export function classifyFolderSqliteBackup(filename: string): FolderSqliteBackupKind | null {
  if (!filename.toLowerCase().endsWith('.sqlite')) return null;
  if (isHiddenSqliteTemp(filename)) return null;
  if (filename === WORKBENCH_DB_FILE) return 'live';
  if (filename === WORKBENCH_UNDO_RESTORE_FILE) return 'undo';
  if (parseAutoSnapshotSlot(filename) != null) return 'auto';
  if (filename.startsWith('manual-')) return 'manual';
  if (filename.startsWith('safety-')) return 'safety';
  return 'other';
}

export function isRestorableFolderSqliteBackup(filename: string): boolean {
  const kind = classifyFolderSqliteBackup(filename);
  return kind === 'auto' || kind === 'manual' || kind === 'safety' || kind === 'undo' || kind === 'other';
}

/** Only explicit user-created SQLite snapshots may be deleted from Settings. */
export function isDeletableFolderSqliteBackup(filename: string): boolean {
  return classifyFolderSqliteBackup(filename) === 'manual';
}

export async function deleteManualFolderSqliteBackup(filename: string): Promise<{
  ok: boolean;
  deleted?: boolean;
  notFound?: boolean;
  error?: string;
}> {
  if (!isDeletableFolderSqliteBackup(filename)) {
    return { ok: false, error: 'Only manual Homebase snapshots can be deleted here' };
  }
  const result = await deleteFileFromBackupFolder(filename);
  if (!result.ok) return result;
  return {
    ok: true,
    deleted: !result.notFound,
    notFound: result.notFound,
  };
}

export function clampSnapshotDepth(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_SNAPSHOT_DEPTH;
  return Math.min(MAX_SNAPSHOT_DEPTH, Math.max(MIN_SNAPSHOT_DEPTH, Math.floor(v)));
}

/** Slot 1 → workbench.prev.sqlite; slot N≥2 → workbench.prevN.sqlite */
export function autoSnapshotFilename(slot: number): string {
  if (slot <= 1) return 'workbench.prev.sqlite';
  return `workbench.prev${slot}.sqlite`;
}

export function listAutoSnapshotFilenames(depth: number = DEFAULT_SNAPSHOT_DEPTH): string[] {
  const d = clampSnapshotDepth(depth);
  return Array.from({ length: d }, (_, i) => autoSnapshotFilename(i + 1));
}

export function parseAutoSnapshotSlot(filename: string): number | null {
  if (filename === 'workbench.prev.sqlite') return 1;
  const m = /^workbench\.prev(\d+)\.sqlite$/.exec(filename);
  if (!m) return null;
  const slot = Number(m[1]);
  if (!Number.isFinite(slot) || slot < 2 || slot > MAX_SNAPSHOT_DEPTH) return null;
  return slot;
}

export async function getSnapshotDepth(): Promise<number> {
  const stored = await kvGet<number>(KV_SNAPSHOT_DEPTH);
  return clampSnapshotDepth(stored ?? DEFAULT_SNAPSHOT_DEPTH);
}

export async function setSnapshotDepth(depth: number): Promise<number> {
  const next = clampSnapshotDepth(depth);
  await kvPut(KV_SNAPSHOT_DEPTH, next);
  return next;
}

async function ensureReadWrite(
  handle: FileSystemDirectoryHandle
): Promise<{ ok: boolean; error?: string }> {
  try {
    const query = await handle.queryPermission({ mode: 'readwrite' });
    if (query === 'granted') return { ok: true };
  } catch {
    /* request below */
  }
  try {
    const req = await handle.requestPermission({ mode: 'readwrite' });
    if (req !== 'granted') return { ok: false, error: 'Permission denied for backup folder' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not request backup folder permission' };
  }
}

async function readFileFromHandle(
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<{ ok: boolean; data?: Uint8Array; notFound?: boolean; error?: string; mtime?: number }> {
  try {
    const fileHandle = await handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return { ok: true, data: new Uint8Array(buffer), mtime: file.lastModified };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      return { ok: false, notFound: true };
    }
    return { ok: false, error: String(e) };
  }
}

/**
 * Pure rotation plan: which source filename copies into which dest (highest slot first).
 * Live is represented as WORKBENCH_DB_FILE → slot 1.
 */
export function buildRotationCopyPlan(depth: number): Array<{ from: string; to: string }> {
  const d = clampSnapshotDepth(depth);
  const plan: Array<{ from: string; to: string }> = [];
  for (let slot = d; slot >= 2; slot--) {
    plan.push({ from: autoSnapshotFilename(slot - 1), to: autoSnapshotFilename(slot) });
  }
  plan.push({ from: WORKBENCH_DB_FILE, to: autoSnapshotFilename(1) });
  return plan;
}

/**
 * Copy live → prev chain. No-op if live missing/tiny.
 * Call AFTER live-write guards pass and BEFORE replacing live bytes.
 */
export async function rotateAutoSnapshotsBeforeLiveWrite(
  handle: FileSystemDirectoryHandle,
  existingLiveBytes?: Uint8Array
): Promise<{ ok: boolean; rotated: boolean; error?: string }> {
  const liveBytes =
    existingLiveBytes ??
    (await readFileFromHandle(handle, WORKBENCH_DB_FILE)).data;

  if (!liveBytes || liveBytes.byteLength < MIN_LIVE_BYTES_FOR_ROTATION) {
    return { ok: true, rotated: false };
  }

  const depth = await getSnapshotDepth();
  const plan = buildRotationCopyPlan(depth);
  let anyOk = false;
  let lastError: string | undefined;

  for (const step of plan) {
    let source: Uint8Array | undefined;
    if (step.from === WORKBENCH_DB_FILE) {
      source = liveBytes;
    } else {
      const read = await readFileFromHandle(handle, step.from);
      if (read.notFound || !read.data || read.data.byteLength < MIN_LIVE_BYTES_FOR_ROTATION) {
        continue;
      }
      if (!read.ok) {
        lastError = read.error ?? `Could not read ${step.from}`;
        continue;
      }
      source = read.data;
    }

    // Fresh copy per write — never hand the same buffer to multiple FS writes.
    const write = await writeBinaryAtomicallyToBackupFolder(step.to, copyBytes(source), {
      allowWorkbenchShrink: true,
      skipAutoSnapshotRotation: true,
    } satisfies WriteBinaryToFolderOpts);
    if (!write.ok) {
      lastError = write.error ?? `Could not write ${step.to}`;
      console.warn('[backupSnapshots] rotation step failed:', step, lastError);
      continue;
    }
    anyOk = true;
  }

  // Soft success if at least live→prev worked; caller may still write live.
  if (!anyOk && lastError) {
    return { ok: false, rotated: false, error: lastError };
  }
  return { ok: true, rotated: anyOk };
}

export async function listAutoSnapshots(): Promise<{
  ok: boolean;
  snapshots?: AutoSnapshotInfo[];
  depth?: number;
  error?: string;
}> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWrite(handle);
  if (!perm.ok) return { ok: false, error: perm.error };

  const depth = await getSnapshotDepth();
  const names = listAutoSnapshotFilenames(depth);
  const snapshots: AutoSnapshotInfo[] = [];

  for (const filename of names) {
    const slot = parseAutoSnapshotSlot(filename);
    if (slot == null) continue;
    const read = await readFileFromHandle(handle, filename);
    if (!read.ok || !read.data || read.data.byteLength < MIN_LIVE_BYTES_FOR_ROTATION) continue;
    snapshots.push({
      filename,
      slot,
      byteLength: read.data.byteLength,
      mtime: read.mtime,
    });
  }

  snapshots.sort((a, b) => a.slot - b.slot);
  return { ok: true, snapshots, depth };
}

/**
 * List all sqlite backups in the linked folder (live, prev*, manual-*, safety-*).
 * Sorted: live first, then auto by slot, then others by mtime desc.
 */
export async function listFolderSqliteBackups(): Promise<{
  ok: boolean;
  backups?: FolderSqliteBackupInfo[];
  error?: string;
}> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWrite(handle);
  if (!perm.ok) return { ok: false, error: perm.error };

  const backups: FolderSqliteBackupInfo[] = [];
  try {
    for await (const [name, entry] of (handle as DirectoryWithEntries).entries()) {
      if (entry.kind !== 'file') continue;
      const kind = classifyFolderSqliteBackup(name);
      if (!kind) continue;
      try {
        const fileHandle = await handle.getFileHandle(name);
        const file = await fileHandle.getFile();
        if (file.size < MIN_LIVE_BYTES_FOR_ROTATION) continue;
        backups.push({
          filename: name,
          kind,
          slot: kind === 'auto' ? parseAutoSnapshotSlot(name) ?? undefined : undefined,
          byteLength: file.size,
          mtime: file.lastModified,
        });
      } catch {
        /* skip unreadable */
      }
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  const kindRank: Record<FolderSqliteBackupKind, number> = {
    live: 0,
    undo: 1,
    auto: 2,
    manual: 3,
    safety: 4,
    other: 5,
  };
  backups.sort((a, b) => {
    const kr = kindRank[a.kind] - kindRank[b.kind];
    if (kr !== 0) return kr;
    if (a.kind === 'auto' && b.kind === 'auto') return (a.slot ?? 0) - (b.slot ?? 0);
    return (b.mtime ?? 0) - (a.mtime ?? 0);
  });

  return { ok: true, backups };
}

/**
 * Rotate prev chain using in-memory sources only — never re-read a filename that
 * may be the restore source (e.g. restoring from prev would otherwise lose it when
 * live → prev overwrites that same file).
 */
async function rotateAutoSnapshotsWithSecuredSources(
  handle: FileSystemDirectoryHandle,
  liveBytes: Uint8Array,
  securedByFilename: Map<string, Uint8Array>
): Promise<{ ok: boolean; rotated: boolean; error?: string }> {
  if (liveBytes.byteLength < MIN_LIVE_BYTES_FOR_ROTATION) {
    return { ok: true, rotated: false };
  }

  const depth = await getSnapshotDepth();
  const plan = buildRotationCopyPlan(depth);
  let anyOk = false;
  let lastError: string | undefined;

  for (const step of plan) {
    let source: Uint8Array | undefined;
    if (step.from === WORKBENCH_DB_FILE) {
      source = liveBytes;
    } else if (securedByFilename.has(step.from)) {
      source = securedByFilename.get(step.from)!;
    } else {
      const read = await readFileFromHandle(handle, step.from);
      if (read.notFound || !read.data || read.data.byteLength < MIN_LIVE_BYTES_FOR_ROTATION) {
        continue;
      }
      if (!read.ok) {
        lastError = read.error ?? `Could not read ${step.from}`;
        continue;
      }
      source = read.data;
    }

    if (!source || source.byteLength < MIN_LIVE_BYTES_FOR_ROTATION) continue;

    const write = await writeBinaryAtomicallyToBackupFolder(step.to, copyBytes(source), {
      allowWorkbenchShrink: true,
      skipAutoSnapshotRotation: true,
    } satisfies WriteBinaryToFolderOpts);
    if (!write.ok) {
      lastError = write.error ?? `Could not write ${step.to}`;
      console.warn('[backupSnapshots] secured rotation step failed:', step, lastError);
      continue;
    }
    anyOk = true;
  }

  if (!anyOk && lastError) {
    return { ok: false, rotated: false, error: lastError };
  }
  return { ok: true, rotated: anyOk };
}

async function verifyFolderFileSize(
  handle: FileSystemDirectoryHandle,
  filename: string,
  expected: number
): Promise<{ ok: boolean; error?: string; actual?: number }> {
  try {
    const fh = await handle.getFileHandle(filename);
    const file = await fh.getFile();
    if (file.size !== expected) {
      return {
        ok: false,
        actual: file.size,
        error: `${filename} size mismatch: expected ${expected}, got ${file.size}`,
      };
    }
    return { ok: true, actual: file.size };
  } catch (e) {
    return { ok: false, error: `Could not verify ${filename}: ${String(e)}` };
  }
}

/**
 * Snapshot current live into rotation, copy any folder sqlite backup → live.
 *
 * Pipeline (never write onto the restore source mid-flight):
 * 1. Read source → memory copy
 * 2. Write private `.workbench.restore-incoming.sqlite` and verify size
 * 3. Undo slot + rotate using secured bytes when source is in the prev chain
 * 4. Write live from memory; verify size
 *
 * Returns the exact bytes so the caller can force-import from the incoming temp
 * (do not re-read live — a concurrent mirror can race).
 */
export async function restoreFolderSqliteBackup(
  filename: string
): Promise<{ ok: boolean; error?: string; bytes?: Uint8Array; incomingTemp?: string }> {
  if (filename === WORKBENCH_DB_FILE) {
    return { ok: false, error: 'That file is already the live database' };
  }
  if (!isRestorableFolderSqliteBackup(filename)) {
    return { ok: false, error: `Not a restorable backup: ${filename}` };
  }

  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWrite(handle);
  if (!perm.ok) return { ok: false, error: perm.error };

  const chosen = await readFileFromHandle(handle, filename);
  if (chosen.notFound || !chosen.data || chosen.data.byteLength < MIN_LIVE_BYTES_FOR_ROTATION) {
    return { ok: false, error: `Backup not found: ${filename}` };
  }
  if (!chosen.ok) {
    return { ok: false, error: chosen.error ?? `Could not read ${filename}` };
  }

  // Own the bytes forever — rotation may overwrite the source filename on disk.
  const securedIncoming = copyBytes(chosen.data);
  const expectedLen = securedIncoming.byteLength;

  // Stage 1: private incoming temp BEFORE touching prev / live.
  const stagedIncoming = await writeBinaryAtomicallyToBackupFolder(
    RESTORE_INCOMING_TEMP,
    copyBytes(securedIncoming),
    { allowWorkbenchShrink: true, skipAutoSnapshotRotation: true }
  );
  if (!stagedIncoming.ok) {
    return { ok: false, error: stagedIncoming.error ?? 'Could not secure restore bytes to temp' };
  }
  const incomingOk = await verifyFolderFileSize(handle, RESTORE_INCOMING_TEMP, expectedLen);
  if (!incomingOk.ok) {
    return { ok: false, error: incomingOk.error ?? 'Incoming temp size check failed' };
  }

  const live = await readFileFromHandle(handle, WORKBENCH_DB_FILE);
  const liveBytes =
    live.ok && live.data && live.data.byteLength >= MIN_LIVE_BYTES_FOR_ROTATION
      ? copyBytes(live.data)
      : null;

  if (liveBytes && !bytesEqual(liveBytes, securedIncoming)) {
    // Never overwrite the file we are restoring from (e.g. undo-restore → undo).
    if (filename !== WORKBENCH_UNDO_RESTORE_FILE) {
      const undo = await writeBinaryAtomicallyToBackupFolder(
        WORKBENCH_UNDO_RESTORE_FILE,
        copyBytes(liveBytes),
        { allowWorkbenchShrink: true, skipAutoSnapshotRotation: true }
      );
      if (!undo.ok) {
        console.warn('[backupSnapshots] could not write undo-restore copy:', undo.error);
      }
    }

    // Any restore source that sits in the rotation chain must use secured bytes.
    const secured = new Map<string, Uint8Array>();
    secured.set(filename, securedIncoming);
    const rot = await rotateAutoSnapshotsWithSecuredSources(handle, liveBytes, secured);
    if (!rot.ok) {
      return { ok: false, error: rot.error ?? 'Could not snapshot current live before restore' };
    }
  }

  const writeLive = await writeBinaryAtomicallyToBackupFolder(
    WORKBENCH_DB_FILE,
    copyBytes(securedIncoming),
    { allowWorkbenchShrink: true, skipAutoSnapshotRotation: true }
  );
  if (!writeLive.ok) {
    return { ok: false, error: writeLive.error ?? 'Could not write restored live database' };
  }
  const liveOk = await verifyFolderFileSize(handle, WORKBENCH_DB_FILE, expectedLen);
  if (!liveOk.ok) {
    return { ok: false, error: liveOk.error ?? 'Live size check failed after restore' };
  }

  // Re-confirm incoming temp still intact (rotation must not have touched it).
  const incomingStill = await verifyFolderFileSize(handle, RESTORE_INCOMING_TEMP, expectedLen);
  if (!incomingStill.ok) {
    return {
      ok: false,
      error: incomingStill.error ?? 'Incoming temp was altered during restore',
    };
  }

  return { ok: true, bytes: securedIncoming, incomingTemp: RESTORE_INCOMING_TEMP };
}

/**
 * Full replace restore: pause mirrors → secure source to private temp → write live
 * → force-import from that temp (never re-read the user-visible source after stage 1).
 */
export async function restoreFolderBackupIntoApp(
  filename: string
): Promise<{ ok: boolean; error?: string }> {
  const { dbRpc } = await import('./storage/dbClient');
  const { forceImportFromBackupFolderFile } = await import('./storage/dbClient/folderDbRpc');
  const { reloadDB } = await import('./db');

  await dbRpc('setMirrorSuspended', [true]);
  try {
    const res = await restoreFolderSqliteBackup(filename);
    if (!res.ok || !res.bytes || !res.incomingTemp) {
      return { ok: false, error: res.error ?? 'Restore failed' };
    }

    // Import from private incoming temp — exact secured bytes, not live / not source.
    const imported = await forceImportFromBackupFolderFile(res.incomingTemp);
    if (!imported?.imported) {
      return {
        ok: false,
        error: imported?.reason
          ? `Could not load restored database (${imported.reason})`
          : 'Could not load restored database into the app',
      };
    }

    await reloadDB();
    // Critical: do not mirror/rotate after replace — export bytes ≠ file and would
    // clobber the undo chain (prev / undo-restore).
    await dbRpc('markFolderMirrorCurrent', []);
    return { ok: true };
  } finally {
    try {
      await dbRpc('setMirrorSuspended', [false]);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Snapshot current live into rotation, copy chosen prev* → live.
 * Caller must reload OPFS (e.g. reloadFromFolderDatabase).
 */
export async function rollbackToAutoSnapshot(
  filename: string
): Promise<{ ok: boolean; error?: string }> {
  // Validate filename shape before touching storage (unit-testable without IndexedDB).
  const slot = parseAutoSnapshotSlot(filename);
  if (slot == null || slot > MAX_SNAPSHOT_DEPTH) {
    return { ok: false, error: `Not an auto snapshot: ${filename}` };
  }

  const depth = await getSnapshotDepth();
  const allowed = new Set(listAutoSnapshotFilenames(depth));
  if (!allowed.has(filename)) {
    return { ok: false, error: `Not an auto snapshot: ${filename}` };
  }

  return restoreFolderSqliteBackup(filename);
}

/** Re-export helper used by write path to skip no-op overwrites. */
export { bytesEqual };

/** Convenience: read live via public API (tests / callers without handle). */
export async function readLiveWorkbenchBytes(): Promise<Uint8Array | null> {
  const res = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  if (!res.ok || !res.data || res.data.byteLength < MIN_LIVE_BYTES_FOR_ROTATION) return null;
  return res.data;
}
