/**
 * Database Layer - SQLite WASM (OPFS live + folder mirror)
 *
 * Live DB: OPFS in single DB worker (`storage/dbWorker`). Debounced mirror:
 * `{backupFolder}/workbench.sqlite` + `workbench.meta.json`.
 * Legacy IDB / localStorage domain copies purged on startup (`legacyStorageCleanup`).
 */

import { getIdbCompatStore, IdbCompatStore } from './storage/sqlite/store';
import {
  ensureDbWorker,
  getRemoteStore,
  isDbWorkerProcess,
  mirrorNow,
  resetRemoteStore,
} from './storage/dbClient';
import { notifyDataChanged } from './dataChangeNotifier';
import { countRestoreSummaryStats } from './itemQuickAccess';
import { syncItemPlacementsWithCollectionIds } from './itemPlacements';
import { normalizeBinaryPayload } from './binaryPayload';
import { parseBackupText, BackupEnvelopeMeta } from './backupEnvelope';
import { collectBackupVerifyWarnings } from './backupVerify';
import { revisionTracker } from './revisionTracker';
import type { DbMutation } from './storage/dbMutations';
import type { PipelineCacheSeed } from './storage/dbClient/remoteStore';
import type { ItemEnrichment } from './enrichment/types';
import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  AiTaxonomyState,
} from './categorization/types';
import type { TrashHistoryEntry } from './trashHistory';
import { shouldPreferImportTitle } from './import/xImportHygiene';
import { nowMs } from './time/clock';
import {
  assertCanCreateCollectionInProject,
  INBOX_PROJECT_NAME,
  INCOMING_COLLECTION_NAME,
  UNFILED_COLLECTION_NAME,
} from './systemDataModel';

export type { AiCategory, AiItemCategoryLink, AiItemSignal, AiTaxonomyState };

const DEFAULT_PROJECT_ID = 'project_default';
const DEFAULT_PROJECT_NAME = INBOX_PROJECT_NAME;
const DEFAULT_UNSORTED_COLLECTION_ID = `collection_${DEFAULT_PROJECT_ID}_unsorted`;
const DEFAULT_UNSORTED_COLLECTION_NAME = INCOMING_COLLECTION_NAME;

export const ALL_PROJECTS_ID = '__all__';

// ============================================================================
// Types (unchanged from IDB version)
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  created_at: number;
  updated_at: number;
}

export interface Collection {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  primaryProjectId: string;
  projectIds: string[];
  isDefault: boolean;
  color?: string;
}

export interface ItemPlacement {
  collectionId: string;
  notes?: string;
  tags?: string[];
  addedAt: number;
  source: string;
}

export interface Item {
  id: string;
  url: string;
  urlRaw?: string;
  title: string;
  favicon?: string;
  collectionIds: string[];
  tags: string[];
  notes?: string;
  placements?: Record<string, ItemPlacement>;
  created_at: number;
  updated_at: number;
  source: 'tab' | 'twitter' | 'manual' | 'bookmark' | string;
  metadata?: Record<string, any>;
  pinnedAt?: number;
  favoriteAt?: number;
  deletedAt?: number;
}

export type UpdateItemOptions = {
  notesPlacementCollectionId?: string;
};

export interface Snapshot {
  id?: number;
  timestamp: number;
  tabCount: number;
  tabs: { title: string; url: string; favIconUrl: string }[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  collectionId: string;
  linkedItemIds: string[];
  pageContext?: {
    url: string;
    title: string;
    timestamp: number;
  };
  created_at: number;
  updated_at: number;
  externalIds?: Record<string, string>;
}

export interface WorkspaceTab {
  url: string;
  title?: string;
  favIconUrl?: string;
}

export interface WorkspaceWindow {
  id: string;
  name?: string;
  tabs: WorkspaceTab[];
}

export interface Workspace {
  id: string;
  name: string;
  projectId?: string;
  created_at: number;
  updated_at: number;
  windows: WorkspaceWindow[];
}

// ============================================================================
// Helpers (unchanged from IDB version)
// ============================================================================

const ensureIncludes = (arr: string[], value: string) => (arr.includes(value) ? arr : [...arr, value]);
const nowTs = () => nowMs();

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url.trim());
const isBookmarkUrl = (url: string) => {
  const t = url.trim();
  return /^https?:\/\//i.test(t) || /^file:\/\//i.test(t);
};

export function getBookmarkOpenUrl(item: Pick<Item, 'url' | 'urlRaw'>): string {
  return (item.url?.trim() || item.urlRaw?.trim() || '').trim();
}

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'zanpid',
  '_ga', '_gl', 'yclid', 'dclid'
];

export const normalizeBookmarkUrl = (url: string): string => {
  const raw = url.trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    TRACKING_PARAMS.forEach((p) => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return raw;
  }
};

const findItemByNormalizedUrl = (
  store: IdbCompatStore,
  normalizedUrl: string
): Item | undefined => {
  if (!normalizedUrl || !isBookmarkUrl(normalizedUrl)) return undefined;
  const all = store.getAllItems();
  return all.find((it) => {
    if (!it.url || !isBookmarkUrl(it.url)) return false;
    return normalizeBookmarkUrl(it.url) === normalizedUrl;
  });
};

const hasSharedCollection = (a: string[], b: string[]) => {
  const set = new Set(a);
  return b.some((id) => set.has(id));
};

const assertNoBookmarkDuplicateInCollections = (
  store: IdbCompatStore,
  url: string,
  collectionIds: string[],
  excludeItemId?: string
) => {
  if (!isBookmarkUrl(url)) return;
  const normalized = normalizeBookmarkUrl(url);
  const all = store.getAllItems();
  const duplicate = all.find((it) => {
    if (excludeItemId && it.id === excludeItemId) return false;
    if (!it.url || !isBookmarkUrl(it.url)) return false;
    return normalizeBookmarkUrl(it.url) === normalized && hasSharedCollection(it.collectionIds || [], collectionIds);
  });
  if (duplicate) {
    throw new Error('This bookmark already exists in the selected collection. Use another collection or update the existing one.');
  }
};

// ============================================================================
// Store initialization
// ============================================================================

export type { HydrateProgress, HydrateStage } from './storage/dbClient/remoteStore';

export type LibraryHydrateProgress = {
  label: string;
  percent?: number;
};

type HydrateProgressListener = (progress: import('./storage/dbClient/remoteStore').HydrateProgress) => void;

const hydrateProgressListeners = new Set<HydrateProgressListener>();

function emitLibraryHydrateProgress(
  progress: import('./storage/dbClient/remoteStore').HydrateProgress
): void {
  for (const listener of hydrateProgressListeners) {
    listener(progress);
  }
}

/** Subscribe to paged library hydrate progress (essential + background pipeline). */
export function subscribeLibraryHydrateProgress(
  listener: HydrateProgressListener
): () => void {
  hydrateProgressListeners.add(listener);
  return () => hydrateProgressListeners.delete(listener);
}

