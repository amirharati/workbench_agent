import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import {
  collectListingItems,
  extractListingFromDocument,
  listingItemsToMarkdown,
  shouldPreferListingExtract,
} from './listingExtract';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

const MIN_PAGE_SNAPSHOT_CHARS = 80;
const MAX_BODY_TEXT_CHARS = 6000;
const MAX_HEADINGS = 25;

export type HtmlExtractResult = {
  title?: string;
  previewImage?: string;
  markdown: string;
  /** Readability article vs homepage/portal/listing snapshot */
  mode: 'article' | 'page';
};

function parseDocument(html: string, url: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.appendChild(base);
  return doc;
}

function metaContent(doc: Document, name: string): string | undefined {
  const el =
    doc.querySelector(`meta[property="${name}"]`) ??
    doc.querySelector(`meta[name="${name}"]`);
  const value = el?.getAttribute('content')?.trim();
  return value || undefined;
}

function pageTitle(doc: Document): string | undefined {
  return (
    metaContent(doc, 'og:title') ??
    metaContent(doc, 'twitter:title') ??
    doc.querySelector('title')?.textContent?.trim() ??
    undefined
  );
}

function pageDescription(doc: Document): string | undefined {
  return (
    metaContent(doc, 'og:description') ??
    metaContent(doc, 'description') ??
    metaContent(doc, 'twitter:description') ??
    undefined
  );
}

function pagePreviewImage(doc: Document): string | undefined {
  const value = metaContent(doc, 'og:image') ?? metaContent(doc, 'twitter:image');
  if (!value) return undefined;
  try {
    const image = new URL(value, doc.baseURI || undefined);
    return /^https?:$/.test(image.protocol) ? image.toString() : undefined;
  } catch {
    return undefined;
  }
}

function collectHeadings(doc: Document): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const el of doc.querySelectorAll('h1, h2, h3')) {
    const text = el.textContent?.replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2 || text.length > 140) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_HEADINGS) break;
  }
  return out;
}

function bodyTextSample(doc: Document): string {
  const body = doc.body;
  if (!body) return '';
  const clone = body.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('script, style, noscript, svg, iframe, nav, footer, header')
    .forEach((el) => el.remove());
  const text = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return text.slice(0, MAX_BODY_TEXT_CHARS);
}

export function htmlToPageSnapshotFromDoc(doc: Document): HtmlExtractResult | null {
  const title = pageTitle(doc);
  const description = pageDescription(doc);
  const headings = collectHeadings(doc);
  const parts: string[] = [];

  if (title) parts.push(`# ${title}`);
  if (description) parts.push(description);
  if (headings.length > 0) {
    parts.push('## On this page');
    parts.push(headings.map((h) => `- ${h}`).join('\n'));
  }

  let markdown = parts.join('\n\n').trim();
  if (markdown.length < MIN_PAGE_SNAPSHOT_CHARS) {
    const body = bodyTextSample(doc);
    if (body.length >= MIN_PAGE_SNAPSHOT_CHARS) {
      markdown = [markdown, body].filter(Boolean).join('\n\n').trim();
    }
  }

  if (markdown.length < MIN_PAGE_SNAPSHOT_CHARS) return null;
  return { title, previewImage: pagePreviewImage(doc), markdown, mode: 'page' };
}

/** Homepage, course hub, docs index — meta + headings + visible text. */
export function htmlToPageSnapshot(html: string, url: string): HtmlExtractResult | null {
  const doc = parseDocument(html, url);
  return htmlToPageSnapshotFromDoc(doc);
}

export function htmlToArticleMarkdownFromDoc(doc: Document): HtmlExtractResult | null {
  const article = new Readability(doc).parse();
  if (!article?.content?.trim()) return null;

  const markdown = turndown.turndown(article.content).trim();
  if (!markdown) return null;

  return {
    title: article.title?.trim() || undefined,
    previewImage: pagePreviewImage(doc),
    markdown,
    mode: 'article',
  };
}

/** Readability single-article extraction. */
export function htmlToArticleMarkdown(html: string, url: string): HtmlExtractResult | null {
  const doc = parseDocument(html, url);
  return htmlToArticleMarkdownFromDoc(doc);
}

export function htmlToListingMarkdown(html: string, url: string): HtmlExtractResult | null {
  const doc = parseDocument(html, url);
  const title = pageTitle(doc);
  const listing = extractListingFromDocument(doc, url, title);
  if (!listing) return null;
  return { title: listing.title, previewImage: pagePreviewImage(doc), markdown: listing.markdown, mode: 'page' };
}

/**
 * Listing/hub pages first (multi-item feeds), then Readability article, then page snapshot.
 * Avoids Readability picking one card from a forum, subreddit, or category page.
 */
export function htmlToMarkdown(html: string, url: string): HtmlExtractResult | null {
  const doc = parseDocument(html, url);
  const title = pageTitle(doc);

  const listing = extractListingFromDocument(doc, url, title);
  if (listing) {
    return { title: listing.title, previewImage: pagePreviewImage(doc), markdown: listing.markdown, mode: 'page' };
  }

  const items = collectListingItems(doc, url);
  const article = htmlToArticleMarkdownFromDoc(doc);
  if (shouldPreferListingExtract(items, url, article?.markdown)) {
    const markdown = listingItemsToMarkdown(items, title);
    if (markdown) return { title, previewImage: pagePreviewImage(doc), markdown, mode: 'page' };
  }

  return article ?? htmlToPageSnapshotFromDoc(doc);
}
