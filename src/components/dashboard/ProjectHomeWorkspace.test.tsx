// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Collection, Item, Project, Workspace } from '../../lib/db';
import { projectPageUiKey } from '../../lib/shell/pageUiState';
import { getWorkspaceBrowserUrls, ProjectHomeWorkspace } from './ProjectHomeWorkspace';
import { getHomebaseWorkspaceSessionKey, getProjectSessionWorkspaceKey } from './workspaceSession';

const project: Project = {
  id: 'project-a',
  name: 'Project Alpha',
  isDefault: false,
  created_at: 1,
  updated_at: 1,
};

const collections: Collection[] = Array.from({ length: 6 }, (_, index) => ({
  id: `collection-${index}`,
  name: `Collection ${index}`,
  primaryProjectId: project.id,
  projectIds: [project.id],
  isDefault: false,
  created_at: index + 1,
  updated_at: index + 1,
}));

const items: Item[] = Array.from({ length: 6 }, (_, index) => ({
  id: `item-${index}`,
  url: `https://example.com/${index}`,
  title: `Pinned item ${index}`,
  collectionIds: [collections[index].id],
  tags: [],
  source: 'manual',
  metadata: { projectPins: { [project.id]: index + 1 } },
  created_at: index + 1,
  updated_at: index + 1,
}));

const workspaces: Workspace[] = Array.from({ length: 6 }, (_, index) => ({
  id: `workspace-${index}`,
  name: `Workspace ${index}`,
  projectId: project.id,
  windows: [],
  created_at: index + 1,
  updated_at: index + 1,
}));

