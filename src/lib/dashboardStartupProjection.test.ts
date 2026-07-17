import { describe, expect, it } from 'vitest';
import { createDashboardStartupProjection, isDashboardStartupProjection } from './dashboardStartupProjection';
import type { Item } from './db';

const item = (overrides: Partial<Item> = {}): Item => ({
  id: 'item-1',
  url: 'https://example.com',
  title: 'Example',
  collectionIds: ['collection-1'],
  tags: ['large', 'search-only'],
  notes: 'Large note content should not enter the startup cache.',
  placements: {
    'collection-1': { collectionId: 'collection-1', addedAt: 1, source: 'manual' },
  },
  metadata: { projectPins: { 'project-1': 12 }, enrichment: { summary: 'large' } },
  created_at: 10,
  updated_at: 11,
  source: 'manual',
  ...overrides,
});

describe('dashboard startup projection', () => {
  it('keeps Home fields while removing heavy item content and deleted rows', () => {
    const projection = createDashboardStartupProjection({
      revision: 7,
      generatedAt: 20,
      projects: [],
      collections: [],
      workspaces: [],
      items: [item(), item({ id: 'deleted', deletedAt: 15 })],
    });

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      id: 'item-1',
      collectionIds: ['collection-1'],
      tags: [],
      metadata: { projectPins: { 'project-1': 12 } },
    });
    expect(projection.items[0].notes).toBeUndefined();
    expect(projection.items[0].placements).toBeUndefined();
    expect(projection.items[0].metadata?.enrichment).toBeUndefined();
  });

  it('rejects incompatible persisted shapes', () => {
    expect(isDashboardStartupProjection({ version: 99 })).toBe(false);
    expect(
      isDashboardStartupProjection({
        version: 1,
        revision: 1,
        generatedAt: 1,
        projects: [],
        collections: [],
        workspaces: [],
        items: [],
      })
    ).toBe(true);
  });
});
