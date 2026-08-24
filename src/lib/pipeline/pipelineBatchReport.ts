import type { TopicClassifySummary, AiItemCategoryLink, AiItemSignal, ClassifyState } from '../categorization/types';
import { getDB } from '../db';
import type { EnrichmentResult } from '../enrichment';
import { getEnrichment } from '../enrichment/storage';
import {
  FAILURE_CATEGORY_LABELS,
  isEnrichmentFailure,
  resolveEnrichmentFailureLabel,
  type EnrichmentFailureLabel,
} from '../enrichment/failureLabels';
import {
  AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE,
  describeAiFailure,
  formatEnrichmentFailureMessage,
} from '../enrichment/errorMessages';
import type { ItemEnrichment } from '../enrichment/types';
import { primaryLeafIdFromLinks, verifiedPrimaryLeafIdFromLinks } from '../categorization/counts';
import { resolvePendingDiscoverBadgeLabel, resolvePipelineStatus, type PipelineBadge } from './pipelineBadge';
import {
  formatClassifyDoneModalSummary,
  resolveClassifyDoneModalTone,
} from './pipelineDictionary';
import { hubStatusBadgeForEnrichment, type HubStatusStageInput } from './pipelineHubQueries';
import { loadScopedPipelineRows } from './scopedPipelineRows';

export {
  CLASSIFY_DONE_REPORT_SAMPLE_CAP,
  formatClassifyDoneModalSummary,
  formatClassifyRunSummary,
} from './pipelineDictionary';

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
  /** Hub table status chip — when set, summary and row badge use this instead of generic outcome. */
  statusLabel?: string;
  statusColor?: string;
  /** Non-fatal condition that should remain visible in the run summary. */
  notice?: 'ai_not_configured' | 'ai_backend_error';
}

export interface PipelineReportBuildOptions {
  action?: PipelineReportAction;
  /** Inline enrich results (skip messages, etc.) merged with DB state when building rows. */
  enrichResults?: EnrichmentResult[];
}

