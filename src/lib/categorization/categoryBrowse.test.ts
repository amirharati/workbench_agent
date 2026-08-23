import { describe, expect, it } from 'vitest';
import { buildCategoryBrowseGroups } from './categoryBrowse';
import type { AiCategory, AiItemCategoryLink } from './types';

function category(overrides: Partial<AiCategory> & Pick<AiCategory, 'id' | 'name' | 'kind'>): AiCategory {
  return {
    status: 'approved',
    assignable: overrides.kind === 'leaf',
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function link(itemId: string, categoryId: string, status: AiItemCategoryLink['status'] = 'suggested'): AiItemCategoryLink {
  return {
    id: `${itemId}-${categoryId}`,
    itemId,
    categoryId,
    score: 0.9,
    isPrimary: true,
    source: 'ai',
    status,
    created_at: 1,
    updated_at: 1,
  };
}

describe('category browse grouping', () => {
  it('groups leaves by parent, deduplicates members, and ignores rejected links', () => {
    const groups = buildCategoryBrowseGroups({
      categories: [
        category({ id: 'finance', name: 'Finance', kind: 'parent', source: 'seed' }),
        category({ id: 'investing', name: 'Investing', kind: 'leaf', parentId: 'finance' }),
        category({ id: 'trading', name: 'Trading', kind: 'leaf', parentId: 'finance' }),
        category({ id: 'orphan', name: 'Research', kind: 'leaf' }),
      ],
      links: [
        link('one', 'investing'),
        link('one', 'investing'),
        link('two', 'investing'),
        link('three', 'trading'),
        link('four', 'trading', 'rejected'),
      ],
    });

    expect(groups[0].name).toBe('Finance');
    expect(groups[0].category?.source).toBe('seed');
    expect(groups[0].leaves.map((leaf) => [leaf.category.name, leaf.itemIds])).toEqual([
      ['Investing', ['one', 'two']],
      ['Trading', ['three']],
    ]);
    expect(groups[1]).toMatchObject({ name: 'Other topics' });
  });
});
