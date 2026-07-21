// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AllLibraryWorkspaceOverview,
  getVisibleProjectSummaries,
  normalizeAllLibraryView,
  type WorkspaceViewGroup,
} from './AllLibraryWorkspaceOverview';
import type { GlobalTab } from './GlobalTabSystem';

const globalSearch: GlobalTab = { kind: 'search', id: 'search-global', query: 'local first', filters: {} };
const projectUrl: GlobalTab = { kind: 'url', id: 'url-project', url: 'https://example.com', title: 'Example', scopeProjectId: 'project-a' };
const groups: WorkspaceViewGroup[] = [
  { key: 'global', title: 'Global workspace', contextLabel: 'All Library', projectId: 'all', tabs: [globalSearch] },
  { key: 'project:project-a', title: 'Research session', contextLabel: 'Project Alpha', projectId: 'project-a', tabs: [projectUrl] },
];

function render(selectedView: string, selectedTab: GlobalTab | null = null, selectedItem: Parameters<typeof AllLibraryWorkspaceOverview>[0]['selectedItem'] = null) {
  return renderToStaticMarkup(
    <AllLibraryWorkspaceOverview
      groups={groups}
      selectedView={selectedView}
      onSelectedViewChange={vi.fn()}
      selectedTab={selectedTab}
      selectedItem={selectedItem}
      initialView={selectedTab ? 'workspace' : selectedItem ? 'quick-access' : 'recent'}
      quickAccessItems={selectedItem ? [selectedItem] : []}
      projectSummaries={[{
        project: { id: 'project-a', name: 'Project Alpha', created_at: 1, updated_at: 1, isDefault: false },
        itemCount: 4,
        collectionCount: 2,
      }]}
      items={[]}
      projects={[{ id: 'project-a', name: 'Project Alpha', created_at: 1, updated_at: 1, isDefault: false }]}
      collections={[]}
      onSelectTab={vi.fn()}
      onRemoveGlobalTab={vi.fn()}
      onFocusTab={vi.fn()}
      onFocusGlobal={vi.fn()}
      onAddItemToGlobal={vi.fn()}
      onViewSearch={vi.fn()}
      onUpdateItem={vi.fn()}
    />
  );
}

describe('AllLibraryWorkspaceOverview', () => {
  it('groups global and project work without exposing destructive controls in the combined lens', () => {
    const markup = renderToStaticMarkup(
      <AllLibraryWorkspaceOverview
        groups={groups}
        selectedView="all-active"
        onSelectedViewChange={vi.fn()}
        selectedTab={null}
        selectedItem={null}
        initialView="workspace"
        items={[]}
        projects={[{ id: 'project-a', name: 'Project Alpha', created_at: 1, updated_at: 1, isDefault: false }]}
        collections={[]}
        onSelectTab={vi.fn()}
        onRemoveGlobalTab={vi.fn()}
        onFocusTab={vi.fn()}
        onFocusGlobal={vi.fn()}
        onAddItemToGlobal={vi.fn()}
        onViewSearch={vi.fn()}
      />
    );

    expect(markup).toContain('Global workspace');
    expect(markup).toContain('Research session');
    expect(markup).toContain('Project Alpha');
    expect(markup).not.toContain('Remove local first from workspace');
    expect(markup).not.toContain('Remove Example from workspace');
  });

  it('previews a saved search before opening its results', () => {
    const markup = render('global', globalSearch);

    expect(markup).toContain('Saved search · All Library');
    expect(markup).toContain('View results');
    expect(markup).toContain('Focus');
    expect(markup).not.toContain('overflow-x:auto');
    expect(markup).toContain('data-all-library-working-canvas="true"');
    expect(markup).toContain('ui-adaptive-browser');
    expect(markup).toContain('data-detail-open="true"');
    expect(markup).toContain('ui-adaptive-detail-back');
    expect(markup).toContain('overflow-y:auto');
  });

  it('offers the global favorite action in item preview', () => {
    const markup = render('global', null, {
      id: 'note-a',
      url: '',
      title: 'Preview note',
      collectionIds: [],
      tags: [],
      source: 'manual',
      created_at: 1,
      updated_at: 1,
    });

    expect(markup).toContain('Add to favorites: Preview note');
  });

  it('separates project navigation from selectable library material', () => {
    const markup = renderToStaticMarkup(
      <AllLibraryWorkspaceOverview
        groups={groups}
        selectedView="global"
        onSelectedViewChange={vi.fn()}
        selectedTab={globalSearch}
        selectedItem={null}
        initialView="recent"
        items={[]}
        projects={[{ id: 'project-a', name: 'Project Alpha', created_at: 1, updated_at: 1, isDefault: false }]}
        projectSummaries={[{
          project: { id: 'project-a', name: 'Project Alpha', created_at: 1, updated_at: 1, isDefault: false },
          itemCount: 4,
          collectionCount: 2,
        }]}
        recentProjectAccessIds={['project-a']}
        collections={[]}
        onSelectTab={vi.fn()}
        onRemoveGlobalTab={vi.fn()}
        onFocusTab={vi.fn()}
        onFocusGlobal={vi.fn()}
        onAddItemToGlobal={vi.fn()}
        onViewSearch={vi.fn()}
      />
    );

    expect(markup).toContain('aria-label="All Library view"');
    expect(markup).toContain('Open a project');
    expect(markup).toContain('aria-label="Project navigation"');
    expect(markup).toContain('aria-label="Search projects"');
    expect(markup).toContain('aria-label="Filter projects"');
    expect(markup).toContain('aria-label="Open Project Alpha"');
    const host = document.createElement('div');
    host.innerHTML = markup;
    const materialTabs = host.querySelector('[data-all-library-view-tabs]');
    expect(materialTabs?.textContent).toContain('Recent');
    expect(materialTabs?.textContent).toContain('Favorites & pins');
    expect(materialTabs?.textContent).toContain('Workspace');
    expect(materialTabs?.textContent).not.toContain('Projects');
    expect(markup).not.toContain('Saved search · All Library');
  });

  it('normalizes the former Projects material view to Recent', () => {
    expect(normalizeAllLibraryView('projects')).toBe('recent');
    expect(normalizeAllLibraryView('workspace')).toBe('workspace');
  });

  it('keeps All stable, orders Recent by access, and searches across every project', () => {
    const projectSummaries = [
      {
        project: { id: 'project-a', name: 'Alpha', description: 'First topic', created_at: 1, updated_at: 3, isDefault: false },
        itemCount: 4,
        collectionCount: 2,
      },
      {
        project: { id: 'project-b', name: 'Beta', description: 'Second topic', created_at: 2, updated_at: 2, isDefault: false },
        itemCount: 2,
        collectionCount: 1,
      },
      {
        project: { id: 'project-c', name: 'Gamma', description: 'Research archive', created_at: 3, updated_at: 1, isDefault: false },
        itemCount: 8,
        collectionCount: 3,
      },
    ];

    expect(getVisibleProjectSummaries(projectSummaries, ['project-c', 'project-a'], 'all', '').map(({ project }) => project.id))
      .toEqual(['project-a', 'project-b', 'project-c']);
    expect(getVisibleProjectSummaries(projectSummaries, ['project-c', 'project-a'], 'recent', '').map(({ project }) => project.id))
      .toEqual(['project-c', 'project-a']);
    expect(getVisibleProjectSummaries(projectSummaries, ['project-a'], 'recent', 'research').map(({ project }) => project.id))
      .toEqual(['project-c']);
  });
});