const TABLE_HYDRATE_LABELS: Record<string, string> = {
  items: 'items',
  notes: 'notes',
  item_enrichment: 'enrichment',
  ai_item_signals: 'signals',
  ai_item_category_links: 'category links',
  projects: 'projects',
  collections: 'collections',
};

export function formatLibraryHydrateProgress(
  progress: import('./storage/dbClient/remoteStore').HydrateProgress
): LibraryHydrateProgress {
  const name = TABLE_HYDRATE_LABELS[progress.table] ?? progress.table.replace(/_/g, ' ');
  const pageSuffix = progress.page > 1 ? ` (page ${progress.page})` : '';
  if (progress.stage === 'pipeline') {
    return { label: `Loading ${name}…${pageSuffix}` };
  }
  return { label: `Loading ${name}…${pageSuffix}` };
}

let storePromise: Promise<IdbCompatStore> | null = null;
/** Serializes getDB vs reloadDB so callers cannot receive a stale store mid-reload. */
let dbLifecycle: Promise<void> = Promise.resolve();

async function initTabStore(mode: 'startup' | 'full' = 'startup'): Promise<IdbCompatStore> {
  const { isTransientDbRpcError } = await import('./storage/dbClient');
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await ensureDbWorker();
      const store = getRemoteStore();
      const onProgress = emitLibraryHydrateProgress;
      if (mode === 'full') {
        await store.hydrate({ force: true, stages: ['essential', 'pipeline'], onProgress });
      } else {
        await store.hydrate({ force: true, stages: ['essential'], onProgress });
        store.startPipelineHydrateInBackground({ onProgress });
      }
      await ensureDefaultProjectAndCollection(store as unknown as IdbCompatStore);
      return store as unknown as IdbCompatStore;
    } catch (e) {
      lastError = e;
      if (!isTransientDbRpcError(e) || attempt >= 3) throw e;
      resetRemoteStore();
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Await pipeline tables in tab cache (Hub, classify, search). */
export async function ensurePipelineHydrated(): Promise<void> {
  if (isDbWorkerProcess()) return;
  const store = getRemoteStore();
  await store.ensurePipelineHydrated({ onProgress: emitLibraryHydrateProgress });
}

export const getDB = async (): Promise<IdbCompatStore> => {
  // OPFS is live truth — do not require folder *write* permission (Chrome often
  // resets to `prompt` after reload). First-time pick is gated in App.
  const { requireConfiguredBackupFolder } = await import('./backupFolder');
  await requireConfiguredBackupFolder();
  if (isDbWorkerProcess()) {
    if (!storePromise) {
      storePromise = (async () => {
        const store = await getIdbCompatStore();
        await ensureDefaultProjectAndCollection(store);
        return store;
      })();
    }
    return storePromise;
  }
  await dbLifecycle;
  if (!storePromise) {
    storePromise = initTabStore().catch((e) => {
      storePromise = null;
      throw e;
    });
  }
  return storePromise;
};

/** Install a page-warmed cache before starting an offscreen pipeline job. */
export function installPipelineCacheSeed(seed: PipelineCacheSeed): void {
  if (isDbWorkerProcess()) {
    throw new Error('Pipeline cache seeds are for remote execution realms only');
  }
  const store = getRemoteStore();
  store.installPipelineCacheSeed(seed);
  storePromise = Promise.resolve(store as unknown as IdbCompatStore);
}

/** Refresh tab cache from the shared OPFS DB worker. */
export const reloadDB = async (): Promise<IdbCompatStore> => {
  const { requireConfiguredBackupFolder } = await import('./backupFolder');
  await requireConfiguredBackupFolder();
  if (isDbWorkerProcess()) {
    const { resetStoreSingletons } = await import('./storage/sqlite/store');
    storePromise = null;
    resetStoreSingletons();
    return getDB();
  }
  const reloadOp = dbLifecycle.then(async () => {
    storePromise = null;
    resetRemoteStore();
    const store = await initTabStore('full');
    storePromise = Promise.resolve(store);
    return store;
  });
  dbLifecycle = reloadOp.then(
    () => undefined,
    () => undefined
  );
  return reloadOp;
};

async function ensureDefaultProjectAndCollection(store: IdbCompatStore) {
  const now = nowTs();
  
  const existingProject = store.getProject(DEFAULT_PROJECT_ID);
  if (!existingProject) {
    store.putProject({
      id: DEFAULT_PROJECT_ID,
      name: DEFAULT_PROJECT_NAME,
      isDefault: true,
      created_at: now,
      updated_at: now,
    });
  }

  const existingCollection = store.getCollection(DEFAULT_UNSORTED_COLLECTION_ID);
  if (!existingCollection) {
    store.putCollection({
      id: DEFAULT_UNSORTED_COLLECTION_ID,
      name: DEFAULT_UNSORTED_COLLECTION_NAME,
      color: '#3b82f6',
      isDefault: true,
      created_at: now,
      updated_at: now,
      primaryProjectId: DEFAULT_PROJECT_ID,
      projectIds: [DEFAULT_PROJECT_ID],
    });
  }

  return {
    defaultProjectId: DEFAULT_PROJECT_ID,
    defaultUnsortedCollectionId: DEFAULT_UNSORTED_COLLECTION_ID,
  };
}

async function ensureDefaultCollectionForProject(store: IdbCompatStore, projectId: string) {
  const now = nowTs();
  const id = `collection_${projectId}_unsorted`;
  const existing = store.getCollection(id);
  if (!existing) {
    store.putCollection({
      id,
      name: UNFILED_COLLECTION_NAME,
      color: '#3b82f6',
      isDefault: true,
      created_at: now,
      updated_at: now,
      primaryProjectId: projectId,
      projectIds: [projectId],
    });
  }
  return id;
}

/** Reload worker OPFS from folder workbench.sqlite and refresh tab cache. */
export const reloadFromFolderDatabase = async (): Promise<boolean> => {
  try {
    const {
      hasWritableBackupFolder,
      WORKBENCH_DB_FILE,
    } = await import('./backupFolder');
    if (!(await hasWritableBackupFolder())) return false;

    const { forceImportFromBackupFolderFile } = await import('./storage/dbClient/folderDbRpc');
    const result = await forceImportFromBackupFolderFile(WORKBENCH_DB_FILE);
    if (!result?.imported) return false;

    await reloadDB();
    return true;
  } catch (e) {
    console.error('reloadFromFolderDatabase failed:', e);
    return false;
  }
};

/** Force an immediate folder mirror (OPFS → workbench.sqlite). */
export const flushFolderMirror = async (): Promise<{ ok: boolean; error?: string }> => {
  if (isDbWorkerProcess()) {
    const { mirrorNow: workerMirror } = await import('./storage/dbWorker/mirrorToFolder');
    return workerMirror(true);
  }
  return mirrorNow(true);
};

export async function ensureProjectUnsortedCollection(projectId: string): Promise<string> {
  const store = await getDB();
  return ensureDefaultCollectionForProject(store, projectId);
}

// ============================================================================
// Item CRUD
// ============================================================================

export interface AddItemResult {
  itemId: string;
  merged: boolean;
  addedToCollections: string[];
  alreadyInCollections: string[];
  updatedPlacementNotes?: boolean;
}

export const addItem = async (
  item: Omit<Item, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Item, 'updated_at'>>
): Promise<string> => {
  const result = await addItemWithMerge(item);
  return result.itemId;
};

async function commitAndVerifyItem(itemId: string): Promise<void> {
  await commitPendingDbWrites();
  if (isDbWorkerProcess()) return;
  const persisted = await getRemoteStore().getPersistedItem(itemId);
  if (!persisted || persisted.id !== itemId) {
    throw new Error('The database did not confirm this bookmark was saved');
  }
}

/** Fire-and-forget durability — UI already has write-through memory. */
function commitAndVerifyItemInBackground(itemId: string, urlForWorkingSet?: string): void {
  void commitAndVerifyItem(itemId)
    .then(() => {
      if (urlForWorkingSet) {
        void import('./storage/workingSetCache').then(({ markUrlDurable }) => {
          markUrlDurable(urlForWorkingSet);
        });
      }
    })
    .catch((err) => {
      console.error('[db] background durable commit failed:', err);
    });
}

async function commitAndVerifyItemDeleted(itemId: string): Promise<void> {
  await commitPendingDbWrites();
  if (isDbWorkerProcess()) return;
  const persisted = await getRemoteStore().getPersistedItem(itemId);
  if (persisted) {
    throw new Error('The database did not confirm this bookmark was deleted');
  }
}

export type AddItemWithMergeOptions = {
  /**
   * When false, return after memory write-through; DB ack runs in background.
   * Side panel / interactive save should use false for instant UX.
   */
  awaitDurable?: boolean;
};

export const addItemWithMerge = async (
  item: Omit<Item, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Item, 'updated_at'>>,
  opts?: AddItemWithMergeOptions
): Promise<AddItemResult> => {
  const awaitDurable = opts?.awaitDurable !== false;
  const store = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(store);
  const now = nowTs();
  const collectionIds = Array.isArray(item.collectionIds) && item.collectionIds.length > 0 
    ? item.collectionIds 
    : [defaultUnsortedCollectionId];

  const finishCommit = async (itemId: string, url?: string) => {
    if (awaitDurable) {
      await commitAndVerifyItem(itemId);
      if (url) {
        const { markUrlDurable } = await import('./storage/workingSetCache');
        markUrlDurable(url);
      }
      return;
    }
    commitAndVerifyItemInBackground(itemId, url);
  };
  
  if (!item.url?.trim() || !isBookmarkUrl(item.url)) {
    const id = crypto.randomUUID();
    const placements: Record<string, ItemPlacement> = {};
    for (const cid of collectionIds) {
      placements[cid] = {
        collectionId: cid,
        notes: item.notes,
        tags: item.tags,
        addedAt: now,
        source: item.source || 'manual'
      };
    }
    store.putItem({ 
      ...item, 
      id, 
      created_at: now, 
      updated_at: item.updated_at ?? now, 
      collectionIds,
      placements
    } as Item);
    await finishCommit(id);
    notifyDataChanged('item.add');
    return { itemId: id, merged: false, addedToCollections: collectionIds, alreadyInCollections: [] };
  }
  
  const savedUrl = item.url.trim();
  const dedupeKey = normalizeBookmarkUrl(savedUrl);
  const existing = findItemByNormalizedUrl(store, dedupeKey);
  
  if (existing) {
    const placements = existing.placements || {};
    const addedToCollections: string[] = [];
    const alreadyInCollections: string[] = [];
    let updatedPlacementNotes = false;

    for (const cid of collectionIds) {
      if (!placements[cid]) {
        placements[cid] = {
          collectionId: cid,
          notes: item.notes,
          tags: item.tags,
          addedAt: now,
          source: item.source || 'manual'
        };
        addedToCollections.push(cid);
      } else {
        alreadyInCollections.push(cid);
        if (Object.prototype.hasOwnProperty.call(item, 'notes')) {
          updatedPlacementNotes = true;
          const prev = placements[cid];
          placements[cid] = {
            collectionId: cid,
            addedAt: prev?.addedAt ?? now,
            source: prev?.source ?? item.source ?? 'manual',
            tags: item.tags !== undefined ? item.tags : prev?.tags,
            notes: item.notes || undefined,
          };
        }
      }
    }
    
    const newCollectionIds = Object.keys(placements);
    
    let title = existing.title;
    if (item.title && item.title !== item.url) {
      const incomingTitle = item.title.trim();
      const existingWeak = !existing.title || existing.title === existing.url || existing.title.length < 8;
      if (existingWeak || (item.source === 'tab' && incomingTitle && incomingTitle !== existing.title)) {
        title = incomingTitle;
      }
    }

    let favicon = existing.favicon;
    if (item.favicon && !existing.favicon) {
      favicon = item.favicon;
    }

    // Re-saving a URL that was previously trashed must restore it (un-delete),
    // otherwise the item stays in the trash and never shows up as an active
    // bookmark even though the save "succeeded".
    const wasTrashed = existing.deletedAt != null;

    store.putItem({
      ...existing,
      title,
      favicon,
      collectionIds: newCollectionIds,
      placements,
      deletedAt: undefined,
      updated_at: now
    });

    if (wasTrashed || store.getTrashEntry(dedupeKey)) {
      store.deleteTrashEntry(dedupeKey);
    }

    const mergedItem = store.getItem(existing.id);
    if (mergedItem) {
      const { pinSavedItem } = await import('./storage/workingSetCache');
      pinSavedItem(savedUrl, mergedItem, { durable: awaitDurable });
    }

    await finishCommit(existing.id, savedUrl);
    notifyDataChanged('item.update');
    return {
      itemId: existing.id,
      merged: true,
      addedToCollections,
      alreadyInCollections,
      updatedPlacementNotes: updatedPlacementNotes || undefined,
    };
  }
  
  const id = crypto.randomUUID();
  const placements: Record<string, ItemPlacement> = {};
  for (const cid of collectionIds) {
    placements[cid] = {
      collectionId: cid,
      notes: item.notes,
      tags: item.tags,
      addedAt: now,
      source: item.source || 'manual'
    };
  }
  
  const created = { 
    ...item, 
    id, 
    url: savedUrl,
    created_at: now, 
    updated_at: item.updated_at ?? now, 
    collectionIds,
    placements
  } as Item;
  store.putItem(created);

  {
    const { pinSavedItem } = await import('./storage/workingSetCache');
    pinSavedItem(savedUrl, created, { durable: awaitDurable });
  }

  await finishCommit(id, savedUrl);
  notifyDataChanged('item.add');
  return { itemId: id, merged: false, addedToCollections: collectionIds, alreadyInCollections: [] };
};

export const getAllItems = async () => {
  const store = await getDB();
  return store.getAllItems();
};

export const getItem = async (id: string): Promise<Item | undefined> => {
  const store = await getDB();
  return store.getItem(id);
};

/**
 * Instant read-buffer lookup (no RPC). Uses warm RemoteStore snapshot when ready.
 */
export function findActiveItemsByUrlInReadBuffer(url: string): Item[] {
  const trimmed = url.trim();
  if (!trimmed || !isBookmarkUrl(trimmed)) return [];
  const target = normalizeBookmarkUrl(trimmed);
  try {
    const store = getRemoteStore();
    if (!store.isEssentialReady()) return [];
    return store
      .getAllItems()
      .filter(
        (item) =>
          item.deletedAt == null &&
          !!item.url &&
          normalizeBookmarkUrl(item.url) === target
      );
  } catch {
    return [];
  }
}

/** Cold-start / confirm path — prefers memory + working set, then DB worker. */
export async function getActiveItemsByUrlFast(url: string): Promise<Item[]> {
  const trimmed = url.trim();
  if (!trimmed || !isBookmarkUrl(trimmed)) return [];

  const { lookupWorkingSetByUrl, pinItemsForUrl, markOpenTabUrl } = await import(
    './storage/workingSetCache'
  );
  markOpenTabUrl(trimmed);

  const cached = lookupWorkingSetByUrl(trimmed);
  if (cached && cached.length > 0) return cached;

  const fromMemory = findActiveItemsByUrlInReadBuffer(trimmed);
  if (fromMemory.length > 0) {
    pinItemsForUrl(trimmed, fromMemory, { durable: true });
    return fromMemory;
  }

  if (isDbWorkerProcess()) {
    const store = await getDB();
    const matches = store
      .getAllItems()
      .filter(
        (item) =>
          item.deletedAt == null &&
          !!item.url &&
          normalizeBookmarkUrl(item.url) === normalizeBookmarkUrl(trimmed)
      );
    pinItemsForUrl(trimmed, matches, { durable: true });
    return matches;
  }

  const matches = await getRemoteStore().getPersistedItemsByUrl(
    trimmed,
    normalizeBookmarkUrl(trimmed)
  );
  const active = matches.filter((item) => item.deletedAt == null);
  pinItemsForUrl(trimmed, active, { durable: true });
  return active;
}

export const getItemPlacementCount = async (id: string): Promise<number> => {
  const store = await getDB();
  const item = store.getItem(id);
  if (!item) return 0;
  return item.placements ? Object.keys(item.placements).length : item.collectionIds.length;
};

export const removeItemFromCollection = async (
  itemId: string, 
  collectionId: string
): Promise<{ removed: boolean; itemDeleted: boolean; itemTrashed: boolean; remainingPlacements: number }> => {
  const store = await getDB();
  const item = store.getItem(itemId);
  
  if (!item) {
    return { removed: false, itemDeleted: false, itemTrashed: false, remainingPlacements: 0 };
  }
  
  const placements = { ...(item.placements || {}) };
  delete placements[collectionId];
  
  const newCollectionIds = Object.keys(placements);
  
  if (newCollectionIds.length === 0) {
    const now = nowTs();
    store.putItem({
      ...item,
      deletedAt: now,
      updated_at: now,
    });
    // Record trash history
    const { recordTrashHistory } = await import('./trashHistory');
    await recordTrashHistory(item, {
      reason: 'Removed from last collection',
      reasonCode: 'remove_last_collection',
    }, { notify: false });
    await commitAndVerifyItem(itemId);
    notifyDataChanged('item.update');
    return { removed: true, itemDeleted: false, itemTrashed: true, remainingPlacements: 0 };
  }
  
  store.putItem({
    ...item,
    collectionIds: newCollectionIds,
    placements,
    updated_at: nowTs()
  });

  await commitAndVerifyItem(itemId);
  notifyDataChanged('item.update');
  return { removed: true, itemDeleted: false, itemTrashed: false, remainingPlacements: newCollectionIds.length };
};

export const deleteItem = async (id: string): Promise<{ deleted: boolean; placementCount: number }> => {
  const store = await getDB();
  const item = store.getItem(id);
  
  if (!item) {
    return { deleted: false, placementCount: 0 };
  }
  
  const placementCount = item.placements ? Object.keys(item.placements).length : item.collectionIds.length;
  try {
    const { deleteEnrichmentForItem } = await import('./enrichment/fetchService');
    await deleteEnrichmentForItem(id);
  } catch (e) {
    console.warn('Enrichment cleanup on delete failed:', e);
  }
  store.deleteItem(id);
  await commitAndVerifyItemDeleted(id);
  notifyDataChanged('item.delete');
  return { deleted: true, placementCount };
};

export const deleteItemSimple = async (id: string): Promise<void> => {
  await deleteItem(id);
};

// ============================================================================
// Project CRUD
// ============================================================================

export const getAllProjects = async () => {
  const store = await getDB();
  return store.getAllProjects();
};

export const addProject = async (name: string, description?: string) => {
  const store = await getDB();
  const now = nowTs();
  const id = crypto.randomUUID();
  store.putProject({
    id,
    name,
    description,
    isDefault: false,
    created_at: now,
    updated_at: now,
  });
  await ensureDefaultCollectionForProject(store, id);
  await commitPendingDbWrites();
  notifyDataChanged('project.add');
  return id;
};

export const updateProject = async (id: string, updates: Partial<Omit<Project, 'id' | 'created_at'>>) => {
  const store = await getDB();
  const existing = store.getProject(id);
  if (!existing) return false;
  const now = nowTs();
  store.putProject({ ...existing, ...updates, updated_at: now });
  await commitPendingDbWrites();
  notifyDataChanged('project.update');
  return true;
};

export const deleteProject = async (id: string) => {
  const store = await getDB();
  if (id === DEFAULT_PROJECT_ID) return false;
  
  const { defaultProjectId } = await ensureDefaultProjectAndCollection(store);
  const collections = store.getAllCollections();
  
  for (const col of collections) {
    if (col.primaryProjectId === id) {
      const newProjectIds = ensureIncludes(col.projectIds.filter((p) => p !== id), defaultProjectId);
      store.putCollection({
        ...col,
        primaryProjectId: defaultProjectId,
        projectIds: newProjectIds,
        updated_at: nowTs(),
      });
    } else if (col.projectIds.includes(id)) {
      const newProjectIds = col.projectIds.filter((p) => p !== id);
      store.putCollection({
        ...col,
        projectIds: newProjectIds,
        updated_at: nowTs(),
      });
    }
  }

  store.deleteProject(id);
  await commitPendingDbWrites();
  notifyDataChanged('project.delete');
  return true;
};

// ============================================================================
// Collection CRUD
// ============================================================================

export const getAllCollections = async () => {
  const store = await getDB();
  return store.getAllCollections();
};

export const addCollection = async (name: string, color?: string, projectId?: string) => {
  const store = await getDB();
  const { defaultProjectId } = await ensureDefaultProjectAndCollection(store);
  const primaryProjectId = projectId || defaultProjectId;
  assertCanCreateCollectionInProject(primaryProjectId, defaultProjectId);
  const id = crypto.randomUUID();
  const now = nowTs();
  store.putCollection({
    id,
    name,
    created_at: now,
    updated_at: now,
    primaryProjectId,
    projectIds: [primaryProjectId],
    isDefault: false,
    color: color || '#3b82f6',
  });
  await commitPendingDbWrites();
  notifyDataChanged('collection.add');
  return id;
};

export const deleteCollection = async (id: string) => {
  const store = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(store);
  
  const items = store.getAllItems().filter(item => item.collectionIds.includes(id));
  for (const item of items) {
    const next = (item.collectionIds || []).filter((cid) => cid !== id);
    store.putItem({
      ...item,
      collectionIds: next.length > 0 ? next : [defaultUnsortedCollectionId],
      updated_at: nowTs(),
    });
  }
  store.deleteCollection(id);
  await commitPendingDbWrites();
  notifyDataChanged('collection.delete');
};

export const updateCollection = async (id: string, updates: Partial<Omit<Collection, 'id' | 'created_at'>>) => {
  const store = await getDB();
  const collection = store.getCollection(id);
  if (collection) {
    store.putCollection({ ...collection, ...updates, updated_at: nowTs() });
    await commitPendingDbWrites();
    notifyDataChanged('collection.update');
  }
};

export const updateItemCollection = async (itemId: string, collectionId: string | undefined) => {
  const store = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(store);
  const item = store.getItem(itemId);
  if (item) {
    const nextIds = typeof collectionId === 'string' ? [collectionId] : [defaultUnsortedCollectionId];
    assertNoBookmarkDuplicateInCollections(store, item.url || '', nextIds, item.id);
    const now = nowTs();
    const synced = syncItemPlacementsWithCollectionIds(item, nextIds, now);
    store.putItem({
      ...item,
      collectionIds: synced.collectionIds,
      placements: synced.placements,
      updated_at: now,
    });
    await commitAndVerifyItem(itemId);
    notifyDataChanged('item.update');
  }
};

export const getItemsByCollection = async (collectionId: string | undefined) => {
  const store = await getDB();
  if (collectionId === undefined) {
    const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(store);
    return store.getAllItems().filter(item => item.collectionIds.includes(defaultUnsortedCollectionId));
  }
  return store.getAllItems().filter(item => item.collectionIds.includes(collectionId));
};

export const updateItem = async (
  id: string,
  updates: Partial<Omit<Item, 'id' | 'created_at'>>,
  options?: UpdateItemOptions
) => {
  const store = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(store);
  const item = store.getItem(id);
  if (!item) return;

  const now = nowTs();
  const hasNotesUpdate = Object.prototype.hasOwnProperty.call(updates, 'notes');
  const hasCollectionIdsUpdate = Object.prototype.hasOwnProperty.call(updates, 'collectionIds');
  const notesValue = hasNotesUpdate ? updates.notes : undefined;
  const restUpdates = { ...updates } as Partial<Item>;
  if (hasNotesUpdate) delete restUpdates.notes;

  let next: Item = { ...item, ...restUpdates, updated_at: now } as Item;

  if (!Array.isArray(next.collectionIds) || next.collectionIds.length === 0) {
    next.collectionIds = [defaultUnsortedCollectionId];
  }

  // When membership changes (or was empty), keep placements in lockstep with collectionIds.
  if (hasCollectionIdsUpdate || !item.placements || Object.keys(item.placements).length === 0) {
    const synced = syncItemPlacementsWithCollectionIds(
      { ...item, ...next },
      next.collectionIds,
      now
    );
    next.collectionIds = synced.collectionIds;
    next.placements = synced.placements;
  }

  if (hasNotesUpdate) {
    const multi = (next.collectionIds?.length ?? 0) > 1 || Object.keys(next.placements || {}).length > 1;

    let placementId = options?.notesPlacementCollectionId;
    if (!placementId && !multi) {
      placementId = next.collectionIds?.[0] || Object.keys(next.placements || {})[0];
    }
    if (!placementId && multi && updates.collectionIds?.length === 1) {
      const only = updates.collectionIds[0];
      if ((next.collectionIds || []).includes(only)) placementId = only;
    }

    if (placementId && (next.collectionIds || []).includes(placementId)) {
      const placements = { ...(next.placements || {}) };
      const prev = placements[placementId];
      placements[placementId] = {
        collectionId: placementId,
        addedAt: prev?.addedAt ?? now,
        source: prev?.source ?? 'manual',
        tags: prev?.tags,
        notes: notesValue || undefined,
      };
      next.placements = placements;
      next.notes = undefined;
    } else if (hasNotesUpdate && !multi && !placementId) {
      next.notes = notesValue || undefined;
    } else if (hasNotesUpdate && multi && !placementId) {
      next.notes = undefined;
    }
  }

  for (const key of ['pinnedAt', 'favoriteAt', 'deletedAt'] as const) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key] === undefined) {
      delete (next as unknown as Record<string, unknown>)[key];
    }
  }

  assertNoBookmarkDuplicateInCollections(store, next.url || '', next.collectionIds, id);
  store.putItem(next);
  await commitAndVerifyItem(id);
  notifyDataChanged('item.update');
};

