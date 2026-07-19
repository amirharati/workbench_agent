// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Collection, Item, Project, Workspace } from '../../lib/db';
import { ProjectHomeWorkspace } from './ProjectHomeWorkspace';
import { getProjectSessionWorkspaceKey } from './workspaceSession';

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
        activeWorkspaceKey={getProjectSessionWorkspaceKey(project.id)}
        onActivateWorkspace={vi.fn()}
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
  });
});
