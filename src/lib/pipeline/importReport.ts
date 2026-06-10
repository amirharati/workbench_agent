import type { BulkImportAffectedItem } from '../db';
import type { BatchDigestResult } from './batchDigest';
import { loadItemPipelineContext, type ItemPipelineContext } from './itemPipelineContext';
import { describeEnrichmentNextStep } from './pipelineHubQueries';
import {
  pipelineBadgeToStatusChip,
  resolvePipelineBadge,
  type PipelineBadge,
} from './pipelineBadge';
import { resolvePipelineStage } from './pipelineStage';

export type ImportReportPipelineStatus =
  | 'not_run'
  | 'enriched'
  | 'unchanged'
  | 'failed'
  | 'classified'
  | 'pending_classify'
  | 'not_enriched'
  | 'review_needed';

export interface ImportReportRow {
  itemId: string;
  url: string;
  title: string;
  outcome: 'created' | 'merged' | 'restored';
  /** Filter bucket (legacy); prefer hubStatusLabel for display. */
  pipelineStatus: ImportReportPipelineStatus;
  detail: string;
  /** Same text as Enrichment Hub → Status column. */
  hubStatusLabel: string;
  hubStatusColor: string;
  /** Same as Enrichment Hub → Next step column. */
  hubNextStep: string;
  categoryName?: string;
  topicPath?: string;
  failureStage?: 'fetch' | 'ai' | 'embed';
  summary?: string;
  wasProcessed: boolean;
}

export interface ImportReport {
  importSummary: string;
  targetLabel: string;
  created: number;
  merged: number;
  skipped: number;
  skippedPreviouslyTrashed?: number;
  skippedTrashedItems?: Array<{
    url: string;
    title: string;
    reason: string;
    trashedAt: number;
  }>;
  pipelineRan: boolean;
  pipelineMessage?: string;
  batchStats?: Pick<BatchDigestResult, 'enriched' | 'skipped' | 'failed' | 'classified' | 'classifyError'>;
  rows: ImportReportRow[];
}

/** @deprecated Use row.hubStatusLabel — kept for filter helpers. */
export const IMPORT_REPORT_STATUS_LABELS: Record<ImportReportPipelineStatus, string> = {
  not_run: 'Import only',
  enriched: 'Summarized',
  unchanged: 'Unchanged',
  failed: 'Failed',
  classified: 'Classified',
  pending_classify: 'Pending classify',
  not_enriched: 'Not enriched',
  review_needed: 'Review needed',
};

function mapPipelineStatus(
  ctx: ItemPipelineContext | null,
  badge: PipelineBadge,
  wasProcessed: boolean
): ImportReportPipelineStatus {
  if (!wasProcessed) return 'not_run';
  if (badge.kind === 'failed') return 'failed';
  if (badge.kind === 'needs_review') return 'review_needed';
  if (ctx?.primaryCategoryId && (badge.kind === 'verified' || badge.kind === 'ready')) {
    return 'classified';
  }
  if (
    ctx?.classifyState === 'pending_classify' ||
    ctx?.classifyState === 'pending_reclassify' ||
    ctx?.classifyState === 'pending_discover'
  ) {
    return 'pending_classify';
  }
  if (ctx?.enrichment?.status === 'skipped') return 'unchanged';
  if (badge.kind === 'ready' || badge.kind === 'verified' || badge.kind === 'partial') {
    return 'enriched';
  }
  return 'not_enriched';
}

