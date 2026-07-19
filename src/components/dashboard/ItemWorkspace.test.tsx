// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Collection, Item, Project } from '../../lib/db';
import { ItemWorkspace } from './ItemWorkspace';

const projects: Project[] = [
  { id: 'project-a', name: 'Project Alpha', isDefault: false, created_at: 1, updated_at: 1 },
  { id: 'project-b', name: 'Project Beta', isDefault: false, created_at: 1, updated_at: 1 },
];

const collections: Collection[] = [
  { id: 'collection-a', name: 'Research', primaryProjectId: 'project-a', projectIds: ['project-a'], isDefault: false, created_at: 1, updated_at: 1 },
  { id: 'collection-b', name: 'Reference', primaryProjectId: 'project-b', projectIds: ['project-b'], isDefault: false, created_at: 1, updated_at: 1 },
];

const link: Item = {
  id: 'item-a',
  url: 'https://example.com',
  title: 'Example',
  notes: 'Useful reference',
  collectionIds: ['collection-a'],
  tags: [],
  source: 'manual',
  created_at: 1,
  updated_at: 1,
};

describe('ItemWorkspace', () => {
  it('keeps editing and cross-project organization available outside Focus', () => {
    const markup = renderToStaticMarkup(
      <ItemWorkspace
        item={link}
        projects={projects}
        collections={collections}
        onUpdateItem={vi.fn()}
        onCreateProject={vi.fn()}
        onCreateCollection={vi.fn()}
      />
    );

    expect(markup).toContain('Edit');
    expect(markup).toContain('Add to favorites: Example');
    expect(markup).toContain('Saved in');
    expect(markup).toContain('Project Alpha');
    expect(markup).toContain('Project Beta');
    expect(markup).toContain('Research');
  });
});
