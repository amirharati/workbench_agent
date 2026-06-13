import { appendXLinkFollowBodies } from './xLinkFollow';
import { collectTweetIds, quotedThreadOverlapsParent, shouldSkipSameAuthorQuoteThreadExpand } from '../xQuoteExpand';
import {
  formatVideoAnnotationLines,
  photoEntries,
  type FxMedia,
  videoEntries,
  xStatusVideoUrl,
} from '../xMedia';

const FX_THREAD_API = 'https://api.fxtwitter.com/2/thread';
const FX_STATUS_V2_API = 'https://api.fxtwitter.com/2/status';

export type FxTweet = {
  id?: string;
  text?: string;
  author?: { screen_name?: string };
  replying_to?: string | null;
  replying_to_status?: string | null;
  quote?: FxTweet;
  /** Populated when quoted tweet is expanded to a multi-part thread. */
  quoteExpanded?: string;
  media?: FxMedia;
};

const MAX_ROOT_WALK_HOPS = 20;
const MAX_QUOTE_THREAD_EXPANDS = 2;

export { collectTweetIds, quotedThreadOverlapsParent, shouldSkipSameAuthorQuoteThreadExpand } from '../xQuoteExpand';

function formatQuoteBlock(tweet: FxTweet): string {
  if (tweet.quoteExpanded?.trim()) {
    return `\n\n${tweet.quoteExpanded.trim()}`;
  }
  const q = tweet.quote;
  if (!q) return '';

  const lines: string[] = [];
  if (q.text?.trim()) {
    lines.push(
      '',
      `> Quote from @${q.author?.screen_name || 'unknown'}:`,
      `> ${q.text.trim()}`
    );
  }

  const quoteVideos = videoEntries(q.media);
  if (quoteVideos.length) {
    lines.push(
      ...formatVideoAnnotationLines(quoteVideos, {
        statusUrl: xStatusVideoUrl(q.author?.screen_name, q.id),
      })
    );
  }

  const quotePhotos = photoEntries(q.media);
  if (quotePhotos.length) {
    for (const photo of quotePhotos) {
      const url = photo.url?.trim();
      if (url) lines.push('', `Image: ${url}`);
    }
    lines.push('', `(${quotePhotos.length} photo(s) attached)`);
  }

  return lines.join('\n');
}

function photoUrls(tweet: FxTweet): string[] {
  return photoEntries(tweet.media)
    .map((entry) => entry.url?.trim())
    .filter((url): url is string => Boolean(url));
}

function formatTweetBody(tweet: FxTweet): string {
  const lines: string[] = [];
  const text = tweet?.text?.trim();
  if (text) lines.push(text);
  lines.push(formatQuoteBlock(tweet));

  const videos = videoEntries(tweet.media);
  if (videos.length) {
    lines.push(
      ...formatVideoAnnotationLines(videos, {
        statusUrl: xStatusVideoUrl(tweet.author?.screen_name, tweet.id),
      })
    );
  }

  const urls = photoUrls(tweet);
  if (urls.length) {
    for (const url of urls) {
      lines.push('', `Image: ${url}`);
    }
    lines.push('', `(${urls.length} photo(s) attached)`);
  }

  return lines.join('\n').trim();
}

function threadHasFetchableContent(thread: FxTweet[]): boolean {
  return thread.some((t) => formatTweetBody(t).length > 0);
}

/** Merge FxTwitter thread[] into enrichment markdown. */
export function threadToMarkdown(thread: FxTweet[], fallbackUser = 'i'): string | null {
  if (!Array.isArray(thread) || !thread.length) return null;

  const author = thread[0].author?.screen_name || fallbackUser;
  const bodies = thread.map((t) => formatTweetBody(t)).filter(Boolean);
  if (!bodies.length) return null;

  if (thread.length === 1) {
    return [`# @${author}`, '', bodies[0]].join('\n');
  }

  const header = `# @${author} — thread (${thread.length} parts)`;
  const sections = bodies.map((body, i) => `## ${i + 1}/${thread.length}\n\n${body}`);
  return [header, '', sections.join('\n\n---\n\n')].join('\n');
}

