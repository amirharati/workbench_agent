import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbRpc: vi.fn(),
  getDB: vi.fn(),
}));

vi.mock('../storage/dbClient', () => ({
  dbRpc: mocks.dbRpc,
  isDbWorkerProcess: () => false,
}));

vi.mock('../db', () => ({ getDB: mocks.getDB }));

import { loadScopedPipelineRows } from './scopedPipelineRows';

describe('loadScopedPipelineRows', () => {
  beforeEach(() => {
    mocks.dbRpc.mockReset();
    mocks.getDB.mockReset();
  });

  it('uses the DB worker RPC for an authoritative scope, never a partial cache', async () => {
    mocks.dbRpc.mockResolvedValue({
      items: [{ id: 'item-1', url: 'https://example.com', title: 'Persisted bookmark' }],
      enrichment: [{ itemId: 'item-1', status: 'ok', aiStatus: 'ok', summary: 'Persisted AI summary' }],
      signals: [{ itemId: 'item-1', classifyState: 'pending_discover', embedding: [] }],
      links: [{ id: 'link-1', itemId: 'item-1', categoryId: 'topic-general', source: 'ai', isPrimary: true, status: 'accepted' }],
    });

    const rows = await loadScopedPipelineRows(['item-1'], { authoritative: true });

    expect(mocks.dbRpc).toHaveBeenCalledWith(
      'getPipelineSeedRows',
      [['item-1']],
      { priority: 'high' }
    );
    expect(mocks.getDB).not.toHaveBeenCalled();
    expect(rows.items).toHaveLength(1);
    expect(rows.enrichByItem.get('item-1')?.summary).toBe('Persisted AI summary');
    expect(rows.signalByItem.get('item-1')?.classifyState).toBe('pending_discover');
    expect(rows.primaryCategoryByItem.get('item-1')).toBe('topic-general');
  });
});
