import { isLikelyListingUrl, isRedditHost } from './urlPolicy';

export type ListingItem = {
  title: string;
  meta?: string;
  body?: string;
};

export const MAX_LISTING_ITEMS = 24;
export const MAX_LISTING_BODY_CHARS = 450;

function cleanLine(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function pushItem(items: ListingItem[], seen: Set<string>, item: ListingItem): void {
  const title = cleanLine(item.title);
  if (!title || title.length < 4 || title.length > 200) return;
  const key = title.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  items.push({
    title,
    meta: cleanLine(item.meta) || undefined,
    body: cleanLine(item.body).slice(0, MAX_LISTING_BODY_CHARS) || undefined,
  });
}

function mainRoot(doc: Document): Element | null {
  return (
    doc.querySelector('main') ??
    doc.querySelector('[role="main"]') ??
    doc.body
  );
}

/** Reddit shreddit feeds (one strategy among many). */
function extractRedditItems(doc: Document, url: string): ListingItem[] {
  const html = doc.documentElement?.outerHTML ?? '';
  const redditSignals =
    html.includes('shreddit-post') || html.includes('data-testid="post-title"');
  if (!isRedditHost(url) && !redditSignals) return [];

  const items: ListingItem[] = [];
  const seen = new Set<string>();

  for (const el of doc.querySelectorAll('shreddit-post')) {
    if (items.length >= MAX_LISTING_ITEMS) break;
    pushItem(items, seen, {
      title:
        el.getAttribute('post-title') ||
        cleanLine(el.querySelector('[slot="title"], a[data-testid="post-title"]')?.textContent),
      meta: cleanLine(
        el.getAttribute('author') ||
          el.querySelector('a[href*="/user/"], a[href*="/u/"]')?.textContent
      )?.replace(/^u\//, ''),
      body: cleanLine(
        el.querySelector(
          '[slot="text-body"], [data-testid="post-content"], div[id*="post-rtjson-content"], .md'
        )?.textContent
      ),
    });
  }

  if (items.length < 2) {
    for (const titleEl of doc.querySelectorAll('a[data-testid="post-title"]')) {
      if (items.length >= MAX_LISTING_ITEMS) break;
      const card = titleEl.closest('shreddit-post, article, [data-testid="post-container"]');
      pushItem(items, seen, {
        title: titleEl.textContent,
        meta: cleanLine(card?.querySelector('a[href*="/user/"], a[href*="/u/"]')?.textContent)?.replace(
          /^u\//,
          ''
        ),
        body: cleanLine(
          card?.querySelector('[data-testid="post-content"], div[id*="post-rtjson-content"], .md')
            ?.textContent
        ),
      });
    }
  }

  return items;
}

/** Card/article grids — forums, news hubs, course lists. */
function extractRepeatedArticles(doc: Document): ListingItem[] {
  const root = mainRoot(doc);
  if (!root) return [];

  const items: ListingItem[] = [];
  const seen = new Set<string>();

  for (const article of root.querySelectorAll('article')) {
    if (items.length >= MAX_LISTING_ITEMS) break;
    const title =
      cleanLine(article.querySelector('h1, h2, h3, h4, [class*="title" i] a')?.textContent) ||
      cleanLine(article.querySelector('a[href]')?.textContent);
    const meta = cleanLine(
      article.querySelector('time, [class*="author" i], [class*="byline" i], [rel="author"]')
        ?.textContent
    );
    const body = cleanLine(
      article.querySelector('p, [class*="summary" i], [class*="excerpt" i], [class*="description" i]')
        ?.textContent
    );
    pushItem(items, seen, { title, meta, body });
  }

  return items;
}

/** Section headings with following teaser text — category / docs hubs. */
function extractHeadingSections(doc: Document): ListingItem[] {
  const root = mainRoot(doc);
  if (!root) return [];

  const items: ListingItem[] = [];
  const seen = new Set<string>();

  for (const heading of root.querySelectorAll('h2, h3')) {
    if (items.length >= MAX_LISTING_ITEMS) break;
    const title = cleanLine(heading.textContent);
    if (!title || title.length < 6) continue;

    const chunks: string[] = [];
    let sib = heading.nextElementSibling;
    while (sib && !/^H[1-3]$/.test(sib.tagName)) {
      if (sib.matches('p, li, blockquote, div')) {
        const text = cleanLine(sib.textContent);
        if (text.length >= 20 && text.length <= 600) chunks.push(text);
      }
      sib = sib.nextElementSibling;
      if (chunks.join(' ').length >= MAX_LISTING_BODY_CHARS) break;
    }

    pushItem(items, seen, {
      title,
      body: chunks.join(' ').slice(0, MAX_LISTING_BODY_CHARS) || undefined,
    });
  }

  return items;
}

/** Dense link lists in main content. */
function extractMainListItems(doc: Document): ListingItem[] {
  const root = mainRoot(doc);
  if (!root) return [];

  const items: ListingItem[] = [];
  const seen = new Set<string>();

  for (const li of root.querySelectorAll('li')) {
    if (items.length >= MAX_LISTING_ITEMS) break;
    const link = li.querySelector('a[href]');
    const title = cleanLine(link?.textContent) || cleanLine(li.querySelector('strong')?.textContent);
    const body = cleanLine(li.textContent);
    if (!title || body.length < 24) continue;
    pushItem(items, seen, {
      title,
      body: body.length > title.length + 10 ? body.slice(0, MAX_LISTING_BODY_CHARS) : undefined,
    });
  }

  return items;
}

/** Merge strategies; pick the richest non-duplicative set. */
export function collectListingItems(doc: Document, url: string): ListingItem[] {
  const strategies = [
    extractRedditItems(doc, url),
    extractRepeatedArticles(doc),
    extractHeadingSections(doc),
    extractMainListItems(doc),
  ];

  let best: ListingItem[] = [];
  for (const batch of strategies) {
    if (batch.length > best.length) best = batch;
  }
  return best;
}

export function listingItemsToMarkdown(
  items: ListingItem[],
  pageTitle?: string
): string | null {
  if (items.length < 2) return null;

  const title = pageTitle?.trim() || 'Page listing';
  const lines = [
    `# ${title}`,
    '',
    `Items on this page (${items.length}):`,
    '',
  ];

  for (const item of items) {
    const meta = item.meta ? ` — ${item.meta}` : '';
    lines.push(`## ${item.title}${meta}`);
    if (item.body) lines.push(item.body);
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function shouldPreferListingExtract(
  items: ListingItem[],
  url: string,
  articleMarkdown?: string | null
): boolean {
  if (items.length >= 3) return true;
  if (items.length >= 2 && isLikelyListingUrl(url)) return true;
  if (items.length >= 2 && articleMarkdown && articleMarkdown.length < 900) return true;
  return false;
}

/** True when fetched markdown looks like a multi-item listing digest. */
export function looksLikeListingMarkdown(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  if (/Items on this page \(|Posts visible \(|feed snapshot/i.test(trimmed)) return true;
  const sections = (trimmed.match(/^## /gm) || []).length;
  return sections >= 3;
}

export function extractListingFromDocument(
  doc: Document,
  url: string,
  pageTitle?: string
): { title?: string; markdown: string } | null {
  const items = collectListingItems(doc, url);
  if (!shouldPreferListingExtract(items, url)) return null;
  const markdown = listingItemsToMarkdown(items, pageTitle);
  if (!markdown) return null;
  return { title: pageTitle, markdown };
}
