import { getDB, type Item } from '../db';
import type { ItemEnrichment, EnrichmentReference } from '../enrichment/types';
import { assessCategorizationEligibility } from '../enrichment/categorizationEligibility';
import { getAiCategories } from '../categorization';
import { hasSpecificPrimaryTopic } from '../categorization/categorizationFairGame';
import { linkCountsForCategories, primaryLeafIdFromLinks, resolveEffectiveClassifyState } from '../categorization/counts';
import { isGeneralLeafId } from '../categorization/taxonomyCatalog';
import type { AiCategory, AiItemCategoryLink, AiItemSignal, ClassifyState } from '../categorization/types';
import {
  AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE,
  formatEnrichmentFailureMessage,
} from '../enrichment/errorMessages';
import {
  countFailuresByCategory,
  formatFailureCategoryBreakdown,
  isEnrichmentFailure,
  resolveEnrichmentFailureLabel,
  type FailureCategoryCounts,
} from '../enrichment/failureLabels';
import type { PipelineBadge } from './pipelineBadge';
import { resolvePipelineBadge } from './pipelineBadge';
import { formatPipelineMissingSteps, resolvePipelineStage } from './pipelineStage';

const COUNTABLE_LINK_STATUSES = new Set(['suggested', 'accepted']);

export interface ItemPipelineContext {
  item: Item;
  enrichment?: ItemEnrichment;
  signal?: AiItemSignal;
  classifyState: ClassifyState;
  eligible: boolean;
  eligibilityReason?: string;
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  primaryCategoryParentName: string | null;
  /** `Parent › leaf` when parent exists — matches Hub classify queue column. */
  primaryTopicPath: string | null;
  acceptedLinks: Array<{ categoryId: string; name: string; parentName?: string; isPrimary: boolean }>;
  suggestedLinks: Array<{ categoryId: string; name: string; parentName?: string; isPrimary: boolean; score: number }>;
  hasSuggestedLinks: boolean;
  summary?: string;
  keyPoints: string[];
  references: EnrichmentReference[];
}

export interface ProcessingDigest {
  manualReview: number;
  suggestedCategories: number;
  enrichFailed: number;
  notEnriched: number;
  pendingClassify: number;
  healthy: boolean;
  /** Breakdown of enrich_failed by category slug (auth, bot, ai_empty, …). */
  enrichFailedByCategory?: FailureCategoryCounts;
  enrichFailedBreakdown?: string;
}

export type PipelineQueueKind =
  | 'manual_review'
  | 'suggested_categories'
  | 'enrich_failed'
  | 'pending_classify'
  | 'not_enriched';

export const PIPELINE_QUEUE_LABELS: Record<PipelineQueueKind, string> = {
  manual_review: 'Manual review',
  suggested_categories: 'AI categories',
  enrich_failed: 'Enrich failed',
  pending_classify: 'Classify queue',
  not_enriched: 'Not enriched',
};

export const PIPELINE_QUEUE_HINTS: Record<PipelineQueueKind, string> = {
  suggested_categories: 'AI-suggested categories awaiting accept or reject',
  manual_review: 'Flagged for manual category review',
  enrich_failed: 'Fetch or AI step failed — filter by error type in Enrichment Hub',
  pending_classify:
    'Bookmarks waiting on AI categories — includes discover retries and general/Other, not only fresh items',
  not_enriched: 'No enrichment yet — use Process not enriched to fetch and summarize',
};

export interface PipelineQueues {
  manualReview: string[];
  suggestedCategories: string[];
  enrichFailed: string[];
  pendingClassify: string[];
  notEnriched: string[];
}

export interface PipelineBrowseFilter {
  kind: PipelineQueueKind;
  label: string;
  itemIds: string[];
}

export interface CategoryOverviewTile {
  categoryId: string;
  name: string;
  itemCount: number;
}

export interface CategoryBrowseFilter {
  categoryId: string;
  name: string;
  itemIds: string[];
}

