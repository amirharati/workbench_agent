import type { AiCategory } from './types';

export type CategoryLexicalMatch = {
  categoryId: string;
  score: number;
  exact: boolean;
};

export function normalizeCategoryName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function categorySlug(value: string): string {
  return normalizeCategoryName(value).replace(/\s+/g, '-').slice(0, 56) || 'category';
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeCategoryName(value).split(' ').filter(Boolean));
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / Math.max(left.size, right.size);
}

/** Fast local duplicate/near-duplicate pass; semantic similarity is blended later. */
export function rankCategoryNames(
  name: string,
  description: string,
  categories: AiCategory[],
  limit = 12
): CategoryLexicalMatch[] {
  const normalizedName = normalizeCategoryName(name);
  if (!normalizedName) return [];
  const draftNameTokens = tokenSet(name);
  const draftAllTokens = tokenSet(`${name} ${description}`);

  return categories
    .filter((category) => category.status !== 'deprecated')
    .map((category) => {
      const normalizedCategory = normalizeCategoryName(category.name);
      const exact = normalizedCategory === normalizedName;
      const nameOverlap = tokenOverlap(draftNameTokens, tokenSet(category.name));
      const contextOverlap = tokenOverlap(
        draftAllTokens,
        tokenSet(`${category.name} ${category.description ?? ''} ${(category.canonicalTags ?? []).join(' ')}`)
      );
      const contains =
        normalizedCategory.includes(normalizedName) || normalizedName.includes(normalizedCategory);
      const score = exact
        ? 1
        : Math.min(0.99, nameOverlap * 0.72 + contextOverlap * 0.2 + (contains ? 0.08 : 0));
      return { categoryId: category.id, score, exact };
    })
    .filter((match) => match.exact || match.score >= 0.18)
    .sort((left, right) => Number(right.exact) - Number(left.exact) || right.score - left.score)
    .slice(0, limit);
}

