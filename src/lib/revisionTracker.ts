/**
 * RevisionTracker
 * ---------------
 * Maintains the bookkeeping needed to compare local DB state to a remote
 * backup file (`latest.json`) and decide whether they're in sync.
 *
 * State (persisted in meta DB `kv` store):
 *   - `deviceId`               : UUID, generated once per install.
 *   - `localRevision`          : monotonic counter; bumps on every successful
 *                                local DB mutation EXCEPT `import.replace`
 *                                (an import sets the value to the remote's
 *                                revision rather than incrementing it).
 *   - `lastSeenRemote`         : the envelope metadata of the file we most
 *                                recently observed at the remote. Updated
 *                                after a successful local write (we know
 *                                what we just put there) and after reading
 *                                the file at startup or import.
 *
 * Why not keep these in the main DB?
 *   - Main DB carries user data and goes through schema migrations. Backup
 *     bookkeeping is a different lifecycle and benefits from being
 *     blast-isolated in a separate database (`metaDb.ts`).
 *
 * Concurrency:
 *   - The in-memory copy is the source of truth at runtime. Persistence to
 *     IndexedDB is fire-and-forget but serialized via a single promise
 *     chain so writes can't race or interleave.
 *   - The coordinator always reads the in-memory value when stamping an
 *     envelope, so persistence lag never produces a stale revision in a
 *     newly-written backup.
 */

import { kvGet, kvPut } from './metaDb';
import {
  subscribeToDataChanges,
  DataChangeEvent,
  DataChangeReason,
} from './dataChangeNotifier';
import type { BackupEnvelopeMeta } from './backupEnvelope';

const KV_DEVICE_ID = 'backup.deviceId';
const KV_LOCAL_REVISION = 'backup.localRevision';
const KV_LAST_SEEN_REMOTE = 'backup.lastSeenRemote';

export interface RemoteSnapshotInfo {
  /** The full envelope metadata of the remote file we last observed. */
  envelope: BackupEnvelopeMeta;
  /** When we observed it (UTC ms). */
  observedAt: number;
}

function generateDeviceId(): string {
  // crypto.randomUUID is available in modern browsers and the extension
  // environment; we already use it elsewhere in db.ts.
  const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `dev_${id}`;
}

class RevisionTrackerImpl {
  private deviceId: string | null = null;
  private localRevision = 0;
  private lastSeenRemote: RemoteSnapshotInfo | null = null;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  // Serialize all writes so we can't reorder PUTs to the same key.
  private writeChain: Promise<void> = Promise.resolve();
  private dataUnsub: (() => void) | null = null;

  /** Idempotent. Call once at app startup. */
  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.doLoad();
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  /**
   * Re-read revision (and lastSeenRemote) from meta kv.
   * Required in the DB worker: the UI tab bumps revision; worker memory goes stale after first load().
   */
  async refreshFromStorage(): Promise<void> {
    await this.load();
    const [storedRevision, storedRemote] = await Promise.all([
      kvGet<number>(KV_LOCAL_REVISION),
      kvGet<RemoteSnapshotInfo>(KV_LAST_SEEN_REMOTE),
    ]);
    if (typeof storedRevision === 'number' && Number.isFinite(storedRevision)) {
      this.localRevision = storedRevision;
    }
    if (storedRemote && typeof storedRemote === 'object') {
      this.lastSeenRemote = storedRemote;
    }
  }

  private async doLoad(): Promise<void> {
    const [storedDeviceId, storedRevision, storedRemote] = await Promise.all([
      kvGet<string>(KV_DEVICE_ID),
      kvGet<number>(KV_LOCAL_REVISION),
      kvGet<RemoteSnapshotInfo>(KV_LAST_SEEN_REMOTE),
    ]);

    if (typeof storedDeviceId === 'string' && storedDeviceId.length > 0) {
      this.deviceId = storedDeviceId;
    } else {
      this.deviceId = generateDeviceId();
      this.queueWrite(() => kvPut(KV_DEVICE_ID, this.deviceId));
    }

    this.localRevision = typeof storedRevision === 'number' && Number.isFinite(storedRevision)
      ? storedRevision
      : 0;

    this.lastSeenRemote = storedRemote && typeof storedRemote === 'object' ? storedRemote : null;

    this.loaded = true;
  }

  /** Subscribe to data-change events. Idempotent. */
  start(): void {
    if (this.dataUnsub) return;
    this.dataUnsub = subscribeToDataChanges((event) => this.onDataChange(event));
  }

  /** Tear-down hook for tests. */
  stop(): void {
    if (this.dataUnsub) {
      this.dataUnsub();
      this.dataUnsub = null;
    }
  }

  // --- public read accessors --------------------------------------------------

  /** Synchronous: assumes `load()` already resolved. */
  getDeviceIdSync(): string {
    if (!this.deviceId) {
      throw new Error('RevisionTracker not loaded yet — call load() first');
    }
    return this.deviceId;
  }

  getLocalRevisionSync(): number {
    return this.localRevision;
  }

  getLastSeenRemoteSync(): RemoteSnapshotInfo | null {
    return this.lastSeenRemote;
  }

  // --- mutators (all persist async via the write chain) -----------------------

  /**
   * Set local revision to an explicit value. Used by importDB after restoring
   * an enveloped backup so we register that we are now AT the remote's state
   * (rather than incrementing past it).
   */
  setLocalRevision(rev: number): void {
    if (!Number.isFinite(rev) || rev < 0) return;
    this.localRevision = rev;
    this.queueWrite(() => kvPut(KV_LOCAL_REVISION, this.localRevision));
  }

  /**
   * Record what we know about the remote backup file. Called:
   *   - After a successful local write (we know we just put this there).
   *   - After reading remote at startup / on conflict resolution.
   *   - After importing remote (so we know we are at that revision).
   */
  setLastSeenRemote(envelope: BackupEnvelopeMeta): void {
    this.lastSeenRemote = { envelope, observedAt: Date.now() };
    const snapshot = this.lastSeenRemote;
    this.queueWrite(() => kvPut(KV_LAST_SEEN_REMOTE, snapshot));
  }

  /** Forget what we knew about the remote (e.g. user changed folders). */
  clearLastSeenRemote(): void {
    this.lastSeenRemote = null;
    this.queueWrite(() => kvPut(KV_LAST_SEEN_REMOTE, null));
  }

  // --- internals --------------------------------------------------------------

  private onDataChange(event: DataChangeEvent): void {
    // Imports already place us at a known revision; bumping here would
    // make us look like we've diverged from remote even though we're in sync.
    if (event.reason === ('import.replace' as DataChangeReason)) return;
    this.bumpLocalRevision();
  }

  private bumpLocalRevision(): void {
    this.localRevision += 1;
    this.queueWrite(() => kvPut(KV_LOCAL_REVISION, this.localRevision));
  }

  private queueWrite(write: () => Promise<unknown>): void {
    this.writeChain = this.writeChain.then(
      async () => {
        try {
          await write();
        } catch (e) {
          console.error('RevisionTracker persistence failed:', e);
        }
      },
      // If a previous write threw, swallow so the chain keeps flowing.
      () => undefined
    );
  }
}

/** Process-wide singleton. */
export const revisionTracker = new RevisionTrackerImpl();
