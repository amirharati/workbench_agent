const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my',
  'your', 'our', 'their', 'me', 'him', 'her', 'us', 'them', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'like', 'things',
]);

export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function tokenize(text: string, { dropStopWords = true } = {}): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!dropStopWords) return tokens;
  return tokens.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export function extractDomainHint(query: string): string | undefined {
  const q = query.toLowerCase();
  const fromMatch = q.match(/\b(?:from|on|site)\s+([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\b/);
  if (fromMatch) return fromMatch[1].replace(/^www\./, '');
  const bare = q.match(/\b(github\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|huggingface\.co|arxiv\.org)\b/);
  if (bare) return bare[1];
  const short = q.match(/\bgithub\b|\byoutube\b|\btwitter\b|\bx\b/);
  if (short) {
    const map: Record<string, string> = {
      github: 'github.com',
      youtube: 'youtube.com',
      twitter: 'x.com',
      x: 'x.com',
    };
    return map[short[0]];
  }
  return undefined;
}
