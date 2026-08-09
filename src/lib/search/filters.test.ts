import { describe, expect, it } from 'vitest';
import { applySearchFilters } from './filters';
import type { SearchDocument } from './types';

function document(
  itemId: string,
  projectIds: string[],
  collectionIds: string[]
): SearchDocument {
  return {
    itemId,
    title: itemId,
    url: `https://example.com/${itemId}`,
    domain: 'example.com',
    notes: '',
    tags: [],
    summary: '',
    keyPoints: [],
    updatedAt: 1,
    createdAt: 1,
    collectionIds,
    projectIds,
    categoryIds: [],
    categoryScores: {},
    hasQualityEnrichment: false,
  };
}

describe('applySearchFilters organization exclusions', () => {
  const documents = [
    document('research-reading', ['research'], ['reading']),
    document('research-drafts', ['research'], ['drafts']),
    document('writing', ['writing'], ['writing-inbox']),
  ];

  it('returns only items not already in the selected project', () => {
    expect(
      applySearchFilters(documents, { excludeProjectId: 'research' }).map((row) => row.itemId)
    ).toEqual(['writing']);
  });

  it('can exclude one collection while retaining other items in its project', () => {
    expect(
      applySearchFilters(documents, { excludeCollectionId: 'reading' }).map((row) => row.itemId)
    ).toEqual(['research-drafts', 'writing']);
  });
});
