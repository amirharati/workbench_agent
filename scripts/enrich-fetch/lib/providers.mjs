import { X_HOSTS } from './constants.mjs';
import {
  cleanXMarkdown,
  detectFetchFailure,
  explainFetchFailure,
  isFetchBodyUsable,
  stripProviderWrapper,
  titleFromBlockedPage,
} from './fetchQuality.mjs';
import { htmlToMarkdown } from './htmlExtract.mjs';
import { classifySourceKind } from './parse.mjs';
import { fetchViaBrowserTab } from './tabBrowser.mjs';
import { browserFetchHeaders, fetchXStatusFromTwitterCdn } from './xCdn.mjs';

const TIMEOUT_MS = 25_000;

let includeTabProvider = true;

export function setProviderRunOptions(opts) {
  if (typeof opts.includeTab === 'boolean') includeTabProvider = opts.includeTab;
}

function providerNamesForUrl(url) {
  const names = ['local'];
  if (includeTabProvider) names.push('tab');
  names.push('jina', 'markdown-new');
  if (classifySourceKind(url) === 'x') names.push('syndication');
  return names;
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export async function fetchLocal(url) {
  const { signal, clear } = withTimeout(TIMEOUT_MS);
  try {
    if (classifySourceKind(url) === 'x') {
      const cdn = await fetchXStatusFromTwitterCdn(url, signal);
      if (cdn) {
        const markdown = stripProviderWrapper(cdn.markdown);
        return {
          ok: true,
          id: 'local',
          fetchSourceId: 'local',
          markdown,
          title: cdn.title,
          rawBytes: markdown.length,
        };
      }
    }

    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal,
      headers: browserFetchHeaders(),
    });
    if (!res.ok) {
      return { ok: false, id: 'local', errorCode: res.status === 429 ? 'rate_limited' : 'provider_error', status: res.status };
    }
    const html = await res.text();
    const parsed = htmlToMarkdown(html, url);
    if (!parsed) {
      return { ok: false, id: 'local', errorCode: 'parse_empty', rawBytes: html.length, preview: html.slice(0, 400) };
    }
    const markdown = stripProviderWrapper(parsed.markdown);
    return {
      ok: true,
      id: 'local',
      fetchSourceId: 'local',
      markdown,
      title: parsed.title,
      rawBytes: markdown.length,
    };
  } catch (e) {
    const code = e?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, id: 'local', errorCode: code, error: String(e) };
  } finally {
    clear();
  }
}

/** Playwright: real browser tab, JS rendered DOM (CLI stand-in for extension content script). */
export async function fetchTab(url) {
  return fetchViaBrowserTab(url);
}

export async function fetchJina(url) {
  const { signal, clear } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      method: 'GET',
      headers: { Accept: 'text/markdown, text/plain, */*' },
      signal,
    });
    if (res.status === 429) return { ok: false, id: 'jina', errorCode: 'rate_limited' };
    if (!res.ok) return { ok: false, id: 'jina', errorCode: 'provider_error', status: res.status };

    let text = stripProviderWrapper(await res.text());
    if (classifySourceKind(url) === 'x') {
      text = cleanXMarkdown(text);
    }
    const titleLine = text.split('\n').find((l) => /^#\s+/.test(l.trim()));
    const title = titleLine?.replace(/^#\s+/, '').trim();
    return {
      ok: true,
      id: 'jina',
      fetchSourceId: 'jina',
      markdown: text,
      title,
      rawBytes: text.length,
    };
  } catch (e) {
    const code = e?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, id: 'jina', errorCode: code, error: String(e) };
  } finally {
    clear();
  }
}

