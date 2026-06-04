import { loadAISettings } from '../ai/settings';
import type { Item } from '../db';
import { notifyDataChanged } from '../dataChangeNotifier';
import { getDB } from '../db';
import type { ItemEnrichment } from '../enrichment/types';
import { assessCategorizationEligibility } from '../enrichment/categorizationEligibility';
import { buildCategorizationText } from '../enrichment/categorizationText';
import { applyCountsToCategories, linkCountsForCategories } from './counts';
import {
  getAssignableLeaves,
  getParentsFromCategories,
  isGeneralLeafId,
} from './taxonomyCatalog';
import {
  detectLinkQualityFromItem,
  findLinkQualityCategory,
  isLinkQualityLeafId,
  classifyStateForLinkQualityLeaf,
  linkQualityCategoryAllowed,
  type LinkQualityDetectInput,
} from './linkQuality';
import {
  chunkClassifyBatch,
  resolveTopicExtractBatchWithRetry,
  topicExtractBatchSize,
  type ClassifyBatchItem,
} from './topicExtract';
import {
  hasSpecificPrimaryTopic,
  itemNeedsClassify,
} from './categorizationFairGame';
import { hashText } from './textHash';
import { getTaxonomyState, saveTaxonomyState, shouldTriggerDiscover } from './taxonomyState';
import { promoteProposedLeaf, type DiscoverSampleItem } from './discoverTaxonomy';
import {
  ensureTaxonomyPatches,
  getBundledSeedDocument,
  seedDocumentToCategories,
} from './seedImport';
import { APP_DISCOVER_MAP_BATCH_SIZE } from './discoverPolicy';
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
  discoverSamplePriority,
  discoverStuckKind,
  emptyDiscoverRunSummary,
  isDiscoverFairGame,
  itemNeedsDiscoverGapFill,
  MIN_DISCOVER_POOL,
  shouldMarkReclassifyAfterDiscover,
} from './discoverPolicy';
import { DISCOVER_MAP_BATCH_SIZE, runDiscoverMapReduce } from './discoverMapReduce';
import { planDiscoverMapBatches, sliceDiscoverMapPool } from './discoverPolicy';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);

function isUnassignedClassifyAttempt(sig: AiItemSignal): boolean {
  if (!sig.lastClassifiedAt || !sig.llmReview) return false;
  const review = sig.llmReview;
  if (review.decisionType === 'none') return true;
  if (review.decisionType === 'existing' || review.decisionType === 'new_category') {
    return !review.categoryIds?.length;
  }
  return !review.categoryIds?.length;
}

function reportProgress(opts: ClassifyIncrementalOptions, update: ClassifyProgressUpdate) {
  opts.onProgress?.(update);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Cancelled');
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
    
    const hints = { aiTags: enrichment?.aiTags };
    const eligibility = assessCategorizationEligibility(item, enrichment, hints);
    
    if (!eligibility.eligible) {
      stats.ineligible++;
      continue;
    }
    
    const classifyText = buildCategorizationText(item, enrichment, {
      includeSnippet: false,
      ...hints,
    });
    const hash = await hashText(classifyText);

    const prev = signalByItem.get(item.id);
    const st = prev?.classifyState;
    const hashMatch = prev?.classifyTextHash === hash;
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

function linkQualityInputFor(
  item: Pick<Item, 'title' | 'url'>,
  enrichment?: ItemEnrichment | null,
  extra?: { eligibilityReason?: string; llmReason?: string }
): LinkQualityDetectInput {
  return {
    title: item.title,
    url: item.url,
    aiStatus: enrichment?.aiStatus,
    aiSummary: enrichment?.summary,
    aiTags: enrichment?.aiTags,
    aiKeyPoints: enrichment?.aiKeyPoints,
    quotedText: enrichment?.quotedText,
    eligibilityReason: extra?.eligibilityReason,
    llmReason: extra?.llmReason,
  };
}

export async function getCategorizationQueueStats(): Promise<CategorizationQueueStats> {
  const { getPipelineCatalog, computeCategorizationQueueStats } = await import(
    '../pipeline/pipelineCatalog'
  );
  const [catalog, state] = await Promise.all([getPipelineCatalog(), getTaxonomyState()]);
  return computeCategorizationQueueStats(catalog, state);
}

/** Preview discover gap-fill pool (stuck general/unassigned) without LLM. */
export async function getDiscoverPoolStats(itemIds?: string[]): Promise<DiscoverRunSummary> {
  const { getPipelineCatalog, computeDiscoverPoolStats } = await import(
    '../pipeline/pipelineCatalog'
  );
  const catalog = await getPipelineCatalog();
  return computeDiscoverPoolStats(catalog, itemIds);
}

/** Items in scope that finished classify (or are eligible) but have no primary category link. */
export async function listItemIdsWithoutCategory(itemIds?: string[]): Promise<string[]> {
  const db = await getDB();
  const scope = itemIds?.length ? new Set(itemIds) : null;
  const items = await db.getAll('items');
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));
  const primaryByItem = new Map<string, string>();
  if (db.objectStoreNames.contains('ai_item_category_links')) {
    const links = await db.getAll('ai_item_category_links');
    for (const l of links) {
      if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
        primaryByItem.set(l.itemId, l.categoryId);
      }
    }
  }

  const out: string[] = [];
  for (const item of items) {
    if (scope && !scope.has(item.id)) continue;
    const enrichment = enrichByItem.get(item.id);
    const eligibility = assessCategorizationEligibility(item, enrichment);
    const sig = signalByItem.get(item.id);
    const st = sig?.classifyState;
    const primaryId = primaryByItem.get(item.id);
    // Never attempted classify — still in queue, not a discover gap-fill candidate.
    if (st === 'pending_classify' || st === 'pending_reclassify') {
      const attempted = !!(sig?.lastClassifiedAt || sig?.llmReview);
      if (!attempted) continue;
    }
    if (
      itemNeedsDiscoverGapFill({
        eligible: eligibility.eligible,
        classifyState: st,
        primaryCategoryId: primaryId,
      })
    ) {
      out.push(item.id);
    }
  }
  return out;
}

/**
 * Returns itemIds (from the given set) whose current primary AI category link
 * points to a *-general fallback leaf (classified_general state).
 * Used by the end-of-pipeline discover pass to target items that got a general
 * category but might get a specific one with another discover shot.
 */
