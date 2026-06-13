/** Minimal tweet shape for quote-overlap checks (no provider imports). */
export type TweetIdCarrier = { id?: string };

export type TweetAuthorCarrier = TweetIdCarrier & {
  author?: { screen_name?: string };
};

function authorScreenKey(screenName: string | undefined): string {
  return (screenName || '').replace(/^@/, '').toLowerCase();
}

/**
 * FxTwitter /2/thread on a reply can return the parent author's chain. Keep only the
 * bookmarked author's tweets so expansion is anchored on the saved status.
 */
export function filterThreadToBookmarkAuthor<T extends TweetAuthorCarrier>(
  thread: T[],
  bookmarkUser: string,
  anchorStatusId: string
): T[] {
  if (!thread.length) return thread;
  const authorKey = authorScreenKey(bookmarkUser);
  const anchor = thread.find((t) => String(t.id) === anchorStatusId);
  if (!anchor) return [];

  const authored = thread.filter((t) => authorScreenKey(t.author?.screen_name) === authorKey);
  if (authored.length > 0) return authored;
  return [anchor];
}

export function collectTweetIds(thread: TweetIdCarrier[]): Set<string> {
  const ids = new Set<string>();
  for (const t of thread) {
    if (t.id) ids.add(String(t.id));
  }
  return ids;
}

/**
 * Skip quote-thread expand when the quoted thread is the same author chain we already
 * fetched (B1 — quote expand duplicating own thread in quoted_text).
 */
export function quotedThreadOverlapsParent(
  parent: TweetIdCarrier[],
  quoted: TweetIdCarrier[]
): boolean {
  const parentIds = collectTweetIds(parent);
  if (!parentIds.size) return false;
  const quotedIds = quoted.map((t) => t.id).filter(Boolean).map(String);
  if (!quotedIds.length) return false;
  return quotedIds.every((id) => parentIds.has(id));
}

/**
 * B1 — skip expanding a multi-part quoted thread when the quoted author is the same
 * as the parent thread author (self-quote of another thread). Keeps the inline
 * blockquote only; avoids duplicating a full author thread in body + quoted_text.
 */
export function shouldSkipSameAuthorQuoteThreadExpand(
  quotedThreadPartCount: number,
  parentAuthor?: string,
  quoteAuthor?: string
): boolean {
  if (quotedThreadPartCount <= 1) return false;
  const parent = parentAuthor?.trim().toLowerCase();
  const quote = quoteAuthor?.trim().toLowerCase();
  if (!parent || !quote) return false;
  return parent === quote;
}