function computePipelineQueues(
  items: Item[],
  enrichByItem: Map<string, ItemEnrichment>,
  signalByItem: Map<string, AiItemSignal>,
  links: AiItemCategoryLink[]
): PipelineQueues {
  const primaryByItem = new Map<string, string>();
  const suggestedByItem = new Set<string>();
  for (const l of links) {
    if (l.source === 'ai' && l.status === 'suggested') {
      suggestedByItem.add(l.itemId);
    }
    if (l.isPrimary && COUNTABLE_LINK_STATUSES.has(l.status)) {
      primaryByItem.set(l.itemId, l.categoryId);
    }
  }

  const manualReview: string[] = [];
  const suggestedCategories: string[] = [];
  const enrichFailed: string[] = [];
  const pendingSet = new Set<string>();
  const notEnriched: string[] = [];

  for (const item of items) {
    if (!item.url?.trim()) continue;
    const enrichment = enrichByItem.get(item.id);
    const signal = signalByItem.get(item.id);

    if (!enrichment || enrichment.status === 'none') {
      notEnriched.push(item.id);
      continue;
    }

    if (isEnrichmentFailure(enrichment, signal?.signalStatus === 'embed_failed')) {
      enrichFailed.push(item.id);
    }

    const primaryId = primaryByItem.get(item.id);
    const st = resolveEffectiveClassifyState({
      signalState: signal?.classifyState,
      primaryCategoryId: primaryId,
    });

    if (st === 'manual_review') {
      manualReview.push(item.id);
    }
    if (suggestedByItem.has(item.id)) {
      suggestedCategories.push(item.id);
    }

    if (enrichment.aiStatus !== 'ok' && !signal) continue;

    if (st === 'pending_classify') {
      pendingSet.add(item.id);
    } else {
      const fairGame =
        (signal?.signalStatus === 'ok' || enrichment.aiStatus === 'ok') &&
        st !== 'skipped' &&
        st !== 'ineligible' &&
        st !== 'manual_only' &&
        (st === 'pending_discover' ||
          st === 'pending_reclassify' ||
          st === 'classified_general' ||
          !primaryId ||
          (primaryId && isGeneralLeafId(primaryId)));
      if (fairGame && !hasSpecificPrimaryTopic(primaryId, st)) {
        pendingSet.add(item.id);
      }
    }
  }

  return {
    manualReview,
    suggestedCategories,
    enrichFailed,
    pendingClassify: [...pendingSet],
    notEnriched,
  };
}

async function loadPipelineQueueData() {
  const db = await getDB();
  const items = (await db.getAll('items')).filter((i) => !!i.url?.trim() && i.deletedAt == null);
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  return computePipelineQueues(
    items,
    new Map(enrichments.map((e) => [e.itemId, e])),
    new Map(signals.map((s) => [s.itemId, s])),
    links
  );
}

function buildContextForItem(
  item: Item,
  enrichByItem: Map<string, ItemEnrichment>,
  signalByItem: Map<string, AiItemSignal>,
  linksByItem: Map<string, AiItemCategoryLink[]>,
  categoryById: Map<string, AiCategory>
): ItemPipelineContext {
  const enrichment = enrichByItem.get(item.id);
  const signal = signalByItem.get(item.id);
  const itemLinks = linksByItem.get(item.id) ?? [];
  const eligibility = assessCategorizationEligibility(item, enrichment, {
    aiTags: enrichment?.aiTags,
  });
  const primaryCategoryId = primaryLeafIdFromLinks(itemLinks);
  const classifyState = resolveEffectiveClassifyState({
    signalState: signal?.classifyState,
    primaryCategoryId,
    eligible: eligibility.eligible,
  });

  const mapLink = (l: AiItemCategoryLink) => {
    const category = categoryById.get(l.categoryId);
    const parentName = category?.kind === 'leaf' && category.parentId
      ? categoryById.get(category.parentId)?.name ?? category.parentName ?? undefined
      : undefined;
    return {
      categoryId: l.categoryId,
      name: category?.name ?? l.categoryId,
      parentName,
      isPrimary: l.isPrimary,
      score: l.score,
    };
  };

  const acceptedLinks = itemLinks
    .filter((l) => l.status === 'accepted')
    .map((l) => mapLink(l))
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

  const suggestedLinks = itemLinks
    .filter((l) => l.status === 'suggested')
    .map((l) => mapLink(l))
    .sort((a, b) => b.score - a.score);

  const primaryLeaf = primaryCategoryId ? categoryById.get(primaryCategoryId) : undefined;
  const parentName = primaryLeaf?.parentId
    ? categoryById.get(primaryLeaf.parentId)?.name ?? null
    : null;
  const primaryCategoryName = primaryLeaf?.name ?? null;
  const primaryTopicPath =
    primaryLeaf && parentName
      ? `${parentName} › ${primaryLeaf.name}`
      : primaryCategoryName;

  return {
    item,
    enrichment,
    signal,
    classifyState,
    eligible: eligibility.eligible,
    eligibilityReason: eligibility.reason,
    primaryCategoryId,
    primaryCategoryName,
    primaryCategoryParentName: parentName,
    primaryTopicPath,
    acceptedLinks,
    suggestedLinks,
    hasSuggestedLinks: suggestedLinks.length > 0,
    summary: enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() : undefined,
    keyPoints:
      enrichment?.aiStatus === 'ok'
        ? (enrichment.aiKeyPoints ?? []).filter((p) => p?.trim())
        : [],
    references: enrichment?.references ?? [],
  };
}

