import { loadAISettings } from '../ai/settings';
import type { Item } from '../db';
import { notifyDataChanged } from '../dataChangeNotifier';
import { getDB } from '../db';
import type { ItemEnrichment } from '../enrichment/types';
import { assessCategorizationEligibility } from '../enrichment/categorizationEligibility';
import { buildCategorizationText } from '../enrichment/categorizationText';
import { applyCountsToCategories, linkCountsForCategories, resolveEffectiveClassifyState } from './counts';
import {
  getAssignableLeaves,
  getParentsFromCategories,
  isGeneralLeafId,
} from './taxonomyCatalog';
import {
  callTopicExtractBatch,
  chunkClassifyBatch,
  retryMissingTopicExtract,
  topicExtractBatchSize,
  topicRowToDecision,
  type ClassifyBatchItem,
} from './topicExtract';
import { chunk } from './parseReview';
import {
  hasSpecificPrimaryTopic,
  itemNeedsClassify,
} from './categorizationFairGame';
import { hashText } from './textHash';
import { getTaxonomyState, saveTaxonomyState, shouldTriggerDiscover } from './taxonomyState';
import {
  mergeDiscoveryTaxonomy,
  promoteProposedLeaf,
  type DiscoverSampleItem,
} from './discoverTaxonomy';
import { getBundledSeedDocument, seedDocumentToCategories } from './seedImport';
import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  AiTaxonomyState,
  ClassifyIncrementalOptions,
  ClassifyProgressUpdate,
  ClassifyState,
  DiscoverBatchResult,
  CategorizationQueueStats,
  ScopedCategorizationStats,
  TopicClassifyResult,
  DiscoverRunSummary,
} from './types';
import { syncClassifySignalsFromLinks } from '../enrichment/pipelineReset';
import { aiLinkId } from './service';
import {
  applyClassifyRetryPolicy,
  bumpFailureBucket,
  emptyTopicClassifySummary,
  shouldSkipClassify,
} from './classifyPolicy';
import {
  classifyOutcomeReason,
  formatClassifySkipReason,
} from './classifyQueueReason';
import {
  bumpDiscoverFailureBucket,
  callDiscoveryBatchWithRetry,
  DEFAULT_DISCOVER_BATCH_SIZE,
  discoverSamplePriority,
  discoverStuckKind,
  emptyDiscoverRunSummary,
  isDiscoverFairGame,
  MIN_DISCOVER_POOL,
  shouldMarkReclassifyAfterDiscover,
} from './discoverPolicy';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);

function reportProgress(opts: ClassifyIncrementalOptions, update: ClassifyProgressUpdate) {
  opts.onProgress?.(update);
}

export { isFairGameForCategorization, itemNeedsClassify } from './categorizationFairGame';

export async function getScopedCategorizationStats(
  itemIds: string[]
): Promise<ScopedCategorizationStats> {
  const stats: ScopedCategorizationStats = {
    inScope: itemIds.length,
    aiReady: 0,
    categorized: 0,
    needsClassify: 0,
    ineligible: 0,
    readyItemIds: [],
  };
  if (!itemIds.length) return stats;

  const db = await getDB();
  const idSet = new Set(itemIds);
  const items = (await db.getAll('items')).filter((i) => idSet.has(i.id));
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const primaryCategoryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
      primaryCategoryByItem.set(l.itemId, l.categoryId);
    }
  }

  for (const item of items) {
    const enrichment = enrichByItem.get(item.id);
    if (enrichment?.aiStatus === 'ok') stats.aiReady++;
    const built = await buildClassifyBatchItem(item, enrichment);
    if (!built.eligible) {
      stats.ineligible++;
      continue;
    }
    const prev = signalByItem.get(item.id);
    const st = prev?.classifyState;
    const hashMatch = prev?.classifyTextHash === built.hash;
    const primaryId = primaryCategoryByItem.get(item.id);
    if (hasSpecificPrimaryTopic(primaryId, st)) stats.categorized++;
    if (itemNeedsClassify(st, primaryId, hashMatch, true)) {
      stats.needsClassify++;
      stats.readyItemIds.push(item.id);
    }
  }

  return stats;
}

async function yieldToUi() {
  await new Promise<void>((r) => setTimeout(r, 0));
}

function assignmentsFromCategoryIds(categoryIds: string[]): Array<{
  categoryId: string;
  score: number;
  isPrimary: boolean;
}> {
  return categoryIds.map((categoryId, i) => ({
    categoryId,
    score: 0.9 - i * 0.02,
    isPrimary: i === 0,
  }));
}

async function buildClassifyBatchItem(
  item: Item,
  enrichment: ItemEnrichment | undefined
): Promise<{
  batch: ClassifyBatchItem | null;
  eligible: boolean;
  classifyText: string;
  hash: string;
  eligibilityReason?: string;
  qualityTier?: 'high' | 'medium' | 'low';
}> {
  const hints = { aiTags: enrichment?.aiTags };
  const eligibility = assessCategorizationEligibility(item, enrichment, hints);
  if (!eligibility.eligible) {
    return {
      batch: null,
      eligible: false,
      classifyText: '',
      hash: '',
      eligibilityReason: eligibility.reason,
    };
  }
  const classifyText = buildCategorizationText(item, enrichment, {
    includeSnippet: false,
    ...hints,
  });
  const hash = await hashText(classifyText);
  return {
    eligible: true,
    classifyText,
    hash,
    qualityTier: eligibility.qualityTier,
    batch: {
      itemId: item.id,
      title: item.title,
      textForClassification: classifyText,
      enrichmentAiTags: enrichment?.aiTags,
    },
  };
}

