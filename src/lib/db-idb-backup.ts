import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { notifyDataChanged } from './dataChangeNotifier';
import { parseBackupText, BackupEnvelopeMeta } from './backupEnvelope';
import { revisionTracker } from './revisionTracker';
import type { ItemEnrichment } from './enrichment/types';
import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  AiTaxonomyState,
} from './categorization/types';
import type { TrashHistoryEntry } from './trashHistory';
import { getTrashHistoryMap, recordTrashHistory } from './trashHistory';

export type { AiCategory, AiItemCategoryLink, AiItemSignal, AiTaxonomyState };

const DB_NAME = 'personal-tools-db';
const DB_VERSION = 9;

// The default project for orphan items (items without a specific project)
const DEFAULT_PROJECT_ID = 'project_default';
const DEFAULT_PROJECT_NAME = 'Default';
const DEFAULT_UNSORTED_COLLECTION_ID = `collection_${DEFAULT_PROJECT_ID}_unsorted`;
const DEFAULT_UNSORTED_COLLECTION_NAME = 'Unsorted';

// Virtual project ID for "All" aggregate view (shows everything from all projects)
// This is NOT stored in DB - it's a virtual view in the UI
export const ALL_PROJECTS_ID = '__all__';

// Legacy project ID (will be migrated to new ID)
const LEGACY_PROJECT_ID = 'project_all';

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
  isDefault: boolean; // For per-project "Unsorted"
  color?: string;
}

/**
 * Per-collection placement metadata for an item.
 * Allows the same URL to have different notes/tags in different collections.
 */
export interface ItemPlacement {
  collectionId: string;
  notes?: string;
  tags?: string[];
  addedAt: number;
  source: string;
}

export interface Item {
  id: string;
  /** Exact URL as saved (tab, import, or manual). Never rewritten after save. */
  url: string;
  /** @deprecated Legacy — full URL when older builds stored a normalized `url`. Prefer `url`. */
  urlRaw?: string;
  title: string;
  favicon?: string;
  collectionIds: string[];  // Quick-access array (derived from placements)
  tags: string[];           // Global tags (legacy, prefer per-placement)
  notes?: string;           // Global notes (legacy, prefer per-placement)
  placements?: Record<string, ItemPlacement>;  // Per-collection metadata
  created_at: number;
  updated_at: number;
  source: 'tab' | 'twitter' | 'manual' | 'bookmark' | string;
  metadata?: Record<string, any>;
  /** When set, item is pinned (sort/recency uses this timestamp). */
  pinnedAt?: number;
  /** When set, item is a favorite. */
  favoriteAt?: number;
  /** When set, item is in trash (soft-deleted). */
  deletedAt?: number;
}

/** Optional flags for {@link updateItem} (per-placement notes, etc.). */
export type UpdateItemOptions = {
  /** When `updates.notes` is set, store it only on this placement; clears legacy `item.notes`. */
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

interface TabManagerDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-name': string; 'by-updated': number };
  };
  collections: {
    key: string;
    value: Collection;
    indexes: { 'by-name': string; 'by-primary-project': string; 'by-updated': number };
  };
  items: {
    key: string;
    value: Item;
    indexes: { 'by-url': string; 'by-collection': string; 'by-updated': number };
  };
  notes: {
    key: string;
    value: Note;
    indexes: { 'by-collection': string; 'by-title': string; 'by-updated': number };
  };
  snapshots: {
    key: number;
    value: Snapshot;
  };
  workspaces: {
    key: string;
    value: Workspace;
    indexes: { 'by-updated': number; 'by-name': string; 'by-project': string };
  };
  item_enrichment: {
    key: string;
    value: ItemEnrichment;
    indexes: { 'by-status': string; 'by-updated': number };
  };
  ai_categories: {
    key: string;
    value: AiCategory;
    indexes: { 'by-status': string; 'by-updated': number };
  };
  ai_item_category_links: {
    key: string;
    value: AiItemCategoryLink;
    indexes: { 'by-item': string; 'by-category': string; 'by-updated': number };
  };
  ai_item_signals: {
    key: string;
    value: AiItemSignal;
    indexes: {
      'by-updated': number;
      'by-classify-state': string;
      'by-discover-state': string;
    };
  };
  ai_taxonomy_state: {
    key: string;
    value: AiTaxonomyState;
  };
  trash_history: {
    key: string;
    value: TrashHistoryEntry;
    indexes: { 'by-trashed': number };
  };
}

let dbPromise: Promise<IDBPDatabase<TabManagerDB>>;

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

const ensureIncludes = (arr: string[], value: string) => (arr.includes(value) ? arr : [...arr, value]);

const nowTs = () => Date.now();

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url.trim());
const isBookmarkUrl = (url: string) => {
  const t = url.trim();
  return /^https?:\/\//i.test(t) || /^file:\/\//i.test(t);
};

/** Open the bookmark — `url` is stored faithfully; `urlRaw` only for pre-fix legacy rows. */
export function getBookmarkOpenUrl(item: Pick<Item, 'url' | 'urlRaw'>): string {
  return (item.url?.trim() || item.urlRaw?.trim() || '').trim();
}

// Tracking params to strip during normalization
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'zanpid',
  '_ga', '_gl', 'yclid', 'dclid'
];

/**
 * Dedup key only — strips known tracking query params. Does not alter path, hash,
 * host, or param order. Stored `Item.url` is always the URL exactly as saved.
 */
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

/**
 * Find an existing item by normalized URL.
 */
const findItemByNormalizedUrl = async (
  db: IDBPDatabase<TabManagerDB>,
  normalizedUrl: string
): Promise<Item | undefined> => {
  if (!normalizedUrl || !isBookmarkUrl(normalizedUrl)) return undefined;
  const all = await db.getAll('items');
  return all.find((it) => {
    if (!it.url || !isBookmarkUrl(it.url)) return false;
    return normalizeBookmarkUrl(it.url) === normalizedUrl;
  });
};

const hasSharedCollection = (a: string[], b: string[]) => {
  const set = new Set(a);
  return b.some((id) => set.has(id));
};

const assertNoBookmarkDuplicateInCollections = async (
  db: IDBPDatabase<TabManagerDB>,
  url: string,
  collectionIds: string[],
  excludeItemId?: string
) => {
  if (!isBookmarkUrl(url)) return;
  const normalized = normalizeBookmarkUrl(url);
  const all = await db.getAll('items');
  const duplicate = all.find((it) => {
    if (excludeItemId && it.id === excludeItemId) return false;
    if (!it.url || !isBookmarkUrl(it.url)) return false;
    return normalizeBookmarkUrl(it.url) === normalized && hasSharedCollection(it.collectionIds || [], collectionIds);
  });
  if (duplicate) {
    throw new Error('This bookmark already exists in the selected collection. Use another collection or update the existing one.');
  }
};

/**
 * Attempts to export database before migration using IndexedDB databases() API
 * Falls back gracefully if API not available
 */
