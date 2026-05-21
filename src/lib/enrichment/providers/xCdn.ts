const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function browserFetchHeaders(): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': BROWSER_UA,
  };
}

export function parseXStatusId(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'status');
    if (idx < 0 || !parts[idx + 1]) return null;
    return parts[idx + 1].replace(/\?.*$/, '');
  } catch {
    return null;
  }
}

interface TwitterCdnTweet {
  text?: string;
  user?: { screen_name?: string; name?: string };
  mediaDetails?: unknown[];
  quoted_tweet?: { text?: string; user?: { screen_name?: string } };
}

/** Official Twitter embed CDN — works for public status URLs without login. */
export async function fetchXStatusFromTwitterCdn(
  url: string,
  signal?: AbortSignal
): Promise<{ markdown: string; title: string } | null> {
  const statusId = parseXStatusId(url);
  if (!statusId) return null;

  const api = `https://cdn.syndication.twimg.com/tweet-result?lang=en&id=${statusId}&token=0`;
  const res = await fetch(api, {
    signal,
    headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA },
  });
  if (!res.ok) return null;

  const tweet = (await res.json()) as TwitterCdnTweet;
  if (!tweet?.text?.trim()) return null;

  const author = tweet.user?.screen_name || 'unknown';
  const lines = [`# @${author}`, '', tweet.text.trim()];
  if (tweet.quoted_tweet?.text?.trim()) {
    lines.push(
      '',
      `> Quote from @${tweet.quoted_tweet.user?.screen_name || 'unknown'}:`,
      `> ${tweet.quoted_tweet.text.trim()}`
    );
  }
  if (Array.isArray(tweet.mediaDetails) && tweet.mediaDetails.length) {
    lines.push('', `(${tweet.mediaDetails.length} media item(s) attached)`);
  }

  const markdown = lines.join('\n');
  return {
    markdown,
    title: `@${author}: ${tweet.text.trim().slice(0, 80)}`,
  };
}
