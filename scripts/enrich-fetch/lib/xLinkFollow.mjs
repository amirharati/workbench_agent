import { classifySourceKind } from './parse.mjs';
import {
  explainHardFetchFailure,
  isFetchBodyUsable,
  rewriteLinkFollowUrl,
  stripProviderWrapper,
} from './fetchQuality.mjs';
import { isShortLinkHost, resolveFetchUrl } from './urlPolicy.mjs';

const MAX_LINK_FOLLOWS = 3;
const MAX_LINK_BODY_CHARS = 10_000;

const SKIP = new Set([
  'twitter.com',
  'x.com',
  't.co',
  'pic.twitter.com',
  'pbs.twimg.com',
  'video.twimg.com',
  'twimg.com',
]);

function normalizeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isXHost(url) {
  const h = normalizeHost(url);
  return h === 'x.com' || h === 'twitter.com' || h.endsWith('.twitter.com') || h.endsWith('.x.com');
}

function shouldSkip(url) {
  const h = normalizeHost(url);
  if (!h) return true;
  if (SKIP.has(h)) return true;
  if (h.endsWith('.twitter.com') || h.endsWith('.x.com')) return true;
  return false;
}

export function extractXLinkFollowUrls(markdown, bookmarkUrl) {
  const seen = new Set();
  const out = [];
  let bookmarkHost = normalizeHost(bookmarkUrl);
  const re = /https?:\/\/[^\s)\]>]+/gi;
  for (const match of markdown.matchAll(re)) {
    const raw = match[0].replace(/[.,;:!?)]+$/, '');
    try {
      const u = new URL(raw);
      if (shouldSkip(raw) || normalizeHost(raw) === bookmarkHost) continue;
      const key = u.href;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
      if (out.length >= MAX_LINK_FOLLOWS) break;
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function fetchArticleBody(url, signal) {
  if (classifySourceKind(url) === 'x') return null;
  const { fetchLocal, fetchJina } = await import('./providers.mjs');
  const ctx = { url };
  for (const run of [fetchLocal, fetchJina]) {
    const result = await run(url);
    if (!result.ok || !result.markdown?.trim()) continue;
    const clean = stripProviderWrapper(result.markdown);
    if (explainHardFetchFailure(clean, ctx)) continue;
    if (!isFetchBodyUsable(clean, undefined, ctx)) continue;
    return { markdown: clean.slice(0, MAX_LINK_BODY_CHARS), title: result.title };
  }
  return null;
}

export async function appendXLinkFollowBodies(markdown, bookmarkUrl, signal) {
  const candidates = extractXLinkFollowUrls(markdown, bookmarkUrl);
  if (!candidates.length) return markdown;

  const sections = [markdown];
  for (const raw of candidates) {
    let target = raw;
    try {
      if (isShortLinkHost(raw)) {
        const resolved = await resolveFetchUrl(raw, signal);
        target = resolved.url;
      }
    } catch {
      continue;
    }
    if (isXHost(target) || shouldSkip(target)) continue;
    target = rewriteLinkFollowUrl(target);
    const body = await fetchArticleBody(target, signal);
    if (!body?.markdown?.trim()) continue;
    let host = target;
    try {
      host = new URL(target).hostname.replace(/^www\./, '');
    } catch {
      /* ignore */
    }
    sections.push(
      '',
      '---',
      '',
      `## Linked: ${body.title?.trim() || host}`,
      '',
      `Source: ${target}`,
      '',
      body.markdown
    );
  }
  return sections.length > 1 ? sections.join('\n') : markdown;
}
