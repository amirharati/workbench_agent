let ownerReady = false;
const ownerReadyWaiters = new Set<() => void>();
const ownerReadyRejecters = new Set<(err: Error) => void>();

export function markDbOwnerReady(): void {
  if (ownerReady) return;
  ownerReady = true;
  for (const wake of ownerReadyWaiters) wake();
  ownerReadyWaiters.clear();
  ownerReadyRejecters.clear();
}

export function resetDbOwnerReady(): void {
  ownerReady = false;
}

function rejectDbOwnerWaiters(err: Error): void {
  for (const reject of ownerReadyRejecters) reject(err);
  ownerReadyWaiters.clear();
  ownerReadyRejecters.clear();
}

function waitForDbOwnerReady(timeoutMs: number): Promise<void> {
  if (ownerReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ownerReadyWaiters.delete(wake);
      ownerReadyRejecters.delete(fail);
      reject(new Error('DB worker bootstrap timed out'));
    }, timeoutMs);
    const wake = () => {
      window.clearTimeout(timer);
      ownerReadyWaiters.delete(wake);
      ownerReadyRejecters.delete(fail);
      resolve();
    };
    const fail = (err: Error) => {
      window.clearTimeout(timer);
      ownerReadyWaiters.delete(wake);
      ownerReadyRejecters.delete(fail);
      reject(err);
    };
    ownerReadyWaiters.add(wake);
    ownerReadyRejecters.add(fail);
  });
}

function isRecoverableDbOwnerError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return (
    msg.includes('no response from db owner') ||
    msg.includes('db worker bootstrap timed out') ||
    msg.includes('db worker bootstrap failed') ||
    msg.includes('could not establish connection') ||
    msg.includes('receiving end does not exist')
  );
}

export function isTransientDbRpcError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return isRecoverableDbOwnerError(error) || msg.includes('sqlite database is not open');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'db-owner-ready') {
      markDbOwnerReady();
      return;
    }
    if (message?.type === 'db-owner-error') {
      resetDbOwnerReady();
      rejectDbOwnerWaiters(new Error(message.error ?? 'DB worker bootstrap failed'));
      return;
    }
    if (message?.type === 'db-owner-lost') {
      resetDbOwnerReady();
      return;
    }
    if (message?.type === 'db-data-changed') {
      void import('./remoteStore').then(({ getRemoteStore }) => {
        const store = getRemoteStore();
        const remoteRev = typeof message.revision === 'number' ? message.revision : undefined;
        void store.drainWrites().then(() => {
          if (store.hasWritesInFlight()) return;
          void store.hydrateIfBehind(remoteRev);
        });
      });
    }
  });
}

export async function ensureDbWorker(): Promise<void> {
  if (ownerReady) return;
  const readyWait = waitForDbOwnerReady(60_000);
  const response = await chrome.runtime.sendMessage({
    target: 'db-rpc',
    id: 0,
    method: 'ping',
    args: [],
  });
  if (!response?.ok) {
    throw new Error(response?.error ?? 'DB worker did not start');
  }
  await readyWait;
}

export async function dbRpc<T>(method: string, args: unknown[]): Promise<T> {
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await ensureDbWorker();
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const response = await chrome.runtime.sendMessage({
        target: 'db-rpc',
        id,
        method,
        args,
      });
      if (!response?.ok) {
        throw new Error(response?.error ?? `RPC ${method} failed`);
      }
      return response.result as T;
    } catch (e) {
      const msg = String(e);
      const sizeLimit =
        msg.includes('64MiB') ||
        msg.includes('maximum allowed size') ||
        msg.includes('Message length exceeded');
      if (sizeLimit) {
        throw new Error(
          'Database transfer exceeded Chrome message size limit. Rebuild the extension and use Settings restore (stages via backup folder) or re-link your backup folder.'
        );
      }
      const canRetry = attempt < maxAttempts - 1 && isTransientDbRpcError(e);
      if (!canRetry) throw e;
      if (isRecoverableDbOwnerError(e)) resetDbOwnerReady();
      await sleep(150 * (attempt + 1));
    }
  }
  throw new Error(`RPC ${method} failed after retry`);
}

export async function mirrorNow(
  force = false,
  opts?: { allowEmptyMirror?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  return dbRpc('mirrorNow', [{ force, allowEmptyMirror: opts?.allowEmptyMirror }]);
}

/** Soft-schedule the worker's debounced folder mirror (few seconds; not a forced dump). */
export async function scheduleFolderMirror(): Promise<{ ok: boolean }> {
  return dbRpc('scheduleFolderMirror', []);
}

/** Full ai_item_signals rows (including embeddings) for a small id set — worker only. */
export async function getSignalsByItemIds<T = unknown>(itemIds: string[]): Promise<T[]> {
  if (!itemIds.length) return [];
  return dbRpc('getSignalsByItemIds', [itemIds]);
}

/** Block auto folder exports while a digest is running. */
export async function pauseAutoMirrorForDigest(): Promise<{ ok: boolean }> {
  return dbRpc('pauseAutoMirrorForDigest', []);
}

/** Resume auto mirrors after digest + cooldown, then soft catch-up. */
export async function resumeAutoMirrorAfterDigest(
  cooldownMs?: number
): Promise<{ ok: boolean }> {
  return dbRpc('resumeAutoMirrorAfterDigest', cooldownMs != null ? [cooldownMs] : []);
}

export type DbWorkerStatus = {
  storageMode: string;
  revision: number;
  deviceId: string;
  lastMirrorAt: number;
  lastMirroredRevision: number;
  mirrorPending: boolean;
  lastMirrorError: string | null;
};

export async function getDbWorkerStatus(): Promise<DbWorkerStatus> {
  const status = await dbRpc<Omit<DbWorkerStatus, 'lastMirrorError'> & { lastMirrorError?: string | null }>(
    'getStatus',
    []
  );
  return {
    ...status,
    lastMirrorError: status.lastMirrorError ?? null,
  };
}

export { getRemoteStore, resetRemoteStore } from './remoteStore';
export { isDbWorkerProcess } from '../dbWorker/env';
