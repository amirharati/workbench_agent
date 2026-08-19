// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Collection, Item, Project, Workspace } from '../../lib/db';
import { projectPageUiKey } from '../../lib/shell/pageUiState';
import { ProjectHomeWorkspace } from './ProjectHomeWorkspace';
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
  afterEach(() => localStorage.clear());

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
    expect(markup).toContain('aria-label="Collection view"');
    expect(markup).toContain('aria-label="Workspace view"');
    expect(markup).not.toContain('data-browse-surface="project-workspaces"');
    expect(markup).not.toContain('data-browse-surface="project-pins"');
    expect(markup).not.toContain('data-browse-surface="project-collections"');
    expect(markup).not.toContain('overflow-x:auto');
    expect(markup).not.toContain('Workspace 5');
    expect(markup).toContain('Collection 5');
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
      />
    );

    expect(markup).toContain('General');
    expect(markup).toContain('aria-label="Workspace view"');
    expect(markup).not.toContain('Save as workspace');
    expect(markup).not.toContain('data-browse-surface="project-workspaces"');
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
    expect(markup).toContain('aria-label="Workspace view"');
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
      />
    );

    expect(markup).toContain('data-project-view-tabs="true"');
    expect(markup).toContain('data-project-workspace-actions="true"');
    expect(markup).toContain('role="toolbar" aria-label="Workspace actions"');
    expect(markup.indexOf('data-project-workspace-actions="true"')).toBeGreaterThan(
      markup.indexOf('data-project-view-tabs="true"')
    );
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
