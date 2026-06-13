import { normalizeHost } from './urlPolicy';

const X_TAB_CHROME_MARKERS: RegExp[] = [
  /post\s*your\s*reply/i,
  /everyone\s+can\s+reply/i,
  /click\s+to\s+subscribe/i,
  /see\s+new\s+posts/i,
  /don'?t\s+miss\s+what'?s\s+happening/i,
  /\brelevant\b/i,
  /people\s+on\s+x\s+are\s+the\s+first\s+to\s+know/i,
];

const X_TWEET_UNAVAILABLE_MARKERS: RegExp[] = [
  /this page doesn'?t exist/i,
  /hmm\.\.\.this page doesn'?t exist/i,
  /try searching for something else/i,
  /tweet (is )?unavailable/i,
  /this (post|tweet) (is )?unavailable/i,
  /account.+(has been )?suspended/i,
  /you'?re unable to view this post/i,
  /canceled their account/i,
];

function rawBody(markdown: string): string {
  return markdown.trim();
}

function isXBookmarkUrl(url: string): boolean {
  const host = normalizeHost(url);
  if (!host) return false;
  return host === 'x.com' || host === 'twitter.com' || host === 't.co';
}

export function isSyndicationFetchSourceId(fetchSourceId?: string): boolean {
  return !!fetchSourceId && fetchSourceId.startsWith('syndication');
}

/** FxTwitter thread markdown — structured headers, not tab-scraped X UI shell. */
export function looksLikeSyndicationXMarkdown(markdown: string): boolean {
  const raw = rawBody(markdown);
  if (!raw) return false;
  if (/^##\s*\d+\/\d+/m.test(raw)) return true;
  if (/^#\s*@[\w]+\s+—\s+thread\s*\(\d+\s+parts\)/m.test(raw)) return true;
  if (/^###\s*Quoted thread from @/m.test(raw)) return true;
  if (/^## Linked:/m.test(raw)) return true;
  if (/^## Image content/m.test(raw)) return true;
  // Single-tweet FxTwitter body — not tab's placeholder `# @unknown`
  const header = raw.match(/^#\s*@([\w]+)\s*$/m);
  if (header && header[1].toLowerCase() !== 'unknown') {
    if (/^Image:\s+https?:\/\/pbs\.twimg\.com\//m.test(raw)) return true;
    const bodyLines = raw
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
    const bodyLen = bodyLines.join('\n').trim().length;
    if (bodyLen >= 40) return true;
  }
  return false;
}

/** Deleted/private/suspended tweet shells from tab scrape or sparse API (B5). */
export function isXTweetUnavailableBody(markdown: string): boolean {
  const raw = rawBody(markdown);
  if (!raw) return true;
  if (X_TWEET_UNAVAILABLE_MARKERS.some((re) => re.test(raw))) {
    return raw.length < 280 || !looksLikeSyndicationXMarkdown(raw);
  }
  return false;
}

/** Tab-session scrape of x.com/status where UI chrome dominates (B6, B8). */
export function isXTabChromeDominant(markdown: string, url: string): boolean {
  if (!isXBookmarkUrl(url)) return false;
  const raw = rawBody(markdown);
  if (!raw || raw.length < 40) return false;
  if (looksLikeSyndicationXMarkdown(raw)) return false;
  if (isXTweetUnavailableBody(raw)) return true;

  const hits = X_TAB_CHROME_MARKERS.filter((re) => re.test(raw)).length;
  if (hits >= 2) return true;
  if (hits >= 1 && /subscribe/i.test(raw) && /\bviews\b/i.test(raw)) return true;
  return false;
}

/** After syndication succeeds, never downgrade to tab-session for the same status URL. */
export function shouldKeepSyndicationOverTab(
  headless: { ok: boolean; fetchSourceId?: string; markdown?: string },
  tabMarkdown: string,
  url: string
): boolean {
  if (!isXBookmarkUrl(url)) return false;
  if (!headless.ok || !isSyndicationFetchSourceId(headless.fetchSourceId)) return false;
  const syndicationBody = rawBody(headless.markdown ?? '');
  const tabBody = rawBody(tabMarkdown);
  if (!syndicationBody) return false;
  if (looksLikeSyndicationXMarkdown(syndicationBody) && !looksLikeSyndicationXMarkdown(tabBody)) {
    return true;
  }
  return syndicationBody.length >= tabBody.length;
}
