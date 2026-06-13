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
  return /^#\s*@\w+/m.test(raw) || /^##\s*\d+\/\d+/m.test(raw);
}

/** Tab-session scrape of x.com/status where UI chrome dominates (B6, B8). */
export function isXTabChromeDominant(markdown: string, url: string): boolean {
  if (!isXBookmarkUrl(url)) return false;
  const raw = rawBody(markdown);
  if (!raw || raw.length < 40) return false;
  if (looksLikeSyndicationXMarkdown(raw)) return false;

  const hits = X_TAB_CHROME_MARKERS.filter((re) => re.test(raw)).length;
  if (hits >= 2) return true;
  if (hits >= 1 && /subscribe/i.test(raw) && /\bviews\b/i.test(raw)) return true;
  return false;
}
