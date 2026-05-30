/**
 * BackupCoordinator
 * -----------------
 * Single owner of "when and where do we write a backup?".
 *
 * Responsibilities (Single Responsibility):
 *   1. Debounce live backups so a burst of edits results in one write.
 *   2. Serialize the DB once per cycle via `exportDB()` (no duplicated logic).
 *   3. Stamp every payload with a backup envelope (revision, deviceId,
 *      writerKind, exportedAt) so multiple devices / Chrome profiles can
 *      reason about who wrote what.
 *   4. Fan out the serialized payload to every active sink.
 *   5. Track per-event status (last live success, last manual success,
 *      errors, conflict) so the UI can display a non-intrusive footer.
 *   6. Detect conflicts between local DB and the remote `latest.json` and
 *      pause writes until the user resolves them.
 *
 * Non-responsibilities (kept elsewhere):
 *   - Knowing *what* changed                   -> `dataChangeNotifier`.
 *   - Knowing *where* to write                 -> `BackupSink` impls.
 *   - Maintaining revision/deviceId/lastSeen   -> `revisionTracker`.
 *   - Triggering scheduled writes              -> upcoming `chrome.alarms`
 *     integration will simply call `manualBackup({ kind: 'scheduled' })`.
 *
 * Future-proofing:
 *   - `addSink` / `removeSink` allow plugging in `HttpBackupSink` later
 *     (or letting the user pick a primary sink in settings).
 *   - The envelope already carries everything an HTTP sink needs to do
 *     server-side conflict detection.
 */

import { exportDB, importDB, verifyBackup, reloadFromFolderDatabase } from './db';
import { subscribeToDataChanges, DataChangeReason } from './dataChangeNotifier';
import { BackupSink, BackupKind, BackupWriteResult } from './backupSinks';
import { readJsonFromBackupFolder, WORKBENCH_META_FILE, LEGACY_LATEST_JSON } from './backupFolder';
import {
  wrapExport,
  parseBackupText,
  BackupEnvelopeMeta,
  BackupWriterKind,
} from './backupEnvelope';
import { revisionTracker } from './revisionTracker';

const DEFAULT_DEBOUNCE_MS = 1500;
/** Meta sidecar for live folder DB — not full JSON export on every edit. */
const LIVE_META_FILENAME = WORKBENCH_META_FILE;
const LEGACY_LATEST_FILENAME = LEGACY_LATEST_JSON;

async function readConflictMetaFromFolder(): Promise<{
  ok: boolean;
  json?: string;
  error?: string;
  notFound?: boolean;
}> {
  const meta = await readJsonFromBackupFolder(LIVE_META_FILENAME);
  if (meta.ok && meta.json) return meta;
  if (!meta.notFound) return meta;
  return readJsonFromBackupFolder(LEGACY_LATEST_FILENAME);
}

export interface BackupSinkOutcome {
  sinkId: string;
  result: BackupWriteResult;
}

export interface BackupRunSummary {
  kind: BackupKind;
  reason: DataChangeReason | 'manual' | 'scheduled' | 'startup' | 'force-push';
  at: number;
  outcomes: BackupSinkOutcome[];
  /** True if at least one sink succeeded. */
  ok: boolean;
}

/** What a comparison between local DB and remote `latest.json` produced. */
export type BackupConflictKind =
  | 'in-sync'
  | 'local-newer-same-device'
  | 'remote-newer-same-device'
  | 'remote-newer-different-device'
  | 'diverged-different-device'
  | 'remote-legacy-no-envelope'
  | 'remote-missing'
  | 'remote-unreadable';

export interface BackupConflictInfo {
  kind: BackupConflictKind;
  /** True if writes should be paused until the user resolves the conflict. */
  blocking: boolean;
  /** The remote envelope, when one was successfully read. */
  remote: BackupEnvelopeMeta | null;
  /** Snapshot of local revision at the time of the check. */
  localRevision: number;
  /** Local device id at the time of the check. */
  localDeviceId: string;
  /** Human-readable explanation suitable for a status line. */
  message: string;
  /** When the check was performed (UTC ms). */
  checkedAt: number;
}

