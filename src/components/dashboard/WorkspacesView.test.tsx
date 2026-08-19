// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
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
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    expect(markup).toContain('Global workspace');
    expect(markup).toContain('Research — General');
    expect(markup).toContain('Research — Writing set');
    expect(markup).toContain('Chrome research');
    expect(markup).toContain('Live browser tabs stay in Tab Commander.');
    expect(markup).toContain('ui-adaptive-browser');
    expect(markup).toContain('data-detail-open="false"');
  });

  it('lets a narrow detail pane return to the workspace browser', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <WorkspacesView
          projects={[project]}
          items={[item]}
          workspaces={[browserWorkspace]}
          homeState={homeState}
          onHomeStateChange={vi.fn()}
        />
      );
    });

    expect(host.querySelector('.ui-adaptive-browser')?.getAttribute('data-detail-open')).toBe('true');
    const back = host.querySelector<HTMLButtonElement>('.ui-adaptive-detail-back');
    expect(back).not.toBeNull();
    await act(async () => back?.click());
    expect(host.querySelector('.ui-adaptive-browser')?.getAttribute('data-detail-open')).toBe('false');

    await act(async () => root.unmount());
    host.remove();
  });

  it('offers clear project-level New and Manage workspace flows', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <WorkspacesView
          projects={[project]}
          items={[item]}
          workspaces={[]}
          homeState={homeState}
          onHomeStateChange={vi.fn()}
        />
      );
    });

    const newWorkspace = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'New workspace');
    expect(newWorkspace).toBeDefined();
    await act(async () => newWorkspace?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Research workspaces');
    expect(dialog?.textContent).toContain('New workspace');
    expect(dialog?.textContent).toContain('Copy entries from the active workspace');
    expect(dialog?.textContent).toContain('General');
    expect(dialog?.textContent).toContain('Writing set');
    expect(dialog?.textContent).not.toContain('Save as workspace');

    await act(async () => root.unmount());
    host.remove();
  });
});
