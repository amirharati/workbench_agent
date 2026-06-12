import { AIClientError } from '../ai/types';
import type { AISettings } from '../ai/types';
import type { AICallAuditHook } from '../ai/callAudit';
import { runAICompletion } from '../ai/client';
import { loadAISettings } from '../ai/settings';
import type { RedirectContext } from './fetchRedirect';
import { shouldRunRedirectAiVerdict } from './fetchRedirect';

export type RedirectFetchedPageKind =
  | 'article'
  | 'listing'
  | 'homepage'
  | 'login'
  | 'error'
  | 'other';

export type RedirectAiVerdictData = {
  pageMatchesBookmark: boolean;
  fetchedPageKind: RedirectFetchedPageKind;
  redirectNote: string;
  reason: string;
};

export type RedirectAiVerdictStatus =
  | 'ok'
  | 'skipped'
  | 'not_configured'
  | 'parse_failed'
  | 'api_error';

export type RedirectAiVerdictOutcome = {
  status: RedirectAiVerdictStatus;
  data?: RedirectAiVerdictData;
  error?: string;
  at: number;
};

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
- listing: multi-item hub, category index, "items on this page", forum feed
- homepage: site root or generic landing
- login: sign-in wall, verify identity, paywall, "join to view", bot-blocked auth shell — NO public article body yet
- error: 404/410/5xx or removed content page
- article: single article/post body matching saved URL intent
- **login/auth vs redirect mismatch (critical):**
  - fetchedPageKind login → pageMatchesBookmark TRUE (saved URL may still be correct; user/bot/session issue — NOT a stale URL)
  - pageMatchesBookmark FALSE only for clear public URL resource drift: article→hub/listing, article→homepage, cross-site product landing, dead article slug → different public page
  - NEVER set pageMatchesBookmark false for login, verify identity, sign-in, or paywall-only shells
- redirectNote: when login kind — short note e.g. "Sign-in required to view this page"; leave empty when pageMatchesBookmark true and kind is article
- redirectNote when false: user-facing one-liner for real URL drift only (e.g. "Article removed — landed on portfolio-strategy hub")
- Do NOT summarize the whole page — only judge match/mismatch
- Short-link expansion to the same tweet/article → pageMatchesBookmark true
- Saved /article/slug… but fetched public hub/homepage/different section → pageMatchesBookmark false, kind listing or homepage`;

export function buildRedirectVerdictUserContent(input: {
  redirectContext: RedirectContext;
  bookmarkTitle?: string;
  fetchedTitle?: string;
  bodyPreview: string;
}): string {
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
  lines.push('', 'Body preview:', bodyPreview.trim().slice(0, 2_500));
  return lines.join('\n');
}

export function parseRedirectVerdictResponse(text: string): RedirectAiVerdictData | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (typeof parsed.pageMatchesBookmark !== 'boolean') return null;
    const kind = String(parsed.fetchedPageKind ?? 'other').toLowerCase();
    const fetchedPageKind = (
      ['article', 'listing', 'homepage', 'login', 'error', 'other'] as const
    ).includes(kind as RedirectFetchedPageKind)
      ? (kind as RedirectFetchedPageKind)
      : 'other';
    const redirectNote =
      typeof parsed.redirectNote === 'string' ? parsed.redirectNote.trim().slice(0, 500) : '';
    const reason =
      typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 500) : '';
    return {
      pageMatchesBookmark: parsed.pageMatchesBookmark,
      fetchedPageKind,
      redirectNote,
      reason,
    };
  } catch {
    return null;
  }
}

export type RunRedirectAiVerdictOptions = {
  redirectContext: RedirectContext;
  bookmarkTitle?: string;
  fetchedTitle?: string;
  bodyPreview: string;
  settings?: AISettings;
  signal?: AbortSignal;
  /** Records provider HTTP call (model, tokens, raw JSON response) when pipeline debug requests it. */
  audit?: { record: AICallAuditHook };
};

/** Small pre-summary AI call — only when redirect is suspicious (not benign/short-link). */
export async function runRedirectAiVerdict(
  options: RunRedirectAiVerdictOptions
): Promise<RedirectAiVerdictOutcome> {
  const at = Date.now();
  const ctx = options.redirectContext;

  if (!shouldRunRedirectAiVerdict(ctx)) {
    return { status: 'skipped', at };
  }

  const settings = options.settings ?? (await loadAISettings());
  if (!settings.apiKey.trim()) {
    return { status: 'not_configured', error: 'Missing API key.', at };
  }

  const preview = options.bodyPreview.trim();
  if (preview.length < 40) {
    return { status: 'skipped', error: 'Body too short for redirect verdict.', at };
  }

  const maxOutputTokens = Math.min(settings.maxOutputTokens, 400);

  try {
    const response = await runAICompletion(
      { ...settings, maxOutputTokens },
      {
        taskType: 'redirect_verdict',
        signal: options.signal,
        audit: options.audit
          ? { purpose: 'redirect_verdict', record: options.audit.record }
          : undefined,
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
      }
    );
    const data = parseRedirectVerdictResponse(response.text);
    if (!data) {
      return { status: 'parse_failed', error: 'Could not parse redirect verdict JSON.', at };
    }
    return { status: 'ok', data, at };
  } catch (e) {
    const message =
      e instanceof AIClientError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Redirect verdict request failed.';
    return { status: 'api_error', error: message, at };
  }
}

export function formatRedirectVerdictForSummary(verdict: RedirectAiVerdictData): string {
  return [
    'Prior redirect analysis (from dedicated pre-step — you MUST align with this):',
    JSON.stringify(verdict, null, 2),
    '',
    verdict.pageMatchesBookmark
      ? 'The fetched page matches the saved bookmark. Summarize normally.'
      : 'The fetched page does NOT match the saved bookmark. Summarize what was ACTUALLY fetched (not the original article). Set pageMatchesBookmark false and reuse/adapt redirectNote.',
  ].join('\n');
}
