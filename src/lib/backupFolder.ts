/**
 * Persisted backup folder — File System Access API integration.
 *
 * Stores the user-picked `FileSystemDirectoryHandle` in the shared meta DB
 * (see `metaDb.ts`) and provides safe read/write helpers used by the
 * BackupCoordinator and onboarding flow.
 *
 * This module is purposely transport-only. It does NOT know about envelopes,
 * revisions, or conflict resolution; those live in higher layers so the same
 * file system primitives can later be reused by other sinks/scripts.
 */
import { normalizeBinaryPayload } from './binaryPayload';
import {
  wouldMirrorLoseItems,
  wouldMirrorShrinkWorkbenchSqlite,
} from './folderMirrorGuard';
import { getMetaDB, kvGet, kvPut, kvDelete } from './metaDb';

const HANDLE_KEY = 'backup-directory';
/** Display name mirror in chrome.storage (handle.name can be awkward to read after reload). */
const FOLDER_NAME_KEY = 'backupFolderDisplayName';
/**
 * Sticky “user linked a folder” flag in chrome.storage.
 * Survives even if the IndexedDB handle entry is temporarily unreadable — used to
 * force a re-pick UI instead of silently running without a folder.
 */
const LINKED_FLAG_KEY = 'backupFolderLinked';
/** Same facts in meta IndexedDB kv — second copy if chrome.storage is flaky after crash. */
const META_LINKED_KEY = 'backup.folderLinked';
const META_NAME_KEY = 'backup.folderDisplayName';
/** Stable id so Chrome remembers the last picked directory in the picker UI. */
const DIRECTORY_PICKER_ID = 'homebase-backup-folder';

/** Canonical live database file in the user backup folder. */
export const WORKBENCH_DB_FILE = 'workbench.sqlite';
/** Staging file for Settings restore — written in tab, imported by offscreen (avoids 64MiB sendMessage). */
export const IMPORT_STAGING_FILE = 'import-staging.sqlite';
/** Single undo slot for last Settings restore (outside prev/prev2 rotation). */
export const WORKBENCH_UNDO_RESTORE_FILE = 'workbench.undo-restore.sqlite';
/**
 * Private restore pipeline temps (hidden from Settings list).
 * Incoming = secured copy of the file being restored — never overwrite the user-visible source mid-restore.
 */
export const RESTORE_INCOMING_TEMP = '.workbench.restore-incoming.sqlite';
/** Envelope sidecar for conflict detection (revision / deviceId only). */
export const WORKBENCH_META_FILE = 'workbench.meta.json';
/** Legacy filenames — read for migration only. */
export const LEGACY_LATEST_JSON = 'latest.json';
export const LEGACY_LATEST_SQLITE = 'latest.sqlite';

/** Thrown when the user has never picked a backup folder. */
export class BackupFolderRequiredError extends Error {
  constructor(
    message = 'Choose a backup folder before using Homebase. Your data lives in workbench.sqlite in that folder.'
  ) {
    super(message);
    this.name = 'BackupFolderRequiredError';
  }
}

/**
 * Linked folder exists but Chrome has paused read/write (typical after reload).
 * Not a “pick folder again” problem — quiet re-grant on user gesture resumes sync.
 * Callers must soft-fail (no user-facing reconnect toasts).
 */
export class BackupFolderPermissionPausedError extends Error {
  constructor(message = 'Backup folder sync paused until the next click') {
    super(message);
    this.name = 'BackupFolderPermissionPausedError';
  }
}

export function isBackupFolderPermissionPaused(error: unknown): boolean {
  if (
    error instanceof BackupFolderPermissionPausedError ||
    (error instanceof Error && error.name === 'BackupFolderPermissionPausedError')
  ) {
    return true;
  }
  // Legacy throw from older builds / callers that reused BackupFolderRequiredError.
  if (error instanceof Error) {
    return /Reconnect your backup folder|paused folder access|folder sync paused|permission paused/i.test(
      error.message
    );
  }
  return false;
}

/**
 * Fail fast only when the user has never picked a backup folder.
 * Live reads/writes use OPFS; folder write permission may be `prompt` after reload.
 */
export async function requireConfiguredBackupFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) {
    throw new BackupFolderRequiredError();
  }
  return handle;
}

/**
 * For ops that must write the folder (mirror, restore, pipeline artifacts).
 * Tries a silent re-grant first. If still paused, throws PermissionPausedError
 * (soft — do not toast as “reconnect / choose folder”).
 */
