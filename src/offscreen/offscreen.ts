/**
 * Offscreen document — hosts the DB worker and writes folder mirrors.
 */

import DbWorker from '../lib/storage/dbWorker/worker.ts?worker';
import { wrapExport } from '../lib/backupEnvelope';
import { normalizeBinaryPayload } from '../lib/binaryPayload';
import {
  WORKBENCH_DB_FILE,
  WORKBENCH_META_FILE,
  hasWritableBackupFolder,
  readBinaryFromBackupFolder,
  writeBinaryAtomicallyToBackupFolder,
  writeJsonAtomicallyToBackupFolder,
} from '../lib/backupFolder';
import { revisionTracker } from '../lib/revisionTracker';
import { wouldMirrorShrinkWorkbenchSqlite } from '../lib/folderMirrorGuard';

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
  const existing = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  if (existing.ok && existing.data && existing.data.byteLength > 16) {
    const blocked = wouldMirrorShrinkWorkbenchSqlite(existing.data, payload);
    if (blocked) {
      console.error('[DB owner] mirror blocked:', blocked);
      return { ok: false, error: blocked };
    }
    // Last-resort recovery copy before any allowed overwrite of an existing file.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safetyName = `safety-before-mirror-${stamp}.sqlite`;
    const safety = await writeBinaryAtomicallyToBackupFolder(safetyName, existing.data, {
      allowWorkbenchShrink: true,
    });
    if (!safety.ok) {
      console.warn('[DB owner] could not write safety-before-mirror copy:', safety.error);
    }
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
  // Transferable ArrayBuffer — never base64 (large DBs exceed message limits).
  await workerRpcBinary('forceImportFromFolderBytes', bytes);
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

/** Import/inspect large sqlite bytes via transferable buffer (no base64 bloat). */
function workerRpcBinary(method: string, bytes: Uint8Array): Promise<unknown> {
  const id = rpcId++;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Promise((resolve, reject) => {
    pendingRpc.set(id, (msg) => {
      if ('id' in msg && msg.id === id) {
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error));
      }
    });
    worker.postMessage({ id, method, args: [copy.buffer] }, [copy.buffer]);
  });
}

type FolderFileWorkerMethod = 'bootstrapFromFolderBytes' | 'forceImportFromFolderBytes' | 'inspectImportBytes';

const FOLDER_FILE_RPC: Record<string, FolderFileWorkerMethod> = {
  bootstrapFromBackupFolderFile: 'bootstrapFromFolderBytes',
  forceImportFromBackupFolderFile: 'forceImportFromFolderBytes',
  inspectImportFromBackupFolderFile: 'inspectImportBytes',
};

async function rpcFromBackupFolderFile(
  rpcMethod: string,
  filename: string
): Promise<unknown> {
  const workerMethod = FOLDER_FILE_RPC[rpcMethod];
  if (!workerMethod) {
    throw new Error(`Unknown folder-file RPC: ${rpcMethod}`);
  }
  const primary = await readBinaryFromBackupFolder(filename);
  if (!primary.ok) {
    throw new Error(primary.error ?? `Could not read ${filename} from backup folder`);
  }
  if (primary.notFound || !primary.data || primary.data.byteLength < 16) {
    if (workerMethod === 'inspectImportBytes') {
      return { maxUpdatedAt: 0, itemCount: 0, notesRowCount: 0, itemsWithNotes: 0 };
    }
    return { imported: false, reason: 'empty' };
  }
  return workerRpcBinary(workerMethod, primary.data);
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

  const folderRpc = typeof method === 'string' ? FOLDER_FILE_RPC[method] : undefined;
  if (folderRpc) {
    const filename = String(args?.[0] ?? WORKBENCH_DB_FILE);
    rpcFromBackupFolderFile(method, filename)
      .then((result) => {
        sendResponse({ id, ok: true, result });
        if (method !== 'inspectImportFromBackupFolderFile') {
          chrome.runtime.sendMessage({ type: 'db-data-changed' }).catch(() => {});
        }
      })
      .catch((e) => {
        sendResponse({ id, ok: false, error: String(e) });
      });
    return true;
  }

  workerRpc(method, args ?? [])
    .then((result) => {
      sendResponse({ id, ok: true, result });
      const readOnly =
        method === 'ping' ||
        method === 'getStatus' ||
        method === 'hydrate' ||
        method === 'refreshTables' ||
        method === 'refreshTablePage' ||
        method === 'liveFingerprint' ||
        method === 'inspectImportBytes';
      if (!readOnly) {
        chrome.runtime.sendMessage({ type: 'db-data-changed' }).catch(() => {});
      }
    })
    .catch((e) => {
      sendResponse({ id, ok: false, error: String(e) });
    });
  return true;
});

console.log('[DB owner] Offscreen document started');
