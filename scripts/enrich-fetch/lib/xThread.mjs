import { parseXStatusId } from './xCdn.mjs';
import { appendXLinkFollowBodies } from './xLinkFollow.mjs';

export const FX_THREAD_API = 'https://api.fxtwitter.com/2/thread';
const FX_STATUS_V2_API = 'https://api.fxtwitter.com/2/status';

const MAX_ROOT_WALK_HOPS = 20;
const MAX_QUOTE_THREAD_EXPANDS = 2;

function formatQuoteBlock(tweet) {
  if (tweet.quoteExpanded?.trim()) {
    return `\n\n${tweet.quoteExpanded.trim()}`;
  }
  const q = tweet.quote;
  if (!q?.text?.trim()) return '';
  return [
    '',
    `> Quote from @${q.author?.screen_name || 'unknown'}:`,
    `> ${q.text.trim()}`,
  ].join('\n');
}

function formatTweetBody(tweet) {
  const lines = [];
  const text = tweet?.text?.trim();
  if (!text) return '';
  lines.push(text);
  const quote = formatQuoteBlock(tweet);
  if (quote) lines.push(quote);
  if (Array.isArray(tweet.media?.photos) && tweet.media.photos.length) {
    lines.push('', `(${tweet.media.photos.length} photo(s) attached)`);
  }
  return lines.join('\n').trim();
}

/** Merge FxTwitter thread[] into enrichment markdown. */
export function threadToMarkdown(thread, fallbackUser = 'i') {
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

async function fetchFxStatusTweet(statusId, screenName, signal) {
  try {
    const res = await fetch(`${FX_STATUS_V2_API}/${statusId}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const payload = await res.json();
      if (payload?.status?.id) return payload.status;
    }
  } catch {
    /* v1 fallback */
  }

  try {
    const res = await fetch(
      `https://api.fxtwitter.com/${encodeURIComponent(screenName)}/status/${statusId}`,
      { signal, headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const payload = await res.json();
    return payload?.tweet ?? null;
  } catch {
    return null;
  }
}

export async function resolveAuthorThreadRootId(startId, bookmarkUser, signal) {
  const authorKey = bookmarkUser.replace(/^@/, '').toLowerCase();
  let currentId = startId;
  const seen = new Set([currentId]);

  for (let hop = 0; hop < MAX_ROOT_WALK_HOPS; hop++) {
    const tweet = await fetchFxStatusTweet(currentId, bookmarkUser, signal);
    if (!tweet) break;

    const parentId = tweet.replying_to_status ? String(tweet.replying_to_status) : null;
    if (!parentId || seen.has(parentId)) break;

    const parentUser = (tweet.replying_to || '').replace(/^@/, '').toLowerCase();
    if (parentUser && parentUser !== authorKey) break;

    seen.add(parentId);
    currentId = parentId;
  }

  return currentId;
}

async function fetchThreadArray(statusId, signal) {
  const res = await fetch(`${FX_THREAD_API}/${statusId}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const payload = await res.json();
  const thread = payload?.thread;
  if (!Array.isArray(thread) || !thread.length) return null;
  return thread;
}

async function enrichQuotedTweets(thread, signal) {
  let expanded = 0;
  for (const tweet of thread) {
    if (expanded >= MAX_QUOTE_THREAD_EXPANDS) break;
    const quote = tweet.quote;
    const quoteId = quote?.id;
    if (!quoteId) continue;

    const quotedThread = await fetchThreadArray(quoteId, signal);
    if (!quotedThread?.length) continue;

    const qUser = quote.author?.screen_name || quotedThread[0].author?.screen_name || 'i';

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

/** Fetch author self-reply chain + quote expand + link follow. */
export async function fetchXThreadFromFx(
  statusId,
  { signal, fallbackUser = 'i', bookmarkUrl, linkFollow = true } = {}
) {
  try {
    const rootId = await resolveAuthorThreadRootId(statusId, fallbackUser, signal);
    const thread = await fetchThreadArray(rootId, signal);
    if (!thread?.length || !thread[0]?.text?.trim()) {
      return { ok: false, errorCode: 'parse_empty' };
    }

    await enrichQuotedTweets(thread, signal);

    let markdown = threadToMarkdown(thread, fallbackUser);
    if (!markdown) return { ok: false, errorCode: 'parse_empty' };

    const beforeLen = markdown.length;
    if (linkFollow && bookmarkUrl) {
      markdown = await appendXLinkFollowBodies(markdown, bookmarkUrl, signal);
    }

    const author = thread[0].author?.screen_name || fallbackUser;
    const firstText = thread[0].text.trim();
    const partCount = thread.length;
    let fetchSourceId = partCount > 1 ? 'syndication-thread' : 'syndication';
    const linkAdded = markdown.length > beforeLen;
    if (linkAdded || thread.some((t) => t.quoteExpanded)) {
      fetchSourceId = 'syndication-expanded';
    }

    return {
      ok: true,
      markdown,
      title:
        partCount > 1
          ? `@${author}: ${firstText.slice(0, 60)}… (${partCount} parts)`
          : `@${author}: ${firstText.slice(0, 80)}`,
      rawBytes: markdown.length,
      partCount,
      fetchSourceId,
      rootStatusId: rootId !== statusId ? rootId : undefined,
    };
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, errorCode: 'timeout' };
    return { ok: false, errorCode: 'network' };
  }
}

export function parseXStatusUser(url) {
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

export { parseXStatusId };
