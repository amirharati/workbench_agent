import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Collection {
  id: string;
  name: string;
  created_at: number;
  isDefault?: boolean; // For "Unsorted" folder
  color?: string;
}

export interface Item {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  collectionId?: string; // If undefined, it's in "Unsorted"
  tags: string[];
  notes?: string; // User notes for this bookmark
  created_at: number;
  source: 'tab' | 'twitter' | 'manual' | 'bookmark';
}

export interface Snapshot {
  id?: number;
  timestamp: number;
  tabCount: number;
  tabs: { title: string; url: string; favIconUrl: string }[];
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
  created_at: number;
  updated_at: number;
  windows: WorkspaceWindow[];
}

interface TabManagerDB extends DBSchema {
  collections: {
    key: string;
    value: Collection;
    indexes: { 'by-name': string };
  };
  items: {
    key: string;
    value: Item;
    indexes: { 'by-url': string; 'by-collection': string };
  };
  snapshots: {
    key: number;
    value: Snapshot;
  };
  workspaces: {
    key: string;
    value: Workspace;
    indexes: { 'by-updated': number; 'by-name': string };
  };
}

let dbPromise: Promise<IDBPDatabase<TabManagerDB>>;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<TabManagerDB>('personal-tools-db', 2, {
      upgrade(db) {
        // Collections Store
        if (!db.objectStoreNames.contains('collections')) {
          const store = db.createObjectStore('collections', { keyPath: 'id' });
          store.createIndex('by-name', 'name');
        }
        // Items Store
        if (!db.objectStoreNames.contains('items')) {
          const store = db.createObjectStore('items', { keyPath: 'id' });
          store.createIndex('by-url', 'url', { unique: false });
          store.createIndex('by-collection', 'collectionId', { unique: false });
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
        }
      },
    });
  }
  return dbPromise;
};

// --- CRUD Helpers ---

export const addItem = async (item: Omit<Item, 'id' | 'created_at'>) => {
  const db = await getDB();
  const id = crypto.randomUUID();
  await db.put('items', { ...item, id, created_at: Date.now() });
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

// --- Collection Helpers ---

export const getAllCollections = async () => {
  const db = await getDB();
  return db.getAll('collections');
};

export const addCollection = async (name: string, color?: string) => {
  const db = await getDB();
  const id = crypto.randomUUID();
  await db.put('collections', {
    id,
    name,
    created_at: Date.now(),
    color: color || '#3b82f6',
  });
  return id;
};

export const deleteCollection = async (id: string) => {
  const db = await getDB();
  // Move all items in this collection to Unsorted
  const items = await db.getAllFromIndex('items', 'by-collection', id);
  for (const item of items) {
    await db.put('items', { ...item, collectionId: undefined });
  }
  await db.delete('collections', id);
};

export const updateItemCollection = async (itemId: string, collectionId: string | undefined) => {
  const db = await getDB();
  const item = await db.get('items', itemId);
  if (item) {
    await db.put('items', { ...item, collectionId });
  }
};

export const getItemsByCollection = async (collectionId: string | undefined) => {
  const db = await getDB();
  if (collectionId === undefined) {
    // Get unsorted items
    const allItems = await db.getAll('items');
    return allItems.filter(item => !item.collectionId);
  }
  return db.getAllFromIndex('items', 'by-collection', collectionId);
};

export const updateItem = async (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => {
  const db = await getDB();
  const item = await db.get('items', id);
  if (item) {
    await db.put('items', { ...item, ...updates });
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
  const ws: Workspace = { id, name, created_at: now, updated_at: now, windows };
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
    const items = await db.getAll('items');
    const collections = await db.getAll('collections');
    const snapshots = await db.getAll('snapshots');
    const workspaces = await db.getAll('workspaces');
    return JSON.stringify({ items, collections, snapshots, workspaces }, null, 2);
};

export const importDB = async (jsonString: string) => {
    const db = await getDB();
    try {
        const data = JSON.parse(jsonString);
        if (data.items) {
            const tx = db.transaction('items', 'readwrite');
            await Promise.all(data.items.map((item: Item) => tx.store.put(item)));
            await tx.done;
        }
        if (data.collections) {
            const tx = db.transaction('collections', 'readwrite');
            await Promise.all(data.collections.map((col: Collection) => tx.store.put(col)));
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
