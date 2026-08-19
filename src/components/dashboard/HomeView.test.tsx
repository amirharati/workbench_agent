// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

describe('HomeView search scope', () => {
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
  });
});
