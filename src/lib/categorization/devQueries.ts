import { getDB } from '../db';
import type { Item } from '../db';
import type { ItemEnrichment } from '../enrichment/types';
import { assessCategorizationEligibility } from '../enrichment/categorizationEligibility';
import { linkCountsForCategories, resolveEffectiveClassifyState } from './counts';
import { hasSpecificPrimaryTopic } from './categorizationFairGame';
import { getCategorizationQueueStats } from './classifyTopicExtract';
import type { AiCategory, ClassifyState, ClassifyInputQualityTier } from './types';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);

export type PipelineQueueFilter =
  | 'all'
  | 'needs_attention'
  | 'no_signal'
  | ClassifyState;

export interface PipelineQueueItemRow {
  item: Item;
  enrichment?: ItemEnrichment;
  classifyState?: ClassifyState;
  /** Raw signal row absent — eligible AI-ready items should be pending after backfill. */
  hasSignal: boolean;
  primaryCategoryId?: string | null;
  primaryCategoryName?: string | null;
  parentCategoryName?: string | null;
  topicPath?: string | null;
  eligible: boolean;
  eligibilityReason?: string;
  classifyRetryCount?: number;
  inputQualityTier?: ClassifyInputQualityTier;
  lastClassifySkipReason?: string;
}

export interface TaxonomyLeafRow {
  category: AiCategory;
  itemCount: number;
  primaryItemCount: number;
  secondaryItemCount: number;
}

export interface TaxonomyParentRow {
  category: AiCategory;
  itemCount: number;
  primaryItemCount: number;
  secondaryItemCount: number;
  childLeafCount: number;
  leaves: TaxonomyLeafRow[];
}