/** One (or few chunked) worker transactions — use for bulk trash, imports, etc. */
export async function applyBatchMutations(ops: DbMutation[]): Promise<void> {
  if (!ops.length) return;
  if (isDbWorkerProcess()) {
    const store = await getDB();
    store.withTransaction(() => {
      for (const op of ops) {
        if (op.kind === 'put') store.put(op.storeName, op.value);
        else store.delete(op.storeName, op.key);
      }
    });
    return;
  }
  await getRemoteStore().batchMutate(ops);
}

/** Wait until queued tab→worker writes have been applied in the DB worker. */

export async function commitPendingDbWrites(opts?: {
  /** Force full library reload from worker (import recovery, explicit refresh). */
  hydrate?: boolean;
  /** Reload only when worker revision is ahead of this tab's cache (cross-tab sync). */
  sync?: boolean;
}): Promise<void> {
  if (isDbWorkerProcess()) return;
  const { getRemoteStore } = await import('./storage/dbClient/remoteStore');
  const store = getRemoteStore();
  await store.drainWrites();
  if (opts?.hydrate === true) {
    await store.hydrate({
      force: true,
      stages: ['essential', 'pipeline'],
      onProgress: emitLibraryHydrateProgress,
    });
  } else if (opts?.sync === true) {
    await store.hydrateIfBehind();
  }
}

