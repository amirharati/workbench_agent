/**
 * Backup sink abstraction.
 *
 * Why the split:
 * - `writeLatest` overwrites a single canonical file/resource; ideal for the
 *   debounced live snapshot, where we always want the most-recent state and
 *   never want to accumulate junk.
 * - `writeNamed` writes a uniquely-named copy; ideal for manual backups
 *   ("manual-YYYY-MM-DD_HHMMSS.json") and future scheduled rotations.
 *
 * Both take *already-serialized* JSON so the BackupCoordinator owns
 * serialization and sinks stay transport-only. This keeps responsibilities
 * cleanly separated (Single Responsibility) and makes future sinks
 * (HttpBackupSink, etc.) trivial to plug in without touching DB or UI.
 */

import {
  hasWritableBackupFolder,
  getBackupFolderName,
  writeJsonToBackupFolder,
  writeBinaryToBackupFolder,
} from './backupFolder';
import { exportSqliteBytes } from './db';

export type BackupKind = 'live' | 'manual' | 'scheduled';

export interface BackupWriteResult {
  ok: boolean;
  /** Sink-specific reference: filename, URL, etc. — for status display. */
  ref?: string;
  error?: string;
}

export interface BackupSinkInfo {
  /** Stable id (e.g. "file-system", "http"). */
  id: string;
  /** Human-readable label (e.g. folder name, server URL). */
  label: string | null;
  /** True if the sink is currently configured and writable. */
  ready: boolean;
}

export interface BackupSink {
  /** Stable id used for selection / preferences. */
  readonly id: string;

  /** Lightweight check: configured AND has permission to write. */
  describe(): Promise<BackupSinkInfo>;

  /** Overwrite the canonical "latest" snapshot. */
  writeLatest(json: string, kind: BackupKind): Promise<BackupWriteResult>;

  /** Write a uniquely-named snapshot (caller chooses the filename). */
  writeNamed(filename: string, json: string, kind: BackupKind): Promise<BackupWriteResult>;
}

/**
 * File System Access API sink — uses the persisted directory handle.
 * `latest.json` is the canonical filename for the live snapshot.
 */
export class FileSystemBackupSink implements BackupSink {
  readonly id = 'file-system';
  private readonly latestFilename: string;

  constructor(latestFilename: string = 'latest.json') {
    this.latestFilename = latestFilename;
  }

  async describe(): Promise<BackupSinkInfo> {
    const ready = await hasWritableBackupFolder();
    const label = ready ? await getBackupFolderName() : null;
    return { id: this.id, label, ready };
  }

  async writeLatest(json: string, _kind: BackupKind): Promise<BackupWriteResult> {
    const res = await writeJsonToBackupFolder(this.latestFilename, json);
    return { ok: res.ok, ref: res.ok ? this.latestFilename : undefined, error: res.error };
  }

  async writeNamed(filename: string, json: string, _kind: BackupKind): Promise<BackupWriteResult> {
    if (!filename || filename.includes('/') || filename.includes('\\')) {
      return { ok: false, error: `Invalid filename: ${filename}` };
    }
    const res = await writeJsonToBackupFolder(filename, json);
    return { ok: res.ok, ref: res.ok ? filename : undefined, error: res.error };
  }
}

/**
 * Manual snapshot sink — occasional `manual-*.sqlite` + `manual-*.json` only.
 * Live DB is `workbench.sqlite` (folderPersistence), not rewritten here on every edit.
 */
export class ManualFolderBackupSink implements BackupSink {
  readonly id = 'file-system-manual';

  async describe(): Promise<BackupSinkInfo> {
    const ready = await hasWritableBackupFolder();
    const label = ready ? await getBackupFolderName() : null;
    return { id: this.id, label, ready };
  }

  async writeLatest(_json: string, _kind: BackupKind): Promise<BackupWriteResult> {
    return { ok: true, ref: 'workbench.sqlite (live)' };
  }

  async writeNamed(filename: string, json: string, _kind: BackupKind): Promise<BackupWriteResult> {
    if (!filename || filename.includes('/') || filename.includes('\\')) {
      return { ok: false, error: `Invalid filename: ${filename}` };
    }
    const sqliteFilename = filename.replace(/\.json$/, '.sqlite');
    const sqliteBytes = await exportSqliteBytes();
    if (sqliteBytes) {
      const sqliteRes = await writeBinaryToBackupFolder(sqliteFilename, sqliteBytes);
      if (!sqliteRes.ok) {
        console.warn('[Manual backup] Failed to write sqlite snapshot:', sqliteRes.error);
      }
    }
    const res = await writeJsonToBackupFolder(filename, json);
    return { ok: res.ok, ref: res.ok ? `${sqliteFilename} + ${filename}` : undefined, error: res.error };
  }
}

/**
 * @deprecated Live backup sink — replaced by workbench.sqlite + folderPersistence.
 */
export class FileSystemSqliteBackupSink implements BackupSink {
  readonly id = 'file-system-sqlite';
  private readonly latestSqliteFilename: string;
  private readonly latestJsonFilename: string;

  constructor(
    latestSqliteFilename: string = 'latest.sqlite',
    latestJsonFilename: string = 'latest.json'
  ) {
    this.latestSqliteFilename = latestSqliteFilename;
    this.latestJsonFilename = latestJsonFilename;
  }

  async describe(): Promise<BackupSinkInfo> {
    const ready = await hasWritableBackupFolder();
    const label = ready ? await getBackupFolderName() : null;
    return { id: this.id, label, ready };
  }

  async writeLatest(json: string, _kind: BackupKind): Promise<BackupWriteResult> {
    // Write SQLite bytes first
    const sqliteBytes = await exportSqliteBytes();
    if (sqliteBytes) {
      const sqliteRes = await writeBinaryToBackupFolder(this.latestSqliteFilename, sqliteBytes);
      if (!sqliteRes.ok) {
        console.warn('[SQLite Backup] Failed to write latest.sqlite:', sqliteRes.error);
      }
    }

    // Also write JSON for compatibility
    const jsonRes = await writeJsonToBackupFolder(this.latestJsonFilename, json);
    return { 
      ok: jsonRes.ok, 
      ref: jsonRes.ok ? `${this.latestSqliteFilename} + ${this.latestJsonFilename}` : undefined, 
      error: jsonRes.error 
    };
  }

  async writeNamed(filename: string, json: string, _kind: BackupKind): Promise<BackupWriteResult> {
    if (!filename || filename.includes('/') || filename.includes('\\')) {
      return { ok: false, error: `Invalid filename: ${filename}` };
    }

    // For named backups, write both SQLite and JSON versions
    const sqliteFilename = filename.replace(/\.json$/, '.sqlite');
    const sqliteBytes = await exportSqliteBytes();
    if (sqliteBytes) {
      const sqliteRes = await writeBinaryToBackupFolder(sqliteFilename, sqliteBytes);
      if (!sqliteRes.ok) {
        console.warn('[SQLite Backup] Failed to write named sqlite:', sqliteRes.error);
      }
    }

    // Write JSON version
    const res = await writeJsonToBackupFolder(filename, json);
    return { ok: res.ok, ref: res.ok ? filename : undefined, error: res.error };
  }
}