export async function requireWritableBackupFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) {
    throw new BackupFolderRequiredError();
  }
  if (await hasWritableBackupFolder()) {
    return handle;
  }
  const grant = await ensureReadWritePermission(handle);
  if (grant.ok) return handle;
  throw new BackupFolderPermissionPausedError();
}

// --- handle persistence -----------------------------------------------------

export async function getBackupDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const db = await getMetaDB();
    return (await db.get('handles', HANDLE_KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}

// --- sticky link meta (chrome.storage + meta IDB) -----------------------------

type BackupFolderLinkMeta = {
  linked: boolean;
  displayName: string | null;
};

/**
 * Persist “we have a backup folder” + display name in Chrome’s durable stores.
 * The FileSystemDirectoryHandle lives in meta IDB `handles`; these flags survive
 * even when permission is paused after reload/crash so we never forget the link.
 */
async function persistBackupFolderLinkMeta(meta: BackupFolderLinkMeta): Promise<void> {
  const name = meta.displayName?.trim() || null;
  try {
    const local = chrome?.storage?.local;
    if (local) {
      const payload: Record<string, unknown> = { [LINKED_FLAG_KEY]: meta.linked };
      if (meta.linked && name) payload[FOLDER_NAME_KEY] = name;
      if (!meta.linked) {
        await local.remove([FOLDER_NAME_KEY, LINKED_FLAG_KEY]);
      } else {
        await local.set(payload);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (!meta.linked) {
      await kvDelete(META_LINKED_KEY);
      await kvDelete(META_NAME_KEY);
    } else {
      await kvPut(META_LINKED_KEY, true);
      if (name) await kvPut(META_NAME_KEY, name);
    }
  } catch {
    /* ignore */
  }
}

async function readBackupFolderLinkMeta(): Promise<BackupFolderLinkMeta> {
  let linked = false;
  let displayName: string | null = null;
  try {
    const local = chrome?.storage?.local;
    if (local) {
      const r = await local.get([LINKED_FLAG_KEY, FOLDER_NAME_KEY]);
      if (r[LINKED_FLAG_KEY] === true) linked = true;
      if (typeof r[FOLDER_NAME_KEY] === 'string' && r[FOLDER_NAME_KEY].length > 0) {
        displayName = r[FOLDER_NAME_KEY];
        linked = true;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (!linked && (await kvGet<boolean>(META_LINKED_KEY)) === true) linked = true;
    if (!displayName) {
      const n = await kvGet<string>(META_NAME_KEY);
      if (typeof n === 'string' && n.length > 0) {
        displayName = n;
        linked = true;
      }
    }
  } catch {
    /* ignore */
  }
  return { linked, displayName };
}

export async function setBackupDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getMetaDB();
  await db.put('handles', handle, HANDLE_KEY);
  let name: string | null = null;
  try {
    name = handle.name || null;
  } catch {
    name = null;
  }
  await persistBackupFolderLinkMeta({ linked: true, displayName: name });
}

export async function clearBackupDirectoryHandle(): Promise<void> {
  try {
    const db = await getMetaDB();
    await db.delete('handles', HANDLE_KEY);
  } catch {
    /* ignore */
  }
  await persistBackupFolderLinkMeta({ linked: false, displayName: null });
}

/** True if a directory handle was previously persisted (permission may still be prompt). */
export async function hasConfiguredBackupFolder(): Promise<boolean> {
  return !!(await getBackupDirectoryHandle());
}

/**
 * True if the user has linked a folder before (handle and/or sticky chrome.storage / meta kv).
 * If the handle is missing but this is true, the app must block and ask them to pick again.
 */
export async function wasBackupFolderLinked(): Promise<boolean> {
  if (await hasConfiguredBackupFolder()) return true;
  const meta = await readBackupFolderLinkMeta();
  if (meta.linked) return true;
  try {
    const { getBackupFolderOnboarding } = await import('./backupOnboarding');
    return (await getBackupFolderOnboarding()) === 'done';
  } catch {
    return false;
  }
}

/** Persist sticky “folder was linked” evidence (safe to call whenever handle is present). */
export async function markBackupFolderLinkedFlag(): Promise<void> {
  const name = await getBackupFolderName().catch(() => null);
  await persistBackupFolderLinkMeta({ linked: true, displayName: name });
}

/**
 * Permission state for the persisted backup folder handle.
 * After reload Chrome often returns `prompt` even though the user already picked the folder.
 */
export async function getBackupFolderPermissionState(): Promise<
  'none' | 'granted' | 'prompt' | 'denied'
> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return 'none';
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted' || perm === 'denied' || perm === 'prompt') return perm;
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

/** True if a handle exists and still has read/write permission. */
export async function hasWritableBackupFolder(): Promise<boolean> {
  return (await getBackupFolderPermissionState()) === 'granted';
}

/**
 * Re-request read/write on the persisted handle (no folder picker).
 * Call on startup (best-effort — may succeed while a click that opened the
 * page still counts as user activation, or after "Allow on every visit") and
 * from an explicit button when Chrome returns `prompt`.
 */
export async function regrantBackupFolderPermission(): Promise<{ ok: boolean; error?: string }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  return ensureReadWritePermission(handle);
}

/**
 * Best-effort: reuse the already-selected folder without showing the picker.
 * Succeeds when permission is still granted, when Chrome persistent access
 * auto-approves requestPermission, or when a recent user gesture is still active.
 */
export async function tryReuseConfiguredBackupFolder(): Promise<{
  ok: boolean;
  reused: boolean;
  error?: string;
}> {
  if (!(await hasConfiguredBackupFolder())) {
    return { ok: false, reused: false, error: 'No backup folder configured' };
  }
  if (await hasWritableBackupFolder()) {
    return { ok: true, reused: true };
  }
  const grant = await regrantBackupFolderPermission();
  if (grant.ok) return { ok: true, reused: true };
  return { ok: false, reused: false, error: grant.error };
}

export async function getBackupFolderName(): Promise<string | null> {
  const handle = await getBackupDirectoryHandle();
  if (handle) {
    try {
      if (handle.name) {
        // Keep chrome.storage / meta kv in sync whenever we can read the handle.
        void persistBackupFolderLinkMeta({ linked: true, displayName: handle.name });
        return handle.name;
      }
    } catch {
      /* fall through to storage */
    }
  }
  const meta = await readBackupFolderLinkMeta();
  return meta.displayName;
}

// --- low-level read/write ---------------------------------------------------

/** Preserve useful DOMException details; String(DOMException) may be only "[object DOMException]". */
export function formatBackupFolderError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; message?: unknown };
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const message = typeof candidate.message === 'string' ? candidate.message.trim() : '';
    if (name && message) return `${name}: ${message}`;
    if (name) return name;
    if (message) return message;
  }
  return typeof error === 'string' ? error : String(error);
}