export function parseXStatusUser(url: string): { user: string; statusId: string } | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'status');
    if (idx < 0 || !parts[idx + 1]) return null;
    return {
      user: parts[idx - 1] || 'i',
      statusId: parts[idx + 1].replace(/\?.*$/, ''),
    };
  } catch {
    return null;
  }
}

async function fetchFxStatusTweet(
  statusId: string,
  screenName: string,
  signal?: AbortSignal
): Promise<FxTweet | null> {
  try {
    const res = await fetch(`${FX_STATUS_V2_API}/${statusId}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const payload = (await res.json()) as { status?: FxTweet };
      if (payload?.status?.id) return payload.status;
    }
  } catch {
    /* try v1 */
  }

  try {
    const res = await fetch(
      `https://api.fxtwitter.com/${encodeURIComponent(screenName)}/status/${statusId}`,
      { signal, headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as { tweet?: FxTweet };
    return payload?.tweet ?? null;
  } catch {
    return null;
  }
}

/** Walk up author self-replies to the root status before /2/thread. */
export async function resolveAuthorThreadRootId(
  startId: string,
  bookmarkUser: string,
  signal?: AbortSignal
): Promise<string> {
  const authorKey = bookmarkUser.replace(/^@/, '').toLowerCase();
  let currentId = startId;
  const seen = new Set<string>([currentId]);

  for (let hop = 0; hop < MAX_ROOT_WALK_HOPS; hop++) {
    const tweet = await fetchFxStatusTweet(currentId, bookmarkUser, signal);
    if (!tweet) break;

    const parentId = tweet.replying_to_status
      ? String(tweet.replying_to_status)
      : null;
    if (!parentId || seen.has(parentId)) break;

    const parentUser = (tweet.replying_to || '').replace(/^@/, '').toLowerCase();
    if (parentUser && parentUser !== authorKey) break;

    seen.add(parentId);
    currentId = parentId;
  }

  return currentId;
}

async function fetchThreadArray(
  statusId: string,
  signal?: AbortSignal
): Promise<FxTweet[] | null> {
  const res = await fetch(`${FX_THREAD_API}/${statusId}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { thread?: FxTweet[] };
  const thread = payload?.thread;
  if (!Array.isArray(thread) || !thread.length) return null;
  return thread;
}

/** Expand quoted tweets that point at multi-part threads (or fill missing quote text). */
async function enrichQuotedTweets(
  thread: FxTweet[],
  signal?: AbortSignal
): Promise<void> {
  const parentIds = collectTweetIds(thread);
  let expanded = 0;
  for (const tweet of thread) {
    if (expanded >= MAX_QUOTE_THREAD_EXPANDS) break;
    const quote = tweet.quote;
    const quoteId = quote?.id;
    if (!quoteId) continue;
    if (parentIds.has(String(quoteId))) continue;

    const quotedThread = await fetchThreadArray(quoteId, signal);
    if (!quotedThread?.length) continue;
    if (quotedThreadOverlapsParent(thread, quotedThread)) continue;

    const qUser = quote.author?.screen_name || quotedThread[0].author?.screen_name || 'i';
    const parentUser = thread[0]?.author?.screen_name;
    if (shouldSkipSameAuthorQuoteThreadExpand(quotedThread.length, parentUser, qUser)) {
      continue;
    }

    if (quotedThread.length > 1) {
      const md = threadToMarkdown(quotedThread, qUser);
      if (md) {
        tweet.quoteExpanded = `### Quoted thread from @${qUser} (${quotedThread.length} parts)\n\n${md}`;
        expanded++;
      }
    } else if (!quote.text?.trim() && quotedThread[0]?.text?.trim()) {
      tweet.quote = { ...quote, text: quotedThread[0].text };
    }
  }
}

function isFxTweetUnavailable(tweet: FxTweet | null | undefined): boolean {
  if (!tweet) return true;
  const text = tweet.text?.trim() ?? '';
  const hasMedia =
    photoEntries(tweet.media).length > 0 || videoEntries(tweet.media).length > 0;
  if (!text && !hasMedia) return true;
  if (/tweet (is )?unavailable|this (post|tweet) (is )?unavailable|account.+suspended|doesn'?t exist/i.test(text)) {
    return true;
  }
  return false;
}

function threadIndicatesUnavailable(thread: FxTweet[]): boolean {
  return thread.some((t) => isFxTweetUnavailable(t));
}

