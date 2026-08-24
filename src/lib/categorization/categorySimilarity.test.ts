import { describe, expect, it } from 'vitest';
import type { AiCategory } from './types';
import { categorySlug, normalizeCategoryName, rankCategoryNames } from './categorySimilarity';

function category(id: string, name: string, description = ''): AiCategory {
  return {
    id,
    name,
    description,
    kind: 'leaf',
    status: 'approved',
    assignable: true,
    parentId: 'parent',
    parentName: 'Parent',
    created_at: 1,
    updated_at: 1,
  };
}

describe('category similarity', () => {
  it('normalizes punctuation, accents, casing, and ampersands for durable duplicate checks', () => {
    expect(normalizeCategoryName('  Café & Restaurants ')).toBe('cafe and restaurants');
    expect(normalizeCategoryName('CAFE-and-restaurants')).toBe('cafe and restaurants');
    expect(categorySlug('Café & Restaurants')).toBe('cafe-and-restaurants');
  });

  it('blocks exact normalized duplicates and ranks related names without special topic rules', () => {
    const matches = rankCategoryNames(
      'Machine-Learning Infrastructure',
      'Serving and operating ML models',
      [
        category('ml-infra', 'Machine Learning Infrastructure', 'Deploying and serving models.'),
        category('cooking', 'Home cooking', 'Recipes and kitchens.'),
      ]
    );

    expect(matches[0]).toMatchObject({ categoryId: 'ml-infra', exact: true, score: 1 });
    expect(matches.some((match) => match.categoryId === 'cooking')).toBe(false);
  });

  it('ignores deprecated categories in creation guidance', () => {
    const retired = { ...category('old', 'Old category'), status: 'deprecated' as const };
    expect(rankCategoryNames('Old category', '', [retired])).toEqual([]);
  });
});

