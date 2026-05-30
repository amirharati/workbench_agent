import type { IdbCompatStore, SqliteStore } from '../sqlite/store';

async function rpc<T>(method: string, args: unknown[]): Promise<T> {
  const { dbRpc } = await import('./index');
  return dbRpc<T>(method, args);
}

type HydrateSnapshot = {
  projects: ReturnType<IdbCompatStore['getAllProjects']>;
  collections: ReturnType<IdbCompatStore['getAllCollections']>;
  items: ReturnType<IdbCompatStore['getAllItems']>;
  notes: ReturnType<IdbCompatStore['getAllNotes']>;
  snapshots: ReturnType<IdbCompatStore['getAllSnapshots']>;
  workspaces: ReturnType<IdbCompatStore['getAllWorkspaces']>;
  enrichment: ReturnType<IdbCompatStore['getAllEnrichment']>;
  categories: ReturnType<IdbCompatStore['getAllCategories']>;
  links: ReturnType<IdbCompatStore['getAllLinks']>;
  signals: ReturnType<IdbCompatStore['getAllSignals']>;
  taxonomy: ReturnType<IdbCompatStore['getTaxonomyState']>;
  signalsByClassify?: never;
  trash: ReturnType<IdbCompatStore['getAllTrashHistory']>;
};

/**
 * Tab-side read cache + write-through RPC to the DB worker.
 * Preserves the synchronous IdbCompatStore API used across the app.
 */
export class RemoteIdbCompatStore {
  objectStoreNames = { contains: (_name: string) => true };
  private snapshot: HydrateSnapshot | null = null;
  private chain = Promise.resolve();
  private revision = 0;

  async hydrate(force = false): Promise<void> {
    if (this.snapshot && !force) return;
    const data = (await rpc<HydrateSnapshot>('hydrate', [])) as HydrateSnapshot;
    this.snapshot = data;
  }

  /** Wait for queued write RPCs to finish (used before cross-tab hydrate). */
  async drainWrites(): Promise<void> {
    await this.chain;
  }

  getRevision(): number {
    return this.revision;
  }

  setRevision(revision: number): void {
    this.revision = revision;
  }

  private enqueue<T>(method: string, args: unknown[]): Promise<T> {
    const next = this.chain.then(() => rpc<T>('storeInvoke', [method, args]));
    this.chain = next.then(
      () => undefined,
      (err) => {
        console.error('[RemoteStore] write RPC failed, re-hydrating from worker:', err);
        void this.hydrate(true);
        return undefined;
      }
    );
    return next;
  }

  private read<T>(pick: (s: HydrateSnapshot) => T): T {
    if (!this.snapshot) {
      throw new Error('Remote DB cache not hydrated — call getDB() first');
    }
    return pick(this.snapshot);
  }

  private write(method: string, args: unknown[], patch?: (s: HydrateSnapshot) => void): void {
    if (patch && this.snapshot) patch(this.snapshot);
    void this.enqueue(method, args);
  }

  private patchGenericPut(storeName: string, value: unknown): void {
    if (!this.snapshot) return;
    const s = this.snapshot;
    const upsertById = <T extends { id: string }>(list: T[], row: T) => {
      const i = list.findIndex((x) => x.id === row.id);
      if (i >= 0) list[i] = row;
      else list.push(row);
    };
    const upsertByItemId = <T extends { itemId: string }>(list: T[], row: T) => {
      const i = list.findIndex((x) => x.itemId === row.itemId);
      if (i >= 0) list[i] = row;
      else list.push(row);
    };
    switch (storeName) {
      case 'projects':
        upsertById(s.projects, value as Parameters<IdbCompatStore['putProject']>[0]);
        return;
      case 'collections':
        upsertById(s.collections, value as Parameters<IdbCompatStore['putCollection']>[0]);
        return;
      case 'items':
        upsertById(s.items, value as Parameters<IdbCompatStore['putItem']>[0]);
        return;
      case 'notes':
        upsertById(s.notes, value as Parameters<IdbCompatStore['putNote']>[0]);
        return;
      case 'workspaces':
        upsertById(s.workspaces, value as Parameters<IdbCompatStore['putWorkspace']>[0]);
        return;
      case 'item_enrichment':
        upsertByItemId(s.enrichment, value as Parameters<IdbCompatStore['putEnrichment']>[0]);
        return;
      case 'ai_categories':
        upsertById(s.categories, value as Parameters<IdbCompatStore['putCategory']>[0]);
        return;
      case 'ai_item_category_links': {
        const link = value as Parameters<IdbCompatStore['putLink']>[0];
        const i = s.links.findIndex((l) => l.itemId === link.itemId && l.categoryId === link.categoryId);
        if (i >= 0) s.links[i] = link;
        else s.links.push(link);
        return;
      }
      case 'ai_item_signals':
        upsertByItemId(s.signals, value as Parameters<IdbCompatStore['putSignal']>[0]);
        return;
      case 'ai_taxonomy_state':
        s.taxonomy = value as Parameters<IdbCompatStore['putTaxonomyState']>[0];
        return;
      case 'trash_history': {
        const entry = value as Parameters<IdbCompatStore['putTrashEntry']>[0];
        const i = s.trash.findIndex((t) => t.normalizedUrl === entry.normalizedUrl);
        if (i >= 0) s.trash[i] = entry;
        else s.trash.push(entry);
        return;
      }
      case 'snapshots':
        s.snapshots.push(value as Parameters<IdbCompatStore['putSnapshot']>[0]);
        return;
      default:
        console.warn('[RemoteIdbCompatStore] put to unknown store:', storeName);
    }
  }

