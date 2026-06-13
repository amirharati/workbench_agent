import type { RedirectContext } from './fetchRedirect';
import { redirectPromptBlock } from './fetchRedirect';
import {
  formatRedirectVerdictForSummary,
  type RedirectAiVerdictData,
} from './redirectAiVerdict';
import type { EnrichmentReference, SourceKind } from './types';

export type PromptVariant = 'v1' | 'v2';

export type EnrichmentAIHints = {
  quotedText?: string;
  quotedAuthor?: string;
  channel?: string;
  description?: string;
  /** Mechanical URL index from fetched markdown. */
  references?: EnrichmentReference[];
  redirectContext?: RedirectContext;
  /** Pre-summary redirect AI verdict (suspicious redirects only). */
  redirectVerdict?: RedirectAiVerdictData;
};

/** Which redirect-aware summary prompt path was used for the main extract call. */
export type SummaryRedirectPromptMode =
  | 'prior_verdict'
  | 'redirect_fields'
  | 'benign_hint'
  | 'none';

export function resolveSummaryRedirectPromptMode(
  hints: Pick<EnrichmentAIHints, 'redirectContext' | 'redirectVerdict'>
): SummaryRedirectPromptMode {
  if (hints.redirectVerdict) return 'prior_verdict';
  const ctx = hints.redirectContext;
  if (!ctx || ctx.redirectClass === 'none') return 'none';
  if (ctx.redirectClass === 'suspicious' || ctx.resourceMismatch) return 'redirect_fields';
  if (ctx.redirectClass === 'benign') return 'benign_hint';
  return 'none';
}

const JSON_SHAPE_V1 = `{
  "summary": "2-3 sentence summary of the main content",
  "improvedTitle": "clean human-readable title without site suffix",
  "tags": ["tag1", "tag2", "tag3"]
}`;

const JSON_SHAPE_V2 = `{
  "summary": "Detailed digest: lead + context; include names, products, and claims worth searching",
  "keyPoints": ["specific fact or topic", "another concrete point"],
  "improvedTitle": "clean human-readable title without site suffix",
  "tags": ["tag1", "tag2", "tag3"],
  "pageMatchesBookmark": true,
  "redirectNote": ""
}`;

const REDIRECT_JSON_RULES = `- pageMatchesBookmark: MUST align with prior redirect analysis when provided; else judge from URLs and body
- redirectNote: one short sentence when pageMatchesBookmark is false (reuse/adapt prior redirectNote when provided)
- When pageMatchesBookmark is false: summary describes what was ACTUALLY fetched (hub/listing/homepage) — never invent the original saved article`;

const REDIRECT_VERDICT_SUMMARY_RULES = `- Prior redirect analysis is authoritative for pageMatchesBookmark unless body clearly proves it wrong
- On mismatch: open summary by stating the saved URL no longer resolves to that resource, then summarize the fetched page
- keyPoints may list hub/listing items when fetchedPageKind is listing`;

const JSON_RULES_V2 = `- Return ONLY valid JSON (no markdown fences)
- summary: factual digest of the MAIN content the user bookmarked — not page chrome
- keyPoints: 0-6 short bullets with concrete entities, claims, or topics (empty array if none)
- When Indexed references lists link-only URLs, mention important ones in summary or keyPoints even if their page body was not fetched
- improvedTitle: omit " | Medium", " - Reddit", etc.; always provide a specific headline when Current title is generic (site name, Untitled, login, bare subreddit)
- tags: 3-8 lowercase topic tags about subject matter; include proper nouns when useful; omit platform names (x, reddit, youtube, github) — those are added automatically from the URL
- IGNORE login forms, cookie banners, CAPTCHA, and password fields — do not summarize or tag those UI elements
- If the page mixes login chrome WITH product/docs/marketing copy, extract ONLY the substantive copy (what the site/product does)
- NEVER use tags like cookies, privacy, login, sign in, consent, authentication, newsletter unless the article is ABOUT that topic
- Return all-empty JSON ONLY when, after ignoring chrome, there is truly no describable topic (pure login form, empty 404)
- If real article or product description exists, ignore navigation and legal boilerplate
- Adult/erotic/pornographic pages are valid bookmarks: summarize the scene or topic factually (tags: adult, erotic, fetish, etc. when applicable). NEVER refuse or return empty solely because content is sexual — this is a personal library, not public moderation`;

/** Baseline prompt shipped in Task 01 (single prompt for all sources). */
export const PROMPT_V1_SYSTEM = `You extract structured metadata from web page content for a bookmark manager.
Return ONLY valid JSON (no markdown fences) with this shape:
${JSON_SHAPE_V1}
Rules:
- summary: factual, concise, no fluff
- improvedTitle: omit " | Medium", " - Reddit", etc.; empty string if unknown
- tags: 3-5 lowercase topic tags; empty array if unclear
- If content is a login wall, paywall, or error page, return {"summary":"","improvedTitle":"","tags":[]}`;

const PROMPT_V2_BASE = `You extract structured metadata from bookmarked web content for a personal knowledge base.
The output will be used for categorization, search, and AI context — capture searchable detail.
Return ONLY valid JSON with this shape:
${JSON_SHAPE_V2}
${JSON_RULES_V2}`;