export async function listPipelineQueueItems(
  filter: PipelineQueueFilter = 'all',
  search = ''
): Promise<PipelineQueueItemRow[]> {
  const db = await getDB();
  const items = (await db.getAll('items')).filter((i) => !!i.url?.trim());
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
  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const parentNameById = new Map(
    categories.filter((c) => c.kind === 'parent').map((c) => [c.id, c.name])
  );

  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (l.source !== 'ai' || !l.isPrimary || !COUNTABLE_STATUSES.has(l.status)) continue;
    primaryByItem.set(l.itemId, l.categoryId);
  }

  const q = search.trim().toLowerCase();
  const rows: PipelineQueueItemRow[] = [];

  for (const item of items) {
    const enrichment = enrichByItem.get(item.id);
    const signal = signalByItem.get(item.id);
    const st = signal?.classifyState;
    const primaryId = primaryByItem.get(item.id) ?? null;
    const leaf = primaryId ? catById.get(primaryId) : undefined;
    const parentName = leaf?.parentId ? parentNameById.get(leaf.parentId) ?? null : null;
    const eligibility = assessCategorizationEligibility(item, enrichment);
    const effectiveSt = resolveEffectiveClassifyState({
      signalState: st,
      primaryCategoryId: primaryId,
    });
    const topicPath =
      leaf && parentName ? `${parentName} › ${leaf.name}` : leaf?.name ?? null;

    const row: PipelineQueueItemRow = {
      item,
      enrichment,
      classifyState: effectiveSt,
      hasSignal: !!signal,
      primaryCategoryId: primaryId,
      primaryCategoryName: leaf?.name ?? null,
      parentCategoryName: parentName,
      topicPath,
      eligible: eligibility.eligible,
      eligibilityReason: signal?.eligibilityReason ?? eligibility.reason,
      classifyRetryCount: signal?.classifyRetryCount,
      inputQualityTier: signal?.inputQualityTier,
      lastClassifySkipReason: signal?.lastClassifySkipReason,
    };

    if (q) {
      const hay =
        `${item.title || ''} ${item.url || ''} ${topicPath || ''} ${effectiveSt || ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    if (!matchesPipelineFilter(filter, row)) continue;
    rows.push(row);
  }

  rows.sort((a, b) => {
    const sa = classifySortRank(a.classifyState);
    const sb = classifySortRank(b.classifyState);
    if (sa !== sb) return sa - sb;
    return (b.item.updated_at || 0) - (a.item.updated_at || 0);
  });

  return rows;
}

function classifySortRank(st?: ClassifyState): number {
  const order: ClassifyState[] = [
    'pending_classify',
    'pending_reclassify',
    'pending_discover',
    'classified_general',
    'manual_review',
    'ineligible',
    'skipped',
    'classified',
    'manual_only',
  ];
  if (!st) return -1;
  const i = order.indexOf(st);
  return i >= 0 ? i : 99;
}

function matchesPipelineFilter(
  filter: PipelineQueueFilter,
  row: PipelineQueueItemRow
): boolean {
  const st = row.classifyState;
  const primaryId = row.primaryCategoryId;
  if (filter === 'all') return true;
  if (filter === 'no_signal') return !row.hasSignal && row.enrichment?.aiStatus === 'ok';
  if (filter === 'needs_attention') {
    if (hasSpecificPrimaryTopic(primaryId, st)) return false;
    if (st === 'skipped' || st === 'manual_only') return false;
    return true;
  }
  return st === filter;
}

export async function getTaxonomyTreeWithCounts(): Promise<{
  parents: TaxonomyParentRow[];
  orphanLeaves: TaxonomyLeafRow[];
  totals: { parents: number; leaves: number; itemsWithPrimary: number };
}> {
  const db = await getDB();
  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const counts = linkCountsForCategories(categories, links);

  const parents = categories
    .filter((c) => c.kind === 'parent' && c.status !== 'deprecated')
    .sort((a, b) => a.name.localeCompare(b.name));

  const leaves = categories.filter((c) => c.kind === 'leaf' && c.status !== 'deprecated');

  const parentRows: TaxonomyParentRow[] = parents.map((parent) => {
    const parentCounts = counts.get(parent.id) ?? {
      itemCount: 0,
      primaryItemCount: 0,
      secondaryItemCount: 0,
    };
    const childLeaves = leaves
      .filter((l) => l.parentId === parent.id)
      .map((leaf) => {
        const n = counts.get(leaf.id) ?? { itemCount: 0, primaryItemCount: 0, secondaryItemCount: 0 };
        return {
          category: { ...leaf, ...n },
          itemCount: n.itemCount,
          primaryItemCount: n.primaryItemCount,
          secondaryItemCount: n.secondaryItemCount,
        };
      })
      .sort((a, b) => b.primaryItemCount - a.primaryItemCount || a.category.name.localeCompare(b.category.name));

    return {
      category: { ...parent, ...parentCounts, childLeafCount: childLeaves.length },
      ...parentCounts,
      childLeafCount: childLeaves.length,
      leaves: childLeaves,
    };
  });

  parentRows.sort(
    (a, b) => b.primaryItemCount - a.primaryItemCount || a.category.name.localeCompare(b.category.name)
  );

  const orphanLeaves = leaves
    .filter((l) => !l.parentId || !parents.some((p) => p.id === l.parentId))
    .map((leaf) => {
      const n = counts.get(leaf.id) ?? { itemCount: 0, primaryItemCount: 0, secondaryItemCount: 0 };
      return {
        category: { ...leaf, ...n },
        itemCount: n.itemCount,
        primaryItemCount: n.primaryItemCount,
        secondaryItemCount: n.secondaryItemCount,
      };
    })
    .sort((a, b) => b.primaryItemCount - a.primaryItemCount);

  const itemsWithPrimary = new Set<string>();
  for (const l of links) {
    if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
      itemsWithPrimary.add(l.itemId);
    }
  }

  return {
    parents: parentRows,
    orphanLeaves,
    totals: {
      parents: parentRows.length,
      leaves: leaves.length,
      itemsWithPrimary: itemsWithPrimary.size,
    },
  };
}

export async function getPipelineQueueFilterCounts(): Promise<{
  counts: Record<PipelineQueueFilter, number>;
  queue: Awaited<ReturnType<typeof getCategorizationQueueStats>>;
}> {
  const rows = await listPipelineQueueItems('all');
  const counts: Record<string, number> = {
    all: rows.length,
    needs_attention: 0,
    no_signal: 0,
    pending_classify: 0,
    pending_reclassify: 0,
    pending_discover: 0,
    classified_general: 0,
    manual_review: 0,
    ineligible: 0,
    skipped: 0,
    classified: 0,
    manual_only: 0,
  };

  for (const row of rows) {
    if (matchesPipelineFilter('needs_attention', row)) {
      counts.needs_attention++;
    }
    if (matchesPipelineFilter('no_signal', row)) {
      counts.no_signal++;
    }
    const st = row.classifyState ?? 'pending_classify';
    if (st in counts) counts[st]++;
  }

  const queue = await getCategorizationQueueStats();
  return { counts: counts as Record<PipelineQueueFilter, number>, queue };
}
