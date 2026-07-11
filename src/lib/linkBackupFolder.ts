/**
 * Folder has workbench.sqlite → load it. No heuristics, no mirror-first.
 */
import { readBinaryFromBackupFolder, WORKBENCH_DB_FILE } from './backupFolder';
import { forceImportFromBackupFolderFile } from './storage/dbClient/folderDbRpc';

export type LoadFolderResult = { ok: true } | { ok: false; error: string };

export async function folderHasWorkbenchSqlite(): Promise<boolean> {
  const onDisk = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  return !!(onDisk.ok && onDisk.data && onDisk.data.byteLength > 16);
}

/** Force-load workbench.sqlite from the linked backup folder into the worker. */
export async function loadWorkbenchSqliteFromFolder(): Promise<LoadFolderResult> {
  const onDisk = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  if (!onDisk.ok) {
    return { ok: false, error: onDisk.error ?? 'Could not read backup folder.' };
  }
  if (onDisk.notFound || !onDisk.data || onDisk.data.byteLength < 16) {
    return { ok: false, error: 'No workbench.sqlite in this folder.' };
  }

  const result = await forceImportFromBackupFolderFile(WORKBENCH_DB_FILE);
  if (!result.imported) {
    return {
      ok: false,
      error:
        result.reason === 'empty'
          ? 'workbench.sqlite exists but is empty or invalid.'
          : `Could not load workbench.sqlite (${result.reason ?? 'unknown'}).`,
    };
  }
  return { ok: true };
}