async function exportBeforeMigration(): Promise<void> {
  try {
    // Check if databases() API is available (Chrome/Edge)
    if (typeof indexedDB.databases === 'function') {
      const databases = await indexedDB.databases();
      const existingDB = databases.find(db => db.name === DB_NAME);
      
      if (existingDB && existingDB.version && existingDB.version < DB_VERSION) {
        // Version will change, try to export
        console.log(`⚠️  Database version will change from ${existingDB.version} to ${DB_VERSION}. Attempting backup...`);
        
        // Try to open with current version to export (this is tricky - we'll use a workaround)
        // Note: This might not work in all cases, but it's best effort
        try {
          const tempDB = await new Promise<IDBDatabase | null>((resolve) => {
            const request = indexedDB.open(DB_NAME, existingDB.version);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
            // Prevent upgrade
            request.onupgradeneeded = () => {
              request.transaction?.abort();
              resolve(null);
            };
          });

          if (tempDB) {
            // Export data
            const projects = await getAllFromStore(tempDB, 'projects');
            const items = await getAllFromStore(tempDB, 'items');
            const collections = await getAllFromStore(tempDB, 'collections');
            const notes = await getAllFromStore(tempDB, 'notes');
            const snapshots = await getAllFromStore(tempDB, 'snapshots');
            const workspaces = await getAllFromStore(tempDB, 'workspaces');
            tempDB.close();

            const backup = JSON.stringify({ projects, collections, items, notes, snapshots, workspaces }, null, 2);
            
            // Download backup automatically
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const blob = new Blob([backup], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup-before-migration-v${DB_VERSION}-${timestamp}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            console.log(`✅ Backup created before migration to v${DB_VERSION}`);
          }
        } catch (err) {
          console.warn('Could not create backup before migration (will proceed anyway):', err);
        }
      }
    } else {
      // databases() API not available - log warning
      console.warn('⚠️  IndexedDB.databases() API not available. Manual backup recommended before code updates.');
    }
  } catch (error) {
    console.warn('Migration backup check failed (will proceed anyway):', error);
    // Don't block migration if backup check fails
  }
}

/**
 * Helper to get all items from an IndexedDB store (for pre-migration export)
 */
function getAllFromStore(db: IDBDatabase, storeName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function ensureDefaultProjectAndCollection(db: IDBPDatabase<TabManagerDB>) {
  const now = nowTs();
  
  // --- Runtime migration: handle legacy project_all -> project_default ---
  const legacyProject = await db.get('projects', LEGACY_PROJECT_ID);
  if (legacyProject) {
    console.log('🔄 Runtime migration: project_all -> project_default');
    
    // Create new default project (or update if exists)
    const existingDefault = await db.get('projects', DEFAULT_PROJECT_ID);
    if (!existingDefault) {
      await db.put('projects', {
        id: DEFAULT_PROJECT_ID,
        name: DEFAULT_PROJECT_NAME,
        isDefault: true,
        created_at: legacyProject.created_at || now,
        updated_at: now,
      });
    }

    // Migrate collections from legacy project
    const allCols = await db.getAll('collections');
    for (const col of allCols) {
      let changed = false;
      let newPrimaryProjectId = col.primaryProjectId;
      let newProjectIds = [...(col.projectIds || [])];

      if (col.primaryProjectId === LEGACY_PROJECT_ID) {
        newPrimaryProjectId = DEFAULT_PROJECT_ID;
        changed = true;
      }
      if (newProjectIds.includes(LEGACY_PROJECT_ID)) {
        newProjectIds = newProjectIds.map(p => p === LEGACY_PROJECT_ID ? DEFAULT_PROJECT_ID : p);
        changed = true;
      }

      // Migrate the unsorted collection
      if (col.id === `collection_${LEGACY_PROJECT_ID}_unsorted`) {
        await db.delete('collections', col.id);
        await db.put('collections', {
          ...col,
          id: DEFAULT_UNSORTED_COLLECTION_ID,
          primaryProjectId: DEFAULT_PROJECT_ID,
          projectIds: [DEFAULT_PROJECT_ID],
          updated_at: now,
        });
        continue;
      }

      if (changed) {
        await db.put('collections', {
          ...col,
          primaryProjectId: newPrimaryProjectId,
          projectIds: newProjectIds,
          updated_at: now,
        });
      }
    }

    // Migrate items referencing legacy unsorted collection
    const allItems = await db.getAll('items');
    const legacyUnsortedId = `collection_${LEGACY_PROJECT_ID}_unsorted`;
    for (const item of allItems) {
      if (item.collectionIds?.includes(legacyUnsortedId)) {
        const newCollectionIds = item.collectionIds.map(c => 
          c === legacyUnsortedId ? DEFAULT_UNSORTED_COLLECTION_ID : c
        );
        await db.put('items', {
          ...item,
          collectionIds: newCollectionIds,
          updated_at: now,
        });
      }
    }

    // Delete legacy project
    await db.delete('projects', LEGACY_PROJECT_ID);
    console.log('✅ Runtime migration complete: project_all -> project_default');
  }
  // --- End runtime migration ---

  const existingProject = await db.get('projects', DEFAULT_PROJECT_ID);
  if (!existingProject) {
    await db.put('projects', {
      id: DEFAULT_PROJECT_ID,
      name: DEFAULT_PROJECT_NAME,
      isDefault: true,
      created_at: now,
      updated_at: now,
    });
  }

  const existingCollection = await db.get('collections', DEFAULT_UNSORTED_COLLECTION_ID);
  if (!existingCollection) {
    await db.put('collections', {
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

async function ensureDefaultCollectionForProject(db: IDBPDatabase<TabManagerDB>, projectId: string) {
  const now = nowTs();
  const id = `collection_${projectId}_unsorted`;
  const existing = await db.get('collections', id);
  if (!existing) {
    await db.put('collections', {
      id,
      name: 'Unsorted',
      color: '#3b82f6',
      isDefault: true,
      created_at: now,
      updated_at: now,
      primaryProjectId: projectId,
      projectIds: [projectId],
    } satisfies Collection);
  } else {
    // Update existing collection if it's missing project associations
    if (!existing.primaryProjectId || existing.primaryProjectId !== projectId || 
        !Array.isArray(existing.projectIds) || !existing.projectIds.includes(projectId)) {
      await db.put('collections', {
        ...existing,
        primaryProjectId: projectId,
        projectIds: existing.projectIds && Array.isArray(existing.projectIds) && existing.projectIds.length > 0
          ? [...new Set([...existing.projectIds, projectId])]
          : [projectId],
        updated_at: now,
      } satisfies Collection);
    }
  }
  return id;
}

// Public function to ensure a project's unsorted collection exists
export async function ensureProjectUnsortedCollection(projectId: string): Promise<string> {
  const db = await getDB();
  return ensureDefaultCollectionForProject(db, projectId);
}

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = (async () => {
      // Attempt to backup before migration (best effort - may not always work)
      // This is a safety measure, but users should still backup manually before code updates
      await exportBeforeMigration();
      
      // Now open DB (will trigger upgrade if version changed)
      return openDB<TabManagerDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        const now = nowTs();
          const newVersion = _newVersion ?? DB_VERSION;

          // Log migration start.
          // Fresh installs (v0) are expected and should not be surfaced as warnings.
          if (oldVersion < newVersion) {
            console.info(`🔄 MIGRATION: Upgrading database from v${oldVersion} to v${newVersion}`);
            if (oldVersion > 0 && newVersion - oldVersion > 1) {
              console.warn(`⚠️  If you haven't backed up, export your data now using the Backup button!`);
            } else if (oldVersion > 0) {
              console.info(
                `ℹ️  Minor DB upgrade (v${oldVersion}→v${newVersion}). Your data is kept; optional: manual backup in Settings.`
              );
            }
          }

        // Projects Store (v3)
        if (!db.objectStoreNames.contains('projects')) {
          const store = db.createObjectStore('projects', { keyPath: 'id' });
          store.createIndex('by-name', 'name', { unique: true });
          store.createIndex('by-updated', 'updated_at');
        } else {
          const store = transaction.objectStore('projects');
          if (!store.indexNames.contains('by-name')) store.createIndex('by-name', 'name', { unique: true });
          if (!store.indexNames.contains('by-updated')) store.createIndex('by-updated', 'updated_at');
        }

        // Collections Store
        if (!db.objectStoreNames.contains('collections')) {
          const store = db.createObjectStore('collections', { keyPath: 'id' });
          store.createIndex('by-name', 'name');
          store.createIndex('by-primary-project', 'primaryProjectId');
          store.createIndex('by-updated', 'updated_at');
        } else {
          const store = transaction.objectStore('collections');
          if (!store.indexNames.contains('by-name')) store.createIndex('by-name', 'name');
          if (!store.indexNames.contains('by-primary-project')) store.createIndex('by-primary-project', 'primaryProjectId');
          if (!store.indexNames.contains('by-updated')) store.createIndex('by-updated', 'updated_at');
        }

        // Items Store
        if (!db.objectStoreNames.contains('items')) {
          const store = db.createObjectStore('items', { keyPath: 'id' });
          store.createIndex('by-url', 'url', { unique: false });
          store.createIndex('by-collection', 'collectionIds', { unique: false, multiEntry: true });
          store.createIndex('by-updated', 'updated_at');
        } else {
          const store = transaction.objectStore('items');
          if (!store.indexNames.contains('by-url')) store.createIndex('by-url', 'url', { unique: false });
          if (store.indexNames.contains('by-collection')) {
            // Replace old single-value index (collectionId) with multiEntry index (collectionIds[])
            store.deleteIndex('by-collection');
          }
          store.createIndex('by-collection', 'collectionIds', { unique: false, multiEntry: true });
          if (!store.indexNames.contains('by-updated')) store.createIndex('by-updated', 'updated_at');
        }

        // Notes Store (v3)
        if (!db.objectStoreNames.contains('notes')) {
          const store = db.createObjectStore('notes', { keyPath: 'id' });
          store.createIndex('by-collection', 'collectionId');
          store.createIndex('by-title', 'title');
          store.createIndex('by-updated', 'updated_at');
        } else {
          const store = transaction.objectStore('notes');
          if (!store.indexNames.contains('by-collection')) store.createIndex('by-collection', 'collectionId');
          if (!store.indexNames.contains('by-title')) store.createIndex('by-title', 'title');
          if (!store.indexNames.contains('by-updated')) store.createIndex('by-updated', 'updated_at');
        }

        // Snapshots Store
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
        }

        // Workspaces Store
        if (!db.objectStoreNames.contains('workspaces')) {
          const store = db.createObjectStore('workspaces', { keyPath: 'id' });
          store.createIndex('by-updated', 'updated_at');
          store.createIndex('by-name', 'name');
          store.createIndex('by-project', 'projectId');
        } else {
          const store = transaction.objectStore('workspaces');
          if (!store.indexNames.contains('by-updated')) store.createIndex('by-updated', 'updated_at');
          if (!store.indexNames.contains('by-name')) store.createIndex('by-name', 'name');
          if (!store.indexNames.contains('by-project')) store.createIndex('by-project', 'projectId');
        }

        // Item enrichment (v5)
        if (!db.objectStoreNames.contains('item_enrichment')) {
          const store = db.createObjectStore('item_enrichment', { keyPath: 'itemId' });
          store.createIndex('by-status', 'status');
          store.createIndex('by-updated', 'updated_at');
        } else {
          const store = transaction.objectStore('item_enrichment');
          if (!store.indexNames.contains('by-status')) store.createIndex('by-status', 'status');
          if (!store.indexNames.contains('by-updated')) store.createIndex('by-updated', 'updated_at');
        }

        // AI categorization (v6)
        if (!db.objectStoreNames.contains('ai_categories')) {
          const store = db.createObjectStore('ai_categories', { keyPath: 'id' });
          store.createIndex('by-status', 'status');
          store.createIndex('by-updated', 'updated_at');
        } else {
          const store = transaction.objectStore('ai_categories');
          if (!store.indexNames.contains('by-status')) store.createIndex('by-status', 'status');
          if (!store.indexNames.contains('by-updated')) store.createIndex('by-updated', 'updated_at');
        }

        if (!db.objectStoreNames.contains('ai_item_category_links')) {
          const store = db.createObjectStore('ai_item_category_links', { keyPath: 'id' });
          store.createIndex('by-item', 'itemId');
          store.createIndex('by-category', 'categoryId');
          store.createIndex('by-updated', 'updated_at');
        } else {
          const store = transaction.objectStore('ai_item_category_links');
          if (!store.indexNames.contains('by-item')) store.createIndex('by-item', 'itemId');
          if (!store.indexNames.contains('by-category')) store.createIndex('by-category', 'categoryId');
          if (!store.indexNames.contains('by-updated')) store.createIndex('by-updated', 'updated_at');
        }

        if (!db.objectStoreNames.contains('ai_item_signals')) {
          const store = db.createObjectStore('ai_item_signals', { keyPath: 'itemId' });
          store.createIndex('by-updated', 'lastProcessedAt');
          store.createIndex('by-classify-state', 'classifyState');
          store.createIndex('by-discover-state', 'discoverState');
        } else {
          const store = transaction.objectStore('ai_item_signals');
          if (!store.indexNames.contains('by-updated')) {
            store.createIndex('by-updated', 'lastProcessedAt');
          }
          if (!store.indexNames.contains('by-classify-state')) {
            store.createIndex('by-classify-state', 'classifyState');
          }
          if (!store.indexNames.contains('by-discover-state')) {
            store.createIndex('by-discover-state', 'discoverState');
          }
        }

        if (!db.objectStoreNames.contains('ai_taxonomy_state')) {
          db.createObjectStore('ai_taxonomy_state', { keyPath: 'id' });
        }

        // Trash discard registry (v9) — survives permanent delete for import filtering
        if (!db.objectStoreNames.contains('trash_history')) {
          const store = db.createObjectStore('trash_history', { keyPath: 'normalizedUrl' });
          store.createIndex('by-trashed', 'trashedAt');
        } else {
          const store = transaction.objectStore('trash_history');
          if (!store.indexNames.contains('by-trashed')) {
            store.createIndex('by-trashed', 'trashedAt');
          }
        }

        if (oldVersion < 9 && db.objectStoreNames.contains('trash_history') && db.objectStoreNames.contains('items')) {
          const trashStore = transaction.objectStore('trash_history');
          const items: Item[] = await transaction.objectStore('items').getAll();
          for (const item of items) {
            if (!item.deletedAt || !item.url || !isHttpUrl(item.url)) continue;
            const normalizedUrl = normalizeBookmarkUrl(item.url);
            const existing = await trashStore.get(normalizedUrl);
            if (existing) continue;
            await trashStore.put({
              normalizedUrl,
              url: item.url,
              title: item.title || item.url,
              reason: 'Previously in trash (migrated)',
              reasonCode: 'manual',
              itemId: item.id,
              trashedAt: item.deletedAt,
            } satisfies TrashHistoryEntry);
          }
        }

        // ---- v7: hierarchy fields on legacy flat categories ----
        if (oldVersion < 7 && db.objectStoreNames.contains('ai_categories')) {
          const catStore = transaction.objectStore('ai_categories');
          const legacyCats: AiCategory[] = await catStore.getAll();
          for (const cat of legacyCats) {
            if (!cat.kind) {
              await catStore.put({
                ...cat,
                kind: 'leaf',
                assignable: cat.assignable !== false,
                itemCount: cat.itemCount ?? 0,
                updated_at: now,
              });
            }
          }
        }
        if (oldVersion < 7 && db.objectStoreNames.contains('ai_item_signals')) {
          const sigStore = transaction.objectStore('ai_item_signals');
          const legacySignals: AiItemSignal[] = await sigStore.getAll();
          for (const sig of legacySignals) {
            if (!sig.classifyState) {
              await sigStore.put({
                ...sig,
                classifyState: 'pending_classify',
                discoverState: sig.discoverState ?? 'none',
              });
            }
          }
        }

        // ---- v8: optional pin/favorite/trash timestamps on items (no data migration) ----

        // ---- Data migration to v3 ----
        if (oldVersion < 3) {
          const projectsStore = transaction.objectStore('projects');
          const collectionsStore = transaction.objectStore('collections');
          const itemsStore = transaction.objectStore('items');
          const workspacesStore = transaction.objectStore('workspaces');

          // --- Migrate legacy "project_all" to "project_default" ---
          const legacyProject = await projectsStore.get(LEGACY_PROJECT_ID);
          if (legacyProject) {
            console.log('🔄 Migrating legacy project_all to project_default...');
            
            // Create the new default project
            await projectsStore.put({
              id: DEFAULT_PROJECT_ID,
              name: DEFAULT_PROJECT_NAME,
              isDefault: true,
              created_at: legacyProject.created_at || now,
              updated_at: now,
            });

            // Migrate all collections from project_all to project_default
            const allCols: any[] = await collectionsStore.getAll();
            for (const col of allCols) {
              let changed = false;
              let newPrimaryProjectId = col.primaryProjectId;
              let newProjectIds = col.projectIds || [];

              if (col.primaryProjectId === LEGACY_PROJECT_ID) {
                newPrimaryProjectId = DEFAULT_PROJECT_ID;
                changed = true;
              }
              if (Array.isArray(col.projectIds) && col.projectIds.includes(LEGACY_PROJECT_ID)) {
                newProjectIds = col.projectIds.map((p: string) => p === LEGACY_PROJECT_ID ? DEFAULT_PROJECT_ID : p);
                changed = true;
              }
              
              // Also migrate the unsorted collection ID
              if (col.id === `collection_${LEGACY_PROJECT_ID}_unsorted`) {
                await collectionsStore.delete(col.id);
                await collectionsStore.put({
                  ...col,
                  id: DEFAULT_UNSORTED_COLLECTION_ID,
                  primaryProjectId: DEFAULT_PROJECT_ID,
                  projectIds: [DEFAULT_PROJECT_ID],
                  updated_at: now,
                });
                continue;
              }

              if (changed) {
                await collectionsStore.put({
                  ...col,
                  primaryProjectId: newPrimaryProjectId,
                  projectIds: newProjectIds,
                  updated_at: now,
                });
              }
            }

            // Migrate items that reference the old unsorted collection
            const allItems: any[] = await itemsStore.getAll();
            const legacyUnsortedId = `collection_${LEGACY_PROJECT_ID}_unsorted`;
            for (const item of allItems) {
              if (Array.isArray(item.collectionIds) && item.collectionIds.includes(legacyUnsortedId)) {
                const newCollectionIds = item.collectionIds.map((c: string) => 
                  c === legacyUnsortedId ? DEFAULT_UNSORTED_COLLECTION_ID : c
                );
                await itemsStore.put({
                  ...item,
                  collectionIds: newCollectionIds,
                  updated_at: now,
                });
              }
            }

            // Delete the legacy project
            await projectsStore.delete(LEGACY_PROJECT_ID);
            console.log('✅ Legacy project_all migrated to project_default');
          }

          // Ensure default project exists (if not migrated from legacy)
          const existingDefault = await projectsStore.get(DEFAULT_PROJECT_ID);
          if (!existingDefault) {
            await projectsStore.put({
              id: DEFAULT_PROJECT_ID,
              name: DEFAULT_PROJECT_NAME,
              isDefault: true,
              created_at: now,
              updated_at: now,
            });
          }

          // Ensure default "Unsorted" collection for the default project
          const existingUnsorted = await collectionsStore.get(DEFAULT_UNSORTED_COLLECTION_ID);
          if (!existingUnsorted) {
            await collectionsStore.put({
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

          // Migrate existing collections: add primaryProjectId/projectIds/updated_at/isDefault
          const allCollections: any[] = await collectionsStore.getAll();
          for (const col of allCollections) {
            // Skip if already migrated (basic check)
            if (typeof col?.primaryProjectId === 'string' && Array.isArray(col?.projectIds) && typeof col?.updated_at === 'number') {
              continue;
            }

            const primaryProjectId = typeof col?.primaryProjectId === 'string' ? col.primaryProjectId : DEFAULT_PROJECT_ID;
            const projectIdsRaw = Array.isArray(col?.projectIds) ? col.projectIds : [primaryProjectId];
            const projectIds = uniq(ensureIncludes(projectIdsRaw.filter((x: any) => typeof x === 'string'), primaryProjectId));

            await collectionsStore.put({
              id: col.id,
              name: col.name,
              color: col.color,
              created_at: typeof col.created_at === 'number' ? col.created_at : now,
              updated_at: typeof col.updated_at === 'number' ? col.updated_at : (typeof col.created_at === 'number' ? col.created_at : now),
              primaryProjectId,
              projectIds,
              isDefault: Boolean(col.isDefault),
            } satisfies Collection);
          }

          // Migrate existing items: collectionId? -> collectionIds[], add updated_at, keep tags
          const allItems: any[] = await itemsStore.getAll();
          for (const it of allItems) {
            const existingCollectionIds = Array.isArray(it?.collectionIds) ? it.collectionIds.filter((x: any) => typeof x === 'string') : null;
            const fromOld = typeof it?.collectionId === 'string' ? [it.collectionId] : null;
            const collectionIds = (existingCollectionIds && existingCollectionIds.length > 0)
              ? existingCollectionIds
              : (fromOld && fromOld.length > 0 ? fromOld : [DEFAULT_UNSORTED_COLLECTION_ID]);

            const { collectionId: _old, ...rest } = it || {};
            await itemsStore.put({
              ...rest,
              id: it.id,
              url: it.url,
              title: it.title ?? '',
              favicon: it.favicon,
              collectionIds,
              tags: Array.isArray(it.tags) ? it.tags : [],
              notes: it.notes,
              created_at: typeof it.created_at === 'number' ? it.created_at : now,
              updated_at: typeof it.updated_at === 'number' ? it.updated_at : (typeof it.created_at === 'number' ? it.created_at : now),
              source: it.source ?? 'manual',
              metadata: it.metadata,
            } satisfies Item);
          }

          // Migrate workspaces: add projectId? if missing
          const allWorkspaces: any[] = await workspacesStore.getAll();
          for (const ws of allWorkspaces) {
            if (ws && 'projectId' in ws) continue;
            await workspacesStore.put({ ...ws, projectId: undefined });
          }
        }

        // ---- Data migration to v4: placements + deduplication ----
        if (oldVersion < 4) {
          console.log('🔄 Migration v4: Adding placements and deduplicating items...');
          const itemsStore = transaction.objectStore('items');
          const allItems: any[] = await itemsStore.getAll();
          
          // Group items by normalized URL
          const byNormalizedUrl = new Map<string, any[]>();
          for (const item of allItems) {
            if (!item.url || !isHttpUrl(item.url)) {
              // Non-URL items (notes): just add placements field
              const placements: Record<string, ItemPlacement> = {};
              for (const cid of (item.collectionIds || [])) {
                placements[cid] = {
                  collectionId: cid,
                  notes: item.notes,
                  tags: item.tags,
                  addedAt: item.created_at || now,
                  source: item.source || 'manual'
                };
              }
              await itemsStore.put({
                ...item,
                placements,
                updated_at: now
              });
              continue;
            }
            
            const normalized = normalizeBookmarkUrl(item.url);
            if (!byNormalizedUrl.has(normalized)) {
              byNormalizedUrl.set(normalized, []);
            }
            byNormalizedUrl.get(normalized)!.push(item);
          }
          
          // Process duplicates
          let mergedCount = 0;
          for (const [, items] of byNormalizedUrl) {
            if (items.length === 1) {
              // No duplicates, just add placements
              const item = items[0];
              const placements: Record<string, ItemPlacement> = {};
              for (const cid of (item.collectionIds || [])) {
                placements[cid] = {
                  collectionId: cid,
                  notes: item.notes,
                  tags: item.tags,
                  addedAt: item.created_at || now,
                  source: item.source || 'manual'
                };
              }
              await itemsStore.put({
                ...item,
                placements,
                updated_at: now
              });
            } else {
              // Merge duplicates: keep oldest, union placements
              items.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
              const keeper = items[0];
              const placements: Record<string, ItemPlacement> = {};
              
              // Collect placements from all duplicates
              for (const item of items) {
                for (const cid of (item.collectionIds || [])) {
                  if (!placements[cid]) {
                    placements[cid] = {
                      collectionId: cid,
                      notes: item.notes,
                      tags: item.tags,
                      addedAt: item.created_at || now,
                      source: item.source || 'manual'
                    };
                  }
                }
              }
              
              // Best title (longest non-URL title)
              let bestTitle = keeper.title;
              for (const item of items) {
                if (item.title && item.title !== item.url && item.title.length > bestTitle.length) {
                  bestTitle = item.title;
                }
              }
              
              // Best favicon
              let bestFavicon = keeper.favicon;
              for (const item of items) {
                if (item.favicon && !bestFavicon) {
                  bestFavicon = item.favicon;
                  break;
                }
              }
              
              const collectionIds = Object.keys(placements);
              
              // Update keeper with merged data (keep keeper.url as-is)
              await itemsStore.put({
                ...keeper,
                title: bestTitle,
                favicon: bestFavicon,
                collectionIds,
                placements,
                updated_at: now
              });
              
              // Delete duplicates
              for (let i = 1; i < items.length; i++) {
                await itemsStore.delete(items[i].id);
                mergedCount++;
              }
            }
          }
          
          console.log(`✅ Migration v4 complete: ${mergedCount} duplicate items merged`);
        }

        // Log migration completion
        if (oldVersion < newVersion) {
          console.log(`✅ Migration to v${newVersion} completed`);
        }
      },
    });
    })();
    
    // After DB is opened, run runtime migrations (for cases where DB version didn't change)
    dbPromise = dbPromise.then(async (db) => {
      await ensureDefaultProjectAndCollection(db);
      return db;
    });
  }
  return dbPromise;
};

// --- CRUD Helpers ---

export interface AddItemResult {
  itemId: string;
  merged: boolean;
  addedToCollections: string[];  // Collection IDs where a new placement was added
  alreadyInCollections: string[]; // Collection IDs where URL was already present
  /** True when incoming notes were applied to an existing placement (same URL + collection). */
  updatedPlacementNotes?: boolean;
}

/**
 * Add a bookmark with find-or-merge behavior.
 * If an item with the same normalized URL exists, adds a new placement.
 * Otherwise creates a new item.
 */
export const addItem = async (
  item: Omit<Item, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Item, 'updated_at'>>
): Promise<string> => {
  const result = await addItemWithMerge(item);
  return result.itemId;
};

/**
 * Add a bookmark with detailed merge info.
 */
export const addItemWithMerge = async (
  item: Omit<Item, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Item, 'updated_at'>>
): Promise<AddItemResult> => {
  const db = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
  const now = nowTs();
  const collectionIds = Array.isArray(item.collectionIds) && item.collectionIds.length > 0 
    ? item.collectionIds 
    : [defaultUnsortedCollectionId];
  
  // For non-URL items (notes), create directly
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
    await db.put('items', { 
      ...item, 
      id, 
      created_at: now, 
      updated_at: item.updated_at ?? now, 
      collectionIds,
      placements
    });
    notifyDataChanged('item.add');
    return { itemId: id, merged: false, addedToCollections: collectionIds, alreadyInCollections: [] };
  }
  
  // Dedup key (tracking params only) — stored url stays exactly as saved
  const savedUrl = item.url.trim();
  const dedupeKey = normalizeBookmarkUrl(savedUrl);
  const existing = await findItemByNormalizedUrl(db, dedupeKey);
  
  if (existing) {
    // Merge: add new placement(s) to existing item
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
        // Apply notes whenever the caller passed a `notes` field (incl. undefined to clear).
        // `notes !== undefined` misses `{ notes: undefined }` from trimmed empty strings.
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
    
    // Update collectionIds from placements
    const newCollectionIds = Object.keys(placements);
    
    // Update title/favicon if incoming is better
    let title = existing.title;
    if (item.title && item.title !== item.url) {
      const incomingTitle = item.title.trim();
      const existingWeak =
        !existing.title ||
        existing.title === existing.url ||
        existing.title.length < 8;
      if (
        existingWeak ||
        (item.source === 'tab' && incomingTitle && incomingTitle !== existing.title)
      ) {
        title = incomingTitle;
      }
    }

    let favicon = existing.favicon;
    if (item.favicon && !existing.favicon) {
      favicon = item.favicon;
    }

    await db.put('items', {
      ...existing,
      title,
      favicon,
      collectionIds: newCollectionIds,
      placements,
      updated_at: now
    });
    
    notifyDataChanged('item.update');
    return {
      itemId: existing.id,
      merged: true,
      addedToCollections,
      alreadyInCollections,
      updatedPlacementNotes: updatedPlacementNotes || undefined,
    };
  }
  
  // Create new item
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
  
  await db.put('items', { 
    ...item, 
    id, 
    url: savedUrl,
    created_at: now, 
    updated_at: item.updated_at ?? now, 
    collectionIds,
    placements
  });
  
  notifyDataChanged('item.add');
  return { itemId: id, merged: false, addedToCollections: collectionIds, alreadyInCollections: [] };
};

export const getAllItems = async () => {
  const db = await getDB();
  return db.getAll('items');
};

export const getItem = async (id: string): Promise<Item | undefined> => {
  const db = await getDB();
  return db.get('items', id);
};

/**
 * Get placement count for an item.
 */
export const getItemPlacementCount = async (id: string): Promise<number> => {
  const db = await getDB();
  const item = await db.get('items', id);
  if (!item) return 0;
  return item.placements ? Object.keys(item.placements).length : item.collectionIds.length;
};

/**
 * Remove an item from a specific collection.
 * If it was the last placement, moves the item to trash (soft delete).
 */
export const removeItemFromCollection = async (
  itemId: string, 
  collectionId: string
): Promise<{ removed: boolean; itemDeleted: boolean; itemTrashed: boolean; remainingPlacements: number }> => {
  const db = await getDB();
  const item = await db.get('items', itemId);
  
  if (!item) {
    return { removed: false, itemDeleted: false, itemTrashed: false, remainingPlacements: 0 };
  }
  
  // Remove from placements
  const placements = { ...(item.placements || {}) };
  delete placements[collectionId];
  
  // Update collectionIds
  const newCollectionIds = Object.keys(placements);
  
  if (newCollectionIds.length === 0) {
    const now = nowTs();
    await db.put('items', {
      ...item,
      deletedAt: now,
      updated_at: now,
    });
    await recordTrashHistory(item, {
      reason: 'Removed from last collection',
      reasonCode: 'remove_last_collection',
    });
    notifyDataChanged('item.update');
    return { removed: true, itemDeleted: false, itemTrashed: true, remainingPlacements: 0 };
  }
  
  // Update item with remaining placements
  await db.put('items', {
    ...item,
    collectionIds: newCollectionIds,
    placements,
    updated_at: nowTs()
  });
  
  notifyDataChanged('item.update');
  return { removed: true, itemDeleted: false, itemTrashed: false, remainingPlacements: newCollectionIds.length };
};

/**
 * Delete an item entirely from all collections.
 * Returns placement count for confirmation dialog.
 */
export const deleteItem = async (id: string): Promise<{ deleted: boolean; placementCount: number }> => {
  const db = await getDB();
  const item = await db.get('items', id);
  
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
  await db.delete('items', id);
  notifyDataChanged('item.delete');
  return { deleted: true, placementCount };
};

/**
 * Legacy deleteItem that just returns void for backward compatibility.
 */
export const deleteItemSimple = async (id: string): Promise<void> => {
  await deleteItem(id);
};

// --- Project Helpers ---

export const getAllProjects = async () => {
  const db = await getDB();
  const projects = await db.getAll('projects');
  return projects.sort((a, b) => b.updated_at - a.updated_at);
};

export const addProject = async (name: string, description?: string) => {
  const db = await getDB();
  const now = nowTs();
  const id = crypto.randomUUID();
  await db.put('projects', {
    id,
    name,
    description,
    isDefault: false,
    created_at: now,
    updated_at: now,
  });
  await ensureDefaultCollectionForProject(db, id);
  notifyDataChanged('project.add');
  return id;
};

export const updateProject = async (id: string, updates: Partial<Omit<Project, 'id' | 'created_at'>>) => {
  const db = await getDB();
  const existing = await db.get('projects', id);
  if (!existing) return false;
  const now = nowTs();
  await db.put('projects', { ...existing, ...updates, updated_at: now });
  notifyDataChanged('project.update');
  return true;
};

export const deleteProject = async (id: string) => {
  const db = await getDB();
  // Prevent deleting the default project
  if (id === DEFAULT_PROJECT_ID) return false;
  // Reassign collections that were primarily owned by this project to the default project
  const { defaultProjectId } = await ensureDefaultProjectAndCollection(db);
  const collections = await db.getAll('collections');
  for (const col of collections) {
    if (col.primaryProjectId === id) {
      const newProjectIds = ensureIncludes(col.projectIds.filter((p) => p !== id), defaultProjectId);
      await db.put('collections', {
        ...col,
        primaryProjectId: defaultProjectId,
        projectIds: newProjectIds,
        updated_at: nowTs(),
      });
    } else if (col.projectIds.includes(id)) {
      const newProjectIds = col.projectIds.filter((p) => p !== id);
      await db.put('collections', {
        ...col,
        projectIds: newProjectIds,
        updated_at: nowTs(),
      });
    }
  }

  await db.delete('projects', id);
  notifyDataChanged('project.delete');
  return true;
};

// --- Collection Helpers ---

export const getAllCollections = async () => {
  const db = await getDB();
  return db.getAll('collections');
};

export const addCollection = async (name: string, color?: string, projectId?: string) => {
  const db = await getDB();
  const { defaultProjectId } = await ensureDefaultProjectAndCollection(db);
  const primaryProjectId = projectId || defaultProjectId;
  const id = crypto.randomUUID();
  const now = nowTs();
  await db.put('collections', {
    id,
    name,
    created_at: now,
    updated_at: now,
    primaryProjectId,
    projectIds: [primaryProjectId],
    isDefault: false,
    color: color || '#3b82f6',
  });
  notifyDataChanged('collection.add');
  return id;
};

export const deleteCollection = async (id: string) => {
  const db = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
  // Remove this collection from all items; if item would become empty, move to default Unsorted
  const items = await db.getAllFromIndex('items', 'by-collection', id);
  for (const item of items) {
    const next = (item.collectionIds || []).filter((cid) => cid !== id);
    await db.put('items', {
      ...item,
      collectionIds: next.length > 0 ? next : [defaultUnsortedCollectionId],
      updated_at: nowTs(),
    });
  }
  await db.delete('collections', id);
  notifyDataChanged('collection.delete');
};

export const updateCollection = async (id: string, updates: Partial<Omit<Collection, 'id' | 'created_at'>>) => {
  const db = await getDB();
  const collection = await db.get('collections', id);
  if (collection) {
    await db.put('collections', { ...collection, ...updates, updated_at: nowTs() });
    notifyDataChanged('collection.update');
  }
};

// Backward-compatible helper (single select). Converts to collectionIds[].
export const updateItemCollection = async (itemId: string, collectionId: string | undefined) => {
  const db = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
  const item = await db.get('items', itemId);
  if (item) {
    const next = typeof collectionId === 'string' ? [collectionId] : [defaultUnsortedCollectionId];
    await assertNoBookmarkDuplicateInCollections(db, item.url || '', next, item.id);
    await db.put('items', { ...item, collectionIds: next, updated_at: nowTs() });
    notifyDataChanged('item.update');
  }
};

export const getItemsByCollection = async (collectionId: string | undefined) => {
  const db = await getDB();
  if (collectionId === undefined) {
    const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
    return db.getAllFromIndex('items', 'by-collection', defaultUnsortedCollectionId);
  }
  return db.getAllFromIndex('items', 'by-collection', collectionId);
};

export const updateItem = async (
  id: string,
  updates: Partial<Omit<Item, 'id' | 'created_at'>>,
  options?: UpdateItemOptions
) => {
  const db = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
  const item = await db.get('items', id);
  if (!item) return;

  const now = nowTs();
  const hasNotesUpdate = Object.prototype.hasOwnProperty.call(updates, 'notes');
  const notesValue = hasNotesUpdate ? updates.notes : undefined;
  const restUpdates = { ...updates } as Partial<Item>;
  if (hasNotesUpdate) delete restUpdates.notes;

  let next: Item = { ...item, ...restUpdates, updated_at: now } as Item;

  if (!Array.isArray(next.collectionIds) || next.collectionIds.length === 0) {
    next.collectionIds = [defaultUnsortedCollectionId];
  }

  if (hasNotesUpdate) {
    const multi =
      (item.collectionIds?.length ?? 0) > 1 ||
      Object.keys(item.placements || {}).length > 1;

    let placementId = options?.notesPlacementCollectionId;
    if (!placementId && !multi) {
      placementId = item.collectionIds?.[0] || Object.keys(item.placements || {})[0];
    }
    if (!placementId && multi && updates.collectionIds?.length === 1) {
      const only = updates.collectionIds[0];
      if ((item.collectionIds || []).includes(only)) placementId = only;
    }

    if (placementId && ((next.collectionIds || []).includes(placementId) || (item.collectionIds || []).includes(placementId))) {
      if (!(next.collectionIds || []).includes(placementId)) {
        next.collectionIds = [...new Set([...(next.collectionIds || []), placementId])];
      }
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
      // Do not write shared notes across placements
      next.notes = undefined;
    }
  }

  for (const key of ['pinnedAt', 'favoriteAt', 'deletedAt'] as const) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key] === undefined) {
      delete (next as unknown as Record<string, unknown>)[key];
    }
  }

  await assertNoBookmarkDuplicateInCollections(db, next.url || '', next.collectionIds, id);
  await db.put('items', next);
  notifyDataChanged('item.update');
};

