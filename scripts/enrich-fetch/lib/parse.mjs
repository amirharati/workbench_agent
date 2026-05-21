import { MIN_USEFUL_CHARS, SNIPPET_MAX, X_HOSTS, VIDEO_HOSTS } from './constants.mjs';

export function classifySourceKind(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (X_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'x';
    if (VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'video';
  } catch {
    /* ignore */
  }
  return 'article';
}

function capText(text, max = SNIPPET_MAX) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function parseFetchedContent(markdown, sourceKind, parsedTitle) {
  const title = parsedTitle || extractMarkdownTitle(markdown);
  let snippet = '';
  let quotedText;
  let quotedAuthor;

  if (sourceKind === 'x') {
    const x = parseXContent(markdown);
    snippet = x.combined;
    quotedText = x.quotedText;
    quotedAuthor = x.quotedAuthor;
  } else if (sourceKind === 'video') {
    snippet = parseVideoSnippet(markdown, title);
  } else {
    snippet = extractArticleBody(markdown);
  }

  if (!snippet.trim()) {
    snippet = markdown.trim().slice(0, SNIPPET_MAX);
  }

  snippet = capText(snippet);
  const summary = capText(snippet.slice(0, 2000));

  return {
    snippet,
    summary,
    title,
    quotedText: quotedText ? capText(quotedText, 4000) : undefined,
    quotedAuthor: quotedAuthor ? capText(quotedAuthor, 200) : undefined,
  };
}

function extractMarkdownTitle(md) {
  for (const line of md.split('\n')) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1].trim();
  }
  return undefined;
}

function extractArticleBody(md) {
  const skipLine = (line) => {
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
  const body = [];
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

function parseXContent(md) {
  const lines = md.split('\n');
  const blocks = [];
  let quotedText;
  let quotedAuthor;
  let inQuote = false;
  const quoteLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (
      lower.includes('quote tweet') ||
      lower === 'quote' ||
      /^>\s/.test(line) ||
      lower.includes('quoted')
    ) {
      inQuote = true;
    }

    if (inQuote) {
      if (/^>\s?/.test(line)) quoteLines.push(line.replace(/^>\s?/, ''));
      else if (line.trim()) quoteLines.push(line);
      if (quoteLines.length > 2 && !/^>\s?/.test(lines[i + 1] || '')) inQuote = false;
    }

    const authorMatch = line.match(/^(?:@|from:?\s*)([A-Za-z0-9_]{1,50})/i);
    if (authorMatch && !quotedAuthor) quotedAuthor = authorMatch[1];
  }

  if (quoteLines.length > 0) quotedText = quoteLines.join('\n').trim();

  for (const line of lines) {
    if (line.trim() && !line.startsWith('![')) blocks.push(line);
  }

  return { combined: blocks.join('\n').trim(), quotedText, quotedAuthor };
}

function parseVideoSnippet(md, title) {
  const lines = md.split('\n').map((l) => l.trim()).filter(Boolean);
  const parts = [title].filter(Boolean);
  const bodyStart = lines.findIndex((l) => l.length > 80 && !l.startsWith('#'));
  if (bodyStart >= 0) parts.push(lines.slice(bodyStart, bodyStart + 8).join(' ').slice(0, 2000));
  return parts.length > 0 ? parts.join('\n\n') : extractArticleBody(md);
}

export function snippetIsUseful(snippet, localBundle) {
  const s = snippet.trim();
  if (s.length < MIN_USEFUL_CHARS) return false;
  const local = localBundle.trim();
  if (local && s === local) return false;
  if (local && local.includes(s) && s.length < local.length * 0.6) return false;
  return true;
}
