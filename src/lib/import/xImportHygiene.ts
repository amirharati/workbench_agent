/**
 * Strip X/Twitter media facet t.co links from import title/description (B11).
 * Media t.co URLs resolve to /photo/N or /video/N — not outbound links.
 */

const TCO_HOST_RE = /^(?:www\.)?t\.co$/i;

function normalizeTcoUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (!TCO_HOST_RE.test(u.hostname)) return '';
    u.hostname = 't.co';
    u.protocol = 'https:';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return /^https?:\/\/t\.co\//i.test(trimmed) ? trimmed.replace(/\/$/, '') : '';
  }
}

function isTcoUrl(raw: string): boolean {
  return !!normalizeTcoUrl(raw);
}

export function isXMediaExpandedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host !== 'x.com' && host !== 'twitter.com' && !host.endsWith('.twitter.com')) {
      return false;
    }
    return /\/(photo|video)\/\d+/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** Media facet t.co URLs from extended_media / entities (X JSON export). */
export function collectXMediaTcoUrls(row: Record<string, unknown>): string[] {
  const out = new Set<string>();

  const considerMedia = (media: Record<string, unknown>) => {
    const shortUrl = firstString(media, ['url', 'media_url_https', 'media_url']);
    const expanded = firstString(media, ['expanded_url', 'display_url']);
    if (expanded && isXMediaExpandedUrl(expanded) && isTcoUrl(shortUrl)) {
      const norm = normalizeTcoUrl(shortUrl);
      if (norm) out.add(norm);
      return;
    }
    if (isTcoUrl(shortUrl) && expanded && isXMediaExpandedUrl(expanded)) {
      const norm = normalizeTcoUrl(shortUrl);
      if (norm) out.add(norm);
    }
  };

  const extendedMedia = row.extended_media;
  if (Array.isArray(extendedMedia)) {
    for (const entry of extendedMedia) {
      const media = toRecord(entry);
      if (media) considerMedia(media);
    }
  }

  const entities = toRecord(row.entities);
  const entityMedia = entities?.media;
  if (Array.isArray(entityMedia)) {
    for (const entry of entityMedia) {
      const media = toRecord(entry);
      if (media) considerMedia(media);
    }
  }

  return [...out];
}

function removeTcoUrls(text: string, tcos: Iterable<string>): string {
  let result = text;
  for (const tco of tcos) {
    const escaped = tco.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\s*${escaped}\\s*`, 'gi'), ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

/** When extended_media is missing (CSV), drop trailing or sole media t.co. */
export function stripTrailingOrSoleMediaTco(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (/^https?:\/\/(?:www\.)?t\.co\/\S+$/i.test(trimmed)) {
    return '';
  }

  const trailing = trimmed.match(/^(.*?)\s+https?:\/\/(?:www\.)?t\.co\/\S+$/i);
  if (trailing?.[1]?.trim()) {
    return trailing[1].trim();
  }

  return trimmed;
}

export function shouldPreferImportTitle(
  existingTitle: string | undefined,
  incomingTitle: string | undefined,
  url: string
): boolean {
  const inc = incomingTitle?.trim();
  if (!inc || inc === url) return false;
  const ex = existingTitle?.trim();
  if (!ex || ex === url) return true;
  if (/https?:\/\/(?:www\.)?t\.co\/\S+/i.test(ex) && !/https?:\/\/(?:www\.)?t\.co\/\S+/i.test(inc)) {
    const exStripped = ex
      .replace(/\s*https?:\/\/(?:www\.)?t\.co\/\S+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const incNorm = inc.replace(/\s+/g, ' ').trim();
    if (exStripped === incNorm) return true;
  }
  return false;
}

/**
 * Preserve an existing per-collection note while retaining distinct imported text.
 * Re-importing the same note is idempotent.
 */
export function mergeImportedPlacementNotes(
  existingNotes: string | undefined,
  incomingNotes: string | undefined
): string | undefined {
  const existing = existingNotes?.trim();
  const incoming = incomingNotes?.trim();
  if (!existing) return incoming || undefined;
  if (!incoming || existing === incoming || existing.includes(incoming)) return existingNotes;
  return `${existingNotes!.trimEnd()}\n\n${incoming}`;
}

/** Preserve existing per-collection tags and add any new imported tags. */
export function mergeImportedPlacementTags(
  existingTags: string[] | undefined,
  incomingTags: string[] | undefined
): string[] {
  const merged = [...(existingTags ?? [])];
  const seen = new Set(merged.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean));
  for (const rawTag of incomingTags ?? []) {
    const tag = rawTag.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    merged.push(tag);
    seen.add(key);
  }
  return merged;
}

export function cleanXImportText(
  row: Record<string, unknown>,
  text: string,
  options?: { heuristicOnly?: boolean }
): string {
  const raw = text.trim();
  if (!raw) return '';

  if (/^https?:\/\/(?:www\.)?t\.co\/\S+$/i.test(raw)) {
    return '';
  }

  const mediaTcos = options?.heuristicOnly ? [] : collectXMediaTcoUrls(row);
  let cleaned = mediaTcos.length ? removeTcoUrls(raw, mediaTcos) : raw;

  if (options?.heuristicOnly) {
    cleaned = stripTrailingOrSoleMediaTco(cleaned);
  } else if (mediaTcos.length > 0) {
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
  }

  return cleaned;
}