export async function getCategorizationQueueStats(): Promise<CategorizationQueueStats> {
  await ensurePendingClassifySignals();
  const db = await getDB();
  const state = await getTaxonomyState();
  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const items = (await db.getAll('items')).filter((i) => !!i.url?.trim());

  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source !== 'ai' || !l.isPrimary || !COUNTABLE_STATUSES.has(l.status)) continue;
    primaryByItem.set(l.itemId, l.categoryId);
  }

  let pendingClassify = 0;
  let pendingReclassify = 0;
  let pendingDiscover = 0;
  let ineligible = 0;
  let skipped = 0;
  let classified = 0;
  let classifiedGeneral = 0;
  let manualReview = 0;
  let unassignedEligible = 0;

  for (const item of items) {
    const enrichment = enrichByItem.get(item.id);
    const signal = signalByItem.get(item.id);
    if (enrichment?.aiStatus !== 'ok' && !signal) continue;

    const primaryId = primaryByItem.get(item.id);
    const st = resolveEffectiveClassifyState({
      signalState: signal?.classifyState,
      primaryCategoryId: primaryId,
    });

    if (st === 'pending_classify') pendingClassify++;
    else if (st === 'pending_reclassify') pendingReclassify++;
    else if (st === 'pending_discover') pendingDiscover++;
    else if (st === 'ineligible') ineligible++;
    else if (st === 'skipped') skipped++;
    else if (st === 'classified') classified++;
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
    leafCount: categories.filter((c) => c.kind === 'leaf').length,
    parentCount: categories.filter((c) => c.kind === 'parent').length,
    bulkModeActive: state.bulkModeActive,
    lastClassifyRun: state.lastClassifyRun,
    lastDiscoverRun: state.lastDiscoverRun,
  };
}

/** Preview discover gap-fill pool (stuck general/unassigned) without LLM. */
export async function getDiscoverPoolStats(itemIds?: string[]): Promise<DiscoverRunSummary> {
  const db = await getDB();
  const scopeIds = itemIds?.length ? new Set(itemIds) : null;
  const items = await db.getAll('items');
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const primaryCategoryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
      primaryCategoryByItem.set(l.itemId, l.categoryId);
    }
  }

  const summary = emptyDiscoverRunSummary();
  for (const item of items) {
    if (scopeIds && !scopeIds.has(item.id)) continue;
    summary.totalConsidered++;
    const enrichment = enrichByItem.get(item.id);
    const built = await buildClassifyBatchItem(item, enrichment);
    if (!built.eligible) {
      summary.skippedIneligible++;
      summary.failureBuckets = bumpDiscoverFailureBucket(summary.failureBuckets, 'ineligible');
      continue;
    }
    summary.eligiblePool++;
    const prev = signalByItem.get(item.id);
    const st = prev?.classifyState;
    const primaryId = primaryCategoryByItem.get(item.id);
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
    const text = built.classifyText.trim() || summaryText || (item.title || '').trim();
    if (text.length < 40 && summaryText.length < 40) {
      summary.skippedTooShort++;
      continue;
    }
    summary.stuckPool++;
  }
  return summary;
}

export async function markItemsPendingClassify(itemIds: string[]): Promise<void> {
  if (!itemIds.length) return;
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return;

  const primaryCategoryByItem = new Map<string, string>();
  if (db.objectStoreNames.contains('ai_item_category_links')) {
    const links = await db.getAll('ai_item_category_links');
    for (const l of links) {
      if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
        primaryCategoryByItem.set(l.itemId, l.categoryId);
      }
    }
  }

  const now = Date.now();
  const tx = db.transaction(['ai_item_signals'], 'readwrite');
  for (const itemId of itemIds) {
    const prev = await tx.objectStore('ai_item_signals').get(itemId);
    if (
      hasSpecificPrimaryTopic(primaryCategoryByItem.get(itemId), prev?.classifyState)
    ) {
      continue;
    }
    const next: AiItemSignal = {
      ...prev,
      itemId,
      textHash: prev?.textHash ?? '',
      classifyTextHash: prev?.classifyTextHash ?? '',
      embeddingModel: prev?.embeddingModel ?? '',
      embedding: prev?.embedding ?? [],
      derivedTags: prev?.derivedTags ?? [],
      signalStatus: 'ok',
      classifyState: 'pending_classify',
      discoverState: prev?.discoverState ?? 'none',
      isNovelty: prev?.isNovelty ?? false,
      eligibilityReason: undefined,
      lastClassifySkipReason: undefined,
      lastProcessedAt: now,
    };
    await tx.objectStore('ai_item_signals').put(next);
  }
  await tx.done;
}

/** Reset stale ineligible signals when enrichment now passes the quality gate. */
export async function reconcileStaleIneligibleSignals(): Promise<number> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return 0;

  const signals = await db.getAll('ai_item_signals');
  const stale = signals.filter((s) => s.classifyState === 'ineligible');
  if (!stale.length) return 0;

  const items = await db.getAll('items');
  const itemById = new Map(items.map((i) => [i.id, i]));
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source !== 'ai' || !l.isPrimary || !COUNTABLE_STATUSES.has(l.status)) continue;
    primaryByItem.set(l.itemId, l.categoryId);
  }

  const now = Date.now();
  let updated = 0;
  for (const sig of stale) {
    const item = itemById.get(sig.itemId);
    if (!item?.url?.trim()) continue;
    const primaryId = primaryByItem.get(sig.itemId);
    if (hasSpecificPrimaryTopic(primaryId, sig.classifyState)) continue;

    const enrichment = enrichByItem.get(sig.itemId);
    const eligibility = assessCategorizationEligibility(item, enrichment);
    if (!eligibility.eligible) continue;

    await db.put('ai_item_signals', {
      ...sig,
      signalStatus: 'ok',
      classifyState: 'pending_classify',
      eligibilityReason: undefined,
      lastClassifySkipReason: undefined,
      lastProcessedAt: now,
    });
    updated++;
  }

  if (updated > 0) notifyDataChanged('categorization.update');
  return updated;
}

