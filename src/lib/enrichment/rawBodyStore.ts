import {
  getBackupDirectoryHandle,
  hasWritableBackupFolder,
} from '../backupFolder';

const CACHE_DIR = 'enrichment-cache';

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function getCacheDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!(await hasWritableBackupFolder())) return null;
  const root = await getBackupDirectoryHandle();
  if (!root) return null;
  try {
    const perm = await root.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const req = await root.requestPermission({ mode: 'readwrite' });
      if (req !== 'granted') return null;
    }
    return root.getDirectoryHandle(CACHE_DIR, { create: true });
  } catch {
    return null;
  }
}

export function rawRefForItem(itemId: string): string {
  return `${itemId}.md`;
}

export function reviewRawRefForItem(itemId: string): string {
  return `${itemId}.review-pending.md`;
}

export async function writeReviewRawBody(itemId: string, body: string): Promise<{
  ok: boolean;
  rawRef?: string;
  rawBytes?: number;
  error?: string;
}> {
  const dir = await getCacheDirectory();
  if (!dir) {
    return { ok: false, error: 'no_backup_folder' };
  }
  const rawRef = reviewRawRefForItem(itemId);
  try {
    const fileHandle = await dir.getFileHandle(rawRef, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(body);
    await writable.close();
    const rawBytes = new TextEncoder().encode(body).length;
    return { ok: true, rawRef, rawBytes };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function writeRawBody(itemId: string, body: string): Promise<{
  ok: boolean;
  rawRef?: string;
  rawBytes?: number;
  error?: string;
}> {
  const dir = await getCacheDirectory();
  if (!dir) {
    return { ok: false, error: 'no_backup_folder' };
  }
  const rawRef = rawRefForItem(itemId);
  try {
    const fileHandle = await dir.getFileHandle(rawRef, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(body);
    await writable.close();
    const rawBytes = new TextEncoder().encode(body).length;
    return { ok: true, rawRef, rawBytes };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function loadRawBody(rawRef: string): Promise<string | null> {
  const dir = await getCacheDirectory();
  if (!dir) return null;
  try {
    const fileHandle = await dir.getFileHandle(rawRef);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function deleteRawBody(itemId: string): Promise<void> {
  const dir = await getCacheDirectory();
  if (!dir) return;
  const rawRef = rawRefForItem(itemId);
  try {
    await dir.removeEntry(rawRef);
  } catch {
    /* file may not exist */
  }
}

/** Remove every file in backup-folder enrichment-cache (testing reset). */
export async function purgeAllEnrichmentCacheFiles(): Promise<number> {
  const root = await getCacheDirectory();
  if (!root) return 0;
  let removed = 0;
  try {
    for await (const [name] of (root as DirectoryWithEntries).entries()) {
      try {
        await root.removeEntry(name, { recursive: true });
        removed++;
      } catch {
        /* skip */
      }
    }
  } catch {
    return removed;
  }
  return removed;
}
