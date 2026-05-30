import type { TopicClassifySummary, AiItemCategoryLink, AiItemSignal, ClassifyState } from '../categorization/types';
import { getDB } from '../db';
import type { EnrichmentResult } from '../enrichment';

export type PipelineReportOutcome =
  | 'enriched'
  | 'fetched'
  | 'ai_updated'
  | 'classified'
  | 'unchanged'
  | 'failed'
  | 'skipped'
  | 'review';

export type PipelineReportAction =
  | 'full_digest'
  | 'fetch'
  | 'ai_extract'
  | 'classify'
  | 'batch_full'
  | 'batch_enrich'
  | 'batch_classify';

export interface PipelineReportRow {
  itemId: string;
  title: string;
  /** Bookmark URL when available (shown under title). */
  subtitle?: string;
  outcome: PipelineReportOutcome;
  detail: string;
}

export interface PipelineReportBuildOptions {
  action?: PipelineReportAction;
}

export const PIPELINE_REPORT_OUTCOME_LABELS: Record<PipelineReportOutcome, string> = {
  enriched: 'Enriched',
  fetched: 'Fetched',
  ai_updated: 'AI updated',
  classified: 'Classified',
  unchanged: 'Unchanged',
  failed: 'Failed',
  skipped: 'Skipped',
  review: 'Review needed',
};

export const PIPELINE_REPORT_OUTCOME_COLORS: Record<PipelineReportOutcome, string> = {
  enriched: 'var(--er-ok, #3fb950)',
  fetched: '#58a6ff',
  ai_updated: '#a371f7',
  classified: 'var(--accent)',
  unchanged: 'var(--text-muted)',
  failed: 'var(--error, #f85149)',
  skipped: 'var(--er-warn, #d29922)',
  review: '#f97316',
};

function successOutcome(action: PipelineReportAction): PipelineReportOutcome {
  switch (action) {
    case 'fetch':
    case 'batch_enrich':
      return 'fetched';
    case 'ai_extract':
      return 'ai_updated';
    case 'classify':
    case 'batch_classify':
      return 'classified';
    case 'full_digest':
    case 'batch_full':
    default:
      return 'enriched';
  }
}

function successDetail(action: PipelineReportAction): string {
  switch (action) {
    case 'fetch':
    case 'batch_enrich':
      return 'Page re-fetched';
    case 'ai_extract':
      return 'Summary re-extracted from cached fetch';
    case 'classify':
    case 'batch_classify':
      return 'Category assigned or updated';
    case 'full_digest':
    case 'batch_full':
    default:
      return 'Fetch and AI summary complete';
  }
}

function enrichResultDetail(result: EnrichmentResult, action: PipelineReportAction): string {
  if (result.message?.startsWith('prior_kept_')) {
    const reason = result.message.replace('prior_kept_', '').replace(/_/g, ' ');
    return `Kept prior summary — suspicious re-fetch (${reason})`;
  }
  if (result.status === 'failed') {
    if (action === 'ai_extract') {
      return result.message || result.errorCode || 'AI extract failed';
    }
    return result.message || result.errorCode || 'Fetch or AI extract failed';
  }
  const skip = result.message?.trim();
  if (skip === 'content_unchanged') return 'Page unchanged — kept existing summary';
  if (result.skipped && skip === 'needs_successful_fetch') {
    return 'Needs a successful fetch before re-running AI';
  }
  if (result.skipped && skip === 'snippet_too_short') {
    return 'Cached fetch text too short for AI extract';
  }
  if (result.skipped && skip) return `Skipped (${skip.replace(/_/g, ' ')})`;
  if (result.skipped) return 'Already up to date';
  if (result.message === 'fetch_only') return 'Page fetched — run Re-run AI when ready';
  return successDetail(action);
}

function enrichResultOutcome(
  result: EnrichmentResult,
  action: PipelineReportAction
): PipelineReportOutcome {
  if (result.message?.startsWith('prior_kept_')) return 'review';
  if (result.status === 'failed') return 'failed';
  if (result.skipped) {
    const skip = result.message?.trim();
    if (skip === 'content_unchanged') return 'unchanged';
    return 'skipped';
  }
  if (result.status === 'ok') return successOutcome(action);
  return 'skipped';
}

export function buildPipelineReportRows(
  results: EnrichmentResult[],
  itemLabels: Record<string, string>,
  options?: PipelineReportBuildOptions
): PipelineReportRow[] {
  const action = options?.action ?? 'full_digest';
  return results.map((result) => ({
    itemId: result.itemId,
    title: itemLabels[result.itemId] ?? result.itemId,
    outcome: enrichResultOutcome(result, action),
    detail: enrichResultDetail(result, action),
  }));
}

