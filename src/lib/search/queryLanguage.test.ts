import { describe, expect, it } from 'vitest';
import type { SearchDocument } from './types';
import {
  describeParsedSearchQuery,
  matchesParsedSearchQuery,
  parseSearchQuery,
} from './queryLanguage';

function document(overrides: Partial<SearchDocument> = {}): SearchDocument {
  return {
    itemId: 'item-1',
    title: 'Machine learning systems for quantitative trading',
    url: 'https://research.example.com/ml-trading',
    domain: 'research.example.com',
    notes: '',
    tags: ['finance'],
    summary: 'Practical ML signals for markets',
    keyPoints: [],
    updatedAt: 1,
    createdAt: 1,
    collectionIds: [],
    projectIds: [],
    categoryIds: [],
    categoryScores: {},
    hasQualityEnrichment: true,
    ...overrides,
  };
}

describe('Google-like search query language', () => {
  it('treats plain long queries as AND while dropping connector stop words', () => {
    const parsed = parseSearchQuery('ml in trading');
    expect(parsed.clauses).toEqual([{ atoms: [
      { kind: 'term', value: 'ml' },
      { kind: 'term', value: 'trading' },
    ] }]);
    expect(matchesParsedSearchQuery(document(), parsed)).toBe(true);
    expect(matchesParsedSearchQuery(document({ title: 'Trading systems', summary: '', url: 'https://example.com/trading' }), parsed)).toBe(false);
    expect(matchesParsedSearchQuery(document({ title: 'ML engineering', summary: '', url: 'https://example.com/ml' }), parsed)).toBe(false);
    expect(describeParsedSearchQuery(parsed)).toBe('All: ml + trading');
  });

  it('supports exact phrases across long normalized text', () => {
    const parsed = parseSearchQuery('"machine learning systems for quantitative trading"');
    expect(matchesParsedSearchQuery(document(), parsed)).toBe(true);
    expect(matchesParsedSearchQuery(document({ title: 'Machine learning for quantitative trading systems' }), parsed)).toBe(false);
    expect(matchesParsedSearchQuery(document(), parseSearchQuery('“machine learning systems”'))).toBe(true);
  });

  it('supports explicit OR groups and explicit AND/plus syntax', () => {
    const parsed = parseSearchQuery('ai AND +quant OR "machine learning"');
    expect(parsed.clauses).toEqual([
      { atoms: [{ kind: 'term', value: 'ai' }, { kind: 'term', value: 'quant' }] },
      { atoms: [{ kind: 'phrase', value: 'machine learning' }] },
    ]);
    expect(matchesParsedSearchQuery(document(), parsed)).toBe(true);
    expect(matchesParsedSearchQuery(document({ title: 'AI tools for quant research' }), parsed)).toBe(true);
    expect(matchesParsedSearchQuery(document({ title: 'AI tools', summary: '' }), parsed)).toBe(false);
  });

  it('supports exclusions, site restrictions, and comma separators', () => {
    const parsed = parseSearchQuery('ml, trading -beginner site:example.com');
    expect(matchesParsedSearchQuery(document(), parsed)).toBe(true);
    expect(matchesParsedSearchQuery(document({ tags: ['beginner'] }), parsed)).toBe(false);
    expect(matchesParsedSearchQuery(document({ domain: 'example.net' }), parsed)).toBe(false);
  });
});
