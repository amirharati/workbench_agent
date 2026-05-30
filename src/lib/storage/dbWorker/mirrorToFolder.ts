/**
 * Debounced folder mirror — worker schedules, offscreen writes bytes.
 */

import { revisionTracker } from '../../revisionTracker';

const DEBOUNCE_MS = 3000;
const MIN_INTERVAL_MS = 60_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastMirrorAt = 0;
let lastMirroredRevision = -1;
let mirrorInFlight = false;
let pendingForce = false;

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

export function scheduleFolderMirror(): void {
  if (debounceTimer != null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runFolderMirror(false);
  }, DEBOUNCE_MS);
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
    scheduleFolderMirror();
    return { ok: true };
  }

  // Tab bumps revision in meta kv; reload so mirror metadata matches folder sidecar.
  await revisionTracker.load();
  const revision = revisionTracker.getLocalRevisionSync();
  if (!force && revision === lastMirroredRevision) {
    return { ok: true };
  }

  const now = Date.now();
  if (!force && now - lastMirrorAt < MIN_INTERVAL_MS) {
    scheduleFolderMirror();
    return { ok: true };
  }

  mirrorInFlight = true;
  pendingForce = false;
  try {
    const bytes = await exportFn();
    if (!bytes || bytes.byteLength < 16) {
      return { ok: false, error: 'Export produced empty database' };
    }
    const res = await writeFn(bytes, revision);
    if (res.ok) {
      lastMirrorAt = Date.now();
      lastMirroredRevision = revision;
    }
    return res;
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    mirrorInFlight = false;
  }
}

export function getMirrorStatus(): {
  lastMirrorAt: number;
  lastMirroredRevision: number;
  pending: boolean;
} {
  return {
    lastMirrorAt,
    lastMirroredRevision,
    pending: debounceTimer != null || mirrorInFlight,
  };
}
