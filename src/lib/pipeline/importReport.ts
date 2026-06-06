import type { BulkImportAffectedItem } from '../db';
import type { EnrichmentResult } from '../enrichment';
import type { BatchDigestResult } from './batchDigest';
import { loadItemPipelineContext } from './itemPipelineContext';

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
  pipelineStatus: ImportReportPipelineStatus;
  detail: string;
  categoryName?: string;
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

export const IMPORT_REPORT_STATUS_LABELS: Record<ImportReportPipelineStatus, string> = {
  not_run: 'Not processed',
  enriched: 'Summarized',
  unchanged: 'Unchanged',
  failed: 'Failed',
  classified: 'Classified',
  pending_classify: 'Pending classify',
  not_enriched: 'Not enriched',
  review_needed: 'Review needed',
};

function enrichDetail(result: EnrichmentResult): string {
  if (result.message?.startsWith('prior_kept_')) {
    const reason = result.message.replace('prior_kept_', '').replace(/_/g, ' ');
    return `Kept prior summary — suspicious re-fetch (${reason})`;
  }
  if (result.status === 'failed') {
    return result.message || result.errorCode || 'Fetch or AI extract failed';
  }
  const skip = result.message?.trim();
  if (skip === 'content_unchanged') return 'Page unchanged — kept existing summary';
  if (result.skipped && skip) return `Skipped fetch (${skip})`;
  if (result.skipped) return 'Already up to date';
  return 'Fetched page and extracted summary';
}

function resolvePipelineStatus(input: {
  wasProcessed: boolean;
  enrichResult?: EnrichmentResult;
  categoryName?: string;
  classifyState?: string;
  summary?: string;
  classifyError?: string;
  pendingFetchReview?: boolean;
  pendingFetchReviewReason?: string;
}): Pick<ImportReportRow, 'pipelineStatus' | 'detail'> {
  if (!input.wasProcessed) {
    return { pipelineStatus: 'not_run', detail: 'Saved to library — pipeline not run' };
  }

  if (input.enrichResult?.message?.startsWith('prior_kept_') || input.pendingFetchReview) {
    const reason =
      input.enrichResult?.message?.replace('prior_kept_', '') ||
      input.pendingFetchReviewReason ||
      'suspicious_fetch';
    return {
      pipelineStatus: 'review_needed',
      detail: `Kept prior summary — suspicious re-fetch (${reason.replace(/_/g, ' ')})`,
    };
  }

  if (input.enrichResult?.status === 'failed') {
    return { pipelineStatus: 'failed', detail: enrichDetail(input.enrichResult) };
  }

  if (input.categoryName) {
    return {
      pipelineStatus: 'classified',
      detail: `Category: ${input.categoryName}`,
    };
  }

  if (input.enrichResult?.skipped || input.enrichResult?.message === 'content_unchanged') {
    return { pipelineStatus: 'unchanged', detail: enrichDetail(input.enrichResult) };
  }

  if (input.enrichResult?.status === 'ok') {
    if (input.classifyState === 'pending_classify' || input.classifyState === 'pending_reclassify') {
      return {
        pipelineStatus: 'pending_classify',
        detail: input.summary ? 'Summary ready — pending classify' : 'Pending classify',
      };
    }
    if (input.classifyError) {
      return {
        pipelineStatus: 'enriched',
        detail: `Summary ready — ${input.classifyError}`,
      };
    }
    return {
      pipelineStatus: 'enriched',
      detail: input.summary ? 'Summary ready' : 'Fetch and extract complete',
    };
  }

  if (input.classifyError) {
    return { pipelineStatus: 'not_enriched', detail: input.classifyError };
  }

  return { pipelineStatus: 'not_enriched', detail: 'No enrichment yet' };
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
  enrichResults?: EnrichmentResult[];
}): Promise<ImportReport> {
  const enrichByItem = new Map((input.enrichResults ?? []).map((r) => [r.itemId, r]));
  const processedIds = input.processedIds ?? new Set<string>();
  const pipelineRan = processedIds.size > 0;

  const rows: ImportReportRow[] = [];
  for (const item of input.items) {
    const wasProcessed = processedIds.has(item.itemId);
    const enrichResult = enrichByItem.get(item.itemId);
    const ctx = wasProcessed ? await loadItemPipelineContext(item.itemId) : null;
    const { pipelineStatus, detail } = resolvePipelineStatus({
      wasProcessed,
      enrichResult,
      categoryName: ctx?.primaryCategoryName ?? undefined,
      classifyState: ctx?.classifyState,
      summary: ctx?.summary,
      classifyError: input.batchResult?.classifyError,
      pendingFetchReview: ctx?.enrichment?.pendingFetchReview,
      pendingFetchReviewReason: ctx?.enrichment?.pendingFetchReviewReason,
    });

    rows.push({
      itemId: item.itemId,
      url: item.url,
      title: item.title,
      outcome: item.outcome,
      pipelineStatus,
      detail,
      categoryName: ctx?.primaryCategoryName ?? undefined,
      summary: ctx?.summary,
      wasProcessed,
    });
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
  };
  for (const row of report.rows) {
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
