import { MIN_USEFUL_CHARS, X_HOSTS } from './constants.mjs';

export function stripProviderWrapper(markdown) {
  const marker = /Markdown Content:\s*\n/i;
  const match = markdown.match(marker);
  if (match && match.index !== undefined) {
    return markdown.slice(match.index + match[0].length).trim();
  }
  return markdown.trim();
}

export function cleanXMarkdown(md) {
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

export function localFetchSupported(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (X_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  } catch {
    return true;
  }
  return true;
}

const BLOCK_PATTERNS = [
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

export function explainFetchFailure(markdown) {
  const raw = markdown.trim();
  if (!raw) return { code: 'parse_empty', detail: 'empty body' };

  const lower = raw.toLowerCase();
  for (const re of BLOCK_PATTERNS) {
    if (re.test(raw)) {
      return { code: 'auth_required', detail: `matched block pattern ${re}` };
    }
  }

  if (raw.length < 40) return { code: 'parse_empty', detail: `only ${raw.length} chars` };

  if (
    raw.length < 500 &&
    (lower.includes('sign in') ||
      lower.includes('log in') ||
      lower.includes('cookie') ||
      lower.includes('paywall') ||
      lower.includes('guest mode'))
  ) {
    return { code: 'auth_required', detail: 'short body with login/cookie/paywall keywords' };
  }

  return undefined;
}

export function detectFetchFailure(markdown) {
  return explainFetchFailure(markdown)?.code;
}

export function titleFromBlockedPage(title) {
  if (!title?.trim()) return false;
  return WEAK_TITLE_PATTERNS.some((re) => re.test(title.trim()));
}

export function isFetchBodyUsable(markdown, minChars = MIN_USEFUL_CHARS) {
  const body = stripProviderWrapper(markdown);
  if (detectFetchFailure(body)) return false;
  return body.length >= minChars;
}
