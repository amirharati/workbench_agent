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

export interface PipelineSummaryInput {
  enriched?: number;
  skipped?: number;
  failed?: number;
  classified?: number;
  classifyError?: string;
  classifySummary?: TopicClassifySummary;
}

export type PipelineSummaryTone = 'success' | 'error' | 'info';

function pipelineSuccessCount(input: PipelineSummaryInput): number {
  return (
    (input.enriched ?? 0) +
    (input.classified ?? 0) +
    (input.classifySummary?.classifiedSpecific ?? 0) +
    (input.classifySummary?.classifiedGeneral ?? 0)
  );
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
    return succeeded > 0 ? 'success' : 'error';
  }

  if (failed > 0 || llmErrors > 0) {
    return succeeded > failed + llmErrors ? 'success' : 'error';
  }

  if (succeeded > 0) return 'success';
  return 'info';
}
