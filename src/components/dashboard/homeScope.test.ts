import { describe, expect, it } from 'vitest';
import type { Collection, Item, Project } from '../../lib/db';
import {
  addProjectToSwitcher,
  getHomeScopeItems,
  getProjectCollections,
  getProjectHomeSummary,
  rememberProjectAccess,
  rememberRecentCollection,
  reorderProjectSwitcher,
} from './homeScope';

const projects: Project[] = [
  { id: 'p1', name: 'One', isDefault: false, created_at: 1, updated_at: 1 },
  { id: 'p2', name: 'Two', isDefault: false, created_at: 1, updated_at: 1 },
];

const collections: Collection[] = [
  { id: 'c1', name: 'First', primaryProjectId: 'p1', projectIds: ['p1'], isDefault: false, created_at: 1, updated_at: 1 },
  { id: 'c2', name: 'Shared', primaryProjectId: 'p2', projectIds: ['p1', 'p2'], isDefault: false, created_at: 1, updated_at: 1 },
];

const items: Item[] = [
  { id: 'i1', title: 'One', url: 'https://one.test', collectionIds: ['c1'], tags: [], created_at: 1, updated_at: 1, source: 'manual' },
  { id: 'i2', title: 'Shared', url: 'https://shared.test', collectionIds: ['c2'], tags: [], created_at: 1, updated_at: 1, source: 'manual' },
  { id: 'i3', title: 'Loose', url: 'https://loose.test', collectionIds: [], tags: [], created_at: 1, updated_at: 1, source: 'manual' },
];

describe('Home project and collection scope', () => {
  it('includes primary and shared collections for a project', () => {
    expect(getProjectCollections(collections, 'p1').map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('filters Home items by project or collection without duplicating shared items', () => {
    expect(getHomeScopeItems(items, collections, 'p1', 'all').map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(getHomeScopeItems(items, collections, 'p1', 'c2').map((i) => i.id)).toEqual(['i2']);
  });

  it('builds project counts for Home project launchers', () => {
    expect(getProjectHomeSummary(projects[0], items, collections)).toMatchObject({
      collectionCount: 2,
      itemCount: 2,
    });
  });

  it('keeps project switcher order stable and appends new projects within the limit', () => {
    expect(addProjectToSwitcher(['p2', 'p1', 'p3'], 'p1')).toEqual(['p2', 'p1', 'p3']);
    expect(addProjectToSwitcher(['p1', 'p2', 'p3', 'p4'], 'p5')).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(addProjectToSwitcher(['p1', 'p2', 'p3', 'p4', 'p5'], 'p6')).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
  });

  it('reorders open project switchers only when both projects exist', () => {
    expect(reorderProjectSwitcher(['p1', 'p2', 'p3'], 'p1', 'p3')).toEqual(['p2', 'p3', 'p1']);
    expect(reorderProjectSwitcher(['p1', 'p2'], 'missing', 'p2')).toEqual(['p1', 'p2']);
  });

  it('tracks project access as a separate newest-first history', () => {
    expect(rememberProjectAccess(['p3', 'p2', 'p1'], 'p2')).toEqual(['p2', 'p3', 'p1']);
    expect(rememberProjectAccess(['p3', 'p2', 'p1'], 'p4', 3)).toEqual(['p4', 'p3', 'p2']);
  });

  it('keeps the same bounded history for collections inside a project', () => {
    expect(rememberRecentCollection(['c2', 'c1'], 'c1')).toEqual(['c1', 'c2']);
  });
});
