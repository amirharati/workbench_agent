import type { IdbCompatStore, SqliteStore } from '../sqlite/store';
import type { BatchMutateResult, DbMutation } from '../dbMutations';

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
  deletedItems: ReturnType<IdbCompatStore['getAllDeletedItems']>;
};

type StoreMutationAck<T = unknown> = {
  result: T;
  revision: number;
};

/** Warm pipeline state transferred from a page to the offscreen bulk realm. */
export type PipelineCacheSeed = Pick<
  HydrateSnapshot,
  | 'projects'
  | 'collections'
  | 'items'
  | 'workspaces'
  | 'enrichment'
  | 'categories'
  | 'links'
  | 'signals'
  | 'taxonomy'
> & { revision: number };

export type CategoryLinkCountRow = {
  categoryId: string;
  itemCount: number;
  primaryItemCount: number;
  secondaryItemCount: number;
};

/** Chrome structured-clone cap per worker postMessage (~64MiB). */
const HYDRATE_PAGE_SIZE = 1000;

export type HydrateStage = 'essential' | 'pipeline';

export type HydrateProgress = {
  stage: HydrateStage;
  table: string;
  page: number;
  rowsInPage: number;
  rowsLoaded?: number;
};

export type HydrateOptions = {
  force?: boolean;
  stages?: HydrateStage[];
  onProgress?: (p: HydrateProgress) => void;
};

/** Blocking first paint: metadata + full bookmark list. */
const HYDRATE_ESSENTIAL_SMALL_TABLES = [
  'projects',
  'collections',
  'workspaces',
  'snapshots',
  'ai_categories',
  'ai_taxonomy_state',
  'trash_history',
  'deleted_items',
] as const;

const HYDRATE_ESSENTIAL_PAGED_TABLES = ['items'] as const;

/** Deferred: pipeline + notes (large on big libraries). */
const HYDRATE_PIPELINE_PAGED_TABLES = [
  'item_enrichment',
  'ai_item_signals',
  'ai_item_category_links',
  'notes',
] as const;

const HYDRATE_PAGED_TABLES = [
  ...HYDRATE_ESSENTIAL_PAGED_TABLES,
  ...HYDRATE_PIPELINE_PAGED_TABLES,
] as const;

const PIPELINE_STORE_NAMES = new Set<string>(HYDRATE_PIPELINE_PAGED_TABLES);

function emptyHydrateSnapshot(): HydrateSnapshot {
  return {
    projects: [],
    collections: [],
    items: [],
    notes: [],
    snapshots: [],
    workspaces: [],
    enrichment: [],
    categories: [],
    links: [],
    signals: [],
    taxonomy: undefined,
    trash: [],
    deletedItems: [],
  };
}

const PAGED_TABLE_SET = new Set<string>(HYDRATE_PAGED_TABLES);

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function signalMetaOnlyForTab<T extends { embedding?: number[] }>(row: T): T {
  if (!row.embedding?.length) return row;
  return { ...row, embedding: [] };
}

function mergeHydrateTableRows(
  snapshot: HydrateSnapshot,
  storeName: string,
  rows: unknown[],
  append: boolean
): void {
  const put = <T>(target: T[], chunk: T[]) => {
    if (append) target.push(...chunk);
    else target.splice(0, target.length, ...chunk);
  };
  switch (storeName) {
    case 'projects':
      put(snapshot.projects, rows as HydrateSnapshot['projects']);
      return;
    case 'collections':
      put(snapshot.collections, rows as HydrateSnapshot['collections']);
      return;
    case 'items':
      put(snapshot.items, rows as HydrateSnapshot['items']);
      return;
    case 'notes':
      put(snapshot.notes, rows as HydrateSnapshot['notes']);
      return;
    case 'snapshots':
      put(snapshot.snapshots, rows as HydrateSnapshot['snapshots']);
      return;
    case 'workspaces':
      put(snapshot.workspaces, rows as HydrateSnapshot['workspaces']);
      return;
    case 'item_enrichment':
      put(snapshot.enrichment, rows as HydrateSnapshot['enrichment']);
      return;
    case 'ai_categories':
      put(snapshot.categories, rows as HydrateSnapshot['categories']);
      return;
    case 'ai_item_category_links':
      put(snapshot.links, rows as HydrateSnapshot['links']);
      return;
    case 'ai_item_signals':
      // Tab cache is meta-only — embedding vectors stay in the worker/OPFS.
      put(
        snapshot.signals,
        (rows as HydrateSnapshot['signals']).map((s) => signalMetaOnlyForTab(s))
      );
      return;
    case 'ai_taxonomy_state': {
      const state = (rows as NonNullable<HydrateSnapshot['taxonomy']>[])[0];
      snapshot.taxonomy = state ?? undefined;
      return;
    }
    case 'trash_history':
      put(snapshot.trash, rows as HydrateSnapshot['trash']);
      return;
    case 'deleted_items':
      put(snapshot.deletedItems, rows as HydrateSnapshot['deletedItems']);
      return;
    default:
      return;
  }
}

