import { classifySourceKind } from '../eligibility';
import {
  explainHardFetchFailure,
  isFetchBodyUsable,
  rewriteLinkFollowUrl,
  stripProviderWrapper,
  type FetchQualityContext,
} from '../fetchQuality';
import { isShortLinkHost, isXHost, normalizeHost, resolveFetchUrl } from '../urlPolicy';
import { fetchThroughBrowserService } from '../tabSessionExtract';
import { jinaProvider } from './jina';
import { localProvider } from './local';

const MAX_LINK_FOLLOWS = 3;
const MAX_LINK_BODY_CHARS = 10_000;

const SKIP_LINK_HOSTS = new Set([
  'twitter.com',
  'x.com',
  'pic.twitter.com',
  'pbs.twimg.com',
  'video.twimg.com',
  'twimg.com',
]);

function shouldSkipLinkHost(url: string): boolean {
  const host = normalizeHost(url);
  if (!host) return true;
  if (SKIP_LINK_HOSTS.has(host)) return true;
  if (host.endsWith('.twitter.com') || host.endsWith('.x.com')) return true;
  return false;
}

/** External http(s) URLs in X markdown suitable for depth-1 article fetch. */
export function extractXLinkFollowUrls(markdown: string, bookmarkUrl: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let bookmarkHost = '';
  try {
    bookmarkHost = normalizeHost(bookmarkUrl);
  } catch {
    /* ignore */
  }

  const re = /https?:\/\/[^\s)\]>]+/gi;
  for (const match of markdown.matchAll(re)) {
    let raw = match[0].replace(/[.,;:!?)]+$/, '');
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      const host = normalizeHost(raw);
      if (!host || shouldSkipLinkHost(raw)) continue;
      if (host === bookmarkHost) continue;
      const key = u.href;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
      if (out.length >= MAX_LINK_FOLLOWS) break;
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function fetchArticleBody(
  url: string,
  options: { signal?: AbortSignal; browserWindowId?: number }
): Promise<{ markdown: string; title?: string } | null> {
  if (classifySourceKind(url) === 'x') return null;

  if (typeof options.browserWindowId === 'number') {
    const tab = await fetchThroughBrowserService(url, {
      mode: 'any',
      allowEphemeral: true,
      windowId: options.browserWindowId,
      signal: options.signal,
    });
    if (tab.ok && tab.markdown?.trim()) {
      const clean = stripProviderWrapper(tab.markdown);
      const ctx: FetchQualityContext = { url, title: tab.title };
      if (!explainHardFetchFailure(clean, ctx) && isFetchBodyUsable(clean, undefined, ctx)) {
        return {
          markdown: clean.slice(0, MAX_LINK_BODY_CHARS),
          title: tab.title,
        };
      }
    }
  }

  const input = {
    url,
    normalizedUrl: url,
    signal: options.signal,
  };
  const ctx: FetchQualityContext = { url };

  for (const provider of [localProvider, jinaProvider]) {
    const result = await provider.fetchUrl(input);
    if (!result.ok || !result.markdown?.trim()) continue;
    const clean = stripProviderWrapper(result.markdown);
    if (explainHardFetchFailure(clean, ctx)) continue;
    if (!isFetchBodyUsable(clean, undefined, ctx)) continue;
    return {
      markdown: clean.slice(0, MAX_LINK_BODY_CHARS),
      title: result.title,
    };
  }
  return null;
}

/**
 * Follow an external link only when the tweet/thread itself is too thin to
 * provide useful context. The URL remains mechanically indexed either way.
 */
export function shouldFollowXLinks(markdown: string): boolean {
  const meaningful = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || /^#{1,3}\s/.test(line) || line === '---') return false;
      if (/^(?:Image|Video|Source):\s*https?:\/\//i.test(line)) return false;
      if (/^\(\d+\s+(?:photo|media item)\(s\) attached\)$/i.test(line)) return false;
      return true;
    })
    .join(' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return meaningful.length < 600;
}

/** Append linked article bodies after X thread markdown (depth 1). */
export async function appendXLinkFollowBodies(
  markdown: string,
  bookmarkUrl: string,
  options: { signal?: AbortSignal; browserWindowId?: number } = {}
): Promise<string> {
  const candidates = extractXLinkFollowUrls(markdown, bookmarkUrl);
  if (!candidates.length || !shouldFollowXLinks(markdown)) return markdown;

  const sections: string[] = [markdown];

  for (const raw of candidates) {
    if (options.signal?.aborted) break;
    let target = raw;
    try {
      if (isShortLinkHost(raw)) {
        const resolved = await resolveFetchUrl(raw, options.signal);
        target = resolved.url;
      }
    } catch {
      continue;
    }
    if (isXHost(target) || shouldSkipLinkHost(target)) continue;

    target = rewriteLinkFollowUrl(target);

    const body = await fetchArticleBody(target, options);
    if (!body?.markdown?.trim()) continue;

    let host = target;
    try {
      host = new URL(target).hostname.replace(/^www\./, '');
    } catch {
      /* keep full url */
    }
    const title = body.title?.trim();
    sections.push(
      '',
      '---',
      '',
      `## Linked: ${title || host}`,
      '',
      `Source: ${target}`,
      '',
      body.markdown
    );
  }

  return sections.length > 1 ? sections.join('\n') : markdown;
}
