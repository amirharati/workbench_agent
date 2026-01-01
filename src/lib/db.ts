import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'personal-tools-db';
const DB_VERSION = 3;

const DEFAULT_PROJECT_ID = 'project_all';
const DEFAULT_PROJECT_NAME = 'All';
const DEFAULT_UNSORTED_COLLECTION_ID = `collection_${DEFAULT_PROJECT_ID}_unsorted`;
const DEFAULT_UNSORTED_COLLECTION_NAME = 'Unsorted';

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

export interface Item {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  collectionIds: string[]; // Must be non-empty
  tags: string[];
  notes?: string; // User notes for this bookmark
  created_at: number;
  updated_at: number;
  source: 'tab' | 'twitter' | 'manual' | 'bookmark';
  metadata?: Record<string, any>;
}

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
}

let dbPromise: Promise<IDBPDatabase<TabManagerDB>>;

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

const ensureIncludes = (arr: string[], value: string) => (arr.includes(value) ? arr : [...arr, value]);

const nowTs = () => Date.now();

async function ensureDefaultProjectAndCollection(db: IDBPDatabase<TabManagerDB>) {
  const now = nowTs();
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
  }
  return id;
}

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<TabManagerDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        const now = nowTs();

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

        // ---- Data migration to v3 ----
        if (oldVersion < 3) {
          const projectsStore = transaction.objectStore('projects');
          const collectionsStore = transaction.objectStore('collections');
          const itemsStore = transaction.objectStore('items');
          const workspacesStore = transaction.objectStore('workspaces');

          // Ensure default project
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
      },
    });
  }
  return dbPromise;
};

// --- CRUD Helpers ---

export const addItem = async (item: Omit<Item, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Item, 'updated_at'>>) => {
  const db = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
  const id = crypto.randomUUID();
  const now = nowTs();
  const collectionIds = Array.isArray(item.collectionIds) && item.collectionIds.length > 0 ? item.collectionIds : [defaultUnsortedCollectionId];
  await db.put('items', { ...item, id, created_at: now, updated_at: item.updated_at ?? now, collectionIds });
  return id;
};

export const getAllItems = async () => {
  const db = await getDB();
  return db.getAll('items');
};

export const deleteItem = async (id: string) => {
  const db = await getDB();
  await db.delete('items', id);
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
  return id;
};

export const updateProject = async (id: string, updates: Partial<Omit<Project, 'id' | 'created_at'>>) => {
  const db = await getDB();
  const existing = await db.get('projects', id);
  if (!existing) return false;
  const now = nowTs();
  await db.put('projects', { ...existing, ...updates, updated_at: now });
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
};

// Backward-compatible helper (single select). Converts to collectionIds[].
export const updateItemCollection = async (itemId: string, collectionId: string | undefined) => {
  const db = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
  const item = await db.get('items', itemId);
  if (item) {
    const next = typeof collectionId === 'string' ? [collectionId] : [defaultUnsortedCollectionId];
    await db.put('items', { ...item, collectionIds: next, updated_at: nowTs() });
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

export const updateItem = async (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => {
  const db = await getDB();
  const { defaultUnsortedCollectionId } = await ensureDefaultProjectAndCollection(db);
  const item = await db.get('items', id);
  if (item) {
    const next = { ...item, ...updates, updated_at: nowTs() } as Item;
    if (!Array.isArray(next.collectionIds) || next.collectionIds.length === 0) {
      next.collectionIds = [defaultUnsortedCollectionId];
    }
    await db.put('items', next);
  }
};

export const addSnapshot = async (tabs: Snapshot['tabs']) => {
  const db = await getDB();
  await db.put('snapshots', {
    timestamp: Date.now(),
    tabCount: tabs.length,
    tabs,
  });
};

// --- Workspace Helpers ---

export const getAllWorkspaces = async () => {
  const db = await getDB();
  const all = await db.getAll('workspaces');
  return all.sort((a, b) => b.updated_at - a.updated_at);
};

export const addWorkspace = async (name: string, windows: WorkspaceWindow[]) => {
  const db = await getDB();
  const id = crypto.randomUUID();
  const now = Date.now();
  const ws: Workspace = { id, name, projectId: undefined, created_at: now, updated_at: now, windows };
  await db.put('workspaces', ws);
  return id;
};

export const updateWorkspace = async (id: string, updates: Partial<Pick<Workspace, 'name' | 'windows'>>) => {
  const db = await getDB();
  const existing = await db.get('workspaces', id);
  if (!existing) return false;
  const now = Date.now();
  await db.put('workspaces', { ...existing, ...updates, updated_at: now });
  return true;
};

export const deleteWorkspace = async (id: string) => {
  const db = await getDB();
  await db.delete('workspaces', id);
};

export const exportDB = async () => {
    const db = await getDB();
    const projects = await db.getAll('projects');
    const items = await db.getAll('items');
    const collections = await db.getAll('collections');
    const notes = await db.getAll('notes');
    const snapshots = await db.getAll('snapshots');
    const workspaces = await db.getAll('workspaces');
    return JSON.stringify({ projects, collections, items, notes, snapshots, workspaces }, null, 2);
};

export const importDB = async (jsonString: string) => {
    const db = await getDB();
    try {
        const data = JSON.parse(jsonString);
        if (data.projects) {
            const tx = db.transaction('projects', 'readwrite');
            await Promise.all(data.projects.map((p: Project) => tx.store.put(p)));
            await tx.done;
        }
        if (data.items) {
            const tx = db.transaction('items', 'readwrite');
            await Promise.all(
              data.items.map((item: any) => {
                // Normalize legacy shape
                if (!Array.isArray(item.collectionIds)) {
                  const fromOld = typeof item.collectionId === 'string' ? [item.collectionId] : [];
                  item.collectionIds = fromOld;
                  delete item.collectionId;
                }
                return tx.store.put(item as Item);
              })
            );
            await tx.done;
        }
        if (data.collections) {
            const tx = db.transaction('collections', 'readwrite');
            await Promise.all(data.collections.map((col: any) => tx.store.put(col as Collection)));
            await tx.done;
        }
        if (data.notes) {
            const tx = db.transaction('notes', 'readwrite');
            await Promise.all(data.notes.map((n: Note) => tx.store.put(n)));
            await tx.done;
        }
        if (data.workspaces) {
            const tx = db.transaction('workspaces', 'readwrite');
            await Promise.all(data.workspaces.map((ws: Workspace) => tx.store.put(ws)));
            await tx.done;
        }
        // We typically don't restore old snapshots to avoid ID conflicts, but we can if needed.
        return true;
    } catch (e) {
        console.error("Import failed", e);
        return false;
    }
};
