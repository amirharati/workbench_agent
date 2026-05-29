import type { EnrichmentErrorCode } from './types';
import { ENRICHMENT_DEFAULTS } from './types';
import { classifySourceKind } from './eligibility';
import { normalizeHost } from './urlPolicy';

/** Remove Jina / markdown.new metadata header before parsing body. */
export function stripProviderWrapper(markdown: string): string {
  const marker = /Markdown Content:\s*\n/i;
  const match = markdown.match(marker);
  if (match && match.index !== undefined) {
    return markdown.slice(match.index + match[0].length).trim();
  }
  return markdown.trim();
}

export function cleanXMarkdown(md: string): string {
  const raw = md.trim();
  if (!raw) return raw;

  const hasTweetSection = /##\s*(Post|Conversation)/i.test(raw);
  const hasHandle = /\[@?[A-Za-z0-9_]{1,50}\]/i.test(raw);
  if (!hasTweetSection || !hasHandle) return raw;

  let body = raw;
  const postIdx = body.search(/##\s*Post/i);
  if (postIdx >= 0) body = body.slice(postIdx);

  const footer = body.search(/\n##\s*(New to X\?|Trending now|Terms of Service)/i);
  if (footer > 0) body = body.slice(0, footer);

  return body.trim();
}

/** X/Twitter status pages are JS apps — local Readability fetch almost never works. */
export function localFetchSupported(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const xHosts = ['x.com', 'twitter.com', 't.co'];
    if (xHosts.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  } catch {
    return true;
  }
  return true;
}

const BLOCK_PATTERNS: RegExp[] = [
  /warning:\s*target url returned error/i,
  /warning:.*\b403\b/i,
  /warning:.*forbidden/i,
  /warning:.*captcha/i,
  /are you a robot/i,
  /performing security verification/i,
  /just a moment\.\.\./i,
  /pardon the interruption/i,
  /you'?ve been blocked by network security/i,
  /people on x are the first to know/i,
  /don'?t miss what'?s happening/i,
  /sign in to continue/i,
  /subscribe to continue/i,
  /enable javascript and cookies/i,
  /something went wrong/i,
  /let'?s give it another shot/i,
];

const WEAK_TITLE_PATTERNS = [
  /^medium$/i,
  /^reddit$/i,
  /^x$/i,
  /^twitter$/i,
  /^just a moment/i,
  /^bloomberg - are you a robot/i,
];

const GITHUB_NAV_MARKERS: RegExp[] = [
  /Search code, repositories, users, issues, pull requests/,
  /Provide feedback/,
  /We read every piece of feedback/,
  /Use saved searches to filter your results more quickly/,
  /Navigation Menu/,
  /Skip to content/,
];

export type FetchQualityContext = {
  url?: string;
  title?: string;
};

export type FetchQualityIssue = {
  code: EnrichmentErrorCode;
  detail: string;
  tier: 'hard' | 'soft';
};

/** Bodies shorter than this with a block pattern are hard-rejected (wall-only pages). */
const HARD_BLOCK_MAX_CHARS = 450;

/** Weak titles alone do not block when the body is at least this long. */
const WEAK_TITLE_MIN_BODY_CHARS = 1500;

const ALWAYS_HARD_BLOCK_PATTERNS: RegExp[] = [
  /you'?ve been blocked by network security/i,
];

function isGitHubContentUrl(url?: string): boolean {
  if (!url || !/github\.com/i.test(url)) return false;
  return /\/(blob|tree|wiki|raw)\//i.test(url) || /github\.com\/[^/]+\/[^/]+\/?$/i.test(url);
}

function isGitHubMarketingShell(body: string, url?: string): boolean {
  if (!isGitHubContentUrl(url)) return false;
  const hits = GITHUB_NAV_MARKERS.filter((re) => re.test(body)).length;
  if (hits < 2) return false;

  const isBlob = url ? /\/blob\//i.test(url) : false;
  if (isBlob) {
    const hasCode = /```/.test(body) || (body.match(/^[\s|].+\|/gm) || []).length >= 4;
    if (hasCode) return false;
  }

  const badgeImages = (body.match(/!\[Image[^\]]*\]\(https:\/\/camo\.githubusercontent\.com/gi) || []).length;
  if (badgeImages >= 3 && body.length < 8000) return true;

  return hits >= 2;
}

function isYoutubeJinaChrome(body: string, url?: string): boolean {
  if (!url || classifySourceKind(url) !== 'video') return false;

  const hasChromeHeader = /YouTube\s+Back\s+\[!/i.test(body) || /-\s*YouTube\s+Back\s+\[!/i.test(body);
  if (hasChromeHeader && body.length < 3500) return true;
  if (/\]\(https:\/\/www\.youtube\.com\/\s*"YouTube"\)/i.test(body) && body.length < 3500) return true;

  const imageLinks = (body.match(/!\[Image\s+\d+/gi) || []).length;
  if (imageLinks >= 3 && body.length < 2500 && !/transcript|description|views/i.test(body.slice(0, 1200))) {
    return true;
  }
  return false;
}

function isLoginChromeDominant(body: string, url?: string): boolean {
  const host = url ? normalizeHost(url) : '';
  const lower = body.toLowerCase();

  if (host.includes('linkedin.com') && /sign in|join linkedin|agree & join linkedin/i.test(body)) {
    if (body.length < 3000 || /sign in to view/i.test(body)) return true;
  }

  if (host.includes('medium.com') && /Continue in app|Sign in\/Sign up to access|Get unlimited access/i.test(body)) {
    return true;
  }

  if (host.includes('bloomberg.com') && /are you a robot|performing security verification/i.test(body)) {
    return true;
  }

  const consentHits = [
    'accept all cookies',
    'cookie preferences',
    'consent manager',
    'privacy preference center',
    'we use cookies',
  ].filter((p) => lower.includes(p)).length;
  if (consentHits >= 2 && body.length < 1800) return true;

  return false;
}

function rawBody(markdown: string): string {
  return stripProviderWrapper(markdown).trim();
}

/** High-confidence blocks — skip AI; body is almost certainly unusable. */
export function explainHardFetchFailure(
  markdown: string,
  _ctx: FetchQualityContext = {}
): FetchQualityIssue | undefined {
  if (!markdown?.trim()) {
    return { code: 'parse_empty', detail: 'empty body', tier: 'hard' };
  }
  const raw = rawBody(markdown);
  const lower = raw.toLowerCase();

  if (raw.length < 40) {
    return { code: 'parse_empty', detail: `only ${raw.length} chars`, tier: 'hard' };
  }

  for (const re of ALWAYS_HARD_BLOCK_PATTERNS) {
    if (re.test(raw)) {
      return { code: 'auth_required', detail: `matched hard block pattern ${re}`, tier: 'hard' };
    }
  }

  if (raw.length < HARD_BLOCK_MAX_CHARS) {
    for (const re of BLOCK_PATTERNS) {
      if (re.test(raw)) {
        return { code: 'auth_required', detail: `matched block pattern ${re}`, tier: 'hard' };
      }
    }
    if (
      lower.includes('sign in') ||
      lower.includes('log in') ||
      lower.includes('cookie') ||
      lower.includes('paywall') ||
      lower.includes('guest mode')
    ) {
      return {
        code: 'auth_required',
        detail: 'short body with login/cookie/paywall keywords',
        tier: 'hard',
      };
    }
  }

  return undefined;
}

/** Suspicious but not certain — proceed to AI extraction for adjudication. */
export function explainSoftFetchSuspect(
  markdown: string,
  ctx: FetchQualityContext = {}
): FetchQualityIssue | undefined {
  const raw = rawBody(markdown);
  if (!raw) return undefined;

  if (raw.length >= HARD_BLOCK_MAX_CHARS) {
    for (const re of BLOCK_PATTERNS) {
      if (re.test(raw)) {
        return {
          code: 'auth_required',
          detail: `matched block pattern in long body ${re}`,
          tier: 'soft',
        };
      }
    }
  }

  if (isGitHubMarketingShell(raw, ctx.url)) {
    return {
      code: 'parse_empty',
      detail: 'github marketing/nav shell without file content',
      tier: 'soft',
    };
  }

  if (isYoutubeJinaChrome(raw, ctx.url)) {
    return {
      code: 'parse_empty',
      detail: 'youtube jina page chrome without video content',
      tier: 'soft',
    };
  }

  if (isLoginChromeDominant(raw, ctx.url)) {
    return {
      code: 'auth_required',
      detail: 'login or consent chrome dominates body',
      tier: 'soft',
    };
  }

  if (titleFromBlockedPage(ctx.title) && raw.length < WEAK_TITLE_MIN_BODY_CHARS) {
    return { code: 'auth_required', detail: 'weak title with limited body', tier: 'soft' };
  }

  return undefined;
}

/** Hard issue first, else soft suspect (for CLI diagnosis / logging). */
export function explainFetchFailure(
  markdown: string,
  ctx: FetchQualityContext = {}
): FetchQualityIssue | undefined {
  return explainHardFetchFailure(markdown, ctx) ?? explainSoftFetchSuspect(markdown, ctx);
}

/** Hard blocks only — used for provider routing and legacy call sites. */
export function detectFetchFailure(markdown: string, ctx: FetchQualityContext = {}): EnrichmentErrorCode | undefined {
  return explainHardFetchFailure(markdown, ctx)?.code;
}

export function detectSoftFetchSuspect(
  markdown: string,
  ctx: FetchQualityContext = {}
): EnrichmentErrorCode | undefined {
  return explainSoftFetchSuspect(markdown, ctx)?.code;
}

export function titleFromBlockedPage(title?: string): boolean {
  if (!title?.trim()) return false;
  return WEAK_TITLE_PATTERNS.some((re) => re.test(title.trim()));
}

export function isFetchBodyUsable(
  markdown: string,
  minChars = ENRICHMENT_DEFAULTS.minUsefulSnippetChars,
  ctx: FetchQualityContext = {}
): boolean {
  const body = stripProviderWrapper(markdown);
  if (explainHardFetchFailure(body, ctx)) return false;
  return body.length >= minChars;
}
