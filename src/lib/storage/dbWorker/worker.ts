import { markDbWorkerProcess } from './env';
import { setStorageBackend } from '../sqlite/connectionProvider';
import { subscribeToDataChanges } from '../../dataChangeNotifier';
import { revisionTracker } from '../../revisionTracker';
import {
  scheduleFolderMirror,
  mirrorNow,
  configureFolderMirror,
  getMirrorStatus,
  setMirrorSuspended,
  markFolderMirrorCurrent,
  pauseAutoMirrorForDigest,
  resumeAutoMirrorAfterDigest,
} from './mirrorToFolder';
import { exportOpfsDatabaseBytes, importFolderBytesIntoOpfs, openOpfsConnection, workerDatabaseHasDomainDataSync, getOpfsDatabaseSync } from '../sqlite/connectionOpfs';
import { decodeBinaryFromRpc } from '../../binaryPayload';
import { snapshotSummarySqliteBytes } from '../importFingerprint';
import { resetStoreSingletons, getIdbCompatStore } from '../sqlite/store';
import type { DbMutation } from '../dbMutations';
import * as dbCore from '../../dbCore';
import {
  runHubEnrichmentCounts,
  runHubEnrichmentPage,
  invalidateHubScopeEntryCache,
  type HubScopeParams,
} from '../../pipeline/enrichmentHubWorkerLogic';
import { syncClock } from '../../time/clock';
import {
  createDashboardStartupProjection,
  type DashboardStartupProjection,
} from '../../dashboardStartupProjection';
import { cosineSimilarity } from '../../categorization/math';
import { WorkerSimilarityIndex } from '../../search/similarityIndex';
import type { AiItemSignal } from '../../categorization/types';
import {
  classifyStateRequiresPrimary,
  commitClassificationInStore,
  commitEmbeddingSignalsInStore,
  isCountableAiPrimary,
  signalMetaOnly,
  type PipelineClassificationCommitInput,
  type PipelineDownstreamReconcileResult,
  type PipelineStageCommitResult,
} from './pipelineStageCommit';
import {
  acknowledgePipelineCancellation,
  claimNextPipelineTask,
  finishPipelineTask,
  getPipelineJobSnapshot,
  heartbeatPipelineTask,
  listRecoverablePipelineJobs,
  listVisiblePipelineJobs,
  recoverExpiredPipelineTasks,
  acknowledgePipelinePause,
  requestPipelineCancellation,
  requestPipelinePause,
  resumePipelineJob,
  submitPipelineJob,
  yieldPipelineJob,
} from './pipelineJobStore';
import { DB_OWNER_PROTOCOL_VERSION } from '../dbOwnerProtocol';

markDbWorkerProcess();
setStorageBackend('opfs');
void syncClock();

type DbRpcPriority = 'high' | 'low';
type RpcRequest = {
  id: number;
  method: string;
  args: unknown[];
  /** high = save/UI/single; low = bulk. Default high. */
  priority?: DbRpcPriority;
};
type RpcResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

const workerScope = self as unknown as {
  postMessage: (msg: unknown) => void;
  onmessage: ((ev: MessageEvent) => void) | null;
};

let mirrorConfigured = false;
let pendingMirrorWrite: ((result: { ok: boolean; error?: string }) => void) | null = null;
let dashboardStartupProjectionCache: DashboardStartupProjection | null = null;
let pipelineBadgeEntriesCache: {
  revision: number;
  coveredIds: Set<string>;
  entries: Map<string, unknown>;
} | null = null;
let similarityVectorIndex = new WorkerSimilarityIndex();
let similarityWarmPromise: Promise<void> | null = null;
let similarityWarmTimer: ReturnType<typeof setTimeout> | null = null;
let similarityCacheGeneration = 0;
let similarityDataGeneration = 0;

/** In-memory priority queues — high drains before low; work is never cancelled. */
const highRpcQueue: RpcRequest[] = [];
const lowRpcQueue: RpcRequest[] = [];
let rpcPumpRunning = false;

const MIRROR_WRITE_TIMEOUT_MS = 120_000;

const IMPORT_METHODS = new Set([
  'bootstrapFromFolderBytes',
  'forceImportFromFolderBytes',
  'mergeWithFolderBytes',
  'importDB',
]);

/** Read-only RPCs — must not broadcast data-changed (hydrate uses many calls). */
const READ_ONLY_RPC_METHODS = new Set([
  'ping',
  'getProtocolVersion',
  'getStatus',
  'hydrate',
  'refreshTables',
  'refreshTablePage',
  'getPipelineSeedRows',
  'getCategoryLinkCounts',
  'getItemById',
  'getItemsByUrl',
  'hubEnrichmentPage',
  'hubEnrichmentCounts',
  'hubInvalidateScopeCache',
  'liveFingerprint',
  'inspectImportBytes',
  'scheduleFolderMirror',
  'pauseAutoMirrorForDigest',
  'resumeAutoMirrorAfterDigest',
  'getSignalsByItemIds',
  'getSignalMetadataByItemIds',
  'getEnrichmentsByItemIds',
  'rankSearchEmbeddings',
  'findSimilarVectorScores',
  'getPendingEmbeddingItemIds',
  'getDashboardStartupProjection',
  'getSidePanelStartupProjection',
  'getContainerTrash',
  'getPipelineBadgeEntries',
  // Durable pipeline mutations publish coordinator-specific snapshots. They
  // must not trigger the dashboard's general library hydration path.
  'pipelineSubmitJob',
  'pipelineClaimNextTask',
  'pipelineHeartbeatTask',
  'pipelineFinishTask',
  'pipelineYieldJob',
  'pipelineCommitEmbeddingSignals',
  'pipelineCommitClassification',
  'pipelineRequestPause',
  'pipelineAcknowledgePause',
  'pipelineResumeJob',
  'pipelineRequestCancel',
  'pipelineAcknowledgeCancel',
  'pipelineRecoverExpired',
  'pipelineGetJob',
  'pipelineListRecoverable',
  'pipelineListVisible',
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
  'putDeletedItem',
  'deleteDeletedItem',
  'clearAllTables',
]);

