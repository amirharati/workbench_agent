/**
 * Bookmark file import (HTML / CSV / JSON).
 * Valid exports are parsed in full — no row or file-size caps.
 * Unsupported shapes fail fast via schema probes before heavy work.
 */

export type BookmarkImportFormat = 'json' | 'csv' | 'html';

export type BookmarkImportSource = 'file-html' | 'file-csv' | 'file-json';

export interface BookmarkImportCandidate {
  source: BookmarkImportSource;
  title: string;
  url: string;
  description?: string;
  notes?: string;
  tags?: string[];
  folderPath?: string;
  imageUrl?: string;
  importSource?: string;
}

export interface BookmarkImportFormatSchema {
  format: BookmarkImportFormat;
  label: string;
  summary: string;
  required: string[];
  optional: string[];
  examples: string[];
}

/** Only used for quick unsupported-format checks — not a cap on valid imports. */
const SCHEMA_PROBE_CHARS = 128 * 1024;

const YIELD_EVERY_JSON_NODES = 400;
const YIELD_EVERY_CSV_ROWS = 2000;

export const BOOKMARK_IMPORT_FORMAT_SCHEMAS: Record<BookmarkImportFormat, BookmarkImportFormatSchema> = {
  html: {
    format: 'html',
    label: 'Netscape HTML',
    summary: 'Chrome/Firefox bookmark export (.html) with <a href="…"> links.',
    required: ['<a href="https://…"> title </a> in a folder tree'],
    optional: ['Nested <H3> folder headings'],
    examples: ['bookmarks.html', 'bookmarks_export.html'],
  },
  csv: {
    format: 'csv',
    label: 'CSV',
    summary: 'Spreadsheet export with a header row and one bookmark per line.',
    required: ['url (or href / link column)'],
    optional: [
      'title, name',
      'description, summary, excerpt, text',
      'notes, comment',
      'tags',
      'folder, folder path, path, collection, group, category',
      'image, cover, thumbnail',
    ],
    examples: ['url,title,folder', 'href,name,description'],
  },
  json: {
    format: 'json',
    label: 'JSON',
    summary: 'Array or tree of objects with a URL field (generic or X/Twitter export).',
    required: ['url, href, link, tweet_url, or https://… inside text fields'],
    optional: [
      'title, name',
      'description, full_text, note_tweet_text',
      'notes, tags, folderPath, folder, collection',
      'imageUrl, extended_media (X export)',
    ],
    examples: [
      '[{"url":"https://example.com","title":"Example"}]',
      'X bookmarks export (tweet_url + full_text)',
    ],
  },
};

export function formatImportSchemaHelp(format: BookmarkImportFormat): string {
  const s = BOOKMARK_IMPORT_FORMAT_SCHEMAS[format];
  const req = s.required.join('; ');
  const opt = s.optional.slice(0, 6).join(', ');
  const more = s.optional.length > 6 ? ', …' : '';
  return `${s.label}: ${s.summary} Required: ${req}. Optional: ${opt}${more}`;
}

export function formatAllImportSchemaHelp(): string {
  return (['html', 'csv', 'json'] as const)
    .map((f) => formatImportSchemaHelp(f))
    .join('\n');
}

export interface BookmarkImportParseAttempt {
  format: BookmarkImportFormat;
  rowCount: number;
  error?: string;
}

export interface BookmarkImportParseResult {
  rows: BookmarkImportCandidate[];
  detectedFormat: BookmarkImportFormat | 'unknown';
  sourceLabel: string;
  errorMessage?: string;
  attempts: BookmarkImportParseAttempt[];
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function toKeyMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    map[h.trim().toLowerCase()] = i;
  });
  return map;
}

function pickField(row: string[], keyMap: Record<string, number>, aliases: string[]): string {
  for (const alias of aliases) {
    const index = keyMap[alias];
    if (typeof index === 'number' && row[index]) return row[index].trim();
  }
  return '';
}

function csvHeaderHasUrlColumn(headerLine: string): boolean {
  const header = parseCsvLine(headerLine.trim());
  const keyMap = toKeyMap(header);
  return ['url', 'href', 'link'].some((k) => typeof keyMap[k] === 'number');
}

