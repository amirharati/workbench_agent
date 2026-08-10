/**
 * Offscreen document — hosts the DB worker and writes folder mirrors.
 */

import DbWorker from '../lib/storage/dbWorker/worker.ts?worker';
import ContentWorker from '../lib/storage/content/worker.ts?worker';
import { wrapExport } from '../lib/backupEnvelope';
import { normalizeBinaryPayload } from '../lib/binaryPayload';
import {
  WORKBENCH_DB_FILE,
  WORKBENCH_CONTENT_DB_FILE,
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
import { setLocalContentRpcTransport } from '../lib/storage/content/contentClient';
import { installOffscreenPipelineHost } from '../lib/pipeline/offscreenPipelineHost';

void syncClock();

// Keep this in sync with public/service-worker.js and the worker response.
const DB_OWNER_PROTOCOL_VERSION = 10;

const worker = new DbWorker({ name: 'workbench-db' });
const contentWorker = new ContentWorker({ name: 'workbench-content-db' });

let bootstrapComplete = false;
let rpcId = 1;
const pendingRpc = new Map<number, (msg: WorkerResponse) => void>();
let contentRpcId = 1;
const pendingContentRpc = new Map<number, (msg: ContentWorkerResponse) => void>();
let resolveContentWorkerStarted: (() => void) | null = null;
const contentWorkerStarted = new Promise<void>((resolve) => {
  resolveContentWorkerStarted = resolve;
});
let contentInitializationPromise: Promise<unknown> | null = null;

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: 'worker-ready' }
  | { type: 'mirror-bytes'; bytes: Uint8Array; revision: number }
  | { type: 'request-folder-bytes' }
  | { type: 'data-changed'; revision: number };

type ContentWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: 'content-worker-ready' }
  | { type: 'content-worker-error'; error: string }
  | { type: 'content-mirror-bytes'; bytes: ArrayBuffer | Uint8Array; revision: number };

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

async function writeContentSnapshotToFolder(
  bytes: ArrayBuffer | Uint8Array
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
    return { ok: false, error: 'Content export produced an empty database' };
  }
  // Unlike the core DB, this sidecar has one replaceable snapshot and no rotation.
  return writeBinaryAtomicallyToBackupFolder(WORKBENCH_CONTENT_DB_FILE, payload);
}

async function bootstrapContentFromFolderIfNeeded(): Promise<unknown> {
  if (!(await hasWritableBackupFolder())) {
    const linked = await hasConfiguredBackupFolder();
    throw new Error(
      linked
        ? 'Content folder permission is paused until the next user gesture'
        : 'Choose a backup folder before storing fetched content'
    );
  }
  const snapshot = await readBinaryFromBackupFolder(WORKBENCH_CONTENT_DB_FILE);
  if (!snapshot.ok && !snapshot.notFound) {
    throw new Error(snapshot.error ?? 'Could not read the content database snapshot');
  }
  if (snapshot.notFound || !snapshot.data || snapshot.data.byteLength < 16) {
    // Establish the visible recovery file independently of enrichment. This is
    // background initialization and never delays core DB availability.
    const checkpoint = await contentWorkerRpcDirect('checkpointNow', []) as {
      ok: boolean;
      error?: string;
    };
    if (!checkpoint.ok) {
      throw new Error(checkpoint.error ?? 'Could not create the content database snapshot');
    }
    return { imported: false, reason: 'created-empty-snapshot', rowCount: 0 };
  }
  return contentWorkerRpcBinaryDirect('bootstrapFromFolderBytes', snapshot.data);
}

async function ensureContentStoreInitialized(): Promise<unknown> {
  await contentWorkerStarted;
  if (!contentInitializationPromise) {
    contentInitializationPromise = bootstrapContentFromFolderIfNeeded().catch((error) => {
      // Folder permission can become available after a user gesture. Allow the
      // next content request to retry initialization instead of caching failure.
      contentInitializationPromise = null;
      throw error;
    });
  }
  return contentInitializationPromise;
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

function contentWorkerRpcDirect(method: string, args: unknown[] = []): Promise<unknown> {
  const id = contentRpcId++;
  return new Promise((resolve, reject) => {
    pendingContentRpc.set(id, (msg) => {
      if ('id' in msg && msg.id === id) {
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error));
      }
    });
    contentWorker.postMessage({ id, method, args });
  });
}

function contentWorkerRpcBinaryDirect(method: string, bytes: Uint8Array): Promise<unknown> {
  const id = contentRpcId++;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Promise((resolve, reject) => {
    pendingContentRpc.set(id, (msg) => {
      if ('id' in msg && msg.id === id) {
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error));
      }
    });
    contentWorker.postMessage({ id, method, args: [copy.buffer] }, [copy.buffer]);
  });
}

async function contentWorkerRpc(method: string, args: unknown[] = []): Promise<unknown> {
  // Protocol verification must remain independent from selected-folder state.
  if (method !== 'getProtocolVersion') await ensureContentStoreInitialized();
  return contentWorkerRpcDirect(method, args);
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

setLocalContentRpcTransport(async (method, args) => {
  if (method === 'bootstrapFromBackupFolderFile') {
    return ensureContentStoreInitialized();
  }
  return contentWorkerRpc(method, args ?? []);
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

contentWorker.onmessage = async (event: MessageEvent<ContentWorkerResponse>) => {
  const msg = event.data;
  if (msg && typeof msg === 'object' && 'type' in msg) {
    if (msg.type === 'content-worker-ready') {
      resolveContentWorkerStarted?.();
      resolveContentWorkerStarted = null;
      // Content initialization is independent and must never delay core DB
      // availability, but content RPCs themselves wait for this same promise.
      void ensureContentStoreInitialized().catch((error) => {
        console.error('[Content owner] background folder recovery failed:', error);
      });
      return;
    }
    if (msg.type === 'content-worker-error') {
      console.error('[Content owner] worker startup failed:', msg.error);
      return;
    }
    if (msg.type === 'content-mirror-bytes') {
      const result = await writeContentSnapshotToFolder(msg.bytes);
      contentWorker.postMessage({
        type: 'content-mirror-ack',
        ok: result.ok,
        error: result.error,
      });
      return;
    }
  }
  if (msg && typeof msg === 'object' && 'id' in msg) {
    const handler = pendingContentRpc.get(msg.id);
    if (handler) {
      pendingContentRpc.delete(msg.id);
      handler(msg);
    }
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === 'db-owner-control' && message?.type === 'get-protocol-version') {
    // Verify both child workers. The offscreen page can outlive rebuilt worker
    // bundles during extension development.
    Promise.all([
      workerRpc('getProtocolVersion', []),
      contentWorkerRpc('getProtocolVersion', []),
    ])
      .then(([coreVersion, contentVersion]) => sendResponse({
        version:
          coreVersion === DB_OWNER_PROTOCOL_VERSION &&
          contentVersion === DB_OWNER_PROTOCOL_VERSION
            ? DB_OWNER_PROTOCOL_VERSION
            : 0,
      }))
      .catch(() => sendResponse({ version: 0 }));
    return true;
  }
  if (message?.target === 'content-owner') {
    const { id, method, args } = message;
    const operation = method === 'bootstrapFromBackupFolderFile'
      ? ensureContentStoreInitialized()
      : contentWorkerRpc(method, args ?? []);
    operation
      .then((result) => sendResponse({ id, ok: true, result }))
      .catch((error) => sendResponse({ id, ok: false, error: String(error) }));
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
