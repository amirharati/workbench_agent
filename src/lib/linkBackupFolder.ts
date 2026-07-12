/**
 * Folder has workbench.sqlite → merge/load into browser. No blind overwrite of live when both have data.
 */
import { readBinaryFromBackupFolder, WORKBENCH_DB_FILE } from './backupFolder';
import {
  forceImportFromBackupFolderFile,
  mergeWithBackupFolderFile,
} from './storage/dbClient/folderDbRpc';

export type LoadFolderResult = { ok: true; mode?: string } | { ok: false; error: string };

export async function folderHasWorkbenchSqlite(): Promise<boolean> {
  const onDisk = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  return !!(onDisk.ok && onDisk.data && onDisk.data.byteLength > 16);
}

/**
 * Merge workbench.sqlite from the linked backup folder into the worker.
 * Uses replace import only when merge RPC reports empty/invalid folder file.
 * When the browser is ahead of the folder file, the worker forces a mirror out.
 */
export async function loadWorkbenchSqliteFromFolder(): Promise<LoadFolderResult> {
  const onDisk = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  if (!onDisk.ok) {
    return { ok: false, error: onDisk.error ?? 'Could not read backup folder.' };
  }
  if (onDisk.notFound || !onDisk.data || onDisk.data.byteLength < 16) {
    return { ok: false, error: 'No workbench.sqlite in this folder.' };
  }

  const result = await mergeWithBackupFolderFile(WORKBENCH_DB_FILE);
  if (result.mode === 'empty' || (result.reason === 'empty' && !result.imported && !result.merged)) {
    return {
      ok: false,
      error: 'workbench.sqlite exists but is empty or invalid.',
    };
  }
  // unchanged / merge / load are all success (worker mirrors when folder is behind)
  if (result.imported || result.merged || result.mode === 'unchanged' || result.reason === 'already-has-data') {
    // Belt-and-suspenders: if folder was behind, ensure a forced mirror flush.
    if (result.folderOutOfDate || result.merged) {
      try {
        const { mirrorNow } = await import('./storage/dbClient');
        await mirrorNow(true);
      } catch (e) {
        console.warn('[linkBackupFolder] heal-mirror after load failed:', e);
      }
    }
    return { ok: true, mode: result.mode ?? (result.merged ? 'merge' : 'ok') };
  }
  // Fallback: force import if merge path returned unexpected shape
  const forced = await forceImportFromBackupFolderFile(WORKBENCH_DB_FILE);
  if (!forced.imported) {
    return {
      ok: false,
      error:
        forced.reason === 'empty'
          ? 'workbench.sqlite exists but is empty or invalid.'
          : `Could not load workbench.sqlite (${forced.reason ?? 'unknown'}).`,
    };
  }
  return { ok: true, mode: 'load' };
}
