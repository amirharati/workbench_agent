/**
 * Offscreen document — hosts the DB worker and writes folder mirrors.
 */

import DbWorker from '../lib/storage/dbWorker/worker.ts?worker';
import { wrapExport } from '../lib/backupEnvelope';
import {
  WORKBENCH_DB_FILE,
  WORKBENCH_META_FILE,
  hasWritableBackupFolder,
  readBinaryFromBackupFolder,
  writeBinaryToBackupFolder,
  writeJsonToBackupFolder,
} from '../lib/backupFolder';
import { revisionTracker } from '../lib/revisionTracker';

const worker = new DbWorker({ name: 'workbench-db' });

let rpcId = 1;
const pendingRpc = new Map<number, (msg: WorkerResponse) => void>();

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: 'worker-ready' }
  | { type: 'mirror-bytes'; bytes: Uint8Array; revision: number }
  | { type: 'data-changed'; revision: number };

async function writeMirrorToFolder(bytes: Uint8Array, revision: number): Promise<void> {
  if (!(await hasWritableBackupFolder())) {
    console.warn('[DB owner] No backup folder for mirror write');
    return;
  }
  const binRes = await writeBinaryToBackupFolder(WORKBENCH_DB_FILE, bytes);
  if (!binRes.ok) {
    console.error('[DB owner] Mirror write failed:', binRes.error);
    return;
  }
  await revisionTracker.load();
  const metaJson = wrapExport(JSON.stringify({ _liveMeta: true }), {
    revision,
    deviceId: revisionTracker.getDeviceIdSync(),
    writerKind: 'live',
  });
  const metaRes = await writeJsonToBackupFolder(WORKBENCH_META_FILE, metaJson);
  if (!metaRes.ok) {
    console.warn('[DB owner] workbench.sqlite saved but meta write failed:', metaRes.error);
  }
}

async function bootstrapFromFolderIfNeeded(): Promise<void> {
  if (!(await hasWritableBackupFolder())) return;
  const primary = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  const bytes =
    primary.ok && primary.data && primary.data.byteLength > 16 ? primary.data : null;
  if (!bytes) return;
  await workerRpc('bootstrapFromFolderBytes', [bytes]);
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
      try {
        await bootstrapFromFolderIfNeeded();
      } catch (e) {
        console.error('[DB owner] bootstrap failed:', e);
      }
      chrome.runtime.sendMessage({ type: 'db-owner-ready' }).catch(() => {});
      return;
    }
    if (msg.type === 'mirror-bytes') {
      await writeMirrorToFolder(msg.bytes, msg.revision);
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
