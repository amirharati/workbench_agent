/**
 * Standard pipeline dictionary — stages, outcome states, and colors (V3-A3).
 * Use across Hub, Import Studio, progress modal, and batch messages.
 */
import type { TopicClassifySummary } from '../categorization/types';

export const PIPELINE_STAGE_LABELS = {
  fetch: 'Fetch',
  enrich: 'Enrich',
  classify: 'Classify',
  discover: 'Discover',
  embed: 'Embed',
} as const;

export type PipelineStageKey = keyof typeof PIPELINE_STAGE_LABELS;

/** Outcome state colors: green success, yellow skipped, red failed, blue pending. */
export const PIPELINE_STATE_COLORS = {
  success: 'var(--er-ok, #3fb950)',
  /** User accepted primary — distinct from green Enriched. */
  verified: '#a371f7',
  skipped: 'var(--er-warn, #d29922)',
  failed: 'var(--error, #f85149)',
  pending: '#58a6ff',
  neutral: 'var(--text-muted)',
  review: '#f97316',
} as const;

export type PipelineOutcomeTone = keyof typeof PIPELINE_STATE_COLORS;

/** Hub chip / label color — keep in sync with `pipelineBadgeToStatusChip`. */
export function pipelineStatusColorForLabel(label: string): string {
  if (label === 'Verified') return PIPELINE_STATE_COLORS.verified;
  if (label === 'Enriched') return PIPELINE_STATE_COLORS.success;
  if (label === 'Not enriched' || label === 'Not processed') return PIPELINE_STATE_COLORS.neutral;
  if (
    label.startsWith('Fetch ·') ||
    label.startsWith('Embed ·') ||
    label.includes('failed')
  ) {
    return PIPELINE_STATE_COLORS.failed;
  }
  if (label.startsWith('Fetch OK ·')) return PIPELINE_STATE_COLORS.skipped;
  if (
    label.includes('no category') ||
    label.includes('no embed') ||
    label.includes('pending') ||
    label.startsWith('Pending')
  ) {
    return PIPELINE_STATE_COLORS.pending;
  }
  if (label === 'Fetched') return PIPELINE_STATE_COLORS.pending;
  if (label.startsWith('Summarized')) return PIPELINE_STATE_COLORS.skipped;
  if (label === 'Manual review' || label === 'AI categories' || label === 'Fetch review') {
    return PIPELINE_STATE_COLORS.review;
  }
  if (label === 'Removal candidate') return PIPELINE_STATE_COLORS.failed;
  if (label === 'Needs attention' || label === 'General / Other') {
    return PIPELINE_STATE_COLORS.skipped;
  }
  if (label === 'Skipped') return PIPELINE_STATE_COLORS.skipped;
  return PIPELINE_STATE_COLORS.neutral;
}

/** @deprecated Use pipelineStatusColorForLabel */
export const pipelineStatusColor = pipelineStatusColorForLabel;

export const PIPELINE_OUTCOME_LABELS = {
  verified: 'Verified',
  enriched: 'Enriched',
  fetched: 'Fetched',
  classified: 'Classified',
  skipped: 'Skipped',
  failed: 'Failed',
  pending: 'Pending',
  unchanged: 'Unchanged',
} as const;

/** User-facing skip phrases (not hard failures). */
export function isPipelineSkipMessage(message?: string): boolean {
  if (!message?.trim()) return false;
  return (
    /\bskipped\b/i.test(message) ||
    /no taxonomy/i.test(message) ||
    /no ai key/i.test(message) ||
    /already up to date/i.test(message) ||
    /nothing to (run|classify)/i.test(message) ||
    message === 'classification cancelled'
  );
}

export function classifySkipTotal(summary?: TopicClassifySummary): number {
  if (!summary) return 0;
  return (
    summary.skippedIneligible +
    summary.skippedHash +
    summary.skippedManualReview
  );
}

export function formatClassifySkipBreakdown(summary: TopicClassifySummary): string {
  const bits: string[] = [];
  if (summary.skippedHash > 0) bits.push(`${summary.skippedHash} unchanged`);
  if (summary.skippedIneligible > 0) bits.push(`${summary.skippedIneligible} ineligible`);
  if (summary.skippedManualReview > 0) {
    bits.push(`${summary.skippedManualReview} manual review`);
  }
  return bits.join(', ');
}

/** Max per-bookmark rows in classify done modal before labeling as sample. */
export const CLASSIFY_DONE_REPORT_SAMPLE_CAP = 50;

/** Run-level classify summary for done modal (#8). */
export function formatClassifyRunSummary(s: TopicClassifySummary, itemCount?: number): string {
  const parts = [
    `${s.processed} LLM call${s.processed === 1 ? '' : 's'}`,
    `${s.classifiedSpecific} specific`,
    `${s.classifiedGeneral} general/Other`,
    `${s.pendingDiscover} need discover`,
  ];
  if (s.skippedHash > 0) {
    parts.push(`${s.skippedHash} unchanged (skipped, no LLM)`);
  }
  if (s.skippedIneligible > 0) {
    parts.push(`${s.skippedIneligible} ineligible`);
  }
  if (s.skippedManualReview > 0) {
    parts.push(`${s.skippedManualReview} manual review`);
  }
  if (s.llmErrors > 0) {
    parts.push(`${s.llmErrors} LLM error${s.llmErrors === 1 ? '' : 's'}`);
  }
  if (s.aiError) parts.push(s.aiError);
  if (itemCount != null && itemCount !== s.processed) {
    parts.unshift(`${itemCount} selected`);
  } else if (s.totalConsidered > s.processed && itemCount == null) {
    parts.push(`${s.totalConsidered} checked in scope`);
  }
  return parts.join(' · ');
}

