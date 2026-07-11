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
import { wouldMirrorShrinkWorkbenchSqlite } from './folderMirrorGuard';
import { getMetaDB } from './metaDb';

const HANDLE_KEY = 'backup-directory';

/** Canonical live database file in the user backup folder. */
export const WORKBENCH_DB_FILE = 'workbench.sqlite';
/** Staging file for Settings restore — written in tab, imported by offscreen (avoids 64MiB sendMessage). */
export const IMPORT_STAGING_FILE = 'import-staging.sqlite';
/** Envelope sidecar for conflict detection (revision / deviceId only). */
export const WORKBENCH_META_FILE = 'workbench.meta.json';
/** Legacy filenames — read for migration only. */
export const LEGACY_LATEST_JSON = 'latest.json';
export const LEGACY_LATEST_SQLITE = 'latest.sqlite';

/** Thrown when the app is used without a configured, writable backup folder. */
export class BackupFolderRequiredError extends Error {
  constructor(
    message = 'Choose a backup folder before using Homebase. Your data lives in workbench.sqlite in that folder.'
  ) {
    super(message);
    this.name = 'BackupFolderRequiredError';
  }
}

/** Fail fast if no backup folder is configured (required for all domain data). */
export async function requireWritableBackupFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await getBackupDirectoryHandle();
  if (!handle || !(await hasWritableBackupFolder())) {
    throw new BackupFolderRequiredError();
  }
  return handle;
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

export async function setBackupDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getMetaDB();
  await db.put('handles', handle, HANDLE_KEY);
}

export async function clearBackupDirectoryHandle(): Promise<void> {
  try {
    const db = await getMetaDB();
    await db.delete('handles', HANDLE_KEY);
  } catch {
    /* ignore */
  }
}

/** True if a handle exists and still has read/write permission. */
export async function hasWritableBackupFolder(): Promise<boolean> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return false;
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    return perm === 'granted';
  } catch {
    return false;
  }
}

export async function getBackupFolderName(): Promise<string | null> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return null;
  try {
    return handle.name || null;
  } catch {
    return null;
  }
}

// --- low-level read/write ---------------------------------------------------

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
    const req = await handle.requestPermission({ mode: 'readwrite' });
    if (req !== 'granted') return { ok: false, error: 'Permission denied for backup folder' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not request backup folder permission' };
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
    return { ok: false, error: String(e) };
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
    return { ok: false, error: String(e) };
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
    return { ok: false, error: String(e) };
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
    return { ok: false, error: String(e) };
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
    return { ok: false, error: String(e) };
  }

  const tmpRes = await writeTemp(tmpFilename);
  if (!tmpRes.ok) return tmpRes;

  try {
    const tmpHandle = await handle.getFileHandle(tmpFilename);
    const moveFn = (tmpHandle as FileSystemFileHandle & { move?: (name: string) => Promise<void> }).move;
    if (typeof moveFn === 'function') {
      try {
        await removeEntryIfExists(handle, filename);
      } catch (e) {
        return { ok: false, error: String(e) };
      }
      await moveFn.call(tmpHandle, filename);
      return { ok: true };
    }

    const finalRes = await finalizeFromTemp(tmpHandle, tmpFilename);
    if (!finalRes.ok) return finalRes;
    try {
      await removeEntryIfExists(handle, tmpFilename);
    } catch {
      /* best-effort cleanup */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
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
 * Write binary data to the configured backup folder.
 * Used for SQLite database backups.
 */
export async function writeBinaryToBackupFolder(
  filename: string,
  data: Uint8Array | ArrayBuffer
): Promise<{ ok: boolean; error?: string }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return perm;
  return writeBinaryWithHandle(handle, filename, data);
}

/** Atomic replace — used for live mirror and manual sqlite snapshots. */
export type WriteBinaryToFolderOpts = {
  /** Only for explicit user actions (e.g. conflict: keep local). Skips shrink guard on workbench.sqlite. */
  allowWorkbenchShrink?: boolean;
};

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
  if (
    filename === WORKBENCH_DB_FILE &&
    payload &&
    payload.byteLength >= 16 &&
    !opts?.allowWorkbenchShrink
  ) {
    const existing = await readBinaryWithHandle(handle, filename);
    if (existing.ok && existing.data && existing.data.byteLength > 16) {
      const blocked = wouldMirrorShrinkWorkbenchSqlite(existing.data, payload);
      if (blocked) {
        console.error('[backupFolder] blocked live write:', blocked);
        return { ok: false, error: blocked };
      }
    }
  }

  return writeBinaryAtomicallyWithHandle(handle, filename, data);
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
    const msg = String(e);
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
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
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
    return { ok: false, error: String(e) };
  }
}