type SyncTableOpts = {
  stage: HydrateStage;
  onProgress?: (p: HydrateProgress) => void;
};

/** One table from worker → snapshot; paged tables use multiple RPCs (64MiB-safe). */
async function syncTableFromWorker(
  snapshot: HydrateSnapshot,
  storeName: string,
  opts?: SyncTableOpts
): Promise<void> {
  if (PAGED_TABLE_SET.has(storeName)) {
    let offset = 0;
    let page = 0;
    let rowsLoaded = 0;
    for (;;) {
      const pageResult = await rpc<{ rows: unknown[]; done: boolean }>('refreshTablePage', [
        storeName,
        offset,
        HYDRATE_PAGE_SIZE,
      ]);
      page += 1;
      if (pageResult.rows.length) {
        mergeHydrateTableRows(snapshot, storeName, pageResult.rows, offset > 0);
        rowsLoaded += pageResult.rows.length;
      }
      opts?.onProgress?.({
        stage: opts.stage,
        table: storeName,
        page,
        rowsInPage: pageResult.rows.length,
        rowsLoaded,
      });
      await yieldToMain();
      if (pageResult.done) break;
      offset += HYDRATE_PAGE_SIZE;
    }
    return;
  }
  const partial = await rpc<Record<string, unknown>>('refreshTables', [[storeName]]);
  const rows = partial[storeName];
  if (Array.isArray(rows)) {
    mergeHydrateTableRows(snapshot, storeName, rows, false);
    opts?.onProgress?.({
      stage: opts.stage,
      table: storeName,
      page: 1,
      rowsInPage: rows.length,
      rowsLoaded: rows.length,
    });
  }
}

/**
 * Tab-side read cache + write-through RPC to the DB worker.
 * Preserves the synchronous IdbCompatStore API used across the app.
 */
export class RemoteIdbCompatStore {
  objectStoreNames = { contains: (_name: string) => true };
  private snapshot: HydrateSnapshot | null = null;
  private chain = Promise.resolve();
  /** Last worker revision this tab's cache is consistent with. */
  private revision = 0;
  private writesInFlight = 0;
  private essentialReady = false;
  private pipelineHydrated = false;
  private pipelineHydratePromise: Promise<void> | null = null;
  private pendingWriteError: unknown = null;

  isEssentialReady(): boolean {
    return this.essentialReady;
  }

  isPipelineHydrated(): boolean {
    return this.pipelineHydrated;
  }

  async createPipelineCacheSeed(itemIds: string[]): Promise<PipelineCacheSeed> {
    const uniqueIds = [...new Set(itemIds.filter(Boolean))];
    if (!uniqueIds.length) throw new Error('Pipeline scope is empty');
    await this.drainWrites();
    return rpc<PipelineCacheSeed>('getPipelineSeedRows', [uniqueIds]);
  }

  async getCategoryLinkCounts(): Promise<CategoryLinkCountRow[]> {
    await this.drainWrites();
    return rpc<CategoryLinkCountRow[]>('getCategoryLinkCounts', []);
  }

  async getPersistedItem(
    itemId: string
  ): Promise<ReturnType<IdbCompatStore['getItem']>> {
    return rpc<ReturnType<IdbCompatStore['getItem']>>('getItemById', [itemId]);
  }

  /** Refresh one item after a scoped cross-document CRUD notification. */
  async refreshItemFromWorker(
    itemId: string,
    remoteRevision?: number
  ): Promise<ReturnType<IdbCompatStore['getItem']>> {
    await this.drainWrites();
    const item = await this.getPersistedItem(itemId);
    if (item) this.patchGenericPut('items', item);
    else this.patchGenericDelete('items', itemId);
    if (typeof remoteRevision === 'number') this.setRevision(remoteRevision);
    return item;
  }

  async getPersistedItemsByUrl(
    url: string,
    normalizedUrl: string
  ): Promise<ReturnType<IdbCompatStore['getAllItems']>> {
    return rpc<ReturnType<IdbCompatStore['getAllItems']>>('getItemsByUrl', [url, normalizedUrl]);
  }

