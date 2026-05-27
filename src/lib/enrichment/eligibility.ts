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

export function titleLooksWeak(title: string, url: string): boolean {
  const t = (title || '').trim();
  if (!t) return true;
  const normalized = normalizeBookmarkUrl(url);
  if (t === url || t === normalized) return true;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (t === host || t === u.hostname) return true;
  } catch {
    /* ignore */
  }
  return t.length < 8;
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
  if (protocol !== 'http:' && protocol !== 'https:') {
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

  if (!force && localLen >= ENRICHMENT_DEFAULTS.richLocalMinChars && !weakTitle) {
    const xThin =
      sourceKind === 'x' &&
      localLen < ENRICHMENT_DEFAULTS.richLocalMinChars * 2 &&
      !localBundle.includes('\n\n');
    if (!xThin && !hasPriorFetch) {
      return {
        eligible: true,
        skipFetch: true,
        skipReason: 'skipped_sufficient_local',
        sourceKind,
      };
    }
  }

  if (
    !force &&
    !hasPriorFetch &&
    sourceKind === 'x' &&
    localLen >= 200 &&
    (localBundle.includes('http') || localBundle.length >= 280)
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
