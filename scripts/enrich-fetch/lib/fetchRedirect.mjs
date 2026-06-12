/**
 * CLI mirror of src/lib/enrichment/fetchRedirect.ts — keep in sync.
 */

const SHORT_LINK_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HOST_ALIASES = {
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

function probeHeaders() {
  return {
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'User-Agent': SHORT_LINK_UA,
  };
}

export function normalizeHost(host) {
  return host.replace(/^www\./, '').toLowerCase();
}

export function canonicalHost(host) {
  const normalized = normalizeHost(host);
  return HOST_ALIASES[normalized] ?? normalized;
}

export function normalizePath(pathname) {
  const trimmed = pathname.replace(/\/+$/, '').toLowerCase();
  return trimmed || '/';
}

export function isAuthPath(url) {
  try {
    const path = new URL(url).pathname;
    return AUTH_PATH_RE.test(path) || /\/(login|signin|sign-in|auth)(?:\/|$)/i.test(path);
  } catch {
    return false;
  }
}

function pathDepth(pathname) {
  return pathname.split('/').filter(Boolean).length;
}

function hasArticleSignal(pathname) {
  return ARTICLE_PATH_RE.test(pathname);
}

function isGenericLandingPath(pathname) {
  const path = normalizePath(pathname);
  if (path === '/') return true;
  if (!GENERIC_LANDING_RE.test(path)) return false;
  return pathDepth(path) <= 2;
}

function primarySlug(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return null;
  const last = segments[segments.length - 1]?.replace(/\?.*$/, '');
  return last && last.length >= 4 ? last.toLowerCase() : null;
}

function parseXStatus(url) {
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

export function isXStatusEquivalent(requestedUrl, finalUrl) {
  const a = parseXStatus(requestedUrl);
  const b = parseXStatus(finalUrl);
  return Boolean(a && b && a.statusId === b.statusId);
}

export function urlsEquivalentForRedirect(requestedUrl, finalUrl) {
  try {
    const req = new URL(requestedUrl);
    const fin = new URL(finalUrl);
    if (canonicalHost(req.hostname) !== canonicalHost(fin.hostname)) return false;
    return normalizePath(req.pathname) === normalizePath(fin.pathname);
  } catch {
    return requestedUrl.trim() === finalUrl.trim();
  }
}

export function resourcePathMismatch(requestedUrl, finalUrl) {
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
    if (slug && hasArticleSignal(reqPath) && !finPath.includes(slug)) return true;

    if (hasArticleSignal(reqPath) && pathDepth(finPath) < pathDepth(reqPath) && slug && !finPath.includes(slug)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function classifyRedirect(requestedUrl, finalUrl) {
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

export function buildRedirectContext(requestedUrl, finalUrl, hops) {
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
    resourceMismatch: redirectClass !== 'none' ? resourcePathMismatch(requested, final) : undefined,
  };
}

export async function probeRedirectFinalUrl(url, { signal } = {}) {
  const hops = [url];
  let current = url;

  for (let i = 0; i < 10; i++) {
    let res;
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

export async function resolveRedirectContext(requestedUrl, { signal } = {}) {
  const probe = await probeRedirectFinalUrl(requestedUrl, { signal });
  return buildRedirectContext(requestedUrl, probe.finalUrl, probe.hops);
}

export function shouldRunRedirectAiVerdict(ctx) {
  return ctx.redirectClass === 'suspicious' || ctx.resourceMismatch === true;
}

const LOGIN_AUTH_REDIRECT_RE =
  /\b(?:sign[\s-]?in|log[\s-]?in|login required|auth(?:entication)? required|verify your identity|identity verification|join (?:linkedin|medium|facebook)|create an account|members only|subscribe to (?:read|view)|paywall|registration required)\b/i;

export function isLoginAuthRedirectSignal(ai) {
  const kind = ai?.redirectVerdict?.fetchedPageKind?.toLowerCase();
  if (kind === 'login') return true;
  const text = [ai?.redirectVerdict?.redirectNote, ai?.redirectVerdict?.reason, ai?.redirectNote]
    .filter(Boolean)
    .join(' ');
  return Boolean(text.trim() && LOGIN_AUTH_REDIRECT_RE.test(text));
}

export function shouldFlagRedirectReview(ctx, ai) {
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

export function redirectPromptBlock(ctx) {
  if (ctx.redirectClass === 'none') return undefined;

  const lines = [
    'Redirect detected: saved URL differs from fetched page URL.',
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