  installPipelineCacheSeed(seed: PipelineCacheSeed): void {
    this.snapshot = {
      ...emptyHydrateSnapshot(),
      projects: seed.projects,
      collections: seed.collections,
      items: seed.items,
      workspaces: seed.workspaces,
      enrichment: seed.enrichment,
      categories: seed.categories,
      links: seed.links,
      signals: seed.signals.map((signal) => signalMetaOnlyForTab(signal)),
      taxonomy: seed.taxonomy,
    };
    this.revision = seed.revision;
    this.essentialReady = true;
    this.pipelineHydrated = true;
    this.pipelineHydratePromise = null;
  }

  async hydrate(opts?: boolean | HydrateOptions): Promise<void> {
    const options: HydrateOptions =
      typeof opts === 'boolean' ? { force: opts, stages: ['essential', 'pipeline'] } : (opts ?? {});
    const force = options.force === true;
    const stages: HydrateStage[] = options.stages ?? ['essential', 'pipeline'];
    const onProgress = options.onProgress;
    const wantsEssential = stages.includes('essential');
    const wantsPipeline = stages.includes('pipeline');

    if (!force) {
      if (wantsEssential && !wantsPipeline && this.essentialReady && this.snapshot) return;
      if (!wantsEssential && wantsPipeline && this.pipelineHydrated) return;
      if (wantsEssential && wantsPipeline && this.essentialReady && this.pipelineHydrated && this.snapshot) {
        return;
      }
    }

    if (force) {
      this.essentialReady = false;
      this.pipelineHydrated = false;
    }

    const snapshot =
      force || !this.snapshot ? emptyHydrateSnapshot() : this.snapshot;

    const syncOpts = (stage: HydrateStage): SyncTableOpts => ({ stage, onProgress });

    if (wantsEssential && (force || !this.essentialReady)) {
      for (const storeName of HYDRATE_ESSENTIAL_SMALL_TABLES) {
        await syncTableFromWorker(snapshot, storeName, syncOpts('essential'));
        await yieldToMain();
      }
      for (const storeName of HYDRATE_ESSENTIAL_PAGED_TABLES) {
        await syncTableFromWorker(snapshot, storeName, syncOpts('essential'));
      }
      this.essentialReady = true;
      this.snapshot = snapshot;
    } else if (!this.snapshot) {
      this.snapshot = snapshot;
    }

    if (wantsPipeline && (force || !this.pipelineHydrated)) {
      if (!this.essentialReady) {
        await this.hydrate({ force, stages: ['essential'], onProgress });
      }
      for (const storeName of HYDRATE_PIPELINE_PAGED_TABLES) {
        await syncTableFromWorker(snapshot, storeName, syncOpts('pipeline'));
      }
      this.pipelineHydrated = true;
      this.snapshot = snapshot;
    }

    try {
      const { getDbWorkerStatus } = await import('./index');
      const status = await getDbWorkerStatus();
      this.setRevision(status.revision);
    } catch {
      /* revision sync is best-effort */
    }
  }

  async hydrateEssential(opts?: Pick<HydrateOptions, 'force' | 'onProgress'>): Promise<void> {
    await this.hydrate({ ...opts, stages: ['essential'] });
  }

  async hydratePipelineTables(opts?: Pick<HydrateOptions, 'force' | 'onProgress'>): Promise<void> {
    await this.hydrate({ ...opts, stages: ['pipeline'] });
  }

  /** Await pipeline-heavy tables (Hub, classify, search index). */
  async ensurePipelineHydrated(opts?: Pick<HydrateOptions, 'onProgress'>): Promise<void> {
    if (this.pipelineHydrated) return;
    if (this.pipelineHydratePromise) {
      await this.pipelineHydratePromise;
      return;
    }
    this.pipelineHydratePromise = this.hydratePipelineTables(opts).finally(() => {
      this.pipelineHydratePromise = null;
    });
    await this.pipelineHydratePromise;
  }

  /** Non-blocking pipeline hydrate after essential (startup). */
  startPipelineHydrateInBackground(opts?: Pick<HydrateOptions, 'onProgress'>): void {
    if (this.pipelineHydrated || this.pipelineHydratePromise) return;
    this.pipelineHydratePromise = this.hydratePipelineTables(opts).finally(() => {
      this.pipelineHydratePromise = null;
    });
  }

