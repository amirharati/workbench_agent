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
  isFairGameForCategorization,
  itemNeedsClassify,
} from './categorizationFairGame';
import { hashText } from './textHash';
import { getTaxonomyState, saveTaxonomyState, shouldTriggerDiscover } from './taxonomyState';
import {
  callDiscoveryBatch,
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
} from './types';
import { syncClassifySignalsFromLinks } from '../enrichment/pipelineReset';
import { aiLinkId } from './service';

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
): Promise<{ batch: ClassifyBatchItem | null; eligible: boolean; classifyText: string; hash: string }> {
  const hints = { aiTags: enrichment?.aiTags };
  const eligibility = assessCategorizationEligibility(item, enrichment, hints);
  if (!eligibility.eligible) {
    return { batch: null, eligible: false, classifyText: '', hash: '' };
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
    batch: {
      itemId: item.id,
      title: item.title,
      textForClassification: classifyText,
      enrichmentAiTags: enrichment?.aiTags,
    },
  };
}

export async function getCategorizationQueueStats(): Promise<CategorizationQueueStats> {
  const db = await getDB();
  const state = await getTaxonomyState();
  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];

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
  let unassignedEligible = 0;

  for (const s of signals) {
    const st = s.classifyState ?? 'pending_classify';
    if (st === 'pending_classify') pendingClassify++;
    else if (st === 'pending_reclassify') pendingReclassify++;
    else if (st === 'pending_discover') pendingDiscover++;
    else if (st === 'ineligible') ineligible++;
    else if (st === 'skipped') skipped++;
    else if (st === 'classified') classified++;
    else if (st === 'classified_general') classifiedGeneral++;
    const primaryId = primaryByItem.get(s.itemId);
    const fairGame =
      s.signalStatus === 'ok' &&
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
    unassignedEligible,
    leafCount: categories.filter((c) => c.kind === 'leaf').length,
    parentCount: categories.filter((c) => c.kind === 'parent').length,
    bulkModeActive: state.bulkModeActive,
  };
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
      embeddingModel: prev?.embeddingModel ?? '',
      embedding: prev?.embedding ?? [],
      derivedTags: prev?.derivedTags ?? [],
      signalStatus: prev?.signalStatus ?? 'ok',
      classifyState: 'pending_classify',
      discoverState: prev?.discoverState ?? 'none',
      lastProcessedAt: now,
    };
    await tx.objectStore('ai_item_signals').put(next);
  }
  await tx.done;
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

  const toProcess: Array<{ item: Item; batch: ClassifyBatchItem; hash: string }> = [];

  for (const item of items) {
    const enrichment = enrichByItem.get(item.id);
    const built = await buildClassifyBatchItem(item, enrichment);
    if (!built.eligible || !built.batch) {
      continue;
    }
    const prev = signalByItem.get(item.id);
    const st = prev?.classifyState;
    const hashMatch = prev?.classifyTextHash === built.hash;
    const primaryId = primaryCategoryByItem.get(item.id);

    if (
      !itemNeedsClassify(st, primaryId, hashMatch, true, opts.forceReclassify)
    ) {
      continue;
    }

    toProcess.push({ item, batch: built.batch, hash: built.hash });
    if (opts.maxItems && toProcess.length >= opts.maxItems) break;
  }

  const summary = {
    processed: 0,
    skippedIneligible: 0,
    skippedHash: 0,
    skippedLlm: 0,
    assignedPrimary: 0,
    assignedSecondary: 0,
    multiLabel: 0,
    unassigned: 0,
    pendingDiscover: 0,
    llmErrors: 0,
    batches: 0,
  };

  if (!toProcess.length) {
    reportProgress(opts, {
      phase: 'done',
      label: 'Nothing to classify (import seed, enrich items, or lower filters)',
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

      let classifyState: ClassifyState = 'pending_classify';
      const links: AiItemCategoryLink[] = [];
      let removeAiSuggested = true;

      if (!decision || decision.status === 'error') {
        classifyState = 'pending_classify';
        summary.llmErrors++;
      } else if (decision.decisionType === 'none' && !decision.categoryIds?.length) {
        const isSkip = (decision.reason || '').length > 0 && decision.confidence != null && decision.confidence >= 0.7;
        classifyState = isSkip ? 'skipped' : 'pending_discover';
        if (!isSkip) summary.unassigned++;
        else summary.skippedLlm++;
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
        classifyState = isGeneralLeafId(primaryId) ? 'classified_general' : 'classified';
        summary.assignedPrimary++;
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
          classifyState = 'classified';
          summary.assignedPrimary++;
        } else {
          classifyState = 'pending_discover';
          summary.pendingDiscover++;
          summary.unassigned++;
        }
      } else if (decision.decisionType === 'new_category') {
        classifyState = 'pending_discover';
        summary.pendingDiscover++;
        summary.unassigned++;
      } else {
        classifyState = 'pending_discover';
        summary.unassigned++;
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
        isNovelty: classifyState === 'pending_discover' || classifyState === 'pending_classify',
        lastProcessedAt: now,
        lastClassifiedAt: now,
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
  await saveTaxonomyState({ lastClassifyAt: Date.now() });

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
      await discoverBatch({ singleBatch: true, enforceBulkRunCap: true });
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
const DISCOVER_SAMPLE_BATCH = 32;

function discoverStuckKind(
  classifyState?: ClassifyState,
  primaryCategoryId?: string
): DiscoverSampleItem['stuckKind'] | undefined {
  if (classifyState === 'pending_discover') return 'pending_discover';
  if (
    classifyState === 'classified_general' ||
    (primaryCategoryId && isGeneralLeafId(primaryCategoryId))
  ) {
    return 'general';
  }
  if (
    !primaryCategoryId &&
    classifyState !== 'classified' &&
    classifyState !== 'skipped' &&
    classifyState !== 'ineligible'
  ) {
    return 'unassigned';
  }
  return undefined;
}

function discoverSamplePriority(s: DiscoverSampleItem): number {
  if (s.stuckKind === 'pending_discover') return 0;
  if (s.stuckKind === 'general') return 1;
  if (s.stuckKind === 'unassigned') return 2;
  return 3;
}

export async function discoverBatch(
  opts: {
    /** Limit how many items to scan (default: all eligible in scope). */
    maxItems?: number;
    /** When set, only these item ids (e.g. Enrichment Results list). */
    itemIds?: string[];
    /** One LLM call on first chunk only (auto-discover after classify). */
    singleBatch?: boolean;
    /** Respect maxBulkDiscoverRuns (auto-discover only). Manual Discover ignores. */
    enforceBulkRunCap?: boolean;
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

  const samples: DiscoverSampleItem[] = [];
  for (const item of items) {
    if (scopeIds && !scopeIds.has(item.id)) continue;
    const enrichment = enrichByItem.get(item.id);
    const built = await buildClassifyBatchItem(item, enrichment);
    if (!built.eligible) continue;

    const prev = signalByItem.get(item.id);
    const primaryId = primaryCategoryByItem.get(item.id);
    if (
      !isFairGameForCategorization({
        eligible: true,
        classifyState: prev?.classifyState,
        primaryCategoryId: primaryId,
      })
    ) {
      continue;
    }

    const summary =
      enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '';
    const text = built.classifyText.trim() || summary || (item.title || '').trim();
    if (text.length < 40) continue;
    const stuckKind = discoverStuckKind(prev?.classifyState, primaryId);
    samples.push({
      itemId: item.id,
      title: item.title || '',
      aiSummary: summary || text.slice(0, 2000),
      stuckKind,
    });
    if (opts.maxItems && samples.length >= opts.maxItems) break;
  }

  samples.sort((a, b) => discoverSamplePriority(a) - discoverSamplePriority(b));

  const stuckInBatch = samples.filter(
    (s) => s.stuckKind && s.stuckKind !== 'retry'
  ).length;
  const gapFillMode = !opts.singleBatch && stuckInBatch >= Math.min(3, samples.length);

  if (samples.length < 3) {
    opts.onProgress?.({
      phase: 'done',
      label: 'Not enough items to discover (need ≥3 with AI summary)',
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
    };
  }

  const batchSize = opts.sampleBatchSize ?? DISCOVER_SAMPLE_BATCH;
  const sampleChunks = opts.singleBatch
    ? [samples.slice(0, batchSize)]
    : chunk(samples, batchSize);

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

  for (let i = 0; i < sampleChunks.length; i++) {
    const chunkSamples = sampleChunks[i];
    const parents = getParentsFromCategories(categories);

    opts.onProgress?.({
      phase: 'discover',
      label: `Discover batch ${i + 1}/${sampleChunks.length} (${chunkSamples.length} items)…`,
      current: i,
      total: sampleChunks.length,
    });
    await yieldToUi();

    const resp = await callDiscoveryBatch(aiSettings, parents, categories, chunkSamples, {
      maxNewParents,
      maxNewLeaves: state.maxNewLeavesPerDiscover,
      gapFillMode,
    });

    let addedParents: AiCategory[] = [];
    let addedLeaves: AiCategory[] = [];
    if (!resp.ok) {
      llmErrors++;
      if (resp.error) batchErrors.push(`batch ${i + 1}: ${resp.error}`);
    } else if (resp.data) {
      const rawParents = resp.data.newParents ?? [];
      const rawLeaves = resp.data.newLeaves ?? [];
      proposedParents += rawParents.length;
      proposedLeaves += rawLeaves.length;

      const merged = mergeDiscoveryTaxonomy(categories, resp.data, {
        maxNewParents,
        maxNewLeaves: state.maxNewLeavesPerDiscover,
        now,
      });
      addedParents = merged.addedParents;
      addedLeaves = merged.addedLeaves;
      categories = merged.categories;
    }

    const addedAll = [...addedParents, ...addedLeaves];
    if (addedAll.length) {
      anyAdded = true;
      totalNewParents += addedParents.length;
      totalNewLeaves += addedLeaves.length;
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
  });

  const sampledIds = new Set(samples.map((s) => s.itemId));
  for (const itemId of sampledIds) {
    const sig = await db.get('ai_item_signals', itemId);
    if (!sig) continue;
    const st = sig.classifyState;
    if (st !== 'pending_discover' && sig.discoverState !== 'pending') continue;
    await db.put('ai_item_signals', {
      ...sig,
      classifyState: 'pending_classify',
      discoverState: 'done',
      lastProcessedAt: now,
    });
  }

  let doneLabel = anyAdded
    ? `Discover done: ${samples.length} items · ${sampleChunks.length} batches · +${totalNewParents} parents · +${totalNewLeaves} leaves`
    : `Discover done: ${samples.length} items · ${sampleChunks.length} batches · 0 added`;
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
    itemsSampled: samples.length,
    discoverBatches: sampleChunks.length,
    proposedParents,
    proposedLeaves,
    llmErrors,
    taxonomyLeafCount: categories.filter((c) => c.kind === 'leaf').length,
    taxonomyVersion,
    shouldReclassify: anyAdded,
    batchErrors: batchErrors.length ? batchErrors : undefined,
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