export interface BackupStatusSnapshot {
  /** Currently registered sinks (ids only). */
  sinkIds: string[];
  /** Most recent successful auto/live write (ms epoch), if any. */
  lastLiveOkAt: number | null;
  /** Most recent successful manual write (ms epoch), if any. */
  lastManualOkAt: number | null;
  /** Most recent run that included any failure (any sink). */
  lastErrorAt: number | null;
  lastError: string | null;
  /** True if a debounced write is currently scheduled. */
  livePending: boolean;
  /** True if a write is currently executing. */
  inFlight: boolean;
  /** Non-null reason means writes are paused (e.g. conflict detected). */
  pausedReason: string | null;
  /** Most recent conflict check result, if any. */
  conflict: BackupConflictInfo | null;
}

type StatusListener = (status: BackupStatusSnapshot) => void;

class BackupCoordinatorImpl {
  private sinks = new Map<string, BackupSink>();
  private debounceMs = DEFAULT_DEBOUNCE_MS;
  private debounceTimer: number | null = null;
  private pendingReason: DataChangeReason = 'unknown';
  private inFlight = false;
  private status: BackupStatusSnapshot = {
    sinkIds: [],
    lastLiveOkAt: null,
    lastManualOkAt: null,
    lastErrorAt: null,
    lastError: null,
    livePending: false,
    inFlight: false,
    pausedReason: null,
    conflict: null,
  };
  private statusListeners = new Set<StatusListener>();
  private dataUnsub: (() => void) | null = null;
  /** When false, live debounced JSON/sqlite snapshots are disabled (folder live DB). */
  private liveBackupEnabled = true;

  setLiveBackupEnabled(enabled: boolean): void {
    this.liveBackupEnabled = enabled;
    if (!enabled && this.debounceTimer != null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.publishStatus({ livePending: false });
    }
  }

  /** One-time wiring; safe to call multiple times. */
  start(): void {
    if (this.dataUnsub) return;
    this.dataUnsub = subscribeToDataChanges((event) => {
      if (this.liveBackupEnabled) {
        this.scheduleLive(event.reason);
      }
    });
  }

