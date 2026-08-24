import type { SourceKind } from './types';
import { ENRICHMENT_DEFAULTS } from './types';

export interface ParsedEnrichment {
  snippet: string;
  summary: string;
  title?: string;
  quotedText?: string;
  quotedAuthor?: string;
  channel?: string;
  description?: string;
}

export function capText(text: string, max: number = ENRICHMENT_DEFAULTS.snippetMaxChars): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function parseFetchedContent(
  markdown: string,
  sourceKind: SourceKind,
  parsedTitle?: string
): ParsedEnrichment {
  const title = parsedTitle || extractMarkdownTitle(markdown);
  // The selected fetch candidate is already the canonical content evidence.
  // Normalize only transport whitespace. Source-aware helpers may observe the
  // body to add structured hints, but must never replace, filter, or shrink it.
  let snippet = normalizeFetchedBody(markdown);
  let quotedText: string | undefined;
  let quotedAuthor: string | undefined;
  let channel: string | undefined;
  let description: string | undefined;

  if (sourceKind === 'x') {
    const x = parseXMetadata(markdown);
    quotedText = x.quotedText;
    quotedAuthor = x.quotedAuthor;
  } else if (sourceKind === 'video') {
    const v = parseVideoMetadata(markdown);
    channel = v.channel;
    description = v.description;
  }

  if (!snippet.trim()) {
    snippet = markdown.trim().slice(0, ENRICHMENT_DEFAULTS.snippetMaxChars);
  }

  snippet = capText(snippet);
  const summary = capText(snippet.slice(0, 2000));

  return {
    snippet,
    summary,
    title,
    quotedText: quotedText ? capText(quotedText, 4000) : undefined,
    quotedAuthor: quotedAuthor ? capText(quotedAuthor, 200) : undefined,
    channel: channel ? capText(channel, 200) : undefined,
    description: description ? capText(description, 4000) : undefined,
  };
}

function extractMarkdownTitle(md: string): string | undefined {
  for (const line of md.split('\n')) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1].trim();
  }
  return undefined;
}

function normalizeFetchedBody(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function parseXMetadata(md: string): {
  quotedText?: string;
  quotedAuthor?: string;
} {
  const lines = md.split('\n');
  let quotedText: string | undefined;
  let quotedAuthor: string | undefined;
  let parentHandle: string | undefined;

  for (const line of lines) {
    const parentM = line.match(/^#\s+@([A-Za-z0-9_]{1,50})/);
    if (parentM) {
      parentHandle = parentM[1];
      break;
    }
  }

  // B2: quoted author only from explicit quote markers — not first @mention in tweet body.
  for (const line of lines) {
    const blockquoteAuthor = line.match(/^>\s*Quote from @([A-Za-z0-9_]{1,50})/i);
    if (blockquoteAuthor) {
      quotedAuthor = blockquoteAuthor[1];
      break;
    }
    const expandedAuthor = line.match(/^###\s*Quoted thread from @([A-Za-z0-9_]{1,50})/i);
    if (expandedAuthor) {
      quotedAuthor = expandedAuthor[1];
      break;
    }
  }

  // Blockquote-style quote (single-tweet QT).
  const blockquoteLines: string[] = [];
  let inBlockquote = false;
  for (const line of lines) {
    if (/^>\s*Quote from @/i.test(line)) {
      inBlockquote = true;
      continue;
    }
    if (inBlockquote) {
      if (/^>\s?/.test(line)) {
        blockquoteLines.push(line.replace(/^>\s?/, ''));
      } else if (!line.trim()) {
        continue;
      } else {
        inBlockquote = false;
      }
    }
  }
  if (blockquoteLines.length > 0) {
    quotedText = blockquoteLines.join('\n').trim();
  }

  // Expanded quoted thread — body only (skip nested thread header duplicate).
  if (!quotedText) {
    const expandedIdx = lines.findIndex((l) => /^###\s*Quoted thread from @/i.test(l));
    if (expandedIdx >= 0) {
      const body: string[] = [];
      for (let i = expandedIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^###\s/.test(line) && i > expandedIdx + 1) break;
        if (/^## Linked:/i.test(line)) break;
        if (/^#\s+@/.test(line) && i > expandedIdx + 1) continue;
        if (line.trim() === '---') continue;
        if (/^##\s+\d+\/\d+/.test(line)) continue;
        body.push(line);
      }
      const text = body.join('\n').trim();
      if (
        text &&
        !(
          parentHandle &&
          quotedAuthor &&
          parentHandle.toLowerCase() === quotedAuthor.toLowerCase()
        )
      ) {
        quotedText = text;
      }
    }
  }

  if (!quotedText) {
    const quoteSection = md.split(/\n#{1,3}\s*quote/i);
    if (quoteSection.length > 1) {
      quotedText = quoteSection[1].split(/\n#{1,3}\s/)[0].trim().slice(0, 4000);
    }
  }

  return { quotedText, quotedAuthor };
}

function parseVideoMetadata(md: string): {
  channel?: string;
  description?: string;
} {
  const lines = md.split('\n').map((l) => l.trim()).filter(Boolean);
  let channel: string | undefined;
  let description: string | undefined;

  for (const line of lines) {
    const ch = line.match(/^(?:channel|by|uploader)[:\s]+(.+)/i);
    if (ch) channel = ch[1].trim();
  }

  const bodyStart = lines.findIndex((l) => l.length > 80 && !l.startsWith('#'));
  if (bodyStart >= 0) {
    description = lines.slice(bodyStart, bodyStart + 8).join(' ').slice(0, 2000);
  }

  return { channel, description };
}

export function snippetIsUseful(snippet: string, localBundle: string): boolean {
  const s = snippet.trim();
  if (s.length < ENRICHMENT_DEFAULTS.minUsefulSnippetChars) return false;
  if (localBundle.trim() && s === localBundle.trim()) return false;
  if (localBundle.trim() && localBundle.trim().includes(s) && s.length < localBundle.length * 0.6) {
    return false;
  }
  return true;
}