/** Fast reject: wrong CSV shape (header only). */
function quickRejectCsvSchema(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'File is empty.';
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.includes(',')) {
    return 'Not CSV bookmark export (expected comma-separated header with url column).';
  }
  if (!csvHeaderHasUrlColumn(firstLine)) {
    const header = parseCsvLine(firstLine);
    return `CSV header must include url, href, or link. Found: ${header.slice(0, 12).join(', ') || '(empty)'}`;
  }
  return null;
}

/** Fast reject: does not look like JSON bookmark export at file start. */
function quickRejectJsonSchema(text: string): string | null {
  const probe = text.trim().slice(0, SCHEMA_PROBE_CHARS);
  if (!probe) return 'File is empty.';
  const looksLikeJson =
    probe.startsWith('[') ||
    probe.startsWith('{') ||
    /(?:window|module\.exports|export\s+default)\s*=/.test(probe) ||
    /=\s*[\[{]/.test(probe);
  if (!looksLikeJson) {
    return 'Not JSON bookmark export (expected […] or {…} with url fields).';
  }
  return null;
}

/** Fast reject: does not look like Netscape HTML at file start. */
function quickRejectHtmlSchema(text: string): string | null {
  const probe = text.slice(0, SCHEMA_PROBE_CHARS);
  if (!probe.trim()) return 'File is empty.';
  const looksLikeHtml =
    /<!doctype html/i.test(probe) ||
    /<a\s+[^>]*href=/i.test(probe) ||
    /<dl>|<dt>|<h3/i.test(probe);
  if (!looksLikeHtml) {
    return 'Not Netscape HTML export (expected <a href="…"> bookmark links).';
  }
  return null;
}

function quickRejectSchema(format: BookmarkImportFormat, text: string): string | null {
  switch (format) {
    case 'csv':
      return quickRejectCsvSchema(text);
    case 'json':
      return quickRejectJsonSchema(text);
    case 'html':
      return quickRejectHtmlSchema(text);
    default:
      return null;
  }
}

export async function parseBookmarkCsv(text: string): Promise<BookmarkImportCandidate[]> {
  const schemaError = quickRejectCsvSchema(text);
  if (schemaError) throw new Error(schemaError);

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]);
  const keyMap = toKeyMap(header);
  const out: BookmarkImportCandidate[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    if (i > 1 && i % YIELD_EVERY_CSV_ROWS === 0) {
      await yieldToUi();
    }
    const row = parseCsvLine(lines[i]);
    const url = pickField(row, keyMap, ['url', 'href', 'link']);
    const title = pickField(row, keyMap, ['title', 'name']) || url;
    const description = pickField(row, keyMap, ['description', 'summary', 'excerpt', 'text']);
    const notes = pickField(row, keyMap, ['notes', 'comment']);
    const tagsRaw = pickField(row, keyMap, ['tags', 'tag']);
    const folderPath = pickField(row, keyMap, [
      'folder',
      'folder path',
      'path',
      'collection',
      'group',
      'category',
    ]);
    const imageUrl = pickField(row, keyMap, [
      'image',
      'image url',
      'cover',
      'cover url',
      'thumbnail',
      'preview',
      'media',
    ]);
    const importSource = pickField(row, keyMap, ['source', 'provider', 'from', 'origin']);
    const tags = tagsRaw ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [];
    if (!url) continue;
    out.push({
      source: 'file-csv',
      title: title || 'Untitled',
      url,
      description: description || undefined,
      notes: notes || description || undefined,
      tags: tags.length ? tags : undefined,
      folderPath: folderPath || undefined,
      imageUrl: imageUrl || undefined,
      importSource: importSource || undefined,
    });
  }
  return out;
}

function parseLooseJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex >= 0) {
      try {
        const rhs = trimmed.slice(eqIndex + 1).trim().replace(/;+\s*$/, '');
        return JSON.parse(rhs) as unknown;
      } catch {
        // fall through
      }
    }

    const firstArrayStart = trimmed.indexOf('[');
    const firstObjectStart = trimmed.indexOf('{');
    const starts = [firstArrayStart, firstObjectStart].filter((n) => n >= 0);
    if (starts.length === 0) {
      throw new Error('File is not valid JSON (expected [ or {).');
    }

    const start = Math.min(...starts);
    const MAX_SLICE_ATTEMPTS = 24;
    let end = trimmed.length;
    let attempts = 0;
    while (end > start + 1 && attempts < MAX_SLICE_ATTEMPTS) {
      attempts += 1;
      const chunk = trimmed.slice(start, end).trim().replace(/;+\s*$/, '');
      if (chunk.startsWith('[') || chunk.startsWith('{')) {
        try {
          return JSON.parse(chunk) as unknown;
        } catch {
          const prevClose = Math.max(chunk.lastIndexOf('}'), chunk.lastIndexOf(']'));
          if (prevClose > 0) {
            end = start + prevClose + 1;
            continue;
          }
        }
      }
      end -= Math.max(1, Math.floor((end - start) / 8));
    }

    throw new Error('Could not parse JSON — check syntax or export a plain .json array.');
  }
}