async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandle
): Promise<{ ok: boolean; error?: string }> {
  try {
    const query = await handle.queryPermission({ mode: 'readwrite' });
    if (query === 'granted') return { ok: true };
  } catch {
    // Continue and attempt requestPermission below.
  }

  try {
    // Same folder as before — never opens the directory picker.
    const req = await handle.requestPermission({ mode: 'readwrite' });
    if (req !== 'granted') return { ok: false, error: 'Permission denied for backup folder' };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Typical without a user gesture: SecurityError. Caller may retry on click.
    return {
      ok: false,
      error: msg.includes('User activation') || msg.includes('user gesture')
        ? 'Click Continue to reconnect your saved folder'
        : 'Could not request backup folder permission',
    };
  }
}

async function readBinaryWithHandle(
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<{ ok: boolean; data?: Uint8Array; error?: string; notFound?: boolean }> {
  try {
    const fileHandle = await handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return { ok: true, data: new Uint8Array(buffer) };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      return { ok: false, notFound: true };
    }
    return { ok: false, error: formatBackupFolderError(e) };
  }
}

async function readJsonWithHandle(
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<{ ok: boolean; json?: string; error?: string; notFound?: boolean }> {
  try {
    const fileHandle = await handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return { ok: true, json: text };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      return { ok: false, notFound: true };
    }
    return { ok: false, error: formatBackupFolderError(e) };
  }
}

async function writeJsonWithHandle(
  handle: FileSystemDirectoryHandle,
  filename: string,
  json: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatBackupFolderError(e) };
  }
}


