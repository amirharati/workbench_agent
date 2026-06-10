import {
  pipelineBadgeToStatusChip,
  resolvePipelineStatus,
  resolveSpecialClassificationBadge,
} from './pipelineBadge';
import { PIPELINE_STATE_COLORS } from './pipelineDictionary';
import type { ItemEnrichment } from '../enrichment/types';
import type { AiItemSignal } from '../categorization/types';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function runTests(): void {
  const okEnrichment = {
    status: 'ok',
    aiStatus: 'ok',
    summary: 'A substantive summary about machine learning and neural networks for readers.',
    snippet: 'x'.repeat(80),
  } as ItemEnrichment;

  const embeddedSignal = {
    signalStatus: 'ok',
    embedding: [0.1, 0.2],
  } as AiItemSignal;

  const completeInput = {
    enrichment: okEnrichment,
    embedFailed: false,
    signal: embeddedSignal,
    primaryCategoryId: 'seed_machine-learning',
    suggestedLinkCount: 0,
    classifyState: 'classified' as const,
  };

  const enriched = resolvePipelineStatus(completeInput);
  assert(enriched.kind === 'ready', 'specific topic complete → Enriched');
  assert(enriched.label === 'Enriched', 'specific topic label');

  const removal = resolveSpecialClassificationBadge({
    primaryCategoryId: 'seed_page-not-found',
    classifyState: 'classified_removal',
  });
  assert(removal?.kind === 'failed', 'link-quality removal → failed kind');
  assert(removal?.label === 'Removal candidate', 'link-quality removal label');

  const removalBadge = resolvePipelineStatus({
    ...completeInput,
    primaryCategoryId: 'seed_enrich-fetch-failed',
    classifyState: 'classified_removal',
  });
  assert(removalBadge.kind === 'failed', 'complete pipeline + removal leaf → not Enriched');
  assert(removalBadge.label === 'Removal candidate', 'removal hub label');

  const attentionBadge = resolvePipelineStatus({
    ...completeInput,
    primaryCategoryId: 'seed_login-auth-required',
    classifyState: 'classified_attention',
  });
  assert(attentionBadge.kind === 'needs_review', 'attention leaf → warning tier');
  assert(attentionBadge.label === 'Needs attention', 'attention hub label');

  const generalBadge = resolvePipelineStatus({
    ...completeInput,
    primaryCategoryId: 'technology-general',
    classifyState: 'classified_general',
  });
  assert(generalBadge.kind === 'partial', 'general fallback → partial');
  assert(generalBadge.label === 'General / Other', 'general fallback label');
  assert(generalBadge.variant === 'warning', 'general fallback warning variant');

  const aiFailed = resolvePipelineStatus({
    enrichment: {
      status: 'ok',
      aiStatus: 'content_too_short',
      snippet: 'short',
    } as ItemEnrichment,
    embedFailed: false,
    primaryCategoryId: 'seed_machine-learning',
    classifyState: 'classified',
  });
  assert(aiFailed.kind === 'failed', 'fetch OK + AI short → failed');
  const aiChip = pipelineBadgeToStatusChip(aiFailed, {
    status: 'ok',
    aiStatus: 'content_too_short',
  } as ItemEnrichment);
  assert(
    aiChip.color === PIPELINE_STATE_COLORS.skipped,
    'fetch OK + AI fail chip uses warning color'
  );
  assert(aiChip.text.includes('Fetch OK'), 'fetch OK prefix on AI failure');

  const fetchFailed = resolvePipelineStatus({
    enrichment: { status: 'failed', lastErrorCode: 'network' } as ItemEnrichment,
    embedFailed: false,
  });
  assert(fetchFailed.kind === 'failed', 'fetch failed → failed badge');
  const fetchChip = pipelineBadgeToStatusChip(fetchFailed);
  assert(fetchChip.color === PIPELINE_STATE_COLORS.failed, 'fetch fail uses error color');

  const embedFailed = resolvePipelineStatus({
    enrichment: okEnrichment,
    embedFailed: true,
    primaryCategoryId: 'seed_machine-learning',
    classifyState: 'classified',
  });
  assert(embedFailed.kind === 'failed', 'embed failed → failed badge');
  const embedChip = pipelineBadgeToStatusChip(embedFailed);
  assert(embedChip.color === PIPELINE_STATE_COLORS.failed, 'embed fail uses error color');

  console.log('pipelineBadge.test.ts: all tests passed');
}

runTests();
