import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_STARTUP_IMMEDIATE_KEY,
  createDashboardStartupProjection,
  isDashboardStartupProjection,
  loadImmediateDashboardStartupProjection,
  persistDashboardStartupProjection,
} from './dashboardStartupProjection';
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('keeps workspace identity but excludes full browser tab snapshots', () => {
    const projection = createDashboardStartupProjection({
      revision: 7,
      generatedAt: 20,
      projects: [],
      collections: [],
      workspaces: [{
        id: 'workspace-1',
        name: 'Research session',
        projectId: 'project-1',
        created_at: 10,
        updated_at: 20,
        windows: [{
          id: 'window-1',
          tabs: Array.from({ length: 100 }, (_, index) => ({
            title: `Large tab ${index}`,
            url: `https://example.com/${index}`,
            favIconUrl: `data:image/png;base64,${'x'.repeat(100)}`,
          })),
        }],
      }],
      items: [],
    });

    expect(projection.workspaces).toEqual([{
      id: 'workspace-1',
      name: 'Research session',
      projectId: 'project-1',
      created_at: 10,
      updated_at: 20,
      windows: [],
    }]);
    expect(JSON.stringify(projection)).not.toContain('Large tab');
    expect(JSON.stringify(projection)).not.toContain('data:image');
  });

  it('rejects incompatible persisted shapes', () => {
    expect(isDashboardStartupProjection({ version: 99 })).toBe(false);
    expect(
      isDashboardStartupProjection({
        version: 2,
        revision: 1,
        generatedAt: 1,
        projects: [],
        collections: [],
        workspaces: [],
        items: [],
      })
    ).toBe(true);
  });

  it('writes and synchronously restores the immediate first-paint mirror', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('chrome', {
      storage: { local: {
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      } },
    });
    const projection = createDashboardStartupProjection({
      revision: 8,
      generatedAt: 25,
      projects: [],
      collections: [],
      workspaces: [],
      items: [item()],
    });

    await persistDashboardStartupProjection(projection);

    expect(values.has(DASHBOARD_STARTUP_IMMEDIATE_KEY)).toBe(true);
    expect(loadImmediateDashboardStartupProjection()).toEqual(projection);
  });

  it('drops an incompatible immediate mirror instead of blocking startup', () => {
    const values = new Map<string, string>([[DASHBOARD_STARTUP_IMMEDIATE_KEY, '{"version":99}']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });

    expect(loadImmediateDashboardStartupProjection()).toBeNull();
    expect(values.has(DASHBOARD_STARTUP_IMMEDIATE_KEY)).toBe(false);
  });
});
