import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE } from '../enrichment/errorMessages';

const reportMocks = vi.hoisted(() => ({
  loadScopedPipelineRows: vi.fn(),
  getItem: vi.fn(async () => undefined),
}));

vi.mock('../db', () => ({
  getDB: vi.fn(async () => ({
    get: reportMocks.getItem,
    objectStoreNames: { contains: () => true },
  })),
}));

vi.mock('./scopedPipelineRows', () => ({
  loadScopedPipelineRows: reportMocks.loadScopedPipelineRows,
}));

describe('buildEnrichOutcomeReportRows', () => {
  beforeEach(() => {
    reportMocks.loadScopedPipelineRows.mockReset();
    reportMocks.getItem.mockClear();
  });

  it('uses the authoritative completion snapshot on the first attempt', async () => {
    reportMocks.loadScopedPipelineRows.mockResolvedValue({
      items: [{ id: 'item-1', title: 'Example', url: 'https://example.com' }],
      enrichByItem: new Map([['item-1', {
        itemId: 'item-1',
        normalizedUrl: 'https://example.com',
        status: 'ok',
        providerId: 'test-fetch',
        attempts: 1,
        snippet: 'Fetched text that is available for keyword search.',
        hasRawBody: true,
        aiStatus: 'not_configured',
        updated_at: 1,
      }]]),
      signalByItem: new Map(),
      primaryCategoryByItem: new Map(),
      links: [],
    });

    const { buildEnrichOutcomeReportRows } = await import('./pipelineBatchReport');
    const rows = await buildEnrichOutcomeReportRows(
      ['item-1'],
      { 'item-1': 'Example' },
      { action: 'full_digest', enrichResults: [{ itemId: 'item-1', status: 'ok' }] }
    );

    expect(reportMocks.loadScopedPipelineRows).toHaveBeenCalledWith(
      ['item-1'],
      { authoritative: true }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outcome: 'fetched',
      statusLabel: 'Fetched',
      notice: 'ai_not_configured',
      detail: AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE,
    });
  });
});
