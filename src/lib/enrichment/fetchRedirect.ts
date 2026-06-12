import type { FetchProviderResult } from './providers/types';

export type RedirectClass = 'none' | 'benign' | 'suspicious';

export type RedirectContext = {
  requestedUrl: string;
  finalUrl: string;
  hops: string[];
  redirectClass: RedirectClass;
  resourceMismatch?: boolean;
};

const SHORT_LINK_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HOST_ALIASES: Record<string, string> = {
  'twitter.com': 'x.com',
  'mobile.twitter.com': 'x.com',
  'x.com': 'x.com',
};

const AUTH_PATH_RE =
  /^\/(?:login|log-?in|sign-?in|signin|signup|sign-up|register|auth|oauth|sso|account\/login)(?:\/|$)/i;

const ARTICLE_PATH_RE =
  /\/(?:article|articles|posts?|blog|story|stories|p|news|entry|read)\/[^/]+/i;

const GENERIC_LANDING_RE =
  /^\/(?:|home|index|market(?:-news)?|news|articles?|blog|feed|discover|search|topics?|category|categories)(?:\/|$)/i;

function probeHeaders(): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'User-Agent': SHORT_LINK_UA,
  };
}

export function normalizeHost(host: string): string {
  return host.replace(/^www\./, '').toLowerCase();
}

export function canonicalHost(host: string): string {
  const normalized = normalizeHost(host);
  return HOST_ALIASES[normalized] ?? normalized;
}

export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '').toLowerCase();
  return trimmed || '/';
}

export function isAuthPath(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return AUTH_PATH_RE.test(path) || /\/(login|signin|sign-in|auth)(?:\/|$)/i.test(path);
  } catch {
    return false;
  }
}

function pathDepth(pathname: string): number {
  return pathname.split('/').filter(Boolean).length;
}

function hasArticleSignal(pathname: string): boolean {
  return ARTICLE_PATH_RE.test(pathname);
}

function isGenericLandingPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (path === '/') return true;
  if (!GENERIC_LANDING_RE.test(path)) return false;
  return pathDepth(path) <= 2;
}

function primarySlug(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return null;
  const last = segments[segments.length - 1]?.replace(/\?.*$/, '');
  return last && last.length >= 4 ? last.toLowerCase() : null;
}