/** Detect deleted/private tweets when thread endpoint returns empty. */
async function detectTweetUnavailable(
  statusId: string,
  screenName: string,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const res = await fetch(`${FX_STATUS_V2_API}/${statusId}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return true;
    if (!res.ok) return false;
    const payload = (await res.json()) as {
      status?: FxTweet;
      code?: number | string;
      message?: string;
    };
    if (!payload?.status?.id) return true;
    if (isFxTweetUnavailable(payload.status)) return true;
    const msg = `${payload.message ?? ''}`.toLowerCase();
    if (msg.includes('not found') || msg.includes('unavailable')) return true;
    return false;
  } catch {
    /* fall through */
  }

  const tweet = await fetchFxStatusTweet(statusId, screenName, signal);
  if (!tweet?.id) return true;
  return isFxTweetUnavailable(tweet);
}

export type FxThreadFetchResult =
  | {
      ok: true;
      markdown: string;
      title: string;
      rawBytesApprox: number;
      partCount: number;
      fetchSourceId: 'syndication' | 'syndication-thread' | 'syndication-expanded';
      rootStatusId?: string;
      linkFollowCount?: number;
    }
  | {
      ok: false;
      errorCode: 'rate_limited' | 'provider_error' | 'parse_empty' | 'network' | 'timeout';
      /** When set, syndication failed because the tweet was deleted or is private (B5). */
      unavailable?: boolean;
    };

/**
 * Full X fetch: root walk → author thread → quote expand → link follow (depth 1).
 */
export async function fetchXThreadFromFx(
  statusId: string,
  options: {
    signal?: AbortSignal;
    fallbackUser?: string;
    bookmarkUrl?: string;
    linkFollow?: boolean;
  } = {}
): Promise<FxThreadFetchResult> {
  const { signal, fallbackUser = 'i', bookmarkUrl, linkFollow = true } = options;

  try {
    const rootId = await resolveAuthorThreadRootId(statusId, fallbackUser, signal);
    const thread = await fetchThreadArray(rootId, signal);
    if (!thread?.length || !threadHasFetchableContent(thread)) {
      const unavailable = await detectTweetUnavailable(statusId, fallbackUser, signal);
      return {
        ok: false,
        errorCode: 'parse_empty',
        unavailable,
      };
    }
    if (threadIndicatesUnavailable(thread)) {
      return { ok: false, errorCode: 'parse_empty', unavailable: true };
    }

    await enrichQuotedTweets(thread, signal);

    let markdown = threadToMarkdown(thread, fallbackUser);
    if (!markdown) return { ok: false, errorCode: 'parse_empty' };

    let linkFollowCount = 0;
    if (linkFollow && bookmarkUrl) {
      const beforeLen = markdown.length;
      markdown = await appendXLinkFollowBodies(markdown, bookmarkUrl, signal);
      if (markdown.length > beforeLen) {
        linkFollowCount = extractLinkFollowCount(markdown, beforeLen);
      }
    }

    const author = thread[0].author?.screen_name || fallbackUser;
    const firstBody = formatTweetBody(thread[0]);
    const firstText = thread[0].text?.trim() || firstBody.replace(/^Image:\s*\S+/m, '').trim();
    const partCount = thread.length;
    let fetchSourceId: 'syndication' | 'syndication-thread' | 'syndication-expanded' =
      partCount > 1 ? 'syndication-thread' : 'syndication';
    if (linkFollowCount > 0 || thread.some((t) => t.quoteExpanded)) {
      fetchSourceId = 'syndication-expanded';
    }

    return {
      ok: true,
      markdown,
      title:
        partCount > 1
          ? `@${author}: ${firstText.slice(0, 60)}… (${partCount} parts)`
          : `@${author}: ${firstText.slice(0, 80)}`,
      rawBytesApprox: new TextEncoder().encode(markdown).length,
      partCount,
      fetchSourceId,
      rootStatusId: rootId !== statusId ? rootId : undefined,
      linkFollowCount: linkFollowCount || undefined,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, errorCode: 'timeout' };
    }
    return { ok: false, errorCode: 'network' };
  }
}

function extractLinkFollowCount(full: string, bodyStartLen: number): number {
  const tail = full.slice(bodyStartLen);
  return (tail.match(/^## Linked:/gm) || []).length;
}
