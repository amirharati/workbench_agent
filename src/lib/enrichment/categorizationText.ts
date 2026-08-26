import type { Item } from '../db';
import type { ItemEnrichment } from './types';
import {
  assessCategorizationEligibility,
  type CategorizationEligibilityInput,
} from './categorizationEligibility';
import { getPlacementNotes } from './itemText';

export const CATEGORIZATION_SNIPPET_MAX_CHARS = 2000;
/** Below this substantive length, try capped snippet fallback before skip. */
export const LEAN_TEXT_MIN_FOR_SNIPPET_FALLBACK = 80;

export interface BuildCategorizationTextOptions {
  /** Include capped fetch snippet (default false — lean path for embeddings). */
  includeSnippet?: boolean;
  /** Include the saved URL host (default true). Disable when classifying a redirected final page. */
  includeHost?: boolean;
  snippetMaxChars?: number;
  aiTags?: string[];
  aiSummary?: string;
  aiKeyPoints?: string[];
}

const SNIPPET_BOILER_LINE =
  /^(?:\s*|\*+|#+\s*)?(?:cookie|cookies|sign\s*in|sign\s*up|log\s*in|log\s*out|subscribe|newsletter|accept\s+all|reject\s+all|privacy\s+policy|terms\s+of|all\s+rights\s+reserved|skip\s+to|menu|navigation|breadcrumb|share\s+on|follow\s+us|advertisement|sponsored|loading\.\.\.|please\s+enable\s+javascript)/i;

/** Remove common nav/legal chrome from fetch snippets before embed. */
export function stripSnippetBoilerplate(snippet: string): string {
  const lines = snippet.split('\n');
  const kept: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (++blankRun <= 2) kept.push('');
      continue;
    }
    blankRun = 0;
    if (t.length < 4) continue;
    if (SNIPPET_BOILER_LINE.test(t)) continue;
    if (/^[\s|·•\-–—]{3,}$/.test(t)) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isRedirectedFinalDestination(
  enrichment?: ItemEnrichment | null
): boolean {
  return Boolean(
    enrichment?.pendingFetchReview &&
    enrichment.pendingFetchReviewReason === 'url_redirect'
  );
}

export function categorizationSourceTitle(
  item: Pick<Item, 'title'>,
  enrichment?: ItemEnrichment | null
): string {
  if (isRedirectedFinalDestination(enrichment) && enrichment?.fetchedTitle?.trim()) {
    return enrichment.fetchedTitle.trim();
  }
  return (item.title || '').trim();
}

/**
 * Char count of lean fields only (no snippet) — used for min-length and fallback.
 */
export function substantiveTextLength(
  item: Item,
  enrichment?: ItemEnrichment | null,
  options?: BuildCategorizationTextOptions
): number {
  let n = 0;
  const title = categorizationSourceTitle(item, enrichment);
  if (title) n += title.length;
  const notes = getPlacementNotes(item);
  if (notes) n += notes.length;
  if (!isRedirectedFinalDestination(enrichment)) {
    const host = hostFromUrl(item.url || '');
    if (host) n += host.length;
  }

  const tags = options?.aiTags ?? enrichment?.aiTags;
  if (tags?.length) n += tags.join(' ').length;

  const aiSummary =
    options?.aiSummary?.trim() ||
    (enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '');
  if (aiSummary) n += aiSummary.length;

  const keyPoints =
    options?.aiKeyPoints ??
    (enrichment?.aiStatus === 'ok' ? enrichment.aiKeyPoints?.filter((p) => p.trim()) : undefined);
  if (keyPoints?.length) n += keyPoints.join(' ').length;

  if (enrichment?.quotedText) n += enrichment.quotedText.length;
  if (enrichment?.description?.trim()) n += enrichment.description.trim().length;

  return n;
}

/**
 * Text for categorization embeddings: title, notes, tags, summary, key points;
 * optional capped snippet. Avoids full raw fetch dump by default.
 */
export function buildCategorizationText(
  item: Item,
  enrichment?: ItemEnrichment | null,
  options?: BuildCategorizationTextOptions
): string {
  const lines: string[] = [];
  const title = categorizationSourceTitle(item, enrichment);
  if (title) lines.push(`Title: ${title}`);

  const includeHost =
    options?.includeHost ?? !isRedirectedFinalDestination(enrichment);
  if (includeHost) {
    const host = hostFromUrl(item.url || '');
    if (host) lines.push(`Host: ${host}`);
  }

  const localNotes = getPlacementNotes(item);
  if (localNotes) lines.push(`Notes:\n${localNotes}`);

  const tags = options?.aiTags ?? enrichment?.aiTags;
  if (tags?.length) {
    lines.push(`Tags: ${tags.filter((t) => t.trim()).join(', ')}`);
  }

  const aiSummary =
    options?.aiSummary?.trim() ||
    (enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '');
  if (aiSummary) lines.push(`Summary:\n${aiSummary}`);

  const keyPoints =
    options?.aiKeyPoints ??
    (enrichment?.aiStatus === 'ok' ? enrichment.aiKeyPoints?.filter((p) => p.trim()) : undefined);
  if (keyPoints?.length) {
    lines.push(`Key points:\n${keyPoints.map((p) => `- ${p.trim()}`).join('\n')}`);
  }

  if (enrichment?.quotedText) {
    const qa = enrichment.quotedAuthor ? ` (${enrichment.quotedAuthor})` : '';
    lines.push(`Quoted${qa}:\n${enrichment.quotedText}`);
  }
  if (enrichment?.channel) lines.push(`Channel: ${enrichment.channel}`);
  if (enrichment?.description?.trim()) {
    lines.push(`Description: ${enrichment.description.trim()}`);
  }

  if (options?.includeSnippet) {
    const raw = enrichment?.snippet?.trim() || '';
    const snippet = raw ? stripSnippetBoilerplate(raw) : '';
    const cap = options.snippetMaxChars ?? CATEGORIZATION_SNIPPET_MAX_CHARS;
    if (snippet) {
      lines.push(`Snippet:\n${snippet.slice(0, cap)}`);
    }
  }

  return lines.join('\n\n');
}

export interface CategorizationEmbedTextResult {
  text: string;
  usedSnippetFallback: boolean;
}

/**
 * V1 embed policy: lean by default; snippet only when allowed and substantive fields are thin.
 */
export function buildCategorizationEmbedText(
  item: Item,
  enrichment?: ItemEnrichment | null,
  options: BuildCategorizationTextOptions & CategorizationEligibilityInput = {},
  eligibility?: { allowSnippetFallback: boolean }
): CategorizationEmbedTextResult {
  const lean = buildCategorizationText(item, enrichment, { ...options, includeSnippet: false });
  const substantive = substantiveTextLength(item, enrichment, options);
  const allowSnippet =
    eligibility?.allowSnippetFallback ??
    assessCategorizationEligibility(item, enrichment, options).allowSnippetFallback;

  if (
    substantive >= LEAN_TEXT_MIN_FOR_SNIPPET_FALLBACK ||
    options.includeSnippet ||
    !enrichment?.snippet?.trim() ||
    !allowSnippet
  ) {
    const text =
      options.includeSnippet && enrichment?.snippet?.trim() && allowSnippet
        ? buildCategorizationText(item, enrichment, { ...options, includeSnippet: true })
        : lean;
    return { text, usedSnippetFallback: false };
  }

  return {
    text: buildCategorizationText(item, enrichment, { ...options, includeSnippet: true }),
    usedSnippetFallback: true,
  };
}