/** Done modal headline: run totals first; note when row table is partial. */
export function formatClassifyDoneModalSummary(input: {
  summary: TopicClassifySummary;
  selectedCount?: number;
  reportRowCount?: number;
  reportRowTotal?: number;
}): string {
  const runLine = formatClassifyRunSummary(input.summary, input.selectedCount);
  const total = input.reportRowTotal ?? input.reportRowCount ?? 0;
  const shown = input.reportRowCount ?? 0;
  if (total > 0 && shown > 0 && shown < total) {
    return `${runLine} · Table shows ${shown} of ${total} bookmark${total === 1 ? '' : 's'}`;
  }
  if (total > CLASSIFY_DONE_REPORT_SAMPLE_CAP && shown > 0 && shown >= CLASSIFY_DONE_REPORT_SAMPLE_CAP) {
    return `${runLine} · Table is a sample (first ${shown})`;
  }
  return runLine;
}

/** Modal tone from classify run totals (not row-only tail failures). */
export function resolveClassifyDoneModalTone(summary: TopicClassifySummary): PipelineSummaryTone {
  const succeeded = summary.classifiedSpecific + summary.classifiedGeneral;
  if (summary.llmErrors > 0 && succeeded === 0) return 'error';
  if (succeeded > 0) return 'success';
  if (summary.llmErrors > 0) return 'info';
  if (summary.processed > 0) return 'info';
  return 'info';
}

export interface PipelineSummaryInput {
  enriched?: number;
  fetched?: number;
  skipped?: number;
  failed?: number;
  classified?: number;
  aiError?: string;
  /** Large completed batches keep an affected-item AI error in the details, not the headline. */
  compactAiNotice?: boolean;
  classifyError?: string;
  classifySummary?: TopicClassifySummary;
}

export type PipelineSummaryTone = 'success' | 'error' | 'info';

function pipelineSuccessCount(input: PipelineSummaryInput): number {
  return (
    (input.enriched ?? 0) +
    (input.fetched ?? 0) +
    (input.classified ?? 0) +
    (input.classifySummary?.classifiedSpecific ?? 0) +
    (input.classifySummary?.classifiedGeneral ?? 0)
  );
}

/**
 * Completion copy deliberately distinguishes a completed mixed batch from a
 * failed job. Individual rows still carry their exact failure reasons and
 * remain retryable; the batch headline should not read as though its completed
 * work was lost merely because some URLs were unavailable.
 */
export function formatPipelineCompletionSummary(input: PipelineSummaryInput): string {
  const parts: string[] = [];
  if (input.enriched) parts.push(`${input.enriched} enriched`);
  if (input.fetched) parts.push(`${input.fetched} fetched`);
  if (input.classified) parts.push(`${input.classified} classified`);
  if (input.skipped) parts.push(`${input.skipped} skipped`);
  if (input.failed) {
    parts.push(`${input.failed} ${pipelineSuccessCount(input) > 0 ? 'unavailable' : 'failed'}`);
  }
  if (input.aiError) {
    parts.push(
      input.compactAiNotice && pipelineSuccessCount(input) > 0
        ? 'Some AI steps need attention — see affected bookmarks below'
        : input.aiError
    );
  }
  return parts.length ? parts.join(' · ') : 'No changes';
}

/**
 * Large batch with a few fetch failures is still a success (green toast), not a run failure.
 */
export function isPartialPipelineSuccess(input: PipelineSummaryInput): boolean {
  const failed = input.failed ?? 0;
  const llmErrors = input.classifySummary?.llmErrors ?? 0;
  if (failed === 0 && llmErrors === 0) return false;
  const succeeded = pipelineSuccessCount(input);
  if (succeeded === 0) return false;
  if (input.classifyError && !isPipelineSkipMessage(input.classifyError)) return false;
  const failTotal = failed + llmErrors;
  if (succeeded >= failTotal * 4) return true;
  if (succeeded >= 50 && failTotal <= 15) return true;
  return false;
}

/** Modal / toast tone — skips and empty-taxonomy classify are not errors. */
export function resolvePipelineSummaryTone(input: PipelineSummaryInput): PipelineSummaryTone {
  const failed = input.failed ?? 0;
  const llmErrors = input.classifySummary?.llmErrors ?? 0;
  const succeeded = pipelineSuccessCount(input);

  if (input.aiError) return 'info';

  if (isPartialPipelineSuccess(input)) {
    return 'success';
  }

  if (isPipelineSkipMessage(input.classifyError) && failed === 0 && llmErrors === 0) {
    if (succeeded > 0) return 'success';
    return 'info';
  }

  if (llmErrors > 0 && succeeded === 0) return 'error';
  if (failed > 0 && succeeded === 0) return 'error';

  if (input.classifyError && !isPipelineSkipMessage(input.classifyError)) {
    return succeeded > 0 ? 'info' : 'error';
  }

  if (failed > 0 || llmErrors > 0) {
    // A resolved batch with any completed work is a mixed result, regardless
    // of ratio. Per-item misses belong in the report; a red batch-level state
    // is reserved for a run that produced no successful work at all.
    return succeeded > 0 ? 'info' : 'error';
  }

  if (succeeded > 0) return 'success';
  return 'info';
}
