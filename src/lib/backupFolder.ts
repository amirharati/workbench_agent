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
import { exportDB } from './db';
import { getMetaDB } from './metaDb';

const HANDLE_KEY = 'backup-directory';

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

// --- onboarding pickup ------------------------------------------------------

/**
 * Directory picker + persist handle + initial latest.json (canonical export).
 *
 * NOTE: This still writes a *flat* (legacy) export when bootstrapping a fresh
 * folder. The first live/manual write driven by BackupCoordinator will
 * upgrade it to the enveloped format. This avoids a chicken-and-egg with
 * revisionTracker which may not be loaded yet at picker time.
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

    const existing = await readJsonWithHandle(handle, 'latest.json');

    if (existing.ok && existing.json) {
      await setBackupDirectoryHandle(handle);
      return { ok: true, existingBackupJson: existing.json };
    }

    if (!existing.notFound && existing.error) {
      return { ok: false, error: existing.error };
    }

    // No existing backup file: initialize folder with current DB state.
    const json = await exportDB();
    const write = await writeJsonWithHandle(handle, 'latest.json', json);
    if (!write.ok) return { ok: false, error: write.error ?? 'Could not write to folder' };
    await setBackupDirectoryHandle(handle);
    return { ok: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'cancelled' };
    }
    return { ok: false, error: String(e) };
  }
}
