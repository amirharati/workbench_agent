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
  let snippet = '';
  let quotedText: string | undefined;
  let quotedAuthor: string | undefined;
  let channel: string | undefined;
  let description: string | undefined;

  if (sourceKind === 'x') {
    const x = parseXContent(markdown);
    snippet = x.combined;
    quotedText = x.quotedText;
    quotedAuthor = x.quotedAuthor;
  } else if (sourceKind === 'video') {
    const v = parseVideoContent(markdown, title);
    snippet = v.snippet;
    channel = v.channel;
    description = v.description;
  } else {
    snippet = extractArticleBody(markdown);
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

function extractArticleBody(md: string): string {
  const skipLine = (line: string): boolean => {
    const t = line.trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    if (/^!\[/.test(t)) return true;
    if (/^https?:\/\//.test(t) && t.length < 120) return true;
    if (/sign in|log in|subscribe to|accept cookies|cookie policy|privacy policy/i.test(lower)) {
      return true;
    }
    if (/^#{1,3}\s+(menu|navigation|footer|related|comments)\b/i.test(t)) return true;
    return false;
  };

  const lines = md.split('\n');
  const body: string[] = [];
  let pastTitle = false;
  for (const line of lines) {
    if (!pastTitle && /^#\s+/.test(line)) {
      pastTitle = true;
      continue;
    }
    if (skipLine(line)) continue;
    body.push(line);
  }
  return body.join('\n').trim();
}

function parseXContent(md: string): {
  combined: string;
  quotedText?: string;
  quotedAuthor?: string;
} {
  const lines = md.split('\n');
  const blocks: string[] = [];
  let quotedText: string | undefined;
  let quotedAuthor: string | undefined;

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
      if (text) quotedText = text;
    }
  }

  if (!quotedText) {
    const quoteSection = md.split(/\n#{1,3}\s*quote/i);
    if (quoteSection.length > 1) {
      quotedText = quoteSection[1].split(/\n#{1,3}\s/)[0].trim().slice(0, 4000);
    }
  }

  for (const line of lines) {
    if (line.trim() && !line.startsWith('![')) blocks.push(line);
  }

  const combined = blocks.join('\n').trim();
  return { combined, quotedText, quotedAuthor };
}

function parseVideoContent(md: string, title?: string): {
  snippet: string;
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

  const parts = [title, channel, description].filter(Boolean) as string[];
  const snippet = parts.length > 0 ? parts.join('\n\n') : extractArticleBody(md);

  return { snippet, channel, description };
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