function parseXStatus(url: string): { statusId: string } | null {
  try {
    const u = new URL(url);
    if (canonicalHost(u.hostname) !== 'x.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'status');
    if (idx < 0 || !parts[idx + 1]) return null;
    return { statusId: parts[idx + 1].replace(/\?.*$/, '') };
  } catch {
    return null;
  }
}

export function isXStatusEquivalent(requestedUrl: string, finalUrl: string): boolean {
  const a = parseXStatus(requestedUrl);
  const b = parseXStatus(finalUrl);
  return Boolean(a && b && a.statusId === b.statusId);
}

/** Same host + path modulo www/https/trailing slash and benign query differences. */
export function urlsEquivalentForRedirect(requestedUrl: string, finalUrl: string): boolean {
  try {
    const req = new URL(requestedUrl);
    const fin = new URL(finalUrl);
    if (canonicalHost(req.hostname) !== canonicalHost(fin.hostname)) return false;
    return normalizePath(req.pathname) === normalizePath(fin.pathname);
  } catch {
    return requestedUrl.trim() === finalUrl.trim();
  }
}

/** Saved URL points at a specific resource; final URL lost that identity (not login). */
export function resourcePathMismatch(requestedUrl: string, finalUrl: string): boolean {
  if (isAuthPath(finalUrl)) return false;

  try {
    const req = new URL(requestedUrl);
    const fin = new URL(finalUrl);
    const reqPath = normalizePath(req.pathname);
    const finPath = normalizePath(fin.pathname);

    if (reqPath === finPath) return false;

    if (canonicalHost(req.hostname) !== canonicalHost(fin.hostname)) {
      return !isXStatusEquivalent(requestedUrl, finalUrl);
    }

    if (hasArticleSignal(reqPath) && isGenericLandingPath(finPath)) return true;

    const slug = primarySlug(reqPath);
    if (slug && hasArticleSignal(reqPath) && !finPath.includes(slug)) {
      return true;
    }

    if (hasArticleSignal(reqPath) && pathDepth(finPath) < pathDepth(reqPath) && slug && !finPath.includes(slug)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function classifyRedirect(requestedUrl: string, finalUrl: string): RedirectClass {
  const requested = requestedUrl?.trim();
  const final = finalUrl?.trim();
  if (!requested || !final) return 'none';
  if (requested === final) return 'none';
  if (urlsEquivalentForRedirect(requested, final)) return 'benign';
  if (isXStatusEquivalent(requested, final)) return 'benign';
  if (isAuthPath(final)) return 'benign';

  if (resourcePathMismatch(requested, final)) return 'suspicious';

  try {
    const req = new URL(requested);
    const fin = new URL(final);
    if (canonicalHost(req.hostname) !== canonicalHost(fin.hostname)) return 'suspicious';
    if (normalizePath(req.pathname) !== normalizePath(fin.pathname)) return 'suspicious';
    return 'benign';
  } catch {
    return 'suspicious';
  }
}

/** Attach requested/final URLs + redirect context when missing (e.g. tab-session fetch). */
export function attachFetchRedirectFields(
  result: FetchProviderResult,
  requestedUrl: string,
  finalUrl?: string | null
): FetchProviderResult {
  const requested = requestedUrl.trim();
  const final = (finalUrl ?? result.finalUrl ?? requested).trim();
  return {
    ...result,
    requestedUrl: requested,
    finalUrl: final,
    redirectContext: result.redirectContext ?? buildRedirectContext(requested, final),
  };
}

export function buildRedirectContext(
  requestedUrl: string,
  finalUrl: string,
  hops?: string[]
): RedirectContext {
  const requested = requestedUrl.trim();
  const final = (finalUrl || requestedUrl).trim();
  const redirectClass = classifyRedirect(requested, final);
  const chain =
    hops?.length && hops[0] === requested
      ? hops
      : final !== requested
        ? [requested, final]
        : [requested];

  return {
    requestedUrl: requested,
    finalUrl: final,
    hops: chain,
    redirectClass,
    resourceMismatch:
      redirectClass !== 'none' ? resourcePathMismatch(requested, final) : undefined,
  };
}

/** Follow redirects manually and record hop chain. */
export async function probeRedirectFinalUrl(
  url: string,
  signal?: AbortSignal
): Promise<{ finalUrl: string; hops: string[] }> {
  const hops: string[] = [url];
  let current = url;

  for (let i = 0; i < 10; i++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: probeHeaders(),
      });
    } catch {
      break;
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      current = new URL(loc, current).href;
      if (hops[hops.length - 1] !== current) hops.push(current);
      continue;
    }

    break;
  }

  if (hops.length === 1) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal,
        headers: probeHeaders(),
      });
      const final = res.url?.trim() || url;
      if (final !== url && hops[hops.length - 1] !== final) hops.push(final);
      return { finalUrl: final, hops };
    } catch {
      return { finalUrl: url, hops };
    }
  }

  return { finalUrl: current, hops };
}

export type RedirectAiHints = {
  pageMatchesBookmark?: boolean;
  redirectNote?: string;
  redirectVerdict?: {
    pageMatchesBookmark: boolean;
    fetchedPageKind?: string;
    redirectNote?: string;
    reason?: string;
  };
};

const LOGIN_AUTH_REDIRECT_RE =
  /\b(?:sign[\s-]?in|log[\s-]?in|login required|auth(?:entication)? required|verify your identity|identity verification|join (?:linkedin|medium|facebook)|create an account|members only|subscribe to (?:read|view)|paywall|registration required)\b/i;

/** Login/auth shell — not a stale-URL redirect mismatch. */
export function isLoginAuthRedirectSignal(ai?: RedirectAiHints): boolean {
  const kind = ai?.redirectVerdict?.fetchedPageKind?.toLowerCase();
  if (kind === 'login') return true;
  const text = [ai?.redirectVerdict?.redirectNote, ai?.redirectVerdict?.reason, ai?.redirectNote]
    .filter(Boolean)
    .join(' ');
  return Boolean(text.trim() && LOGIN_AUTH_REDIRECT_RE.test(text));
}

