// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Collection, Item, Project } from '../../lib/db';
import { HomeView } from './HomeView';

vi.mock('../../hooks/usePipelineBadgeMap', () => ({
  usePipelineBadgeMap: () => new Map(),
}));

const projectA: Project = { id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 };
const projectB: Project = { id: 'project-b', name: 'Writing', isDefault: false, created_at: 1, updated_at: 1 };
const collectionA: Collection = { id: 'collection-a', name: 'Sources', primaryProjectId: projectA.id, projectIds: [projectA.id], isDefault: false, created_at: 1, updated_at: 1 };
const collectionB: Collection = { id: 'collection-b', name: 'Drafts', primaryProjectId: projectB.id, projectIds: [projectB.id], isDefault: false, created_at: 1, updated_at: 1 };
const globalResultItem: Item = { id: 'item-b', title: 'Global result', url: 'https://example.com/global', collectionIds: [collectionB.id], tags: [], source: 'manual', created_at: 1, updated_at: 1 };
const projectItem: Item = { id: 'item-a', title: 'Project source', url: 'https://example.com/source', collectionIds: [collectionA.id], tags: [], source: 'manual', created_at: 1, updated_at: 2 };

describe('HomeView search scope', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(async () => {
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('resolves All Library results while Home remains in a project context', () => {
    const librarySearch = {
      state: {
        query: 'global',
        filters: {},
        mode: 'hybrid' as const,
        loading: false,
        error: null,
        result: {
          query: 'global',
          mode: 'hybrid' as const,
          results: [{
            itemId: globalResultItem.id,
            title: globalResultItem.title,
            url: globalResultItem.url,
            domain: 'example.com',
            breakdown: {
              lexical: 1, embedding: 0, category: 0, qualityBoost: 0, freshnessBoost: 0,
              domainBoost: 0, generalPenalty: 0, manualReviewPenalty: 0, baseScore: 1, finalScore: 1,
              matchedTerms: ['global'], matchedCategories: [], candidateSources: ['lexical' as const],
            },
          }],
          totalCandidates: 1,
          matchedCategoryIds: [],
          embeddingPathUsed: false,
          related: { topics: [], tags: [], relatedLinks: [] },
        },
        selectedItemId: globalResultItem.id,
        recentQueries: [],
        indexEmpty: false,
        restoring: false,
      },
      setQuery: vi.fn(),
      setFilters: vi.fn(),
      setMode: vi.fn(),
      setSelectedItemId: vi.fn(),
      runSearch: vi.fn(),
      clearRecentQueries: vi.fn(),
      openSearch: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      <HomeView
        items={[globalResultItem]}
        collections={[collectionA, collectionB]}
        projects={[projectA, projectB]}
        workspaces={[]}
        homeState={{ tabs: [], activeTabId: null, bottomLayout: 'tabs', isSidebarCollapsed: false, homeSection: 'search' }}
        onHomeStateChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onUpdateItem={vi.fn()}
        librarySearch={librarySearch as never}
        scopeProjectId={projectA.id}
        scopeCollectionId="all"
        recentProjectIds={[projectA.id]}
      />
    );

    expect(markup).toContain('Global result');
    expect(markup).toContain('Add to workspace');
    expect(markup).toContain('Organize…');
    expect(markup).toContain('aria-label="Active workspace"');
    expect(markup).toContain('Global workspace');
    expect(markup).toContain('Research — General');
    expect(markup).not.toContain('Writing — General');
    expect(markup).toContain('aria-label="Search companion view"');
  });

  it('switches Search from the active workspace to a browsable collection without navigation', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const setSelectedItemId = vi.fn();
    const librarySearch = {
      state: {
        query: 'global', filters: {}, mode: 'hybrid' as const, loading: false, error: null,
        result: null, selectedItemId: null, recentQueries: [], indexEmpty: false, restoring: false,
      },
      setQuery: vi.fn(), setFilters: vi.fn(), setMode: vi.fn(), setSelectedItemId,
      runSearch: vi.fn(), clearRecentQueries: vi.fn(), openSearch: vi.fn(),
    };

    await act(async () => {
      root.render(
        <HomeView
          items={[projectItem, globalResultItem]}
          collections={[collectionA, collectionB]}
          projects={[projectA, projectB]}
          workspaces={[]}
          homeState={{ tabs: [], activeTabId: null, bottomLayout: 'tabs', isSidebarCollapsed: false, homeSection: 'search' }}
          onHomeStateChange={vi.fn()}
          onSearchQueryChange={vi.fn()}
          librarySearch={librarySearch as never}
          scopeProjectId={projectA.id}
          scopeCollectionId="all"
          recentProjectIds={[projectA.id]}
        />
      );
    });

    const workspaceGalleryButton = host.querySelector<HTMLButtonElement>('.ui-search-companion [aria-label="Gallery view"]');
    await act(async () => workspaceGalleryButton?.click());
    expect(host.querySelector('.ui-search-companion .ui-content-browser__body[data-content-view="gallery"]')).not.toBeNull();

    const companion = host.querySelector<HTMLElement>('.ui-search-companion');
    const divider = host.querySelector<HTMLElement>('[role="separator"][aria-label="Resize Workspace or Collection and Search results"]');
    expect(companion?.style.height).toBe('330px');
    await act(async () => divider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(companion?.style.height).toBe('340px');

    const collectionButton = [...host.querySelectorAll<HTMLButtonElement>('.ui-search-companion__switcher button')]
      .find((button) => button.textContent?.includes('Collection'));
    await act(async () => collectionButton?.click());

    expect(host.querySelector<HTMLSelectElement>('[aria-label="Search companion collection"]')?.value).toBe(collectionA.id);
    expect(host.textContent).toContain('Project source');
    expect(host.querySelector<HTMLInputElement>('input[placeholder="Search your library..."]')?.value).toBe('global');

    await act(async () => host.querySelector<HTMLElement>('[data-content-entry]')?.click());
    expect(setSelectedItemId).toHaveBeenCalledWith(projectItem.id);
  });
});