export async function parseBookmarkJson(text: string): Promise<BookmarkImportCandidate[]> {
  const schemaError = quickRejectJsonSchema(text);
  if (schemaError) throw new Error(schemaError);

  let parsed: unknown;
  try {
    parsed = parseLooseJson(text);
  } catch (e) {
    throw e instanceof Error ? e : new Error('Could not parse JSON data.');
  }

  const toRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  };

  const firstString = (row: Record<string, unknown>, keys: string[]): string => {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };

  const truncate = (value: string, maxLength = 120): string => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1).trimEnd()}…`;
  };

  const firstUrlInText = (value: string): string => {
    const match = value.match(/https?:\/\/\S+/i);
    return match ? match[0].trim() : '';
  };

  const inferXBookmarkImage = (row: Record<string, unknown>): string => {
    const extendedMedia = row.extended_media;
    if (!Array.isArray(extendedMedia)) return '';
    for (const mediaEntry of extendedMedia) {
      const media = toRecord(mediaEntry);
      if (!media) continue;
      const imageUrl = firstString(media, ['media_url_https', 'media_url', 'url', 'expanded_url']);
      if (imageUrl) return imageUrl;
    }
    return '';
  };

  const isXBookmarkRow = (row: Record<string, unknown>): boolean => {
    const hasTweetUrl = !!firstString(row, ['tweet_url']);
    const hasTweetText = !!firstString(row, ['full_text', 'note_tweet_text']);
    const hasAuthor = !!firstString(row, ['screen_name', 'name']);
    return hasTweetUrl && (hasTweetText || hasAuthor);
  };

  const firstWords = (value: string, maxWords = 10): string => {
    const words = value
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return `${words.slice(0, maxWords).join(' ')}…`;
  };

  const inferXBookmarkDescription = (row: Record<string, unknown>): string => {
    return firstString(row, ['note_tweet_text', 'full_text', 'description', 'text']);
  };

  const inferXBookmarkTitle = (row: Record<string, unknown>, fallbackUrl: string): string => {
    const description = inferXBookmarkDescription(row)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');
    const author = firstString(row, ['screen_name', 'name']);
    if (description) {
      const preview = firstWords(description, 10);
      return author ? `${author}: ${preview}` : preview;
    }
    if (author) return `${author}: ${truncate(fallbackUrl, 80)}`;
    return fallbackUrl;
  };

  const collectObjectCandidates = async (root: unknown): Promise<Record<string, unknown>[]> => {
    const out: Record<string, unknown>[] = [];
    const queue: unknown[] = [root];
    let inspected = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      inspected += 1;
      if (inspected % YIELD_EVERY_JSON_NODES === 0) {
        await yieldToUi();
      }
      if (!current) continue;

      if (Array.isArray(current)) {
        current.forEach((entry) => queue.push(entry));
        continue;
      }

      if (typeof current !== 'object') continue;
      const row = current as Record<string, unknown>;
      const hasLinkLikeField = !!firstString(row, [
        'url',
        'href',
        'link',
        'tweet_url',
        'expanded_url',
        'permalink',
      ]);
      const hasTextLinkHint = !!firstUrlInText(firstString(row, ['full_text', 'note_tweet_text', 'text']));
      if (hasLinkLikeField || hasTextLinkHint) out.push(row);

      Object.values(row).forEach((value) => {
        if (value && (Array.isArray(value) || typeof value === 'object')) {
          queue.push(value);
        }
      });
    }

    return out;
  };

  const candidateEntries = await collectObjectCandidates(parsed);
  if (candidateEntries.length === 0) {
    throw new Error(
      'JSON parsed but no bookmark objects found (need url/href/link/tweet_url or a https:// link in text fields).'
    );
  }

  const out: BookmarkImportCandidate[] = [];
  let built = 0;
  for (const entry of candidateEntries) {
    built += 1;
    if (built % YIELD_EVERY_CSV_ROWS === 0) {
      await yieldToUi();
    }
    const row = toRecord(entry);
    if (!row) continue;

    const baseUrl = firstString(row, ['url', 'href', 'link', 'tweet_url', 'expanded_url', 'permalink']);
    const textUrl = firstUrlInText(firstString(row, ['full_text', 'note_tweet_text', 'text']));
    const url = baseUrl || textUrl;
    if (!url) continue;

    const looksLikeXBookmark = isXBookmarkRow(row);
    const description = looksLikeXBookmark
      ? inferXBookmarkDescription(row)
      : firstString(row, ['description', 'summary', 'excerpt', 'full_text', 'note_tweet_text', 'text']);
    const title =
      firstString(row, ['title']) ||
      (looksLikeXBookmark ? inferXBookmarkTitle(row, url) : firstString(row, ['name']) || url);
    const notes = firstString(row, ['notes', 'comment']) || description;
    const rawTags = row.tags;
    const tags = Array.isArray(rawTags)
      ? rawTags.map((t) => String(t).trim()).filter(Boolean)
      : typeof rawTags === 'string'
        ? rawTags.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
        : [];
    const imageUrl =
      firstString(row, ['imageUrl', 'image', 'cover', 'thumbnail']) ||
      firstString(row, ['profile_image_url_https']) ||
      inferXBookmarkImage(row);
    const importSource =
      firstString(row, ['importSource', 'source', 'provider']) ||
      (looksLikeXBookmark ? 'x-bookmarks-export-v1' : '');

    out.push({
      source: 'file-json',
      title: title || 'Untitled',
      url,
      description: description || undefined,
      notes: notes || undefined,
      tags: tags.length ? tags : undefined,
      folderPath:
        firstString(row, ['folderPath', 'folder', 'collection']) ||
        (looksLikeXBookmark ? 'X / Bookmarks' : undefined),
      imageUrl: imageUrl || undefined,
      importSource: importSource || undefined,
    });
  }

  if (out.length === 0) {
    throw new Error('JSON objects found but none contained a usable URL.');
  }
  return out;
}

export async function parseBookmarkHtml(text: string): Promise<BookmarkImportCandidate[]> {
  const schemaError = quickRejectHtmlSchema(text);
  if (schemaError) throw new Error(schemaError);

  if (typeof DOMParser === 'undefined') {
    throw new Error('HTML import is not available in this environment.');
  }

  await yieldToUi();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const parseError = doc.querySelector('parsererror');
  if (parseError && !doc.querySelectorAll('a[href]').length) {
    throw new Error('Invalid HTML — expected a Netscape-style bookmarks export with <a href="…"> links.');
  }

  const anchors = Array.from(doc.querySelectorAll('a[href]'));

  const getFolderPath = (anchor: HTMLAnchorElement): string => {
    const segments: string[] = [];
    let current: HTMLElement | null = anchor.parentElement;
    while (current) {
      if (current.tagName === 'DL') {
        const prev = current.previousElementSibling as HTMLElement | null;
        if (prev && /^H[1-6]$/i.test(prev.tagName)) {
          const textValue = prev.textContent?.trim();
          if (textValue) segments.unshift(textValue);
        }
      }
      current = current.parentElement;
    }
    return segments.join(' / ');
  };

  const out: BookmarkImportCandidate[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    if (i > 0 && i % YIELD_EVERY_CSV_ROWS === 0) {
      await yieldToUi();
    }
    const a = anchors[i];
    const url = a.getAttribute('href')?.trim() || '';
    if (!url) continue;
    out.push({
      source: 'file-html',
      title: a.textContent?.trim() || url,
      url,
      description: undefined,
      folderPath: getFolderPath(a as HTMLAnchorElement) || undefined,
    });
  }

  if (out.length === 0) {
    throw new Error('HTML had no <a href="…"> bookmark links.');
  }
  return out;
}

function detectLikelyFormats(fileName: string, text: string): BookmarkImportFormat[] {
  const lowerName = fileName.toLowerCase();
  const trimmed = text.trim();
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.toLowerCase() || '';
  const order: BookmarkImportFormat[] = [];

  const isLikelyJsonContent =
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    /(?:window|module\.exports|export\s+default)\b/i.test(trimmed) ||
    (trimmed.includes('=') && (trimmed.includes('[') || trimmed.includes('{')));
  const isLikelyHtmlContent =
    /<!doctype html/i.test(trimmed) ||
    /<a\s+[^>]*href=/i.test(trimmed) ||
    /<dl>|<dt>|<h3/i.test(trimmed);
  const isLikelyCsvContent =
    firstLine.includes(',') &&
    /(url|href|link|title|name|description|notes|comment|folder|collection)/i.test(firstLine);

  if (isLikelyJsonContent || lowerName.endsWith('.json') || lowerName.endsWith('.js')) {
    order.push('json');
  }
  if (isLikelyCsvContent || lowerName.endsWith('.csv')) {
    order.push('csv');
  }
  if (isLikelyHtmlContent || lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
    order.push('html');
  }

  (['json', 'csv', 'html'] as const).forEach((f) => {
    if (!order.includes(f)) order.push(f);
  });
  return order;
}

function buildImportFailureMessage(
  fileName: string,
  attempts: BookmarkImportParseAttempt[]
): string {
  const lines: string[] = [
    `Could not import bookmarks from “${fileName}”.`,
    'This file does not match a supported export format.',
    '',
    'Supported formats:',
  ];
  for (const format of ['html', 'csv', 'json'] as const) {
    lines.push(`• ${formatImportSchemaHelp(format)}`);
  }
  const tried = attempts.filter((a) => a.error || a.rowCount === 0);
  if (tried.length > 0) {
    lines.push('', 'What we tried:');
    for (const a of tried) {
      const label = BOOKMARK_IMPORT_FORMAT_SCHEMAS[a.format].label;
      if (a.error) {
        lines.push(`• ${label}: ${a.error}`);
      } else {
        lines.push(`• ${label}: no rows with a URL`);
      }
    }
  }
  return lines.join('\n');
}

export async function parseBookmarkImportFile(input: {
  fileName: string;
  text: string;
  byteLength?: number;
}): Promise<BookmarkImportParseResult> {
  const { fileName, text } = input;
  const trimmed = text.trim();

  if (!trimmed) {
    return {
      rows: [],
      detectedFormat: 'unknown',
      sourceLabel: '',
      errorMessage: 'File is empty.',
      attempts: [],
    };
  }

  const formats = detectLikelyFormats(fileName, text);
  const attempts: BookmarkImportParseAttempt[] = [];
  let parsedRows: BookmarkImportCandidate[] = [];
  let detectedFormat: BookmarkImportFormat | 'unknown' = 'unknown';

  for (const format of formats) {
    await yieldToUi();

    const schemaReject = quickRejectSchema(format, text);
    if (schemaReject) {
      attempts.push({ format, rowCount: 0, error: schemaReject });
      continue;
    }

    try {
      let rows: BookmarkImportCandidate[] = [];
      if (format === 'json') rows = await parseBookmarkJson(text);
      else if (format === 'csv') rows = await parseBookmarkCsv(text);
      else rows = await parseBookmarkHtml(text);

      if (rows.length > 0) {
        attempts.push({ format, rowCount: rows.length });
        parsedRows = rows;
        detectedFormat = format;
        break;
      }
      attempts.push({ format, rowCount: 0, error: 'No rows with a URL' });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Parse failed';
      attempts.push({ format, rowCount: 0, error: message });
    }
  }

  const hasXAdapterRows = parsedRows.some((row) => row.importSource === 'x-bookmarks-export-v1');
  const adapterLabel = hasXAdapterRows ? 'X adapter' : 'generic adapter';
  const detectedLabel =
    detectedFormat === 'unknown'
      ? 'auto-detect: no match'
      : `auto-detect: ${detectedFormat} (${adapterLabel})`;

  if (parsedRows.length === 0) {
    return {
      rows: [],
      detectedFormat: 'unknown',
      sourceLabel: '',
      errorMessage: buildImportFailureMessage(fileName, attempts),
      attempts,
    };
  }

  const resolvedFormat = detectedFormat as BookmarkImportFormat;
  return {
    rows: parsedRows,
    detectedFormat: resolvedFormat,
    sourceLabel: `File: ${fileName} • ${detectedLabel} • ${formatImportSchemaHelp(resolvedFormat)}`,
    attempts,
  };
}