/**
 * Read-your-writes before classify: drain tab→worker writes only.
 * Never hydrate/re-page pipeline tables mid-run — that OOMs Chrome on large libraries.
 */
export async function refreshPipelineCacheFromWorker(): Promise<void> {
  if (isDbWorkerProcess()) return;
  const store = getRemoteStore();
  await store.drainWrites();
}

// ============================================================================
// Snapshots
// ============================================================================

export const addSnapshot = async (tabs: Snapshot['tabs']) => {
  const store = await getDB();
  store.putSnapshot({
    timestamp: nowTs(),
    tabCount: tabs.length,
    tabs,
  });
  await commitPendingDbWrites();
  notifyDataChanged('snapshot.add');
};

// ============================================================================
// Workspaces
// ============================================================================

export const deduplicateWorkspaceTabs = (windows: WorkspaceWindow[]): WorkspaceWindow[] => {
  const seenUrls = new Set<string>();
  return windows.map(win => ({
    ...win,
    tabs: win.tabs.filter(tab => {
      if (!tab.url) return true;
      const normalized = normalizeBookmarkUrl(tab.url);
      if (seenUrls.has(normalized)) return false;
      seenUrls.add(normalized);
      return true;
    })
  })).filter(win => win.tabs.length > 0);
};

export const getAllWorkspaces = async () => {
  const store = await getDB();
  return store.getAllWorkspaces();
};

