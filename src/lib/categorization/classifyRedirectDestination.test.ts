import { describe, expect, it } from 'vitest';
import type { Item } from '../db';
import { buildCategorizationEmbedText } from '../enrichment/categorizationText';
import type { ItemEnrichment } from '../enrichment/types';
import { buildClassifyBatchItem } from './classifyTopicExtract';

const item: Item = {
  id: 'redirected-item',
  url: 'https://short.example/old-path',
  title: 'Old saved landing page',
  collectionIds: ['inbox'],
  tags: [],
  created_at: 1,
  updated_at: 1,
  source: 'bookmark',
};

function enrichment(overrides: Partial<ItemEnrichment> = {}): ItemEnrichment {
  return {
    itemId: item.id,
    normalizedUrl: item.url,
    status: 'ok',
    providerId: 'hybrid',
    attempts: 1,
    summary:
      'A detailed final destination page about Toronto apartment rentals, housing availability, and monthly lease terms.',
    fetchedTitle: 'Toronto apartment rentals and housing',
    hasRawBody: true,
    aiStatus: 'ok',
    pendingFetchReview: true,
    pendingFetchReviewReason: 'url_redirect',
    updated_at: 2,
    ...overrides,
  };
}

describe('redirected final-destination classification input', () => {
  it('uses the fetched title and omits the stale saved host', async () => {
    const result = await buildClassifyBatchItem(item, enrichment());

    expect(result.eligible).toBe(true);
    expect(result.batch?.title).toBe('Toronto apartment rentals and housing');
    expect(result.classifyText).toContain('Title: Toronto apartment rentals and housing');
    expect(result.classifyText).toContain('Toronto apartment rentals');
    expect(result.classifyText).not.toContain('Old saved landing page');
    expect(result.classifyText).not.toContain('Host: short.example');

    const embedInput = buildCategorizationEmbedText(item, enrichment()).text;
    expect(embedInput).toContain('Title: Toronto apartment rentals and housing');
    expect(embedInput).not.toContain('Host: short.example');
  });

  it('keeps the saved host for an ordinary non-redirected page', async () => {
    const result = await buildClassifyBatchItem(
      item,
      enrichment({ pendingFetchReview: false, pendingFetchReviewReason: undefined })
    );

    expect(result.batch?.title).toBe('Old saved landing page');
    expect(result.classifyText).toContain('Host: short.example');
  });
});
