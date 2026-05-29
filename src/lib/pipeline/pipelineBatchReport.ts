import type { TopicClassifySummary } from '../categorization/types';
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
