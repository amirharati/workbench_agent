const TAG_ALIASES = { 'c++': 'cpp', 'c#': 'csharp', javascript: 'js', typescript: 'ts' };
const STOP = new Set([
  'about', 'after', 'also', 'been', 'from', 'have', 'https', 'http', 'into', 'more',
  'some', 'that', 'their', 'them', 'then', 'there', 'these', 'this', 'title', 'url',
  'with', 'your', 'host', 'notes', 'summary', 'enrichment', 'description', 'channel',
  'quoted', 'points', 'tags', 'snippet', 'key', 'www', 'com', 'org', 'net', 'edu',
  'the', 'and', 'for', 'you', 'are', 'was', 'were', 'can', 'will', 'not', 'but',
  'all', 'any', 'our', 'out', 'how', 'why', 'what', 'when', 'who', 'which', 'use',
  'using', 'used', 'new', 'one', 'get', 'may', 'most', 'other', 'over', 'such', 'than',
  'its', 'here', 'home', 'page', 'read', 'see', 'sign', 'login', 'welcome', 'click',
  'view', 'learn', 'guide', 'documentation', 'docs',
]);
const HOST_LIKE = /^(?:www\d*|[a-z0-9-]+)\.(?:com|org|net|io|app|dev|co|edu|ai)$/i;

function normalizeTag(raw) {
  const t = raw.trim().toLowerCase().replace(/[^a-z0-9+#.-]/g, '');
  if (!t || t.length < 2 || STOP.has(t) || HOST_LIKE.test(t)) return null;
  return TAG_ALIASES[t] ?? t;
}

function tokenizeForTags(text) {
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  return words.filter((w) => !STOP.has(w) && w.length <= 32 && !HOST_LIKE.test(w));
}

export function nameCategoryFromMembers(members, limit = 4) {
  const scores = new Map();
  const bump = (raw, weight) => {
    const n = normalizeTag(raw);
    if (!n) return;
    scores.set(n, (scores.get(n) ?? 0) + weight);
  };

  for (const m of members) {
    if (m.title?.trim()) {
      for (const w of tokenizeForTags(m.title)) bump(w, 4);
    }
    for (const t of m.aiTags ?? []) bump(t, 5);
  }

  if (scores.size < 2) {
    for (const m of members) {
      for (const w of tokenizeForTags((m.text || '').slice(0, 500))) bump(w, 1);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const canonicalTags = ranked.map(([t]) => t);
  const name =
    canonicalTags.length >= 2
      ? canonicalTags.slice(0, 3).join(' / ')
      : canonicalTags[0] || 'Topic cluster';

  return { name, canonicalTags };
}

export function slugFromTerms(terms) {
  const slug = terms.join('-').slice(0, 48) || 'cluster';
  return slug.replace(/[^a-z0-9-]/g, '') || 'cluster';
}

export { normalizeTag, tokenizeForTags, STOP };