/** Move legacy LLM-skipped items (no specific topic) into the discover queue. */
export async function reconcileSkippedToPendingDiscover(): Promise<number> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return 0;

  const signals = await db.getAll('ai_item_signals');
  const legacySkipped = signals.filter((s) => s.classifyState === 'skipped');
  if (!legacySkipped.length) return 0;

  const items = await db.getAll('items');
  const itemById = new Map(items.map((i) => [i.id, i]));
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source !== 'ai' || !l.isPrimary || !COUNTABLE_STATUSES.has(l.status)) continue;
    primaryByItem.set(l.itemId, l.categoryId);
  }

  const now = Date.now();
  let updated = 0;
  const tx = db.transaction(['ai_item_signals'], 'readwrite');
  for (const sig of legacySkipped) {
    const primaryId = primaryByItem.get(sig.itemId);
    if (hasSpecificPrimaryTopic(primaryId, sig.classifyState)) continue;
    const item = itemById.get(sig.itemId);
    if (!item) continue;
    const enrichment = enrichByItem.get(sig.itemId);
    if (enrichment?.aiStatus !== 'ok') continue;

    await tx.objectStore('ai_item_signals').put({
      ...sig,
      classifyState: 'pending_discover',
      discoverState: 'pending',
      isNovelty: true,
      lastClassifySkipReason: formatClassifySkipReason('pending_discover'),
      lastProcessedAt: now,
    });
    updated++;
  }
  await tx.done;
  if (updated > 0) notifyDataChanged('categorization.update');
  return updated;
}

/** After classify found no topic, ensure state is pending_discover (not stuck on pending_classify). */
export async function reconcileUnassignedAfterClassify(): Promise<number> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return 0;

  const signals = await db.getAll('ai_item_signals');
  const candidates = signals.filter((s) => s.classifyState === 'pending_classify');
  if (!candidates.length) return 0;

  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source !== 'ai' || !l.isPrimary || !COUNTABLE_STATUSES.has(l.status)) continue;
    primaryByItem.set(l.itemId, l.categoryId);
  }

  const now = Date.now();
  let updated = 0;
  const tx = db.transaction(['ai_item_signals'], 'readwrite');
  for (const sig of candidates) {
    const primaryId = primaryByItem.get(sig.itemId);
    if (hasSpecificPrimaryTopic(primaryId, sig.classifyState)) continue;
    const enrichment = enrichByItem.get(sig.itemId);
    if (enrichment?.aiStatus !== 'ok') continue;
    const classifyAttempted = !!(
      sig.lastClassifiedAt ||
      sig.llmReview ||
      sig.lastClassifySkipReason
    );
    if (!classifyAttempted) continue;

    await tx.objectStore('ai_item_signals').put({
      ...sig,
      classifyState: 'pending_discover',
      discoverState: 'pending',
      isNovelty: true,
      lastClassifySkipReason: formatClassifySkipReason('pending_discover'),
      lastProcessedAt: now,
    });
    updated++;
  }
  await tx.done;
  if (updated > 0) notifyDataChanged('categorization.update');
  return updated;
}

/**
 * Backfill classify signals for AI-ready bookmarks with no topic yet.
 * Covers restore/import paths that skipped putEnrichment → markItemsPendingClassify.
 */
export async function ensurePendingClassifySignals(): Promise<number> {
  const reconciledIneligible = await reconcileStaleIneligibleSignals();
  const reconciledSkipped = await reconcileSkippedToPendingDiscover();
  const reconciledUnassigned = await reconcileUnassignedAfterClassify();
  const db = await getDB();
  if (!db.objectStoreNames.contains('item_enrichment')) return 0;

  const items = (await db.getAll('items')).filter((i) => !!i.url?.trim());
  const enrichments = await db.getAll('item_enrichment');
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const signalIds = new Set(signals.map((s) => s.itemId));
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source !== 'ai' || !l.isPrimary || !COUNTABLE_STATUSES.has(l.status)) continue;
    primaryByItem.set(l.itemId, l.categoryId);
  }

  const toMark: string[] = [];
  for (const item of items) {
    const enrichment = enrichByItem.get(item.id);
    if (enrichment?.aiStatus !== 'ok') continue;
    if (signalIds.has(item.id)) continue;
    const primaryId = primaryByItem.get(item.id);
    if (hasSpecificPrimaryTopic(primaryId, undefined)) continue;
    toMark.push(item.id);
  }

  if (toMark.length) await markItemsPendingClassify(toMark);
  return reconciledIneligible + reconciledSkipped + reconciledUnassigned + toMark.length;
}

export async function importSeedTaxonomy(replaceExisting = true): Promise<{
  parents: number;
  leaves: number;
  taxonomyVersion: number;
}> {
  const doc = getBundledSeedDocument();
  const rows = seedDocumentToCategories(doc);
  const db = await getDB();

  const tx = db.transaction(['ai_categories', 'ai_taxonomy_state'], 'readwrite');
  if (replaceExisting) {
    const existing = await tx.objectStore('ai_categories').getAll();
    for (const c of existing) {
      await tx.objectStore('ai_categories').delete(c.id);
    }
  }
  for (const row of rows) {
    await tx.objectStore('ai_categories').put(row);
  }
  await tx.done;

  await saveTaxonomyState({
    taxonomyVersion: doc.taxonomyVersion,
    lastClassifyAt: undefined,
    bulkModeActive: false,
    bulkDiscoverRuns: 0,
  });
  notifyDataChanged('categorization.update');

  return {
    parents: doc.parents.length,
    leaves: doc.leaves.length,
    taxonomyVersion: doc.taxonomyVersion,
  };
}

