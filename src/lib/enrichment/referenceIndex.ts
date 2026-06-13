import type { EnrichmentReference, EnrichmentReferenceKind } from './types';
import { isShortLinkHost, normalizeHost } from './urlPolicy';

const URL_IN_TEXT = /https?:\/\/[^\s)\]>]+/gi;
const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv'];
const X_HOSTS = ['x.com', 'twitter.com', 't.co'];

function normalizeUrlKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

function trimTrailingPunctuation(raw: string): string {
  return raw.replace(/[.,;:!?)]+$/, '');
}

/** URLs from `## Linked:` sections that were depth-1 fetched. */
export function extractFollowedReferenceUrls(markdown: string): Set<string> {
  const followed = new Set<string>();
  const blocks = markdown.split(/\n---\n/);
  for (const block of blocks) {
    if (!/^## Linked:/m.test(block)) continue;
    for (const match of block.matchAll(/^Source:\s*(https?:\/\/\S+)/gim)) {
      const key = normalizeUrlKey(trimTrailingPunctuation(match[1]));
      if (key) followed.add(key);
    }
  }
  return followed;
}

function classifyReferenceKind(url: string): EnrichmentReferenceKind {
  try {
    const host = normalizeHost(url);
    if (host.includes('pbs.twimg.com') || host.includes('video.twimg.com')) return 'image';
    if (host.includes('github.com') || host.includes('gitlab.com')) return 'repo';
    if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)) return 'image';
    if (X_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'social';
    if (VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'video';
  } catch {
    /* ignore */
  }
  if (isShortLinkHost(url)) return 'short';
  return 'article';
}

function labelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return host;
    const tail = decodeURIComponent(parts[parts.length - 1]).replace(/[-_]/g, ' ');
    if (tail.length > 2 && tail.length <= 80) return `${host} — ${tail}`;
    return host;
  } catch {
    return url.slice(0, 120);
  }
}

/** Map URL → inline label from numbered lists and `## Linked:` headings. */
function extractInlineLabels(markdown: string): Map<string, string> {
  const labels = new Map<string, string>();

  const linkedBlocks = markdown.split(/\n---\n/);
  for (const block of linkedBlocks) {
    const heading = block.match(/^## Linked:\s*(.+)$/im);
    if (!heading) continue;
    const title = heading[1].trim();
    const source = block.match(/^Source:\s*(https?:\/\/\S+)/im);
    const key = source ? normalizeUrlKey(trimTrailingPunctuation(source[1])) : null;
    if (key && title) labels.set(key, title.slice(0, 200));
  }

  for (const match of markdown.matchAll(/(?:^|\n)\s*\d+\.\s*([^\n:http]+?)\s*(https?:\/\/[^\s)\]>]+)/gi)) {
    const label = match[1].trim();
    const key = normalizeUrlKey(trimTrailingPunctuation(match[2]));
    if (key && label && !labels.has(key)) labels.set(key, label.slice(0, 200));
  }

  return labels;
}

function referenceScope(
  url: string,
  bookmarkHost: string
): EnrichmentReference['scope'] {
  if (!bookmarkHost) return 'external';
  try {
    return normalizeHost(url) === bookmarkHost ? 'internal' : 'external';
  } catch {
    return 'external';
  }
}

function addReference(
  seen: Map<string, EnrichmentReference>,
  rawUrl: string,
  opts: {
    bookmarkHost: string;
    followed: Set<string>;
    inlineLabels: Map<string, string>;
    defaultLabel?: string;
    kindOverride?: EnrichmentReferenceKind;
  }
): void {
  const key = normalizeUrlKey(trimTrailingPunctuation(rawUrl));
  if (!key) return;
  if (seen.has(key)) return;

  const followed = opts.followed.has(key);
  const label =
    opts.defaultLabel?.trim() ||
    opts.inlineLabels.get(key) ||
    labelFromUrl(key);

  const ref: EnrichmentReference = {
    url: key,
    label: label.slice(0, 200),
    scope: referenceScope(key, opts.bookmarkHost),
    kind: opts.kindOverride ?? classifyReferenceKind(key),
  };
  if (followed) ref.followed = true;

  seen.set(key, ref);
}

/**
 * Mechanical URL/media index from post-fetch markdown (all links; marks depth-1 follows).
 */
export function buildReferenceIndex(
  markdown: string,
  bookmarkUrl: string
): EnrichmentReference[] {
  if (!markdown.trim()) return [];

  let bookmarkHost = '';
  try {
    bookmarkHost = normalizeHost(bookmarkUrl);
  } catch {
    /* ignore */
  }

  const followed = extractFollowedReferenceUrls(markdown);
  const inlineLabels = extractInlineLabels(markdown);
  const seen = new Map<string, EnrichmentReference>();
  const ctx = { bookmarkHost, followed, inlineLabels };

  for (const match of markdown.matchAll(/^Image:\s*(https?:\/\/\S+)/gim)) {
    addReference(seen, match[1], { ...ctx, kindOverride: 'image' });
  }

  for (const match of markdown.matchAll(URL_IN_TEXT)) {
    addReference(seen, match[0], ctx);
  }

  return Array.from(seen.values()).sort((a, b) => {
    if (a.followed !== b.followed) return a.followed ? -1 : 1;
    if (a.scope !== b.scope) return a.scope === 'external' ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/** Compact list for enrichment-meta JSON and inspector UI. */
export function formatReferencesBlock(references: EnrichmentReference[]): string {
  if (!references.length) return '';
  return references
    .map((r) => {
      const tag = r.followed ? 'fetched' : 'link only';
      return `- ${r.label}: ${r.url} (${tag})`;
    })
    .join('\n');
}

/** Shorter rows for `enrichment-meta.references` (no markdown). */
export function referencesForMeta(
  references: EnrichmentReference[]
): Array<Pick<EnrichmentReference, 'url' | 'label' | 'kind' | 'followed'>> {
  return references.map((r) => ({
    url: r.url,
    label: r.label,
    kind: r.kind,
    followed: r.followed ?? false,
  }));
}