export const addWorkspace = async (name: string, windows: WorkspaceWindow[], projectId?: string) => {
  const store = await getDB();
  const id = crypto.randomUUID();
  const now = nowTs();
  const dedupedWindows = deduplicateWorkspaceTabs(windows);
  store.putWorkspace({ id, name, projectId, created_at: now, updated_at: now, windows: dedupedWindows });
  await commitPendingDbWrites();
  notifyDataChanged('workspace.add');
  return id;
};

export const updateWorkspace = async (id: string, updates: Partial<Pick<Workspace, 'name' | 'windows' | 'projectId'>>) => {
  const store = await getDB();
  const existing = store.getWorkspace(id);
  if (!existing) return false;
  const now = nowTs();
  
  const processedUpdates = { ...updates };
  if (processedUpdates.windows) {
    processedUpdates.windows = deduplicateWorkspaceTabs(processedUpdates.windows);
  }
  
  store.putWorkspace({ ...existing, ...processedUpdates, updated_at: now });
  await commitPendingDbWrites();
  notifyDataChanged('workspace.update');
  return true;
};

export const deleteWorkspace = async (id: string) => {
  const store = await getDB();
  store.deleteWorkspace(id);
  await commitPendingDbWrites();
  notifyDataChanged('workspace.delete');
};