async function persistClassifyResults(
  categories: AiCategory[],
  itemWrites: Array<{
    itemId: string;
    signal: AiItemSignal;
    links: AiItemCategoryLink[];
    removeAiSuggested: boolean;
  }>
): Promise<AiCategory[]> {
  const db = await getDB();
  const now = Date.now();
  const allLinks = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];

  const tx = db.transaction(
    ['ai_categories', 'ai_item_category_links', 'ai_item_signals'],
    'readwrite'
  );

  for (const w of itemWrites) {
    if (w.removeAiSuggested) {
      const existing = await tx
        .objectStore('ai_item_category_links')
        .index('by-item')
        .getAll(w.itemId);
      for (const link of existing) {
        if (link.source === 'ai' && link.status === 'suggested') {
          await tx.objectStore('ai_item_category_links').delete(link.id);
        }
      }
    }
    for (const link of w.links) {
      await tx.objectStore('ai_item_category_links').put(link);
    }
    await tx.objectStore('ai_item_signals').put(w.signal);
  }

  const linkSnapshot = [...allLinks];
  for (const w of itemWrites) {
    if (w.removeAiSuggested) {
      const idx = linkSnapshot.findIndex(
        (l) => l.itemId === w.itemId && l.source === 'ai' && l.status === 'suggested'
      );
      while (idx >= 0) {
        linkSnapshot.splice(idx, 1);
        const nextIdx = linkSnapshot.findIndex(
          (l) => l.itemId === w.itemId && l.source === 'ai' && l.status === 'suggested'
        );
        if (nextIdx < 0) break;
      }
    }
    linkSnapshot.push(...w.links);
  }

  const counts = linkCountsForCategories(categories, linkSnapshot);
  const updated = applyCountsToCategories(categories, counts, now);
  for (const cat of updated) {
    await tx.objectStore('ai_categories').put(cat);
  }

  await tx.done;
  notifyDataChanged('categorization.update');
  return updated;
}