export const addSnapshot = async (tabs: Snapshot['tabs']) => {
  const db = await getDB();
  await db.put('snapshots', {
    timestamp: Date.now(),
    tabCount: tabs.length,
    tabs,
  });
  notifyDataChanged('snapshot.add');
};

// --- Workspace Helpers ---

/**
 * Deduplicate tabs in workspace windows by normalized URL.
 * First occurrence wins (preserves user ordering).
 */
export const deduplicateWorkspaceTabs = (windows: WorkspaceWindow[]): WorkspaceWindow[] => {
  const seenUrls = new Set<string>();
  
  return windows.map(win => ({
    ...win,
    tabs: win.tabs.filter(tab => {
      if (!tab.url) return true;  // Keep non-URL tabs
      const normalized = normalizeBookmarkUrl(tab.url);
      if (seenUrls.has(normalized)) return false;
      seenUrls.add(normalized);
      return true;
    })
  })).filter(win => win.tabs.length > 0);  // Remove empty windows
};

export const getAllWorkspaces = async () => {
  const db = await getDB();
  const all = await db.getAll('workspaces');
  return all.sort((a, b) => b.updated_at - a.updated_at);
};

export const addWorkspace = async (name: string, windows: WorkspaceWindow[], projectId?: string) => {
  const db = await getDB();
  const id = crypto.randomUUID();
  const now = Date.now();
  // Deduplicate tabs before saving
  const dedupedWindows = deduplicateWorkspaceTabs(windows);
  const ws: Workspace = { id, name, projectId, created_at: now, updated_at: now, windows: dedupedWindows };
  await db.put('workspaces', ws);
  notifyDataChanged('workspace.add');
  return id;
};

