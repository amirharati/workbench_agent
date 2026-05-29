import { X_HOSTS } from './constants.mjs';
import {
  cleanXMarkdown,
  detectFetchFailure,
  explainFetchFailure,
  explainHardFetchFailure,
  explainSoftFetchSuspect,
  isFetchBodyUsable,
  stripProviderWrapper,
} from './fetchQuality.mjs';
import { htmlToMarkdown } from './htmlExtract.mjs';
import { classifySourceKind } from './parse.mjs';
import { fetchViaBrowserTab } from './tabBrowser.mjs';
import { browserFetchHeaders, fetchXStatusFromTwitterCdn } from './xCdn.mjs';
import { isRedditHost, redditBlockedResult, resolveFetchUrl } from './urlPolicy.mjs';
import { fetchXThreadFromFx, parseXStatusUser } from './xThread.mjs';

const REDDIT_SKIP_PROVIDERS = new Set(['local', 'jina', 'markdown-new']);

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
  if (isRedditHost(url)) return redditBlockedResult('local');
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
      fetchSourceId: parsed.mode === 'page' ? 'local-page' : 'local',
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
  if (isRedditHost(url)) return redditBlockedResult('jina');
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
  if (isRedditHost(url)) return redditBlockedResult('markdown-new');
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

/** X/Twitter syndication via FxTwitter /2/thread (author self-reply chain). */
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

  const ids = parseXStatusUser(url);
  if (!ids) {
    return { ok: false, id: 'syndication', errorCode: 'parse_empty', error: 'no status id in URL' };
  }

  const { signal, clear } = withTimeout(TIMEOUT_MS);
  try {
    const result = await fetchXThreadFromFx(ids.statusId, {
      signal,
      fallbackUser: ids.user,
      bookmarkUrl: url,
      linkFollow: true,
    });
    if (!result.ok) {
      return {
        ok: false,
        id: 'syndication',
        errorCode: result.errorCode,
        status: result.status,
        error: result.error,
      };
    }

    return {
      ok: true,
      id: 'syndication',
      fetchSourceId: result.fetchSourceId,
      markdown: result.markdown,
      title: result.title,
      rawBytes: result.rawBytes,
      partCount: result.partCount,
    };
  } catch (e) {
    const code = e?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, id: 'syndication', errorCode: code, error: String(e) };
  } finally {
    clear();
  }
}

function resultUsable(result, ctx = {}) {
  if (!result.ok || !result.markdown?.trim()) return false;
  if (explainHardFetchFailure(result.markdown, ctx)) return false;
  return isFetchBodyUsable(result.markdown, undefined, ctx);
}

export function diagnoseResult(result, ctx = {}) {
  if (!result.ok) {
    return {
      usable: false,
      reason: result.errorCode || 'provider_error',
      detail: result.error || result.preview || null,
      bytes: result.rawBytes ?? 0,
    };
  }
  if (!result.markdown?.trim()) {
    return { usable: false, reason: 'parse_empty', detail: 'empty body', bytes: result.rawBytes ?? 0 };
  }
  const qualityCtx = { url: ctx.url, title: result.title ?? ctx.title };
  const hard = explainHardFetchFailure(result.markdown, qualityCtx);
  if (hard) {
    return {
      usable: false,
      reason: hard.code,
      blockedBy: hard.detail,
      tier: hard.tier,
      bytes: result.rawBytes ?? result.markdown.length,
      detail: result.markdown.slice(0, 300),
    };
  }
  const soft = explainSoftFetchSuspect(result.markdown, qualityCtx);
  if (!isFetchBodyUsable(result.markdown, undefined, qualityCtx)) {
    return {
      usable: false,
      reason: 'too_short',
      suspect: soft?.code,
      suspectDetail: soft?.detail,
      bytes: result.markdown.length,
      detail: result.markdown.slice(0, 300),
    };
  }
  if (soft) {
    return {
      usable: true,
      reason: 'ok',
      suspect: soft.code,
      suspectDetail: soft.detail,
      tier: soft.tier,
      bytes: result.markdown.length,
    };
  }
  return { usable: true, reason: 'ok', bytes: result.markdown.length };
}

export async function fetchAllProviders(rawUrl) {
  const { url } = await resolveFetchUrl(rawUrl);
  const ctx = { url };
  const names = providerNamesForUrl(url);
  const attempts = [];
  for (const name of names) {
    if (isRedditHost(url) && REDDIT_SKIP_PROVIDERS.has(name)) {
      const blocked = redditBlockedResult(name);
      attempts.push({ ...blocked, diagnosis: diagnoseResult(blocked, ctx) });
      continue;
    }
    const result = await PROVIDERS[name](url);
    attempts.push({ ...result, diagnosis: diagnoseResult(result, ctx) });
  }

  const winner =
    attempts.find((a) => resultUsable(a, ctx)) ??
    attempts.find((a) => a.ok && a.markdown) ??
    attempts[attempts.length - 1];

  return {
    winner,
    attempts,
    ok: resultUsable(winner, ctx),
    url,
    resolvedFrom: url !== rawUrl ? rawUrl : null,
  };
}

export async function fetchHybrid(rawUrl) {
  const { url, resolvedFrom } = await resolveFetchUrl(rawUrl);
  const ctx = { url };

  if (isRedditHost(url)) {
    const blocked = redditBlockedResult('hybrid');
    const diagnosis = diagnoseResult(blocked, ctx);
    return {
      winner: blocked,
      attempts: [{ ...blocked, diagnosis }],
      ok: false,
      url,
      resolvedFrom,
    };
  }

  const isX = classifySourceKind(url) === 'x';
  const chain = [
    ...(isX ? [fetchSyndication, fetchLocal] : [fetchLocal]),
    ...(includeTabProvider ? [fetchTab] : []),
    fetchJina,
    fetchMarkdownNew,
  ];

  const attempts = [];
  let last = { ok: false, id: 'hybrid', errorCode: 'provider_error' };

  for (const run of chain) {
    const result = await run(url);
    attempts.push({ ...result, diagnosis: diagnoseResult(result, ctx) });
    last = result;
    if (resultUsable(result, ctx)) {
      return { winner: result, attempts, ok: true, url, resolvedFrom };
    }
  }

  return { winner: last, attempts, ok: false, url, resolvedFrom };
}

export const PROVIDERS = {
  local: fetchLocal,
  tab: fetchTab,
  jina: fetchJina,
  'markdown-new': fetchMarkdownNew,
  syndication: fetchSyndication,
  hybrid: (url) => fetchHybrid(url),
};