export async function classifyIncremental(
  opts: ClassifyIncrementalOptions = {}
): Promise<TopicClassifyResult> {
  reportProgress(opts, {
    phase: 'prepare',
    label: 'Preparing…',
    current: 0,
    total: 1,
  });
  await yieldToUi();

  const db = await getDB();
  const aiSettings = await loadAISettings();
  if (!aiSettings.apiKey.trim()) {
    throw new Error('Missing API key. Add one in Settings → AI.');
  }

  let categories = await db.getAll('ai_categories');
  const leaves = getAssignableLeaves(categories);
  if (!leaves.length) {
    throw new Error('No taxonomy loaded. Import seed taxonomy first.');
  }

  const parents = getParentsFromCategories(categories);
  const categoryIds = new Set(categories.map((c) => c.id));
  const leafById = new Map(categories.map((c) => [c.id, c]));

  let items = await db.getAll('items');
  if (opts.itemIds?.length) {
    const idSet = new Set(opts.itemIds);
    items = items.filter((i) => idSet.has(i.id));
  }

  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));
  const allLinks = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const primaryCategoryByItem = new Map<string, string>();
  for (const l of allLinks) {
    if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
      primaryCategoryByItem.set(l.itemId, l.categoryId);
    }
  }

  const toProcess: Array<{
    item: Item;
    batch: ClassifyBatchItem;
    hash: string;
    qualityTier?: 'high' | 'medium' | 'low';
  }> = [];
  const gateWrites: Array<{ itemId: string; signal: AiItemSignal }> = [];
  const summary = emptyTopicClassifySummary();

  for (const item of items) {
    summary.totalConsidered++;
    const enrichment = enrichByItem.get(item.id);
    const built = await buildClassifyBatchItem(item, enrichment);
    const prev = signalByItem.get(item.id);
    const st = prev?.classifyState;
    const primaryId = primaryCategoryByItem.get(item.id);

    if (!built.eligible || !built.batch) {
      summary.skippedIneligible++;
      summary.failureBuckets = bumpFailureBucket(
        summary.failureBuckets,
        built.eligibilityReason?.split('(')[0]?.trim() || 'ineligible'
      );
      const now = Date.now();
      gateWrites.push({
        itemId: item.id,
        signal: {
          itemId: item.id,
          textHash: prev?.textHash ?? '',
          classifyTextHash: prev?.classifyTextHash ?? '',
          embeddingModel: prev?.embeddingModel ?? '',
          embedding: prev?.embedding ?? [],
          derivedTags: prev?.derivedTags ?? [],
          signalStatus: 'insufficient_enrichment',
          classifyState: 'ineligible',
          discoverState: 'none',
          isNovelty: false,
          eligibilityReason: built.eligibilityReason,
          lastClassifySkipReason:
            built.eligibilityReason ?? formatClassifySkipReason('quality_gate'),
          lastProcessedAt: now,
          classifyRetryCount: prev?.classifyRetryCount ?? 0,
        },
      });
      continue;
    }

    if (built.qualityTier) {
      summary.inputQuality[built.qualityTier]++;
    }

    const hashMatch = prev?.classifyTextHash === built.hash;
    const skipDecision = shouldSkipClassify({
      classifyState: st,
      primaryCategoryId: primaryId,
      hashMatch,
      eligible: true,
      forceReclassify: opts.forceReclassify,
      retryManualReview: opts.retryManualReview,
    });

    if (skipDecision.markPendingReclassify && prev && st === 'classified') {
      const now = Date.now();
      gateWrites.push({
        itemId: item.id,
        signal: {
          ...prev,
          itemId: item.id,
          classifyState: 'pending_reclassify',
          lastClassifySkipReason: 'Bookmark text changed — queued for reclassify',
          lastProcessedAt: now,
        },
      });
    }

    if (skipDecision.skip) {
      if (skipDecision.reason === 'unchanged_hash_specific' || skipDecision.reason === 'unchanged_hash_skipped') {
        summary.skippedHash++;
      } else if (skipDecision.reason === 'manual_review') {
        summary.skippedManualReview++;
      }
      if (prev) {
        gateWrites.push({
          itemId: item.id,
          signal: {
            ...prev,
            itemId: item.id,
            lastClassifySkipReason: formatClassifySkipReason(skipDecision.reason),
            lastProcessedAt: Date.now(),
          },
        });
      }
      continue;
    }

    if (
      !itemNeedsClassify(
        skipDecision.markPendingReclassify ? 'pending_reclassify' : st,
        primaryId,
        hashMatch,
        true,
        opts.forceReclassify,
        opts.retryManualReview
      )
    ) {
      summary.skippedHash++;
      if (prev) {
        gateWrites.push({
          itemId: item.id,
          signal: {
            ...prev,
            itemId: item.id,
            lastClassifySkipReason: formatClassifySkipReason('unchanged_hash_specific'),
            lastProcessedAt: Date.now(),
          },
        });
      }
      continue;
    }

    toProcess.push({
      item,
      batch: built.batch,
      hash: built.hash,
      qualityTier: built.qualityTier,
    });
    if (opts.maxItems && toProcess.length >= opts.maxItems) break;
  }

  if (gateWrites.length) {
    const db = await getDB();
    const tx = db.transaction(['ai_item_signals'], 'readwrite');
    for (const w of gateWrites) {
      await tx.objectStore('ai_item_signals').put(w.signal);
    }
    await tx.done;
  }

  if (!toProcess.length) {
    const runAt = Date.now();
    await saveTaxonomyState({
      lastClassifyAt: runAt,
      lastClassifyRun: { at: runAt, summary },
    });
    reportProgress(opts, {
      phase: 'done',
      label: `Nothing to classify (${summary.skippedHash} unchanged · ${summary.skippedIneligible} ineligible · ${summary.skippedManualReview} manual review)`,
      current: 0,
      total: 0,
    });
    return { summary, categories };
  }

  const batchSize = topicExtractBatchSize(leaves.length, opts.reviewBatchSize ?? 12);
  const batches = chunkClassifyBatch(
    toProcess.map((x) => x.batch),
    batchSize
  );

  reportProgress(opts, {
    phase: 'prepare',
    label: `Classifying ${toProcess.length} items in ${batches.length} LLM batch(es)…`,
    current: 0,
    total: batches.length,
  });
  await yieldToUi();

  const itemWrites: Array<{
    itemId: string;
    signal: AiItemSignal;
    links: AiItemCategoryLink[];
    removeAiSuggested: boolean;
  }> = [];

  const now = Date.now();

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    summary.batches++;
    reportProgress(opts, {
      phase: 'classify',
      label: `LLM topic-extract batch ${batchIdx + 1}/${batches.length} (${batch.length} items)…`,
      current: batchIdx,
      total: batches.length,
    });
    await yieldToUi();
    const resp = await callTopicExtractBatch(aiSettings, categories, batch, parents);
    const normalized = new Map<string, ReturnType<typeof topicRowToDecision>>();

    if (resp.ok && resp.rows) {
      for (const row of resp.rows) {
        const d = topicRowToDecision(row, categoryIds, leafById);
        if (d) normalized.set(d.itemId, d);
      }
      const missing = batch.filter((i) => !normalized.has(i.itemId));
      if (missing.length) {
        const retried = await retryMissingTopicExtract(
          aiSettings,
          categories,
          missing,
          categoryIds,
          leafById,
          parents
        );
        for (const d of retried) normalized.set(d.itemId, d);
      }
    } else if (batch.length > 1) {
      for (const single of batch) {
        const one = await callTopicExtractBatch(aiSettings, categories, [single], parents);
        if (one.ok && one.rows?.length) {
          const d = topicRowToDecision(one.rows[0], categoryIds, leafById);
          if (d) normalized.set(d.itemId, d);
        } else {
          summary.llmErrors++;
          normalized.set(single.itemId, {
            itemId: single.itemId,
            decisionType: 'none',
            reason: one.error ?? resp.error,
            status: 'error',
          });
        }
      }
    } else {
      summary.llmErrors++;
      normalized.set(batch[0].itemId, {
        itemId: batch[0].itemId,
        decisionType: 'none',
        reason: resp.error,
        status: 'error',
      });
    }

    for (const batchItem of batch) {
      summary.processed++;
      const meta = toProcess.find((x) => x.batch.itemId === batchItem.itemId);
      const hash = meta?.hash ?? '';
      const decision = normalized.get(batchItem.itemId);
      const prevSignal = signalByItem.get(batchItem.itemId);
      const prevRetry = prevSignal?.classifyRetryCount ?? 0;

      let classifyState: ClassifyState = 'pending_classify';
      const links: AiItemCategoryLink[] = [];
      const removeAiSuggested = true;
      let retryCount = prevRetry;
      let lastClassifySkipReason: string | undefined;

      if (!decision || decision.status === 'error') {
        const retry = applyClassifyRetryPolicy(prevRetry, 'error');
        classifyState = retry.nextState;
        retryCount = retry.nextRetryCount;
        summary.llmErrors++;
        summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'llm_error');
        if (retry.routedToManualReview) {
          summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'manual_review_error');
        }
        lastClassifySkipReason = classifyOutcomeReason('error', {
          routedToManualReview: retry.routedToManualReview,
          llmReason: decision?.reason,
        });
      } else if (decision.decisionType === 'none' && !decision.categoryIds?.length) {
        // No matching topic → discover gap-fill (never terminal "skipped" for valid AI-ready items).
        const retry = applyClassifyRetryPolicy(prevRetry, 'unassigned');
        classifyState = retry.nextState;
        retryCount = retry.nextRetryCount;
        summary.unassigned++;
        if (retry.routedToManualReview) {
          summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'manual_review_unassigned');
        } else {
          summary.pendingDiscover++;
        }
        lastClassifySkipReason = classifyOutcomeReason('unassigned', {
          routedToManualReview: retry.routedToManualReview,
          llmReason: decision.reason,
        });
      } else if (decision.decisionType === 'existing' && decision.categoryIds?.length) {
        const assignments = assignmentsFromCategoryIds(decision.categoryIds);
        for (const a of assignments) {
          links.push({
            id: aiLinkId(batchItem.itemId, a.categoryId),
            itemId: batchItem.itemId,
            categoryId: a.categoryId,
            score: a.score,
            isPrimary: a.isPrimary,
            source: 'ai',
            status: 'suggested',
            created_at: now,
            updated_at: now,
          });
        }
        const primaryId = decision.categoryIds[0];
        if (isGeneralLeafId(primaryId)) {
          const retry = applyClassifyRetryPolicy(prevRetry, 'general');
          classifyState = retry.nextState;
          retryCount = retry.nextRetryCount;
          summary.classifiedGeneral++;
          summary.assignedPrimary++;
          if (retry.routedToManualReview) {
            summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'manual_review_general');
          }
          lastClassifySkipReason = classifyOutcomeReason('general', {
            routedToManualReview: retry.routedToManualReview,
            llmReason: decision.reason,
          });
        } else {
          const retry = applyClassifyRetryPolicy(prevRetry, 'specific');
          classifyState = retry.nextState;
          retryCount = retry.nextRetryCount;
          summary.classifiedSpecific++;
          summary.assignedPrimary++;
        }
        if (decision.categoryIds.length > 1) summary.multiLabel++;
        if (assignments.length > 1) summary.assignedSecondary += assignments.length - 1;
      } else if (decision.decisionType === 'new_category' && decision.proposedCategory) {
        const promoted = promoteProposedLeaf(categories, decision.proposedCategory, now);
        if (promoted.leaf) {
          categories = promoted.categories;
          categoryIds.add(promoted.leaf.id);
          leafById.set(promoted.leaf.id, promoted.leaf);
          links.push({
            id: aiLinkId(batchItem.itemId, promoted.leaf.id),
            itemId: batchItem.itemId,
            categoryId: promoted.leaf.id,
            score: 0.88,
            isPrimary: true,
            source: 'ai',
            status: 'suggested',
            created_at: now,
            updated_at: now,
          });
          const retry = applyClassifyRetryPolicy(prevRetry, 'specific');
          classifyState = retry.nextState;
          retryCount = retry.nextRetryCount;
          summary.assignedPrimary++;
          summary.classifiedSpecific++;
        } else {
          const retry = applyClassifyRetryPolicy(prevRetry, 'unassigned');
          classifyState = retry.nextState;
          retryCount = retry.nextRetryCount;
          summary.pendingDiscover++;
          summary.unassigned++;
          if (retry.routedToManualReview) {
            summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'manual_review_new_category');
          }
          lastClassifySkipReason = classifyOutcomeReason('unassigned', {
            routedToManualReview: retry.routedToManualReview,
          });
        }
      } else {
        const retry = applyClassifyRetryPolicy(prevRetry, 'unassigned');
        classifyState = retry.nextState;
        retryCount = retry.nextRetryCount;
        summary.unassigned++;
        if (retry.routedToManualReview) {
          summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'manual_review_unassigned');
        } else {
          summary.pendingDiscover++;
        }
        lastClassifySkipReason = classifyOutcomeReason('unassigned', {
          routedToManualReview: retry.routedToManualReview,
          llmReason: decision?.reason,
        });
      }

      const signal: AiItemSignal = {
        itemId: batchItem.itemId,
        textHash: prevSignal?.textHash ?? hash,
        classifyTextHash: hash,
        embeddingModel: prevSignal?.embeddingModel ?? '',
        embedding: prevSignal?.embedding ?? [],
        derivedTags: prevSignal?.derivedTags ?? [],
        signalStatus: 'ok',
        classifyState,
        discoverState: classifyState === 'pending_discover' ? 'pending' : 'none',
        isNovelty:
          classifyState === 'pending_discover' ||
          classifyState === 'pending_classify' ||
          classifyState === 'classified_general',
        lastProcessedAt: now,
        lastClassifiedAt: now,
        classifyRetryCount: retryCount,
        inputQualityTier: meta?.qualityTier ?? prevSignal?.inputQualityTier,
        lastClassifySkipReason,
        llmReview: {
          decisionType: decision?.decisionType,
          categoryIds: decision?.categoryIds,
          confidence: decision?.confidence,
          reason: decision?.reason,
          classifyMode: 'topic-extract',
        },
      };

      itemWrites.push({ itemId: batchItem.itemId, signal, links, removeAiSuggested });
    }
  }

  reportProgress(opts, {
    phase: 'save',
    label: 'Saving assignments to database…',
    current: batches.length,
    total: batches.length,
  });
  await yieldToUi();
  categories = await persistClassifyResults(categories, itemWrites);
  await syncClassifySignalsFromLinks(itemWrites.map((w) => w.itemId));
  const runAt = Date.now();
  await saveTaxonomyState({
    lastClassifyAt: runAt,
    lastClassifyRun: { at: runAt, summary },
  });

  if (opts.autoDiscover !== false) {
    const stats = await getCategorizationQueueStats();
    const state = await getTaxonomyState();
    if (shouldTriggerDiscover(stats.pendingDiscover, stats.unassignedEligible, items.length, state)) {
      reportProgress(opts, {
        phase: 'discover',
        label: 'Running discover batch (taxonomy growth)…',
        current: 0,
        total: 1,
      });
      await discoverBatch({
        singleBatch: true,
        enforceBulkRunCap: true,
        stuckOnly: true,
        sampleBatchSize: 16,
      });
    }
  }

  reportProgress(opts, {
    phase: 'done',
    label: 'Classify finished',
    current: batches.length,
    total: batches.length,
  });

  return { summary, categories };
}

