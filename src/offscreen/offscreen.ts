/**
 * Offscreen document — hosts the DB worker and writes folder mirrors.
 */

import DbWorker from '../lib/storage/dbWorker/worker.ts?worker';
import { wrapExport } from '../lib/backupEnvelope';
import { encodeBinaryForRpc, normalizeBinaryPayload } from '../lib/binaryPayload';
import {
  WORKBENCH_DB_FILE,
  WORKBENCH_META_FILE,
  hasWritableBackupFolder,
  readBinaryFromBackupFolder,
  writeBinaryAtomicallyToBackupFolder,
  writeJsonAtomicallyToBackupFolder,
} from '../lib/backupFolder';
import { revisionTracker } from '../lib/revisionTracker';

const worker = new DbWorker({ name: 'workbench-db' });

let bootstrapComplete = false;
let bootstrapInFlight = false;
let rpcId = 1;
const pendingRpc = new Map<number, (msg: WorkerResponse) => void>();

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: 'worker-ready' }
  | { type: 'mirror-bytes'; bytes: Uint8Array; revision: number }
  | { type: 'data-changed'; revision: number };

async function writeMirrorToFolder(
  bytes: Uint8Array,
  revision: number
): Promise<{ ok: boolean; error?: string }> {
  if (!(await hasWritableBackupFolder())) {
    return { ok: false, error: 'No backup folder configured' };
  }
  const payload = normalizeBinaryPayload(bytes);
  if (!payload || payload.byteLength < 16) {
    return { ok: false, error: 'Export produced empty database' };
  }
  const binRes = await writeBinaryAtomicallyToBackupFolder(WORKBENCH_DB_FILE, payload);
  if (!binRes.ok) {
    return binRes;
  }
  await revisionTracker.load();
  const metaJson = wrapExport(JSON.stringify({ _liveMeta: true }), {
    revision,
    deviceId: revisionTracker.getDeviceIdSync(),
    writerKind: 'live',
  });
  const metaRes = await writeJsonAtomicallyToBackupFolder(WORKBENCH_META_FILE, metaJson);
  if (!metaRes.ok) {
    console.warn('[DB owner] workbench.sqlite saved but meta write failed:', metaRes.error);
  }
  return { ok: true };
}

async function bootstrapFromFolderIfNeeded(): Promise<void> {
  if (!(await hasWritableBackupFolder())) return;
  const primary = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  const bytes =
    primary.ok && primary.data && primary.data.byteLength > 16 ? primary.data : null;
  if (!bytes) return;
  await workerRpc('bootstrapFromFolderBytes', [encodeBinaryForRpc(bytes)]);
}

function workerRpc(method: string, args: unknown[]): Promise<unknown> {
  const id = rpcId++;
  return new Promise((resolve, reject) => {
    pendingRpc.set(id, (msg) => {
      if ('id' in msg && msg.id === id) {
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error));
      }
    });
    worker.postMessage({ id, method, args });
  });
}

worker.onmessage = async (event: MessageEvent<WorkerResponse>) => {
  const msg = event.data;
  if (msg && typeof msg === 'object' && 'type' in msg) {
    if (msg.type === 'worker-ready') {
      bootstrapInFlight = true;
      try {
        await bootstrapFromFolderIfNeeded();
        bootstrapComplete = true;
        chrome.runtime.sendMessage({ type: 'db-owner-ready' }).catch(() => {});
      } catch (e) {
        console.error('[DB owner] bootstrap failed:', e);
        chrome.runtime
          .sendMessage({ type: 'db-owner-error', error: String(e) })
          .catch(() => {});
      } finally {
        bootstrapInFlight = false;
      }
      return;
    }
    if (msg.type === 'mirror-bytes') {
      const result = await writeMirrorToFolder(msg.bytes, msg.revision);
      worker.postMessage({
        type: 'mirror-ack',
        ok: result.ok,
        error: result.error,
        at: Date.now(),
      });
      return;
    }
    if (msg.type === 'data-changed') {
      chrome.runtime
        .sendMessage({ type: 'db-data-changed', revision: msg.revision })
        .catch(() => {});
      return;
    }
  }
  if (msg && typeof msg === 'object' && 'id' in msg) {
    const handler = pendingRpc.get(msg.id);
    if (handler) {
      pendingRpc.delete(msg.id);
      handler(msg);
    }
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'db-owner') return false;
  const { id, method, args } = message;
  if (method === 'ping' && bootstrapComplete && !bootstrapInFlight) {
    chrome.runtime.sendMessage({ type: 'db-owner-ready' }).catch(() => {});
  }
  workerRpc(method, args ?? [])
    .then((result) => {
      sendResponse({ id, ok: true, result });
      if (method !== 'ping' && method !== 'getStatus' && method !== 'hydrate') {
        chrome.runtime.sendMessage({ type: 'db-data-changed' }).catch(() => {});
      }
    })
    .catch((e) => {
      sendResponse({ id, ok: false, error: String(e) });
    });
  return true;
});

console.log('[DB owner] Offscreen document started');