async function writeBinaryWithHandle(
  handle: FileSystemDirectoryHandle,
  filename: string,
  data: Uint8Array | ArrayBuffer
): Promise<{ ok: boolean; error?: string }> {
  try {
    const bytes = normalizeBinaryPayload(data);
    if (!bytes || bytes.byteLength === 0) {
      return { ok: false, error: 'No binary data to write' };
    }
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    // Copy so FileSystemWritableFileStream gets a plain ArrayBuffer-backed view.
    await writable.write(new Uint8Array(bytes));
    await writable.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatBackupFolderError(e) };
  }
}

const ATOMIC_TEMP_SUFFIX = '.tmp';

async function removeEntryIfExists(
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<void> {
  try {
    await handle.removeEntry(filename, { recursive: false });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') return;
    throw e;
  }
}

/** Write to `filename.tmp` first, then swap into place (Slice C). */
async function replaceFileAtomically(
  handle: FileSystemDirectoryHandle,
  filename: string,
  writeTemp: (tmpFilename: string) => Promise<{ ok: boolean; error?: string }>,
  finalizeFromTemp: (
    tmpHandle: FileSystemFileHandle,
    tmpFilename: string
  ) => Promise<{ ok: boolean; error?: string }>
): Promise<{ ok: boolean; error?: string }> {
  const tmpFilename = `${filename}${ATOMIC_TEMP_SUFFIX}`;
  try {
    await removeEntryIfExists(handle, tmpFilename);
  } catch (e) {
    return { ok: false, error: formatBackupFolderError(e) };
  }

  const tmpRes = await writeTemp(tmpFilename);
  if (!tmpRes.ok) return tmpRes;

  try {
    const tmpHandle = await handle.getFileHandle(tmpFilename);
    let moveFailure: string | undefined;
    const moveFn = (tmpHandle as FileSystemFileHandle & { move?: (name: string) => Promise<void> })
      .move;
    if (typeof moveFn === 'function') {
      try {
        await removeEntryIfExists(handle, filename);
        await moveFn.call(tmpHandle, filename);
        return { ok: true };
      } catch (moveErr) {
        // Chrome move() can fail on some folders (sync/cloud locks). Fall back to
        // copy-over so live sync is not stuck with a leftover *.tmp.
        moveFailure = formatBackupFolderError(moveErr);
      }
    }

    // Re-open tmp in case move partially consumed the handle.
    let finalizeHandle = tmpHandle;
    try {
      finalizeHandle = await handle.getFileHandle(tmpFilename);
    } catch {
      // move may have succeeded despite throwing — verify final file
      try {
        await handle.getFileHandle(filename);
        return { ok: true };
      } catch {
        return { ok: false, error: `Atomic write failed for ${filename}` };
      }
    }

    const finalRes = await finalizeFromTemp(finalizeHandle, tmpFilename);
    if (!finalRes.ok) {
      const copyFailure = finalRes.error ?? 'unknown copy error';
      return {
        ok: false,
        error: moveFailure
          ? `Could not replace ${filename}: move failed (${moveFailure}); copy fallback failed (${copyFailure})`
          : copyFailure,
      };
    }
    try {
      await removeEntryIfExists(handle, tmpFilename);
    } catch {
      /* best-effort cleanup */
    }
    if (moveFailure) {
      console.debug(
        `[backupFolder] ${filename} replaced using copy fallback (${moveFailure})`
      );
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatBackupFolderError(e) };
  }
}

async function writeBinaryAtomicallyWithHandle(
  handle: FileSystemDirectoryHandle,
  filename: string,
  data: Uint8Array | ArrayBuffer
): Promise<{ ok: boolean; error?: string }> {
  return replaceFileAtomically(
    handle,
    filename,
    (tmpFilename) => writeBinaryWithHandle(handle, tmpFilename, data),
    async (tmpHandle, tmpFilename) => {
      const file = await tmpHandle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const res = await writeBinaryWithHandle(handle, filename, bytes);
      if (!res.ok) return res;
      try {
        await removeEntryIfExists(handle, tmpFilename);
      } catch {
        /* ignore */
      }
      return { ok: true };
    }
  );
}

async function writeJsonAtomicallyWithHandle(
  handle: FileSystemDirectoryHandle,
  filename: string,
  json: string
): Promise<{ ok: boolean; error?: string }> {
  return replaceFileAtomically(
    handle,
    filename,
    (tmpFilename) => writeJsonWithHandle(handle, tmpFilename, json),
    async (tmpHandle, tmpFilename) => {
      const text = await tmpHandle.getFile().then((f) => f.text());
      const res = await writeJsonWithHandle(handle, filename, text);
      if (!res.ok) return res;
      try {
        await removeEntryIfExists(handle, tmpFilename);
      } catch {
        /* ignore */
      }
      return { ok: true };
    }
  );
}

// --- public read/write ------------------------------------------------------

export async function writeJsonToBackupFolder(
  filename: string,
  json: string
): Promise<{ ok: boolean; error?: string }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return perm;
  return writeJsonWithHandle(handle, filename, json);
}

