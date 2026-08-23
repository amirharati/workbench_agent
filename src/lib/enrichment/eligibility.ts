import type { Item } from '../db';
import { normalizeBookmarkUrl } from '../db';
import type { EligibilityResult, ItemEnrichment, SourceKind } from './types';
import { ENRICHMENT_DEFAULTS } from './types';

const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv'];
const X_HOSTS = ['x.com', 'twitter.com', 't.co'];

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

export function classifySourceKind(url: string, item?: Item): SourceKind {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (X_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'x';
    if (VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'video';
    if (item?.metadata?.platform === 'x') return 'x';
    if (item?.metadata?.platform === 'youtube') return 'video';
  } catch {
    /* ignore */
  }
  return 'article';
}

export function getLocalTextBundle(item: Item): string {
  const parts: string[] = [item.title || '', item.notes || ''];
  const placements = item.placements || {};
  for (const p of Object.values(placements)) {
    if (p.notes) parts.push(p.notes);
  }
  return parts.map((s) => s.trim()).filter(Boolean).join('\n\n');
}

export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const GENERIC_TITLE_EXACT =
  /^(?:welcome|home|sign\s*up|log\s*in|sign\s*in|youtube|linkedin|reddit|untitled|error|undefined|gmail|grok|new\s+tab|loading\.\.\.|document|index|default)$/i;

const SITE_SUFFIX_RE =
  /\s*[|\-–—]\s*(?:Reddit|Medium|YouTube|LinkedIn|X|Twitter|GitHub|Google Docs|Gmail|Outlook|Facebook|Instagram|Hacker News|HN|Stack Overflow|Substack|Notion|Dev\.to|DEV Community|Google Drive|Google Sheets|Google Slides|Microsoft Teams|Slack|Discord|·\s*Reddit)$/i;

const BARE_SUBREDDIT_RE = /^r\/[\w-]+$/i;

/** Browser tab title noise — not a user-crafted bookmark label. */
export function titleLooksLikeBrowserChrome(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (/^\(\d+\)\s/.test(t)) return true;
  if (SITE_SUFFIX_RE.test(t)) return true;
  if (/\bhttps?:\/\//i.test(t)) return true;
  if (/t\.co\/\w+/i.test(t)) return true;
  if (t.includes('\n')) return true;
  if (/\s+on X:/i.test(t)) return true;
  if (/\s+\/\s*X\s*$/i.test(t)) return true;
  return false;
}

function stripSiteSuffix(title: string): string {
  return title.replace(SITE_SUFFIX_RE, '').trim();
}

/** Remove browser notification counts and common site suffixes from a live tab title. */
export function cleanLiveDocumentTitle(title: string): string {
  const withoutCount = title.trim().replace(/^\(\d+\)\s*/, '');
  return stripSiteSuffix(withoutCount) || withoutCount;
}

function titleMatchesUrlSlug(title: string, url: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return false;
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1]?.toLowerCase();
    if (last) {
      const slugSpaced = last.replace(/[-_+.]+/g, ' ').trim();
      const compact = t.replace(/\s+/g, '');
      if (t === last || compact === last.replace(/[-_+.]/g, '')) return true;
      if (slugSpaced.length >= 4 && t === slugSpaced) return true;
    }
    const rIdx = segments.findIndex((s) => s.toLowerCase() === 'r');
    if (rIdx >= 0 && segments[rIdx + 1]) {
      const name = segments[rIdx + 1].toLowerCase();
      if (name && (t === name || t.replace(/\s+/g, '') === name.replace(/[-_]/g, ''))) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** True when the page title is generic, empty, or mostly site chrome — not the topic. */
export function titleIsGenericShell(title: string, url: string): boolean {
  const t = (title || '').trim();
  if (!t) return true;
  if (GENERIC_TITLE_EXACT.test(t)) return true;

  const normalized = normalizeBookmarkUrl(url);
  if (t === url || t === normalized) return true;

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (t === host || t === u.hostname) return true;
    const hostBase = host.split('.').slice(-2).join('.');
    if (t.toLowerCase() === hostBase.split('.')[0]) return true;
  } catch {
    /* ignore */
  }

  return false;
}

/** True when the page title is generic, empty, or mostly site chrome — not the topic. */
export function titleLooksWeak(title: string, url: string): boolean {
  const t = (title || '').trim();
  if (titleIsGenericShell(t, url)) return true;
  if (BARE_SUBREDDIT_RE.test(t)) return true;

  if (titleMatchesUrlSlug(t, url)) return true;

  if (classifySourceKind(url) === 'x') {
    if (t.length > 100) return true;
    if (t.includes('\n')) return true;
  }

  const withoutSuffix = stripSiteSuffix(t);
  if (withoutSuffix !== t && withoutSuffix.length < 12) return true;
  if (SITE_SUFFIX_RE.test(t) && withoutSuffix.length < 18) return true;

  return t.length < 12;
}

/** Whether AI/fetched title should replace the saved bookmark title. */
export function shouldUpgradeBookmarkTitle(
  existingTitle: string | undefined,
  candidateTitle: string | undefined,
  url: string
): boolean {
  const candidate = candidateTitle?.trim();
  if (!candidate || candidate.length < 6) return false;
  if (candidate === url || GENERIC_TITLE_EXACT.test(candidate)) return false;

  const normalized = normalizeBookmarkUrl(url);
  if (candidate === normalized) return false;

  const current = (existingTitle || '').trim();
  if (!current) return true;
  if (candidate === current) return false;

  const currentCore = stripSiteSuffix(current);
  const candidateCore = stripSiteSuffix(candidate);

  if (titleLooksWeak(current, url)) return true;
  if (titleLooksLikeBrowserChrome(current)) return true;

  if (
    SITE_SUFFIX_RE.test(current) &&
    !SITE_SUFFIX_RE.test(candidate) &&
    candidateCore.length >= 12 &&
    candidateCore.length >= currentCore.length - 4
  ) {
    return true;
  }

  if (currentCore.length < 18 && candidateCore.length >= currentCore.length + 8) {
    return true;
  }

  if (titleMatchesUrlSlug(current, url) && candidateCore.length >= 14) {
    return true;
  }

  return false;
}

export function checkEligibility(
  item: Item,
  enrichment?: ItemEnrichment | null,
  options?: { force?: boolean; refetchCompare?: boolean }
): EligibilityResult {
  const url = (item.url || '').trim();
  const force = options?.force === true;
  const refetchCompare = options?.refetchCompare === true;

  if (!url) {
    return { eligible: false, reason: 'no_url' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { eligible: false, reason: 'invalid_url' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'file:') {
    return { eligible: false, reason: 'excluded_non_http' };
  }

  if (LOCALHOST_RE.test(parsed.hostname)) {
    return { eligible: false, reason: 'excluded_localhost' };
  }

  const sourceKind = classifySourceKind(url, item);
  const localBundle = getLocalTextBundle(item);
  const localLen = localBundle.length;
  const textHash = hashText(localBundle);
  const weakTitle = titleLooksWeak(item.title, url);

  const hasPriorFetch =
    enrichment?.status === 'ok' && typeof enrichment.contentHash === 'string';

  // Saved page snapshot: always re-fetch and compare content hash (single digest, import, batch).
  if (
    !force &&
    !refetchCompare &&
    !hasPriorFetch &&
    enrichment?.textHash === textHash &&
    enrichment.status === 'ok'
  ) {
    return {
      eligible: false,
      reason: 'unchanged',
      sourceKind,
    };
  }

  if (!force && enrichment?.nextRetryAt && enrichment.nextRetryAt > Date.now()) {
    return { eligible: false, reason: 'backoff', sourceKind };
  }

  const priorSkippedLocalOnly =
    enrichment?.status === 'skipped' &&
    enrichment.skipReason === 'skipped_sufficient_local';

  if (
    !force &&
    sourceKind !== 'x' &&
    !priorSkippedLocalOnly &&
    localLen >= ENRICHMENT_DEFAULTS.richLocalMinChars &&
    !weakTitle &&
    !hasPriorFetch
  ) {
    return {
      eligible: true,
      skipFetch: true,
      skipReason: 'skipped_sufficient_local',
      sourceKind,
    };
  }

  return { eligible: true, sourceKind };
}

export function checkUrlEligibility(url: string): EligibilityResult {
  return checkEligibility({
    id: '_',
    url,
    title: '',
    collectionIds: [],
    tags: [],
    created_at: 0,
    updated_at: 0,
    source: 'manual',
  });
}
