import { markDbWorkerProcess } from './env';
import { setStorageBackend } from '../sqlite/connectionProvider';
import { subscribeToDataChanges } from '../../dataChangeNotifier';
import { revisionTracker } from '../../revisionTracker';
import { scheduleFolderMirror, mirrorNow, configureFolderMirror, getMirrorStatus } from './mirrorToFolder';
import { exportOpfsDatabaseBytes, importFolderBytesIntoOpfs, openOpfsConnection, workerDatabaseHasDomainData } from '../sqlite/connectionOpfs';
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

async function handleMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'ping':
      return 'pong';
    case 'getStatus': {
      await revisionTracker.load();
      const mirror = getMirrorStatus();
      const conn = await openOpfsConnection();
      return {
        storageMode: conn.getStorageMode(),
        revision: revisionTracker.getLocalRevisionSync(),
        deviceId: revisionTracker.getDeviceIdSync(),
        lastMirrorAt: mirror.lastMirrorAt,
        lastMirroredRevision: mirror.lastMirroredRevision,
        mirrorPending: mirror.pending,
      };
    }
    case 'mirrorNow':
      return mirrorNow(Boolean((args[0] as { force?: boolean } | undefined)?.force));
    case 'bootstrapFromFolderBytes': {
      const bytes = args[0] as Uint8Array;
      if (await workerDatabaseHasDomainData()) {
        return { imported: false, reason: 'already-has-data' };
      }
      if (!bytes || bytes.byteLength < 16) {
        await dbCore.getDB();
        return { imported: false, reason: 'empty' };
      }
      resetStoreSingletons();
      await importFolderBytesIntoOpfs(bytes);
      resetStoreSingletons();
      await dbCore.getDB();
      scheduleFolderMirror();
      return { imported: true };
    }
    case 'forceImportFromFolderBytes': {
      const bytes = args[0] as Uint8Array;
      if (!bytes || bytes.byteLength < 16) {
        return { imported: false, reason: 'empty' };
      }
      resetStoreSingletons();
      await importFolderBytesIntoOpfs(bytes);
      resetStoreSingletons();
      await dbCore.getDB();
      return { imported: true };
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
      scheduleFolderMirror();
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

workerScope.onmessage = async (event: MessageEvent<RpcRequest>) => {
  const { id, method, args } = event.data;
  try {
    const result = await handleMethod(method, args ?? []);
    const response: RpcResponse = { id, ok: true, result };
    workerScope.postMessage(response);
    if (method !== 'ping' && method !== 'getStatus' && method !== 'hydrate') {
      workerScope.postMessage({ type: 'data-changed', revision: revisionTracker.getLocalRevisionSync() });
    }
  } catch (e) {
    const response: RpcResponse = { id, ok: false, error: String(e) };
    workerScope.postMessage(response);
  }
};

configureFolderMirror({
  exportDatabase: exportOpfsDatabaseBytes,
  writeToFolder: async (bytes, revision) => {
    workerScope.postMessage({ type: 'mirror-bytes', bytes, revision });
    return { ok: true };
  },
  getRevision: () => revisionTracker.getLocalRevisionSync(),
});

void revisionTracker.load();
ensureMirrorHooks();

workerScope.postMessage({ type: 'worker-ready' });