/**
 * Size + item-count clobber guard for live workbench.sqlite writes.
 * Item fingerprinting is best-effort (dynamic import) when sizes alone pass.
 */
async function refuseUnsafeWorkbenchOverwrite(
  existing: Uint8Array,
  incoming: Uint8Array
): Promise<string | null> {
  let counts: { existingItemCount: number; incomingItemCount: number } | undefined;
  try {
    const { fingerprintSqliteBytes } = await import('./storage/importFingerprint');
    const [existingFp, incomingFp] = await Promise.all([
      fingerprintSqliteBytes(existing),
      fingerprintSqliteBytes(incoming),
    ]);
    counts = {
      existingItemCount: existingFp.itemCount,
      incomingItemCount: incomingFp.itemCount,
    };
    const lost = wouldMirrorLoseItems(counts.existingItemCount, counts.incomingItemCount);
    if (lost) return lost;
  } catch (e) {
    console.warn('[backupFolder] item-count guard skipped:', e);
  }
  return wouldMirrorShrinkWorkbenchSqlite(existing, incoming, counts);
}

/** Options for binary folder writes. */
export type WriteBinaryToFolderOpts = {
  /** Only for explicit user actions (e.g. conflict: keep local). Skips shrink guard on workbench.sqlite. */
  allowWorkbenchShrink?: boolean;
  /** Skip prev/prev2 rotation (rollback already rotated, or writing a snapshot slot). */
  skipAutoSnapshotRotation?: boolean;
};

/**
 * Write binary data to the configured backup folder.
 * Used for SQLite database backups.
 */
export async function writeBinaryToBackupFolder(
  filename: string,
  data: Uint8Array | ArrayBuffer,
  opts?: WriteBinaryToFolderOpts
): Promise<{ ok: boolean; error?: string }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return perm;

  const payload = normalizeBinaryPayload(data);
  if (
    filename === WORKBENCH_DB_FILE &&
    payload &&
    payload.byteLength >= 16 &&
    !opts?.allowWorkbenchShrink
  ) {
    const existing = await readBinaryWithHandle(handle, filename);
    if (existing.ok && existing.data && existing.data.byteLength > 16) {
      const blocked = await refuseUnsafeWorkbenchOverwrite(existing.data, payload);
      if (blocked) {
        console.error('[backupFolder] blocked live write:', blocked);
        return { ok: false, error: blocked };
      }
    }
  }

  return writeBinaryWithHandle(handle, filename, data);
}

/** Atomic replace — used for live mirror and manual sqlite snapshots. */
export async function writeBinaryAtomicallyToBackupFolder(
  filename: string,
  data: Uint8Array | ArrayBuffer,
  opts?: WriteBinaryToFolderOpts
): Promise<{ ok: boolean; error?: string }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return perm;

  const payload = normalizeBinaryPayload(data);
  if (filename === WORKBENCH_DB_FILE && payload && payload.byteLength >= 16) {
    const existing = await readBinaryWithHandle(handle, filename);
    if (existing.ok && existing.data && existing.data.byteLength > 16) {
      if (!opts?.allowWorkbenchShrink) {
        const blocked = await refuseUnsafeWorkbenchOverwrite(existing.data, payload);
        if (blocked) {
          console.error('[backupFolder] blocked live write:', blocked);
          return { ok: false, error: blocked };
        }
      }
      // No-op write: skip rotation and replace.
      const { bytesEqual } = await import('./storage/importFingerprint');
      if (bytesEqual(existing.data, payload)) {
        return { ok: true };
      }
      if (!opts?.skipAutoSnapshotRotation) {
        const { rotateAutoSnapshotsBeforeLiveWrite } = await import('./backupSnapshots');
        const rot = await rotateAutoSnapshotsBeforeLiveWrite(handle, existing.data);
        if (!rot.ok) {
          // Snapshots are best-effort. Never block healing OPFS → folder live sync
          // (e.g. after Finder replace left an older workbench.sqlite on disk).
          console.error(
            '[backupFolder] snapshot rotation failed (continuing live write):',
            rot.error
          );
        }
      }
    }
  }

  return writeBinaryAtomicallyWithHandle(handle, filename, payload ?? data);
}

