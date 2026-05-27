import type { StatusBadgeVariant } from '../../components/StatusBadge';
import type { ItemPipelineContext } from './itemPipelineContext';

export type PipelineBadgeKind = 'not_processed' | 'ready' | 'needs_review' | 'failed';

export interface PipelineBadge {
  kind: PipelineBadgeKind;
  variant: StatusBadgeVariant;
  label: string;
}

export function resolvePipelineBadge(ctx: ItemPipelineContext | null | undefined): PipelineBadge {
  if (!ctx) {
    return { kind: 'not_processed', variant: 'info', label: 'Not processed' };
  }

  const { enrichment, signal, classifyState, hasSuggestedLinks, eligible } = ctx;

  if (enrichment?.status === 'failed') {
    return { kind: 'failed', variant: 'error', label: 'Fetch failed' };
  }
  if (
    enrichment?.aiStatus === 'api_error' ||
    enrichment?.aiStatus === 'parse_failed' ||
    enrichment?.aiStatus === 'empty_response'
  ) {
    return { kind: 'failed', variant: 'error', label: 'AI failed' };
  }
  if (signal?.signalStatus === 'embed_failed') {
    return { kind: 'failed', variant: 'error', label: 'Embed failed' };
  }

  if (classifyState === 'manual_review') {
    return { kind: 'needs_review', variant: 'warning', label: 'Manual review' };
  }
  if (hasSuggestedLinks) {
    return { kind: 'needs_review', variant: 'warning', label: 'AI categories' };
  }

  const aiOk = enrichment?.aiStatus === 'ok';
  const embedOk = signal?.signalStatus === 'ok';
  if (
    classifyState === 'pending_classify' ||
    classifyState === 'pending_reclassify' ||
    classifyState === 'pending_discover' ||
    (aiOk && !ctx.primaryCategoryId && classifyState !== 'classified_general')
  ) {
    return { kind: 'not_processed', variant: 'info', label: 'Pending classify' };
  }

  const classified =
    classifyState === 'classified' ||
    (ctx.primaryCategoryId != null && classifyState !== 'classified_general');

  if (aiOk && (classified || embedOk)) {
    return { kind: 'ready', variant: 'success', label: 'Ready' };
  }
  if (aiOk) {
    return { kind: 'ready', variant: 'success', label: 'Enriched' };
  }

  if (!eligible || !enrichment || enrichment.status === 'none') {
    return { kind: 'not_processed', variant: 'info', label: 'Not processed' };
  }

  return { kind: 'not_processed', variant: 'info', label: 'Not processed' };
}
