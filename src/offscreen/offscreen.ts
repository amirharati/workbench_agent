/**
 * Offscreen document — hosts the DB worker and writes folder mirrors.
 */

import DbWorker from '../lib/storage/dbWorker/worker.ts?worker';
import { wrapExport } from '../lib/backupEnvelope';
import { normalizeBinaryPayload } from '../lib/binaryPayload';
import {
  WORKBENCH_DB_FILE,
  WORKBENCH_META_FILE,
  hasConfiguredBackupFolder,
  hasWritableBackupFolder,
  readBinaryFromBackupFolder,
  writeBinaryAtomicallyToBackupFolder,
  writeJsonAtomicallyToBackupFolder,
} from '../lib/backupFolder';
import { revisionTracker } from '../lib/revisionTracker';
import { wouldMirrorShrinkWorkbenchSqlite } from '../lib/folderMirrorGuard';
import { syncClock } from '../lib/time/clock';
import { markDbOwnerReady, setLocalDbRpcTransport } from '../lib/storage/dbClient';
import { installOffscreenPipelineHost } from '../lib/pipeline/offscreenPipelineHost';

void syncClock();

// Keep this in sync with public/service-worker.js and the worker response.
const DB_OWNER_PROTOCOL_VERSION = 6;

const worker = new DbWorker({ name: 'workbench-db' });

let bootstrapComplete = false;
let rpcId = 1;
const pendingRpc = new Map<number, (msg: WorkerResponse) => void>();

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: 'worker-ready' }
  | { type: 'mirror-bytes'; bytes: Uint8Array; revision: number }
  | { type: 'request-folder-bytes' }
  | { type: 'data-changed'; revision: number };

async function writeMirrorToFolder(
  bytes: Uint8Array,
  revision: number
): Promise<{ ok: boolean; error?: string }> {
  if (!(await hasWritableBackupFolder())) {
    const linked = await hasConfiguredBackupFolder();
    return {
      ok: false,
      error: linked
        ? 'Backup folder permission paused — click the page once to resume sync'
        : 'No backup folder configured',
    };
  }
  const payload = normalizeBinaryPayload(bytes);
  if (!payload || payload.byteLength < 16) {
    return { ok: false, error: 'Export produced empty database' };
  }
  const existing = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
  if (existing.ok && existing.data && existing.data.byteLength > 16) {
    // Early size screen; writeBinaryAtomically re-checks size + items and
    // rotates workbench.prev / prev2 before replacing live.
    const blocked = wouldMirrorShrinkWorkbenchSqlite(existing.data, payload);
    if (blocked) {
      console.error('[DB owner] mirror blocked:', blocked);
      return { ok: false, error: blocked };
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
  // Transferable ArrayBuffer — merge when live has data; load when empty.
  await workerRpcBinary('mergeWithFolderBytes', bytes, 'low');
}

function workerRpc(
  method: string,
  args: unknown[],
  priority: 'high' | 'low' = 'high'
): Promise<unknown> {
  const id = rpcId++;
  return new Promise((resolve, reject) => {
    pendingRpc.set(id, (msg) => {
      if ('id' in msg && msg.id === id) {
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error));
      }
    });
    worker.postMessage({ id, method, args, priority });
  });
}

/** Import/inspect large sqlite bytes via transferable buffer (no base64 bloat). */
function workerRpcBinary(
  method: string,
  bytes: Uint8Array,
  priority: 'high' | 'low' = 'high'
): Promise<unknown> {
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
    worker.postMessage({ id, method, args: [copy.buffer], priority }, [copy.buffer]);
  });
}

type FolderFileWorkerMethod =
  | 'bootstrapFromFolderBytes'
  | 'forceImportFromFolderBytes'
  | 'mergeWithFolderBytes'
  | 'inspectImportBytes';

const FOLDER_FILE_RPC: Record<string, FolderFileWorkerMethod> = {
  bootstrapFromBackupFolderFile: 'bootstrapFromFolderBytes',
  forceImportFromBackupFolderFile: 'forceImportFromFolderBytes',
  mergeWithBackupFolderFile: 'mergeWithFolderBytes',
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

// Pipeline on this document must talk to SQLite directly — never via chrome.runtime
// db-rpc (that nests SW → db-owner into the same page and deadlocks on "Starting…").
setLocalDbRpcTransport(async (method, args, priority) => {
  const folderRpc = typeof method === 'string' ? FOLDER_FILE_RPC[method] : undefined;
  if (folderRpc) {
    const filename = String(args?.[0] ?? WORKBENCH_DB_FILE);
    const result = await rpcFromBackupFolderFile(method, filename);
    if (method !== 'inspectImportFromBackupFolderFile') {
      chrome.runtime.sendMessage({ type: 'db-data-changed' }).catch(() => {});
    }
    return result;
  }
  // Worker already broadcasts data-changed for mutations — don't double-notify.
  return workerRpc(method, args ?? [], priority);
});

installOffscreenPipelineHost();

worker.onmessage = async (event: MessageEvent<WorkerResponse>) => {
  const msg = event.data;
  if (msg && typeof msg === 'object' && 'type' in msg) {
    if (msg.type === 'worker-ready') {
      // OPFS is the live database. Make it available to dashboard clients now;
      // folder reconciliation is durability/conflict work and must not block first use.
      bootstrapComplete = true;
      markDbOwnerReady();
      chrome.runtime.sendMessage({ type: 'db-owner-ready' }).catch(() => {});
      window.setTimeout(() => {
        void bootstrapFromFolderIfNeeded()
          .catch((e) => {
            // The live OPFS database remains usable; surface reconciliation as a
            // background sync problem rather than failing DB-owner availability.
            console.error('[DB owner] background folder reconciliation failed:', e);
          });
      }, 1_000);
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
    if (msg.type === 'request-folder-bytes') {
      try {
        const primary = await readBinaryFromBackupFolder(WORKBENCH_DB_FILE);
        if (primary.ok && primary.data && primary.data.byteLength >= 16) {
          const copy = new Uint8Array(primary.data.byteLength);
          copy.set(primary.data);
          worker.postMessage({ type: 'folder-bytes', bytes: copy.buffer }, [copy.buffer]);
        } else {
          worker.postMessage({ type: 'folder-bytes', bytes: null });
        }
      } catch (e) {
        worker.postMessage({ type: 'folder-bytes', bytes: null, error: String(e) });
      }
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
  if (message?.target === 'db-owner-control' && message?.type === 'get-protocol-version') {
    // Verify the child worker too. An offscreen page can otherwise outlive a
    // rebuilt worker bundle during extension development.
    workerRpc('getProtocolVersion', [])
      .then((version) => sendResponse({
        version: version === DB_OWNER_PROTOCOL_VERSION ? version : 0,
      }))
      .catch(() => sendResponse({ version: 0 }));
    return true;
  }
  if (message?.target !== 'db-owner') return false;
  const { id, method, args, priority } = message;
  const rpcPriority = priority === 'low' ? 'low' : 'high';
  if (method === 'ping' && bootstrapComplete) {
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

  workerRpc(method, args ?? [], rpcPriority)
    .then((result) => {
      sendResponse({ id, ok: true, result });
      // Worker already posts data-changed → forwarded below; no second notify.
    })
    .catch((e) => {
      sendResponse({ id, ok: false, error: String(e) });
    });
  return true;
});

console.log('[DB owner] Offscreen document started');