export async function listItemIdsWithGeneralCategory(itemIds: string[]): Promise<string[]> {
  if (!itemIds.length) return [];
  const db = await getDB();
  const scope = new Set(itemIds);
  const primaryByItem = new Map<string, string>();
  if (db.objectStoreNames.contains('ai_item_category_links')) {
    const links = await db.getAll('ai_item_category_links');
    for (const l of links) {
      if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
        primaryByItem.set(l.itemId, l.categoryId);
      }
    }
  }
  const out: string[] = [];
  for (const id of itemIds) {
    if (!scope.has(id)) continue;
    const primaryId = primaryByItem.get(id);
    if (primaryId && isGeneralLeafId(primaryId)) out.push(id);
  }
  return out;
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
    const primaryId = primaryCategoryByItem.get(itemId);
    if (primaryId) {
      continue;
    }
    if (
      prev?.classifyState === 'classified' ||
      prev?.classifyState === 'classified_general'
    ) {
      // Orphan or stale — re-queue even when state says done.
    }
    const next: AiItemSignal = {
      itemId,
      textHash: prev?.textHash ?? '',
      classifyTextHash: prev?.classifyTextHash ?? '',
      embeddingModel: prev?.embeddingModel ?? '',
      embedding: prev?.embedding ?? [],
      derivedTags: prev?.derivedTags ?? [],
      signalStatus: 'ok',
      classifyState: 'pending_classify',
      discoverState: 'none',
      isNovelty: false,
      eligibilityReason: undefined,
      lastClassifySkipReason: undefined,
      lastClassifiedAt: undefined,
      llmReview: undefined,
      classifyRetryCount: 0,
      lastProcessedAt: now,
      inputQualityTier: prev?.inputQualityTier,
    };
    await tx.objectStore('ai_item_signals').put(next);
  }
  await tx.done;
}

/** Reset classified / general signals that lost their primary category link. */
export async function reconcileOrphanClassifiedSignals(): Promise<number> {
  const db = await getDB();
  if (
    !db.objectStoreNames.contains('ai_item_signals') ||
    !db.objectStoreNames.contains('ai_item_category_links')
  ) {
    return 0;
  }

  const links = await db.getAll('ai_item_category_links');
  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
      primaryByItem.set(l.itemId, l.categoryId);
    }
  }

  const signals = await db.getAll('ai_item_signals');
  const now = Date.now();
  let updated = 0;
  const tx = db.transaction(['ai_item_signals'], 'readwrite');
  for (const sig of signals) {
    if (sig.classifyState !== 'classified' && sig.classifyState !== 'classified_general') continue;
    if (primaryByItem.has(sig.itemId)) continue;
    await tx.objectStore('ai_item_signals').put({
      ...sig,
      itemId: sig.itemId,
      classifyState: 'pending_classify',
      discoverState: 'none',
      isNovelty: false,
      classifyRetryCount: 0,
      lastClassifySkipReason: 'Re-queued — classified state without category link',
      lastProcessedAt: now,
      lastClassifiedAt: undefined,
      llmReview: undefined,
    });
    updated++;
  }
  await tx.done;
  if (updated > 0) notifyDataChanged('categorization.update');
  return updated;
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
    if (!isUnassignedClassifyAttempt(sig)) continue;

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
let ensureInFlight: Promise<number> | null = null;
let lastEnsureFinishedAt = 0;
const ENSURE_MIN_INTERVAL_MS = 90_000;

export async function ensurePendingClassifySignals(opts?: { force?: boolean }): Promise<number> {
  const now = Date.now();
  if (!opts?.force && ensureInFlight) return ensureInFlight;
  if (!opts?.force && now - lastEnsureFinishedAt < ENSURE_MIN_INTERVAL_MS) return 0;

  ensureInFlight = ensurePendingClassifySignalsWork().finally(() => {
    lastEnsureFinishedAt = Date.now();
    ensureInFlight = null;
  });
  return ensureInFlight;
}

async function ensurePendingClassifySignalsWork(): Promise<number> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return 0;

  const signals = await db.getAll('ai_item_signals');
  const items = (await db.getAll('items')).filter((i) => !!i.url?.trim());
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
  const signalTx = db.transaction(['ai_item_signals'], 'readwrite');
  const signalStore = signalTx.objectStore('ai_item_signals');

  for (const sig of signals) {
    if (sig.classifyState === 'ineligible') {
      const item = itemById.get(sig.itemId);
      if (!item?.url?.trim()) continue;
      if (hasSpecificPrimaryTopic(primaryByItem.get(sig.itemId), sig.classifyState)) continue;
      const enrichment = enrichByItem.get(sig.itemId);
      const eligibility = assessCategorizationEligibility(item, enrichment);
      if (!eligibility.eligible) continue;
      await signalStore.put({
        ...sig,
        signalStatus: 'ok',
        classifyState: 'pending_classify',
        eligibilityReason: undefined,
        lastClassifySkipReason: undefined,
        lastProcessedAt: now,
      });
      updated++;
      continue;
    }

    if (sig.classifyState === 'skipped') {
      if (hasSpecificPrimaryTopic(primaryByItem.get(sig.itemId), sig.classifyState)) continue;
      const item = itemById.get(sig.itemId);
      if (!item) continue;
      const enrichment = enrichByItem.get(sig.itemId);
      if (enrichment?.aiStatus !== 'ok') continue;
      await signalStore.put({
        ...sig,
        classifyState: 'pending_discover',
        discoverState: 'pending',
        isNovelty: true,
        lastClassifySkipReason: formatClassifySkipReason('pending_discover'),
        lastProcessedAt: now,
      });
      updated++;
      continue;
    }

    if (sig.classifyState === 'pending_classify') {
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
      if (!isUnassignedClassifyAttempt(sig)) continue;
      await signalStore.put({
        ...sig,
        classifyState: 'pending_discover',
        discoverState: 'pending',
        isNovelty: true,
        lastClassifySkipReason: formatClassifySkipReason('pending_discover'),
        lastProcessedAt: now,
      });
      updated++;
    }
  }
  await signalTx.done;

  if (!db.objectStoreNames.contains('item_enrichment')) {
    if (updated > 0) {
      notifyDataChanged('categorization.update');
      const { invalidatePipelineCatalog } = await import('../pipeline/pipelineCatalog');
      invalidatePipelineCatalog();
    }
    return updated;
  }

  const signalIds = new Set(signals.map((s) => s.itemId));
  const toMark: string[] = [];
  for (const item of items) {
    const enrichment = enrichByItem.get(item.id);
    if (enrichment?.aiStatus !== 'ok') continue;
    if (signalIds.has(item.id)) continue;
    if (hasSpecificPrimaryTopic(primaryByItem.get(item.id), undefined)) continue;
    toMark.push(item.id);
  }

  if (toMark.length) await markItemsPendingClassify(toMark);
  const total = updated + toMark.length;
  if (total > 0) {
    const { invalidatePipelineCatalog } = await import('../pipeline/pipelineCatalog');
    invalidatePipelineCatalog();
  }
  return total;
}

