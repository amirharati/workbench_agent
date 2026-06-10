import type { Item } from '../db';
import type { IdbCompatStore } from '../storage/sqlite/store';
import type { ItemEnrichment } from '../enrichment/types';
import type { AiItemCategoryLink, AiItemSignal } from '../categorization/types';
import {
  buildCountsFromMetaMap,
  buildEnrichmentRowMetaForItem,
  buildHubOutcomeChipsFromLabelCounts,
  enrichmentHubRowFields,
  enrichmentHubRowMatchesFilters,
  rowMatchesTrashSuggestion,
  type EnrichmentHubCounts,
  type EnrichmentHubFilterState,
  type EnrichmentHubRow,
  type EnrichmentHubRowMeta,
  type HubOutcomeChip,
} from './pipelineHubQueries';

export type HubScopeParams = {
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
};

export type HubPageFilters = {
  outcomeLabel?: string | 'all';
  search?: string;
  trashSuggestionsOnly?: boolean;
};

type HubScopeEntry = {
  item: Item;
  enrichment: ItemEnrichment | undefined;
  signal: AiItemSignal | undefined;
  links: AiItemCategoryLink[];
  embedFailed: boolean;
  meta: EnrichmentHubRowMeta;
};

const HUB_COUNTS_BATCH = 500;

let _scopeEntryCache: {
  key: string;
  entries: HubScopeEntry[];
  byLabel: Map<string, HubScopeEntry[]>;
} | null = null;
let _filteredEntryCache: { scopeKey: string; filterKey: string; matches: HubScopeEntry[] } | null =
  null;

function scopeCacheKey(scope: HubScopeParams): string {
  return `${scope.scopeProjectId}:${scope.scopeCollectionId}`;
}

function filterCacheKey(filters: HubPageFilters): string {
  return JSON.stringify({
    outcomeLabel: filters.outcomeLabel ?? 'all',
    search: (filters.search ?? '').trim(),
    trashSuggestionsOnly: !!filters.trashSuggestionsOnly,
  });
}

/** Drop worker meta cache after enrichment/import mutations. */
export function invalidateHubScopeEntryCache(): void {
  _scopeEntryCache = null;
  _filteredEntryCache = null;
}

function hubPageFiltersActive(filters?: HubPageFilters): boolean {
  if (!filters) return false;
  return (
    (filters.outcomeLabel != null && filters.outcomeLabel !== 'all') ||
    !!(filters.search ?? '').trim() ||
    !!filters.trashSuggestionsOnly
  );
}

function toHubFilterState(filters?: HubPageFilters): EnrichmentHubFilterState {
  return {
    outcomeLabel: filters?.outcomeLabel ?? 'all',
    search: filters?.search,
    trashSuggestionsOnly: filters?.trashSuggestionsOnly,
  };
}

function entryToRow(entry: HubScopeEntry): EnrichmentHubRow {
  return {
    item: entry.item,
    enrichment: entry.enrichment,
    embedFailed: entry.embedFailed,
    meta: entry.meta,
    ...enrichmentHubRowFields(entry.signal, entry.links),
  };
}

function scanHubScopeEntries(store: IdbCompatStore, scope: HubScopeParams): {
  entries: HubScopeEntry[];
  byLabel: Map<string, HubScopeEntry[]>;
} {
  const collections = store.getAllCollections();
  const total = store.countHubBookmarks(
    collections,
    scope.scopeProjectId,
    scope.scopeCollectionId
  );
  const entries: HubScopeEntry[] = [];
  const byLabel = new Map<string, HubScopeEntry[]>();

  let offset = 0;
  while (offset < total) {
    const { items } = store.getHubBookmarksPage(
      collections,
      scope.scopeProjectId,
      scope.scopeCollectionId,
      offset,
      HUB_COUNTS_BATCH
    );
    if (!items.length) break;
    const ids = items.map((i) => i.id);
    const enrichMap = new Map(store.getEnrichmentForItemIds(ids).map((e) => [e.itemId, e]));
    const signalByItem = new Map(store.getSignalsForItemIds(ids).map((s) => [s.itemId, s]));
    const linksRaw = store.getLinksForItemIds(ids);
    const linksByItem = new Map<string, AiItemCategoryLink[]>();
    for (const link of linksRaw) {
      const list = linksByItem.get(link.itemId) ?? [];
      list.push(link);
      linksByItem.set(link.itemId, list);
    }

    for (const item of items) {
      const enrichment = enrichMap.get(item.id);
      const signal = signalByItem.get(item.id);
      const links = linksByItem.get(item.id) ?? [];
      const embedFailed = signal?.signalStatus === 'embed_failed';
      const meta = buildEnrichmentRowMetaForItem(enrichMap, signalByItem, linksByItem, item);
      const entry: HubScopeEntry = { item, enrichment, signal, links, embedFailed, meta };
      entries.push(entry);
      const label = meta.statusBadge.text;
      const labelList = byLabel.get(label) ?? [];
      labelList.push(entry);
      byLabel.set(label, labelList);
    }
    offset += items.length;
  }

  return { entries, byLabel };
}