function classifyDetail(summary: TopicClassifySummary): string {
  if (summary.llmErrors > 0) return 'Classification AI error';
  if (summary.classifiedSpecific + summary.classifiedGeneral > 0) {
    const bits: string[] = [];
    if (summary.classifiedSpecific > 0) bits.push(`${summary.classifiedSpecific} specific`);
    if (summary.classifiedGeneral > 0) bits.push(`${summary.classifiedGeneral} general`);
    return `Category assigned (${bits.join(', ')})`;
  }
  if (summary.skippedHash > 0) return 'Category unchanged — text hash matches';
  if (summary.skippedIneligible > 0) return 'Not eligible for classification';
  if (summary.skippedManualReview > 0) return 'In manual review — skipped';
  if (summary.pendingDiscover > 0) return 'Pending discover taxonomy';
  if (summary.processed > 0) return 'Sent to classification AI';
  return 'Nothing to classify';
}

function classifyOutcome(summary: TopicClassifySummary): PipelineReportOutcome {
  if (summary.llmErrors > 0) return 'failed';
  if (summary.classifiedSpecific + summary.classifiedGeneral > 0) return 'classified';
  if (summary.skippedHash > 0) return 'unchanged';
  return 'skipped';
}

/** Single-item classify modal row (aggregate summary only). */
export function buildClassifyReportRows(
  itemIds: string[],
  itemLabels: Record<string, string>,
  summary: TopicClassifySummary
): PipelineReportRow[] {
  const outcome = classifyOutcome(summary);
  const detail = classifyDetail(summary);
  return itemIds.map((itemId) => ({
    itemId,
    title: itemLabels[itemId] ?? itemId,
    outcome,
    detail,
  }));
}

const COUNTABLE_LINK_STATUSES = new Set(['suggested', 'accepted']);

function itemDisplayLabel(item: { id: string; title?: string; url?: string }): string {
  const title = item.title?.trim();
  if (title) return title;
  const url = item.url?.trim();
  if (url) return url;
  return item.id;
}

async function hydrateItemMeta(
  itemIds: string[],
  partial: Record<string, string>
): Promise<{ labels: Record<string, string>; urls: Record<string, string> }> {
  const labels = { ...partial };
  const urls: Record<string, string> = {};
  const db = await getDB();
  for (const id of itemIds) {
    const item = await db.get('items', id);
    if (!item) continue;
    if (!labels[id]?.trim()) labels[id] = itemDisplayLabel(item);
    const url = item.url?.trim();
    if (url) urls[id] = url;
  }
  return { labels, urls };
}

function formatTopicLabel(
  categoryId: string,
  catById: Map<string, { name: string; parentId?: string | null }>,
  parentNameById: Map<string, string>
): string {
  const leaf = catById.get(categoryId);
  if (!leaf) return categoryId;
  const parentName = leaf.parentId ? parentNameById.get(leaf.parentId) : undefined;
  return parentName ? `${parentName} › ${leaf.name}` : leaf.name;
}

/** Primary topic id from links, falling back to last LLM classify decision. */
function resolvePrimaryCategoryId(
  itemId: string,
  primaryByItem: Map<string, string>,
  linksByItem: Map<string, AiItemCategoryLink[]>,
  sig?: AiItemSignal
): string | undefined {
  const linked = primaryByItem.get(itemId);
  if (linked) return linked;

  const itemLinks = linksByItem.get(itemId) ?? [];
  const anyPrimary = itemLinks.find((l) => l.source === 'ai' && l.isPrimary);
  if (anyPrimary) return anyPrimary.categoryId;

  const fromReview = sig?.llmReview?.categoryIds?.[0];
  if (fromReview) return fromReview;

  const best = itemLinks
    .filter((l) => l.source === 'ai')
    .sort((a, b) => b.score - a.score)[0];
  return best?.categoryId;
}

function classifiedTopicDetail(
  categoryId: string | undefined,
  catById: Map<string, { name: string; parentId?: string | null }>,
  parentNameById: Map<string, string>,
  sig?: AiItemSignal
): string {
  if (categoryId) {
    return `Topic: ${formatTopicLabel(categoryId, catById, parentNameById)}`;
  }
  const reviewIds = sig?.llmReview?.categoryIds?.filter(Boolean) ?? [];
  if (reviewIds.length) {
    const labels = reviewIds.map((id) => formatTopicLabel(id, catById, parentNameById));
    return `Topic: ${labels.join(', ')}`;
  }
  const llmReason = sig?.llmReview?.reason?.trim();
  if (llmReason) return `Classified — ${llmReason.slice(0, 160)}`;
  return 'Classified — topic name missing from database';
}

