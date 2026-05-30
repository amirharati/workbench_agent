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
import { exportSqliteBytes } from './db';
import { getMetaDB } from './metaDb';

const HANDLE_KEY = 'backup-directory';

/** Canonical live database file in the user backup folder. */
export const WORKBENCH_DB_FILE = 'workbench.sqlite';
/** Envelope sidecar for conflict detection (revision / deviceId only). */
export const WORKBENCH_META_FILE = 'workbench.meta.json';
/** Legacy filenames — read for migration only. */
export const LEGACY_LATEST_JSON = 'latest.json';
export const LEGACY_LATEST_SQLITE = 'latest.sqlite';

/** Thrown when the app is used without a configured, writable backup folder. */
export class BackupFolderRequiredError extends Error {
  constructor(
    message = 'Choose a backup folder before using Workbench. Your data lives in workbench.sqlite in that folder.'
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
  data: Uint8Array
): Promise<{ ok: boolean; error?: string }> {
  try {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    // Write using ArrayBuffer to satisfy TypeScript
    await writable.write(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    await writable.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
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
  data: Uint8Array
): Promise<{ ok: boolean; error?: string }> {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'No backup folder configured' };
  const perm = await ensureReadWritePermission(handle);
  if (!perm.ok) return perm;
  return writeBinaryWithHandle(handle, filename, data);
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

// --- onboarding pickup ------------------------------------------------------

/**
 * Directory picker + persist handle + initial workbench.sqlite in folder.
 */
export async function pickAndPersistBackupFolder(): Promise<{
  ok: boolean;
  error?: string;
  existingBackupJson?: string;
}> {
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
      return { ok: true };
    }

    const legacyJson = await readJsonWithHandle(handle, LEGACY_LATEST_JSON);
    if (legacyJson.ok && legacyJson.json) {
      return { ok: true, existingBackupJson: legacyJson.json };
    }

    const legacyDb = await readBinaryWithHandle(handle, LEGACY_LATEST_SQLITE);
    if (legacyDb.ok && legacyDb.data && legacyDb.data.byteLength > 16) {
      await writeBinaryWithHandle(handle, WORKBENCH_DB_FILE, legacyDb.data);
      return { ok: true };
    }

    if (
      (!existingDb.notFound && existingDb.error) ||
      (!legacyJson.notFound && legacyJson.error)
    ) {
      return { ok: false, error: existingDb.error ?? legacyJson.error };
    }

    const bytes = await exportSqliteBytes();
    if (!bytes || bytes.byteLength < 16) {
      return { ok: false, error: 'Could not export database bytes' };
    }
    const write = await writeBinaryWithHandle(handle, WORKBENCH_DB_FILE, bytes);
    if (!write.ok) return { ok: false, error: write.error ?? 'Could not write to folder' };
    return { ok: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'cancelled' };
    }
    return { ok: false, error: String(e) };
  }
}