export const updateWorkspace = async (id: string, updates: Partial<Pick<Workspace, 'name' | 'windows' | 'projectId'>>) => {
  const db = await getDB();
  const existing = await db.get('workspaces', id);
  if (!existing) return false;
  const now = Date.now();
  
  // Deduplicate windows if provided
  const processedUpdates = { ...updates };
  if (processedUpdates.windows) {
    processedUpdates.windows = deduplicateWorkspaceTabs(processedUpdates.windows);
  }
  
  await db.put('workspaces', { ...existing, ...processedUpdates, updated_at: now });
  notifyDataChanged('workspace.update');
  return true;
};

export const deleteWorkspace = async (id: string) => {
  const db = await getDB();
  await db.delete('workspaces', id);
  notifyDataChanged('workspace.delete');
};

// --- Bulk Import Helpers ---

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
  outcome: 'created' | 'merged';
}

export interface BulkImportSkippedTrashedItem {
  url: string;
  title: string;
  reason: string;
  trashedAt: number;
}

export interface BulkImportOptions {
  /** Skip URLs recorded in trash history (user discarded them earlier). */
  skipPreviouslyTrashed?: boolean;
}

export interface BulkImportResult {
  created: number;
  merged: number;
  skipped: number;
  skippedPreviouslyTrashed: number;
  skippedTrashedItems: BulkImportSkippedTrashedItem[];
  /** Item ids created in this import (for AI queue). */
  createdItemIds: string[];
  /** Item ids written in this import (created + merged into existing). */
  affectedItemIds: string[];
  /** Metadata for post-import pipeline confirmation UI. */
  affectedItems: BulkImportAffectedItem[];
}

