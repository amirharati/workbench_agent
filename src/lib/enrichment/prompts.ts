import type { SourceKind } from './types';

export type PromptVariant = 'v1' | 'v2';

export type EnrichmentAIHints = {
  quotedText?: string;
  quotedAuthor?: string;
  channel?: string;
  description?: string;
};

const JSON_SHAPE_V1 = `{
  "summary": "2-3 sentence summary of the main content",
  "improvedTitle": "clean human-readable title without site suffix",
  "tags": ["tag1", "tag2", "tag3"]
}`;

const JSON_SHAPE_V2 = `{
  "summary": "Detailed digest: lead + context; include names, products, and claims worth searching",
  "keyPoints": ["specific fact or topic", "another concrete point"],
  "improvedTitle": "clean human-readable title without site suffix",
  "tags": ["tag1", "tag2", "tag3"]
}`;

const JSON_RULES_V2 = `- Return ONLY valid JSON (no markdown fences)
- summary: factual digest for humans and search — not a vague paraphrase
- keyPoints: 0-6 short bullets with concrete entities, claims, or topics (empty array if none)
- improvedTitle: omit " | Medium", " - Reddit", etc.; empty string only if truly unknown
- tags: 3-8 lowercase topic tags; include proper nouns when useful
- Return all-empty fields ONLY when input is purely a cookie/login/captcha gate with no describable content
- If any usable text exists, provide at least summary OR keyPoints OR improvedTitle OR tags`;

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

Source type: article or web page. Input may be long.
- summary: 4-6 sentences covering thesis, scope, and takeaway; name key entities
- keyPoints: 3-6 bullets — main ideas, tools, people, methods, or conclusions
- 404/moved pages: note the error and what the site/topic is
- Thin pages: extract whatever is present
- improvedTitle: headline without publisher suffix
- tags: specific topics and named entities`,

  generic: `${PROMPT_V2_BASE}

Source type: generic web page (may include link shorteners or social landing pages).
- summary: 3-5 sentences; if content looks like a social post, preserve the core line
- keyPoints: 2-5 bullets when substance exists; else []
- improvedTitle: cleaned page title
- tags: relevant searchable topics`,
};

export function getSystemPrompt(variant: PromptVariant, sourceKind: SourceKind = 'article'): string {
  if (variant === 'v1') return PROMPT_V1_SYSTEM;
  return PROMPT_V2_BY_KIND[sourceKind] ?? PROMPT_V2_BY_KIND.article;
}

export function buildExtractUserContent(
  url: string,
  title: string | undefined,
  body: string,
  hints?: EnrichmentAIHints
): string {
  const parts = [`URL: ${url}`, `Current title: ${title?.trim() || '(none)'}`];

  if (hints?.channel?.trim()) {
    parts.push(`Channel: ${hints.channel.trim()}`);
  }
  if (hints?.description?.trim()) {
    parts.push(`Description: ${hints.description.trim().slice(0, 2000)}`);
  }
  if (hints?.quotedText?.trim()) {
    const author = hints.quotedAuthor?.trim();
    parts.push(`Quoted tweet${author ? ` (${author})` : ''}:\n${hints.quotedText.trim().slice(0, 4000)}`);
  }

  parts.push(`\nContent:\n${body}`);
  return parts.join('\n');
}
