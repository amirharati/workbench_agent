import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Item, Project, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import { getWorkspaceTabUrl, WorkspacesView } from './WorkspacesView';

const project: Project = { id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 };
const item: Item = { id: 'item-a', title: 'Docs', url: 'https://example.com/docs', collectionIds: [], tags: [], source: 'bookmark', created_at: 1, updated_at: 1 };
const browserWorkspace: Workspace = { id: 'browser-a', name: 'Chrome research', projectId: project.id, created_at: 1, updated_at: 2, windows: [{ id: 'window-a', name: 'Window 1', tabs: [{ title: 'Docs', url: item.url }] }] };
const homeState: GlobalTabState = {
  tabs: [{ kind: 'item', id: 'item-item-a@project:project-a', itemId: item.id, scopeProjectId: project.id }],
  activeTabId: null,
  bottomLayout: 'tabs',
  isSidebarCollapsed: false,
  savedWorkspaceSessions: [{ id: 'saved-a', name: 'Writing set', projectId: project.id, createdAt: 1, updatedAt: 3 }],
  workspaceSessionSnapshots: { 'project-session:project-a': [{ kind: 'item', id: 'live-item', itemId: item.id, scopeProjectId: project.id }], 'homebase-workspace:saved-a': [] },
};

describe('WorkspacesView', () => {
  it('resolves direct URLs for URL-bearing workspace entries only', () => {
    const itemById = new Map([[item.id, item]]);

    expect(getWorkspaceTabUrl(homeState.tabs[0], itemById)).toBe(item.url);
    expect(
      getWorkspaceTabUrl(
        { kind: 'url', id: 'url-a', url: 'https://example.com/direct', scopeProjectId: project.id },
        itemById
      )
    ).toBe('https://example.com/direct');
    expect(
      getWorkspaceTabUrl({ kind: 'search', id: 'search-a', query: 'docs' }, itemById)
    ).toBeNull();
  });

  it('shows project workspaces and browser snapshots as distinct saved-work types', () => {
    const markup = renderToStaticMarkup(
      <WorkspacesView
        projects={[project]}
        items={[item]}
        workspaces={[browserWorkspace]}
        homeState={homeState}
        onHomeStateChange={vi.fn()}
      />
    );

    expect(markup).toContain('Manage Homebase working sets and saved browser snapshots.');
    expect(markup).toContain('Project workspaces');
    expect(markup).toContain('Browser snapshots');
    expect(markup).toContain('Live session');
    expect(markup).toContain('Writing set');
    expect(markup).toContain('Chrome research');
    expect(markup).toContain('Live browser tabs stay in Tab Commander.');
  });
});