/**
 * Import multiple bookmarks with deduplication.
 * Groups by normalized URL, picks best candidate, merges into existing.
 */
export const bulkImportBookmarks = async (
  candidates: ImportCandidate[],
  collectionId: string,
  options?: BulkImportOptions
): Promise<BulkImportResult> => {
  const db = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
  const targetCollection = collectionId || defaultUnsortedCollectionId;
  
  let created = 0;
  let merged = 0;
  let skipped = 0;
  let skippedPreviouslyTrashed = 0;
  const skippedTrashedItems: BulkImportSkippedTrashedItem[] = [];
  const createdItemIds: string[] = [];
  const affectedItemIds: string[] = [];
  const affectedItems: BulkImportAffectedItem[] = [];
  
  // Group by normalized URL to handle duplicates within import
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
  
  // Batch path for large imports:
  // - one snapshot read of existing items
  // - one readwrite transaction for all writes
  // This avoids N*getAll scans from addItemWithMerge/findItemByNormalizedUrl.
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
  const existingItems = await db.getAll('items');
  const existingByNormalizedUrl = new Map<string, Item>();
  for (const item of existingItems) {
    if (!item.url || !isHttpUrl(item.url)) continue;
    existingByNormalizedUrl.set(normalizeBookmarkUrl(item.url), item);
  }

  const trashHistoryMap =
    options?.skipPreviouslyTrashed === true ? await getTrashHistoryMap() : null;

  const tx = db.transaction(['items'], 'readwrite');
  const itemsStore = tx.objectStore('items');

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
      merged += 1;

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
        // Only enrich notes when non-empty; do not clear existing notes in batch import.
        placements[targetCollection] = {
          ...existingPlacement,
          notes: incomingNotes,
          tags: best.tags && best.tags.length > 0 ? best.tags : existingPlacement.tags,
        };
      }

      const mergedCollectionIds = Object.keys(placements);
      const hasBetterTitle =
        !!best.title &&
        best.title !== best.url &&
        (!existing.title || existing.title === existing.url);
      const hasBetterFavicon = !!best.favicon && !existing.favicon;

      const updatedItem: Item = {
        ...existing,
        title: hasBetterTitle ? best.title : existing.title,
        favicon: hasBetterFavicon ? best.favicon : existing.favicon,
        collectionIds: mergedCollectionIds,
        placements,
        updated_at: now,
      };

      await itemsStore.put(updatedItem);
      existingByNormalizedUrl.set(normalizedUrl, updatedItem);
      affectedItemIds.push(existing.id);
      affectedItems.push({
        itemId: existing.id,
        url: updatedItem.url,
        title: updatedItem.title || updatedItem.url,
        outcome: 'merged',
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

    await itemsStore.put(newItem);
    existingByNormalizedUrl.set(normalizedUrl, newItem);
    affectedItemIds.push(id);
    affectedItems.push({
      itemId: id,
      url: newItem.url,
      title: newItem.title || newItem.url,
      outcome: 'created',
    });
  }

  await tx.done;
  if (created > 0 || merged > 0) {
    notifyDataChanged('item.update');
  }
  
  if (createdItemIds.length > 0) {
    try {
      const { noteBulkImport } = await import('./categorization/classifyTopicExtract');
      await noteBulkImport(createdItemIds.length);
    } catch (e) {
      console.warn('Bulk import: could not queue categorization', e);
    }
  }

  return {
    created,
    merged,
    skipped,
    skippedPreviouslyTrashed,
    skippedTrashedItems,
    createdItemIds,
    affectedItemIds,
    affectedItems,
  };
};

