/**
 * Import SQLite from the backup folder without sending bytes through
 * chrome.runtime.sendMessage (Chrome caps structured-clone payloads at ~64MiB).
 * Offscreen reads the folder file and forwards to the worker via postMessage.
 */
import { WORKBENCH_DB_FILE } from '../../backupFolder';
import type { DbContentFingerprint } from '../importFingerprint';

export type FolderImportResult = {
  imported: boolean;
  reason?: string;
  mirrorOk?: boolean;
  mirrorError?: string | null;
  mode?: string;
  merged?: boolean;
  itemCount?: number;
  /** Live OPFS ahead of folder — heal mirror should run. */
  folderOutOfDate?: boolean;
};

export async function forceImportFromBackupFolderFile(
  filename: string = WORKBENCH_DB_FILE
): Promise<FolderImportResult> {
  const { dbRpc } = await import('./index');
  return dbRpc<FolderImportResult>('forceImportFromBackupFolderFile', [filename]);
}

/** Merge folder file into live OPFS (or load if live empty). */
export async function mergeWithBackupFolderFile(
  filename: string = WORKBENCH_DB_FILE
): Promise<FolderImportResult> {
  const { dbRpc } = await import('./index');
  return dbRpc<FolderImportResult>('mergeWithBackupFolderFile', [filename]);
}

export async function bootstrapFromBackupFolderFile(
  filename: string = WORKBENCH_DB_FILE
): Promise<FolderImportResult> {
  const { dbRpc } = await import('./index');
  return dbRpc<FolderImportResult>('bootstrapFromBackupFolderFile', [filename]);
}

export async function inspectImportFromBackupFolderFile(
  filename: string
): Promise<DbContentFingerprint> {
  const { dbRpc } = await import('./index');
  return dbRpc<DbContentFingerprint>('inspectImportFromBackupFolderFile', [filename]);
}
