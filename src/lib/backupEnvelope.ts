/**
 * Backup envelope — metadata wrapper around the canonical export payload.
 *
 * On-disk shape (v1):
 *   {
 *     "format":      "workbench-backup",
 *     "schemaVersion": 1,                       // bump if envelope shape changes
 *     "exportedAt":   1746238800000,            // UTC ms (Date.now())
 *     "revision":     137,                      // monotonic per device
 *     "deviceId":     "dev_8f3a…",              // UUID, generated once per install
 *     "writerKind":   "live" | "manual" | "scheduled",
 *     "data":         { projects, collections, items, notes, snapshots, workspaces }
 *   }
 *
 * Time policy:
 *   - All timestamps are **UTC milliseconds since epoch** (`Date.now()`).
 *   - We assume the host clock is approximately accurate; large clock skew
 *     between devices may cause cosmetic confusion in displayed times but
 *     does not affect conflict detection (which uses revision numbers, not
 *     timestamps).
 *
 * Backwards compatibility:
 *   - Legacy `latest.json` files written before this slice are flat objects
 *     with no `format`/`schemaVersion`. `parseBackupText` handles both.
 */

export const BACKUP_FORMAT_TAG = 'workbench-backup';
export const BACKUP_SCHEMA_VERSION = 1;

export type BackupWriterKind = 'live' | 'manual' | 'scheduled';

export interface BackupEnvelopeMeta {
  /** Constant tag — used to detect envelope vs legacy flat export. */
  format: typeof BACKUP_FORMAT_TAG;
  schemaVersion: number;
  /** UTC milliseconds since epoch. */
  exportedAt: number;
  /** Monotonic per device. */
  revision: number;
  /** UUID generated once per install. */
  deviceId: string;
  writerKind: BackupWriterKind;
}

export interface BackupEnvelope extends BackupEnvelopeMeta {
  /** The same shape `exportDB()` already produces. */
  data: unknown;
}

/**
 * Result of parsing a backup file's text. Always returns `data`; `envelope`
 * is non-null iff the file used the new format.
 */
export interface ParsedBackup {
  envelope: BackupEnvelopeMeta | null;
  data: unknown;
}

/** Wrap an already-serialized payload (string from `exportDB()`) into an envelope. */
export function wrapExport(
  payloadJson: string,
  meta: { revision: number; deviceId: string; writerKind: BackupWriterKind; exportedAt?: number }
): string {
  const data = JSON.parse(payloadJson);
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT_TAG,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: meta.exportedAt ?? Date.now(),
    revision: meta.revision,
    deviceId: meta.deviceId,
    writerKind: meta.writerKind,
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Tolerant parser. Accepts:
 *   - Enveloped format -> { envelope, data }
 *   - Legacy flat format -> { envelope: null, data: <the parsed object> }
 *
 * Throws SyntaxError only if `text` is not valid JSON; the caller should
 * decide what to do with that. Returns `{ envelope: null, data: parsed }`
 * for any non-recognized object so importers can still try their best.
 */
export function parseBackupText(text: string): ParsedBackup {
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && (parsed as { format?: unknown }).format === BACKUP_FORMAT_TAG) {
    const env = parsed as Partial<BackupEnvelope> & { data?: unknown };
    if (
      typeof env.schemaVersion === 'number' &&
      typeof env.exportedAt === 'number' &&
      typeof env.revision === 'number' &&
      typeof env.deviceId === 'string' &&
      (env.writerKind === 'live' || env.writerKind === 'manual' || env.writerKind === 'scheduled') &&
      typeof env.data === 'object' &&
      env.data !== null
    ) {
      const meta: BackupEnvelopeMeta = {
        format: BACKUP_FORMAT_TAG,
        schemaVersion: env.schemaVersion,
        exportedAt: env.exportedAt,
        revision: env.revision,
        deviceId: env.deviceId,
        writerKind: env.writerKind,
      };
      return { envelope: meta, data: env.data };
    }
    // Unknown envelope variant: fall through and treat data as the whole blob.
  }
  return { envelope: null, data: parsed };
}

/**
 * Re-serialize the *data* portion of any backup file (envelope or legacy)
 * as a flat string — convenient when an existing code path expects to see
 * the legacy shape (e.g. importDB's transactional restore code).
 */
export function extractDataJson(text: string): string {
  const { data } = parseBackupText(text);
  return JSON.stringify(data);
}