export const exportDB = async () => {
    const db = await getDB();
    const projects = await db.getAll('projects');
    const items = await db.getAll('items');
    const collections = await db.getAll('collections');
    const notes = await db.getAll('notes');
    const snapshots = await db.getAll('snapshots');
    const workspaces = await db.getAll('workspaces');
    let item_enrichment: ItemEnrichment[] = [];
    try {
      item_enrichment = await db.getAll('item_enrichment');
    } catch {
      /* store may not exist on very old handles */
    }
    let ai_categories: AiCategory[] = [];
    let ai_item_category_links: AiItemCategoryLink[] = [];
    let ai_item_signals: AiItemSignal[] = [];
    let ai_taxonomy_state: AiTaxonomyState[] = [];
    let trash_history: TrashHistoryEntry[] = [];
    try {
      if (db.objectStoreNames.contains('ai_categories')) {
        ai_categories = await db.getAll('ai_categories');
        ai_item_category_links = await db.getAll('ai_item_category_links');
        ai_item_signals = await db.getAll('ai_item_signals');
      }
      if (db.objectStoreNames.contains('ai_taxonomy_state')) {
        ai_taxonomy_state = await db.getAll('ai_taxonomy_state');
      }
      if (db.objectStoreNames.contains('trash_history')) {
        trash_history = await db.getAll('trash_history');
      }
    } catch {
      /* v5 backup restore */
    }
    const pipelineExportCounts = {
      exportedAt: Date.now(),
      item_enrichment: item_enrichment.length,
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

/**
 * Verifies a backup file structure and returns validation result.
 * Accepts both the new enveloped format and the legacy flat format.
 */
export const verifyBackup = (
  jsonString: string
): { valid: boolean; error?: string; stats?: any; envelope?: BackupEnvelopeMeta | null } => {
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

  const stats = {
    projects: Array.isArray(data.projects) ? (data.projects as unknown[]).length : 0,
    collections: Array.isArray(data.collections) ? (data.collections as unknown[]).length : 0,
    items: Array.isArray(data.items) ? (data.items as unknown[]).length : 0,
    notes: Array.isArray(data.notes) ? (data.notes as unknown[]).length : 0,
    workspaces: Array.isArray(data.workspaces) ? (data.workspaces as unknown[]).length : 0,
    item_enrichment: Array.isArray(data.item_enrichment)
      ? (data.item_enrichment as unknown[]).length
      : 0,
    ai_categories: Array.isArray(data.ai_categories)
      ? (data.ai_categories as unknown[]).length
      : 0,
    ai_item_category_links: Array.isArray(data.ai_item_category_links)
      ? (data.ai_item_category_links as unknown[]).length
      : 0,
    ai_item_signals: Array.isArray(data.ai_item_signals)
      ? (data.ai_item_signals as unknown[]).length
      : 0,
    ai_taxonomy_state: Array.isArray(data.ai_taxonomy_state)
      ? (data.ai_taxonomy_state as unknown[]).length
      : 0,
    trash_history: Array.isArray(data.trash_history)
      ? (data.trash_history as unknown[]).length
      : 0,
    pipelineExportCounts:
      data._pipelineExportCounts && typeof data._pipelineExportCounts === 'object'
        ? data._pipelineExportCounts
        : null,
  };

  if (stats.projects === 0 && stats.items === 0 && stats.collections === 0) {
    return { valid: false, error: 'Backup appears to be empty', envelope: parsed.envelope };
  }

  return { valid: true, stats, envelope: parsed.envelope };
};

/**
 * Imports database from JSON backup string. Accepts both the new enveloped
 * format and the legacy flat format (parseBackupText handles detection).
 *
 * @param jsonString - JSON backup data (envelope OR flat)
 * @param createBackupFirst - If true, automatically creates a download backup
 *                            of the current DB before importing (default: true).
 *                            This is the user-visible "browser download" safety
 *                            net; the BackupCoordinator additionally writes a
 *                            `safety-before-import-…json` into the configured
 *                            backup folder when the import is sync-driven.
 */
export const importDB = async (jsonString: string, createBackupFirst: boolean = true) => {
    const db = await getDB();

  // CRITICAL: Create backup before importing to prevent data loss
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
      // Still proceed, but log the error
    }
  }

    let envelope: BackupEnvelopeMeta | null = null;
    let data: any;
    try {
      const parsed = parseBackupText(jsonString);
      envelope = parsed.envelope;
      data = parsed.data;

    // Validate backup structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid backup file format');
    }

    // Use transactions for atomicity - all or nothing
    type ImportStore =
      | 'projects'
      | 'collections'
      | 'items'
      | 'notes'
      | 'workspaces'
      | 'item_enrichment'
      | 'ai_categories'
      | 'ai_item_category_links'
      | 'ai_item_signals'
      | 'ai_taxonomy_state'
      | 'trash_history';
    const storeNames: ImportStore[] = (
      [
        'projects',
        'collections',
        'items',
        'notes',
        'workspaces',
        'item_enrichment',
        'ai_categories',
        'ai_item_category_links',
        'ai_item_signals',
        'ai_taxonomy_state',
        'trash_history',
      ] as ImportStore[]
    ).filter((name) => db.objectStoreNames.contains(name));

    const tx = db.transaction(storeNames, 'readwrite');
    
    try {
        if (data.projects) {
        const projectsStore = tx.objectStore('projects');
        await Promise.all(data.projects.map((p: Project) => projectsStore.put(p)));
      }
      if (data.collections) {
        const collectionsStore = tx.objectStore('collections');
        await Promise.all(data.collections.map((col: any) => {
          // Normalize legacy shape
          if (!Array.isArray(col.projectIds)) {
            col.projectIds = col.primaryProjectId ? [col.primaryProjectId] : [DEFAULT_PROJECT_ID];
          }
          return collectionsStore.put(col as Collection);
        }));
        }
        if (data.items) {
        const itemsStore = tx.objectStore('items');
            await Promise.all(
              data.items.map((item: any) => {
                // Normalize legacy shape
                if (!Array.isArray(item.collectionIds)) {
                  const fromOld = typeof item.collectionId === 'string' ? [item.collectionId] : [];
                  item.collectionIds = fromOld;
                  delete item.collectionId;
                }
            return itemsStore.put(item as Item);
              })
            );
        }
        if (data.notes) {
        const notesStore = tx.objectStore('notes');
        await Promise.all(data.notes.map((n: Note) => notesStore.put(n)));
        }
        if (data.workspaces) {
        const workspacesStore = tx.objectStore('workspaces');
        await Promise.all(data.workspaces.map((ws: Workspace) => workspacesStore.put(ws)));
      }
        if (data.item_enrichment && db.objectStoreNames.contains('item_enrichment')) {
          const enrichStore = tx.objectStore('item_enrichment');
          await Promise.all(
            (data.item_enrichment as ItemEnrichment[]).map((row) => enrichStore.put(row))
          );
        }
        if (data.ai_categories && db.objectStoreNames.contains('ai_categories')) {
          const catStore = tx.objectStore('ai_categories');
          await Promise.all((data.ai_categories as AiCategory[]).map((row) => catStore.put(row)));
        }
        if (data.ai_item_category_links && db.objectStoreNames.contains('ai_item_category_links')) {
          const linkStore = tx.objectStore('ai_item_category_links');
          await Promise.all(
            (data.ai_item_category_links as AiItemCategoryLink[]).map((row) => linkStore.put(row))
          );
        }
        if (data.ai_item_signals && db.objectStoreNames.contains('ai_item_signals')) {
          const sigStore = tx.objectStore('ai_item_signals');
          await Promise.all(
            (data.ai_item_signals as AiItemSignal[]).map((row) => sigStore.put(row))
          );
        }
        if (data.ai_taxonomy_state && db.objectStoreNames.contains('ai_taxonomy_state')) {
          const metaStore = tx.objectStore('ai_taxonomy_state');
          await Promise.all(
            (data.ai_taxonomy_state as AiTaxonomyState[]).map((row) => metaStore.put(row))
          );
        }
        if (data.trash_history && db.objectStoreNames.contains('trash_history')) {
          const trashStore = tx.objectStore('trash_history');
          await Promise.all(
            (data.trash_history as TrashHistoryEntry[]).map((row) => trashStore.put(row))
          );
        }
      
            await tx.done;

      // Update revision bookkeeping BEFORE notifying so any listener that
      // queries the tracker sees the post-import state.
      if (envelope) {
        // We are now AT the remote's revision; do not increment past it.
        revisionTracker.setLocalRevision(envelope.revision);
        revisionTracker.setLastSeenRemote(envelope);
      }
      // 'import.replace' is special: the revision tracker explicitly does NOT
      // bump on this reason (see RevisionTrackerImpl.onDataChange).
      notifyDataChanged('import.replace');
      return true;
    } catch (txError) {
      tx.abort();
      throw txError;
        }
    } catch (e) {
        console.error("Import failed", e);
        return false;
    }
};