export async function fetchMarkdownNew(url) {
  const { signal, clear } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`https://markdown.new/${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: { Accept: 'text/markdown, text/plain, */*' },
      signal,
    });
    if (res.status === 429) return { ok: false, id: 'markdown-new', errorCode: 'rate_limited' };
    if (!res.ok) return { ok: false, id: 'markdown-new', errorCode: 'provider_error', status: res.status };

    const text = stripProviderWrapper(await res.text());
    const titleLine = text.split('\n').find((l) => /^#\s+/.test(l.trim()));
    const title = titleLine?.replace(/^#\s+/, '').trim();
    return {
      ok: true,
      id: 'markdown-new',
      fetchSourceId: 'markdown-new',
      markdown: text,
      title,
      rawBytes: text.length,
    };
  } catch (e) {
    const code = e?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, id: 'markdown-new', errorCode: code, error: String(e) };
  } finally {
    clear();
  }
}

/** X/Twitter syndication via fxtwitter (CLI-only experiment). */
export async function fetchSyndication(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, id: 'syndication', errorCode: 'invalid_url' };
  }

  const host = parsed.hostname.replace(/^www\./, '');
  if (!X_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { ok: false, id: 'syndication', errorCode: 'excluded', error: 'not an X/Twitter URL' };
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  const statusIdx = parts.findIndex((p) => p === 'status');
  if (statusIdx < 0 || !parts[statusIdx + 1]) {
    return { ok: false, id: 'syndication', errorCode: 'parse_empty', error: 'no status id in URL' };
  }

  const user = parts[statusIdx - 1] || 'i';
  const statusId = parts[statusIdx + 1];
  const apiUrl = `https://api.fxtwitter.com/${user}/status/${statusId}`;

  const { signal, clear } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return { ok: false, id: 'syndication', errorCode: 'provider_error', status: res.status };
    }
    const payload = await res.json();
    const tweet = payload?.tweet;
    if (!tweet?.text) {
      return { ok: false, id: 'syndication', errorCode: 'parse_empty' };
    }

    const author = tweet.author?.screen_name || user;
    const lines = [
      `# @${author}`,
      '',
      tweet.text.trim(),
    ];
    if (tweet.quote?.text) {
      lines.push('', `> Quote from @${tweet.quote.author?.screen_name || 'unknown'}:`, `> ${tweet.quote.text.trim()}`);
    }
    if (Array.isArray(tweet.media?.photos) && tweet.media.photos.length) {
      lines.push('', `(${tweet.media.photos.length} photo(s) attached)`);
    }

    const markdown = lines.join('\n');
    return {
      ok: true,
      id: 'syndication',
      fetchSourceId: 'syndication',
      markdown,
      title: `@${author}: ${tweet.text.trim().slice(0, 80)}`,
      rawBytes: markdown.length,
    };
  } catch (e) {
    const code = e?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, id: 'syndication', errorCode: code, error: String(e) };
  } finally {
    clear();
  }
}

function resultUsable(result) {
  if (!result.ok || !result.markdown?.trim()) return false;
  if (titleFromBlockedPage(result.title)) return false;
  if (detectFetchFailure(result.markdown)) return false;
  return isFetchBodyUsable(result.markdown);
}

export function diagnoseResult(result) {
  if (!result.ok) {
    return {
      usable: false,
      reason: result.errorCode || 'provider_error',
      detail: result.error || result.preview || null,
      bytes: result.rawBytes ?? 0,
    };
  }
  const failure = explainFetchFailure(result.markdown);
  if (failure) {
    return {
      usable: false,
      reason: failure.code,
      blockedBy: failure.detail,
      bytes: result.rawBytes ?? result.markdown.length,
      detail: result.markdown.slice(0, 300),
    };
  }
  if (titleFromBlockedPage(result.title)) {
    return { usable: false, reason: 'weak_title', bytes: result.markdown.length, detail: result.title };
  }
  if (!isFetchBodyUsable(result.markdown)) {
    return { usable: false, reason: 'too_short', bytes: result.markdown.length, detail: result.markdown.slice(0, 300) };
  }
  return { usable: true, reason: 'ok', bytes: result.markdown.length };
}

export async function fetchAllProviders(url) {
  const names = providerNamesForUrl(url);
  const attempts = [];
  for (const name of names) {
    const result = await PROVIDERS[name](url);
    attempts.push({ ...result, diagnosis: diagnoseResult(result) });
  }

  const winner =
    attempts.find((a) => resultUsable(a)) ??
    attempts.find((a) => a.ok && a.markdown) ??
    attempts[attempts.length - 1];

  return {
    winner,
    attempts,
    ok: resultUsable(winner),
  };
}

export async function fetchHybrid(url) {
  const isX = classifySourceKind(url) === 'x';
  const chain = [
    fetchLocal,
    ...(includeTabProvider ? [fetchTab] : []),
    ...(isX ? [fetchSyndication] : []),
    fetchJina,
    fetchMarkdownNew,
  ];

  const attempts = [];
  let last = { ok: false, id: 'hybrid', errorCode: 'provider_error' };

  for (const run of chain) {
    const result = await run(url);
    attempts.push({ ...result, diagnosis: diagnoseResult(result) });
    last = result;
    if (resultUsable(result)) {
      return { winner: result, attempts, ok: true };
    }
  }

  return { winner: last, attempts, ok: false };
}

export const PROVIDERS = {
  local: fetchLocal,
  tab: fetchTab,
  jina: fetchJina,
  'markdown-new': fetchMarkdownNew,
  syndication: fetchSyndication,
  hybrid: (url) => fetchHybrid(url),
};
