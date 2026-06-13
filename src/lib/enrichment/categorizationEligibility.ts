import type { Item } from '../db';
import type { EnrichmentAIStatus, ItemEnrichment } from './types';
import { getPlacementNotes } from './itemText';
import { stripSnippetBoilerplate } from './categorizationText';
import { isMediaPrimaryXContent } from './xMedia';

function isXBookmarkUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com');
  } catch {
    return false;
  }
}

/** Minimum semantic chars (title+summary+tags+notes; not host/snippet) to allow categorize. */
export const MIN_SEMANTIC_SUBSTANCE = 100;
export const MIN_AI_SUMMARY_LENGTH = 50;
export const MIN_NOTES_LENGTH = 80;
export const MIN_SNIPPET_SUBSTANCE = 120;

const GENERIC_TITLE =
  /^(?:welcome|home|sign\s*up|log\s*in|youtube|linkedin|facebook|twitter|x|untitled|page not found|404|error|undefined)\s*$/i;

const GENERIC_TITLE_SUFFIX = /\s[-—|]\s*(?:youtube|linkedin|facebook)\s*$/i;

const FAILED_AI: EnrichmentAIStatus[] = [
  'empty_response',
  'parse_failed',
  'api_error',
  'content_too_short',
];

export interface CategorizationEligibilityInput {
  aiStatus?: EnrichmentAIStatus | string;
  aiSummary?: string;
  aiTags?: string[];
  aiKeyPoints?: string[];
}

export interface CategorizationEligibilityResult {
  eligible: boolean;
  reason?: string;
  /** Semantic substance excluding host and junk title. */
  semanticLength: number;
  allowSnippetFallback: boolean;
  /** Balanced quality tier for classify observability. */
  qualityTier?: 'high' | 'medium' | 'low';
}

export function isGenericTitle(title: string): boolean {
  const t = title.trim();
  if (!t || t.length < 3) return true;
  if (GENERIC_TITLE.test(t)) return true;
  if (t.length < 18 && GENERIC_TITLE_SUFFIX.test(t)) return true;
  return false;
}

/** Snippet usable only when stripped body has real content (not platform chrome). */
export function snippetSubstance(snippet: string): number {
  const cleaned = stripSnippetBoilerplate(snippet);
  if (cleaned.length < MIN_SNIPPET_SUBSTANCE) return 0;
  const words = cleaned.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const unique = new Set(words);
  if (unique.size < 12) return 0;
  return cleaned.length;
}

export function semanticSubstanceLength(
  item: Item,
  enrichment?: ItemEnrichment | null,
  hints?: CategorizationEligibilityInput
): number {
  let n = 0;
  const title = (item.title || '').trim();
  if (title && !isGenericTitle(title)) n += title.length;

  const notes = getPlacementNotes(item);
  if (notes) n += notes.length;

  const tags = hints?.aiTags ?? enrichment?.aiTags;
  if (tags?.length) n += tags.filter((t) => t.trim()).join(' ').length;

  const summary =
    hints?.aiSummary?.trim() ||
    (enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '');
  if (summary) n += summary.length;

  const keyPoints =
    hints?.aiKeyPoints ??
    (enrichment?.aiStatus === 'ok' ? enrichment.aiKeyPoints?.filter((p) => p.trim()) : undefined);
  if (keyPoints?.length) n += keyPoints.join(' ').length;

  if (enrichment?.quotedText?.trim()) n += enrichment.quotedText.trim().length;
  if (enrichment?.description?.trim()) n += enrichment.description.trim().length;

  return n;
}

export function hasUsableFetchedBody(
  enrichment?: ItemEnrichment | null,
  hints?: CategorizationEligibilityInput
): boolean {
  const aiStatus = (hints?.aiStatus ?? enrichment?.aiStatus) as EnrichmentAIStatus | undefined;
  const summary =
    hints?.aiSummary?.trim() ||
    (enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '');
  if (aiStatus === 'ok' && summary.length >= MIN_AI_SUMMARY_LENGTH) return true;

  const snippet = enrichment?.snippet?.trim() || '';
  if (snippetSubstance(snippet) > 0) return true;

  if (enrichment?.hasRawBody) return true;
  return false;
}

