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

/** fxtwitter exposes the parent either as a string (v1) or object (v2). */
export type FxReplyingTo =
  | string
  | { screen_name?: string; status?: string | number; url?: string }
  | null;

export type FxTweet = {
  id?: string;
  text?: string;
  author?: { screen_name?: string };
  replying_to?: FxReplyingTo;
  replying_to_status?: string | null;
  quote?: FxTweet;
  /** Populated when quoted tweet is expanded to a multi-part thread. */
  quoteExpanded?: string;
  media?: FxMedia;
};

/** Normalize the reply parent across fxtwitter v1 (string) and v2 (object) shapes. */
function replyParent(tweet: FxTweet): { id: string | null; user: string | null } {
  const r = tweet.replying_to;
  if (r && typeof r === 'object') {
    const id = r.status != null ? String(r.status) : tweet.replying_to_status ?? null;
    const user = r.screen_name ? r.screen_name.replace(/^@/, '').trim() : null;
    return { id: id || null, user: user || null };
  }
  const user = typeof r === 'string' ? r.replace(/^@/, '').trim() : null;
  const id = tweet.replying_to_status ? String(tweet.replying_to_status) : null;
  return { id, user: user || null };
}

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
export function threadToMarkdown(
  thread: FxTweet[],
  fallbackUser = 'i',
  anchorId?: string
): string | null {
  if (!Array.isArray(thread) || !thread.length) return null;

  const author = thread[0].author?.screen_name || fallbackUser;
  const rendered = thread
    .map((tweet) => ({ tweet, body: formatTweetBody(tweet) }))
    .filter((entry) => entry.body.length > 0);
  if (!rendered.length) return null;

  if (rendered.length === 1) {
    return [`# @${author}`, '', rendered[0].body].join('\n');
  }

  const authorKeys = new Set(
    rendered.map((entry) => authorScreenKey(entry.tweet.author?.screen_name)).filter(Boolean)
  );
  const multiAuthor = authorKeys.size > 1;
  const label = multiAuthor ? 'conversation' : 'thread';
  const total = rendered.length;

  const header = `# @${author} — ${label} (${total} parts)`;
  const sections = rendered.map(({ tweet, body }, i) => {
    const who = multiAuthor && tweet.author?.screen_name ? ` · @${tweet.author.screen_name}` : '';
    const mark = anchorId && String(tweet.id) === anchorId ? ' · bookmarked' : '';
    return `## ${i + 1}/${total}${who}${mark}\n\n${body}`;
  });
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

    const { id: parentId, user } = replyParent(tweet);
    if (!parentId || seen.has(parentId)) break;

    const parentUser = (user || '').toLowerCase();
    if (parentUser && parentUser !== authorKey) break;

    seen.add(parentId);
    currentId = parentId;
  }

  return currentId;
}

function authorScreenKey(screenName: string | undefined): string {
  return (screenName || '').replace(/^@/, '').toLowerCase();
}

/**
 * Walk up the full reply chain from the bookmarked status to the conversation
 * root, following every parent regardless of author. Returns the chain ordered
 * root-first with the bookmarked tweet last (it is always included).
 */
async function fetchConversationChain(
  anchorStatusId: string,
  fallbackUser: string,
  signal?: AbortSignal
): Promise<FxTweet[]> {
  const chain: FxTweet[] = [];
  const seen = new Set<string>();
  let currentId: string | null = anchorStatusId;
  let currentUser = fallbackUser;

  for (let hop = 0; hop < MAX_ROOT_WALK_HOPS && currentId && !seen.has(currentId); hop++) {
    seen.add(currentId);
    const tweet = await fetchFxStatusTweet(currentId, currentUser, signal);
    if (!tweet) break;
    chain.push(tweet);

    const { id: parentId, user: parentUser } = replyParent(tweet);
    if (!parentId) break;
    if (parentUser) currentUser = parentUser;
    currentId = parentId;
  }

  chain.reverse();
  return chain;
}

/**
 * Build the complete thread for a bookmarked status: every ancestor up to the
 * conversation root, merged with the root author's own self-reply thread so
 * multi-tweet OP threads are captured in full. The bookmarked comment is always
 * retained (it is the last element of the ancestor chain).
 */
