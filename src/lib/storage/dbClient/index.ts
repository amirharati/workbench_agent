let ownerReady = false;

export function markDbOwnerReady(): void {
  ownerReady = true;
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'db-owner-ready') {
      markDbOwnerReady();
      return;
    }
    if (message?.type === 'db-data-changed') {
      void import('./remoteStore').then(({ getRemoteStore }) => {
        const store = getRemoteStore();
        if (typeof message.revision === 'number') store.setRevision(message.revision);
        void store.hydrate(true);
      });
    }
  });
}

export async function ensureDbWorker(): Promise<void> {
  if (ownerReady) return;
  const response = await chrome.runtime.sendMessage({
    target: 'db-rpc',
    id: 0,
    method: 'ping',
    args: [],
  });
  if (!response?.ok) {
    throw new Error(response?.error ?? 'DB worker did not start');
  }
  markDbOwnerReady();
}

export async function dbRpc<T>(method: string, args: unknown[]): Promise<T> {
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
}

export async function mirrorNow(force = false): Promise<{ ok: boolean; error?: string }> {
  return dbRpc('mirrorNow', [{ force }]);
}

export { getRemoteStore, resetRemoteStore } from './remoteStore';
export { isDbWorkerProcess } from '../dbWorker/env';