/** Fetch attempted and failed with no AI/snippet/raw body — import notes do not count. */
export function fetchFailedWithoutUsableBody(
  enrichment?: ItemEnrichment | null,
  hints?: CategorizationEligibilityInput
): boolean {
  const status = enrichment?.status;
  if (!status || status === 'none' || status === 'ok') return false;
  return !hasUsableFetchedBody(enrichment, hints);
}

export function assessCategorizationEligibility(
  item: Item,
  enrichment?: ItemEnrichment | null,
  hints?: CategorizationEligibilityInput
): CategorizationEligibilityResult {
  const aiStatus = (hints?.aiStatus ?? enrichment?.aiStatus) as EnrichmentAIStatus | undefined;
  const summary =
    hints?.aiSummary?.trim() ||
    (enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '');
  const semanticLength = semanticSubstanceLength(item, enrichment, hints);
  const notes = getPlacementNotes(item);
  const title = (item.title || '').trim();
  const genericTitle = isGenericTitle(title);

  const aiOk = aiStatus === 'ok' && summary.length >= MIN_AI_SUMMARY_LENGTH;
  const notesOk = notes.length >= MIN_NOTES_LENGTH;
  const substanceOk = semanticLength >= MIN_SEMANTIC_SUBSTANCE;
  const substanceBorderline =
    semanticLength >= MIN_SEMANTIC_SUBSTANCE - 20 && semanticLength < MIN_SEMANTIC_SUBSTANCE;

  const snippet = enrichment?.snippet?.trim() || '';
  const snippetOk = snippetSubstance(snippet) > 0;
  const allowSnippetFallback =
    aiOk || (!FAILED_AI.includes(aiStatus as EnrichmentAIStatus) && snippetOk && !genericTitle);

  // Failed fetch with only bookmark/import chrome must not topic-classify.
  if (fetchFailedWithoutUsableBody(enrichment, hints)) {
    return {
      eligible: false,
      reason:
        enrichment?.lastErrorDetail?.trim() ||
        enrichment?.lastErrorCode?.trim() ||
        'fetch failed without usable body',
      semanticLength,
      allowSnippetFallback: false,
      qualityTier: 'low',
    };
  }

  // Embedded X media with almost no readable text — filter for manual review, not topic classify.
  if (
    enrichment?.status === 'ok' &&
    isXBookmarkUrl(item.url) &&
    isMediaPrimaryXContent(enrichment.snippet || '')
  ) {
    return {
      eligible: false,
      reason: 'embedded video without substantive text',
      semanticLength,
      allowSnippetFallback: false,
      qualityTier: 'low',
    };
  }

  if (aiOk) {
    return { eligible: true, semanticLength, allowSnippetFallback, qualityTier: 'high' };
  }

  if (notesOk) {
    return { eligible: true, semanticLength, allowSnippetFallback, qualityTier: 'medium' };
  }

  if (substanceOk) {
    return {
      eligible: true,
      semanticLength,
      allowSnippetFallback,
      qualityTier: genericTitle ? 'low' : 'medium',
    };
  }

  // Balanced: allow thin-but-valid snippet path when title is specific and snippet has substance.
  if (
    !FAILED_AI.includes(aiStatus as EnrichmentAIStatus) &&
    snippetOk &&
    !genericTitle &&
    substanceBorderline
  ) {
    return {
      eligible: true,
      semanticLength,
      allowSnippetFallback: true,
      qualityTier: 'low',
    };
  }

  if (FAILED_AI.includes(aiStatus as EnrichmentAIStatus)) {
    return {
      eligible: false,
      reason: `AI extraction failed (${aiStatus}) and insufficient semantic text (${semanticLength})`,
      semanticLength,
      allowSnippetFallback: false,
    };
  }

  if (genericTitle && summary.length < MIN_AI_SUMMARY_LENGTH) {
    return {
      eligible: false,
      reason: 'generic title without AI summary',
      semanticLength,
      allowSnippetFallback: false,
    };
  }

  return {
    eligible: false,
    reason: `insufficient semantic text (${semanticLength} < ${MIN_SEMANTIC_SUBSTANCE})`,
    semanticLength,
    allowSnippetFallback,
  };
}