export async function ensureSeedTaxonomy(): Promise<void> {
  const stats = await getCategorizationQueueStats();
  if (stats.leafCount > 0) {
    await ensureTaxonomyPatches();
    return;
  }
  console.info('[taxonomy] no leaves found — auto-importing seed taxonomy');
  await importSeedTaxonomy(false); // false = don't replace existing (none to replace anyway)
  const { commitPendingDbWrites } = await import('../db');
  await commitPendingDbWrites();
  await ensureTaxonomyPatches();
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
  await ensureTaxonomyPatches();

  return {
    parents: doc.parents.length,
    leaves: doc.leaves.length,
    taxonomyVersion: doc.taxonomyVersion,
  };
}

const CLASSIFY_PERSIST_ITEM_CHUNK = 20;

async function countPrimaryLinksForItems(
  itemIds: Set<string>
): Promise<number> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) return 0;
  const links = await db.getAll('ai_item_category_links');
  let n = 0;
  for (const l of links) {
    if (
      itemIds.has(l.itemId) &&
      l.source === 'ai' &&
      l.isPrimary &&
      COUNTABLE_STATUSES.has(l.status)
    ) {
      n++;
    }
  }
  return n;
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

  // Compute updated category counts in memory BEFORE opening the transaction
  // so we can write categories → links in the correct FK order.
  const linkSnapshot = [...allLinks];
  for (const w of itemWrites) {
    if (w.removeAiSuggested) {
      let idx = linkSnapshot.findIndex(
        (l) => l.itemId === w.itemId && l.source === 'ai' && l.status === 'suggested'
      );
      while (idx >= 0) {
        linkSnapshot.splice(idx, 1);
        idx = linkSnapshot.findIndex(
          (l) => l.itemId === w.itemId && l.source === 'ai' && l.status === 'suggested'
        );
      }
    }
    linkSnapshot.push(...w.links);
  }

  const counts = linkCountsForCategories(categories, linkSnapshot);
  const updated = applyCountsToCategories(categories, counts, now);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  // Use DB snapshot to identify categories not yet persisted (e.g. newly promoted leaves).
  const catsToWrite = updated.filter((cat) => {
    const inDbSnapshot = db.get('ai_categories', cat.id) !== undefined;
    if (!inDbSnapshot) return true;
    const prev = categoryById.get(cat.id);
    if (!prev) return true;
    return (
      prev.itemCount !== cat.itemCount ||
      prev.primaryItemCount !== cat.primaryItemCount ||
      prev.secondaryItemCount !== cat.secondaryItemCount ||
      prev.childLeafCount !== cat.childLeafCount
    );
  });

  const expectedPrimary = new Set(
    itemWrites
      .filter((w) => w.links.some((l) => l.isPrimary && COUNTABLE_STATUSES.has(l.status)))
      .map((w) => w.itemId)
  );

  const { commitPendingDbWrites } = await import('../db');

  try {
    // Phase 1: all categories (FK targets for links) — one flush before any links.
    if (catsToWrite.length) {
      const catTx = db.transaction(['ai_categories'], 'readwrite');
      for (const cat of catsToWrite) {
        await catTx.objectStore('ai_categories').put(cat);
      }
      await catTx.done;
      await commitPendingDbWrites();
    }

    // Phase 2: per-item link + signal batches (avoids chunked batchMutate splitting
    // categories and links across worker transactions).
    for (let i = 0; i < itemWrites.length; i += CLASSIFY_PERSIST_ITEM_CHUNK) {
      const slice = itemWrites.slice(i, i + CLASSIFY_PERSIST_ITEM_CHUNK);
      const itemTx = db.transaction(['ai_item_category_links', 'ai_item_signals'], 'readwrite');
      for (const w of slice) {
        if (w.removeAiSuggested) {
          const existing = await itemTx
            .objectStore('ai_item_category_links')
            .index('by-item')
            .getAll(w.itemId);
          for (const link of existing) {
            if (link.source === 'ai' && link.status === 'suggested') {
              await itemTx.objectStore('ai_item_category_links').delete(link.id);
            }
          }
        }
        for (const link of w.links) {
          await itemTx.objectStore('ai_item_category_links').put(link);
        }
        await itemTx.objectStore('ai_item_signals').put(w.signal);
      }
      await itemTx.done;
    }
    await commitPendingDbWrites();

    if (expectedPrimary.size > 0) {
      const persisted = await countPrimaryLinksForItems(expectedPrimary);
      if (persisted < expectedPrimary.size) {
        const missing = expectedPrimary.size - persisted;
        console.error(
          `[classify] persist verify failed: ${persisted}/${expectedPrimary.size} primary links in worker`
        );
        throw new Error(
          `Failed to save ${missing} category assignment${missing === 1 ? '' : 's'} — try again`
        );
      }
    }
  } catch (e) {
    console.error('[classify] persistClassifyResults failed:', e);
    throw e instanceof Error ? e : new Error('Failed to save classify results');
  }
  notifyDataChanged('categorization.update');
  return updated;
}

