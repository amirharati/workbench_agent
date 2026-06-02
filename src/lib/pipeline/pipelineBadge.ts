import type { StatusBadgeVariant } from '../../components/StatusBadge';
import { resolveEnrichmentFailureLabel } from '../enrichment/failureLabels';
import type { ItemPipelineContext } from './itemPipelineContext';
import { resolvePipelineStage } from './pipelineStage';

export type PipelineBadgeKind = 'not_processed' | 'ready' | 'needs_review' | 'failed' | 'partial';

export interface PipelineBadge {
  kind: PipelineBadgeKind;
  variant: StatusBadgeVariant;
  label: string;
  /** Structured failure slug when kind === failed (for filters). */
  failureCategory?: string;
  failureStage?: 'fetch' | 'ai' | 'embed';
}

/** List/search rows: only surface badges that need user action. */
export function shouldShowListPipelineBadge(
  badge: PipelineBadge | null | undefined
): badge is PipelineBadge {
  if (!badge) return false;
  return badge.kind === 'failed' || badge.kind === 'needs_review' || badge.kind === 'partial';
}

export function resolvePipelineBadge(ctx: ItemPipelineContext | null | undefined): PipelineBadge {
  if (!ctx) {
    return { kind: 'not_processed', variant: 'info', label: 'Not processed' };
  }

  const { enrichment, signal, classifyState, hasSuggestedLinks } = ctx;

  const failureLabel = resolveEnrichmentFailureLabel(
    enrichment,
    signal?.signalStatus === 'embed_failed'
  );

  if (failureLabel) {
    return {
      kind: 'failed',
      variant: 'error',
      label: failureLabel.shortLabel,
      failureCategory: failureLabel.category,
      failureStage: failureLabel.stage,
    };
  }

  if (classifyState === 'manual_review') {
    return { kind: 'needs_review', variant: 'warning', label: 'Manual review' };
  }
  if (hasSuggestedLinks) {
    return { kind: 'needs_review', variant: 'warning', label: 'AI categories' };
  }

  if (
    classifyState === 'pending_classify' ||
    classifyState === 'pending_reclassify' ||
    classifyState === 'pending_discover' ||
    // Orphan: signal says classified but no link exists yet — re-queue on next inspect
    ((classifyState === 'classified' || classifyState === 'classified_general') &&
      !hasSuggestedLinks &&
      !ctx.primaryCategoryId)
  ) {
    return { kind: 'partial', variant: 'info', label: 'Pending classify' };
  }

  const stage = resolvePipelineStage(ctx);

  if (stage.level === 'complete') {
    return { kind: 'ready', variant: 'success', label: 'Enriched' };
  }

  if (stage.level === 'summarized') {
    return { kind: 'partial', variant: 'info', label: stage.label };
  }

  if (stage.level === 'fetched') {
    return { kind: 'partial', variant: 'info', label: 'Fetched' };
  }

  if (!ctx.eligible || !enrichment || enrichment.status === 'none') {
    return { kind: 'not_processed', variant: 'info', label: 'Not processed' };
  }

  return { kind: 'not_processed', variant: 'info', label: 'Not processed' };
}
