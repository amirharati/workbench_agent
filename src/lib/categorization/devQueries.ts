import { getDB } from '../db';
import type { Item } from '../db';
import type { ItemEnrichment } from '../enrichment/types';
import { assessCategorizationEligibility } from '../enrichment/categorizationEligibility';
import { linkCountsForCategories, resolveEffectiveClassifyState } from './counts';
import {
  pendingSubFilterMatchesBlocker,
  resolveClassifyQueueBlocker,
  type ClassifyPendingBlocker,
} from './classifyQueueBlocker';
import { hasSpecificPrimaryTopic } from './categorizationFairGame';
import { getCategorizationQueueStats } from './classifyTopicExtract';
import { getPipelineCatalog, type PipelineCatalog } from '../pipeline/pipelineCatalog';
import type { AiCategory, ClassifyState, ClassifyInputQualityTier } from './types';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);

export type PipelineQueueFilter =
  | 'all'
  | 'needs_attention'
  | 'no_signal'
  | 'pending_not_enriched'
  | 'pending_no_ai'
  | 'pending_ready'
  | ClassifyState;

export const PIPELINE_QUEUE_FILTER_OPTIONS: Array<{
  id: PipelineQueueFilter;
  label: string;
  hint?: string;
}> = [
  { id: 'needs_attention', label: 'Needs attention', hint: 'Not a specific topic yet' },
  { id: 'pending_not_enriched', label: 'Not fetched', hint: 'No digest or fetch failed' },
  { id: 'pending_no_ai', label: 'No AI summary', hint: 'Fetched but AI summary missing or failed' },
  { id: 'pending_ready', label: 'Waiting to classify', hint: 'AI ready — waiting for classify run' },
  { id: 'pending_reclassify', label: 'Re-classify queued' },
  { id: 'pending_discover', label: 'No category found', hint: 'AI ran but no topic matched' },
  { id: 'classified_general', label: 'General / Other' },
  { id: 'manual_review', label: 'Manual review' },
  { id: 'ineligible', label: 'Ineligible' },
  { id: 'no_signal', label: 'No signal', hint: 'AI ok but no classify signal row' },
  { id: 'classified', label: 'Has topic' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'all', label: 'All bookmarks' },
];

export function matchesPipelineQueueFilter(
  filter: PipelineQueueFilter,
  row: PipelineQueueItemRow
): boolean {
  return matchesPipelineFilter(filter, row);
}

export function countPipelineQueueFilters(
  rows: PipelineQueueItemRow[]
): Partial<Record<PipelineQueueFilter, number>> {
  const counts: Partial<Record<PipelineQueueFilter, number>> = {
    all: rows.length,
    needs_attention: 0,
    no_signal: 0,
    pending_not_enriched: 0,
    pending_no_ai: 0,
    pending_ready: 0,
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
    for (const opt of PIPELINE_QUEUE_FILTER_OPTIONS) {
      if (opt.id === 'all') continue;
      if (matchesPipelineFilter(opt.id, row)) {
        counts[opt.id] = (counts[opt.id] ?? 0) + 1;
      }
    }
  }
  return counts;
}

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
  pendingBlocker?: ClassifyPendingBlocker;
  pendingBlockerLabel?: string;
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

export function buildPipelineQueueRowsFromCatalog(
  catalog: PipelineCatalog,
  filter: PipelineQueueFilter = 'all',
  search = ''
): PipelineQueueItemRow[] {
  const q = search.trim().toLowerCase();
  const rows: PipelineQueueItemRow[] = [];

  for (const item of catalog.items) {
    const enrichment = catalog.enrichByItem.get(item.id);
    const signal = catalog.signalByItem.get(item.id);
    const st = signal?.classifyState;
    const primaryId = catalog.primaryByItem.get(item.id) ?? null;
    const leaf = primaryId ? catalog.categoryById.get(primaryId) : undefined;
    const parentName = leaf?.parentId ? catalog.parentNameById.get(leaf.parentId) ?? null : null;
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
    const blocker = resolveClassifyQueueBlocker(row);
    row.pendingBlocker = blocker.code;
    row.pendingBlockerLabel = blocker.label;

    if (q) {
      const hay =
        `${item.title || ''} ${item.url || ''} ${topicPath || ''} ${effectiveSt || ''} ${blocker.label} ${blocker.detail}`.toLowerCase();
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

export async function listPipelineQueueItems(
  filter: PipelineQueueFilter = 'all',
  search = ''
): Promise<PipelineQueueItemRow[]> {
  const catalog = await getPipelineCatalog();
  return buildPipelineQueueRowsFromCatalog(catalog, filter, search);
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
  const blocker = row.pendingBlocker ?? resolveClassifyQueueBlocker(row).code;

  if (filter === 'all') return true;
  if (filter === 'no_signal') return !row.hasSignal && row.enrichment?.aiStatus === 'ok';
  if (filter === 'needs_attention') {
    if (hasSpecificPrimaryTopic(primaryId, st)) return false;
    if (st === 'skipped' || st === 'manual_only') return false;
    return true;
  }
  if (filter === 'pending_not_enriched' || filter === 'pending_no_ai' || filter === 'pending_ready') {
    if (st !== 'pending_classify') return false;
    return pendingSubFilterMatchesBlocker(filter, blocker);
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
  counts: Partial<Record<PipelineQueueFilter, number>>;
  queue: Awaited<ReturnType<typeof getCategorizationQueueStats>>;
}> {
  const rows = await listPipelineQueueItems('all');
  const counts = countPipelineQueueFilters(rows);
  const queue = await getCategorizationQueueStats();
  return { counts, queue };
}
