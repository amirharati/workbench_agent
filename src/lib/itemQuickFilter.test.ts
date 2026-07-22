import { describe, expect, it } from 'vitest';
import type { Collection, Item, Project } from './db';
import { buildItemQuickFilterText, matchesQuickFilter } from './itemQuickFilter';

const project: Project = {
  id: 'project-research',
  name: 'Research Lab',
  description: 'Long-term architecture work',
  isDefault: false,
  created_at: 1,
  updated_at: 1,
};

const collection: Collection = {
  id: 'collection-reading',
  name: 'Reading Queue',
  primaryProjectId: project.id,
  projectIds: [project.id],
  isDefault: false,
  created_at: 1,
  updated_at: 1,
};

const item: Item = {
  id: 'item-architecture',
  title: 'Distributed systems',
  url: 'https://example.com/papers/event-sourcing',
  notes: 'Compare this with the CQRS draft.',
  tags: ['Backend', 'Résumé'],
  collectionIds: [collection.id],
  placements: {
    [collection.id]: {
      collectionId: collection.id,
      notes: 'Discuss during design review',
      tags: ['Follow-up'],
      addedAt: 1,
      source: 'manual',
    },
  },
  metadata: {
    pipelineStatus: 'enriched',
    classification: { topic: 'Software Architecture' },
  },
  source: 'bookmark',
  created_at: 1,
  updated_at: 2,
};

describe('item quick filtering', () => {
  it('indexes visible, organizational, placement, and nested metadata fields', () => {
    const searchText = buildItemQuickFilterText(item, [project], [collection]);

    expect(matchesQuickFilter(searchText, 'distributed event-sourcing')).toBe(true);
    expect(matchesQuickFilter(searchText, 'research reading')).toBe(true);
    expect(matchesQuickFilter(searchText, 'design follow-up')).toBe(true);
    expect(matchesQuickFilter(searchText, 'enriched architecture')).toBe(true);
    expect(matchesQuickFilter(searchText, 'resume backend')).toBe(true);
    expect(matchesQuickFilter(searchText, 'cooking')).toBe(false);
  });
});
