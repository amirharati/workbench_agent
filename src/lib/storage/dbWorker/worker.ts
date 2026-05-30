import { markDbWorkerProcess } from './env';
import { setStorageBackend } from '../sqlite/connectionProvider';
import { subscribeToDataChanges } from '../../dataChangeNotifier';
import { revisionTracker } from '../../revisionTracker';
import { scheduleFolderMirror, mirrorNow, configureFolderMirror, getMirrorStatus } from './mirrorToFolder';
import { exportOpfsDatabaseBytes, importFolderBytesIntoOpfs, openOpfsConnection, workerDatabaseHasDomainDataSync } from '../sqlite/connectionOpfs';
import { decodeBinaryFromRpc } from '../../binaryPayload';
import { fingerprintSqliteBytes, fingerprintFromStore, isLiveNewerThanBackup } from '../importFingerprint';
import { resetStoreSingletons, getIdbCompatStore } from '../sqlite/store';
import * as dbCore from '../../dbCore';

markDbWorkerProcess();
setStorageBackend('opfs');

type RpcRequest = { id: number; method: string; args: unknown[] };
type RpcResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

const workerScope = self as unknown as {
  postMessage: (msg: unknown) => void;
  onmessage: ((ev: MessageEvent) => void) | null;
};

let mirrorConfigured = false;
let pendingMirrorWrite: ((result: { ok: boolean; error?: string }) => void) | null = null;
/** Serialize RPC handlers so import/mutate/hydrate cannot interleave. */
let rpcChain: Promise<void> = Promise.resolve();

const MIRROR_WRITE_TIMEOUT_MS = 120_000;

const IMPORT_METHODS = new Set([
  'bootstrapFromFolderBytes',
  'forceImportFromFolderBytes',
  'importDB',
]);

const MUTATING_STORE_METHODS = new Set([
  'put',
  'delete',
  'putProject',
  'deleteProject',
  'putCollection',
  'deleteCollection',
  'putItem',
  'deleteItem',
  'putNote',
  'deleteNote',
  'putSnapshot',
  'putWorkspace',
  'deleteWorkspace',
  'putEnrichment',
  'deleteEnrichment',
  'putCategory',
  'deleteCategory',
  'putLink',
  'deleteLink',
  'deleteLinksByItem',
  'putSignal',
  'deleteSignal',
  'putTaxonomyState',
  'putTrashEntry',
  'deleteTrashEntry',
  'clearAllTables',
]);

function isMutatingStoreMethod(method: string): boolean {
  return MUTATING_STORE_METHODS.has(method);
}

function ensureMirrorHooks(): void {
  if (mirrorConfigured) return;
  mirrorConfigured = true;
  subscribeToDataChanges(() => {
    scheduleFolderMirror();
  });
}

async function hydrateSnapshot(): Promise<Record<string, unknown>> {
  const store = await getIdbCompatStore();
  return {
    projects: store.getAllProjects(),
    collections: store.getAllCollections(),
    items: store.getAllItems(),
    notes: store.getAllNotes(),
    snapshots: store.getAllSnapshots(),
    workspaces: store.getAllWorkspaces(),
    enrichment: store.getAllEnrichment(),
    categories: store.getAllCategories(),
    links: store.getAllLinks(),
    signals: store.getAllSignals(),
    taxonomy: store.getTaxonomyState(),
    trash: store.getAllTrashHistory(),
  };
}

async function reloadWorkerStoreAfterImport(): Promise<void> {
  dbCore.resetDbStoreCache();
  resetStoreSingletons();
  await dbCore.getDB();
}

async function mirrorAfterImport(context: string): Promise<{ ok: boolean; error?: string }> {
  const mirror = await mirrorNow(true);
  if (!mirror.ok) {
    console.warn(`[DB worker] post-import mirror failed (${context}):`, mirror.error);
  }
  return mirror;
}

