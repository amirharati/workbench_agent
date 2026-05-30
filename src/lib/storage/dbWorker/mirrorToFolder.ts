/**
 * Debounced folder mirror — worker schedules, offscreen writes bytes.
 */

import { revisionTracker } from '../../revisionTracker';
import { normalizeBinaryPayload } from '../../binaryPayload';

const DEBOUNCE_MS = 3000;
/** Min time between automatic folder writes (forced mirrorNow bypasses this). */
const MIN_INTERVAL_MS = 15_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastMirrorAt = 0;
let lastMirroredRevision = -1;
let lastMirrorError: string | null = null;
let mirrorInFlight = false;
let pendingForce = false;
const mirrorWaiters: Array<(result: { ok: boolean; error?: string }) => void> = [];

export type MirrorExportFn = () => Promise<Uint8Array>;
export type MirrorWriteFn = (
  bytes: Uint8Array,
  revision: number
) => Promise<{ ok: boolean; error?: string }>;

let exportFn: MirrorExportFn | null = null;
let writeFn: MirrorWriteFn | null = null;
let getRevisionFn: (() => number) | null = null;

export function configureFolderMirror(opts: {
  exportDatabase: MirrorExportFn;
  writeToFolder: MirrorWriteFn;
  getRevision: () => number;
}): void {
  exportFn = opts.exportDatabase;
  writeFn = opts.writeToFolder;
  getRevisionFn = opts.getRevision;
}

function scheduleFolderMirrorAfter(delayMs: number): void {
  const delay = Math.max(0, Math.ceil(delayMs));
  if (debounceTimer != null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runFolderMirror(false);
  }, delay);
}

export function scheduleFolderMirror(): void {
  scheduleFolderMirrorAfter(DEBOUNCE_MS);
}

function notifyMirrorWaiters(result: { ok: boolean; error?: string }): void {
  const waiters = mirrorWaiters.splice(0);
  for (const resolve of waiters) resolve(result);
}

export async function mirrorNow(force = false): Promise<{ ok: boolean; error?: string }> {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingForce = pendingForce || force;
  return runFolderMirror(force || pendingForce);
}

async function runFolderMirror(force: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!exportFn || !writeFn || !getRevisionFn) {
    return { ok: false, error: 'Mirror not configured' };
  }
  if (mirrorInFlight) {
    if (force) {
      pendingForce = true;
      return new Promise((resolve) => {
        mirrorWaiters.push(resolve);
      });
    }
    scheduleFolderMirror();
    return { ok: true };
  }

  // Tab bumps revision in meta kv; worker must re-read (separate JS heap).
  await revisionTracker.refreshFromStorage();
  const revision = revisionTracker.getLocalRevisionSync();
  if (!force && revision === lastMirroredRevision) {
    return { ok: true };
  }

  const now = Date.now();
  if (!force && now - lastMirrorAt < MIN_INTERVAL_MS) {
    // Edits coalesce in OPFS immediately; folder write waits out the min interval,
    // then flushes the latest revision even if the user stopped editing.
    const remaining = lastMirrorAt + MIN_INTERVAL_MS - now;
    scheduleFolderMirrorAfter(Math.max(DEBOUNCE_MS, remaining));
    return { ok: true };
  }

  mirrorInFlight = true;
  pendingForce = false;
  let result: { ok: boolean; error?: string } = { ok: true };
  try {
    const raw = await exportFn();
    const bytes = normalizeBinaryPayload(raw);
    if (!bytes || bytes.byteLength < 16) {
      result = { ok: false, error: 'Export produced empty database' };
      lastMirrorError = result.error ?? 'Export produced empty database';
      return result;
    }
    const res = await writeFn(bytes, revision);
    if (res.ok) {
      lastMirrorAt = Date.now();
      lastMirroredRevision = revision;
      lastMirrorError = null;
      result = res;
    } else {
      lastMirrorError = res.error ?? 'Mirror write failed';
      result = res;
      if (revision !== lastMirroredRevision) {
        scheduleFolderMirrorAfter(DEBOUNCE_MS);
      }
    }
    return result;
  } catch (e) {
    lastMirrorError = String(e);
    result = { ok: false, error: String(e) };
    return result;
  } finally {
    mirrorInFlight = false;
    if (pendingForce) {
      pendingForce = false;
      const forced = await runFolderMirror(true);
      notifyMirrorWaiters(forced);
    } else {
      notifyMirrorWaiters(result);
    }
  }
}

export function getMirrorStatus(): {
  lastMirrorAt: number;
  lastMirroredRevision: number;
  pending: boolean;
  lastMirrorError: string | null;
} {
  return {
    lastMirrorAt,
    lastMirroredRevision,
    pending: debounceTimer != null || mirrorInFlight || mirrorWaiters.length > 0,
    lastMirrorError,
  };
}