function buildRowFromContext(
  item: BulkImportAffectedItem,
  wasProcessed: boolean,
  ctx: ItemPipelineContext | null
): ImportReportRow {
  if (!wasProcessed) {
    return {
      itemId: item.itemId,
      url: item.url,
      title: item.title,
      outcome: item.outcome,
      pipelineStatus: 'not_run',
      hubStatusLabel: 'Import only',
      hubStatusColor: 'var(--text-muted)',
      hubNextStep: 'Run digest from Enrichment Hub',
      detail: 'Saved to library — digest not run in this import',
      wasProcessed: false,
    };
  }

  const badge = resolvePipelineBadge(ctx);
  const chip = pipelineBadgeToStatusChip(badge, ctx?.enrichment);
  const embedFailed = ctx?.signal?.signalStatus === 'embed_failed';
  const stage = ctx ? resolvePipelineStage(ctx) : undefined;
  const hubNextStep = describeEnrichmentNextStep(ctx?.enrichment, !!embedFailed, stage);
  const topicPath = ctx?.primaryTopicPath ?? undefined;

  return {
    itemId: item.itemId,
    url: item.url,
    title: item.title,
    outcome: item.outcome,
    pipelineStatus: mapPipelineStatus(ctx, badge, wasProcessed),
    hubStatusLabel: chip.text,
    hubStatusColor: chip.color,
    hubNextStep,
    detail: hubNextStep,
    categoryName: ctx?.primaryCategoryName ?? undefined,
    topicPath,
    failureStage: badge.failureStage,
    summary: ctx?.summary,
    wasProcessed: true,
  };
}

export async function buildImportReport(input: {
  importSummary: string;
  targetLabel: string;
  created: number;
  merged: number;
  skipped: number;
  skippedPreviouslyTrashed?: number;
  skippedTrashedItems?: ImportReport['skippedTrashedItems'];
  items: BulkImportAffectedItem[];
  processedIds?: Set<string>;
  batchResult?: BatchDigestResult;
}): Promise<ImportReport> {
  const processedIds = input.processedIds ?? new Set<string>();
  const pipelineRan = processedIds.size > 0;

  const rows: ImportReportRow[] = [];
  for (const item of input.items) {
    const wasProcessed = processedIds.has(item.itemId);
    const ctx = wasProcessed ? await loadItemPipelineContext(item.itemId) : null;
    rows.push(buildRowFromContext(item, wasProcessed, ctx));
  }

  return {
    importSummary: input.importSummary,
    targetLabel: input.targetLabel,
    created: input.created,
    merged: input.merged,
    skipped: input.skipped,
    skippedPreviouslyTrashed: input.skippedPreviouslyTrashed,
    skippedTrashedItems: input.skippedTrashedItems,
    pipelineRan,
    pipelineMessage: input.batchResult?.message,
    batchStats: input.batchResult
      ? {
          enriched: input.batchResult.enriched,
          skipped: input.batchResult.skipped,
          failed: input.batchResult.failed,
          classified: input.batchResult.classified,
          classifyError: input.batchResult.classifyError,
        }
      : undefined,
    rows,
  };
}

export function importReportStats(report: ImportReport) {
  const counts = {
    total: report.rows.length,
    notRun: 0,
    enriched: 0,
    unchanged: 0,
    failed: 0,
    classified: 0,
    pendingClassify: 0,
    notEnriched: 0,
    reviewNeeded: 0,
    digestRan: 0,
  };
  for (const row of report.rows) {
    if (row.wasProcessed) counts.digestRan += 1;
    switch (row.pipelineStatus) {
      case 'not_run':
        counts.notRun += 1;
        break;
      case 'enriched':
        counts.enriched += 1;
        break;
      case 'unchanged':
        counts.unchanged += 1;
        break;
      case 'failed':
        counts.failed += 1;
        break;
      case 'classified':
        counts.classified += 1;
        break;
      case 'pending_classify':
        counts.pendingClassify += 1;
        break;
      case 'not_enriched':
        counts.notEnriched += 1;
        break;
      case 'review_needed':
        counts.reviewNeeded += 1;
        break;
      default:
        break;
    }
  }
  return counts;
}

/** Status chip counts using the same labels as Enrichment Hub. */
export function importReportHubStatusCounts(
  report: ImportReport
): Array<{ label: string; count: number; color: string }> {
  const byLabel = new Map<string, { count: number; color: string }>();
  for (const row of report.rows) {
    const label = row.hubStatusLabel;
    const existing = byLabel.get(label);
    if (existing) {
      existing.count += 1;
    } else {
      byLabel.set(label, { count: 1, color: row.hubStatusColor });
    }
  }
  return [...byLabel.entries()]
    .map(([label, { count, color }]) => ({ label, count, color }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