// ---------------------------------------------------------------------------
// Keyword-based domain patterns for general-leaf fallback.
// Order matters: more specific patterns first (e.g. ai-productivity before
// machine-learning so that "chatgpt prompts" doesn't become ML).
// ---------------------------------------------------------------------------
const GENERAL_FALLBACK_PATTERNS: Array<{ parentId: string; pattern: RegExp }> = [
  {
    parentId: 'ai-productivity',
    pattern:
      /\b(chatgpt|claude|openai|anthropic|perplexity|copilot|cursor|prompt engineering|rag|langchain|llamaindex|ai agent|ai workflow|n8n|ai tool|ai assistant)\b/i,
  },
  {
    parentId: 'machine-learning',
    pattern:
      /\b(machine learning|deep learning|neural net|pytorch|tensorflow|llm|bert|transformer|model training|fine.?tun|pre.?train|inference|embedding|diffusion model|gradient|backprop|reinforcement learning|nlp|computer vision|speech recogni|asr|tts|dataset|epoch|optimizer|loss function|attention mechanism|generative model)\b/i,
  },
  {
    parentId: 'infra-hosting',
    pattern:
      /\b(docker|kubernetes|k8s|aws|gcp|azure|cloud hosting|vps|nginx|devops|ci.?cd|terraform|ansible|container|deployment pipeline|microservice|linux server)\b/i,
  },
  {
    parentId: 'hardware',
    pattern:
      /\b(cpu|gpu|ram|ssd|motherboard|raspberry pi|arduino|fpga|workstation hardware|quiet pc|fanless|gaming rig|hpc cluster)\b/i,
  },
  {
    parentId: 'quant-finance',
    pattern:
      /\b(algorithmic trading|quant|backtesting|stock market|options trading|futures|alpha factor|portfolio optimization|forex|crypto trading|mean reversion|momentum strategy)\b/i,
  },
  {
    parentId: 'personal-finance',
    pattern:
      /\b(index fund|etf|401k|roth ira|dividend|retirement savings|personal finance|wealth building|compound interest|vanguard|fidelity|budget|emergency fund)\b/i,
  },
  {
    parentId: 'product-gtm',
    pattern:
      /\b(product launch|startup|saas|go.to.market|landing page|growth hack|indie hacker|mvp|user acquisition|product demo|no.code)\b/i,
  },
  {
    parentId: 'health-lifestyle',
    pattern:
      /\b(health|fitness|nutrition|diet|exercise|sleep|mental health|meditation|wellness|medicine|supplement|workout|therapy|stress)\b/i,
  },
  {
    parentId: 'software-dev',
    pattern:
      /\b(python|javascript|typescript|golang|rust|java|c\+\+|algorithm|api design|framework|library|github|git|code review|programming|software engineer|function|debug|unit test|lint|refactor|compiler|parser|sdk|cli tool)\b/i,
  },
];

function detectGeneralLeafDomain(text: string): string | null {
  let best: { parentId: string; score: number } | null = null;
  for (const { parentId, pattern } of GENERAL_FALLBACK_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, 'gi'));
    const score = matches ? matches.length : 0;
    if (score > 0 && (!best || score > best.score)) {
      best = { parentId, score };
    }
  }
  return best?.parentId ?? null;
}

/**
 * After all classify + discover attempts, assign the best-matching general leaf
 * to items that still have no primary category. This is a deterministic, LLM-free
 * fallback ensuring all eligible fetched items get at least a general classification.
 * Falls back to software-dev-general when no domain keyword matches.
 */
export async function assignGeneralLeafFallback(itemIds: string[]): Promise<number> {
  if (!itemIds.length) return 0;
  const db = await getDB();

  const itemSet = new Set(itemIds);
  const items = (await db.getAll('items')).filter((i) => itemSet.has(i.id));
  if (!items.length) return 0;

  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));

  const categories: AiCategory[] = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];

  // Map parentId → its general leaf
  const generalLeafByParent = new Map<string, AiCategory>();
  for (const cat of categories) {
    if (cat.kind === 'leaf' && isGeneralLeafId(cat.id) && cat.parentId) {
      generalLeafByParent.set(cat.parentId, cat);
    }
  }
  if (!generalLeafByParent.size) return 0;

  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));

  // Verify items still have no primary link (race-check)
  const existingPrimary = new Set<string>();
  if (db.objectStoreNames.contains('ai_item_category_links')) {
    const links = await db.getAll('ai_item_category_links');
    for (const l of links) {
      if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
        existingPrimary.add(l.itemId);
      }
    }
  }

  const now = Date.now();
  const itemWrites: Array<{
    itemId: string;
    signal: AiItemSignal;
    links: AiItemCategoryLink[];
    removeAiSuggested: boolean;
  }> = [];

  for (const item of items) {
    if (existingPrimary.has(item.id)) continue; // already classified

    const enrichment = enrichByItem.get(item.id);
    const prevSignal = signalByItem.get(item.id);

    const text = [
      item.title ?? '',
      item.url ?? '',
      enrichment?.summary ?? '',
      ...(enrichment?.aiTags ?? []),
    ]
      .join(' ')
      .toLowerCase();

    const domainId = detectGeneralLeafDomain(text);
    const parentId = domainId ?? 'software-dev';
    const generalLeaf =
      generalLeafByParent.get(parentId) ??
      generalLeafByParent.get('software-dev') ??
      [...generalLeafByParent.values()][0];

    if (!generalLeaf) continue;

    const link: AiItemCategoryLink = {
      id: aiLinkId(item.id, generalLeaf.id),
      itemId: item.id,
      categoryId: generalLeaf.id,
      score: 0.45,
      isPrimary: true,
      source: 'ai',
      status: 'suggested',
      created_at: now,
      updated_at: now,
    };

    const signal: AiItemSignal = {
      itemId: item.id,
      textHash: prevSignal?.textHash ?? '',
      classifyTextHash: prevSignal?.classifyTextHash ?? '',
      embeddingModel: prevSignal?.embeddingModel ?? '',
      embedding: prevSignal?.embedding ?? [],
      derivedTags: prevSignal?.derivedTags ?? [],
      signalStatus: 'ok',
      classifyState: 'classified_general',
      discoverState: 'none',
      isNovelty: false,
      lastProcessedAt: now,
      lastClassifiedAt: now,
      classifyRetryCount: prevSignal?.classifyRetryCount ?? 0,
      inputQualityTier: prevSignal?.inputQualityTier,
      lastClassifySkipReason: `keyword-fallback:${generalLeaf.id}`,
      llmReview: {
        decisionType: 'existing',
        categoryIds: [generalLeaf.id],
        classifyMode: 'fallback',
        reason: `keyword fallback → ${generalLeaf.name}`,
      },
    };

    itemWrites.push({ itemId: item.id, signal, links: [link], removeAiSuggested: true });
  }

  if (!itemWrites.length) {
    console.warn(
      '[assignGeneralLeafFallback] returned 0 — items:', items.length,
      'generalLeaves:', generalLeafByParent.size,
      'existingPrimary:', existingPrimary.size,
      'skippedByPrimary:', items.filter(i => existingPrimary.has(i.id)).length
    );
    return 0;
  }
  await persistClassifyResults(categories, itemWrites);
  return itemWrites.length;
}

