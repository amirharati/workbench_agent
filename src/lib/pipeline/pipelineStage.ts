import type { StatusBadgeVariant } from '../../components/StatusBadge';
import type { AiItemSignal, ClassifyState } from '../categorization/types';
import type { ItemEnrichment } from '../enrichment/types';
import type { ItemPipelineContext } from './itemPipelineContext';

export type PipelineCompleteLevel =
  | 'none'
  | 'fetched'
  | 'summarized'
  | 'complete';

export type PipelineMissingStep = 'embed' | 'classify';

export interface PipelineStageInfo {
  level: PipelineCompleteLevel;
  label: string;
  variant: StatusBadgeVariant;
  missing: PipelineMissingStep[];
  summarized: boolean;
  embedded: boolean;
  classified: boolean;
}

function isSummarized(enrichment?: ItemEnrichment): boolean {
  return enrichment?.status === 'ok' && enrichment.aiStatus === 'ok';
}

function isEmbedded(signal?: AiItemSignal, embedFailed = false): boolean {
  if (embedFailed || signal?.signalStatus === 'embed_failed') return false;
  if (signal?.signalStatus !== 'ok') return false;
  if (signal.embedding?.length) return true;
  // Tab/scoped caches deliberately strip vectors after worker persistence to
  // avoid hauling large embeddings through Chrome messaging.
  return Boolean(signal?.textHash && signal?.embeddingModel);
}

function isClassified(input: {
  primaryCategoryId?: string | null;
  suggestedLinkCount?: number;
}): boolean {
  return Boolean(input.primaryCategoryId || (input.suggestedLinkCount ?? 0) > 0);
}

export function resolvePipelineStageFromParts(input: {
  enrichment?: ItemEnrichment;
  embedFailed?: boolean;
  signal?: AiItemSignal;
  primaryCategoryId?: string | null;
  suggestedLinkCount?: number;
  classifyState?: ClassifyState;
}): PipelineStageInfo {
  const { enrichment, signal, embedFailed = false } = input;
  const summarized = isSummarized(enrichment);
  const embedded = isEmbedded(signal, embedFailed);
  const classified = isClassified(input);

  const missing: PipelineMissingStep[] = [];
  if (summarized && !embedded) missing.push('embed');
  if (summarized && !classified) missing.push('classify');

  if (!enrichment || enrichment.status === 'none') {
    return {
      level: 'none',
      label: 'Not processed',
      variant: 'info',
      missing: [],
      summarized: false,
      embedded: false,
      classified: false,
    };
  }

  if (enrichment.status === 'ok' && !summarized) {
    return {
      level: 'fetched',
      label: 'Fetched',
      variant: 'info',
      missing: ['embed', 'classify'],
      summarized: false,
      embedded: false,
      classified: false,
    };
  }

  if (summarized && embedded && classified) {
    return {
      level: 'complete',
      label: 'Enriched',
      variant: 'success',
      missing: [],
      summarized: true,
      embedded: true,
      classified: true,
    };
  }

  if (summarized) {
    let label = 'Summarized';
    if (missing.length === 1) {
      label = missing[0] === 'embed' ? 'Summarized · no embed' : 'Summarized · no category';
    } else if (missing.length === 2) {
      label = 'Summarized · pending pipeline';
    }
    return {
      level: 'summarized',
      label,
      variant: 'info',
      missing,
      summarized: true,
      embedded,
      classified,
    };
  }

  return {
    level: 'none',
    label: 'Not processed',
    variant: 'info',
    missing: [],
    summarized: false,
    embedded: false,
    classified: false,
  };
}

export function resolvePipelineStage(ctx: ItemPipelineContext): PipelineStageInfo {
  return resolvePipelineStageFromParts({
    enrichment: ctx.enrichment,
    embedFailed: ctx.signal?.signalStatus === 'embed_failed',
    signal: ctx.signal,
    primaryCategoryId: ctx.primaryCategoryId,
    suggestedLinkCount: ctx.suggestedLinks.length,
    classifyState: ctx.classifyState,
  });
}

export function formatPipelineMissingSteps(missing: PipelineMissingStep[]): string | undefined {
  if (!missing.length) return undefined;
  const parts = missing.map((s) => (s === 'embed' ? 'search embed' : 'category'));
  return `Still needs ${parts.join(' and ')}`;
}
