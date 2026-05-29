const SHORT_LINK_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function shortLinkHeaders(): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'User-Agent': SHORT_LINK_UA,
  };
}

/** Follow redirects manually — t.co often ignores Location when using full Chrome UA. */
async function followRedirects(url: string, signal?: AbortSignal, maxHops = 10): Promise<string> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: shortLinkHeaders(),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      current = new URL(loc, current).href;
      continue;
    }
    break;
  }
  return current;
}

/** Prefer redirect:follow + response.url — works in extension; manual Location hops often don't. */
async function resolveShortLinkFinalUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal,
        headers: shortLinkHeaders(),
      });
      const final = res.url?.trim();
      if (final && final !== url && !isShortLinkHost(final)) {
        return final;
      }
    } catch {
      /* try next method */
    }
  }

  try {
    const manual = await followRedirects(url, signal);
    if (manual !== url && !isShortLinkHost(manual)) return manual;
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: shortLinkHeaders(),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) return new URL(loc, url).href;
    }
    const html = await res.text();
    const match = html.match(
      /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s"'<>]+\/status\/\d+/i
    );
    if (match?.[0]) return match[0];
  } catch {
    /* ignore */
  }

  return null;
}

async function resolveShortLinkViaBackground(url: string): Promise<string | null> {
  const g = globalThis as typeof globalThis & {
    chrome?: { runtime?: { sendMessage?: (...args: unknown[]) => void; lastError?: { message?: string } } };
  };
  const sendMessage = g.chrome?.runtime?.sendMessage;
  if (!sendMessage) return null;

  return new Promise((resolve) => {
    try {
      sendMessage({ type: 'resolve-short-url', url }, (resp: { url?: string | null } | undefined) => {
        if (g.chrome?.runtime?.lastError) {
          resolve(null);
          return;
        }
        const final = resp?.url?.trim();
        if (final && final !== url && !isShortLinkHost(final)) resolve(final);
        else resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

export function normalizeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isRedditHost(url: string): boolean {
  const host = normalizeHost(url);
  return host === 'reddit.com' || host.endsWith('.reddit.com');
}

export function isFileUrl(url: string): boolean {
  return /^file:\/\//i.test(url.trim());
}

/** Hosts / URLs where headless usually fails — prefer opening a real browser tab. */
export function prefersBrowserTabFetch(url: string): boolean {
  return isFileUrl(url) || isRedditHost(url);
}

/** Subreddit feed (/r/name) — one listing URL signal among many. */
export function isRedditListingUrl(url: string): boolean {
  if (!isRedditHost(url)) return false;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
    if (path.includes('/comments/')) return false;
    return /^\/r\/[^/]+(\/(hot|new|top|rising))?$/.test(path);
  } catch {
    return false;
  }
}

/** Hubs, category pages, forum indexes — not single-article URLs. */
export function isLikelyListingUrl(url: string): boolean {
  if (isRedditListingUrl(url)) return true;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    if (path.includes('/comments/')) return false;

    const listingPath =
      /^\/(category|categories|tag|tags|topic|topics|forum|forums|discussions|community|communities|feed|archive|archives|news|blog|blogs|posts)(\/|$)/.test(
        path
      ) ||
      /\/(category|tag|topics|forum|news|blog|feed)\/[^/]+\/?$/.test(path) ||
      path === '/' ||
      path.split('/').filter(Boolean).length <= 1;

    if (!listingPath) return false;

    // Avoid treating obvious single-article paths as listings
    if (/\/(\d{4}\/\d{2}\/|article|story|p\/|post\/|posts\/[^/]+)/.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isRedditThreadUrl(url: string): boolean {
  if (!isRedditHost(url)) return false;
  try {
    return new URL(url).pathname.includes('/comments/');
  } catch {
    return false;
  }
}

export function isShortLinkHost(url: string): boolean {
  return normalizeHost(url) === 't.co';
}

export function isXHost(url: string): boolean {
  const host = normalizeHost(url);
  return host === 'x.com' || host === 'twitter.com' || host === 't.co';
}

/** Strip /photo/1, /video/1, etc. — keep canonical status URL for APIs. */
export function canonicalizeXStatusUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'x.com' && host !== 'twitter.com') return url;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'status');
    if (idx < 0 || !parts[idx + 1]) return url;
    const user = parts[idx - 1] || 'i';
    const id = parts[idx + 1].replace(/\?.*$/, '');
    return `https://x.com/${user}/status/${id}`;
  } catch {
    return url;
  }
}

/** Resolve t.co to destination; normalize X status URLs (photo/video suffixes). */
export async function resolveFetchUrl(
  url: string,
  signal?: AbortSignal
): Promise<{ url: string; resolvedFrom: string | null }> {
  let current = url;
  let resolvedFrom: string | null = null;

  if (isShortLinkHost(url)) {
    resolvedFrom = url;
    try {
      let final =
        (await resolveShortLinkFinalUrl(url, signal)) ??
        (await resolveShortLinkViaBackground(url));
      if (final) current = final;
    } catch {
      /* keep current */
    }
  }

  const canonical = canonicalizeXStatusUrl(current);
  if (canonical !== url) {
    if (!resolvedFrom && current !== url) resolvedFrom = url;
    if (!resolvedFrom && canonical !== current) resolvedFrom = current;
    current = canonical;
  }

  if (resolvedFrom && current === url) {
    resolvedFrom = null;
  }

  return { url: current, resolvedFrom };
}

export function tcoUnresolvedError(originalUrl: string): string {
  return (
    `Could not resolve t.co link to an X/Twitter status (${originalUrl}). ` +
    `Open the link in Chrome once, then re-fetch — or save the expanded x.com/status/… URL.`
  );
}