export interface ClassifyBatchPreviewItem {
  itemId: string;
  runnable: boolean;
  skipReason?: string;
}

/** Read-only: which ids would enter the classify LLM batch (same gates as classifyIncremental). */
export async function previewClassifyBatchItemIds(
  itemIds: string[]
): Promise<ClassifyBatchPreviewItem[]> {
  if (!itemIds.length) return [];

  const db = await getDB();
  const idSet = new Set(itemIds);
  const items = (await db.getAll('items')).filter((i) => idSet.has(i.id));
  const itemById = new Map(items.map((i) => [i.id, i]));

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

  const preview: ClassifyBatchPreviewItem[] = [];

  for (const id of itemIds) {
    const item = itemById.get(id);
    if (!item) {
      preview.push({ itemId: id, runnable: false, skipReason: 'Bookmark not found' });
      continue;
    }

    const enrichment = enrichByItem.get(item.id);
    const built = await buildClassifyBatchItem(item, enrichment);
    const prev = signalByItem.get(item.id);
    const st = prev?.classifyState;
    const primaryId = primaryCategoryByItem.get(item.id);

    if (!built.eligible || !built.batch) {
      preview.push({
        itemId: id,
        runnable: false,
        skipReason: built.eligibilityReason ?? 'Not eligible for classification',
      });
      continue;
    }

    const hashMatch = prev?.classifyTextHash === built.hash;
    const skipDecision = shouldSkipClassify({
      classifyState: st,
      primaryCategoryId: primaryId,
      hashMatch,
      eligible: true,
    });

    if (skipDecision.skip) {
      preview.push({
        itemId: id,
        runnable: false,
        skipReason: skipDecision.reason
          ? formatClassifySkipReason(skipDecision.reason)
          : 'Skipped',
      });
      continue;
    }

    if (
      !itemNeedsClassify(
        skipDecision.markPendingReclassify ? 'pending_reclassify' : st,
        primaryId,
        hashMatch,
        true
      )
    ) {
      preview.push({
        itemId: id,
        runnable: false,
        skipReason: formatClassifySkipReason('unchanged_hash_specific'),
      });
      continue;
    }

    preview.push({ itemId: id, runnable: true });
  }

  return preview;
}