async function buildFullThread(
  anchorStatusId: string,
  fallbackUser: string,
  signal?: AbortSignal
): Promise<FxTweet[]> {
  const chain = await fetchConversationChain(anchorStatusId, fallbackUser, signal);
  if (!chain.length) return [];

  const merged: FxTweet[] = [];
  const ids = new Set<string>();
  const push = (tweet: FxTweet) => {
    const id = tweet.id ? String(tweet.id) : '';
    if (!id || ids.has(id)) return;
    ids.add(id);
    merged.push(tweet);
  };

  const root = chain[0];
  const rootId = root?.id ? String(root.id) : null;
  const rootAuthor = authorScreenKey(root?.author?.screen_name);

  // Expand the conversation root's own self-reply thread (OP thread). Only keep
  // the leading run authored by the root author so we don't pull unrelated
  // tweets when fxtwitter returns a parent chain.
  if (rootId) {
    const opThread = await fetchThreadArray(rootId, signal);
    if (opThread?.length && String(opThread[0].id) === rootId) {
      for (const tweet of opThread) {
        if (authorScreenKey(tweet.author?.screen_name) !== rootAuthor) break;
        push(tweet);
      }
    }
  }
  if (!merged.length && root) push(root);

  // Append the rest of the ancestor path (cross-author replies) and the comment.
  for (let i = 1; i < chain.length; i++) push(chain[i]);

  return merged;
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
 * Full X fetch for any status URL: conversation chain → quote expand → link follow.
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
    let thread = await buildFullThread(statusId, fallbackUser, signal);
    if (!thread.length || !threadHasFetchableContent(thread)) {
      const unavailable = await detectTweetUnavailable(statusId, fallbackUser, signal);
      return { ok: false, errorCode: 'parse_empty', unavailable };
    }

    // Drop only ancestors that are deleted/private — never drop the bookmarked
    // comment itself — so partial unavailability still yields the thread we can see.
    if (threadIndicatesUnavailable(thread)) {
      const available = thread.filter(
        (t) => String(t.id) === statusId || !isFxTweetUnavailable(t)
      );
      const anchorAvailable = available.some(
        (t) => String(t.id) === statusId && !isFxTweetUnavailable(t)
      );
      if (!anchorAvailable) {
        return { ok: false, errorCode: 'parse_empty', unavailable: true };
      }
      thread = available;
    }
    if (!threadHasFetchableContent(thread)) {
      return { ok: false, errorCode: 'parse_empty' };
    }

    await enrichQuotedTweets(thread, signal);

    let markdown = threadToMarkdown(thread, fallbackUser, statusId);
    if (!markdown) return { ok: false, errorCode: 'parse_empty' };

    let linkFollowCount = 0;
    if (linkFollow && bookmarkUrl) {
      const beforeLen = markdown.length;
      markdown = await appendXLinkFollowBodies(markdown, bookmarkUrl, signal);
      if (markdown.length > beforeLen) {
        linkFollowCount = extractLinkFollowCount(markdown, beforeLen);
      }
    }

    // Title reflects the bookmarked comment (what the user saved), not the OP.
    const anchor = thread.find((t) => String(t.id) === statusId) ?? thread[thread.length - 1];
    const author = anchor.author?.screen_name || fallbackUser;
    const anchorBody = formatTweetBody(anchor);
    const anchorText = anchor.text?.trim() || anchorBody.replace(/^Image:\s*\S+/m, '').trim();
    const rootId = thread[0]?.id ? String(thread[0].id) : undefined;
    const partCount = thread.length;
    // Every X status fetch runs the full pipeline (conversation chain, quote
    // expand, link follow) — label consistently so logs/cache never imply a
    // shallow single-tweet-only syndication pass.
    const fetchSourceId: 'syndication-expanded' = 'syndication-expanded';

    return {
      ok: true,
      markdown,
      title:
        partCount > 1
          ? `@${author}: ${anchorText.slice(0, 60)}… (${partCount} parts)`
          : `@${author}: ${anchorText.slice(0, 80)}`,
      rawBytesApprox: new TextEncoder().encode(markdown).length,
      partCount,
      fetchSourceId,
      rootStatusId: rootId && rootId !== statusId ? rootId : undefined,
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