export const PIPELINE_REPORT_OUTCOME_LABELS: Record<PipelineReportOutcome, string> = {
  enriched: 'Enriched',
  fetched: 'Fetched',
  ai_updated: 'AI updated',
  classified: 'Classified',
  unchanged: 'Unchanged',
  failed: 'Failed',
  skipped: 'Skipped',
  review: 'Manual review',
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

const AI_STATUS_MESSAGE = new Set([
  'empty_response',
  'content_too_short',
  'api_error',
  'parse_failed',
  'not_configured',
]);

function failureReportDetail(
  label: EnrichmentFailureLabel,
  enrichment?: ItemEnrichment
): string {
  if (enrichment?.status === 'ok' && label.stage === 'ai') {
    const hubLine = `Fetch OK · ${FAILURE_CATEGORY_LABELS[label.category]}`;
    const parts = [hubLine];
    if (label.detail) parts.push(label.detail);
    if (label.reviewHint) parts.push(`What to try: ${label.reviewHint}`);
    return parts.join(' — ');
  }
  if (label.detail) return `${label.label} — ${label.detail}`;
  return label.reviewHint ? `${label.label} — ${label.reviewHint}` : label.label;
}

/** Honest outcome from stored enrichment (matches hub table badges). */
export function resolveEnrichReportOutcome(
  enrichment: ItemEnrichment | undefined,
  embedFailed: boolean,
  action: PipelineReportAction,
  enrichResult?: EnrichmentResult
): { outcome: PipelineReportOutcome; detail: string } {
  if (enrichResult?.message?.startsWith('prior_kept_')) {
    return { outcome: 'review', detail: enrichResultDetail(enrichResult, action) };
  }

  const failure = resolveEnrichmentFailureLabel(enrichment, embedFailed);
  if (failure) {
    return {
      outcome: enrichment?.status === 'ok' && failure.stage === 'ai' ? 'fetched' : 'failed',
      detail: failureReportDetail(failure, enrichment),
    };
  }

  if (enrichment?.pendingFetchReview) {
    return {
      outcome: 'review',
      detail: 'Fetch review — prior summary kept until you confirm',
    };
  }

  if (enrichResult) {
    if (enrichResult.status === 'failed') {
      return {
        outcome: 'failed',
        detail: enrichResultDetail(enrichResult, action),
      };
    }
    if (enrichResult.skipped) {
      return {
        outcome: enrichResultOutcome(enrichResult, action),
        detail: enrichResultDetail(enrichResult, action),
      };
    }
    const msg = enrichResult.message?.trim();
    if (enrichResult.status === 'ok' && msg && msg !== 'fetch_only') {
      if (msg === 'content_unchanged') {
        return { outcome: 'unchanged', detail: enrichResultDetail(enrichResult, action) };
      }
      if (AI_STATUS_MESSAGE.has(msg)) {
        return {
          outcome: 'failed',
          detail: describeAiFailure(msg as ItemEnrichment['aiStatus'], enrichment?.aiError) ?? msg,
        };
      }
    }
  }

  if (!enrichment || enrichment.status === 'none') {
    return { outcome: 'skipped', detail: 'Not enriched yet' };
  }

  if (enrichment.status === 'ok' && enrichment.aiStatus === 'not_configured') {
    return {
      outcome: 'fetched',
      detail: AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE,
    };
  }

  if (enrichment.status === 'skipped') {
    return {
      outcome: 'skipped',
      detail: enrichment.skipReason?.replace(/_/g, ' ') ?? 'Skipped',
    };
  }
  if (enrichment.status === 'failed') {
    return {
      outcome: 'failed',
      detail: formatEnrichmentFailureMessage(enrichment) ?? 'Fetch failed',
    };
  }

  if (isEnrichmentFailure(enrichment, embedFailed)) {
    return { outcome: 'failed', detail: 'Pipeline step did not complete' };
  }

  const aiOk =
    !enrichment.aiStatus ||
    enrichment.aiStatus === 'ok' ||
    enrichment.aiStatus === 'not_configured';
  const hasSummary = Boolean(enrichment.summary?.trim());

  if (enrichment.status === 'ok') {
    if (action === 'fetch' || action === 'batch_enrich' || enrichResult?.message === 'fetch_only') {
      return {
        outcome: 'fetched',
        detail: aiOk && hasSummary ? 'Page fetched' : 'Page fetched — AI summary not ready',
      };
    }
    if (!aiOk) {
      return {
        outcome: 'failed',
        detail:
          describeAiFailure(enrichment.aiStatus!, enrichment.aiError) ??
          'AI did not produce a usable summary',
      };
    }
    if (!hasSummary && enrichment.aiStatus !== 'not_configured') {
      return { outcome: 'failed', detail: 'Fetch OK — no AI summary stored' };
    }
    return {
      outcome: successOutcome(action),
      detail: successDetail(action),
    };
  }

  return { outcome: 'skipped', detail: 'No change' };
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
  if (result.status === 'ok') {
    const msg = result.message?.trim();
    if (msg && msg !== 'fetch_only' && AI_STATUS_MESSAGE.has(msg)) return 'failed';
    return successOutcome(action);
  }
  return 'skipped';
}

function outcomeFromPipelineBadge(
  badge: PipelineBadge,
  action: PipelineReportAction
): PipelineReportOutcome {
  if (badge.kind === 'verified' || badge.kind === 'ready') return successOutcome(action);
  if (badge.kind === 'failed') return 'failed';
  if (badge.kind === 'needs_review') return 'review';
  if (badge.kind === 'partial') {
    if (badge.label === 'Skipped') return 'skipped';
    if (badge.label === 'General / Other') return 'review';
    if (badge.label === 'Fetched' || badge.label.startsWith('Pending')) return 'fetched';
    return 'fetched';
  }
  if (badge.kind === 'not_processed') return 'skipped';
  return 'skipped';
}

async function loadReportHubStageSnapshot(
  itemIds: string[]
): Promise<{
  enrichById: Map<string, ItemEnrichment>;
  stageByItem: Map<string, HubStatusStageInput>;
}> {
  const stageByItem = new Map<string, HubStatusStageInput>();
  if (!itemIds.length) return { enrichById: new Map(), stageByItem };
  const scoped = await loadScopedPipelineRows(itemIds, { authoritative: true });
  const linksByItem = new Map<string, AiItemCategoryLink[]>();
  for (const link of scoped.links) {
    const itemLinks = linksByItem.get(link.itemId) ?? [];
    itemLinks.push(link);
    linksByItem.set(link.itemId, itemLinks);
  }

  for (const itemId of itemIds) {
    const signal = scoped.signalByItem.get(itemId);
    const itemLinks = linksByItem.get(itemId) ?? [];
    stageByItem.set(itemId, {
      signal,
      primaryCategoryId: primaryLeafIdFromLinks(itemLinks),
      verifiedPrimaryCategoryId: verifiedPrimaryLeafIdFromLinks(itemLinks),
      suggestedLinkCount: itemLinks.filter((l) => l.status === 'suggested').length,
    });
  }
  return { enrichById: scoped.enrichByItem, stageByItem };
}

/** Prefer this after digest — reads DB so report matches hub table. */
export async function buildEnrichOutcomeReportRows(
  itemIds: string[],
  itemLabels: Record<string, string> = {},
  options?: PipelineReportBuildOptions
): Promise<PipelineReportRow[]> {
  const action = options?.action ?? 'full_digest';
  if (!itemIds.length) return [];

  const byResult = new Map((options?.enrichResults ?? []).map((r) => [r.itemId, r]));
  const { labels, urls } = await hydrateItemMeta(itemIds, itemLabels);

  // Completion is an ownership boundary: read one authoritative scoped
  // snapshot from the DB worker, not the submitting page's cache, which may
  // still reflect the pre-run state when the coordinator broadcasts Done.
  const { enrichById, stageByItem } = await loadReportHubStageSnapshot(itemIds);
  const embedFailedIds = new Set<string>();
  for (const [itemId, stage] of stageByItem) {
    if (stage.signal?.signalStatus === 'embed_failed') embedFailedIds.add(itemId);
  }

  return itemIds.map((itemId) => {
    const enrichment = enrichById.get(itemId);
    const embedFailed = embedFailedIds.has(itemId);
    const enrichResult = byResult.get(itemId);
    const resolvedOutcome = resolveEnrichReportOutcome(
      enrichment,
      embedFailed,
      action,
      enrichResult
    );
    const stage = stageByItem.get(itemId);
    const pipelineBadge = resolvePipelineStatus({
      enrichment,
      embedFailed,
      signal: stage?.signal,
      primaryCategoryId: stage?.primaryCategoryId ?? null,
      verifiedPrimaryCategoryId: stage?.verifiedPrimaryCategoryId ?? null,
      suggestedLinkCount: stage?.suggestedLinkCount ?? 0,
      classifyState: stage?.signal?.classifyState,
    });
    const statusBadge = hubStatusBadgeForEnrichment(enrichment, embedFailed, stage);
    const notice = enrichment?.status === 'ok' && enrichment.aiStatus === 'not_configured'
      ? 'ai_not_configured' as const
      : enrichment?.status === 'ok' && enrichment.aiStatus === 'api_error'
        ? 'ai_backend_error' as const
        : undefined;
    const outcome = notice
      ? resolvedOutcome.outcome
      : outcomeFromPipelineBadge(pipelineBadge, action);
    return {
      itemId,
      title: labels[itemId]?.trim() || itemId,
      subtitle: urls[itemId],
      outcome,
      detail: resolvedOutcome.detail,
      statusLabel: statusBadge.text,
      statusColor: statusBadge.color,
      notice,
    };
  });
}

/** Sync fallback when DB is unavailable — less accurate for fetch-ok / AI-fail. */
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
  const anyPrimary = itemLinks.find((l) => l.isPrimary && COUNTABLE_LINK_STATUSES.has(l.status));
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
  const enrichRows = await Promise.all(itemIds.map((id) => getEnrichment(id)));
  const enrichById = new Map<string, ItemEnrichment>();
  for (let i = 0; i < itemIds.length; i++) {
    const row = enrichRows[i];
    if (row) enrichById.set(itemIds[i]!, row);
  }
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
        if (l.isPrimary && COUNTABLE_LINK_STATUSES.has(l.status)) {
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
      const enrichment = enrichById.get(itemId);
      const pendingLabel = resolvePendingDiscoverBadgeLabel({
        enrichment,
        primaryCategoryId: primaryId ?? null,
        classifyState: st,
      });
      outcome = pendingLabel === 'Pending classify' ? 'skipped' : 'review';
      detail =
        reason ||
        (pendingLabel === 'Pending classify'
          ? 'No topic match — run Classify again or Discover'
          : 'No topic match — needs discover');
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

/** Modal tone from per-item report rows (honest when fetch OK but AI failed). */
export function resolveReportRowsSummaryTone(
  rows: PipelineReportRow[],
  classifySummary?: TopicClassifySummary
): 'success' | 'error' | 'info' {
  if (classifySummary) {
    return resolveClassifyDoneModalTone(classifySummary);
  }

  const stats = pipelineReportStats(rows);
  const successLabels = new Set(['Enriched', 'Verified', 'Classified']);
  const successCount = rows.filter((r) => successLabels.has(reportRowDisplayLabel(r))).length;
  const warningCount = rows.filter((row) => Boolean(row.notice)).length;
  const issueCount = rows.length - successCount - stats.skipped - stats.unchanged - warningCount;

  if (issueCount > 0 && successCount === 0) return 'error';
  if (stats.failed > 0 && successCount === 0) return 'error';
  if (successCount > 0) return 'success';
  if (stats.failed > 0 || stats.review > 0) return 'info';
  return 'info';
}

export function reportRowDisplayLabel(row: PipelineReportRow): string {
  return row.statusLabel ?? PIPELINE_REPORT_OUTCOME_LABELS[row.outcome];
}

export function pipelineReportStatusLabelCounts(rows: PipelineReportRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = reportRowDisplayLabel(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

/** Done-modal summary for batch digest — run-level classify first, then row snapshot (#8). */
export function formatBatchDigestDoneSummary(input: {
  selectedCount: number;
  reportRows: PipelineReportRow[];
  pipelineMessage?: string;
  classifySummary?: TopicClassifySummary;
  reportRowTotal?: number;
}): string {
  const cs = input.classifySummary;
  const parts: string[] = [];

  if (cs && (cs.processed > 0 || cs.classifiedSpecific > 0 || cs.classifiedGeneral > 0)) {
    parts.push(
      formatClassifyDoneModalSummary({
        summary: cs,
        selectedCount: input.selectedCount > 0 ? input.selectedCount : undefined,
        reportRowCount: input.reportRows.length,
        reportRowTotal: input.reportRowTotal ?? input.selectedCount,
      })
    );
  }

  const rowPart = formatPipelineReportSummaryFromRows(input.reportRows);
  if (rowPart && rowPart !== 'No changes') {
    if (cs) {
      parts.push(`Selected snapshot: ${rowPart}`);
    } else {
      if (input.selectedCount > 0) {
        parts.push(
          `Report covers ${input.selectedCount} selected bookmark${input.selectedCount === 1 ? '' : 's'}`
        );
      }
      parts.push(rowPart);
    }
  } else if (!cs) {
    if (input.selectedCount > 0) {
      parts.push(
        `Report covers ${input.selectedCount} selected bookmark${input.selectedCount === 1 ? '' : 's'}`
      );
    }
  }

  if (
    cs &&
    input.selectedCount > 0 &&
    cs.totalConsidered > input.selectedCount &&
    !parts.some((p) => p.includes('checked in scope'))
  ) {
    parts.push(`Classify scanned ${cs.totalConsidered} in run scope`);
  }

  return parts.length ? parts.join(' · ') : input.pipelineMessage ?? 'Done';
}

/** Summary line grouped by hub status labels (matches enrichment table). */
export function formatPipelineReportSummaryFromRows(rows: PipelineReportRow[]): string {
  if (!rows.length) return 'No changes';
  const aiNotConfiguredCount = rows.filter((row) => row.notice === 'ai_not_configured').length;
  const aiBackendErrorRows = rows.filter((row) => row.notice === 'ai_backend_error');
  if (aiBackendErrorRows.length === rows.length) {
    return aiBackendErrorRows.length === 1
      ? aiBackendErrorRows[0]!.detail
      : `${aiBackendErrorRows.length} pages fetched and saved for keyword search, but AI failed. ${aiBackendErrorRows[0]!.detail}`;
  }
  if (aiNotConfiguredCount === rows.length) {
    return aiNotConfiguredCount === 1
      ? AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE
      : `${aiNotConfiguredCount} pages fetched and saved for keyword search. AI enrichment was skipped — add an API key in Settings > AI.`;
  }
  if (!rows.some((r) => r.statusLabel)) {
    const summary = formatPipelineReportSummary(pipelineReportStats(rows));
    const notices: string[] = [];
    if (aiNotConfiguredCount > 0) {
      notices.push(`AI skipped for ${aiNotConfiguredCount} — add an API key in Settings > AI; fetched text remains searchable.`);
    }
    if (aiBackendErrorRows.length > 0) {
      notices.push(`AI failed for ${aiBackendErrorRows.length} after fetch; fetched text remains searchable. ${aiBackendErrorRows[0]!.detail}`);
    }
    return notices.length ? `${summary} · ${notices.join(' · ')}` : summary;
  }
  const counts = pipelineReportStatusLabelCounts(rows);
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${count} ${label}`);
  const summary = parts.length ? parts.join(' · ') : 'No changes';
  const notices: string[] = [];
  if (aiNotConfiguredCount > 0) {
    notices.push(`AI skipped for ${aiNotConfiguredCount} — add an API key in Settings > AI; fetched text remains searchable.`);
  }
  if (aiBackendErrorRows.length > 0) {
    notices.push(`AI failed for ${aiBackendErrorRows.length} after fetch; fetched text remains searchable. ${aiBackendErrorRows[0]!.detail}`);
  }
  return notices.length ? `${summary} · ${notices.join(' · ')}` : summary;
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
  if (stats.review > 0) parts.push(`${stats.review} manual review`);
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
