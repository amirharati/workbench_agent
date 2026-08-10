/**
 * Fetched-body facade. New writes use the worker-owned content SQLite sidecar;
 * legacy per-item folder files remain read/delete compatible during V3.
 */
import { getBackupDirectoryHandle, hasWritableBackupFolder } from '../backupFolder';
import {
  clearContent,
  deleteContent,
  getContentByRef,
  putContent,
} from '../storage/content/contentClient';

const LEGACY_CACHE_DIR = 'enrichment-cache';

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function getLegacyCacheDirectory(
  create = false
): Promise<FileSystemDirectoryHandle | null> {
  if (!(await hasWritableBackupFolder())) return null;
  const root = await getBackupDirectoryHandle();
  if (!root) return null;
  try {
    return await root.getDirectoryHandle(LEGACY_CACHE_DIR, { create });
  } catch {
    return null;
  }
}

/** Legacy reference helpers retained only for old core rows and cleanup. */
export function rawRefForItem(itemId: string): string {
  return `${itemId}.md`;
}

export function reviewRawRefForItem(itemId: string): string {
  return `${itemId}.review-pending.md`;
}

type WriteBodyOptions = { contentHash?: string; fetchedAt?: number };

async function writeBody(
  itemId: string,
  kind: 'raw' | 'review',
  body: string,
  options?: WriteBodyOptions
): Promise<{ ok: boolean; rawRef?: string; rawBytes?: number; error?: string }> {
  try {
    const stored = await putContent({ itemId, kind, body, ...options });
    return { ok: true, rawRef: stored.rawRef, rawBytes: stored.rawBytes };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export function writeReviewRawBody(
  itemId: string,
  body: string,
  options?: WriteBodyOptions
): Promise<{ ok: boolean; rawRef?: string; rawBytes?: number; error?: string }> {
  return writeBody(itemId, 'review', body, options);
}

export function writeRawBody(
  itemId: string,
  body: string,
  options?: WriteBodyOptions
): Promise<{ ok: boolean; rawRef?: string; rawBytes?: number; error?: string }> {
  return writeBody(itemId, 'raw', body, options);
}

export async function loadRawBody(rawRef: string): Promise<string | null> {
  if (rawRef.startsWith('content:v1:')) {
    try {
      return (await getContentByRef(rawRef))?.body ?? null;
    } catch {
      return null;
    }
  }

  // Read-only bridge for libraries whose core rows still reference V2 files.
  const dir = await getLegacyCacheDirectory(false);
  if (!dir) return null;
  try {
    const fileHandle = await dir.getFileHandle(rawRef);
    return await (await fileHandle.getFile()).text();
  } catch {
    return null;
  }
}

async function removeLegacyFile(filename: string): Promise<void> {
  const dir = await getLegacyCacheDirectory(false);
  if (!dir) return;
  try {
    await dir.removeEntry(filename);
  } catch {
    // File may not exist.
  }
}

export async function deleteRawBody(itemId: string): Promise<void> {
  await deleteContent(itemId, 'raw');
  await removeLegacyFile(rawRefForItem(itemId));
}

export async function deleteReviewRawBody(itemId: string): Promise<void> {
  await deleteContent(itemId, 'review');
  await removeLegacyFile(reviewRawRefForItem(itemId));
}

/** Clear sidecar rows plus any legacy per-item cache files (testing reset). */
export async function purgeAllEnrichmentCacheFiles(): Promise<number> {
  const content = await clearContent();
  const root = await getLegacyCacheDirectory(false);
  if (!root) return content.removed;
  let legacyRemoved = 0;
  try {
    for await (const [name] of (root as DirectoryWithEntries).entries()) {
      try {
        await root.removeEntry(name, { recursive: true });
        legacyRemoved++;
      } catch {
        // Skip entries that disappeared concurrently.
      }
    }
  } catch {
    // Return the rows already cleared from the sidecar.
  }
  return content.removed + legacyRemoved;
}
