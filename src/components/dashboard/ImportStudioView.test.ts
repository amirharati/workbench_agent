import { describe, expect, it } from 'vitest';
import type { Collection, Project } from '../../lib/db';
import {
  getDefaultImportSelection,
  resolveImportDestinationLabel,
  resolveImportProcessingPercent,
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

  it('turns pipeline phases into bounded determinate progress', () => {
    expect(resolveImportProcessingPercent({ phase: 'prep', waveIndex: 0, waveTotal: 2 })).toBe(3);
    expect(resolveImportProcessingPercent({ phase: 'enrich', waveIndex: 0, waveTotal: 2, enrichDone: 5, enrichTotal: 10 })).toBe(38);
    expect(resolveImportProcessingPercent({ phase: 'wave', waveIndex: 1, waveTotal: 2 })).toBe(83);
    expect(resolveImportProcessingPercent({ phase: 'done', waveIndex: 2, waveTotal: 2 })).toBe(100);
  });
});