/** Per-bookmark outcomes after classify (reads current DB state). */
export async function buildClassifyOutcomeReportRows(
  itemIds: string[],
  itemLabels: Record<string, string> = {}
): Promise<PipelineReportRow[]> {
  if (!itemIds.length) return [];

  const db = await getDB();
  const { labels, urls } = await hydrateItemMeta(itemIds, itemLabels);
  const categories = db.objectStoreNames.contains('ai_categories')
    ? await db.getAll('ai_categories')
    : [];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const parentNameById = new Map(
    categories.filter((c) => c.kind === 'parent').map((c) => [c.id, c.name])
  );
  const primaryByItem = new Map<string, string>();
  const linksByItem = new Map<string, AiItemCategoryLink[]>();
  if (db.objectStoreNames.contains('ai_item_category_links')) {
    for (const id of itemIds) {
      const itemLinks = await db.getAllFromIndex('ai_item_category_links', 'by-item', id);
      if (!itemLinks.length) continue;
      linksByItem.set(id, itemLinks);
      for (const l of itemLinks) {
        if (l.source === 'ai' && l.isPrimary && COUNTABLE_LINK_STATUSES.has(l.status)) {
          primaryByItem.set(l.itemId, l.categoryId);
        }
      }
    }
  }

  const rows: PipelineReportRow[] = [];
  for (const itemId of itemIds) {
    const sig = db.objectStoreNames.contains('ai_item_signals')
      ? await db.get('ai_item_signals', itemId)
      : undefined;
    const st = sig?.classifyState as ClassifyState | undefined;
    const primaryId = resolvePrimaryCategoryId(itemId, primaryByItem, linksByItem, sig);
    const reason = sig?.lastClassifySkipReason?.trim();

    let outcome: PipelineReportOutcome = 'skipped';
    let detail = reason || 'Updated';

    if (st === 'classified') {
      outcome = 'classified';
      detail = classifiedTopicDetail(primaryId, catById, parentNameById, sig);
    } else if (st === 'classified_general') {
      outcome = 'skipped';
      detail = primaryId
        ? classifiedTopicDetail(primaryId, catById, parentNameById, sig)
        : reason || 'General / Other';
    } else if (st === 'manual_review') {
      outcome = 'review';
      detail = reason || 'Still in manual review';
    } else if (st === 'pending_discover') {
      outcome = 'review';
      detail = reason || 'No topic match — needs discover';
    } else if (st === 'pending_classify') {
      outcome = 'skipped';
      detail = reason || 'Back in classify queue';
    } else if (st === 'skipped' || st === 'ineligible') {
      outcome = 'skipped';
      detail = reason || st;
    }

    rows.push({
      itemId,
      title: labels[itemId]?.trim() || itemId,
      subtitle: urls[itemId],
      outcome,
      detail,
    });
  }
  return rows;
}

export async function buildRetryManualReportRows(
  itemIds: string[],
  itemLabels: Record<string, string> = {}
): Promise<PipelineReportRow[]> {
  return buildClassifyOutcomeReportRows(itemIds, itemLabels);
}

export function formatClassifyBatchSummary(
  rows: PipelineReportRow[],
  retriedCount: number
): string {
  return formatManualRetrySummary(rows, retriedCount);
}

export function formatManualRetrySummary(
  rows: PipelineReportRow[],
  retriedCount: number
): string {
  const stats = pipelineReportStats(rows);
  const parts: string[] = [`${retriedCount} retried`];
  if (stats.classified > 0) parts.push(`${stats.classified} got a specific topic`);
  if (stats.review > 0) parts.push(`${stats.review} still need review`);
  if (stats.skipped > 0) parts.push(`${stats.skipped} other outcome`);
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);
  return parts.join(' · ');
}

export function pipelineReportStats(rows: PipelineReportRow[]) {
  const stats = {
    enriched: 0,
    fetched: 0,
    ai_updated: 0,
    classified: 0,
    unchanged: 0,
    failed: 0,
    skipped: 0,
    review: 0,
  };
  for (const row of rows) {
    stats[row.outcome] += 1;
  }
  return stats;
}

export function formatPipelineReportSummary(stats: ReturnType<typeof pipelineReportStats>): string {
  const parts: string[] = [];
  if (stats.enriched > 0) parts.push(`${stats.enriched} enriched`);
  if (stats.fetched > 0) parts.push(`${stats.fetched} fetched`);
  if (stats.ai_updated > 0) parts.push(`${stats.ai_updated} AI updated`);
  if (stats.classified > 0) parts.push(`${stats.classified} classified`);
  if (stats.unchanged > 0) parts.push(`${stats.unchanged} unchanged`);
  if (stats.skipped > 0) parts.push(`${stats.skipped} skipped`);
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);
  if (stats.review > 0) parts.push(`${stats.review} need review`);
  return parts.length ? parts.join(' · ') : 'No changes';
}

export function resolveBatchReportAction(options?: {
  enrich?: boolean;
  classify?: boolean;
  skipAi?: boolean;
}): PipelineReportAction {
  const doEnrich = options?.enrich !== false;
  const doClassify = options?.classify !== false;
  if (doEnrich && doClassify) return 'batch_full';
  if (doEnrich && options?.skipAi) return 'batch_enrich';
  if (doEnrich) return 'batch_full';
  if (doClassify) return 'batch_classify';
  return 'batch_full';
}