  /** For tests / hot-reload only. */
  stop(): void {
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.dataUnsub) {
      this.dataUnsub();
      this.dataUnsub = null;
    }
  }

  setDebounceMs(ms: number): void {
    if (Number.isFinite(ms) && ms >= 0) this.debounceMs = ms;
  }

  addSink(sink: BackupSink): void {
    this.sinks.set(sink.id, sink);
    this.publishStatus({ sinkIds: Array.from(this.sinks.keys()) });
  }

  removeSink(sinkId: string): void {
    this.sinks.delete(sinkId);
    this.publishStatus({ sinkIds: Array.from(this.sinks.keys()) });
  }

  hasAnySink(): boolean {
    return this.sinks.size > 0;
  }

  getStatus(): BackupStatusSnapshot {
    return { ...this.status };
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  // --- pause control ---------------------------------------------------------

  /**
   * Block all writes (live + manual) until `resume()` is called or until a
   * conflict-resolution method (`loadFromRemote` / `forcePushLocal`) lifts
   * the pause itself.
   */
  pause(reason: string): void {
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.publishStatus({ pausedReason: reason, livePending: false });
  }

  resume(): void {
    this.publishStatus({ pausedReason: null });
  }

  // --- live + manual triggers ------------------------------------------------

  /**
   * Schedule a debounced live backup. Multiple calls within the debounce
   * window collapse into a single write — important when the UI fires a
   * burst of mutations (bulk delete, drag-reorder, restore-from-file).
   */
  scheduleLive(reason: DataChangeReason = 'unknown'): void {
    if (this.status.pausedReason) return; // Don't even arm the timer while paused.
    this.pendingReason = reason;
    this.publishStatus({ livePending: true });
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.runLive(this.pendingReason);
    }, this.debounceMs) as unknown as number;
  }

  /**
   * Manual backup — uses the standard naming `manual-YYYY-MM-DD_HHMMSS.json`
   * AND refreshes `latest.json` so the canonical snapshot stays current.
   */
  async manualBackup(): Promise<BackupRunSummary | null> {
    if (this.status.pausedReason) return null;
    const filename = buildManualFilename(new Date());
    return this.runOnce({
      kind: 'manual',
      reason: 'manual',
      target: { mode: 'named-and-latest', filename },
    });
  }

  /**
   * Force an immediate live write. Bypasses debounce but still respects the
   * paused flag (use `forcePushLocal` to override pause during conflict
   * resolution).
   */
  async flush(reason: DataChangeReason | 'startup' = 'startup'): Promise<BackupRunSummary | null> {
    if (this.status.pausedReason) return null;
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.publishStatus({ livePending: false });
    }
    return this.runLive(reason);
  }

  // --- conflict detection / resolution --------------------------------------

  /**
   * Compare local revision/deviceId against the remote `latest.json`
   * envelope. Updates internal status (and `revisionTracker.lastSeenRemote`
   * when a fresh envelope is read) and returns the result.
   */
  async checkForConflict(): Promise<BackupConflictInfo> {
    const localDeviceId = revisionTracker.getDeviceIdSync();
    const localRevision = revisionTracker.getLocalRevisionSync();
    const lastSeen = revisionTracker.getLastSeenRemoteSync();

    if (!this.hasAnySink()) {
      return this.recordConflict({
        kind: 'remote-missing',
        blocking: false,
        remote: null,
        localRevision,
        localDeviceId,
        message: 'No backup folder configured.',
        checkedAt: Date.now(),
      });
    }

    const read = await readConflictMetaFromFolder();
    if (!read.ok) {
      if (read.notFound) {
        return this.recordConflict({
          kind: 'remote-missing',
          blocking: false,
          remote: null,
          localRevision,
          localDeviceId,
          message: 'No workbench.meta.json yet; next save will create it.',
          checkedAt: Date.now(),
        });
      }
      return this.recordConflict({
        kind: 'remote-unreadable',
        blocking: false,
        remote: null,
        localRevision,
        localDeviceId,
        message: `Could not read folder meta: ${read.error ?? 'unknown error'}`,
        checkedAt: Date.now(),
      });
    }

    let envelope: BackupEnvelopeMeta | null = null;
    try {
      envelope = parseBackupText(read.json ?? '').envelope;
    } catch {
      return this.recordConflict({
        kind: 'remote-unreadable',
        blocking: false,
        remote: null,
        localRevision,
        localDeviceId,
        message: 'latest.json could not be parsed as JSON.',
        checkedAt: Date.now(),
      });
    }

    if (!envelope) {
      // Legacy flat file: don't auto-act. Next live write will upgrade it.
      return this.recordConflict({
        kind: 'remote-legacy-no-envelope',
        blocking: false,
        remote: null,
        localRevision,
        localDeviceId,
        message:
          'latest.json is a legacy file with no version metadata; the next save will upgrade it.',
        checkedAt: Date.now(),
      });
    }

    // Record what we observed so future comparisons have a baseline.
    revisionTracker.setLastSeenRemote(envelope);

    const sameDevice = envelope.deviceId === localDeviceId;
    const remoteRev = envelope.revision;

    // The "expected" revision is what we last knew about remote. If that is
    // null (first run after this slice ships) we trust the just-read envelope
    // and only flag conflict when our local revision diverges significantly.
    const expectedRemoteRev = lastSeen?.envelope.revision ?? remoteRev;

    if (remoteRev === localRevision && sameDevice) {
      return this.recordConflict({
        kind: 'in-sync',
        blocking: false,
        remote: envelope,
        localRevision,
        localDeviceId,
        message: 'In sync.',
        checkedAt: Date.now(),
      });
    }

    if (sameDevice && remoteRev > localRevision) {
      // Same install (e.g. another window/profile under the same install)
      // wrote a newer file. Safe to auto-load.
      return this.recordConflict({
        kind: 'remote-newer-same-device',
        blocking: false,
        remote: envelope,
        localRevision,
        localDeviceId,
        message:
          `Remote latest.json is newer (revision ${remoteRev} vs your ${localRevision}) but was written by this device. Loading it is safe.`,
        checkedAt: Date.now(),
      });
    }

    if (sameDevice && remoteRev < localRevision) {
      return this.recordConflict({
        kind: 'local-newer-same-device',
        blocking: false,
        remote: envelope,
        localRevision,
        localDeviceId,
        message: `Your local DB is newer than latest.json (revision ${localRevision} vs ${remoteRev}). Will sync on next save.`,
        checkedAt: Date.now(),
      });
    }

    // Different device past this point.
    if (remoteRev > expectedRemoteRev && localRevision > (lastSeen?.envelope.revision ?? localRevision)) {
      // Both sides have moved since we last observed; we're diverged.
      return this.recordConflict({
        kind: 'diverged-different-device',
        blocking: true,
        remote: envelope,
        localRevision,
        localDeviceId,
        message:
          `Both this device and another device have changed data since last sync. Resolve to continue saving.`,
        checkedAt: Date.now(),
      });
    }

    if (remoteRev > localRevision || remoteRev > expectedRemoteRev) {
      return this.recordConflict({
        kind: 'remote-newer-different-device',
        blocking: true,
        remote: envelope,
        localRevision,
        localDeviceId,
        message: `latest.json was last written by another device (revision ${remoteRev}). Resolve to continue saving.`,
        checkedAt: Date.now(),
      });
    }

    // Different device but our revision is at-or-above remote: likely we just
    // came online with newer local edits; treat as local-newer.
    return this.recordConflict({
      kind: 'local-newer-same-device', // semantic: treat as safe to push
      blocking: false,
      remote: envelope,
      localRevision,
      localDeviceId,
      message:
        `Your local DB (revision ${localRevision}) is at-or-newer than latest.json (revision ${remoteRev}). Will sync on next save.`,
      checkedAt: Date.now(),
    });
  }

  /**
   * Resolve a conflict by ADOPTING the remote file. Writes a safety
   * snapshot of the current local DB into the same folder first, then
   * imports the remote envelope, then resumes normal writes.
   */
  async loadFromRemote(): Promise<{ ok: boolean; safetyRef?: string; error?: string }> {
    if (!this.hasAnySink()) return { ok: false, error: 'No backup folder configured.' };

    // 1. Read remote meta first; abort if unreadable so we don't trash local needlessly.
    const read = await readConflictMetaFromFolder();
    if (!read.ok || !read.json) {
      return { ok: false, error: read.error ?? 'No workbench.meta.json in folder.' };
    }
    const verification = verifyBackup(read.json);
    if (!verification.valid) {
      return { ok: false, error: `Remote meta file is invalid: ${verification.error}` };
    }

    // 2. Safety snapshot of CURRENT local DB into the folder.
    const safetyName = buildSafetyFilename(new Date());
    const localJson = await this.buildEnvelopedExport('manual');
    const sinks = Array.from(this.sinks.values());
    let safetyRef: string | undefined;
    for (const sink of sinks) {
      const r = await this.safeCall(() => sink.writeNamed(safetyName, localJson, 'manual'));
      if (r.ok) safetyRef = r.ref ?? safetyName;
    }
    if (!safetyRef) {
      return {
        ok: false,
        error: 'Could not write safety snapshot to backup folder; aborting to avoid data loss.',
      };
    }

    // 3. Adopt remote: reload workbench.sqlite when live folder mode, else JSON import.
    let ok = false;
    if (!this.liveBackupEnabled) {
      ok = await reloadFromFolderDatabase();
      if (ok && verification.envelope) {
        revisionTracker.setLocalRevision(verification.envelope.revision);
        revisionTracker.setLastSeenRemote(verification.envelope);
      }
    } else {
      ok = await importDB(read.json, false);
    }
    if (!ok) {
      return { ok: false, error: 'Import failed; safety snapshot was preserved.' };
    }

    this.publishStatus({ pausedReason: null, conflict: null });
    if (this.liveBackupEnabled) {
      await this.runLive('startup');
    } else {
      const { flushLiveDatabaseNow } = await import('./storage/sqlite/folderPersistence');
      await flushLiveDatabaseNow();
    }

    return { ok: true, safetyRef };
  }

  /**
   * Resolve a conflict by KEEPING local. Bypasses the pause flag and
   * immediately writes our state to remote.
   */
  async forcePushLocal(): Promise<{ ok: boolean; error?: string }> {
    if (!this.hasAnySink()) return { ok: false, error: 'No backup folder configured.' };
    this.publishStatus({ pausedReason: null, conflict: null });
    if (!this.liveBackupEnabled) {
      const { flushLiveDatabaseNow } = await import('./storage/sqlite/folderPersistence');
      const res = await flushLiveDatabaseNow();
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }
    const summary = await this.runOnce({
      kind: 'live',
      reason: 'force-push',
      target: { mode: 'latest-only' },
    });
    if (!summary.ok) {
      const firstErr = summary.outcomes.find((o) => !o.result.ok)?.result.error ?? 'Unknown error';
      return { ok: false, error: firstErr };
    }
    return { ok: true };
  }

  // --- internals -------------------------------------------------------------

  private recordConflict(info: BackupConflictInfo): BackupConflictInfo {
    const patch: Partial<BackupStatusSnapshot> = { conflict: info };
    if (info.blocking) {
      patch.pausedReason = info.message;
    } else if (this.status.pausedReason && this.status.conflict?.blocking) {
      // Previously blocked but the new check is non-blocking: lift pause.
      patch.pausedReason = null;
    }
    this.publishStatus(patch);
    return info;
  }

  private async runLive(
    reason: DataChangeReason | 'startup' | 'force-push'
  ): Promise<BackupRunSummary | null> {
    if (!this.hasAnySink()) {
      this.publishStatus({ livePending: false });
      return null;
    }
    return this.runOnce({ kind: 'live', reason, target: { mode: 'latest-only' } });
  }

  private async runOnce(args: {
    kind: BackupKind;
    reason: DataChangeReason | 'manual' | 'scheduled' | 'startup' | 'force-push';
    target:
      | { mode: 'latest-only' }
      | { mode: 'named-only'; filename: string }
      | { mode: 'named-and-latest'; filename: string };
  }): Promise<BackupRunSummary> {
    if (this.inFlight) {
      // Coalesce: a write is already happening. Re-arm a debounced live
      // pass so any state change since this call is still captured.
      if (args.kind === 'live') this.scheduleLive(args.reason as DataChangeReason);
      return {
        kind: args.kind,
        reason: args.reason,
        at: Date.now(),
        outcomes: [],
        ok: false,
      };
    }

    this.inFlight = true;
    this.publishStatus({ inFlight: true, livePending: false });

    const summary: BackupRunSummary = {
      kind: args.kind,
      reason: args.reason,
      at: Date.now(),
      outcomes: [],
      ok: false,
    };

    try {
      const writerKind: BackupWriterKind = args.kind;
      const json = await this.buildEnvelopedExport(writerKind);
      const sinks = Array.from(this.sinks.values());

      // Snapshot the envelope we used so we can stamp lastSeenRemote on success.
      const writtenEnvelope: BackupEnvelopeMeta = {
        format: 'workbench-backup',
        schemaVersion: 1,
        exportedAt: summary.at,
        revision: revisionTracker.getLocalRevisionSync(),
        deviceId: revisionTracker.getDeviceIdSync(),
        writerKind,
      };

      for (const sink of sinks) {
        const outcome = await this.dispatchToSink(sink, json, args);
        summary.outcomes.push({ sinkId: sink.id, result: outcome });
      }

      summary.ok = summary.outcomes.some((o) => o.result.ok);

      if (summary.ok) {
        // We just wrote our state to remote, so remote == local until proven otherwise.
        revisionTracker.setLastSeenRemote(writtenEnvelope);
        if (args.kind === 'manual') {
          this.publishStatus({ lastManualOkAt: summary.at });
        } else {
          this.publishStatus({ lastLiveOkAt: summary.at });
        }
      }

      const failures = summary.outcomes.filter((o) => !o.result.ok);
      if (failures.length > 0) {
        const firstError = failures[0]?.result.error ?? 'Unknown sink error';
        this.publishStatus({ lastErrorAt: summary.at, lastError: firstError });
      }

      return summary;
    } catch (e) {
      const err = String(e);
      this.publishStatus({ lastErrorAt: Date.now(), lastError: err });
      summary.outcomes.push({ sinkId: 'coordinator', result: { ok: false, error: err } });
      return summary;
    } finally {
      this.inFlight = false;
      this.publishStatus({ inFlight: false });
    }
  }

  private async buildEnvelopedExport(writerKind: BackupWriterKind): Promise<string> {
    const dataJson = await exportDB();
    return wrapExport(dataJson, {
      revision: revisionTracker.getLocalRevisionSync(),
      deviceId: revisionTracker.getDeviceIdSync(),
      writerKind,
      exportedAt: Date.now(),
    });
  }

  private async safeCall(fn: () => Promise<BackupWriteResult>): Promise<BackupWriteResult> {
    try {
      return await fn();
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  private async dispatchToSink(
    sink: BackupSink,
    json: string,
    args: {
      kind: BackupKind;
      target:
        | { mode: 'latest-only' }
        | { mode: 'named-only'; filename: string }
        | { mode: 'named-and-latest'; filename: string };
    }
  ): Promise<BackupWriteResult> {
    try {
      switch (args.target.mode) {
        case 'latest-only':
          return await sink.writeLatest(json, args.kind);
        case 'named-only':
          return await sink.writeNamed(args.target.filename, json, args.kind);
        case 'named-and-latest': {
          const named = await sink.writeNamed(args.target.filename, json, args.kind);
          if (!named.ok) return named;
          // Best-effort latest refresh; surface error if latest fails but
          // keep the named result as authoritative for UI ref.
          const latest = await sink.writeLatest(json, args.kind);
          if (!latest.ok) {
            return {
              ok: true,
              ref: named.ref,
              error: `Named backup ok (${named.ref}); refresh of latest failed: ${latest.error ?? 'unknown'}`,
            };
          }
          return { ok: true, ref: named.ref };
        }
      }
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  private publishStatus(patch: Partial<BackupStatusSnapshot>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of Array.from(this.statusListeners)) {
      try {
        listener(this.getStatus());
      } catch (e) {
        console.error('Backup status listener threw:', e);
      }
    }
  }
}

/** Filename: `manual-2026-05-02_215700.json` (local time, sortable). */
export function buildManualFilename(now: Date): string {
  return `manual-${stampLocal(now)}.json`;
}

/** Filename: `safety-before-import-2026-05-02_215700.json`. */
export function buildSafetyFilename(now: Date): string {
  return `safety-before-import-${stampLocal(now)}.json`;
}

function stampLocal(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const mo = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${y}-${mo}-${d}_${h}${mi}${s}`;
}

/** Process-wide singleton. */
export const backupCoordinator = new BackupCoordinatorImpl();
