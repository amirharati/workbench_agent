import { describe, expect, it } from 'vitest';
import type { ItemEnrichment } from '../enrichment/types';
import {
  enrichmentTimestamp,
  isCompleteAiEnrichment,
  shouldProcessImportedBookmark,
} from './importProcessingPolicy';

const NOW = Date.UTC(2026, 7, 12);
const DAY_MS = 24 * 60 * 60 * 1000;

function enrichment(overrides: Partial<ItemEnrichment> = {}): ItemEnrichment {
  return {
    itemId: 'item-1',
    normalizedUrl: 'https://example.com/',
    status: 'ok',
    providerId: 'test',
    attempts: 1,
    hasRawBody: true,
    aiStatus: 'ok',
    fetchedAt: NOW - 5 * DAY_MS,
    updated_at: NOW - 5 * DAY_MS,
    ...overrides,
  };
}

describe('Import Studio enrichment refresh policy', () => {
  it('processes missing, failed, and AI-incomplete enrichment', () => {
    expect(shouldProcessImportedBookmark(undefined, 'missing', NOW)).toBe(true);
    expect(shouldProcessImportedBookmark(enrichment({ status: 'failed' }), 'missing', NOW)).toBe(true);
    expect(shouldProcessImportedBookmark(enrichment({ aiStatus: 'api_error' }), 'missing', NOW)).toBe(true);
  });

  it('skips complete enrichment without an age limit by default', () => {
    expect(isCompleteAiEnrichment(enrichment())).toBe(true);
    expect(shouldProcessImportedBookmark(enrichment(), 'missing', NOW)).toBe(false);
  });

  it('selects only complete enrichment older than the chosen limit', () => {
    expect(shouldProcessImportedBookmark(enrichment(), 'older-than-7-days', NOW)).toBe(false);
    expect(
      shouldProcessImportedBookmark(
        enrichment({ fetchedAt: NOW - 31 * DAY_MS, updated_at: NOW - 31 * DAY_MS }),
        'older-than-30-days',
        NOW
      )
    ).toBe(true);
  });

  it('uses the newest stored enrichment timestamp and supports explicit reprocessing', () => {
    const row = enrichment({ fetchedAt: NOW - 40 * DAY_MS, aiAt: NOW - 2 * DAY_MS });
    expect(enrichmentTimestamp(row)).toBe(NOW - 2 * DAY_MS);
    expect(shouldProcessImportedBookmark(row, 'older-than-30-days', NOW)).toBe(false);
    expect(shouldProcessImportedBookmark(row, 'all', NOW)).toBe(true);
  });
});