  private patchGenericDelete(storeName: string, key: string): void {
    if (!this.snapshot) return;
    const s = this.snapshot;
    switch (storeName) {
      case 'projects':
        s.projects = s.projects.filter((p) => p.id !== key);
        return;
      case 'collections':
        s.collections = s.collections.filter((c) => c.id !== key);
        return;
      case 'items':
        s.items = s.items.filter((i) => i.id !== key);
        return;
      case 'notes':
        s.notes = s.notes.filter((n) => n.id !== key);
        return;
      case 'workspaces':
        s.workspaces = s.workspaces.filter((w) => w.id !== key);
        return;
      case 'item_enrichment':
        s.enrichment = s.enrichment.filter((e) => e.itemId !== key);
        return;
      case 'ai_categories':
        s.categories = s.categories.filter((c) => c.id !== key);
        return;
      case 'ai_item_category_links':
        s.links = s.links.filter((l) => l.id !== key);
        return;
      case 'ai_item_signals':
        s.signals = s.signals.filter((sig) => sig.itemId !== key);
        return;
      case 'trash_history':
        s.trash = s.trash.filter((t) => t.normalizedUrl !== key);
        return;
      default:
        console.warn('[RemoteIdbCompatStore] delete from unknown store:', storeName);
    }
  }

  // Generic IDB-compat surface
  getAll(storeName: string): unknown[] {
    switch (storeName) {
      case 'projects': return this.read((s) => s.projects);
      case 'collections': return this.read((s) => s.collections);
      case 'items': return this.read((s) => s.items);
      case 'notes': return this.read((s) => s.notes);
      case 'snapshots': return this.read((s) => s.snapshots);
      case 'workspaces': return this.read((s) => s.workspaces);
      case 'item_enrichment': return this.read((s) => s.enrichment);
      case 'ai_categories': return this.read((s) => s.categories);
      case 'ai_item_category_links': return this.read((s) => s.links);
      case 'ai_item_signals': return this.read((s) => s.signals);
      case 'ai_taxonomy_state': {
        const state = this.read((s) => s.taxonomy);
        return state ? [state] : [];
      }
      case 'trash_history': return this.read((s) => s.trash);
      default: return [];
    }
  }

  get(storeName: string, key: string): unknown {
    return this.getAll(storeName).find((row) => {
      const r = row as { id?: string; itemId?: string; normalizedUrl?: string };
      return r.id === key || r.itemId === key || r.normalizedUrl === key;
    });
  }

  put(storeName: string, value: unknown): void {
    this.patchGenericPut(storeName, value);
    void this.enqueue('put', [storeName, value]);
  }

  delete(storeName: string, key: string): void {
    this.patchGenericDelete(storeName, key);
    void this.enqueue('delete', [storeName, key]);
  }

  getAllFromIndex(storeName: string, indexName: string, value: unknown): unknown[] {
    switch (storeName) {
      case 'items':
        if (indexName === 'by-collection') {
          return this.read((s) => s.items.filter((item) => item.collectionIds.includes(value as string)));
        }
        return [];
      case 'ai_item_category_links':
        if (indexName === 'by-item') return this.read((s) => s.links.filter((l) => l.itemId === value));
        if (indexName === 'by-category') return this.read((s) => s.links.filter((l) => l.categoryId === value));
        return [];
      case 'ai_item_signals':
        if (indexName === 'by-classify-state') {
          return this.read((s) => s.signals.filter((sig) => sig.classifyState === value));
        }
        return [];
      default:
        return [];
    }
  }

