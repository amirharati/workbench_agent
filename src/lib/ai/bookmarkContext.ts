import type { Item } from '../db';

export interface BookmarkAISource {
  ref: string;
  id: string;
  title: string;
  url: string;
}

const trimText = (value: string | undefined, maxLen: number): string => {
  const clean = (value || '').trim();
  if (!clean) return '';
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen)}...`;
};

export const buildBookmarkGroundingPrompt = (
  userQuery: string,
  items: Item[],
  maxItems = 20
): { prompt: string; sources: BookmarkAISource[] } => {
  const picked = items
    .filter((item) => item.url && item.url.trim())
    .slice(0, maxItems);

  const sources: BookmarkAISource[] = picked.map((item, index) => ({
    ref: `B${index + 1}`,
    id: item.id,
    title: item.title || 'Untitled',
    url: item.url || '',
  }));

  const contextLines = picked
    .map((item, index) => {
      const ref = `B${index + 1}`;
      const title = trimText(item.title || 'Untitled', 160);
      const url = trimText(item.url || '', 260);
      const notes = trimText(item.notes, 420);
      const tags = (item.tags || []).slice(0, 8).join(', ');
      return [
        `[${ref}]`,
        `title: ${title}`,
        `url: ${url}`,
        notes ? `notes: ${notes}` : '',
        tags ? `tags: ${tags}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const prompt = [
    'You are helping with bookmark triage and research.',
    'Answer only using the bookmark context below and cite source refs like [B1], [B2].',
    'If context is insufficient, say what is missing.',
    '',
    `User question: ${userQuery.trim()}`,
    '',
    'Bookmark context:',
    contextLines || '(no bookmark context available)',
  ].join('\n');

  return { prompt, sources };
};