/** True when any enrichment, classification, or AI summary data exists (including partial/failed). */
export function hasPartialPipelineData(ctx: ItemPipelineContext | null | undefined): boolean {
  if (!ctx) return false;
  if (ctx.summary?.trim() || ctx.keyPoints.length > 0) return true;
  if (ctx.references.length > 0) return true;
  if (ctx.acceptedLinks.length > 0 || ctx.suggestedLinks.length > 0) return true;
  if (ctx.primaryCategoryName) return true;
  const e = ctx.enrichment;
  if (e?.snippet?.trim()) return true;
  if (e?.status && e.status !== 'none') return true;
  if (e?.aiStatus && e.aiStatus !== 'not_configured') return true;
  if (ctx.signal?.classifyState) return true;
  return false;
}

export function formatPipelineStageHint(ctx: ItemPipelineContext): string | undefined {
  const parts: string[] = [];
  const e = ctx.enrichment;
  const failureLabel = resolveEnrichmentFailureLabel(
    e,
    ctx.signal?.signalStatus === 'embed_failed'
  );
  if (failureLabel) {
    parts.push(failureLabel.detail ? `${failureLabel.label} — ${failureLabel.detail}` : failureLabel.label);
  } else if (e?.status === 'failed') {
    const detail = formatEnrichmentFailureMessage(e);
    parts.push(detail ?? (e.lastErrorCode ? `Fetch failed (${e.lastErrorCode})` : 'Fetch failed'));
  } else if (e?.status === 'pending') {
    parts.push('Fetch in progress…');
  } else if (e?.status === 'ok' && e.aiStatus === 'not_configured') {
    parts.push(AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE);
  } else if (e?.aiStatus && e.aiStatus !== 'ok' && e.aiStatus !== 'not_configured') {
    parts.push(`AI extract: ${e.aiStatus.replace(/_/g, ' ')}`);
  } else if (e?.status === 'ok' && e.aiStatus !== 'ok' && !ctx.summary) {
    parts.push('Page fetched — summary not ready');
  }
  if (ctx.classifyState === 'manual_review') {
    parts.push('Needs manual category review');
  } else if (ctx.classifyState === 'pending_reclassify') {
    parts.push('Queued for re-classify');
  } else if (
    ctx.eligible &&
    !ctx.primaryCategoryId &&
    ctx.suggestedLinks.length === 0 &&
    e?.aiStatus === 'ok'
  ) {
    parts.push('Ready to classify');
  }
  const stage = resolvePipelineStage(ctx);
  const missingHint = formatPipelineMissingSteps(stage.missing);
  if (missingHint && stage.level === 'summarized') {
    parts.push(missingHint);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

export async function loadItemPipelineContext(itemId: string): Promise<ItemPipelineContext | null> {
  const { commitPendingDbWrites } = await import('../db');
  await commitPendingDbWrites();
  const { getRemoteStore, isDbWorkerProcess } = await import('../storage/dbClient');
  if (!isDbWorkerProcess()) {
    const { getSignalMetadataByItemIds } = await import('../storage/dbClient');
    const [seed, signalMetadata] = await Promise.all([
      getRemoteStore().createPipelineCacheSeed([itemId]),
      getSignalMetadataByItemIds<AiItemSignal>([itemId]),
    ]);
    const item = seed.items.find((row) => row.id === itemId);
    if (!item) return null;
    const enrichByItem = new Map(seed.enrichment.map((row) => [row.itemId, row]));
    const authoritativeSignal = signalMetadata[0];
    const signalRows = authoritativeSignal ? [authoritativeSignal] : seed.signals;
    const signalByItem = new Map(signalRows.map((row) => [row.itemId, row]));
    const linksByItem = new Map<string, AiItemCategoryLink[]>();
    for (const link of seed.links) {
      const list = linksByItem.get(link.itemId) ?? [];
      list.push(link);
      linksByItem.set(link.itemId, list);
    }
    return buildContextForItem(
      item,
      enrichByItem,
      signalByItem,
      linksByItem,
      new Map(seed.categories.map((category) => [category.id, category]))
    );
  }
  const db = await getDB();
  const item = await db.get('items', itemId);
  if (!item) return null;

  const { loadScopedPipelineRows } = await import('./scopedPipelineRows');
  const scoped = await loadScopedPipelineRows([itemId]);
  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const linksByItem = new Map<string, AiItemCategoryLink[]>();
  for (const link of scoped.links) {
    const list = linksByItem.get(link.itemId) ?? [];
    list.push(link);
    linksByItem.set(link.itemId, list);
  }

  let ctx = buildContextForItem(
    item,
    scoped.enrichByItem,
    scoped.signalByItem,
    linksByItem,
    categoryById
  );

  const orphan =
    (ctx.classifyState === 'classified' || ctx.classifyState === 'classified_general') &&
    !ctx.primaryCategoryId &&
    ctx.suggestedLinks.length === 0 &&
    ctx.acceptedLinks.length === 0;

  if (orphan && db.objectStoreNames.contains('ai_item_signals')) {
    const now = Date.now();
    await db.put('ai_item_signals', {
      ...ctx.signal,
      itemId: ctx.item.id,
      textHash: ctx.signal?.textHash ?? '',
      classifyTextHash: ctx.signal?.classifyTextHash ?? '',
      embeddingModel: ctx.signal?.embeddingModel ?? '',
      embedding: ctx.signal?.embedding ?? [],
      derivedTags: ctx.signal?.derivedTags ?? [],
      signalStatus: ctx.signal?.signalStatus ?? 'ok',
      classifyState: 'pending_classify',
      discoverState: 'none',
      isNovelty: false,
      classifyRetryCount: 0,
      lastClassifySkipReason: 'Re-queued — classified without stored category',
      lastProcessedAt: now,
      llmReview: undefined,
      lastClassifiedAt: undefined,
    });
    const refreshed = await loadScopedPipelineRows([itemId]);
    const refreshedLinks = new Map<string, AiItemCategoryLink[]>();
    for (const link of refreshed.links) {
      const list = refreshedLinks.get(link.itemId) ?? [];
      list.push(link);
      refreshedLinks.set(link.itemId, list);
    }
    ctx = buildContextForItem(
      item,
      refreshed.enrichByItem,
      refreshed.signalByItem,
      refreshedLinks,
      categoryById
    );
  }

  return ctx;
}

export async function loadPipelineBadgeMap(
  itemIds: string[],
  options?: { priority?: 'high' | 'low' }
): Promise<Map<string, PipelineBadge>> {
  const map = new Map<string, PipelineBadge>();
  if (!itemIds.length) return map;

  // Library badges are compact derived data. Compute them once in the shared
  // DB owner instead of hydrating every pipeline table into each dashboard.
  const { dbRpc, isDbWorkerProcess } = await import('../storage/dbClient');
  if (!isDbWorkerProcess()) {
    const entries = await dbRpc<Array<[string, PipelineBadge]>>(
      'getPipelineBadgeEntries',
      [itemIds],
      { priority: options?.priority ?? 'low' }
    );
    return new Map(entries);
  }

  const db = await getDB();
  const { loadScopedPipelineRows } = await import('./scopedPipelineRows');
  const scoped = await loadScopedPipelineRows(itemIds);
  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];
  return buildPipelineBadgeMap({
    items: scoped.items,
    enrichments: [...scoped.enrichByItem.values()],
    signals: [...scoped.signalByItem.values()],
    links: scoped.links,
    categories,
  });
}

export function buildPipelineBadgeMap(input: {
  items: Item[];
  enrichments: ItemEnrichment[];
  signals: AiItemSignal[];
  links: AiItemCategoryLink[];
  categories: AiCategory[];
}): Map<string, PipelineBadge> {
  const map = new Map<string, PipelineBadge>();
  const enrichByItem = new Map(input.enrichments.map((row) => [row.itemId, row]));
  const signalByItem = new Map(input.signals.map((row) => [row.itemId, row]));
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const linksByItem = new Map<string, AiItemCategoryLink[]>();
  for (const link of input.links) {
    const list = linksByItem.get(link.itemId) ?? [];
    list.push(link);
    linksByItem.set(link.itemId, list);
  }

  for (const item of input.items) {
    const ctx = buildContextForItem(
      item,
      enrichByItem,
      signalByItem,
      linksByItem,
      categoryById
    );
    map.set(item.id, resolvePipelineBadge(ctx));
  }

  return map;
}

export async function loadProcessingDigest(): Promise<ProcessingDigest> {
  const q = await loadPipelineQueueData();
  const db = await getDB();
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const failedIds = new Set(q.enrichFailed);
  const embedFailedIds = new Set(
    signals.filter((s) => s.signalStatus === 'embed_failed').map((s) => s.itemId)
  );
  const failedEnrichments = enrichments.filter((e) => failedIds.has(e.itemId));
  const enrichFailedByCategory = countFailuresByCategory(failedEnrichments, embedFailedIds);
  const enrichFailedBreakdown = formatFailureCategoryBreakdown(enrichFailedByCategory);

  const digest: ProcessingDigest = {
    manualReview: q.manualReview.length,
    suggestedCategories: q.suggestedCategories.length,
    enrichFailed: q.enrichFailed.length,
    notEnriched: q.notEnriched.length,
    pendingClassify: q.pendingClassify.length,
    healthy:
      q.manualReview.length === 0 &&
      q.suggestedCategories.length === 0 &&
      q.enrichFailed.length === 0 &&
      q.pendingClassify.length === 0,
    enrichFailedByCategory,
    enrichFailedBreakdown: enrichFailedBreakdown || undefined,
  };
  return digest;
}

export async function loadItemIdsForPipelineQueue(kind: PipelineQueueKind): Promise<string[]> {
  const q = await loadPipelineQueueData();
  switch (kind) {
    case 'manual_review':
      return q.manualReview;
    case 'suggested_categories':
      return q.suggestedCategories;
    case 'enrich_failed':
      return q.enrichFailed;
    case 'pending_classify':
      return q.pendingClassify;
    case 'not_enriched':
      return q.notEnriched;
    default:
      return [];
  }
}

export async function loadLibraryCategoryOverview(limit = 8): Promise<CategoryOverviewTile[]> {
  const categories = await getAiCategories();
  const db = await getDB();
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const counts = linkCountsForCategories(categories, links);

  return categories
    .filter((c) => c.kind === 'leaf' && c.status !== 'deprecated' && c.assignable !== false)
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      itemCount: counts.get(c.id)?.itemCount ?? 0,
    }))
    .filter((t) => t.itemCount > 0)
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, limit);
}

export async function loadItemIdsForCategory(categoryId: string): Promise<string[]> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) return [];

  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];
  const target = categories.find((c) => c.id === categoryId);
  const leafIds = new Set<string>();
  if (target?.kind === 'parent') {
    for (const c of categories) {
      if (c.kind === 'leaf' && c.parentId === categoryId) {
        leafIds.add(c.id);
      }
    }
  } else {
    leafIds.add(categoryId);
  }
  if (!leafIds.size) return [];

  const links = await db.getAll('ai_item_category_links');
  const ids = new Set<string>();
  for (const l of links) {
    if (!leafIds.has(l.categoryId)) continue;
    if (!COUNTABLE_LINK_STATUSES.has(l.status)) continue;
    ids.add(l.itemId);
  }
  return [...ids];
}