  transaction(_storeNames: string | string[], _mode?: string) {
    const self = this;
    return {
      objectStore: (name: string) => ({
        getAll: () => Promise.resolve(self.getAll(name)),
        get: (key: string) => Promise.resolve(self.get(name, key)),
        put: (value: unknown) => {
          self.put(name, value);
          return Promise.resolve();
        },
        delete: (key: string) => {
          self.delete(name, key);
          return Promise.resolve();
        },
        getAllFromIndex: (indexName: string, value: unknown) =>
          Promise.resolve(self.getAllFromIndex(name, indexName, value)),
        index: (indexName: string) => ({
          getAll: (value?: unknown) => {
            if (value !== undefined) {
              return Promise.resolve(self.getAllFromIndex(name, indexName, value));
            }
            return Promise.resolve(self.getAll(name));
          },
          getAllKeys: () => {
            const items = self.getAll(name);
            return Promise.resolve(
              items.map((i) => {
                const row = i as { id?: string; itemId?: string; normalizedUrl?: string };
                return row.id || row.itemId || row.normalizedUrl;
              })
            );
          },
        }),
      }),
      done: Promise.resolve(),
    };
  }

  get sqlite(): SqliteStore {
    throw new Error('Direct sqlite access is worker-only');
  }

  getAllProjects() { return this.read((s) => s.projects); }
  getProject(id: string) { return this.read((s) => s.projects.find((p) => p.id === id)); }
  putProject(project: Parameters<IdbCompatStore['putProject']>[0]) {
    this.write('putProject', [project], (s) => {
      const i = s.projects.findIndex((p) => p.id === project.id);
      if (i >= 0) s.projects[i] = project;
      else s.projects.push(project);
    });
  }
  deleteProject(id: string) {
    this.write('deleteProject', [id], (s) => {
      s.projects = s.projects.filter((p) => p.id !== id);
    });
  }

  getAllCollections() { return this.read((s) => s.collections); }
  getCollection(id: string) { return this.read((s) => s.collections.find((c) => c.id === id)); }
  putCollection(collection: Parameters<IdbCompatStore['putCollection']>[0]) {
    this.write('putCollection', [collection], (s) => {
      const i = s.collections.findIndex((c) => c.id === collection.id);
      if (i >= 0) s.collections[i] = collection;
      else s.collections.push(collection);
    });
  }
  deleteCollection(id: string) {
    this.write('deleteCollection', [id], (s) => {
      s.collections = s.collections.filter((c) => c.id !== id);
    });
  }

  getAllItems() { return this.read((s) => s.items); }
  getItem(id: string) { return this.read((s) => s.items.find((i) => i.id === id)); }
  putItem(item: Parameters<IdbCompatStore['putItem']>[0]) {
    this.write('putItem', [item], (s) => {
      const i = s.items.findIndex((x) => x.id === item.id);
      if (i >= 0) s.items[i] = item;
      else s.items.push(item);
    });
  }
  deleteItem(id: string) {
    this.write('deleteItem', [id], (s) => {
      s.items = s.items.filter((i) => i.id !== id);
    });
  }

  getAllNotes() { return this.read((s) => s.notes); }
  getNote(id: string) { return this.read((s) => s.notes.find((n) => n.id === id)); }
  putNote(note: Parameters<IdbCompatStore['putNote']>[0]) {
    this.write('putNote', [note], (s) => {
      const i = s.notes.findIndex((n) => n.id === note.id);
      if (i >= 0) s.notes[i] = note;
      else s.notes.push(note);
    });
  }
  deleteNote(id: string) {
    this.write('deleteNote', [id], (s) => {
      s.notes = s.notes.filter((n) => n.id !== id);
    });
  }

  getAllSnapshots() { return this.read((s) => s.snapshots); }
  putSnapshot(snapshot: Parameters<IdbCompatStore['putSnapshot']>[0]): number {
    void this.enqueue('putSnapshot', [snapshot]);
    return Date.now();
  }

  getAllWorkspaces() { return this.read((s) => s.workspaces); }
  getWorkspace(id: string) { return this.read((s) => s.workspaces.find((w) => w.id === id)); }
  putWorkspace(workspace: Parameters<IdbCompatStore['putWorkspace']>[0]) {
    this.write('putWorkspace', [workspace], (s) => {
      const i = s.workspaces.findIndex((w) => w.id === workspace.id);
      if (i >= 0) s.workspaces[i] = workspace;
      else s.workspaces.push(workspace);
    });
  }
  deleteWorkspace(id: string) {
    this.write('deleteWorkspace', [id], (s) => {
      s.workspaces = s.workspaces.filter((w) => w.id !== id);
    });
  }

