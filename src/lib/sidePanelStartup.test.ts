import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbRpc = vi.fn();
vi.mock('./storage/dbClient', () => ({ dbRpc }));

describe('lightweight side-panel startup', () => {
  beforeEach(() => dbRpc.mockReset());

  it('requests only the organization projection', async () => {
    dbRpc.mockResolvedValue({ projects: [{ id: 'p' }], collections: [{ id: 'c' }] });
    const { requestSidePanelStartupProjection } = await import('./sidePanelStartup');
    await expect(requestSidePanelStartupProjection()).resolves.toMatchObject({
      projects: [{ id: 'p' }],
      collections: [{ id: 'c' }],
    });
    expect(dbRpc).toHaveBeenCalledWith('getSidePanelStartupProjection', []);
  });

  it('keeps the side panel out of the full dashboard entry bundle', () => {
    const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
    const dashboard = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const sidePanel = readFileSync(new URL('../SidePanelApp.tsx', import.meta.url), 'utf8');
    const worker = readFileSync(
      new URL('./storage/dbWorker/worker.ts', import.meta.url),
      'utf8'
    );

    expect(main).toContain("? import('./SidePanelApp.tsx')");
    expect(main).toContain(": import('./App.tsx')");
    expect(dashboard).not.toContain('SidePanelConnected');
    expect(sidePanel).toContain('requestSidePanelStartupProjection');
    expect(sidePanel).toContain('items={[]}');

    const handler = worker.slice(
      worker.indexOf("case 'getSidePanelStartupProjection'"),
      worker.indexOf("case 'getPipelineBadgeEntries'")
    );
    expect(handler).toContain('getAllProjects()');
    expect(handler).toContain('getAllCollections()');
    expect(handler).not.toContain('getAllItems()');
    expect(handler).not.toContain('scheduleSimilarityVectorWarm');
  });
});

