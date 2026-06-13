function stripWrapper(markdown: string): string {
  const marker = /Markdown Content:\s*\n/i;
  const match = markdown.match(marker);
  if (match && match.index !== undefined) {
    return markdown.slice(match.index + match[0].length).trim();
  }
  return markdown.trim();
}

const SITE_TITLE_SUFFIX =
  /\s*-\s*(?:YouTube|Vimeo|Twitch|Watch|Video)\s*$/i;

export type VideoStructuredContent = {
  title: string;
  channel?: string;
  metaLine?: string;
  description?: string;
  transcript?: string;
};

/** Tab listing scrape on a watch page — sidebar chapters/comments, not video metadata. */
export function isVideoListingTabScrape(markdown: string): boolean {
  const raw = stripWrapper(markdown).trim();
  return /^#\s+.+\n+Items on this page \(\d+\):/m.test(raw);
}

function cleanLine(value: string | undefined): string | undefined {
  const t = value?.replace(/\s+/g, ' ').trim();
  return t || undefined;
}

function extractSection(body: string, name: string): string | undefined {
  const match = body.match(
    new RegExp(`##\\s*${name}\\s*\\n+([\\s\\S]*?)(?=\\n##|\\n#\\s|$)`, 'i')
  );
  return cleanLine(match?.[1]?.replace(/\u2026\.\.\.more\s*$/i, '').trim());
}

function extractBestSection(body: string, names: readonly string[]): string | undefined {
  for (const name of names) {
    const section = extractSection(body, name);
    if (section && section.length >= 20) return section;
  }
  return undefined;
}

/** Channel / creator + views / plays line under the title (Jina video pages). */
function parseVideoMetaLine(body: string): { channel?: string; metaLine?: string } {
  const patterns = [
    /^##\s+[^\n]+\n+([^\n#]+?\d[\d,]*\s+views[^\n]*)/im,
    /^##\s+[^\n]+\n+([^\n#]+?\d[\d,]*\s+plays[^\n]*)/im,
    /^##\s+[^\n]+\n+([^\n#]+?\d[\d,]*\s+watching[^\n]*)/im,
    /^Channel:\s*(.+)$/im,
    /^Creator:\s*(.+)$/im,
  ];
  for (const re of patterns) {
    const match = body.match(re);
    if (!match) continue;
    const line = cleanLine(match[1]);
    if (!line) continue;
    if (/^channel:/i.test(match[0])) return { channel: line };
    if (/^creator:/i.test(match[0])) return { channel: line };
    const viewsIdx = line.search(/\d[\d,]*\s+(?:views|plays|watching)/i);
    if (viewsIdx <= 0) return { metaLine: line };
    return {
      channel: cleanLine(line.slice(0, viewsIdx)),
      metaLine: cleanLine(line.slice(viewsIdx)),
    };
  }
  return {};
}

function extractTitle(body: string): string | undefined {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return cleanLine(h1[1].replace(SITE_TITLE_SUFFIX, ''));
  const h2 = body.match(/^##\s+(.+)$/m);
  return h2 ? cleanLine(h2[1].replace(SITE_TITLE_SUFFIX, '')) : undefined;
}

/**
 * Normalize Jina or tab markdown for a video watch page into structured
 * title / channel / description / transcript sections the AI can summarize.
 * Works across YouTube, Vimeo, Twitch, and similar hosts when Jina emits
 * standard ## Description / ## Transcript sections or og-derived text.
 */
export function extractVideoStructured(markdown: string): VideoStructuredContent | null {
  const body = stripWrapper(markdown).trim();
  if (!body) return null;

  const title = extractTitle(body);
  const description = extractBestSection(body, ['Description', 'About', 'Synopsis']);
  const transcript = extractSection(body, 'Transcript');
  const meta = parseVideoMetaLine(body);

  if (!title && !description && !transcript) return null;

  return {
    title: title || 'Video',
    channel: meta.channel,
    metaLine: meta.metaLine,
    description,
    transcript,
  };
}

export function formatVideoStructuredMarkdown(content: VideoStructuredContent): string {
  const lines: string[] = [`# ${content.title}`];
  if (content.channel) lines.push(`Channel: ${content.channel}`);
  if (content.metaLine) lines.push(content.metaLine);
  lines.push('');
  if (content.description?.trim()) {
    lines.push('## Description', '', content.description.trim(), '');
  }
  if (content.transcript?.trim()) {
    lines.push('## Transcript', '', content.transcript.trim().slice(0, 12000), '');
  }
  return lines.join('\n').trim();
}

/** Best-effort cleanup of Jina video-page chrome — keep metadata sections. */
export function normalizeVideoMarkdown(markdown: string): string | null {
  const structured = extractVideoStructured(markdown);
  if (!structured) return null;
  const hasBody =
    (structured.description?.length ?? 0) >= 40 ||
    (structured.transcript?.length ?? 0) >= 80;
  if (!hasBody && !structured.channel) return null;
  return formatVideoStructuredMarkdown(structured);
}

/** @deprecated use normalizeVideoMarkdown */
export const normalizeYoutubeMarkdown = normalizeVideoMarkdown;
