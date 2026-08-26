import { describe, expect, it } from 'vitest';
import type { Collection, Project } from '../../lib/db';
import {
  getDefaultImportPipelineSelection,
  getDefaultImportSelection,
  resolveImportDestinationLabel,
  resolveImportPipelineToastType,
  resolveImportReportProcessedIds,
} from './ImportStudioView';
import type { ItemEnrichment } from '../../lib/enrichment';

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
    expect(resolveImportDestinationLabel([project], [collection], project.id, '')).toBe('Research / Default');
    expect(resolveImportDestinationLabel([project], [collection], project.id, collection.id)).toBe('Reading');
  });

  it('reports only checkpoint-final items after a partial pipeline run', () => {
    expect(
      [...resolveImportReportProcessedIds({ completedItemIds: ['done-a', 'done-b'] })]
    ).toEqual(['done-a', 'done-b']);
  });

  it('does not render a completed mixed bulk import as a red failure', () => {
    expect(resolveImportPipelineToastType({
      enriched: 359,
      fetched: 11,
      classified: 288,
      skipped: 2,
      failed: 90,
      aiError: 'Could not parse AI response as JSON.',
    })).toBe('info');

    expect(resolveImportPipelineToastType({
      enriched: 342,
      fetched: 0,
      classified: 261,
      skipped: 2,
      failed: 115,
    })).toBe('success');
  });

  it('selects new or incomplete imports while skipping completed enrichment by default', () => {
    const complete: ItemEnrichment = {
      itemId: 'existing-complete',
      normalizedUrl: 'https://complete.example/',
      status: 'ok',
      providerId: 'test',
      attempts: 1,
      hasRawBody: true,
      aiStatus: 'ok',
      fetchedAt: 100,
      updated_at: 100,
    };
    const selected = getDefaultImportPipelineSelection(
      [
        { itemId: 'new', url: 'https://new.example/', title: 'New', outcome: 'created' },
        {
          itemId: 'existing-complete',
          url: 'https://complete.example/',
          title: 'Complete',
          outcome: 'merged',
        },
        {
          itemId: 'existing-incomplete',
          url: 'https://incomplete.example/',
          title: 'Incomplete',
          outcome: 'merged',
        },
      ],
      new Map([[complete.itemId, complete]]),
      'missing',
      200
    );

    expect([...selected]).toEqual(['new', 'existing-incomplete']);
  });
});
