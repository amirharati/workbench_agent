import type { AiCategory, CategoryAssignment } from './types';
import { DEFAULT_THRESHOLDS } from './types';

const TAG_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  'c#': 'csharp',
  javascript: 'js',
  typescript: 'ts',
  machinelearning: 'ml',
};

/** Stopwords for naming / tag tokenization (not for embedding input). */
export const STOP = new Set([
  'about', 'after', 'also', 'been', 'from', 'have', 'https', 'http', 'into', 'more',
  'some', 'that', 'their', 'them', 'then', 'there', 'these', 'this', 'title', 'url',
  'with', 'your', 'host', 'notes', 'summary', 'enrichment', 'description', 'channel',
  'quoted', 'points', 'tags', 'snippet', 'key', 'www', 'com', 'org', 'net', 'edu',
  'the', 'and', 'for', 'you', 'are', 'was', 'were', 'can', 'will', 'not', 'but',
  'all', 'any', 'our', 'out', 'how', 'why', 'what', 'when', 'who', 'which', 'use',
  'using', 'used', 'new', 'one', 'two', 'get', 'may', 'more', 'most', 'other',
  'into', 'over', 'such', 'than', 'that', 'this', 'with', 'your', 'from', 'have',
  'has', 'had', 'its', 'here', 'home', 'page', 'read', 'see', 'sign',
  'login', 'welcome', 'click', 'view', 'learn', 'guide', 'documentation', 'docs',
]);

const HOST_LIKE = /^(?:www\d*|[a-z0-9-]+)\.(?:com|org|net|io|app|dev|co|edu|ai)$/i;

function normalizeTag(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/[^a-z0-9+#.-]/g, '');
  if (!t || t.length < 2 || STOP.has(t) || HOST_LIKE.test(t)) return null;
  return TAG_ALIASES[t] ?? t;
}

export function tokenizeForTags(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  return words.filter((w) => !STOP.has(w) && w.length <= 32 && !HOST_LIKE.test(w));
}

export interface CategoryNameMember {
  title?: string;
  aiTags?: string[];
  /** Fallback only (e.g. short summary), not full snippet. */
  text?: string;
}

/** Bootstrap / rename: titles + aiTags first; avoid raw snippet word counts. */
export function nameCategoryFromMembers(
  members: CategoryNameMember[],
  limit = 4
): { name: string; canonicalTags: string[] } {
  const scores = new Map<string, number>();

  const bump = (raw: string, weight: number) => {
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
      const short = (m.text || '').slice(0, 500);
      for (const w of tokenizeForTags(short)) bump(w, 1);
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

export function slugFromTerms(terms: string[]): string {
  const slug = terms.join('-').slice(0, 48) || 'cluster';
  return slug.replace(/[^a-z0-9-]/g, '') || 'cluster';
}

/** @deprecated Use nameCategoryFromMembers — kept for fallback token freq on short text. */
export function topTermsFromTexts(texts: string[], limit = 4): string[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    for (const w of tokenizeForTags(text.slice(0, 500))) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

export function deriveTagsAfterAssignment(
  text: string,
  assignments: CategoryAssignment[],
  categoriesById: Map<string, AiCategory>,
  enrichmentAiTags: string[] | undefined,
  cap = DEFAULT_THRESHOLDS.tagCap
): string[] {
  const scores = new Map<string, number>();

  const bump = (tag: string, weight: number) => {
    const n = normalizeTag(tag);
    if (!n) return;
    scores.set(n, (scores.get(n) ?? 0) + weight);
  };

  for (const a of assignments) {
    const cat = categoriesById.get(a.categoryId);
    if (!cat) continue;
    const w = a.isPrimary ? 3 : 1.5;
    for (const t of cat.canonicalTags ?? []) bump(t, w);
    for (const t of tokenizeForTags(cat.name)) bump(t, w * 0.5);
  }

  for (const t of enrichmentAiTags ?? []) bump(t, 0.75);

  const freq = new Map<string, number>();
  for (const w of tokenizeForTags(text.slice(0, 800))) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  for (const [w, c] of freq) {
    if (c >= 2) bump(w, 1);
    else if (c === 1 && w.length >= 6) bump(w, 0.5);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([t]) => t);
}
