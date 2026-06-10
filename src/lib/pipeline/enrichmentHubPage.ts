import { dbRpc } from '../storage/dbClient';
import { isDbWorkerProcess } from '../storage/dbWorker/env';
import { getDB } from '../db';
import type { AiItemCategoryLink } from '../categorization/types';
import {
  buildEnrichmentRowMetaForItem,
  enrichmentHubRowFields,
  type EnrichmentHubCounts,
  type EnrichmentHubRow,
  type HubOutcomeChip,
} from './pipelineHubQueries';
import type { HubEnrichmentPageResult, HubPageFilters, HubScopeParams } from './enrichmentHubWorkerLogic';
import {
  invalidateHubScopeEntryCache,
  runHubEnrichmentCounts,
  runHubEnrichmentPage,
} from './enrichmentHubWorkerLogic';

export const HUB_RPC_PAGE_SIZE = 100;

export type FetchHubPageOpts = HubScopeParams & {
  offset: number;
  limit?: number;
  filters?: HubPageFilters;
};

function toRpcFilters(filters?: HubPageFilters): HubPageFilters | undefined {
  if (!filters) return undefined;
  return {
    outcomeLabel: filters.outcomeLabel ?? 'all',
    search: filters.search ?? '',
    trashSuggestionsOnly: !!filters.trashSuggestionsOnly,
  };
}

function buildRowsFromPageData(data: HubEnrichmentPageResult): EnrichmentHubRow[] {
  const enrichMap = new Map(data.enrichments.map((e) => [e.itemId, e]));
  const signalByItem = new Map(data.signals.map((s) => [s.itemId, s]));
  const linksByItem = new Map<string, AiItemCategoryLink[]>();
  for (const link of data.links) {
    const list = linksByItem.get(link.itemId) ?? [];
    list.push(link);
    linksByItem.set(link.itemId, list);
  }
  return data.items.map((item) => {
    const enrichment = enrichMap.get(item.id);
    const signal = signalByItem.get(item.id);
    const embedFailed = signal?.signalStatus === 'embed_failed';
    const meta = buildEnrichmentRowMetaForItem(enrichMap, signalByItem, linksByItem, item);
    const itemLinks = linksByItem.get(item.id) ?? [];
    return {
      item,
      enrichment,
      embedFailed,
      meta,
      ...enrichmentHubRowFields(signal, itemLinks),
    };
  });
}

/** One page of hub rows from worker SQL — no full-table tab hydrate. */
export async function fetchEnrichmentHubPage(
  opts: FetchHubPageOpts
): Promise<{ rows: EnrichmentHubRow[]; total: number; done: boolean }> {
  const limit = opts.limit ?? HUB_RPC_PAGE_SIZE;
  const scope: HubScopeParams = {
    scopeProjectId: opts.scopeProjectId,
    scopeCollectionId: opts.scopeCollectionId,
  };
  const filters = toRpcFilters(opts.filters);

  if (isDbWorkerProcess()) {
    const store = await getDB();
    const data = runHubEnrichmentPage(store, opts.offset, limit, scope, filters);
    return { rows: buildRowsFromPageData(data), total: data.total, done: data.done };
  }

  const data = await dbRpc<HubEnrichmentPageResult>('hubEnrichmentPage', [
    opts.offset,
    limit,
    scope,
    filters ?? null,
  ]);
  return { rows: buildRowsFromPageData(data), total: data.total, done: data.done };
}

export type HubEnrichmentCountsResult = {
  counts: EnrichmentHubCounts;
  chips: HubOutcomeChip[];
  /** Scope-wide trash candidates; ignores outcome label filter. */
  trashSuggestionCount: number;
};

/** Chip counts computed in worker (batched scan, no rows sent to tab). */
export async function fetchEnrichmentHubCounts(
  scope: HubScopeParams,
  search?: string
): Promise<HubEnrichmentCountsResult> {
  if (isDbWorkerProcess()) {
    const store = await getDB();
    return runHubEnrichmentCounts(store, scope, search);
  }
  return dbRpc('hubEnrichmentCounts', [scope, search ?? '']);
}

/** Clear worker meta cache (after enrichment/import mutations). */
export function invalidateHubScopeCache(): void {
  if (isDbWorkerProcess()) {
    invalidateHubScopeEntryCache();
    return;
  }
  void dbRpc('hubInvalidateScopeCache', []);
}