export async function classifyIncremental(
  opts: ClassifyIncrementalOptions = {}
): Promise<TopicClassifyResult> {
  await ensureTaxonomyPatches();
  throwIfAborted(opts.signal);
  reportProgress(opts, {
    phase: 'prepare',
    label: 'Preparing…',
    current: 0,
    total: 1,
  });
  await yieldToUi();

  // Orphan reconcile runs in prepBatchPipelineItems / post-enrich — not here.
  // Running it before every classify pass reset hundreds of items when a prior
  // persist left classified signals without links in the worker DB.

  const db = await getDB();
  const aiSettings = await loadAISettings();
  if (!aiSettings.apiKey.trim()) {
    throw new Error('Missing API key. Add one in Settings → AI.');
  }

  let categories = await db.getAll('ai_categories');
  if (!getAssignableLeaves(categories).length) {
    // Taxonomy is empty — auto-load seed before throwing.
    // Discover warm-up (run before classify in itemPipeline) will add domain leaves on top.
    console.warn('[classify] no taxonomy leaves — auto-importing seed taxonomy');
    try {
      await importSeedTaxonomy(false);
      const { commitPendingDbWrites } = await import('../db');
      await commitPendingDbWrites();
      categories = await db.getAll('ai_categories');
    } catch (e) {
      console.error('[classify] seed taxonomy auto-import failed:', e);
    }
    // If still empty after seed load, proceed anyway — discover will add leaves.
    if (!getAssignableLeaves(categories).length) {
      console.warn('[classify] taxonomy still empty after seed load — proceeding anyway (discover will bootstrap)');
    }
  }
  const leaves = getAssignableLeaves(categories);

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
  const preBatchWrites: Array<{
    itemId: string;
    signal: AiItemSignal;
    links: AiItemCategoryLink[];
    removeAiSuggested: boolean;
  }> = [];
  const summary = emptyTopicClassifySummary();

  for (const item of items) {
    if ((summary.totalConsidered & 31) === 0) throwIfAborted(opts.signal);
    summary.totalConsidered++;
    const enrichment = enrichByItem.get(item.id);
    const built = await buildClassifyBatchItem(item, enrichment);
    const prev = signalByItem.get(item.id);
    const st = prev?.classifyState;
    const primaryId = primaryCategoryByItem.get(item.id);

    if (!built.eligible || !built.batch) {
      const lq = detectLinkQualityFromItem(item, enrichment, {
        eligibilityReason: built.eligibilityReason,
      });
      const lqLeaf = lq ? findLinkQualityCategory(categories, lq.leafId) : undefined;
      const lqInput = linkQualityInputFor(item, enrichment, {
        eligibilityReason: built.eligibilityReason,
      });
      if (lq && lqLeaf && linkQualityCategoryAllowed(lqLeaf.id, lqInput)) {
        const now = Date.now();
        const lqState = classifyStateForLinkQualityLeaf(lqLeaf.id);
        summary.assignedPrimary++;
        if (lqState === 'classified_removal') summary.classifiedRemoval++;
        preBatchWrites.push({
          itemId: item.id,
          removeAiSuggested: true,
          links: [
            {
              id: aiLinkId(item.id, lqLeaf.id),
              itemId: item.id,
              categoryId: lqLeaf.id,
              score: 0.92,
              isPrimary: true,
              source: 'ai',
              status: 'suggested',
              created_at: now,
              updated_at: now,
            },
          ],
          signal: {
            itemId: item.id,
            textHash: prev?.textHash ?? '',
            classifyTextHash: built.hash || prev?.classifyTextHash || '',
            embeddingModel: prev?.embeddingModel ?? '',
            embedding: prev?.embedding ?? [],
            derivedTags: prev?.derivedTags ?? [],
            signalStatus: 'ok',
            classifyState: classifyStateForLinkQualityLeaf(lqLeaf.id),
            discoverState: 'none',
            isNovelty: false,
            eligibilityReason: built.eligibilityReason,
            lastClassifySkipReason: lq.reason,
            lastProcessedAt: now,
            lastClassifiedAt: now,
            classifyRetryCount: prev?.classifyRetryCount ?? 0,
            llmReview: {
              decisionType: 'existing',
              categoryIds: [lqLeaf.id],
              confidence: 0.92,
              reason: lq.reason,
              classifyMode: 'link-quality-heuristic',
            },
          },
        });
        continue;
      }
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
        const orphanClassified =
          (prev.classifyState === 'classified' || prev.classifyState === 'classified_general') &&
          !hasSpecificPrimaryTopic(primaryId);
        gateWrites.push({
          itemId: item.id,
          signal: orphanClassified
            ? {
                ...prev,
                itemId: item.id,
                classifyState: 'pending_classify',
                discoverState: 'none',
                isNovelty: false,
                lastClassifySkipReason: 'Re-queued — classified without stored category',
                lastProcessedAt: Date.now(),
              }
            : {
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
    const { commitPendingDbWrites } = await import('../db');
    await commitPendingDbWrites();
  }

  if (preBatchWrites.length) {
    categories = await persistClassifyResults(categories, preBatchWrites);
    await syncClassifySignalsFromLinks(preBatchWrites.map((w) => w.itemId));
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
    label: `Classifying ${toProcess.length} items…`,
    current: 0,
    total: batches.length,
  });
  await yieldToUi();

  const now = Date.now();
  const itemById = new Map(items.map((i) => [i.id, i]));

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batchWrites: Array<{
      itemId: string;
      signal: AiItemSignal;
      links: AiItemCategoryLink[];
      removeAiSuggested: boolean;
    }> = [];
    throwIfAborted(opts.signal);
    const batch = batches[batchIdx];
    summary.batches++;
    reportProgress(opts, {
      phase: 'classify',
      label: `Classifying ${batches.length > 1 ? `batch ${batchIdx + 1}/${batches.length} (` : ''}${batch.length} items${batches.length > 1 ? ')' : ''}…`,
      current: batchIdx,
      total: batches.length,
    });
    await yieldToUi();
    const batchResult = await resolveTopicExtractBatchWithRetry(
      aiSettings,
      categories,
      batch,
      categoryIds,
      leafById,
      parents,
      batchSize,
      opts.signal,
      (msg) => {
        opts.onProgress?.({
          phase: 'classify',
          label: `Classifying ${batches.length > 1 ? `batch ${batchIdx + 1}/${batches.length}` : `${batch.length} items`}: ${msg}`,
          current: batchIdx,
          total: batches.length,
        });
      }
    );
    throwIfAborted(opts.signal);
    const normalized = batchResult.decisions;
    for (const itemId of batchResult.unresolvedItemIds) {
      normalized.set(itemId, {
        itemId,
        decisionType: 'none',
        reason: batchResult.lastError,
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
        const corpusItem = itemById.get(batchItem.itemId);
        const lq = corpusItem
          ? detectLinkQualityFromItem(corpusItem, enrichByItem.get(batchItem.itemId), {
              llmReason: decision.reason,
            })
          : null;
        const lqLeaf = lq ? findLinkQualityCategory(categories, lq.leafId) : undefined;
        const lqInput = corpusItem
          ? linkQualityInputFor(corpusItem, enrichByItem.get(batchItem.itemId), {
              llmReason: decision.reason,
            })
          : null;
        if (lq && lqLeaf && lqInput && linkQualityCategoryAllowed(lqLeaf.id, lqInput)) {
          links.push({
            id: aiLinkId(batchItem.itemId, lqLeaf.id),
            itemId: batchItem.itemId,
            categoryId: lqLeaf.id,
            score: 0.9,
            isPrimary: true,
            source: 'ai',
            status: 'suggested',
            created_at: now,
            updated_at: now,
          });
          classifyState = classifyStateForLinkQualityLeaf(lqLeaf.id);
          retryCount = prevRetry;
          summary.assignedPrimary++;
          if (classifyState === 'classified_removal') summary.classifiedRemoval++;
          lastClassifySkipReason = lq.reason;
        } else {
          const retry = applyClassifyRetryPolicy(prevRetry, 'unassigned');
          classifyState = retry.nextState;
          retryCount = retry.nextRetryCount;
          summary.unassigned++;
          if (retry.routedToManualReview) {
            summary.failureBuckets = bumpFailureBucket(
              summary.failureBuckets,
              'manual_review_unassigned'
            );
          } else {
            summary.pendingDiscover++;
          }
          lastClassifySkipReason = classifyOutcomeReason('unassigned', {
            routedToManualReview: retry.routedToManualReview,
            llmReason: decision.reason,
          });
        }
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
        const corpusItem = itemById.get(batchItem.itemId);
        const lqInput = corpusItem
          ? linkQualityInputFor(corpusItem, enrichByItem.get(batchItem.itemId), {
              llmReason: decision.reason,
            })
          : null;
        if (
          isLinkQualityLeafId(primaryId) &&
          lqInput &&
          linkQualityCategoryAllowed(primaryId, lqInput)
        ) {
          classifyState = classifyStateForLinkQualityLeaf(primaryId);
          retryCount = prevRetry;
          summary.assignedPrimary++;
          if (classifyState === 'classified_removal') summary.classifiedRemoval++;
          lastClassifySkipReason = decision.reason ?? 'Link-quality bucket';
        } else if (isLinkQualityLeafId(primaryId)) {
          const retry = applyClassifyRetryPolicy(prevRetry, 'unassigned');
          classifyState = retry.nextState;
          retryCount = retry.nextRetryCount;
          summary.unassigned++;
          summary.pendingDiscover++;
          lastClassifySkipReason =
            decision.reason ?? 'Link-quality rejected — substantive summary; needs topic';
          links.length = 0;
        } else if (isGeneralLeafId(primaryId)) {
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
          // promoteProposedLeaf failed (invalid parentId, name clash with existing leaf, etc.).
          // Before giving up to pending_discover, try to fall back:
          //   1. Existing leaf whose normalized name matches the proposed name (discover already created it).
          //   2. *-general leaf for the proposed parent domain.
          const proposedParentId = decision.proposedCategory?.parentId?.trim();
          const proposedNameNorm = (decision.proposedCategory?.name ?? '')
            .replace(/\s*\/\s*/g, ' ')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

          const existingByName =
            proposedNameNorm.length > 2
              ? categories.find(
                  (c) =>
                    c.kind === 'leaf' &&
                    c.name
                      .replace(/\s*\/\s*/g, ' ')
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, ' ')
                      .trim() === proposedNameNorm
                )
              : null;

          const generalFallback =
            !existingByName && proposedParentId
              ? categories.find(
                  (c) =>
                    c.kind === 'leaf' &&
                    c.parentId === proposedParentId &&
                    isGeneralLeafId(c.id)
                )
              : null;

          const recoveryLeaf = existingByName ?? generalFallback;

          if (recoveryLeaf) {
            categoryIds.add(recoveryLeaf.id);
            links.push({
              id: aiLinkId(batchItem.itemId, recoveryLeaf.id),
              itemId: batchItem.itemId,
              categoryId: recoveryLeaf.id,
              score: existingByName ? 0.82 : 0.70,
              isPrimary: true,
              source: 'ai',
              status: 'suggested',
              created_at: now,
              updated_at: now,
            });
            const outcome = isGeneralLeafId(recoveryLeaf.id) ? 'general' : 'specific';
            const retry = applyClassifyRetryPolicy(prevRetry, outcome);
            classifyState = retry.nextState;
            retryCount = retry.nextRetryCount;
            if (outcome === 'general') {
              summary.classifiedGeneral++;
            } else {
              summary.classifiedSpecific++;
            }
            summary.assignedPrimary++;
            if (retry.routedToManualReview) {
              summary.failureBuckets = bumpFailureBucket(
                summary.failureBuckets,
                outcome === 'general' ? 'manual_review_general' : 'manual_review_new_category'
              );
            }
            lastClassifySkipReason = classifyOutcomeReason(outcome, {
              routedToManualReview: retry.routedToManualReview,
              llmReason: decision.proposedCategory?.description,
            });
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

      batchWrites.push({ itemId: batchItem.itemId, signal, links, removeAiSuggested });
      signalByItem.set(batchItem.itemId, signal);
    }

    // Write each LLM batch to the DB worker immediately — never hold the full run in RAM.
    if (batchWrites.length) {
      reportProgress(opts, {
        phase: 'save',
        label:
          batches.length > 1
            ? `Saving batch ${batchIdx + 1}/${batches.length}…`
            : 'Saving assignments…',
        current: batchIdx + 1,
        total: batches.length,
      });
      await yieldToUi();
      categories = await persistClassifyResults(categories, batchWrites);
      await syncClassifySignalsFromLinks(batchWrites.map((w) => w.itemId));
    }
  }

  const { refreshPipelineCacheFromWorker } = await import('../db');
  await refreshPipelineCacheFromWorker();
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
        sampleBatchSize: APP_DISCOVER_MAP_BATCH_SIZE,
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

export async function discoverBatch(
  opts: {
    maxItems?: number;
    itemIds?: string[];
    singleBatch?: boolean;
    /** Cap MAP batches; omit to process the full sampled pool (ceil(n/batchSize)). */
    maxBatches?: number;
    enforceBulkRunCap?: boolean;
    /** Gap-fill: only general / unassigned / pending_discover (default true). */
    stuckOnly?: boolean;
    /** Only items with no primary category (skip *-general / Other that already have a link). */
    onlyWithoutCategory?: boolean;
    sampleBatchSize?: number;
    /** Override the taxonomy-state maxNewParentsPerDiscover for this specific call. */
    maxNewParentsOverride?: number;
    /** Override the taxonomy-state maxNewLeavesPerDiscover for this specific call. */
    maxNewLeavesOverride?: number;
    onProgress?: (update: ClassifyProgressUpdate) => void;
    signal?: AbortSignal;
  } = {}
): Promise<DiscoverBatchResult> {
  await ensureTaxonomyPatches();
  throwIfAborted(opts.signal);
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
      sampledItemIds: [],
      reclassifyItemIds: [],
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
  const onlyWithoutCategory = opts.onlyWithoutCategory === true;
  const runSummary = emptyDiscoverRunSummary();
  const samples: DiscoverSampleItem[] = [];

  for (const item of items) {
    if (scopeIds && !scopeIds.has(item.id)) continue;
    runSummary.totalConsidered++;
    const enrichment = enrichByItem.get(item.id);
    
    const hints = { aiTags: enrichment?.aiTags };
    const eligibility = assessCategorizationEligibility(item, enrichment, hints);
    
    if (!eligibility.eligible) {
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

    const fairGame = onlyWithoutCategory
      ? itemNeedsDiscoverGapFill({
          eligible: true,
          classifyState: st,
          primaryCategoryId: primaryId,
        })
      : isDiscoverFairGame({
          eligible: true,
          classifyState: st,
          primaryCategoryId: primaryId,
          stuckOnly,
        });
    if (!fairGame) {
      if (stuckOnly && st === 'classified') runSummary.skippedNotStuck++;
      continue;
    }

    const summaryText =
      enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '';
    const classifyText = buildCategorizationText(item, enrichment, {
      includeSnippet: false,
      ...hints,
    });
    const text = classifyText.trim() || summaryText || (item.title || '').trim();
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

  const gapFillMode =
    (stuckOnly || onlyWithoutCategory) && runSummary.stuckPool >= MIN_DISCOVER_POOL;

  if (samples.length < MIN_DISCOVER_POOL && !opts.itemIds?.length) {
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
      sampledItemIds: samples.map((s) => s.itemId),
      reclassifyItemIds: [],
      summary: runSummary,
    };
  }

  const mapBatchSize = opts.sampleBatchSize ?? DISCOVER_MAP_BATCH_SIZE;
  const maxMapBatches = opts.singleBatch ? 1 : opts.maxBatches;
  const mapPlan = planDiscoverMapBatches(samples.length, mapBatchSize, maxMapBatches);
  const sampledForRun = sliceDiscoverMapPool(samples, mapBatchSize, maxMapBatches).flat();
  runSummary.itemsSampled = sampledForRun.length;
  runSummary.discoverBatches = mapPlan.mapBatchCount;

  const maxNewParents = opts.maxNewParentsOverride ?? state.maxNewParentsPerDiscover;
  const maxNewLeaves = opts.maxNewLeavesOverride ?? state.maxNewLeavesPerDiscover;
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
  const categoriesBefore = categories;

  opts.onProgress?.({
    phase: 'discover',
    label: `Map → reduce discover (${runSummary.discoverBatches} map batch(es))…`,
    current: 0,
    total: 1,
  });
  await yieldToUi();

  const mapReduce = await runDiscoverMapReduce(aiSettings, categories, sampledForRun, {
    mapBatchSize,
    maxMapBatches,
    maxNetParents: maxNewParents,
    maxNetLeaves: maxNewLeaves,
    gapFillMode,
    reduceMode: 'per-parent',
    signal: opts.signal,
    onProgress: (msg) => {
      opts.onProgress?.({
        phase: 'discover',
        label: msg,
        current: 0,
        total: 1,
      });
    },
  });

  categories = mapReduce.categories;
  proposedParents = mapReduce.proposedParentsRaw;
  proposedLeaves = mapReduce.proposedLeavesRaw;
  runSummary.proposedParentsRaw = mapReduce.proposedParentsRaw;
  runSummary.proposedLeavesRaw = mapReduce.proposedLeavesRaw;
  runSummary.reduceCalls = mapReduce.reduceCalls;
  runSummary.taxonomyMergeParents = mapReduce.taxonomyMerge.mergedParents;
  runSummary.taxonomyMergeLeaves = mapReduce.taxonomyMerge.mergedLeaves;
  runSummary.mergeAuditCount = mapReduce.mergeAudit.length;
  llmErrors = mapReduce.llmErrors;
  runSummary.llmErrors = mapReduce.llmErrors;

  if (mapReduce.llmErrors > 0) {
    runSummary.failureBuckets = bumpDiscoverFailureBucket(
      runSummary.failureBuckets,
      'llm_batch_error'
    );
    batchErrors.push(`map/reduce: ${mapReduce.llmErrors} LLM error(s)`);
  }

  for (const row of sampledForRun) successfulSampleIds.add(row.itemId);

  const addedParents = mapReduce.addedParents;
  const addedLeaves = mapReduce.addedLeaves;
  const addedAll = [...addedParents, ...addedLeaves];
  const updatedExisting = categories.filter((c) => {
    const before = categoriesBefore.find((b) => b.id === c.id);
    return before && (before.parentId !== c.parentId || before.parentName !== c.parentName);
  });

  runSummary.newParents = addedParents.length;
  runSummary.newLeaves = addedLeaves.length;
  totalNewParents = addedParents.length;
  totalNewLeaves = addedLeaves.length;

  const mergedIds = new Set(categories.map((c) => c.id));
  const deletedByMerge = categoriesBefore
    .map((c) => c.id)
    .filter((id) => !mergedIds.has(id));

  if (addedAll.length || updatedExisting.length || deletedByMerge.length) {
    anyAdded = true;
    taxonomyVersion += 1;
    opts.onProgress?.({
      phase: 'save',
      label: `Saving discover: +${addedParents.length} parents, +${addedLeaves.length} leaves…`,
      current: 0,
      total: 1,
    });
    await yieldToUi();

    const tx = db.transaction(['ai_categories'], 'readwrite');
    const store = tx.objectStore('ai_categories');
    for (const row of [...addedAll, ...updatedExisting]) {
      await store.put(row);
    }
    for (const id of deletedByMerge) {
      await store.delete(id);
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

  if (mapReduce.mergeAudit.length) {
    console.info(
      '[discover] merge audit:',
      mapReduce.mergeAudit.slice(0, 20).map((e) => `${e.absorbed} → ${e.canonical} (${e.source})`)
    );
  }

  await saveTaxonomyState({
    taxonomyVersion,
    lastDiscoverAt: now,
    bulkDiscoverRuns: opts.enforceBulkRunCap
      ? state.bulkDiscoverRuns + 1
      : state.bulkDiscoverRuns,
    lastDiscoverRun: { at: now, summary: runSummary },
  });

  const reclassifyItemIds: string[] = [];
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
    reclassifyItemIds.push(itemId);
  }

  let doneLabel = anyAdded
    ? `Discover done: ${runSummary.itemsSampled} processed · +${totalNewParents} parents · +${totalNewLeaves} leaves`
    : `Discover done: ${runSummary.itemsSampled} processed · 0 added`;
  if (!anyAdded && (proposedParents > 0 || proposedLeaves > 0)) {
    doneLabel += ` (LLM proposed ${proposedParents} parents, ${proposedLeaves} leaves — all duplicates of existing labels)`;
  } else if (!anyAdded && llmErrors >= runSummary.discoverBatches) {
    doneLabel += ` — all ${llmErrors} batch(es) failed (check API key / model)`;
  } else if (!anyAdded && llmErrors > 0) {
    doneLabel += ` · ${llmErrors} batch error(s)`;
  } else if (!anyAdded && taxonomyLeafCountStart >= 35) {
    doneLabel += ` — taxonomy already has ${taxonomyLeafCountStart} leaves (seed includes prior discovery)`;
  }

  opts.onProgress?.({
    phase: 'done',
    label: doneLabel,
    current: runSummary.discoverBatches,
    total: runSummary.discoverBatches,
  });

  notifyDataChanged('categorization.update');

  return {
    newParents: totalNewParents,
    newLeaves: totalNewLeaves,
    itemsSampled: runSummary.itemsSampled,
    discoverBatches: runSummary.discoverBatches,
    proposedParents,
    proposedLeaves,
    llmErrors,
    taxonomyLeafCount: categories.filter((c) => c.kind === 'leaf').length,
    taxonomyVersion,
    shouldReclassify: anyAdded || runSummary.itemsMarkedForReclassify > 0,
    sampledItemIds: [...successfulSampleIds],
    reclassifyItemIds,
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
