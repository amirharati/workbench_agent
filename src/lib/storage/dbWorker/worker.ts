import { markDbWorkerProcess } from './env';
import { setStorageBackend } from '../sqlite/connectionProvider';
import { subscribeToDataChanges } from '../../dataChangeNotifier';
import { revisionTracker } from '../../revisionTracker';
import { scheduleFolderMirror, mirrorNow, configureFolderMirror, getMirrorStatus } from './mirrorToFolder';
import { exportOpfsDatabaseBytes, importFolderBytesIntoOpfs, openOpfsConnection, workerDatabaseHasDomainDataSync } from '../sqlite/connectionOpfs';
import { decodeBinaryFromRpc } from '../../binaryPayload';
import { fingerprintSqliteBytes, fingerprintFromStore, isLiveNewerThanBackup } from '../importFingerprint';
import { resetStoreSingletons, getIdbCompatStore } from '../sqlite/store';
import type { DbMutation } from '../dbMutations';
import * as dbCore from '../../dbCore';
import {
  runHubEnrichmentCounts,
  runHubEnrichmentPage,
  invalidateHubScopeEntryCache,
  type HubScopeParams,
} from '../../pipeline/enrichmentHubWorkerLogic';

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

/** Read-only RPCs — must not broadcast data-changed (hydrate uses many calls). */
const READ_ONLY_RPC_METHODS = new Set([
  'ping',
  'getStatus',
  'hydrate',
  'refreshTables',
  'refreshTablePage',
  'hubEnrichmentPage',
  'hubEnrichmentCounts',
  'hubInvalidateScopeCache',
  'liveFingerprint',
  'inspectImportBytes',
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
  'putPipelineDebug',
  'clearAllPipelineDebug',
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
    case 'refreshTables': {
      const storeNames = args[0] as string[];
      if (!Array.isArray(storeNames) || !storeNames.length) return {};
      const store = await getIdbCompatStore();
      const out: Record<string, unknown> = {};
      for (const name of storeNames) {
        out[name] = store.getAll(name);
      }
      return out;
    }
    case 'refreshTablePage': {
      const storeName = args[0] as string;
      const offset = Math.max(0, Number(args[1]) || 0);
      const limit = Math.min(5000, Math.max(1, Number(args[2]) || 1000));
      if (typeof storeName !== 'string' || !storeName) {
        return { rows: [], done: true };
      }
      const store = await getIdbCompatStore();
      const rows = store.getPage(storeName, offset, limit);
      return { rows, done: rows.length < limit };
    }
    case 'hubEnrichmentPage': {
      const offset = Math.max(0, Number(args[0]) || 0);
      const limit = Math.min(500, Math.max(1, Number(args[1]) || 100));
      const scope = (args[2] ?? {}) as HubScopeParams;
      const filters = (args[3] ?? undefined) as import('../../pipeline/enrichmentHubWorkerLogic').HubPageFilters | null;
      const store = await getIdbCompatStore();
      return runHubEnrichmentPage(store, offset, limit, {
        scopeProjectId: scope.scopeProjectId ?? 'all',
        scopeCollectionId: scope.scopeCollectionId ?? 'all',
      }, filters ?? undefined);
    }
    case 'hubEnrichmentCounts': {
      const scope = (args[0] ?? {}) as HubScopeParams;
      const search = typeof args[1] === 'string' ? args[1] : '';
      const store = await getIdbCompatStore();
      return runHubEnrichmentCounts(store, {
        scopeProjectId: scope.scopeProjectId ?? 'all',
        scopeCollectionId: scope.scopeCollectionId ?? 'all',
      }, search);
    }
    case 'hubInvalidateScopeCache': {
      invalidateHubScopeEntryCache();
      return { ok: true };
    }
    case 'liveFingerprint': {
      const store = await getIdbCompatStore();
      const { fingerprintFromStore } = await import('../importFingerprint');
      return fingerprintFromStore(store);
    }
    case 'batchMutate': {
      const ops = args[0] as DbMutation[];
      if (!Array.isArray(ops) || ops.length === 0) {
        return { applied: 0, revision: revisionTracker.getLocalRevisionSync() };
      }
      const store = await getIdbCompatStore();
      store.withTransaction(() => {
        for (const op of ops) {
          if (op.kind === 'put') store.put(op.storeName, op.value);
          else store.delete(op.storeName, op.key);
        }
      });
      invalidateHubScopeEntryCache();
      scheduleFolderMirror();
      return {
        applied: ops.length,
        revision: revisionTracker.recordSqliteMutation(),
      };
    }
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
        invalidateHubScopeEntryCache();
        scheduleFolderMirror();
        revisionTracker.recordSqliteMutation();
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
      if (!READ_ONLY_RPC_METHODS.has(method) && !IMPORT_METHODS.has(method)) {
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