// ============================================================================
// Bulk Import
// ============================================================================

export interface ImportCandidate {
  url: string;
  title: string;
  description?: string;
  notes?: string;
  tags?: string[];
  source?: string;
  favicon?: string;
}

export interface BulkImportAffectedItem {
  itemId: string;
  url: string;
  title: string;
  outcome: 'created' | 'merged' | 'restored';
}

export interface BulkImportSkippedTrashedItem {
  url: string;
  title: string;
  reason: string;
  trashedAt: number;
}

export interface BulkImportOptions {
  skipPreviouslyTrashed?: boolean;
}

export interface BulkImportResult {
  created: number;
  merged: number;
  restoredFromTrash: number;
  skipped: number;
  skippedPreviouslyTrashed: number;
  skippedTrashedItems: BulkImportSkippedTrashedItem[];
  createdItemIds: string[];
  affectedItemIds: string[];
  affectedItems: BulkImportAffectedItem[];
}

export const bulkImportBookmarks = async (
  candidates: ImportCandidate[],
  collectionId: string,
  options?: BulkImportOptions
): Promise<BulkImportResult> => {
  if (!isDbWorkerProcess()) {
    const { dbRpc } = await import('./storage/dbClient');
    const result = await dbRpc<BulkImportResult>('bulkImportBookmarks', [
      candidates,
      collectionId,
      options,
    ]);
    await reloadDB();
    const { invalidateHubScopeCache } = await import('./pipeline/enrichmentHubPage');
    invalidateHubScopeCache();
    if (result.affectedItemIds.length > 0) {
      notifyDataChanged('import.bulk');
      const { flushDurableBackupSoon } = await import('./storage/flushDurableBackup');
      flushDurableBackupSoon();
    }
    return result;
  }
  const store = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(store);
  const targetCollection = collectionId || defaultUnsortedCollectionId;
  
  let created = 0;
  let merged = 0;
  let restoredFromTrash = 0;
  let skipped = 0;
  let skippedPreviouslyTrashed = 0;
  const skippedTrashedItems: BulkImportSkippedTrashedItem[] = [];
  const createdItemIds: string[] = [];
  const affectedItemIds: string[] = [];
  const affectedItems: BulkImportAffectedItem[] = [];
  
  const byUrl = new Map<string, ImportCandidate[]>();
  for (const c of candidates) {
    if (!c.url || !isHttpUrl(c.url)) {
      skipped++;
      continue;
    }
    const normalized = normalizeBookmarkUrl(c.url);
    if (!byUrl.has(normalized)) byUrl.set(normalized, []);
    byUrl.get(normalized)!.push(c);
  }
  
  const pickBestCandidate = (dupes: ImportCandidate[]): ImportCandidate => {
    return dupes.reduce((best, current) => {
      const bestHasNotes = !!(best.notes || best.description);
      const currentHasNotes = !!(current.notes || current.description);
      if (currentHasNotes && !bestHasNotes) return current;
      if (bestHasNotes && !currentHasNotes) return best;
      const bestTitleLen = best.title?.length || 0;
      const currentTitleLen = current.title?.length || 0;
      return currentTitleLen > bestTitleLen ? current : best;
    });
  };

  const now = nowTs();
  const existingItems = store.getAllItems();
  const existingByNormalizedUrl = new Map<string, Item>();
  for (const item of existingItems) {
    if (!item.url || !isHttpUrl(item.url)) continue;
    existingByNormalizedUrl.set(normalizeBookmarkUrl(item.url), item);
  }

  const { getTrashHistoryMap } = await import('./trashHistory');
  const trashHistoryMap = options?.skipPreviouslyTrashed === true ? await getTrashHistoryMap() : null;

  store.withTransaction(() => {
    for (const [normalizedUrl, dupes] of byUrl) {
      const best = pickBestCandidate(dupes);

      if (trashHistoryMap?.has(normalizedUrl)) {
        const entry = trashHistoryMap.get(normalizedUrl)!;
        skippedPreviouslyTrashed += 1;
        skippedTrashedItems.push({
          url: best.url,
          title: best.title || best.url,
          reason: entry.reason,
          trashedAt: entry.trashedAt,
        });
        continue;
      }

      const existing = existingByNormalizedUrl.get(normalizedUrl);
      const incomingNotes = best.notes || best.description;

      if (existing) {
        const wasTrashed = existing.deletedAt != null;
        if (wasTrashed) restoredFromTrash += 1;
        else merged += 1;

        const placements = { ...(existing.placements || {}) };
        const existingPlacement = placements[targetCollection];
        if (!existingPlacement) {
          placements[targetCollection] = {
            collectionId: targetCollection,
            notes: incomingNotes || undefined,
            tags: best.tags || [],
            addedAt: now,
            source: best.source || 'import',
          };
        } else if (incomingNotes) {
          placements[targetCollection] = {
            ...existingPlacement,
            notes: incomingNotes,
            tags: best.tags && best.tags.length > 0 ? best.tags : existingPlacement.tags,
          };
        }

        const mergedCollectionIds = Object.keys(placements);
        const hasBetterTitle = shouldPreferImportTitle(existing.title, best.title, existing.url || best.url);
        const hasBetterFavicon = !!best.favicon && !existing.favicon;

        const updatedItem: Item = {
          ...existing,
          title: hasBetterTitle ? best.title : existing.title,
          favicon: hasBetterFavicon ? best.favicon : existing.favicon,
          collectionIds: mergedCollectionIds,
          placements,
          deletedAt: undefined,
          updated_at: now,
        };

        store.putItem(updatedItem);
        if (wasTrashed || store.getTrashEntry(normalizedUrl)) {
          store.deleteTrashEntry(normalizedUrl);
        }
        existingByNormalizedUrl.set(normalizedUrl, updatedItem);
        affectedItemIds.push(existing.id);
        affectedItems.push({
          itemId: existing.id,
          url: updatedItem.url,
          title: updatedItem.title || updatedItem.url,
          outcome: wasTrashed ? 'restored' : 'merged',
        });
        continue;
      }

      created += 1;
      const id = crypto.randomUUID();
      createdItemIds.push(id);
      const source = (best.source || 'import') as Item['source'];
      const placements: Record<string, ItemPlacement> = {
        [targetCollection]: {
          collectionId: targetCollection,
          notes: incomingNotes || undefined,
          tags: best.tags || [],
          addedAt: now,
          source,
        },
      };

      const newItem: Item = {
        id,
        url: best.url.trim(),
        title: best.title || best.url,
        favicon: best.favicon,
        collectionIds: [targetCollection],
        tags: best.tags || [],
        notes: incomingNotes || undefined,
        placements,
        created_at: now,
        updated_at: now,
        source,
      };

      store.putItem(newItem);
      existingByNormalizedUrl.set(normalizedUrl, newItem);
      affectedItemIds.push(id);
      affectedItems.push({
        itemId: id,
        url: newItem.url,
        title: newItem.title || newItem.url,
        outcome: 'created',
      });
    }
  });

  if (affectedItemIds.length > 0) {
    notifyDataChanged('import.bulk');
  } else if (created > 0 || merged > 0) {
    notifyDataChanged('item.update');
  }

  if (affectedItemIds.length > 0) {
    try {
      const { noteBulkImport } = await import('./categorization/classifyTopicExtract');
      if (createdItemIds.length > 0) {
        await noteBulkImport(createdItemIds.length);
      }
    } catch (e) {
      console.warn('Bulk import: could not queue categorization', e);
    }
  }

  return {
    created,
    merged,
    restoredFromTrash,
    skipped,
    skippedPreviouslyTrashed,
    skippedTrashedItems,
    createdItemIds,
    affectedItemIds,
    affectedItems,
  };
};