const PROMPT_V2_BY_KIND: Record<SourceKind, string> = {
  x: `${PROMPT_V2_BASE}

Source type: X (Twitter) post. Input may be very short (single tweet or thread reply).
- summary: 1-2 sentences stating the tweet's core message; quote a punchy phrase when present
- Omit thanks, sign-offs, "media attached", and generic meta ("user expresses excitement")
- keyPoints: 0-2 bullets only when there is a concrete claim, link, product, or name; else []
- improvedTitle: author + topic; omit " / X" suffixes
- tags: topics, people, products mentioned
- Do not invent parent tweet or thread context not in the input`,

  video: `${PROMPT_V2_BASE}

Source type: video page (often YouTube). Transcript may be absent — use title, channel, and description.
- summary: 3-4 sentences on what the video covers and why it matters
- keyPoints: 2-5 bullets (topics, tools, comparisons, claims from description/title)
- improvedTitle: video title cleaned of site suffix
- tags: subject matter; avoid generic "video" or "youtube" alone`,

  article: `${PROMPT_V2_BASE}

Source type: article or web page. Input may include login forms plus marketing copy.
- summary: 4-6 sentences on the MAIN topic (article body or product value prop); skip login/cookie UI
- keyPoints: 3-6 bullets — main ideas, tools, people, methods, or conclusions
- Login landing with product description: summarize the product/service, not the form
- Pure 404 with no topic: all-empty JSON
- improvedTitle: headline without publisher suffix; infer from content/URL when title is generic (Welcome, Sign in, site name only)
- tags: subject-matter only — never cookies/login/privacy UI`,

  generic: `${PROMPT_V2_BASE}

Source type: generic web page (may include link shorteners, social landing pages, or forum feeds).
- summary: 3-5 sentences; if content looks like a social post, preserve the core line
- FEED/LISTING pages (forum index, category hub, news home, subreddit feed): summary = overview of themes across visible items; keyPoints = one bullet PER distinct item/topic (up to 8), not just the first
- keyPoints: 2-8 bullets when substance exists; else []
- improvedTitle: cleaned page title
- tags: relevant searchable topics`,
};

export function getSystemPrompt(
  variant: PromptVariant,
  sourceKind: SourceKind = 'article',
  hints?: Pick<EnrichmentAIHints, 'redirectContext' | 'redirectVerdict'>
): string {
  if (variant === 'v1') return PROMPT_V1_SYSTEM;
  let prompt = PROMPT_V2_BY_KIND[sourceKind] ?? PROMPT_V2_BY_KIND.article;
  if (hints?.redirectVerdict) {
    prompt = `${prompt}\n\nRedirect-aware summary (prior analysis provided):\n${REDIRECT_JSON_RULES}\n${REDIRECT_VERDICT_SUMMARY_RULES}`;
  } else if (
    hints?.redirectContext &&
    (hints.redirectContext.redirectClass === 'suspicious' ||
      hints.redirectContext.resourceMismatch)
  ) {
    prompt = `${prompt}\n\nRedirect fields (required when redirect context is present):\n${REDIRECT_JSON_RULES}`;
  }
  return prompt;
}

export function buildExtractUserContent(
  url: string,
  title: string | undefined,
  body: string,
  hints?: EnrichmentAIHints,
  options?: { listingPage?: boolean; weakCurrentTitle?: boolean }
): string {
  const parts = [`URL: ${url}`, `Current title: ${title?.trim() || '(none)'}`];

  if (options?.weakCurrentTitle) {
    parts.push(
      'Current title is generic or uninformative — improvedTitle MUST be a specific, searchable headline for this bookmark (do not leave empty).'
    );
  }

  if (hints?.redirectVerdict) {
    parts.push(formatRedirectVerdictForSummary(hints.redirectVerdict));
  } else if (hints?.redirectContext?.redirectClass === 'benign') {
    const redirectBlock = redirectPromptBlock(hints.redirectContext);
    if (redirectBlock) parts.push(redirectBlock);
  }

  if (options?.listingPage) {
    parts.push(
      'Page type: multi-item LISTING/FEED (portal, forum, category, or hub). Summarize the page as a collection: overview in summary; keyPoints = one bullet per distinct listed item/topic (up to 8), not only the first.'
    );
  }

  if (hints?.channel?.trim()) {
    parts.push(`Channel: ${hints.channel.trim()}`);
  }
  if (hints?.description?.trim()) {
    parts.push(`Description: ${hints.description.trim().slice(0, 2000)}`);
  }
  if (hints?.references?.length) {
    const lines = hints.references.slice(0, 40).map((r) => {
      const flags = [
        r.scope,
        r.kind ?? 'unknown',
        r.followed ? 'fetched' : 'link-only',
      ].join(', ');
      return `- ${r.label}: ${r.url} (${flags})`;
    });
    parts.push(
      `Indexed references (cite link-only entries in summary/keyPoints when they matter):\n${lines.join('\n')}`
    );
  }
  if (hints?.quotedText?.trim()) {
    const author = hints.quotedAuthor?.trim();
    parts.push(`Quoted tweet${author ? ` (${author})` : ''}:\n${hints.quotedText.trim().slice(0, 4000)}`);
  }

  parts.push(`\nContent:\n${body}`);
  return parts.join('\n');
}