function getOrBuildScopeEntries(store: IdbCompatStore, scope: HubScopeParams): HubScopeEntry[] {
  const key = scopeCacheKey(scope);
  if (_scopeEntryCache?.key === key) return _scopeEntryCache.entries;
  const { entries, byLabel } = scanHubScopeEntries(store, scope);
  _scopeEntryCache = { key, entries, byLabel };
  _filteredEntryCache = null;
  return entries;
}

function getFilteredScopeEntries(
  store: IdbCompatStore,
  scope: HubScopeParams,
  filters: HubPageFilters
): HubScopeEntry[] {
  const scopeKey = scopeCacheKey(scope);
  const filterKey = filterCacheKey(filters);
  if (_filteredEntryCache?.scopeKey === scopeKey && _filteredEntryCache.filterKey === filterKey) {
    return _filteredEntryCache.matches;
  }

  const hasSearch = !!(filters.search ?? '').trim();
  const trashOnly = !!filters.trashSuggestionsOnly;
  const label = filters.outcomeLabel ?? 'all';

  // Status-only filter: O(1) lookup from label index (built during counts scan).
  if (!hasSearch && !trashOnly && label !== 'all') {
    getOrBuildScopeEntries(store, scope);
    const matches = _scopeEntryCache?.byLabel.get(label) ?? [];
    _filteredEntryCache = { scopeKey, filterKey, matches };
    return matches;
  }

  const filterState = toHubFilterState(filters);
  const matches = getOrBuildScopeEntries(store, scope).filter((entry) =>
    enrichmentHubRowMatchesFilters(entryToRow(entry), filterState)
  );
  _filteredEntryCache = { scopeKey, filterKey, matches };
  return matches;
}

export type HubEnrichmentPageResult = {
  items: Item[];
  enrichments: ItemEnrichment[];
  signals: AiItemSignal[];
  links: AiItemCategoryLink[];
  total: number;
  done: boolean;
};

function pageResultFromEntries(
  entries: HubScopeEntry[],
  offset: number,
  limit: number
): HubEnrichmentPageResult {
  const off = Math.max(0, offset);
  const lim = Math.min(500, Math.max(1, limit));
  const pageEntries = entries.slice(off, off + lim);
  const pageItems = pageEntries.map((e) => e.item);
  return {
    items: pageItems,
    enrichments: pageEntries.flatMap((e) => (e.enrichment ? [e.enrichment] : [])),
    signals: pageEntries.flatMap((e) => (e.signal ? [e.signal] : [])),
    links: pageEntries.flatMap((e) => e.links),
    total: entries.length,
    done: off + pageEntries.length >= entries.length,
  };
}

function runHubEnrichmentFilteredPage(
  store: IdbCompatStore,
  offset: number,
  limit: number,
  scope: HubScopeParams,
  filters: HubPageFilters
): HubEnrichmentPageResult {
  const matches = getFilteredScopeEntries(store, scope, filters);
  return pageResultFromEntries(matches, offset, limit);
}

export function runHubEnrichmentPage(
  store: IdbCompatStore,
  offset: number,
  limit: number,
  scope: HubScopeParams,
  filters?: HubPageFilters
): HubEnrichmentPageResult {
  if (hubPageFiltersActive(filters)) {
    return runHubEnrichmentFilteredPage(store, offset, limit, scope, filters!);
  }

  const collections = store.getAllCollections();
  const lim = Math.min(500, Math.max(1, limit));
  const off = Math.max(0, offset);
  const { items, total } = store.getHubBookmarksPage(
    collections,
    scope.scopeProjectId,
    scope.scopeCollectionId,
    off,
    lim
  );
  const ids = items.map((i) => i.id);
  return {
    items,
    enrichments: store.getEnrichmentForItemIds(ids),
    signals: store.getSignalsForItemIds(ids),
    links: store.getLinksForItemIds(ids),
    total,
    done: off + items.length >= total,
  };
}

export function runHubEnrichmentCounts(
  store: IdbCompatStore,
  scope: HubScopeParams,
  search?: string
): { counts: EnrichmentHubCounts; chips: HubOutcomeChip[]; trashSuggestionCount: number } {
  const q = (search ?? '').trim().toLowerCase();
  const entries = getOrBuildScopeEntries(store, scope);
  const labelCounts = new Map<string, number>();
  const labelColors = new Map<string, string>();
  const metaByItemId = new Map<string, EnrichmentHubRowMeta>();
  const bookmarks: Item[] = [];
  let trashSuggestionCount = 0;

  for (const entry of entries) {
    if (q) {
      const title = (entry.item.title || '').toLowerCase();
      const url = (entry.item.url || '').toLowerCase();
      if (!title.includes(q) && !url.includes(q)) continue;
    }
    metaByItemId.set(entry.item.id, entry.meta);
    bookmarks.push(entry.item);
    const label = entry.meta.statusBadge.text;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    if (!labelColors.has(label)) labelColors.set(label, entry.meta.statusBadge.color);
    if (rowMatchesTrashSuggestion(entryToRow(entry))) trashSuggestionCount++;
  }

  return {
    counts: buildCountsFromMetaMap(bookmarks, metaByItemId),
    chips: buildHubOutcomeChipsFromLabelCounts(labelCounts, labelColors),
    trashSuggestionCount,
  };
}
