// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Collection, Item, Project, Workspace } from '../../lib/db';
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
  it('uses bounded vertical lists for workspaces, project pins, and collections', () => {
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
        onFocusSession={vi.fn()}
        onOpenSearch={vi.fn()}
        workspaces={workspaces}
        savedWorkspaceSessions={[]}
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onSaveWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'Live session' }]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
        onUpdateItem={vi.fn()}
      />
    );

    expect(markup).toContain('data-browse-surface="project-workspaces"');
    expect(markup).toContain('data-browse-surface="project-pins"');
    expect(markup).toContain('data-browse-surface="project-collections"');
    expect(markup.match(/overflow-y:auto/g)?.length).toBeGreaterThanOrEqual(3);
    expect(markup).not.toContain('overflow-x:auto');
    expect(markup).toContain('Workspace 5');
    expect(markup).toContain('Pinned item 5');
    expect(markup).toContain('Collection 5');
    expect(markup).toContain('Add to favorites: Pinned item 5');
    expect(markup).toContain('padding:24px 24px 72px');
    expect(markup).toContain('data-project-page-footer-content="true"');
    expect(markup).toContain('margin:0 auto 64px');
  });

  it('hides the redundant switcher until a saved workspace exists', () => {
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
        onFocusSession={vi.fn()}
        onOpenSearch={vi.fn()}
        workspaces={[]}
        savedWorkspaceSessions={[]}
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onSaveWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[{ key: getProjectSessionWorkspaceKey(project.id), label: 'Live session' }]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
      />
    );

    expect(markup).toContain('Save as workspace');
    expect(markup).toContain('Live session');
    expect(markup).not.toContain('data-browse-surface="project-workspaces"');
  });

  it('shows a named Homebase workspace as the active generic working set', () => {
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
        onFocusSession={vi.fn()}
        onOpenSearch={vi.fn()}
        workspaces={[]}
        savedWorkspaceSessions={[{ id: 'saved-a', name: 'Writing plan', projectId: project.id, createdAt: 1, updatedAt: 1 }]}
        activeWorkspaceKey={getHomebaseWorkspaceSessionKey('saved-a')}
        onActivateWorkspace={vi.fn()}
        onActivateSavedWorkspace={vi.fn()}
        onSaveWorkspace={vi.fn()}
        onDeleteSavedWorkspace={vi.fn()}
        workspaceDestinations={[
          { key: getProjectSessionWorkspaceKey(project.id), label: 'Live session' },
          { key: getHomebaseWorkspaceSessionKey('saved-a'), label: 'Writing plan' },
        ]}
        onAddItemToWorkspace={vi.fn()}
        onTransferSessionEntry={vi.fn()}
      />
    );

    expect(markup).toContain('Writing plan');
    expect(markup).toContain('1 active item');
    expect(markup).toContain('Open links');
  });
});