  /** Wait for queued write RPCs to finish (used before cross-tab hydrate). */
  async drainWrites(): Promise<void> {
    await this.chain;
    if (this.pendingWriteError) {
      const error = this.pendingWriteError;
      this.pendingWriteError = null;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  getRevision(): number {
    return this.revision;
  }

  setRevision(revision: number): void {
    if (Number.isFinite(revision)) {
      this.revision = Math.max(this.revision, revision);
    }
  }

  /** Merge selected tables from worker SQLite into the tab read cache (lightweight vs full hydrate). */
  async refreshTablesFromWorker(storeNames: readonly string[]): Promise<void> {
    if (!storeNames.length) return;
    await this.drainWrites();
    if (!this.snapshot || !this.essentialReady) {
      await this.hydrate({ force: true, stages: ['essential', 'pipeline'] });
      return;
    }
    const needsPipeline = storeNames.some((n) => PIPELINE_STORE_NAMES.has(n));
    if (needsPipeline) {
      await this.ensurePipelineHydrated();
    }
    const stage: HydrateStage = needsPipeline ? 'pipeline' : 'essential';
    for (const name of storeNames) {
      await syncTableFromWorker(this.snapshot, name, { stage });
    }
    if (needsPipeline) {
      this.pipelineHydrated = true;
    }
  }

  /** Full reload only when worker revision is ahead of this tab's cache. */
  async hydrateIfBehind(remoteRevision?: number): Promise<boolean> {
    await this.drainWrites();
    const target =
      typeof remoteRevision === 'number'
        ? remoteRevision
        : (await import('./index').then((m) => m.getDbWorkerStatus())).revision;
    if (target > this.revision) {
      await this.hydrate({ force: true, stages: ['essential', 'pipeline'] });
      return true;
    }
    this.setRevision(target);
    return false;
  }

  private enqueue<T>(method: string, args: unknown[]): Promise<T> {
    this.writesInFlight += 1;
    const next = this.chain.then(async () => {
      try {
        const ack = await rpc<StoreMutationAck<T>>('storeMutate', [method, args]);
        if (typeof ack?.revision === 'number') this.setRevision(ack.revision);
        return ack?.result;
      } finally {
        this.writesInFlight = Math.max(0, this.writesInFlight - 1);
      }
    });
    this.chain = next.then(
      () => undefined,
      (err) => {
        this.pendingWriteError = err;
        this.writesInFlight = Math.max(0, this.writesInFlight - 1);
        console.error('[RemoteStore] write RPC failed:', err);
        return undefined;
      }
    );
    return next;
  }

  /** Fewer round-trips for bulk trash / import (payload stays under worker message limits). */
  private static readonly BATCH_MUTATE_CHUNK = 400;

  private applyMutationsToSnapshot(ops: DbMutation[]): void {
    for (const op of ops) {
      if (op.kind === 'put') this.patchGenericPut(op.storeName, op.value);
      else this.patchGenericDelete(op.storeName, op.key);
    }
  }

  private async enqueueBatchMutate(ops: DbMutation[]): Promise<BatchMutateResult> {
    if (ops.length === 0) {
      return Promise.resolve({ applied: 0, revision: this.revision });
    }
    this.writesInFlight += 1;
    try {
      let last: BatchMutateResult = { applied: 0, revision: this.revision };
      for (let i = 0; i < ops.length; i += RemoteIdbCompatStore.BATCH_MUTATE_CHUNK) {
        last = await this.enqueueBatchMutateOnce(
          ops.slice(i, i + RemoteIdbCompatStore.BATCH_MUTATE_CHUNK)
        );
      }
      return last;
    } finally {
      this.writesInFlight = Math.max(0, this.writesInFlight - 1);
    }
  }

  private enqueueBatchMutateOnce(ops: DbMutation[]): Promise<BatchMutateResult> {
    if (ops.length === 0) {
      return Promise.resolve({ applied: 0, revision: this.revision });
    }
    const next = this.chain.then(async () => {
      const result = await rpc<BatchMutateResult>('batchMutate', [ops]);
      if (typeof result.revision === 'number') {
        this.setRevision(result.revision);
      }
      return result;
    });
    this.chain = next.then(
      () => undefined,
      (err) => {
        this.pendingWriteError = err;
        console.error('[RemoteStore] batchMutate failed:', err);
        return undefined;
      }
    );
    return next;
  }

  hasWritesInFlight(): boolean {
    return this.writesInFlight > 0;
  }

  /** Apply many puts/deletes in one (or few chunked) SQLite transactions + update tab cache. */
  async batchMutate(ops: DbMutation[]): Promise<BatchMutateResult> {
    if (ops.length === 0) {
      return { applied: 0, revision: this.revision };
    }
    const result = await this.enqueueBatchMutate(ops);
    this.applyMutationsToSnapshot(ops);
    return result;
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
        const byId = s.links.findIndex((l) => l.id === link.id);
        if (byId >= 0) {
          s.links[byId] = link;
          return;
        }
        const byPair = s.links.findIndex(
          (l) => l.itemId === link.itemId && l.categoryId === link.categoryId
        );
        if (byPair >= 0) s.links[byPair] = link;
        else s.links.push(link);
        return;
      }
      case 'ai_item_signals':
        upsertByItemId(
          s.signals,
          signalMetaOnlyForTab(value as Parameters<IdbCompatStore['putSignal']>[0])
        );
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
      case 'deleted_items': {
        const entry = value as Parameters<IdbCompatStore['putDeletedItem']>[0];
        const i = s.deletedItems.findIndex((d) => d.id === entry.id);
        if (i >= 0) s.deletedItems[i] = entry;
        else s.deletedItems.push(entry);
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
      case 'deleted_items':
        s.deletedItems = s.deletedItems.filter((d) => d.id !== key);
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
      case 'deleted_items': return this.read((s) => s.deletedItems);
      default: return [];
    }
  }

  get(storeName: string, key: string): unknown {
    // Prefer keyed lookups — getAll().find on ai_item_signals walks every embedding.
    switch (storeName) {
      case 'items':
        return this.getItem(key);
      case 'item_enrichment':
        return this.getEnrichment(key);
      case 'ai_item_signals':
        return this.getSignal(key);
      case 'projects':
        return this.getProject(key);
      case 'collections':
        return this.getCollection(key);
      case 'notes':
        return this.getNote(key);
      default:
        return this.getAll(storeName).find((row) => {
          const r = row as { id?: string; itemId?: string; normalizedUrl?: string };
          return r.id === key || r.itemId === key || r.normalizedUrl === key;
        });
    }
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
    const buffer: DbMutation[] = [];
    let donePromise: Promise<void> | null = null;

    const flush = async (): Promise<void> => {
      if (buffer.length === 0) return;
      const ops = buffer.splice(0, buffer.length);
      await self.enqueueBatchMutate(ops);
      self.applyMutationsToSnapshot(ops);
    };

    return {
      objectStore: (name: string) => ({
        getAll: () => Promise.resolve(self.getAll(name)),
        get: (key: string) => Promise.resolve(self.get(name, key)),
        put: (value: unknown) => {
          buffer.push({ kind: 'put', storeName: name, value });
          return Promise.resolve();
        },
        delete: (key: string) => {
          buffer.push({ kind: 'delete', storeName: name, key });
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
      get done() {
        if (!donePromise) {
          donePromise = flush();
        }
        return donePromise;
      },
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

  getAllPipelineDebug() {
    throw new Error('getAllPipelineDebug is worker-only — use pipelineDebug.getAllPipelineDebugRecords()');
  }
  putPipelineDebug(record: { itemId: string; capturedAt: number; payload: unknown }) {
    this.write('putPipelineDebug', [record]);
  }
  clearAllPipelineDebug() {
    throw new Error('clearAllPipelineDebug is worker-only — use pipelineDebug.purgeAllPipelineDebug()');
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
      const byId = s.links.findIndex((l) => l.id === link.id);
      if (byId >= 0) {
        s.links[byId] = link;
        return;
      }
      const byPair = s.links.findIndex(
        (l) => l.itemId === link.itemId && l.categoryId === link.categoryId
      );
      if (byPair >= 0) s.links[byPair] = link;
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
    // Worker gets full signal (with embedding); tab cache keeps meta only.
    this.write('putSignal', [signal], (s) => {
      const lite = signalMetaOnlyForTab(signal);
      const i = s.signals.findIndex((sig) => sig.itemId === lite.itemId);
      if (i >= 0) s.signals[i] = lite;
      else s.signals.push(lite);
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

  getAllDeletedItems() { return this.read((s) => s.deletedItems); }
  getDeletedItem(id: string) {
    return this.read((s) => s.deletedItems.find((d) => d.id === id));
  }
  putDeletedItem(entry: Parameters<IdbCompatStore['putDeletedItem']>[0]) {
    this.write('putDeletedItem', [entry], (s) => {
      const i = s.deletedItems.findIndex((d) => d.id === entry.id);
      if (i >= 0) s.deletedItems[i] = entry;
      else s.deletedItems.push(entry);
    });
  }
  deleteDeletedItem(id: string) {
    this.write('deleteDeletedItem', [id], (s) => {
      s.deletedItems = s.deletedItems.filter((d) => d.id !== id);
    });
  }

  clearAllTables() {
    void this.enqueue('clearAllTables', []).then(() =>
      this.hydrate({ force: true, stages: ['essential', 'pipeline'] })
    );
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
