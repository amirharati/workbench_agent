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
}

let dbPromise: Promise<IDBPDatabase<TabManagerDB>>;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<TabManagerDB>('personal-tools-db', 1, {
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

export const exportDB = async () => {
    const db = await getDB();
    const items = await db.getAll('items');
    const collections = await db.getAll('collections');
    const snapshots = await db.getAll('snapshots');
    return JSON.stringify({ items, collections, snapshots }, null, 2);
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
        // We typically don't restore old snapshots to avoid ID conflicts, but we can if needed.
        return true;
    } catch (e) {
        console.error("Import failed", e);
        return false;
    }
};