// ============================================================================
// Export / Import (JSON)
// ============================================================================

export const exportDB = async () => {
  const store = await getDB();
  
  const projects = store.getAllProjects();
  const items = store.getAllItems();
  const collections = store.getAllCollections();
  const notes = store.getAllNotes();
  const snapshots = store.getAllSnapshots();
  const workspaces = store.getAllWorkspaces();
  const item_enrichment = store.getAllEnrichment();
  const ai_categories = store.getAllCategories();
  const ai_item_category_links = store.getAllLinks();
  const ai_item_signals = store.getAllSignals();
  const ai_taxonomy_state_row = store.getTaxonomyState();
  const ai_taxonomy_state = ai_taxonomy_state_row ? [ai_taxonomy_state_row] : [];
  const trash_history = store.getAllTrashHistory();
  const { getAllPipelineDebugRecords } = await import('./enrichment/pipelineDebug');
  const pipeline_debug = await getAllPipelineDebugRecords();
  const includePipelineDebug = pipeline_debug.length > 0;

  const pipelineExportCounts = {
    exportedAt: Date.now(),
    item_enrichment: item_enrichment.length,
    pipeline_debug: pipeline_debug.length,
    pipeline_debugOnly: includePipelineDebug,
    ai_categories: ai_categories.length,
    ai_categories_parents: ai_categories.filter((c) => c.kind === 'parent').length,
    ai_categories_leaves: ai_categories.filter((c) => c.kind === 'leaf').length,
    ai_item_category_links: ai_item_category_links.length,
    ai_item_signals: ai_item_signals.length,
    ai_taxonomy_state: ai_taxonomy_state.length,
    taxonomyVersion: ai_taxonomy_state[0]?.taxonomyVersion ?? null,
  };

  return JSON.stringify(
    {
      _pipelineExportCounts: pipelineExportCounts,
      projects,
      collections,
      items,
      notes,
      snapshots,
      workspaces,
      item_enrichment,
      ...(includePipelineDebug ? { pipeline_debug, _debugOnly: { pipeline_debug: true } } : {}),
      ai_categories,
      ai_item_category_links,
      ai_item_signals,
      ai_taxonomy_state,
      trash_history,
    },
    null,
    2
  );
};

export const verifyBackup = (
  jsonString: string
): {
  valid: boolean;
  error?: string;
  stats?: any;
  envelope?: BackupEnvelopeMeta | null;
  warnings?: string[];
} => {
  let parsed: { envelope: BackupEnvelopeMeta | null; data: unknown };
  try {
    parsed = parseBackupText(jsonString);
  } catch (e) {
    return { valid: false, error: `JSON parse error: ${e}` };
  }
  const data = parsed.data as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid JSON format' };
  }

  const backupItems = Array.isArray(data.items) ? (data.items as Item[]) : [];
  const standaloneNotes = Array.isArray(data.notes) ? (data.notes as unknown[]).length : 0;
  const { bookmarks, notes, items } = countRestoreSummaryStats(backupItems, standaloneNotes);
  const stats = {
    projects: Array.isArray(data.projects) ? (data.projects as unknown[]).length : 0,
    collections: Array.isArray(data.collections) ? (data.collections as unknown[]).length : 0,
    items,
    bookmarks,
    notes,
    workspaces: Array.isArray(data.workspaces) ? (data.workspaces as unknown[]).length : 0,
    item_enrichment: Array.isArray(data.item_enrichment) ? (data.item_enrichment as unknown[]).length : 0,
    ai_categories: Array.isArray(data.ai_categories) ? (data.ai_categories as unknown[]).length : 0,
    ai_item_category_links: Array.isArray(data.ai_item_category_links) ? (data.ai_item_category_links as unknown[]).length : 0,
    ai_item_signals: Array.isArray(data.ai_item_signals) ? (data.ai_item_signals as unknown[]).length : 0,
    ai_taxonomy_state: Array.isArray(data.ai_taxonomy_state) ? (data.ai_taxonomy_state as unknown[]).length : 0,
    trash_history: Array.isArray(data.trash_history) ? (data.trash_history as unknown[]).length : 0,
    pipelineExportCounts: data._pipelineExportCounts && typeof data._pipelineExportCounts === 'object' ? data._pipelineExportCounts : null,
  };

  if (stats.projects === 0 && stats.items === 0 && stats.collections === 0) {
    return { valid: false, error: 'Backup appears to be empty', envelope: parsed.envelope };
  }

  const warnings = collectBackupVerifyWarnings(data);
  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn('[verifyBackup]', w);
    }
  }

  return { valid: true, stats, envelope: parsed.envelope, warnings: warnings.length ? warnings : undefined };
};

