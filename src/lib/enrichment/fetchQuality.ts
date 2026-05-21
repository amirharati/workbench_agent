import type { EnrichmentErrorCode } from './types';
import { ENRICHMENT_DEFAULTS } from './types';

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

/** Detect paywall, bot block, or empty fetch — works on full provider response. */
export function detectFetchFailure(markdown: string): EnrichmentErrorCode | undefined {
  const raw = markdown.trim();
  if (!raw) return 'parse_empty';

  const lower = raw.toLowerCase();

  for (const re of BLOCK_PATTERNS) {
    if (re.test(raw)) return 'auth_required';
  }

  if (raw.length < 40) return 'parse_empty';

  if (
    raw.length < 500 &&
    (lower.includes('sign in') ||
      lower.includes('log in') ||
      lower.includes('cookie') ||
      lower.includes('paywall') ||
      lower.includes('guest mode'))
  ) {
    return 'auth_required';
  }

  return undefined;
}

export function titleFromBlockedPage(title?: string): boolean {
  if (!title?.trim()) return false;
  return WEAK_TITLE_PATTERNS.some((re) => re.test(title.trim()));
}

export function isFetchBodyUsable(markdown: string, minChars = ENRICHMENT_DEFAULTS.minUsefulSnippetChars): boolean {
  const body = stripProviderWrapper(markdown);
  if (detectFetchFailure(body)) return false;
  return body.length >= minChars;
}