async function handleMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'ping':
      return 'pong';
    case 'getStatus': {
      await revisionTracker.refreshFromStorage();
      const mirror = getMirrorStatus();
      const conn = await openOpfsConnection();
      return {
        storageMode: conn.getStorageMode(),
        revision: revisionTracker.getLocalRevisionSync(),
        deviceId: revisionTracker.getDeviceIdSync(),
        lastMirrorAt: mirror.lastMirrorAt,
        lastMirroredRevision: mirror.lastMirroredRevision,
        mirrorPending: mirror.pending,
        lastMirrorError: mirror.lastMirrorError,
      };
    }
    case 'mirrorNow':
      return mirrorNow(Boolean((args[0] as { force?: boolean } | undefined)?.force));
    case 'bootstrapFromFolderBytes': {
      const payload = decodeBinaryFromRpc(args[0]);
      if (!payload || payload.byteLength < 16) {
        return { imported: false, reason: 'empty' };
      }
      if (workerDatabaseHasDomainDataSync()) {
        const folderFp = await fingerprintSqliteBytes(payload);
        const store = await getIdbCompatStore();
        const liveFp = fingerprintFromStore(store);
        if (!isLiveNewerThanBackup(folderFp, liveFp)) {
          return { imported: false, reason: 'already-has-data' };
        }
      }
      resetStoreSingletons();
      await importFolderBytesIntoOpfs(payload);
      await reloadWorkerStoreAfterImport();
      const mirror = await mirrorAfterImport('bootstrap');
      return { imported: true, mirrorOk: mirror.ok, mirrorError: mirror.error ?? null };
    }
    case 'forceImportFromFolderBytes': {
      const payload = decodeBinaryFromRpc(args[0]);
      if (!payload || payload.byteLength < 16) {
        return { imported: false, reason: 'empty' };
      }
      resetStoreSingletons();
      await importFolderBytesIntoOpfs(payload);
      await reloadWorkerStoreAfterImport();
      const mirror = await mirrorAfterImport('forceImport');
      return { imported: true, mirrorOk: mirror.ok, mirrorError: mirror.error ?? null };
    }
    case 'inspectImportBytes': {
      const payload = decodeBinaryFromRpc(args[0]);
      if (!payload || payload.byteLength < 16) {
        return { maxUpdatedAt: 0, itemCount: 0, notesRowCount: 0, itemsWithNotes: 0 };
      }
      return fingerprintSqliteBytes(payload);
    }
    case 'hydrate':
      return hydrateSnapshot();
    case 'storeInvoke': {
      const storeMethod = args[0] as string;
      const storeArgs = (args[1] as unknown[]) ?? [];
      const store = await getIdbCompatStore();
      const fn = (store as unknown as Record<string, (...a: unknown[]) => unknown>)[storeMethod];
      if (typeof fn !== 'function') {
        throw new Error(`Unknown store method: ${storeMethod}`);
      }
      const result = fn.apply(store, storeArgs);
      if (isMutatingStoreMethod(storeMethod)) {
        scheduleFolderMirror();
      }
      return result;
    }
    case 'exportSqliteBytes':
      return dbCore.exportSqliteBytes();
    case 'importDB': {
      const imported = await dbCore.importDB(args[0] as string, args[1] as boolean);
      if (imported) {
        await mirrorAfterImport('importDB');
      }
      return imported;
    }
    case 'bulkImportBookmarks': {
      const bulk = await dbCore.bulkImportBookmarks(
        ...(args as Parameters<typeof dbCore.bulkImportBookmarks>)
      );
      scheduleFolderMirror();
      return bulk;
    }
    default: {
      const fn = (dbCore as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
      if (typeof fn === 'function') {
        return fn(...args);
      }
      throw new Error(`Unknown RPC method: ${method}`);
    }
  }
}

workerScope.onmessage = async (event: MessageEvent<RpcRequest | { type: string; ok?: boolean; error?: string }>) => {
  const data = event.data;
  if (data && typeof data === 'object' && 'type' in data && data.type === 'mirror-ack') {
    if (pendingMirrorWrite) {
      pendingMirrorWrite({ ok: Boolean(data.ok), error: data.error });
      pendingMirrorWrite = null;
    }
    return;
  }

  const { id, method, args } = event.data as RpcRequest;
  const run = rpcChain.then(async () => {
    try {
      const result = await handleMethod(method, args ?? []);
      const response: RpcResponse = { id, ok: true, result };
      workerScope.postMessage(response);
      if (
        method !== 'ping' &&
        method !== 'getStatus' &&
        method !== 'hydrate' &&
        !IMPORT_METHODS.has(method)
      ) {
        workerScope.postMessage({ type: 'data-changed', revision: revisionTracker.getLocalRevisionSync() });
      }
    } catch (e) {
      const response: RpcResponse = { id, ok: false, error: String(e) };
      workerScope.postMessage(response);
    }
  });
  rpcChain = run.then(
    () => undefined,
    () => undefined
  );
};

configureFolderMirror({
  exportDatabase: exportOpfsDatabaseBytes,
  writeToFolder: (bytes, revision) =>
    new Promise((resolve) => {
      if (pendingMirrorWrite) {
        resolve({ ok: false, error: 'Previous mirror write still pending' });
        return;
      }
      pendingMirrorWrite = resolve;
      workerScope.postMessage({ type: 'mirror-bytes', bytes, revision });
      setTimeout(() => {
        if (pendingMirrorWrite === resolve) {
          pendingMirrorWrite = null;
          resolve({ ok: false, error: 'Mirror write timeout' });
        }
      }, MIRROR_WRITE_TIMEOUT_MS);
    }),
  getRevision: () => revisionTracker.getLocalRevisionSync(),
});

void revisionTracker.load();
ensureMirrorHooks();

workerScope.postMessage({ type: 'worker-ready' });
