import type { StatusBadgeVariant } from '../../components/StatusBadge';
import type { AiItemSignal, ClassifyState } from '../categorization/types';
import {
  FAILURE_CATEGORY_LABELS,
  resolveEnrichmentFailureLabel,
  type FailureCategory,
} from '../enrichment/failureLabels';
import type { ItemEnrichment } from '../enrichment/types';
import { PIPELINE_STATE_COLORS } from './pipelineDictionary';
import type { ItemPipelineContext } from './itemPipelineContext';
import { resolvePipelineStageFromParts } from './pipelineStage';

export type PipelineBadgeKind =
  | 'not_processed'
  | 'ready'
  | 'verified'
  | 'needs_review'
  | 'failed'
  | 'partial';

export interface PipelineBadge {
  kind: PipelineBadgeKind;
  variant: StatusBadgeVariant;
  label: string;
  /** Structured failure slug when kind === failed (for filters). */
  failureCategory?: string;
  failureStage?: 'fetch' | 'ai' | 'embed';
}

/** Shared inputs for Hub rows, Inspector, bookmarks, search. */
export interface PipelineStatusInput {
  enrichment?: ItemEnrichment;
  embedFailed?: boolean;
  signal?: AiItemSignal;
  /** AI primary leaf (suggested or accepted) — pipeline stage only. */
  primaryCategoryId?: string | null;
  /** User-accepted primary leaf — Verified badge. */
  verifiedPrimaryCategoryId?: string | null;
  suggestedLinkCount?: number;
  classifyState?: ClassifyState;
}

/** List/search rows: show actionable states plus Verified / Enriched when AI work is done. */
export function shouldShowListPipelineBadge(
  badge: PipelineBadge | null | undefined
): badge is PipelineBadge {
  if (!badge) return false;
  if (badge.kind === 'verified' || badge.kind === 'ready') return true;
  return badge.kind === 'failed' || badge.kind === 'needs_review' || badge.kind === 'partial';
}

export function pipelineBadgeToStatusChip(
  badge: PipelineBadge,
  enrichment?: ItemEnrichment
): { text: string; color: string } {
  if (badge.kind === 'failed' && badge.failureStage === 'embed') {
    return { text: badge.label, color: PIPELINE_STATE_COLORS.pending };
  }
  if (
    badge.kind === 'failed' &&
    badge.failureStage === 'ai' &&
    enrichment?.status === 'ok' &&
    badge.failureCategory
  ) {
    return {
      text: `Fetch OK · ${FAILURE_CATEGORY_LABELS[badge.failureCategory as FailureCategory]}`,
      color: PIPELINE_STATE_COLORS.skipped,
    };
  }
  const color =
    badge.kind === 'verified'
      ? PIPELINE_STATE_COLORS.verified
      : badge.kind === 'ready'
        ? PIPELINE_STATE_COLORS.success
        : badge.kind === 'failed'
        ? PIPELINE_STATE_COLORS.failed
        : badge.kind === 'needs_review'
          ? PIPELINE_STATE_COLORS.review
          : badge.variant === 'warning'
            ? PIPELINE_STATE_COLORS.skipped
            : badge.variant === 'error'
              ? PIPELINE_STATE_COLORS.failed
              : PIPELINE_STATE_COLORS.pending;
  return { text: badge.label, color };
}

/**
 * Single source of truth for pipeline row status across Hub, Inspector, bookmarks, search.
 *
 * - **Verified** — AI pipeline complete and user accepted primary category.
 * - **Enriched** — AI pipeline complete (fetch, summary, embed, classify); green default.
 * - **AI categories** — only when suggestions exist but pipeline is not complete yet.
 */
export function resolvePipelineStatus(input: PipelineStatusInput): PipelineBadge {
  const {
    enrichment,
    embedFailed = false,
    signal,
    primaryCategoryId = null,
    verifiedPrimaryCategoryId = null,
    suggestedLinkCount = 0,
  } = input;

  const signalState = signal?.classifyState ?? input.classifyState;

  const failureLabel = resolveEnrichmentFailureLabel(enrichment, embedFailed);
  if (failureLabel) {
    return {
      kind: 'failed',
      variant: 'error',
      label: failureLabel.shortLabel,
      failureCategory: failureLabel.category,
      failureStage: failureLabel.stage,
    };
  }

  if (enrichment?.pendingFetchReview) {
    return { kind: 'needs_review', variant: 'warning', label: 'Fetch review' };
  }

  const status = enrichment?.status ?? 'none';
  if (status === 'skipped') {
    return { kind: 'partial', variant: 'warning', label: 'Skipped' };
  }

  if (signalState === 'manual_review') {
    return { kind: 'needs_review', variant: 'warning', label: 'Manual review' };
  }

  if (
    signalState === 'pending_classify' ||
    signalState === 'pending_reclassify' ||
    signalState === 'pending_discover' ||
    ((signalState === 'classified' || signalState === 'classified_general') &&
      !primaryCategoryId &&
      suggestedLinkCount === 0)
  ) {
    return {
      kind: 'partial',
      variant: 'info',
      label: signalState === 'pending_discover' ? 'Pending discover' : 'Pending classify',
    };
  }

  const stage = resolvePipelineStageFromParts({
    enrichment,
    embedFailed,
    signal,
    primaryCategoryId,
    suggestedLinkCount,
    classifyState: signalState,
  });

  if (stage.level === 'complete') {
    if (verifiedPrimaryCategoryId) {
      return { kind: 'verified', variant: 'success', label: 'Verified' };
    }
    return { kind: 'ready', variant: 'success', label: 'Enriched' };
  }

  if (suggestedLinkCount > 0) {
    return { kind: 'needs_review', variant: 'warning', label: 'AI categories' };
  }

  if (stage.level === 'summarized') {
    return { kind: 'partial', variant: 'info', label: stage.label };
  }

  if (stage.level === 'fetched') {
    return { kind: 'partial', variant: 'info', label: 'Fetched' };
  }

  if (!enrichment || status === 'none') {
    return { kind: 'not_processed', variant: 'info', label: 'Not enriched' };
  }

  return { kind: 'not_processed', variant: 'info', label: 'Not processed' };
}

export function resolvePipelineBadge(ctx: ItemPipelineContext | null | undefined): PipelineBadge {
  if (!ctx) {
    return { kind: 'not_processed', variant: 'info', label: 'Not processed' };
  }

  const verifiedPrimaryCategoryId =
    ctx.acceptedLinks.find((l) => l.isPrimary)?.categoryId ?? null;

  return resolvePipelineStatus({
    enrichment: ctx.enrichment,
    embedFailed: ctx.signal?.signalStatus === 'embed_failed',
    signal: ctx.signal,
    primaryCategoryId: ctx.primaryCategoryId,
    verifiedPrimaryCategoryId,
    suggestedLinkCount: ctx.suggestedLinks.length,
    classifyState: ctx.classifyState,
  });
}