/** Suspicious redirects only — skip benign/none (short links, www, twitter→x). */
export function shouldRunRedirectAiVerdict(ctx: RedirectContext): boolean {
  return ctx.redirectClass === 'suspicious' || ctx.resourceMismatch === true;
}

export type RedirectReviewDecision = {
  /** Hub warning + review lane — only when AI clearly says mismatch. */
  flag: boolean;
  reason?: string;
  /** Informational note in lastErrorDetail — does not block classify. */
  annotate?: string;
};

/**
 * Post-check after redirect verdict + summary.
 * Prefer escalation over removal: mechanical path hints alone do not flag review;
 * classify/link-quality may bucket later if the page is truly junk.
 */
export function shouldFlagRedirectReview(
  ctx: RedirectContext,
  ai?: RedirectAiHints
): RedirectReviewDecision {
  if (ctx.redirectClass === 'none' && !ctx.resourceMismatch) {
    return { flag: false };
  }

  const verdict = ai?.redirectVerdict;
  const verdictMatch = verdict?.pageMatchesBookmark;
  const extractMatch = ai?.pageMatchesBookmark;

  if (isLoginAuthRedirectSignal(ai)) {
    const note =
      verdict?.redirectNote?.trim() ||
      verdict?.reason?.trim() ||
      ai?.redirectNote?.trim() ||
      'Sign-in or auth required to view this page';
    return { flag: false, annotate: note };
  }

  if (verdictMatch === true) {
    const note = verdict?.redirectNote?.trim() || verdict?.reason?.trim();
    return note ? { flag: false, annotate: note } : { flag: false };
  }

  if (verdictMatch === false) {
    const note = verdict?.redirectNote?.trim() || verdict?.reason?.trim();
    return {
      flag: true,
      reason:
        note ||
        `Redirect: fetched page does not match saved URL (${ctx.requestedUrl} → ${ctx.finalUrl})`,
      annotate: note,
    };
  }

  if (extractMatch === false) {
    if (isLoginAuthRedirectSignal(ai)) {
      const note = ai?.redirectNote?.trim() || 'Sign-in or auth required to view this page';
      return { flag: false, annotate: note };
    }
    const note = ai?.redirectNote?.trim();
    return {
      flag: true,
      reason:
        note ||
        `Summary: page does not match saved URL (${ctx.requestedUrl} → ${ctx.finalUrl})`,
      annotate: note,
    };
  }

  if (ctx.resourceMismatch || ctx.redirectClass === 'suspicious') {
    return {
      flag: false,
      annotate: `Redirect: saved ${ctx.requestedUrl} → fetched ${ctx.finalUrl}`,
    };
  }

  return { flag: false };
}

export function redirectPromptBlock(ctx: RedirectContext): string | undefined {
  if (ctx.redirectClass === 'none') return undefined;

  const lines = [
    `Redirect detected: saved URL differs from fetched page URL.`,
    `Saved URL: ${ctx.requestedUrl}`,
    `Fetched URL: ${ctx.finalUrl}`,
  ];
  if (ctx.hops.length > 2) {
    lines.push(`Redirect chain: ${ctx.hops.join(' → ')}`);
  }

  if (ctx.redirectClass === 'suspicious' || ctx.resourceMismatch) {
    lines.push(
      '',
      'The saved URL may point at a different resource than the page body (e.g. article removed → site homepage).',
      'Set pageMatchesBookmark to false if the fetched page is NOT the resource the user bookmarked.',
      'Set pageMatchesBookmark to true only when the redirect is benign (same article, URL cleanup, or short-link expansion).',
      'If pageMatchesBookmark is false, add a short redirectNote explaining the mismatch.',
      'Login/paywall pages: pageMatchesBookmark may be true — summarize what is visible; auth is handled separately.'
    );
  } else {
    lines.push('Redirect appears benign (URL normalization or equivalent resource).');
  }

  return lines.join('\n');
}
