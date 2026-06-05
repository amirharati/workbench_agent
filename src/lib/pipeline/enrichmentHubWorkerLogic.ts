import type { Item } from '../db';
import type { IdbCompatStore } from '../storage/sqlite/store';
import type { ItemEnrichment } from '../enrichment/types';
import type { AiItemCategoryLink, AiItemSignal } from '../categorization/types';
import {
  buildCountsFromMetaMap,
  buildEnrichmentRowMetaForItem,
  buildHubOutcomeChipsFromLabelCounts,
  type EnrichmentHubCounts,
  type HubOutcomeChip,
} from './pipelineHubQueries';

export type HubScopeParams = {
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
};

export type HubEnrichmentPageResult = {
  items: Item[];
  enrichments: ItemEnrichment[];
  signals: AiItemSignal[];
  links: AiItemCategoryLink[];
  total: number;
  done: boolean;
};

const HUB_COUNTS_BATCH = 500;

export function runHubEnrichmentPage(
  store: IdbCompatStore,
  offset: number,
  limit: number,
  scope: HubScopeParams
): HubEnrichmentPageResult {
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
): { counts: EnrichmentHubCounts; chips: HubOutcomeChip[] } {
  const collections = store.getAllCollections();
  const total = store.countHubBookmarks(
    collections,
    scope.scopeProjectId,
    scope.scopeCollectionId
  );
  const q = (search ?? '').trim().toLowerCase();
  const labelCounts = new Map<string, number>();
  const labelColors = new Map<string, string>();
  const metaByItemId = new Map<string, ReturnType<typeof buildEnrichmentRowMetaForItem>>();
  const bookmarks: Item[] = [];

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
      if (q) {
        const title = (item.title || '').toLowerCase();
        const url = (item.url || '').toLowerCase();
        if (!title.includes(q) && !url.includes(q)) continue;
      }
      const meta = buildEnrichmentRowMetaForItem(enrichMap, signalByItem, linksByItem, item);
      metaByItemId.set(item.id, meta);
      bookmarks.push(item);
      const label = meta.statusBadge.text;
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      if (!labelColors.has(label)) labelColors.set(label, meta.statusBadge.color);
    }
    offset += items.length;
  }

  return {
    counts: buildCountsFromMetaMap(bookmarks, metaByItemId),
    chips: buildHubOutcomeChipsFromLabelCounts(labelCounts, labelColors),
  };
}
