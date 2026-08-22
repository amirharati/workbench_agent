import { describe, expect, it } from 'vitest';
import { AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE } from '../enrichment/errorMessages';
import type { ItemEnrichment } from '../enrichment/types';
import {
  formatPipelineReportSummaryFromRows,
  resolveEnrichReportOutcome,
} from './pipelineBatchReport';

const fetchedWithoutAi: ItemEnrichment = {
  itemId: 'item-1',
  normalizedUrl: 'https://example.com/article',
  status: 'ok',
  providerId: 'test-fetch',
  fetchedAt: 1,
  attempts: 1,
  snippet: 'Fetched page text remains available to keyword search.',
  hasRawBody: true,
  aiStatus: 'not_configured',
  aiError: 'Missing API key. Add one in Settings > AI.',
  updated_at: 1,
};

describe('missing AI configuration reports', () => {
  it('keeps the successful fetch and explains the skipped AI work', () => {
    const partial = resolveEnrichReportOutcome(
      fetchedWithoutAi,
      false,
      'full_digest'
    );

    expect(partial).toEqual({
      outcome: 'fetched',
      detail: AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE,
    });
  });

  it('puts the actionable message in the single digest summary', () => {
    expect(formatPipelineReportSummaryFromRows([{
      itemId: 'item-1',
      title: 'Example',
      outcome: 'fetched',
      detail: AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE,
      statusLabel: 'Fetched',
      notice: 'ai_not_configured',
    }])).toBe(AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE);
  });
});

describe('AI provider failure reports', () => {
  const fetchedWithProviderFailure: ItemEnrichment = {
    ...fetchedWithoutAi,
    aiStatus: 'api_error',
    aiError: 'AI credits or quota unavailable: Insufficient credits. Add provider credits or change the API key/provider in Settings > AI.',
  };

  it('preserves the fetched outcome and exposes the exact provider failure', () => {
    const partial = resolveEnrichReportOutcome(
      fetchedWithProviderFailure,
      false,
      'full_digest'
    );

    expect(partial.outcome).toBe('fetched');
    expect(partial.detail).toContain('AI credits or quota unavailable');
  });

  it('puts the provider failure in the same-attempt completion summary', () => {
    const detail = 'AI authentication failed: Invalid API key. Check the API key in Settings > AI.';
    expect(formatPipelineReportSummaryFromRows([{
      itemId: 'item-1',
      title: 'Example',
      outcome: 'fetched',
      detail,
      statusLabel: 'Fetched',
      notice: 'ai_backend_error',
    }])).toBe(detail);
  });
});
