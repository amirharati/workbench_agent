/**
 * CLI mirror of src/lib/enrichment/redirectAiVerdict.ts — keep in sync.
 */

import { shouldRunRedirectAiVerdict } from './fetchRedirect.mjs';

const VERDICT_JSON_SHAPE = `{
  "pageMatchesBookmark": true,
  "fetchedPageKind": "article | listing | homepage | login | error | other",
  "redirectNote": "one sentence for the user if pageMatchesBookmark is false, else empty string",
  "reason": "short internal explanation comparing saved URL path/title vs fetched page"
}`;

const VERDICT_SYSTEM = `You judge whether a bookmarked URL redirect landed on the SAME resource the user saved.
Return ONLY valid JSON (no markdown fences) with this shape:
${VERDICT_JSON_SHAPE}

Rules:
- Compare saved URL path/semantics and bookmark title to the fetched URL and body preview
- fetchedPageKind: what the fetched page actually is
- listing: multi-item hub, category index, forum feed
- homepage: site root or generic landing
- login: sign-in wall, verify identity, paywall, bot-blocked auth shell — NO public article body
- error: 404/410/5xx or removed content page
- article: single article/post body matching saved URL intent
- **login/auth vs redirect mismatch (critical):**
  - fetchedPageKind login → pageMatchesBookmark TRUE (NOT stale URL — session/auth issue)
  - pageMatchesBookmark FALSE only for clear public URL resource drift (article→hub, cross-site landing)
  - NEVER false for login, verify identity, sign-in, paywall-only shells
- redirectNote: login kind → brief sign-in note; false only for real URL drift
- Do NOT summarize the whole page — only judge match/mismatch
- Short-link expansion to the same tweet/article → pageMatchesBookmark true
- Saved /article/slug… but fetched public hub/homepage → pageMatchesBookmark false`;

export function buildRedirectVerdictUserContent(input) {
  const { redirectContext: ctx, bookmarkTitle, fetchedTitle, bodyPreview } = input;
  const lines = [
    `Saved URL: ${ctx.requestedUrl}`,
    `Fetched URL: ${ctx.finalUrl}`,
    `Bookmark title: ${bookmarkTitle?.trim() || '(none)'}`,
    `Fetched page title: ${fetchedTitle?.trim() || '(none)'}`,
  ];
  if (ctx.hops.length > 2) {
    lines.push(`Redirect chain: ${ctx.hops.join(' → ')}`);
  }
  if (ctx.resourceMismatch) {
    lines.push('Mechanical signal: resource path mismatch (saved path does not match fetched path).');
  }
  lines.push('', 'Body preview:', bodyPreview.trim().slice(0, 2500));
  return lines.join('\n');
}

export function parseRedirectVerdictResponse(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (typeof parsed.pageMatchesBookmark !== 'boolean') return null;
    const kind = String(parsed.fetchedPageKind ?? 'other').toLowerCase();
    const allowed = ['article', 'listing', 'homepage', 'login', 'error', 'other'];
    const fetchedPageKind = allowed.includes(kind) ? kind : 'other';
    return {
      pageMatchesBookmark: parsed.pageMatchesBookmark,
      fetchedPageKind,
      redirectNote:
        typeof parsed.redirectNote === 'string' ? parsed.redirectNote.trim().slice(0, 500) : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 500) : '',
    };
  } catch {
    return null;
  }
}

export function formatRedirectVerdictForSummary(verdict) {
  return [
    'Prior redirect analysis (from dedicated pre-step — you MUST align with this):',
    JSON.stringify(verdict, null, 2),
    '',
    verdict.pageMatchesBookmark
      ? 'The fetched page matches the saved bookmark. Summarize normally.'
      : 'The fetched page does NOT match the saved bookmark. Summarize what was ACTUALLY fetched (not the original article). Set pageMatchesBookmark false and reuse/adapt redirectNote.',
  ].join('\n');
}

export async function runRedirectAiVerdict(settings, options) {
  const at = Date.now();
  const ctx = options.redirectContext;

  if (!shouldRunRedirectAiVerdict(ctx)) {
    return { status: 'skipped', at };
  }
  if (!settings.apiKey?.trim()) {
    return { status: 'not_configured', error: 'Missing API key.', at };
  }

  const preview = options.bodyPreview.trim();
  if (preview.length < 40) {
    return { status: 'skipped', error: 'Body too short for redirect verdict.', at };
  }

  const baseUrl = (settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;
  const maxTokens = Math.min(settings.maxOutputTokens ?? 400, 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs || 25_000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workbench-agent.local',
        'X-Title': 'Workbench Redirect Verdict',
      },
      body: JSON.stringify({
        model: settings.model || 'openai/gpt-4o-mini',
        temperature: settings.temperature ?? 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: VERDICT_SYSTEM },
          {
            role: 'user',
            content: buildRedirectVerdictUserContent({
              redirectContext: ctx,
              bookmarkTitle: options.bookmarkTitle,
              fetchedTitle: options.fetchedTitle,
              bodyPreview: preview,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { status: 'api_error', error: `HTTP ${res.status}: ${errText.slice(0, 200)}`, at };
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() || '';
    const data = parseRedirectVerdictResponse(text);
    if (!data) {
      return { status: 'parse_failed', error: 'Could not parse redirect verdict JSON.', at };
    }
    return { status: 'ok', data, at };
  } catch (e) {
    return {
      status: 'api_error',
      error: e instanceof Error ? e.message : 'Redirect verdict failed',
      at,
    };
  } finally {
    clearTimeout(timer);
  }
}