export const importDB = async (jsonString: string, createBackupFirst: boolean = true) => {
  if (!isDbWorkerProcess()) {
    if (createBackupFirst) {
      try {
        const backup = await exportDB();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const blob = new Blob([backup], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-before-import-${timestamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('Backup created before import');
      } catch (backupError) {
        console.error('Failed to create backup before import:', backupError);
      }
    }
    const { dbRpc } = await import('./storage/dbClient');
    const ok = await dbRpc<boolean>('importDB', [jsonString, false]);
    if (ok) await reloadDB();
    return ok;
  }
  const store = await getDB();

  if (createBackupFirst) {
    try {
      const backup = await exportDB();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([backup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-before-import-${timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('Backup created before import');
    } catch (backupError) {
      console.error('Failed to create backup before import:', backupError);
    }
  }

  let envelope: BackupEnvelopeMeta | null = null;
  let data: any;
  try {
    const parsed = parseBackupText(jsonString);
    envelope = parsed.envelope;
    data = parsed.data;

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid backup file format');
    }

    store.withTransaction(() => {
      // Clear all tables first
      store.clearAllTables();

      // Import projects
      if (data.projects) {
        for (const p of data.projects as Project[]) {
          store.putProject(p);
        }
      }

      // Import collections
      if (data.collections) {
        for (const col of data.collections as any[]) {
          if (!Array.isArray(col.projectIds)) {
            col.projectIds = col.primaryProjectId ? [col.primaryProjectId] : [DEFAULT_PROJECT_ID];
          }
          store.putCollection(col as Collection);
        }
      }

      // Import items
      if (data.items) {
        for (const item of data.items as any[]) {
          if (!Array.isArray(item.collectionIds)) {
            const fromOld = typeof item.collectionId === 'string' ? [item.collectionId] : [];
            item.collectionIds = fromOld;
            delete item.collectionId;
          }
          store.putItem(item as Item);
        }
      }

      // Import notes
      if (data.notes) {
        for (const n of data.notes as Note[]) {
          store.putNote(n);
        }
      }

      // Import workspaces
      if (data.workspaces) {
        for (const ws of data.workspaces as Workspace[]) {
          store.putWorkspace(ws);
        }
      }

      // Import enrichment
      if (data.item_enrichment) {
        for (const e of data.item_enrichment as ItemEnrichment[]) {
          store.putEnrichment(e);
        }
      }

      // Import AI categories
      if (data.ai_categories) {
        for (const c of data.ai_categories as AiCategory[]) {
          store.putCategory(c);
        }
      }

      // Import AI links
      if (data.ai_item_category_links) {
        for (const l of data.ai_item_category_links as AiItemCategoryLink[]) {
          store.putLink(l);
        }
      }

      // Import AI signals
      if (data.ai_item_signals) {
        for (const s of data.ai_item_signals as AiItemSignal[]) {
          store.putSignal(s);
        }
      }

      // Import taxonomy state
      if (data.ai_taxonomy_state) {
        for (const t of data.ai_taxonomy_state as AiTaxonomyState[]) {
          store.putTaxonomyState(t);
        }
      }

      // Import trash history
      if (data.trash_history) {
        for (const t of data.trash_history as TrashHistoryEntry[]) {
          store.putTrashEntry(t);
        }
      }
    });

    if (envelope) {
      revisionTracker.setLocalRevision(envelope.revision);
      revisionTracker.setLastSeenRemote(envelope);
    }
    notifyDataChanged('import.replace');
    return true;
  } catch (e) {
    console.error("Import failed", e);
    return false;
  }
};

// ============================================================================
// SQLite Export (for backup)
// ============================================================================

/**
 * Export the SQLite database as binary bytes.
 * Used for `latest.sqlite` backups in the user's backup folder.
 */
export const exportSqliteBytes = async (): Promise<Uint8Array | null> => {
  try {
    let raw: unknown;
    if (isDbWorkerProcess()) {
      const { getConnection } = await import('./storage/sqlite/connection');
      const conn = await getConnection();
      raw = await conn.exportDatabase();
    } else {
      const { dbRpc } = await import('./storage/dbClient');
      raw = await dbRpc<unknown>('exportSqliteBytes', []);
    }
    return normalizeBinaryPayload(raw);
  } catch (e) {
    console.error('Failed to export SQLite bytes:', e);
    return null;
  }
};

export type ClearAllLibraryDataResult = {
  ok: boolean;
  error?: string;
  enrichmentCacheFilesRemoved?: number;
  pipelineArtifactEntriesRemoved?: number;
};

/**
 * Wipe the library for a clean import test run: OPFS SQLite, folder mirror,
 * enrichment disk cache, and pipeline debug artifacts. Re-creates default project/collection.
 */
export async function clearAllLibraryData(): Promise<ClearAllLibraryDataResult> {
  try {
    const { dbRpc } = await import('./storage/dbClient');
    const { purgeAllEnrichmentCacheFiles } = await import('./enrichment/rawBodyStore');
    const { purgePipelineRunArtifactsFromBackupFolder } = await import(
      './pipeline/pipelineRunStore'
    );

    await dbRpc('storeInvoke', ['clearAllTables', []]);
    await commitPendingDbWrites();

    await reloadDB();
    const store = await getDB();
    await ensureDefaultProjectAndCollection(store as unknown as IdbCompatStore);
    await commitPendingDbWrites();

    const enrichmentCacheFilesRemoved = await purgeAllEnrichmentCacheFiles();
    const pipelineArtifactEntriesRemoved = await purgePipelineRunArtifactsFromBackupFolder();

    await flushFolderMirror();

    await reloadDB();
    await ensureDefaultProjectAndCollection((await getDB()) as unknown as IdbCompatStore);
    await commitPendingDbWrites({ hydrate: true });

    notifyDataChanged('item.update');
    notifyDataChanged('enrichment.update');
    notifyDataChanged('categorization.update');
    notifyDataChanged('pipeline.clear');

    try {
      const { invalidatePipelineCatalog } = await import('./pipeline/pipelineCatalog');
      invalidatePipelineCatalog();
    } catch {
      /* optional */
    }

    return {
      ok: true,
      enrichmentCacheFilesRemoved,
      pipelineArtifactEntriesRemoved,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('[clearAllLibraryData] failed:', e);
    return { ok: false, error };
  }
};