/** Atomic replace — used for workbench.meta.json sidecar writes. */
export async function writeJsonAtomicallyToBackupFolder(
  filename: string,
  json: string
): Promise<{ ok: boolean; error?: string }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return perm;
  return writeJsonAtomicallyWithHandle(handle, filename, json);
}

/**
 * Read a JSON file from the configured backup folder.
 * Returns `notFound: true` if the file does not exist (this is not an error
 * for the caller — `latest.json` may legitimately be missing).
 */
export async function readJsonFromBackupFolder(
  filename: string
): Promise<{ ok: boolean; json?: string; error?: string; notFound?: boolean }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return { ok: false, error: perm.error };
  return readJsonWithHandle(handle, filename);
}

/** Read a binary file from the configured backup folder. */
export async function readBinaryFromBackupFolder(
  filename: string
): Promise<{ ok: boolean; data?: Uint8Array; error?: string; notFound?: boolean }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return { ok: false, error: perm.error };
  return readBinaryWithHandle(handle, filename);
}

/** Best-effort delete — used to clean up import staging files. */
export async function deleteFileFromBackupFolder(
  filename: string
): Promise<{ ok: boolean; error?: string; notFound?: boolean }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return { ok: false, error: perm.error };
  try {
    await handle.removeEntry(filename);
    return { ok: true };
  } catch (e) {
    const msg = formatBackupFolderError(e);
    if (msg.includes('not found') || msg.includes('NotFoundError')) {
      return { ok: true, notFound: true };
    }
    return { ok: false, error: msg };
  }
}

// --- onboarding pickup ------------------------------------------------------

export type PickBackupFolderResult = {
  ok: boolean;
  error?: string;
  /** Legacy latest.json found in folder — caller should import. */
  existingBackupJson?: string;
  /** Folder already has (or was migrated to) workbench.sqlite — caller must LOAD from disk. */
  hadExistingWorkbenchDb?: boolean;
  /** Empty folder linked; caller may mirror once to create workbench.sqlite. */
  freshFolder?: boolean;
};

/**
 * Directory picker + persist handle. Does not start the DB worker.
 * For an empty folder, returns `freshFolder: true` — the worker mirror creates
 * `workbench.sqlite` (avoid exporting bytes from the UI tab before worker boot).
 */
export async function pickAndPersistBackupFolder(): Promise<PickBackupFolderResult> {
  if (typeof window.showDirectoryPicker !== 'function') {
    return { ok: false, error: 'Folder picker is not supported in this context' };
  }
  try {
    const existing = await getBackupDirectoryHandle();
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: DIRECTORY_PICKER_ID,
      ...(existing ? { startIn: existing } : {}),
    });
    const perm = await ensureReadWritePermission(handle);
    if (!perm.ok) return perm;

    await setBackupDirectoryHandle(handle);

    const { purgeLegacyLocalDomainStorage } = await import('./storage/legacyStorageCleanup');
    await purgeLegacyLocalDomainStorage();

    const existingDb = await readBinaryWithHandle(handle, WORKBENCH_DB_FILE);
    if (existingDb.ok && existingDb.data && existingDb.data.byteLength > 16) {
      return { ok: true, hadExistingWorkbenchDb: true };
    }

    const legacyJson = await readJsonWithHandle(handle, LEGACY_LATEST_JSON);
    if (legacyJson.ok && legacyJson.json) {
      return { ok: true, existingBackupJson: legacyJson.json };
    }

    const legacyDb = await readBinaryWithHandle(handle, LEGACY_LATEST_SQLITE);
    if (legacyDb.ok && legacyDb.data && legacyDb.data.byteLength > 16) {
      await writeBinaryWithHandle(handle, WORKBENCH_DB_FILE, legacyDb.data);
      return { ok: true, hadExistingWorkbenchDb: true };
    }

    if (
      (!existingDb.notFound && existingDb.error) ||
      (!legacyJson.notFound && legacyJson.error)
    ) {
      return { ok: false, error: existingDb.error ?? legacyJson.error };
    }

    return { ok: true, freshFolder: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'cancelled' };
    }
    return { ok: false, error: formatBackupFolderError(e) };
  }
}
