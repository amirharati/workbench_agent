import type { Item } from '../db';
import { getDB } from '../db';
import { assessCategorizationEligibility } from '../enrichment/categorizationEligibility';
import {
  bumpDiscoverFailureBucket,
  discoverStuckKind,
  emptyDiscoverRunSummary,
  isDiscoverFairGame,
} from '../categorization/discoverPolicy';
import { hasSpecificPrimaryTopic } from '../categorization/categorizationFairGame';
import { isGeneralLeafId } from '../categorization/taxonomyCatalog';
import { resolveEffectiveClassifyState } from '../categorization/counts';
import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  CategorizationQueueStats,
  DiscoverRunSummary,
} from '../categorization/types';
import type { ItemEnrichment } from '../enrichment/types';
import { isEnrichmentFailure } from '../enrichment/failureLabels';
import { subscribeToDataChanges } from '../dataChangeNotifier';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);
const CATALOG_TTL_MS = 8_000;

export type PipelineCatalog = {
  items: Item[];
  enrichByItem: Map<string, ItemEnrichment>;
  signalByItem: Map<string, AiItemSignal>;
  links: AiItemCategoryLink[];
  primaryByItem: Map<string, string>;
  categories: AiCategory[];
  categoryById: Map<string, AiCategory>;
  parentNameById: Map<string, string>;
};

let catalogCache: { at: number; catalog: PipelineCatalog } | null = null;

export function invalidatePipelineCatalog(): void {
  catalogCache = null;
}

subscribeToDataChanges(() => {
  invalidatePipelineCatalog();
});

export async function loadPipelineCatalogFresh(): Promise<PipelineCatalog> {
  const db = await getDB();
  const items = (await db.getAll('items')).filter(
    (i) => !!i.url?.trim() && i.deletedAt == null
  );
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];

  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source !== 'ai' || !l.isPrimary || !COUNTABLE_STATUSES.has(l.status)) continue;
    primaryByItem.set(l.itemId, l.categoryId);
  }

  return {
    items,
    enrichByItem: new Map(enrichments.map((e) => [e.itemId, e])),
    signalByItem: new Map(signals.map((s) => [s.itemId, s])),
    links,
    primaryByItem,
    categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    parentNameById: new Map(
      categories.filter((c) => c.kind === 'parent').map((c) => [c.id, c.name])
    ),
  };
}

export async function getPipelineCatalog(opts?: { force?: boolean }): Promise<PipelineCatalog> {
  const now = Date.now();
  if (!opts?.force && catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.catalog;
  }
  const { refreshPipelineCacheFromWorker } = await import('../db');
  await refreshPipelineCacheFromWorker();
  const catalog = await loadPipelineCatalogFresh();
  catalogCache = { at: now, catalog };
  return catalog;
}

export function computeCategorizationQueueStats(
  catalog: PipelineCatalog,
  taxonomy: { bulkModeActive: boolean; lastClassifyRun?: CategorizationQueueStats['lastClassifyRun']; lastDiscoverRun?: CategorizationQueueStats['lastDiscoverRun'] }
): CategorizationQueueStats {
  let pendingClassify = 0;
  let pendingReclassify = 0;
  let pendingDiscover = 0;
  let ineligible = 0;
  let skipped = 0;
  let classified = 0;
  let classifiedGeneral = 0;
  let manualReview = 0;
  let unassignedEligible = 0;

  for (const item of catalog.items) {
    const enrichment = catalog.enrichByItem.get(item.id);
    const signal = catalog.signalByItem.get(item.id);
    if (enrichment?.aiStatus !== 'ok' && !signal) continue;

    const primaryId = catalog.primaryByItem.get(item.id);
    const st = resolveEffectiveClassifyState({
      signalState: signal?.classifyState,
      primaryCategoryId: primaryId,
    });

    if (st === 'pending_classify') pendingClassify++;
    else if (st === 'pending_reclassify') pendingReclassify++;
    else if (st === 'pending_discover') pendingDiscover++;
    else if (st === 'ineligible') ineligible++;
    else if (st === 'skipped') skipped++;
    else if (
      st === 'classified' &&
      !isEnrichmentFailure(enrichment, signal?.signalStatus === 'embed_failed')
    ) {
      classified++;
    }
    else if (st === 'classified_general') classifiedGeneral++;
    else if (st === 'manual_review') manualReview++;

    const fairGame =
      (signal?.signalStatus === 'ok' || enrichment?.aiStatus === 'ok') &&
      st !== 'skipped' &&
      st !== 'ineligible' &&
      st !== 'manual_only' &&
      (st === 'pending_discover' ||
        st === 'pending_classify' ||
        st === 'pending_reclassify' ||
        st === 'classified_general' ||
        !primaryId ||
        (primaryId && isGeneralLeafId(primaryId)));
    if (fairGame && !hasSpecificPrimaryTopic(primaryId, st)) {
      unassignedEligible++;
    }
  }

  return {
    pendingClassify,
    pendingReclassify,
    pendingDiscover,
    ineligible,
    skipped,
    classified,
    classifiedGeneral,
    manualReview,
    unassignedEligible,
    leafCount: catalog.categories.filter((c) => c.kind === 'leaf').length,
    parentCount: catalog.categories.filter((c) => c.kind === 'parent').length,
    bulkModeActive: taxonomy.bulkModeActive,
    lastClassifyRun: taxonomy.lastClassifyRun,
    lastDiscoverRun: taxonomy.lastDiscoverRun,
  };
}

export function computeDiscoverPoolStats(
  catalog: PipelineCatalog,
  itemIds?: string[]
): DiscoverRunSummary {
  const scopeIds = itemIds?.length ? new Set(itemIds) : null;
  const summary = emptyDiscoverRunSummary();

  for (const item of catalog.items) {
    if (scopeIds && !scopeIds.has(item.id)) continue;
    summary.totalConsidered++;

    const enrichment = catalog.enrichByItem.get(item.id);
    const hints = { aiTags: enrichment?.aiTags };
    const eligibility = assessCategorizationEligibility(item, enrichment, hints);

    if (!eligibility.eligible) {
      summary.skippedIneligible++;
      summary.failureBuckets = bumpDiscoverFailureBucket(summary.failureBuckets, 'ineligible');
      continue;
    }

    summary.eligiblePool++;
    const prev = catalog.signalByItem.get(item.id);
    const st = prev?.classifyState;
    const primaryId = catalog.primaryByItem.get(item.id);
    const stuckKind = discoverStuckKind(st, primaryId);
    if (stuckKind) summary.stuckKindBreakdown[stuckKind]++;
    if (st === 'manual_review') summary.skippedManualReview++;

    if (
      !isDiscoverFairGame({
        eligible: true,
        classifyState: st,
        primaryCategoryId: primaryId,
        stuckOnly: true,
      })
    ) {
      if (st === 'classified') summary.skippedNotStuck++;
      continue;
    }

    const summaryText =
      enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '';
    const title = (item.title || '').trim();
    if (summaryText.length < 40 && title.length < 40) {
      summary.skippedTooShort++;
      continue;
    }
    summary.stuckPool++;
  }

  return summary;
}