/** Match CLI discover batch size — smaller prompts, fewer timeouts. */
const DISCOVER_SAMPLE_BATCH = DEFAULT_DISCOVER_BATCH_SIZE;

export async function discoverBatch(
  opts: {
    maxItems?: number;
    itemIds?: string[];
    singleBatch?: boolean;
    maxBatches?: number;
    enforceBulkRunCap?: boolean;
    /** Gap-fill: only general / unassigned / pending_discover (default true). */
    stuckOnly?: boolean;
    sampleBatchSize?: number;
    onProgress?: (update: ClassifyProgressUpdate) => void;
  } = {}
): Promise<DiscoverBatchResult> {
  opts.onProgress?.({
    phase: 'prepare',
    label: 'Preparing discover…',
    current: 0,
    total: 1,
  });
  await yieldToUi();

  const db = await getDB();
  const aiSettings = await loadAISettings();
  if (!aiSettings.apiKey.trim()) {
    throw new Error('Missing API key. Add one in Settings > AI.');
  }

  const state = await getTaxonomyState();
  if (
    opts.enforceBulkRunCap &&
    state.bulkDiscoverRuns >= state.maxBulkDiscoverRuns
  ) {
    return {
      newParents: 0,
      newLeaves: 0,
      itemsSampled: 0,
      discoverBatches: 0,
      proposedParents: 0,
      proposedLeaves: 0,
      llmErrors: 0,
      taxonomyLeafCount: 0,
      taxonomyVersion: state.taxonomyVersion,
      shouldReclassify: false,
    };
  }

  let categories = await db.getAll('ai_categories');
  const taxonomyLeafCountStart = categories.filter((c) => c.kind === 'leaf').length;

  const signals = await db.getAll('ai_item_signals');
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));
  const allLinks = await db.getAll('ai_item_category_links');
  const primaryCategoryByItem = new Map<string, string>();
  for (const l of allLinks) {
    if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
      primaryCategoryByItem.set(l.itemId, l.categoryId);
    }
  }

  const scopeIds = opts.itemIds?.length ? new Set(opts.itemIds) : null;
  const items = await db.getAll('items');
  const enrichments = await db.getAll('item_enrichment');
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));

  const stuckOnly = opts.stuckOnly !== false;
  const runSummary = emptyDiscoverRunSummary();
  const samples: DiscoverSampleItem[] = [];

  for (const item of items) {
    if (scopeIds && !scopeIds.has(item.id)) continue;
    runSummary.totalConsidered++;
    const enrichment = enrichByItem.get(item.id);
    const built = await buildClassifyBatchItem(item, enrichment);
    if (!built.eligible) {
      runSummary.skippedIneligible++;
      runSummary.failureBuckets = bumpDiscoverFailureBucket(
        runSummary.failureBuckets,
        'ineligible'
      );
      continue;
    }
    runSummary.eligiblePool++;

    const prev = signalByItem.get(item.id);
    const primaryId = primaryCategoryByItem.get(item.id);
    const st = prev?.classifyState;
    const stuckKind = discoverStuckKind(st, primaryId);
    if (stuckKind) runSummary.stuckKindBreakdown[stuckKind]++;
    if (st === 'manual_review') runSummary.skippedManualReview++;

    if (
      !isDiscoverFairGame({
        eligible: true,
        classifyState: st,
        primaryCategoryId: primaryId,
        stuckOnly,
      })
    ) {
      if (stuckOnly && st === 'classified') runSummary.skippedNotStuck++;
      continue;
    }

    const summaryText =
      enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '';
    const text = built.classifyText.trim() || summaryText || (item.title || '').trim();
    if (text.length < 40 && summaryText.length < 40) {
      runSummary.skippedTooShort++;
      continue;
    }

    samples.push({
      itemId: item.id,
      title: item.title || '',
      aiSummary: summaryText || text.slice(0, 2000),
      stuckKind,
    });
    runSummary.stuckPool++;
    if (opts.maxItems && samples.length >= opts.maxItems) break;
  }

  samples.sort(
    (a, b) => discoverSamplePriority(a.stuckKind) - discoverSamplePriority(b.stuckKind)
  );

  const gapFillMode = stuckOnly && runSummary.stuckPool >= MIN_DISCOVER_POOL;

  if (samples.length < MIN_DISCOVER_POOL) {
    opts.onProgress?.({
      phase: 'done',
      label: stuckOnly
        ? `Not enough stuck items for discover (need ≥${MIN_DISCOVER_POOL}, have ${samples.length})`
        : 'Not enough items to discover (need ≥3 with AI summary)',
      current: 0,
      total: 0,
    });
    return {
      newParents: 0,
      newLeaves: 0,
      itemsSampled: samples.length,
      discoverBatches: 0,
      proposedParents: 0,
      proposedLeaves: 0,
      llmErrors: 0,
      taxonomyLeafCount: taxonomyLeafCountStart,
      taxonomyVersion: state.taxonomyVersion,
      shouldReclassify: false,
      summary: runSummary,
    };
  }

  const batchSize = opts.sampleBatchSize ?? DISCOVER_SAMPLE_BATCH;
  const maxBatches =
    opts.maxBatches ?? (opts.singleBatch ? 1 : Number.POSITIVE_INFINITY);
  const sampleChunks = chunk(samples, batchSize).slice(0, maxBatches);
  runSummary.itemsSampled = sampleChunks.reduce((n, c) => n + c.length, 0);
  runSummary.discoverBatches = sampleChunks.length;

  const maxNewParents = state.maxNewParentsPerDiscover ?? 5;
  const now = Date.now();
  let totalNewParents = 0;
  let totalNewLeaves = 0;
  let proposedParents = 0;
  let proposedLeaves = 0;
  let llmErrors = 0;
  const batchErrors: string[] = [];
  let taxonomyVersion = state.taxonomyVersion;
  let anyAdded = false;
  const successfulSampleIds = new Set<string>();

  for (let i = 0; i < sampleChunks.length; i++) {
    const chunkSamples = sampleChunks[i];
    const parents = getParentsFromCategories(categories);

    opts.onProgress?.({
      phase: 'discover',
      label: `Discover batch ${i + 1}/${sampleChunks.length} (${chunkSamples.length} stuck items)…`,
      current: i,
      total: sampleChunks.length,
    });
    await yieldToUi();

    const resp = await callDiscoveryBatchWithRetry(
      aiSettings,
      parents,
      categories,
      chunkSamples,
      {
        maxNewParents,
        maxNewLeaves: state.maxNewLeavesPerDiscover,
        gapFillMode,
      }
    );

    let addedParents: AiCategory[] = [];
    let addedLeaves: AiCategory[] = [];
    if (!resp.ok) {
      llmErrors++;
      runSummary.llmErrors++;
      runSummary.failureBuckets = bumpDiscoverFailureBucket(
        runSummary.failureBuckets,
        'llm_batch_error'
      );
      if (resp.error) batchErrors.push(`batch ${i + 1}: ${resp.error}`);
    } else {
      for (const row of chunkSamples) successfulSampleIds.add(row.itemId);
      if (resp.singleErrors) {
        llmErrors += resp.singleErrors;
        runSummary.llmErrors += resp.singleErrors;
        runSummary.failureBuckets = bumpDiscoverFailureBucket(
          runSummary.failureBuckets,
          'llm_single_error'
        );
      }
      const data = resp.data;
      const rawParents = data?.newParents ?? [];
      const rawLeaves = data?.newLeaves ?? [];
      proposedParents += rawParents.length;
      proposedLeaves += rawLeaves.length;
      runSummary.proposedParentsRaw += rawParents.length;
      runSummary.proposedLeavesRaw += rawLeaves.length;

      const merged = mergeDiscoveryTaxonomy(categories, data ?? {}, {
        maxNewParents,
        maxNewLeaves: state.maxNewLeavesPerDiscover,
        now,
      });
      runSummary.duplicateLeavesSkipped +=
        rawLeaves.length + (data?.itemResults?.length ?? 0) - (merged.addedLeaves?.length ?? 0);
      addedParents = merged.addedParents;
      addedLeaves = merged.addedLeaves;
      categories = merged.categories;
    }

    const addedAll = [...addedParents, ...addedLeaves];
    if (addedAll.length) {
      anyAdded = true;
      totalNewParents += addedParents.length;
      totalNewLeaves += addedLeaves.length;
      runSummary.newParents += addedParents.length;
      runSummary.newLeaves += addedLeaves.length;
      taxonomyVersion += 1;

      opts.onProgress?.({
        phase: 'save',
        label: `Saving batch ${i + 1}: +${addedParents.length} parents, +${addedLeaves.length} leaves…`,
        current: i,
        total: sampleChunks.length,
      });
      await yieldToUi();

      const tx = db.transaction(['ai_categories'], 'readwrite');
      for (const row of addedAll) {
        await tx.objectStore('ai_categories').put(row);
      }
      await tx.done;
      const parentRows = categories.filter((c) => c.kind === 'parent');
      for (const p of parentRows) {
        p.childLeafCount = categories.filter(
          (l) => l.kind === 'leaf' && l.parentId === p.id
        ).length;
        await db.put('ai_categories', p);
      }
    }
  }

  await saveTaxonomyState({
    taxonomyVersion,
    lastDiscoverAt: now,
    bulkDiscoverRuns: opts.enforceBulkRunCap
      ? state.bulkDiscoverRuns + 1
      : state.bulkDiscoverRuns,
    lastDiscoverRun: { at: now, summary: runSummary },
  });

  for (const itemId of successfulSampleIds) {
    const sig = await db.get('ai_item_signals', itemId);
    if (!sig) continue;
    if (!shouldMarkReclassifyAfterDiscover(sig.classifyState, sig.discoverState)) continue;
    await db.put('ai_item_signals', {
      ...sig,
      classifyState: 'pending_classify',
      discoverState: 'done',
      lastProcessedAt: now,
    });
    runSummary.itemsMarkedForReclassify++;
  }

  let doneLabel = anyAdded
    ? `Discover done: ${runSummary.itemsSampled} stuck · ${sampleChunks.length} batches · +${totalNewParents} parents · +${totalNewLeaves} leaves`
    : `Discover done: ${runSummary.itemsSampled} stuck · ${sampleChunks.length} batches · 0 added`;
  if (!anyAdded && (proposedParents > 0 || proposedLeaves > 0)) {
    doneLabel += ` (LLM proposed ${proposedParents} parents, ${proposedLeaves} leaves — all duplicates of existing labels)`;
  } else if (!anyAdded && llmErrors === sampleChunks.length) {
    doneLabel += ` — all ${llmErrors} batch(es) failed (check API key / model)`;
  } else if (!anyAdded && llmErrors > 0) {
    doneLabel += ` · ${llmErrors} batch error(s)`;
  } else if (!anyAdded && taxonomyLeafCountStart >= 35) {
    doneLabel += ` — taxonomy already has ${taxonomyLeafCountStart} leaves (seed includes prior discovery)`;
  }

  opts.onProgress?.({
    phase: 'done',
    label: doneLabel,
    current: sampleChunks.length,
    total: sampleChunks.length,
  });

  notifyDataChanged('categorization.update');

  return {
    newParents: totalNewParents,
    newLeaves: totalNewLeaves,
    itemsSampled: runSummary.itemsSampled,
    discoverBatches: sampleChunks.length,
    proposedParents,
    proposedLeaves,
    llmErrors,
    taxonomyLeafCount: categories.filter((c) => c.kind === 'leaf').length,
    taxonomyVersion,
    shouldReclassify: anyAdded || runSummary.itemsMarkedForReclassify > 0,
    batchErrors: batchErrors.length ? batchErrors : undefined,
    summary: runSummary,
  };
}

export async function noteBulkImport(itemCount: number): Promise<AiTaxonomyState> {
  const state = await getTaxonomyState();
  if (itemCount >= state.bulkImportThreshold) {
    return saveTaxonomyState({
      bulkModeActive: true,
      bulkDiscoverRuns: 0,
    });
  }
  return state;
}
