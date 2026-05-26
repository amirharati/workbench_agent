/**
 * CLI mirror of src/lib/enrichment/prompts.ts + aiExtract.ts — keep in sync.
 */

import {
  hasSubstantiveExtract,
  prepareExtractInput,
  sanitizeExtractOutput,
} from './extractFilters.mjs';

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
- summary: factual digest of the MAIN content the user bookmarked — not page chrome
- keyPoints: 0-6 short bullets with concrete entities, claims, or topics (empty array if none)
- improvedTitle: omit " | Medium", " - Reddit", etc.; empty string only if truly unknown
- tags: 3-8 lowercase topic tags about subject matter; include proper nouns when useful
- IGNORE login forms, cookie banners, CAPTCHA, and password fields — do not summarize or tag those UI elements
- If the page mixes login chrome WITH product/docs/marketing copy, extract ONLY the substantive copy (what the site/product does)
- NEVER use tags like cookies, privacy, login, sign in, consent, authentication, newsletter unless the article is ABOUT that topic
- Return all-empty JSON ONLY when, after ignoring chrome, there is truly no describable topic (pure login form, empty 404)
- If real article or product description exists, ignore navigation and legal boilerplate
- Adult/erotic/pornographic pages are valid bookmarks: summarize the scene or topic factually (tags: adult, erotic, fetish, etc. when applicable). NEVER refuse or return empty solely because content is sexual — this is a personal library, not public moderation`;

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

const PROMPT_V2_BY_KIND = {
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
- improvedTitle: headline without publisher suffix; infer from URL if title is generic (Welcome, Sign in)
- tags: subject-matter only — never cookies/login/privacy UI`,

  generic: `${PROMPT_V2_BASE}

Source type: generic web page (may include link shorteners or social landing pages).
- summary: 3-5 sentences; if content looks like a social post, preserve the core line
- keyPoints: 2-5 bullets when substance exists; else []
- improvedTitle: cleaned page title
- tags: relevant searchable topics`,
};

export function getSystemPrompt(variant, sourceKind = 'article') {
  if (variant === 'v1') return PROMPT_V1_SYSTEM;
  return PROMPT_V2_BY_KIND[sourceKind] ?? PROMPT_V2_BY_KIND.article;
}

export function buildExtractUserContent(url, title, body, hints = {}) {
  const parts = [`URL: ${url}`, `Current title: ${title?.trim() || '(none)'}`];

  if (hints.channel?.trim()) parts.push(`Channel: ${hints.channel.trim()}`);
  if (hints.description?.trim()) {
    parts.push(`Description: ${hints.description.trim().slice(0, 2000)}`);
  }
  if (hints.quotedText?.trim()) {
    const author = hints.quotedAuthor?.trim();
    parts.push(
      `Quoted tweet${author ? ` (${author})` : ''}:\n${hints.quotedText.trim().slice(0, 4000)}`
    );
  }

  parts.push(`\nContent:\n${body}`);
  return parts.join('\n');
}

const SUMMARY_MAX = 3000;
const KEY_POINT_MAX = 400;

function parseKeyPoints(value) {
  if (!Array.isArray(value)) return undefined;
  const points = value
    .filter((p) => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim().slice(0, KEY_POINT_MAX))
    .slice(0, 8);
  return points.length ? points : undefined;
}

export function parseJsonResponse(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const parsed = JSON.parse(candidate);
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, SUMMARY_MAX) : undefined;
    const improvedTitle =
      typeof parsed.improvedTitle === 'string'
        ? parsed.improvedTitle.trim().slice(0, 300)
        : undefined;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t) => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.trim().toLowerCase().slice(0, 40))
          .slice(0, 8)
      : undefined;
    const keyPoints = parseKeyPoints(parsed.keyPoints);
    return {
      summary: summary || undefined,
      keyPoints,
      improvedTitle: improvedTitle || undefined,
      tags: tags?.length ? tags : undefined,
    };
  } catch {
    return null;
  }
}

export function hasUsefulExtract(data) {
  return hasSubstantiveExtract(data);
}

/** Hybrid provider order per source kind (matches src/lib/enrichment/providers/hybrid.ts). */
export const HYBRID_PROVIDER_ORDER = {
  x: ['local', 'syndication'],
  video: ['jina'],
  article: ['local', 'jina'],
};

export async function runOpenRouterExtract(settings, { url, title, body, sourceKind, hints, variant }) {
  if (!settings.apiKey?.trim()) {
    return { status: 'not_configured', error: 'Missing OPENROUTER_API_KEY' };
  }

  const rawBody = body.trim().slice(0, 12_000);
  if (rawBody.length < 80) {
    return { status: 'content_too_short', error: 'Body too short' };
  }

  const prepared = prepareExtractInput(title, rawBody, sourceKind);
  if (prepared.shouldSkip) {
    return { status: 'empty_response', error: prepared.skipReason ?? 'No substantive text after chrome strip' };
  }

  const markdown = prepared.body;
  if (markdown.length < 80) {
    return { status: 'content_too_short', error: 'Too short after chrome strip' };
  }

  const baseUrl = (settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = settings.model || 'openai/gpt-4o-mini';
  const endpoint = `${baseUrl}/chat/completions`;
  const maxTokens = Math.max(settings.maxOutputTokens ?? 700, variant === 'v2' ? 1200 : 700);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs || 25_000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workbench-agent.local',
        'X-Title': 'Workbench Agent AI Eval',
      },
      body: JSON.stringify({
        model,
        temperature: settings.temperature ?? 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: getSystemPrompt(variant, sourceKind) },
          {
            role: 'user',
            content: buildExtractUserContent(url, title, markdown, hints),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { status: 'api_error', error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() || '';
    if (!text) {
      return { status: 'empty_response', error: 'Empty model response' };
    }

    const parsed = parseJsonResponse(text);
    if (!parsed) {
      return { status: 'parse_failed', error: 'Invalid JSON', raw: text.slice(0, 500) };
    }
    const sanitized = sanitizeExtractOutput(parsed);
    if (!hasUsefulExtract(sanitized)) {
      return { status: 'empty_response', error: 'No substantive content after chrome filter', data: sanitized };
    }
    return { status: 'ok', data: sanitized };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed';
    return { status: 'api_error', error: message };
  } finally {
    clearTimeout(timeout);
  }
}
