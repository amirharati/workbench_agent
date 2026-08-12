import { describe, expect, it } from 'vitest';
import type { Collection, Project } from '../../lib/db';
import {
  getDefaultImportSelection,
  resolveImportDestinationLabel,
  resolveImportReportProcessedIds,
} from './ImportStudioView';

const project: Project = {
  id: 'project-research',
  name: 'Research',
  isDefault: false,
  created_at: 1,
  updated_at: 1,
};

const collection: Collection = {
  id: 'collection-reading',
  name: 'Reading',
  isDefault: false,
  primaryProjectId: project.id,
  projectIds: [project.id],
  created_at: 1,
  updated_at: 1,
};

describe('Import Studio workflow', () => {
  it('selects valid web bookmarks by default and excludes invalid rows', () => {
    const selected = getDefaultImportSelection([
      { url: 'https://example.com' },
      { url: 'not-a-url' },
      { url: ' http://openai.com ' },
    ]);

    expect([...selected]).toEqual([0, 2]);
  });

  it('uses user-facing Inbox, project, and collection destination labels', () => {
    expect(resolveImportDestinationLabel([project], [collection], '', '')).toBe('Inbox / Incoming');
    expect(resolveImportDestinationLabel([project], [collection], project.id, '')).toBe('Research / Unfiled');
    expect(resolveImportDestinationLabel([project], [collection], project.id, collection.id)).toBe('Reading');
  });

  it('reports only checkpoint-final items after a partial pipeline run', () => {
    expect(
      [...resolveImportReportProcessedIds({ completedItemIds: ['done-a', 'done-b'] })]
    ).toEqual(['done-a', 'done-b']);
  });
});
