import { parseXStatusId } from './xCdn.mjs';

export const FX_THREAD_API = 'https://api.fxtwitter.com/2/thread';

function formatTweetBody(tweet) {
  const lines = [];
  const text = tweet?.text?.trim();
  if (!text) return '';
  lines.push(text);
  if (tweet.quote?.text?.trim()) {
    lines.push(
      '',
      `> Quote from @${tweet.quote.author?.screen_name || 'unknown'}:`,
      `> ${tweet.quote.text.trim()}`
    );
  }
  if (Array.isArray(tweet.media?.photos) && tweet.media.photos.length) {
    lines.push('', `(${tweet.media.photos.length} photo(s) attached)`);
  }
  return lines.join('\n');
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

/** Fetch author self-reply chain via FxTwitter v2 /2/thread/{statusId}. */
export async function fetchXThreadFromFx(statusId, { signal, fallbackUser = 'i' } = {}) {
  const res = await fetch(`${FX_THREAD_API}/${statusId}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (res.status === 429) {
    return { ok: false, errorCode: 'rate_limited' };
  }
  if (!res.ok) {
    return { ok: false, errorCode: 'provider_error', status: res.status };
  }

  const payload = await res.json();
  const thread = payload?.thread;
  if (!Array.isArray(thread) || !thread.length || !thread[0]?.text?.trim()) {
    return { ok: false, errorCode: 'parse_empty' };
  }

  const markdown = threadToMarkdown(thread, fallbackUser);
  if (!markdown) return { ok: false, errorCode: 'parse_empty' };

  const author = thread[0].author?.screen_name || fallbackUser;
  const firstText = thread[0].text.trim();
  const partCount = thread.length;
  const fetchSourceId = partCount > 1 ? 'syndication-thread' : 'syndication';

  return {
    ok: true,
    markdown,
    title: partCount > 1 ? `@${author}: ${firstText.slice(0, 60)}… (${partCount} parts)` : `@${author}: ${firstText.slice(0, 80)}`,
    rawBytes: markdown.length,
    partCount,
    fetchSourceId,
  };
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
