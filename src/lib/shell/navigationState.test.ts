// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('dashboard navigation project history', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('keeps access history separate from the manually ordered project switcher', async () => {
    localStorage.setItem('workbench-navigation-state', JSON.stringify({
      recentProjectIds: ['manual-a', 'manual-b'],
      recentProjectAccessIds: ['recent-c', 'recent-a', 'recent-c', 'recent-b'],
    }));

    const { loadNavigationState } = await import('./navigationState');
    const state = loadNavigationState();

    expect(state.recentProjectIds).toEqual(['manual-a', 'manual-b']);
    expect(state.recentProjectAccessIds).toEqual(['recent-c', 'recent-a', 'recent-b']);
  });

  it('uses the existing switcher as a one-time seed for older saved state', async () => {
    localStorage.setItem('workbench-navigation-state', JSON.stringify({
      recentProjectIds: ['project-b', 'project-a'],
    }));

    const { loadNavigationState } = await import('./navigationState');

    expect(loadNavigationState().recentProjectAccessIds).toEqual(['project-b', 'project-a']);
  });

  it('restores the selected Enrichment and Classification items independently', async () => {
    localStorage.setItem('workbench-navigation-state', JSON.stringify({
      pipelineHub: {
        hubLane: 'categories',
        categoriesSubTab: 'queue',
        enrichmentSelectedItemId: 'enriched-item',
        categoriesSelectedItemId: 'classified-item',
      },
    }));

    const { loadNavigationState } = await import('./navigationState');

    expect(loadNavigationState().pipelineHub.enrichmentSelectedItemId).toBe('enriched-item');
    expect(loadNavigationState().pipelineHub.categoriesSelectedItemId).toBe('classified-item');
  });
});
