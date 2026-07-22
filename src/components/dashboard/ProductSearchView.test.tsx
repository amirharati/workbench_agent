// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Collection, Item, Project } from '../../lib/db';
import { ProductSearchView } from './ProductSearchView';

vi.mock('../../hooks/usePipelineBadgeMap', () => ({
  usePipelineBadgeMap: () => new Map(),
}));

const project: Project = { id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 };
const collection: Collection = { id: 'collection-a', name: 'Reading', primaryProjectId: project.id, projectIds: [project.id], isDefault: false, created_at: 1, updated_at: 1 };
const otherProject: Project = { id: 'project-b', name: 'Writing', isDefault: false, created_at: 1, updated_at: 1 };
const otherCollection: Collection = { id: 'collection-b', name: 'Drafts', primaryProjectId: otherProject.id, projectIds: [otherProject.id], isDefault: false, created_at: 1, updated_at: 1 };
const item: Item = { id: 'item-a', title: 'Python guide', url: 'https://example.com/python', collectionIds: [collection.id], tags: [], source: 'manual', created_at: 1, updated_at: 1 };

const resultState = {
  query: 'python',
  filters: {},
  mode: 'hybrid' as const,
  loading: false,
  error: null,
  result: {
    query: 'python',
    mode: 'hybrid' as const,
    results: [{
      itemId: item.id,
      title: item.title,
      url: item.url,
      domain: 'example.com',
      breakdown: {
        lexical: 1,
        embedding: 0,
        category: 0,
        qualityBoost: 0,
        freshnessBoost: 0,
        domainBoost: 0,
        generalPenalty: 0,
        manualReviewPenalty: 0,
        baseScore: 1,
        finalScore: 1,
        matchedTerms: ['python'],
        matchedCategories: [],
        candidateSources: ['lexical' as const],
      },
    }],
    totalCandidates: 1,
    matchedCategoryIds: [],
    embeddingPathUsed: false,
    related: { topics: [], tags: [], relatedLinks: [] },
  },
  selectedItemId: item.id,
  recentQueries: [],
  indexEmpty: false,
  restoring: false,
};

describe('ProductSearchView empty state', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  it('keeps recent-search discovery inside Search', () => {
    const markup = renderToStaticMarkup(
      <ProductSearchView
        items={[]}
        collections={[]}
        state={{
          query: '',
          filters: {},
          mode: 'hybrid',
          loading: false,
          error: null,
          result: null,
          selectedItemId: null,
          recentQueries: ['local first', 'browser research'],
          indexEmpty: false,
          restoring: false,
        }}
        onQueryChange={vi.fn()}
        onFiltersChange={vi.fn()}
        onModeChange={vi.fn()}
        onSelectedItemIdChange={vi.fn()}
        onRunSearch={vi.fn()}
        onOpenItem={vi.fn()}
        onClearRecentQueries={vi.fn()}
      />
    );

    expect(markup).toContain('Find anything in this scope');
    expect(markup).toContain('Recent searches');
    expect(markup).toContain('local first');
    expect(markup).toContain('browser research');
    expect(markup).not.toContain('Inspector panel');
    expect(markup).toContain('class="scrollbar ui-scroll-footer-safe"');
    expect(markup).toContain('padding:24px 28px var(--scroll-footer-safe-bottom)');
  });

  it('keeps workspace and full-library organization actions together in scoped search', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <ProductSearchView
          items={[item]}
          collections={[collection]}
          projects={[project, otherProject]}
          organizationCollections={[collection, otherCollection]}
          state={resultState}
          onQueryChange={vi.fn()}
          onFiltersChange={vi.fn()}
          onModeChange={vi.fn()}
          onSelectedItemIdChange={vi.fn()}
          onRunSearch={vi.fn()}
          onOpenItem={vi.fn()}
          onUpdateItem={vi.fn()}
          itemActionLabel="Add to workspace"
        />
      );
    });

    expect(host.textContent).toContain('Organize…');
    expect(host.textContent).toContain('Add to workspace');

    const organize = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Organize'));
    await act(async () => organize?.click());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Add to project or collection');
    expect(dialog?.textContent).toContain('Research / Reading');
    expect(dialog?.textContent).toContain('Writing');

    const projectSelect = dialog?.querySelector<HTMLSelectElement>('[aria-label="Project"]');
    await act(async () => {
      if (!projectSelect) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      valueSetter?.call(projectSelect, otherProject.id);
      projectSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(dialog?.textContent).toContain('Drafts');
    expect(dialog?.textContent).not.toContain('Tags');

    await act(async () => root.unmount());
    document.body.innerHTML = '';
  });

  it('offers every workspace destination for an All Library result opened from a project', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onAddItemToWorkspace = vi.fn();

    await act(async () => {
      root.render(
        <ProductSearchView
          items={[item]}
          collections={[collection]}
          projects={[project, otherProject]}
          organizationCollections={[collection, otherCollection]}
          state={resultState}
          onQueryChange={vi.fn()}
          onFiltersChange={vi.fn()}
          onModeChange={vi.fn()}
          onSelectedItemIdChange={vi.fn()}
          onRunSearch={vi.fn()}
          onOpenItem={vi.fn()}
          onUpdateItem={vi.fn()}
          workspaceDestinations={[
            { key: 'research-live', projectId: project.id, projectName: project.name, workspaceName: 'Live session', path: 'Research / Live session', kind: 'live', isCurrent: true },
            { key: 'writing-live', projectId: otherProject.id, projectName: otherProject.name, workspaceName: 'Live session', path: 'Writing / Live session', kind: 'live', isCurrent: false },
          ]}
          isItemInWorkspace={() => false}
          onAddItemToWorkspace={onAddItemToWorkspace}
        />
      );
    });

    expect(host.textContent).toContain('Organize…');
    expect(host.textContent).toContain('Add to workspace…');
    await act(async () => host.querySelector<HTMLButtonElement>('.ui-workspace-picker-trigger')?.click());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Research / Live session');
    expect(dialog?.textContent).toContain('Writing / Live session');

    await act(async () => root.unmount());
    document.body.innerHTML = '';
  });
});