/**
 * Pipeline satellite writes — update OPFS only. Folder flush is paused during
 * digest and soft-scheduled after a cooldown (never on every enrichment put).
 */
const SATELLITE_MIRROR_SKIP = new Set([
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
]);

const SATELLITE_STORE_NAMES = new Set([
  'item_enrichment',
  'pipeline_debug',
  'ai_categories',
  'ai_item_category_links',
  'ai_item_signals',
  'ai_taxonomy_state',
]);

function isMutatingStoreMethod(method: string): boolean {
  return MUTATING_STORE_METHODS.has(method);
}

function shouldScheduleFolderMirrorForMethod(method: string): boolean {
  return isMutatingStoreMethod(method) && !SATELLITE_MIRROR_SKIP.has(method);
}

function shouldScheduleFolderMirrorForBatch(ops: DbMutation[]): boolean {
  return ops.some((op) => {
    if (op.kind === 'put' || op.kind === 'delete') {
      return !SATELLITE_STORE_NAMES.has(op.storeName);
    }
    return true;
  });
}

function ensureMirrorHooks(): void {
  if (mirrorConfigured) return;
  mirrorConfigured = true;
  // User-data mutations schedule mirrors in storeInvoke/batchMutate.
  // Do not also mirror on every enrichment.notify from the tab — that full-dumps.
  subscribeToDataChanges((event) => {
    if (
      event.reason === 'enrichment.update' ||
      event.reason === 'categorization.update' ||
      event.reason === 'categorization.review'
    ) {
      return;
    }
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
    signals: store.getAllSignals().map(signalMetaOnly),
    taxonomy: store.getTaxonomyState(),
    trash: store.getAllTrashHistory(),
    deletedItems: store.getAllDeletedItems(),
    containerTrash: store.getAllContainerTrash(),
  };
}

async function reloadWorkerStoreAfterImport(): Promise<void> {
  dbCore.resetDbStoreCache();
  resetStoreSingletons();
  await dbCore.getDB();
}

/**
 * Open OPFS before deciding "empty". A race here previously treated live as empty,
 * imported the folder file into memory, and wiped richer browser data on the next mirror.
 */
async function ensureOpfsOpenedAndHasDomainData(): Promise<boolean> {
  await openOpfsConnection();
  return workerDatabaseHasDomainDataSync();
}

async function getPipelineDatabase() {
  await openOpfsConnection();
  const live = getOpfsDatabaseSync();
  if (!live) throw new Error('SQLite database is not open');
  return live;
}

function liveItemCountSync(): number {
  const live = getOpfsDatabaseSync();
  if (!live) return 0;
  try {
    const rows = live.exec({
      sql: 'SELECT COUNT(*) AS c FROM items;',
      returnValue: 'resultRows',
      rowMode: 'object',
    }) as { c: number }[];
    return rows[0]?.c ?? 0;
  } catch {
    return 0;
  }
}

function noteSimilarityDataMutation(): void {
  similarityDataGeneration++;
  // If a cold build is invalidated, retry only after writes have gone quiet.
  // A ready index is updated in place by the mutation handlers below.
  if (!similarityVectorIndex.ready && !similarityWarmPromise) {
    scheduleSimilarityVectorWarm(750, true);
  }
}

function applySignalToSimilarityIndex(signal: AiItemSignal): void {
  noteSimilarityDataMutation();
  if (similarityVectorIndex.ready) {
    if (signal.embedding?.length) {
      similarityVectorIndex.upsert({
        itemId: signal.itemId,
        embeddingModel: signal.embeddingModel,
        embedding: signal.embedding,
      });
    } else {
      similarityVectorIndex.remove(signal.itemId);
    }
  }
}

function deleteSignalFromSimilarityIndex(itemId: string): void {
  noteSimilarityDataMutation();
  similarityVectorIndex.remove(itemId);
}

async function refreshSimilarityVectorForItem(itemId: string): Promise<void> {
  if (!itemId) return;
  noteSimilarityDataMutation();
  if (!similarityVectorIndex.ready) return;
  const store = await getIdbCompatStore();
  const item = store.getItem(itemId);
  const signal = item?.deletedAt == null ? store.getSignal(itemId) : undefined;
  if (signal?.embedding?.length) {
    similarityVectorIndex.upsert({
      itemId,
      embeddingModel: signal.embeddingModel,
      embedding: signal.embedding,
    });
  } else {
    similarityVectorIndex.remove(itemId);
  }
}

function yieldWorkerTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function startSimilarityVectorWarm(): Promise<void> {
  if (similarityVectorIndex.ready) return Promise.resolve();
  if (!similarityWarmPromise) {
    const generation = similarityCacheGeneration;
    const dataGeneration = similarityDataGeneration;
    const pending = (async () => {
      const store = await getIdbCompatStore();
      // A restore/import may replace the entire store while an idle warm is
      // waiting for the connection. Never publish a cache from that old epoch.
      if (generation !== similarityCacheGeneration) return;
      if (similarityVectorIndex.ready) return;

      const candidate = new WorkerSimilarityIndex();
      candidate.load([], store.getSignalEmbeddingCapacityHints());
      const rows = store.iterateSignalEmbeddings(256);
      while (true) {
        for (let offset = 0; offset < 64; offset++) {
          const next = rows.next();
          if (next.done) {
            if (
              generation === similarityCacheGeneration &&
              dataGeneration === similarityDataGeneration
            ) {
              similarityVectorIndex = candidate;
            }
            return;
          }
          candidate.upsert(next.value);
        }
        if (
          generation !== similarityCacheGeneration ||
          dataGeneration !== similarityDataGeneration
        ) {
          return;
        }
        // This warm is deliberately cooperative: high-priority Inspector/save
        // RPCs can run between chunks instead of waiting for the whole matrix.
        await yieldWorkerTurn();
      }
    })();
    similarityWarmPromise = pending;
    void pending.then(
      () => {
        if (similarityWarmPromise === pending) {
          similarityWarmPromise = null;
          if (!similarityVectorIndex.ready && generation === similarityCacheGeneration) {
            scheduleSimilarityVectorWarm(750);
          }
        }
      },
      () => {
        if (similarityWarmPromise === pending) similarityWarmPromise = null;
      }
    );
  }
  return similarityWarmPromise ?? Promise.resolve();
}

/**
 * Warm outside the serialized RPC pump, after the essential dashboard snapshot
 * has already been returned. Each chunk yields to the worker event loop, so a
 * save or Inspector RPC can run before warming continues.
 */
function scheduleSimilarityVectorWarm(delayMs = 0, restartTimer = false): void {
  if (similarityVectorIndex.ready || similarityWarmPromise) return;
  if (similarityWarmTimer) {
    if (!restartTimer) return;
    clearTimeout(similarityWarmTimer);
  }
  similarityWarmTimer = setTimeout(() => {
    similarityWarmTimer = null;
    void startSimilarityVectorWarm().catch((error) => {
      console.warn('[DB worker] Similarity index warm-up failed:', error);
    });
  }, Math.max(0, delayMs));
}

async function ensureSimilarityVectorIndex(): Promise<void> {
  if (similarityVectorIndex.ready) return;
  await startSimilarityVectorWarm();
  // A concurrent signal write can invalidate a cold build. Retry once against
  // the now-current SQLite rows; steady-state writes update a ready index in place.
  if (!similarityVectorIndex.ready) await startSimilarityVectorWarm();
}

function resetSimilarityCaches(): void {
  similarityCacheGeneration++;
  similarityDataGeneration++;
  similarityVectorIndex.clear();
  similarityWarmPromise = null;
  if (similarityWarmTimer) {
    clearTimeout(similarityWarmTimer);
    similarityWarmTimer = null;
  }
  scheduleSimilarityVectorWarm(750);
}

async function updateSimilarityCachesAfterStoreMutation(
  method: string,
  args: unknown[]
): Promise<void> {
  if (method === 'clearAllTables') {
    resetSimilarityCaches();
    return;
  }

  if (method === 'put' || method === 'delete') {
    const storeName = typeof args[0] === 'string' ? args[0] : '';
    const value = args[1];
    if (storeName === 'ai_item_signals') {
      if (method === 'put' && value && typeof value === 'object') {
        applySignalToSimilarityIndex(value as AiItemSignal);
      } else if (method === 'delete' && typeof value === 'string') {
        deleteSignalFromSimilarityIndex(value);
      }
      return;
    }
    if (storeName === 'items') {
      const itemId = method === 'put'
        ? String((value as { id?: string } | undefined)?.id ?? '')
        : String(value ?? '');
      await refreshSimilarityVectorForItem(itemId);
    }
    return;
  }

  if (method === 'putSignal') {
    const signal = args[0] as AiItemSignal | undefined;
    if (signal) applySignalToSimilarityIndex(signal);
    return;
  }
  if (method === 'deleteSignal') {
    deleteSignalFromSimilarityIndex(String(args[0] ?? ''));
    return;
  }
  if (method === 'putItem') {
    await refreshSimilarityVectorForItem(String((args[0] as { id?: string } | undefined)?.id ?? ''));
  } else if (method === 'deleteItem') {
    similarityVectorIndex.remove(String(args[0] ?? ''));
  }
}

async function updateSimilarityCachesAfterBatch(ops: DbMutation[]): Promise<void> {
  const relevant = ops.filter((op) =>
    op.storeName === 'items' || op.storeName === 'ai_item_signals'
  );
  if (!relevant.length) return;
  if (relevant.length > 128) {
    resetSimilarityCaches();
    return;
  }
  for (const op of relevant) {
    await updateSimilarityCachesAfterStoreMutation(op.kind, [
      op.storeName,
      op.kind === 'put' ? op.value : op.key,
    ]);
  }
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
    case 'getProtocolVersion':
      return DB_OWNER_PROTOCOL_VERSION;
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
    case 'getDashboardStartupProjection': {
      await revisionTracker.load();
      const revision = revisionTracker.getLocalRevisionSync();
      if (dashboardStartupProjectionCache?.revision === revision) {
        scheduleSimilarityVectorWarm();
        return dashboardStartupProjectionCache;
      }
      const store = await getIdbCompatStore();
      dashboardStartupProjectionCache = createDashboardStartupProjection({
        revision,
        projects: store.getAllProjects(),
        collections: store.getAllCollections(),
        workspaces: store.getAllWorkspaces(),
        items: store.getDashboardStartupItems(),
      });
      scheduleSimilarityVectorWarm();
      return dashboardStartupProjectionCache;
    }
    case 'getSidePanelStartupProjection': {
      // The side panel only needs organization choices at startup. Do not send
      // every item or warm the similarity index merely because the panel opens.
      const store = await getIdbCompatStore();
      return {
        projects: store.getAllProjects(),
        collections: store.getAllCollections(),
      };
    }
    case 'getPipelineBadgeEntries': {
      const ids = [...new Set(Array.isArray(args[0]) ? (args[0] as string[]).filter(Boolean) : [])];
      if (!ids.length) return [];
      const revision = revisionTracker.getLocalRevisionSync();
      if (pipelineBadgeEntriesCache?.revision !== revision) {
        pipelineBadgeEntriesCache = {
          revision,
          coveredIds: new Set(),
          entries: new Map(),
        };
      }
      const missingIds = ids.filter((id) => !pipelineBadgeEntriesCache!.coveredIds.has(id));
      if (missingIds.length) {
        const store = await getIdbCompatStore();
        const { buildPipelineBadgeMap } = await import('../../pipeline/itemPipelineContext');
        const loaded = buildPipelineBadgeMap({
          items: store.getItemsForIds(missingIds),
          enrichments: store.getEnrichmentForItemIds(missingIds),
          signals: store.getSignalMetadataForItemIds(missingIds),
          links: store.getLinksForItemIds(missingIds),
          categories: store.getAllCategories(),
        });
        for (const id of missingIds) pipelineBadgeEntriesCache.coveredIds.add(id);
        for (const [id, badge] of loaded) pipelineBadgeEntriesCache.entries.set(id, badge);
      }
      return ids.flatMap((id) => {
        const badge = pipelineBadgeEntriesCache!.entries.get(id);
        return badge ? [[id, badge]] : [];
      });
    }
    case 'pipelineSubmitJob':
      return submitPipelineJob(await getPipelineDatabase(), args[0] as Parameters<typeof submitPipelineJob>[1]);
    case 'pipelineClaimNextTask':
      return claimNextPipelineTask(
        await getPipelineDatabase(),
        String(args[0] ?? ''),
        Number(args[1]) || 30_000,
        typeof args[2] === 'number' ? args[2] : Date.now(),
        typeof args[3] === 'string' ? args[3] : undefined
      );
    case 'pipelineHeartbeatTask':
      return heartbeatPipelineTask(
        await getPipelineDatabase(),
        args[0] as Parameters<typeof heartbeatPipelineTask>[1]
      );
    case 'pipelineFinishTask':
      return finishPipelineTask(
        await getPipelineDatabase(),
        args[0] as Parameters<typeof finishPipelineTask>[1]
      );
    case 'pipelineYieldJob':
      return yieldPipelineJob(
        await getPipelineDatabase(),
        args[0] as Parameters<typeof yieldPipelineJob>[1]
      );
    case 'pipelineRequestPause':
      return requestPipelinePause(
        await getPipelineDatabase(),
        String(args[0] ?? ''),
        typeof args[1] === 'number' ? args[1] : Date.now()
      );
    case 'pipelineAcknowledgePause':
      return acknowledgePipelinePause(
        await getPipelineDatabase(),
        String(args[0] ?? ''),
        typeof args[1] === 'number' ? args[1] : Date.now()
      );
    case 'pipelineResumeJob':
      return resumePipelineJob(
        await getPipelineDatabase(),
        String(args[0] ?? ''),
        typeof args[1] === 'number' ? args[1] : undefined,
        typeof args[2] === 'number' ? args[2] : undefined,
        typeof args[3] === 'number' ? args[3] : Date.now()
      );
    case 'pipelineRequestCancel':
      return requestPipelineCancellation(
        await getPipelineDatabase(),
        String(args[0] ?? ''),
        typeof args[1] === 'number' ? args[1] : Date.now()
      );
    case 'pipelineAcknowledgeCancel':
      return acknowledgePipelineCancellation(
        await getPipelineDatabase(),
        String(args[0] ?? ''),
        typeof args[1] === 'number' ? args[1] : Date.now()
      );
    case 'pipelineRecoverExpired':
      return recoverExpiredPipelineTasks(
        await getPipelineDatabase(),
        typeof args[0] === 'number' ? args[0] : Date.now()
      );
    case 'pipelineGetJob':
      return getPipelineJobSnapshot(await getPipelineDatabase(), String(args[0] ?? ''));
    case 'pipelineListRecoverable':
      return listRecoverablePipelineJobs(await getPipelineDatabase());
    case 'pipelineListVisible':
      return listVisiblePipelineJobs(await getPipelineDatabase());
    case 'mirrorNow': {
      const payload = args[0] as { force?: boolean; allowEmptyMirror?: boolean } | undefined;
      return mirrorNow(Boolean(payload?.force), {
        allowEmptyMirror: payload?.allowEmptyMirror === true,
      });
    }
    case 'scheduleFolderMirror': {
      // Soft debounced export — same path as post-write auto-mirror (seconds, not force).
      scheduleFolderMirror();
      return { ok: true };
    }
    case 'pauseAutoMirrorForDigest': {
      pauseAutoMirrorForDigest();
      return { ok: true };
    }
    case 'resumeAutoMirrorAfterDigest': {
      const cooldownMs =
        typeof args[0] === 'number' && Number.isFinite(args[0]) ? (args[0] as number) : undefined;
      resumeAutoMirrorAfterDigest(cooldownMs);
      return { ok: true };
    }
    case 'setMirrorSuspended': {
      setMirrorSuspended(Boolean(args[0]));
      return { ok: true, suspended: Boolean(args[0]) };
    }
    case 'markFolderMirrorCurrent': {
      markFolderMirrorCurrent();
      return { ok: true };
    }
    case 'bootstrapFromFolderBytes': {
      const payload = decodeBinaryFromRpc(args[0]);
      if (!payload || payload.byteLength < 16) {
        return { imported: false, reason: 'empty' };
      }
      // Always open OPFS first — never treat "db not open yet" as empty library.
      if (!(await ensureOpfsOpenedAndHasDomainData())) {
        resetStoreSingletons();
        await importFolderBytesIntoOpfs(payload);
        await reloadWorkerStoreAfterImport();
        resetSimilarityCaches();
        return { imported: true, mirrorOk: true, mirrorSkipped: true, mode: 'load' };
      }
      // Live has data — merge instead of blind replace.
      const { getSqliteStore } = await import('../sqlite/store');
      const { mergeFolderBytesIntoLiveStore } = await import('../applyFolderMerge');
      const liveStore = await getSqliteStore();
      const result = await mergeFolderBytesIntoLiveStore(payload, liveStore);
      if (result.merged) {
        revisionTracker.recordSqliteMutation();
        resetSimilarityCaches();
      }
      // Heal folder when OPFS is ahead (Finder replace / failed prior mirror).
      if (result.merged || result.folderOutOfDate) {
        void mirrorNow(true);
      }
      return {
        imported: result.merged,
        reason: result.mode === 'unchanged' ? 'already-has-data' : undefined,
        mirrorOk: true,
        mirrorSkipped: !(result.merged || result.folderOutOfDate),
        mode: result.mode,
        folderOutOfDate: result.folderOutOfDate,
      };
    }
    case 'forceImportFromFolderBytes': {
      const payload = decodeBinaryFromRpc(args[0]);
      if (!payload || payload.byteLength < 16) {
        return { imported: false, reason: 'empty' };
      }
      // Explicit replace (Settings Restore / rollback). Always overwrite OPFS —
      // do NOT merge. Callers snapshot current live to prev* before this.
      await openOpfsConnection();
      resetStoreSingletons();
      await importFolderBytesIntoOpfs(payload);
      await reloadWorkerStoreAfterImport();
      resetSimilarityCaches();
      return { imported: true, mirrorOk: true, mirrorSkipped: true, mode: 'replace' };
    }
    case 'mergeWithFolderBytes': {
      const payload = decodeBinaryFromRpc(args[0]);
      if (!payload || payload.byteLength < 16) {
        return { merged: false, mode: 'empty', reason: 'empty', itemCount: 0 };
      }
      // Empty live → full load (same as force import). Always open OPFS first.
      if (!(await ensureOpfsOpenedAndHasDomainData())) {
        resetStoreSingletons();
        await importFolderBytesIntoOpfs(payload);
        await reloadWorkerStoreAfterImport();
        resetSimilarityCaches();
        return { merged: true, mode: 'load', imported: true, mirrorOk: true, mirrorSkipped: true };
      }
      const { getSqliteStore } = await import('../sqlite/store');
      const { mergeFolderBytesIntoLiveStore } = await import('../applyFolderMerge');
      const liveStore = await getSqliteStore();
      const beforeCount = liveItemCountSync();
      const result = await mergeFolderBytesIntoLiveStore(payload, liveStore);
      const afterCount = liveItemCountSync();
      // Hard stop: merge must not shrink the live library (except via deleted_items).
      if (afterCount < beforeCount) {
        console.error(
          `[DB worker] merge reduced item count ${beforeCount} → ${afterCount}; refusing to keep shrink`
        );
      }
      if (result.merged) {
        revisionTracker.recordSqliteMutation();
        resetSimilarityCaches();
      }
      if (result.merged || result.folderOutOfDate) {
        void mirrorNow(true);
      }
      return {
        ...result,
        imported: result.merged,
        mirrorOk: true,
        mirrorSkipped: !(result.merged || result.folderOutOfDate),
      };
    }
    case 'inspectImportBytes': {
      const payload = decodeBinaryFromRpc(args[0]);
      if (!payload || payload.byteLength < 16) {
        return {
          maxUpdatedAt: 0,
          itemCount: 0,
          notesRowCount: 0,
          itemsWithNotes: 0,
          projectCount: 0,
          collectionCount: 0,
          workspaceCount: 0,
        };
      }
      return snapshotSummarySqliteBytes(payload);
    }
    case 'hydrate':
      return hydrateSnapshot();
    case 'refreshTables': {
      const storeNames = args[0] as string[];
      if (!Array.isArray(storeNames) || !storeNames.length) return {};
      const store = await getIdbCompatStore();
      const out: Record<string, unknown> = {};
      for (const name of storeNames) {
        const rows = store.getAll(name);
        // Never ship embedding vectors to the tab via bulk refresh.
        if (name === 'ai_item_signals' && Array.isArray(rows)) {
          out[name] = (rows as AiItemSignal[]).map(signalMetaOnly);
        } else {
          out[name] = rows;
        }
      }
      return out;
    }
    case 'getSignalsByItemIds': {
      const ids = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      const store = await getIdbCompatStore();
      const out: unknown[] = [];
      for (const id of ids) {
        if (!id) continue;
        const row = store.getSignal(id);
        if (row) out.push(row);
      }
      return out;
    }
    case 'getSignalMetadataByItemIds': {
      const ids = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      const store = await getIdbCompatStore();
      return store.getSignalMetadataForItemIds(ids.filter(Boolean));
    }
    case 'getEnrichmentsByItemIds': {
      const ids = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      const store = await getIdbCompatStore();
      return store.getEnrichmentForItemIds(ids.filter(Boolean));
    }
    case 'rankSearchEmbeddings': {
      const queryEmbedding = Array.isArray(args[0])
        ? (args[0] as unknown[]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        : [];
      const itemIds = Array.isArray(args[1])
        ? [...new Set((args[1] as unknown[]).filter((value): value is string => typeof value === 'string' && value.length > 0))]
        : [];
      const requestedLimit = Number(args[2]);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(1000, Math.max(1, Math.floor(requestedLimit)))
        : 500;
      if (!queryEmbedding.length || !itemIds.length) {
        return { scores: {}, withEmbeddings: 0 };
      }
      const store = await getIdbCompatStore();
      const scored: Array<[string, number]> = [];
      let withEmbeddings = 0;
      for (let offset = 0; offset < itemIds.length; offset += 500) {
        const signals = store.getSignalsForItemIds(itemIds.slice(offset, offset + 500));
        for (const signal of signals) {
          if (!signal.embedding?.length || signal.embedding.length !== queryEmbedding.length) continue;
          withEmbeddings++;
          const similarity = cosineSimilarity(queryEmbedding, signal.embedding);
          const score = Math.max(0, Math.min(1, (similarity + 1) / 2));
          if (score > 0.05) scored.push([signal.itemId, score]);
        }
      }
      scored.sort((left, right) => right[1] - left[1]);
      return {
        scores: Object.fromEntries(scored.slice(0, limit)),
        withEmbeddings,
      };
    }
    case 'findSimilarVectorScores': {
      const itemId = typeof args[0] === 'string' ? args[0] : '';
      if (!itemId) throw new Error('findSimilarVectorScores requires itemId');
      const requestedLimit = Number(args[1]);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(1000, Math.max(1, Math.floor(requestedLimit)))
        : 200;
      const allowedItemIds = Array.isArray(args[2])
        ? new Set((args[2] as unknown[]).filter((value): value is string => typeof value === 'string'))
        : undefined;
      const prepareStartedAt = performance.now();
      await ensureSimilarityVectorIndex();
      const queryStartedAt = performance.now();
      const result = similarityVectorIndex.query(itemId, {
        limit,
        allowedItemIds,
      });
      return {
        anchorHasEmbedding: result.anchorHasEmbedding,
        scores: Object.fromEntries(result.hits.map((hit) => [hit.itemId, hit.score])),
        indexSize: similarityVectorIndex.size,
        prepareMs: Math.round(queryStartedAt - prepareStartedAt),
        queryMs: Math.round(performance.now() - queryStartedAt),
      };
    }
    case 'getPendingEmbeddingItemIds': {
      const requestedLimit = Number(args[0]);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 48;
      const store = await getIdbCompatStore();
      return store.getPendingEmbeddingItemIds(limit);
    }
    case 'getPipelineSeedRows': {
      const ids = [...new Set(Array.isArray(args[0]) ? (args[0] as string[]).filter(Boolean) : [])];
      const store = await getIdbCompatStore();
      const items = [];
      const enrichment = [];
      for (const id of ids) {
        const item = store.getItem(id);
        if (item) items.push(item);
        const row = store.getEnrichment(id);
        if (row) enrichment.push(row);
      }
      return {
        projects: store.getAllProjects(),
        collections: store.getAllCollections(),
        items,
        workspaces: store.getAllWorkspaces(),
        enrichment,
        categories: store.getAllCategories(),
        links: store.getLinksForItemIds(ids),
        signals: store.getSignalsForItemIds(ids).map(signalMetaOnly),
        taxonomy: store.getTaxonomyState(),
        revision: revisionTracker.getLocalRevisionSync(),
      };
    }
    case 'pipelineCommitEmbeddingSignals': {
      const incoming = Array.isArray(args[0]) ? (args[0] as AiItemSignal[]) : [];
      if (!incoming.length) {
        return {
          itemIds: [], signals: [], links: [], categories: [],
          revision: revisionTracker.getLocalRevisionSync(),
        } satisfies PipelineStageCommitResult;
      }
      const store = await getIdbCompatStore();
      const committed = commitEmbeddingSignalsInStore(store, incoming);
      for (const signal of committed) applySignalToSimilarityIndex(signal);
      invalidateHubScopeEntryCache();
      const revision = revisionTracker.recordSqliteMutation();
      return {
        itemIds: committed.map((signal) => signal.itemId),
        signals: committed.map(signalMetaOnly),
        links: [],
        categories: [],
        revision,
      } satisfies PipelineStageCommitResult;
    }
    case 'pipelineCommitClassification': {
      const input = (args[0] ?? {}) as PipelineClassificationCommitInput;
      const categories = Array.isArray(input.categories) ? input.categories : [];
      const itemWrites = Array.isArray(input.itemWrites) ? input.itemWrites : [];
      if (!categories.length && !itemWrites.length) {
        return {
          itemIds: [], signals: [], links: [], categories: [],
          revision: revisionTracker.getLocalRevisionSync(),
        } satisfies PipelineStageCommitResult;
      }
      const store = await getIdbCompatStore();
      const itemIds = [...new Set(itemWrites.map((write) => write.itemId).filter(Boolean))];
      const committedSignals = commitClassificationInStore(store, { categories, itemWrites });
      invalidateHubScopeEntryCache();
      const revision = revisionTracker.recordSqliteMutation();
      return {
        itemIds,
        signals: committedSignals.map(signalMetaOnly),
        links: store.getLinksForItemIds(itemIds),
        categories,
        revision,
      } satisfies PipelineStageCommitResult;
    }
    case 'pipelineReconcileDownstream': {
      const store = await getIdbCompatStore();
      const categories = new Map(store.getAllCategories().map((category) => [category.id, category]));
      const signals = store.getAllSignals();
      const changedSignals: AiItemSignal[] = [];
      const changedItemIds: string[] = [];
      const changedCategories: import('../../categorization/types').AiCategory[] = [];
      let linksRestored = 0;
      let signalsRequeued = 0;
      let missingEmbeddings = 0;
      const now = Date.now();
      store.withTransaction(() => {
        for (const signal of signals) {
          if (!signal.embedding.length) missingEmbeddings++;
          if (!classifyStateRequiresPrimary(signal.classifyState)) continue;
          const existingLinks = store.getLinksByItem(signal.itemId);
          if (existingLinks.some(isCountableAiPrimary)) continue;

          const recoverableIds = existingLinks.length === 0
            ? [...new Set(signal.llmReview?.categoryIds ?? [])].filter((categoryId) => {
                const category = categories.get(categoryId);
                return Boolean(
                  category &&
                  category.kind === 'leaf' &&
                  category.assignable &&
                  category.status !== 'deprecated'
                );
              })
            : [];

          if (recoverableIds.length) {
            recoverableIds.forEach((categoryId, index) => {
              store.putLink({
                id: `link_${signal.itemId}_${categoryId}`,
                itemId: signal.itemId,
                categoryId,
                score: signal.llmReview?.confidence ?? 0.5,
                isPrimary: index === 0,
                source: 'ai',
                status: 'suggested',
                created_at: signal.lastClassifiedAt ?? now,
                updated_at: now,
              });
              linksRestored++;
            });
          } else {
            const next: AiItemSignal = {
              ...signal,
              classifyState: 'pending_classify',
              discoverState: 'none',
              isNovelty: false,
              classifyRetryCount: 0,
              lastClassifySkipReason: 'Re-queued — classified state had no durable primary link',
              lastClassifiedAt: undefined,
              lastProcessedAt: now,
            };
            store.putSignal(next);
            changedSignals.push(next);
            signalsRequeued++;
          }
          changedItemIds.push(signal.itemId);
        }
        if (linksRestored > 0) {
          const counts = new Map(
            store.getCategoryLinkCounts().map((row) => [row.categoryId, row])
          );
          for (const category of categories.values()) {
            const count = counts.get(category.id);
            const next = {
              ...category,
              itemCount: count?.itemCount ?? 0,
              primaryItemCount: count?.primaryItemCount ?? 0,
              secondaryItemCount: count?.secondaryItemCount ?? 0,
              updated_at: now,
            };
            if (
              next.itemCount !== (category.itemCount ?? 0) ||
              next.primaryItemCount !== (category.primaryItemCount ?? 0) ||
              next.secondaryItemCount !== (category.secondaryItemCount ?? 0)
            ) {
              store.putCategory(next);
              changedCategories.push(next);
            }
          }
        }
      });
      const itemIds = [...new Set(changedItemIds)];
      const revision = itemIds.length
        ? revisionTracker.recordSqliteMutation()
        : revisionTracker.getLocalRevisionSync();
      if (itemIds.length) {
        invalidateHubScopeEntryCache();
        scheduleFolderMirror();
      }
      return {
        itemIds,
        signals: changedSignals.map(signalMetaOnly),
        links: store.getLinksForItemIds(itemIds),
        categories: changedCategories,
        revision,
        linksRestored,
        signalsRequeued,
        missingEmbeddings,
      } satisfies PipelineDownstreamReconcileResult;
    }
    case 'getCategoryLinkCounts': {
      const store = await getIdbCompatStore();
      return store.getCategoryLinkCounts();
    }
    case 'getItemById': {
      const id = typeof args[0] === 'string' ? args[0] : '';
      if (!id) return undefined;
      const store = await getIdbCompatStore();
      return store.getItem(id);
    }
    case 'getItemsByUrl': {
      const url = typeof args[0] === 'string' ? args[0].trim() : '';
      const normalizedUrl = typeof args[1] === 'string' ? args[1] : url;
      if (!url) return [];
      const store = await getIdbCompatStore();
      const exact = store.getActiveItemsByExactUrl(url);
      if (exact.length) return exact;
      if (normalizedUrl && normalizedUrl !== url) {
        const byNormalized = store.getActiveItemsByExactUrl(normalizedUrl);
        if (byNormalized.length) return byNormalized;
      }
      // Last resort — avoid unless URLs differ only by tracking params not stored as exact.
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'ref', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'zanpid',
        '_ga', '_gl', 'yclid', 'dclid',
      ];
      const normalize = (value: string) => {
        try {
          const parsed = new URL(value.trim());
          for (const key of trackingParams) parsed.searchParams.delete(key);
          return parsed.toString();
        } catch {
          return value.trim();
        }
      };
      const target = normalize(normalizedUrl || url);
      return store
        .getAllItems()
        .filter((item) => item.deletedAt == null && item.url && normalize(item.url) === target);
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
      const { snapshotSummaryFromStore } = await import('../importFingerprint');
      return snapshotSummaryFromStore(store);
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
      await updateSimilarityCachesAfterBatch(ops);
      invalidateHubScopeEntryCache();
      if (shouldScheduleFolderMirrorForBatch(ops)) {
        scheduleFolderMirror();
      }
      return {
        applied: ops.length,
        revision: revisionTracker.recordSqliteMutation(),
      };
    }
    case 'storeMutate': {
      const storeMethod = args[0] as string;
      const storeArgs = (args[1] as unknown[]) ?? [];
      if (!isMutatingStoreMethod(storeMethod)) {
        throw new Error(`Store method is not a registered mutation: ${storeMethod}`);
      }
      const store = await getIdbCompatStore();
      const fn = (store as unknown as Record<string, (...a: unknown[]) => unknown>)[storeMethod];
      if (typeof fn !== 'function') {
        throw new Error(`Unknown store method: ${storeMethod}`);
      }
      const result = fn.apply(store, storeArgs);
      await updateSimilarityCachesAfterStoreMutation(storeMethod, storeArgs);
      invalidateHubScopeEntryCache();
      if (shouldScheduleFolderMirrorForMethod(storeMethod)) {
        scheduleFolderMirror();
      }
      return {
        result,
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
        await updateSimilarityCachesAfterStoreMutation(storeMethod, storeArgs);
        invalidateHubScopeEntryCache();
        if (shouldScheduleFolderMirrorForMethod(storeMethod)) {
          scheduleFolderMirror();
        }
        revisionTracker.recordSqliteMutation();
      }
      return result;
    }
    case 'updateItemAtomic': {
      const item = await dbCore.updateItemAtomic(
        ...(args as Parameters<typeof dbCore.updateItemAtomic>)
      );
      if (!item) {
        return { item: null, revision: revisionTracker.getLocalRevisionSync() };
      }
      invalidateHubScopeEntryCache();
      await refreshSimilarityVectorForItem(item.id);
      scheduleFolderMirror();
      return {
        item,
        revision: revisionTracker.recordSqliteMutation(),
      };
    }
    case 'removeItemPlacementsAtomic': {
      const result = await dbCore.removeItemPlacementsAtomic(
        ...(args as Parameters<typeof dbCore.removeItemPlacementsAtomic>)
      );
      if (result.mode === 'noop') {
        return { ...result, revision: revisionTracker.getLocalRevisionSync() };
      }
      invalidateHubScopeEntryCache();
      if (result.item) await refreshSimilarityVectorForItem(result.item.id);
      scheduleFolderMirror();
      return {
        ...result,
        revision: revisionTracker.recordSqliteMutation(),
      };
    }
    case 'restoreItemPlacementsAtomic': {
      const result = await dbCore.restoreItemPlacementsAtomic(
        ...(args as Parameters<typeof dbCore.restoreItemPlacementsAtomic>)
      );
      if (!result.restoredCollectionIds.length) {
        return { ...result, revision: revisionTracker.getLocalRevisionSync() };
      }
      invalidateHubScopeEntryCache();
      if (result.item) await refreshSimilarityVectorForItem(result.item.id);
      scheduleFolderMirror();
      return {
        ...result,
        revision: revisionTracker.recordSqliteMutation(),
      };
    }
    case 'deleteCollectionAtomic': {
      const result = await dbCore.deleteCollectionAtomic(
        ...(args as Parameters<typeof dbCore.deleteCollectionAtomic>)
      );
      if (!result.deleted) {
        return { ...result, revision: revisionTracker.getLocalRevisionSync() };
      }
      invalidateHubScopeEntryCache();
      scheduleFolderMirror();
      return {
        ...result,
        revision: revisionTracker.recordSqliteMutation(),
      };
    }
    case 'deleteProjectAtomic': {
      const result = await dbCore.deleteProjectAtomic(
        ...(args as Parameters<typeof dbCore.deleteProjectAtomic>)
      );
      if (!result.deleted) {
        return { ...result, revision: revisionTracker.getLocalRevisionSync() };
      }
      invalidateHubScopeEntryCache();
      scheduleFolderMirror();
      return {
        ...result,
        revision: revisionTracker.recordSqliteMutation(),
      };
    }
    case 'undoContainerDeletion': {
      const restored = await dbCore.undoContainerDeletion(...(args as Parameters<typeof dbCore.undoContainerDeletion>));
      if (!restored) return { restored: false, revision: revisionTracker.getLocalRevisionSync() };
      invalidateHubScopeEntryCache();
      scheduleFolderMirror();
      return { restored: true, revision: revisionTracker.recordSqliteMutation() };
    }
    case 'purgeContainerTrash': {
      const purged = await dbCore.purgeContainerTrash(...(args as Parameters<typeof dbCore.purgeContainerTrash>));
      if (!purged) return { purged: 0, revision: revisionTracker.getLocalRevisionSync() };
      scheduleFolderMirror();
      return { purged, revision: revisionTracker.recordSqliteMutation() };
    }
    case 'exportSqliteBytes':
      return dbCore.exportSqliteBytes();
    case 'importDB': {
      const imported = await dbCore.importDB(args[0] as string, args[1] as boolean);
      if (imported) {
        resetSimilarityCaches();
        await mirrorAfterImport('importDB');
      }
      return imported;
    }
    case 'bulkImportBookmarks': {
      const bulk = await dbCore.bulkImportBookmarks(
        ...(args as Parameters<typeof dbCore.bulkImportBookmarks>)
      );
      invalidateHubScopeEntryCache();
      revisionTracker.recordSqliteMutation();
      // Soft debounce after import — avoids OOM; folder catches up within seconds.
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

async function runOneRpc(req: RpcRequest): Promise<void> {
  const { id, method, args } = req;
  try {
    const result = await handleMethod(method, args ?? []);
    const response: RpcResponse = { id, ok: true, result };
    workerScope.postMessage(response);
    if (!READ_ONLY_RPC_METHODS.has(method) && !IMPORT_METHODS.has(method)) {
      workerScope.postMessage({
        type: 'data-changed',
        revision: revisionTracker.getLocalRevisionSync(),
      });
    }
  } catch (e) {
    const response: RpcResponse = { id, ok: false, error: String(e) };
    workerScope.postMessage(response);
  }
}

function pumpRpcQueue(): void {
  if (rpcPumpRunning) return;
  const next = highRpcQueue.shift() ?? lowRpcQueue.shift();
  if (!next) return;
  rpcPumpRunning = true;
  void runOneRpc(next).finally(() => {
    rpcPumpRunning = false;
    pumpRpcQueue();
  });
}

workerScope.onmessage = async (event: MessageEvent<RpcRequest | { type: string; ok?: boolean; error?: string; bytes?: ArrayBuffer | Uint8Array | null }>) => {
  const data = event.data;
  if (data && typeof data === 'object' && 'type' in data && data.type === 'mirror-ack') {
    if (pendingMirrorWrite) {
      pendingMirrorWrite({ ok: Boolean(data.ok), error: data.error });
      pendingMirrorWrite = null;
    }
    return;
  }

  const req = event.data as RpcRequest;
  if (req.priority === 'low') lowRpcQueue.push(req);
  else highRpcQueue.push(req);
  pumpRpcQueue();
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
