const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'by', 'from', 'at',
]);

export function normalizeTag(tag: string): string | null {
  const t = tag.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-');
  if (!t || t.length < 2) return null;
  return t.slice(0, 48);
}

export function slugFromTerms(terms: string[]): string {
  const words = terms
    .flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/))
    .filter((w) => w.length > 2 && !STOP.has(w));
  return words.slice(0, 4).join('-') || 'topic';
}

export function buildProposalKey(name: string, canonicalTags?: string[]): string {
  const slug = slugFromTerms(canonicalTags?.length ? canonicalTags : [name.toLowerCase()]);
  return `${name.toLowerCase()}::${slug}`;
}