describe('ProjectHomeWorkspace browse surfaces', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => localStorage.clear());

  it('opens every URL-capable entry from the active workspace against the full library', () => {
    const outsideProjectItem: Item = {
      ...items[0],
      id: 'item-outside-project',
      url: 'https://example.com/outside-project',
    };

    expect(getWorkspaceBrowserUrls([
      { kind: 'item', id: 'workspace-item', itemId: outsideProjectItem.id, scopeProjectId: 'project-other' },
      { kind: 'url', id: 'workspace-url', url: 'https://example.com/direct' },
      { kind: 'url', id: 'workspace-url-duplicate', url: 'https://example.com/direct' },
      { kind: 'search', id: 'workspace-search', query: 'Does not open in Chrome' },
    ], [outsideProjectItem])).toEqual([
      'https://example.com/outside-project',
      'https://example.com/direct',
    ]);
  });

  it('uses compact context controls and one persistent list/gallery working canvas', () => {
    const markup = renderToStaticMarkup(
      <ProjectHomeWorkspace
        project={project}
        items={items}
        collections={collections}
        selectedCollectionId="all"
        onSelectCollection={vi.fn()}
        sessionTabs={[]}
        onAddItemToSession={vi.fn()}
        onRemoveSessionTab={vi.fn()}
        workspaces={workspaces}
        savedWorkspaceSessions={[]}
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'General' }]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
        onUpdateItem={vi.fn()}
      />
    );

    expect(markup).toContain('data-project-view-tabs="true"');
    expect(markup).toContain('aria-label="Project view"');
    expect(markup).toContain('aria-label="Collection view: Collection 0"');
    expect(markup).toContain('aria-label="Workspace view: General"');
    expect(markup).not.toContain('data-browse-surface="project-workspaces"');
    expect(markup).not.toContain('data-browse-surface="project-pins"');
    expect(markup).not.toContain('data-browse-surface="project-collections"');
    expect(markup).not.toContain('overflow-x:auto');
    expect(markup).not.toContain('Workspace 5');
    expect(markup).not.toContain('Collection 5');
    expect(markup).toContain('Pinned <span');
    expect(markup).toContain(
      'padding:var(--space-lg) var(--page-gutter) var(--page-safe-bottom)'
    );
    expect(markup).toContain('data-project-working-canvas="true"');
    expect(markup).toContain('ui-adaptive-browser');
    expect(markup).toContain('data-detail-open="false"');
    expect(markup).toContain('aria-label="Project material"');
    expect(markup).toContain('aria-label="Gallery view"');
    expect(markup).toContain('All project items');
    expect(markup).not.toContain('data-project-page-footer-content="true"');
  });

  it('keeps a compact Workspace control when General is the only choice', () => {
    const markup = renderToStaticMarkup(
      <ProjectHomeWorkspace
        project={project}
        items={[]}
        collections={[]}
        selectedCollectionId="all"
        onSelectCollection={vi.fn()}
        sessionTabs={[]}
        onAddItemToSession={vi.fn()}
        onRemoveSessionTab={vi.fn()}
        workspaces={[]}
        savedWorkspaceSessions={[]}
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'General' }]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
        onUpdateItem={vi.fn()}
      />
    );

    expect(markup).toContain('General');
    expect(markup).toContain('aria-label="Workspace view: General"');
    expect(markup).not.toContain('Save as workspace');
    expect(markup).not.toContain('data-browse-surface="project-workspaces"');
  });

  it('does not clear the selected collection when browsing all project items', async () => {
    const selectedCollection = collections[1];
    localStorage.setItem(
      projectPageUiKey(project.id, selectedCollection.id),
      JSON.stringify({ selectedItemId: null, selectedSessionTabId: null, browseSource: 'collection' })
    );
    const onSelectCollection = vi.fn();
    const onActivateWorkspaceKey = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <ProjectHomeWorkspace
            project={project}
            items={items}
            collections={collections}
            selectedCollectionId={selectedCollection.id}
            onSelectCollection={onSelectCollection}
            sessionTabs={[]}
            onAddItemToSession={vi.fn()}
            onRemoveSessionTab={vi.fn()}
            workspaces={[]}
            savedWorkspaceSessions={[]}
            activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
            onActivateWorkspaceKey={onActivateWorkspaceKey}
            onActivateWorkspace={vi.fn()}
            onActivateSavedWorkspace={vi.fn()}
            onDeleteSavedWorkspace={vi.fn()}
            workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'General' }]}
            onAddItemToWorkspace={vi.fn()}
            onTransferSessionEntry={vi.fn()}
          />
        );
      });

      const allItemsTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((button) => button.textContent?.includes('All items'));
      await act(async () => allItemsTab?.click());

      expect(onSelectCollection).not.toHaveBeenCalled();
      expect(onActivateWorkspaceKey).not.toHaveBeenCalled();
      expect(host.querySelector(`[aria-label="Collection view: ${selectedCollection.name}"]`)).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('restores the selected project item after reload', () => {
    localStorage.setItem(
      projectPageUiKey(project.id, 'all'),
      JSON.stringify({
        selectedItemId: items[0].id,
        selectedSessionTabId: null,
        browseSource: 'all',
      })
    );

    const markup = renderToStaticMarkup(
      <ProjectHomeWorkspace
        project={project}
        items={items}
        collections={collections}
        selectedCollectionId="all"
        onSelectCollection={vi.fn()}
        sessionTabs={[]}
        onAddItemToSession={vi.fn()}
        onRemoveSessionTab={vi.fn()}
        workspaces={workspaces}
        savedWorkspaceSessions={[]}
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'General' }]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
      />
    );

    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('Pinned item 0');
    expect(markup).toContain('data-detail-open="true"');
    expect(markup).toContain('ui-adaptive-detail-back');
    expect(markup).not.toContain('Select something to work with');
  });

  it('shows the selected workspace name without claiming its list is visible', () => {
    const markup = renderToStaticMarkup(
      <ProjectHomeWorkspace
        project={project}
        items={items.slice(0, 1)}
        collections={collections.slice(0, 1)}
        selectedCollectionId="all"
        onSelectCollection={vi.fn()}
        sessionTabs={[{ kind: 'item', id: 'item-tab', itemId: items[0].id, scopeProjectId: project.id }]}
        onAddItemToSession={vi.fn()}
        onRemoveSessionTab={vi.fn()}
        workspaces={[]}
        savedWorkspaceSessions={[{ id: 'saved-a', name: 'Writing plan', projectId: project.id, createdAt: 1, updatedAt: 1 }]}
        activeWorkspaceKey={getHomebaseWorkspaceSessionKey('saved-a')}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[
          { key: getProjectSessionWorkspaceKey(project.id), label: 'General' },
          { key: getHomebaseWorkspaceSessionKey('saved-a'), label: 'Writing plan' },
        ]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
      />
    );

    expect(markup).toContain('Writing plan');
    expect(markup).toContain('1 item');
    expect(markup).toContain('aria-label="Workspace view: Writing plan"');
    expect(markup).toContain('All project items');
    expect(markup).not.toContain('Open links');
  });

  it('keeps workspace actions outside the project view tab row', () => {
    localStorage.setItem(
      projectPageUiKey(project.id, 'all'),
      JSON.stringify({
        selectedItemId: null,
        selectedSessionTabId: null,
        browseSource: 'workspace',
      })
    );

    const markup = renderToStaticMarkup(
      <ProjectHomeWorkspace
        project={project}
        items={items.slice(0, 1)}
        collections={collections.slice(0, 1)}
        selectedCollectionId="all"
        onSelectCollection={vi.fn()}
        sessionTabs={[{ kind: 'item', id: 'item-tab', itemId: items[0].id, scopeProjectId: project.id }]}
        onAddItemToSession={vi.fn()}
        onRemoveSessionTab={vi.fn()}
        workspaces={[]}
        savedWorkspaceSessions={[]}
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'General' }]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
        onUpdateItem={vi.fn()}
      />
    );

    expect(markup).toContain('data-project-view-tabs="true"');
    expect(markup).toContain('data-project-workspace-actions="true"');
    expect(markup).toContain('role="toolbar" aria-label="Workspace actions"');
    expect(markup.indexOf('data-project-workspace-actions="true"')).toBeGreaterThan(
      markup.indexOf('data-project-view-tabs="true"')
    );
    expect(markup).toContain(`aria-label="Add to favorites: ${items[0].title}"`);
    expect(markup).toContain(`aria-label="Unpin ${items[0].title} from ${project.name}"`);
    expect(markup).toContain('aria-label="Gallery view"');
    expect(markup).toContain('Open all links');
    expect(markup).toContain('Project Alpha · General');
  });

  it('opens the copy or move dialog directly from a workspace row', async () => {
    localStorage.setItem(
      projectPageUiKey(project.id, 'all'),
      JSON.stringify({ selectedItemId: null, selectedSessionTabId: null, browseSource: 'workspace' })
    );
    const tab = { kind: 'item' as const, id: 'item-tab', itemId: items[0].id, scopeProjectId: project.id };
    const targetWorkspaceKey = getHomebaseWorkspaceSessionKey('saved-a');
    const onTransferSessionEntry = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <ProjectHomeWorkspace
            project={project}
            items={items.slice(0, 1)}
            collections={collections.slice(0, 1)}
            selectedCollectionId="all"
            onSelectCollection={vi.fn()}
            sessionTabs={[tab]}
            onAddItemToSession={vi.fn()}
            onRemoveSessionTab={vi.fn()}
            workspaces={[]}
            savedWorkspaceSessions={[{ id: 'saved-a', name: 'Writing plan', projectId: project.id, createdAt: 1, updatedAt: 1 }]}
            activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
            onActivateWorkspace={vi.fn()}
            onActivateSavedWorkspace={vi.fn()}
            onDeleteSavedWorkspace={vi.fn()}
            workspaceDestinations={[
              { key: getProjectSessionWorkspaceKey(project.id), label: 'General' },
              { key: targetWorkspaceKey, label: 'Writing plan' },
            ]}
            onAddItemToWorkspace={vi.fn()}
            onTransferSessionEntry={onTransferSessionEntry}
          />
        );
      });

      const transferButton = host.querySelector<HTMLButtonElement>(`[aria-label="Copy or move ${items[0].title}"]`);
      expect(transferButton).not.toBeNull();
      await act(async () => transferButton?.click());

      const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
      expect(dialog?.textContent).toContain('Copy or move workspace item');
      expect(dialog?.textContent).toContain('Writing plan');
      expect(host.querySelector('[aria-current="true"]')).toBeNull();

      const copyButton = [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
        .find((button) => button.textContent?.trim() === 'Copy');
      await act(async () => copyButton?.click());

      expect(onTransferSessionEntry).toHaveBeenCalledWith(tab, targetWorkspaceKey, 'copy');
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('lets explicit scope navigation override a remembered workspace view', () => {
    localStorage.setItem(
      projectPageUiKey(project.id, collections[0].id),
      JSON.stringify({
        selectedItemId: null,
        selectedSessionTabId: null,
        browseSource: 'workspace',
      })
    );

    const markup = renderToStaticMarkup(
      <ProjectHomeWorkspace
        project={project}
        items={items}
        collections={collections}
        selectedCollectionId={collections[0].id}
        scopeNavigationRevision={1}
        onSelectCollection={vi.fn()}
        sessionTabs={[{ kind: 'item', id: 'item-tab', itemId: items[1].id, scopeProjectId: project.id }]}
        onAddItemToSession={vi.fn()}
        onRemoveSessionTab={vi.fn()}
        workspaces={[]}
        savedWorkspaceSessions={[]}
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'General' }]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
      />
    );

    expect(markup).toContain('Collection 0');
    expect(markup).toContain('Pinned item 0');
    expect(markup).not.toContain('data-project-workspace-actions="true"');
  });

  it('uses the shared compact destination picker when the organization catalog is available', () => {
    localStorage.setItem(
      projectPageUiKey(project.id, 'all'),
      JSON.stringify({ selectedItemId: items[0].id, selectedSessionTabId: null, browseSource: 'all' })
    );
    const markup = renderToStaticMarkup(
      <ProjectHomeWorkspace
        project={project}
        items={items}
        collections={collections}
        selectedCollectionId="all"
        onSelectCollection={vi.fn()}
        sessionTabs={[]}
        onAddItemToSession={vi.fn()}
        onRemoveSessionTab={vi.fn()}
        workspaces={[]}
        savedWorkspaceSessions={[]}
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'General' }]}
        availableWorkspaceDestinations={[
          { key: 'global', projectId: 'all', projectName: 'Global', workspaceName: 'Workspace', path: 'Global / Workspace', kind: 'global', isCurrent: false },
          { key: getProjectSessionWorkspaceKey(project.id), projectId: project.id, projectName: project.name, workspaceName: 'General', path: `${project.name} / General`, kind: 'live', isCurrent: true },
        ]}
        isItemInWorkspace={() => false}
        onAddItemToWorkspaceDestination={vi.fn()}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
      />
    );

    expect(markup).toContain('Add to workspace…');
    expect(markup).not.toContain(`aria-label="Workspace for ${items[0].title}"`);
  });
});
