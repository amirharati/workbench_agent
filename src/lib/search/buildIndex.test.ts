import { describe, expect, it } from 'vitest';
import type { Item } from '../db';
import type { AiCategory, AiItemCategoryLink } from '../categorization/types';
import { buildSearchIndex } from './buildIndex';
import { hybridSearch } from './hybridSearch';
import { matchesParsedSearchQuery, parseSearchQuery } from './queryLanguage';

const item: Item = {
  id: 'item-1',
  title: 'Trading article',
  url: 'https://example.com/trading',
  collectionIds: [],
  tags: [],
  source: 'manual',
  created_at: 1,
  updated_at: 1,
};

function category(id: string, name: string, parentId: string): AiCategory {
  return {
    id,
    name,
    parentId,
    parentName: parentId === 'link-quality' ? 'Link quality & attention' : 'Finance',
    kind: 'leaf',
    status: 'approved',
    assignable: true,
    created_at: 1,
    updated_at: 1,
  };
}

function link(categoryId: string, isPrimary: boolean): AiItemCategoryLink {
  return {
    id: `link-${categoryId}`,
    itemId: item.id,
    categoryId,
    score: 0.9,
    isPrimary,
    source: 'ai',
    status: 'suggested',
    created_at: 1,
    updated_at: 1,
  };
}

describe('buildSearchIndex topic boundary', () => {
  it('keeps quality diagnostics out of every Search category path', () => {
    const topic = category('trading-strategies', 'Trading strategies', 'finance');
    const redirect = category(
      'seed_url-redirect-mismatch',
      'URL redirect mismatch',
      'link-quality'
    );
    const index = buildSearchIndex({
      items: [item],
      categories: [topic, redirect],
      links: [link(redirect.id, true), link(topic.id, false)],
    });

    expect(index.categories.map((row) => row.id)).toEqual([topic.id]);
    expect(index.documents[0].categoryIds).toEqual([topic.id]);
    expect(index.documents[0].primaryCategoryId).toBe(topic.id);
    expect(index.itemsByCategory.has(redirect.id)).toBe(false);
  });

  it('indexes accepted manual category assignments for exact category search', () => {
    const planning = category('weekly-planning-tools', 'Weekly Planning Tools', 'productivity');
    const manualLink: AiItemCategoryLink = {
      ...link(planning.id, true),
      source: 'manual',
      status: 'accepted',
    };
    const index = buildSearchIndex({
      items: [item],
      categories: [planning],
      links: [manualLink],
    });

    expect(index.documents[0].categoryIds).toEqual([planning.id]);
    expect(index.itemsByCategory.get(planning.id)).toEqual([item.id]);
    expect(matchesParsedSearchQuery(
      index.documents[0],
      parseSearchQuery('category:"Weekly Planning Tools"'),
      index
    )).toBe(true);
    expect(hybridSearch(index, {
      query: 'category:"Weekly Planning Tools"',
      mode: 'lexical-only',
    }).results.map((row) => row.itemId)).toEqual([item.id]);
  });
});