  getAllEnrichment() { return this.read((s) => s.enrichment); }
  getEnrichment(itemId: string) { return this.read((s) => s.enrichment.find((e) => e.itemId === itemId)); }
  putEnrichment(enrichment: Parameters<IdbCompatStore['putEnrichment']>[0]) {
    this.write('putEnrichment', [enrichment], (s) => {
      const i = s.enrichment.findIndex((e) => e.itemId === enrichment.itemId);
      if (i >= 0) s.enrichment[i] = enrichment;
      else s.enrichment.push(enrichment);
    });
  }
  deleteEnrichment(itemId: string) {
    this.write('deleteEnrichment', [itemId], (s) => {
      s.enrichment = s.enrichment.filter((e) => e.itemId !== itemId);
    });
  }

  getAllCategories() { return this.read((s) => s.categories); }
  getCategory(id: string) { return this.read((s) => s.categories.find((c) => c.id === id)); }
  putCategory(category: Parameters<IdbCompatStore['putCategory']>[0]) {
    this.write('putCategory', [category], (s) => {
      const i = s.categories.findIndex((c) => c.id === category.id);
      if (i >= 0) s.categories[i] = category;
      else s.categories.push(category);
    });
  }
  deleteCategory(id: string) {
    this.write('deleteCategory', [id], (s) => {
      s.categories = s.categories.filter((c) => c.id !== id);
    });
  }

  getAllLinks() { return this.read((s) => s.links); }
  getLinksByItem(itemId: string) { return this.read((s) => s.links.filter((l) => l.itemId === itemId)); }
  getLinksByCategory(categoryId: string) {
    return this.read((s) => s.links.filter((l) => l.categoryId === categoryId));
  }
  putLink(link: Parameters<IdbCompatStore['putLink']>[0]) {
    this.write('putLink', [link], (s) => {
      const i = s.links.findIndex((l) => l.itemId === link.itemId && l.categoryId === link.categoryId);
      if (i >= 0) s.links[i] = link;
      else s.links.push(link);
    });
  }
  deleteLink(id: string) {
    this.write('deleteLink', [id], (s) => {
      s.links = s.links.filter((l) => l.id !== id);
    });
  }
  deleteLinksByItem(itemId: string) {
    this.write('deleteLinksByItem', [itemId], (s) => {
      s.links = s.links.filter((l) => l.itemId !== itemId);
    });
  }

  getAllSignals() { return this.read((s) => s.signals); }
  getSignal(itemId: string) { return this.read((s) => s.signals.find((sig) => sig.itemId === itemId)); }
  getSignalsByClassifyState(state: string) {
    return this.read((s) => s.signals.filter((sig) => sig.classifyState === state));
  }
  putSignal(signal: Parameters<IdbCompatStore['putSignal']>[0]) {
    this.write('putSignal', [signal], (s) => {
      const i = s.signals.findIndex((sig) => sig.itemId === signal.itemId);
      if (i >= 0) s.signals[i] = signal;
      else s.signals.push(signal);
    });
  }
  deleteSignal(itemId: string) {
    this.write('deleteSignal', [itemId], (s) => {
      s.signals = s.signals.filter((sig) => sig.itemId !== itemId);
    });
  }

  getTaxonomyState() { return this.read((s) => s.taxonomy); }
  putTaxonomyState(state: Parameters<IdbCompatStore['putTaxonomyState']>[0]) {
    this.write('putTaxonomyState', [state], (s) => {
      s.taxonomy = state;
    });
  }

  getAllTrashHistory() { return this.read((s) => s.trash); }
  getTrashEntry(normalizedUrl: string) {
    return this.read((s) => s.trash.find((t) => t.normalizedUrl === normalizedUrl));
  }
  putTrashEntry(entry: Parameters<IdbCompatStore['putTrashEntry']>[0]) {
    this.write('putTrashEntry', [entry], (s) => {
      const i = s.trash.findIndex((t) => t.normalizedUrl === entry.normalizedUrl);
      if (i >= 0) s.trash[i] = entry;
      else s.trash.push(entry);
    });
  }
  deleteTrashEntry(normalizedUrl: string) {
    this.write('deleteTrashEntry', [normalizedUrl], (s) => {
      s.trash = s.trash.filter((t) => t.normalizedUrl !== normalizedUrl);
    });
  }

  clearAllTables() {
    void this.enqueue('clearAllTables', []).then(() => this.hydrate(true));
  }

  withTransaction<T>(_fn: () => T): T {
    throw new Error('withTransaction is worker-only — use importDB / bulkImportBookmarks RPC');
  }
}

let remoteStore: RemoteIdbCompatStore | null = null;

export function getRemoteStore(): RemoteIdbCompatStore {
  if (!remoteStore) remoteStore = new RemoteIdbCompatStore();
  return remoteStore;
}

export function resetRemoteStore(): void {
  remoteStore = null;
}
