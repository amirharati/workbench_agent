// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCategoriesView } from './AiCategoriesView';

const getTaxonomyTreeWithCounts = vi.hoisted(() => vi.fn(async () => ({
  parents: [{
    category: {
      id: 'finance', name: 'Finance', kind: 'parent' as const, status: 'approved' as const,
      assignable: false, source: 'seed' as const, description: 'Money and markets.', created_at: 1, updated_at: 1,
    },
    itemCount: 3,
    primaryItemCount: 3,
    secondaryItemCount: 0,
    childLeafCount: 2,
    leaves: [
      {
        category: {
          id: 'investing', name: 'Investing', kind: 'leaf' as const, status: 'approved' as const,
          assignable: true, parentId: 'finance', source: 'discovered' as const,
          description: 'Long-term investing research.', created_at: 1, updated_at: 1,
        },
        itemCount: 3,
        primaryItemCount: 3,
        secondaryItemCount: 0,
      },
      {
        category: {
          id: 'empty-topic', name: 'Empty category', kind: 'leaf' as const, status: 'approved' as const,
          assignable: true, parentId: 'finance', source: 'seed' as const,
          description: 'Present before any links are assigned.', created_at: 1, updated_at: 1,
        },
        itemCount: 0,
        primaryItemCount: 0,
        secondaryItemCount: 0,
      },
    ],
  }],
  orphanLeaves: [],
  totals: { parents: 1, leaves: 2, itemsWithPrimary: 3, itemsWithPrimaryEnrichIncomplete: 0 },
})));

vi.mock('../../lib/categorization/devQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/categorization/devQueries')>()),
  getTaxonomyTreeWithCounts,
}));

vi.mock('../../lib/dataChangeNotifier', () => ({
  subscribeToDataChanges: () => () => {},
}));

describe('AiCategoriesView', () => {
  beforeEach(() => {
    getTaxonomyTreeWithCounts.mockClear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('shows every category in a plain, expanded category list', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onBrowseCategory = vi.fn();

    await act(async () => root.render(
      <AiCategoriesView embedded onBrowseCategory={onBrowseCategory} />
    ));

    expect(host.textContent).toContain('All categories');
    expect(host.textContent).toContain('Complete parent and child hierarchy');
    expect(host.textContent).toContain('Topic hierarchy');
    expect(host.textContent).toContain('Finance');
    expect(host.textContent).toContain('Money and markets.');
    expect(host.textContent).toContain('Investing');
    expect(host.textContent).toContain('Empty category');
    expect(host.textContent).toContain('ParentSeed');
    expect(host.textContent).toContain('ChildDiscovered');
    expect(host.textContent).toContain('0 bookmarks');
    expect(host.textContent).not.toContain('Show empty topic leaves');
    expect(host.textContent).not.toContain('Primary');
    expect(host.querySelector('[aria-expanded]')).toBeNull();

    const investing = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Investing'));
    await act(async () => investing?.click());
    expect(onBrowseCategory).toHaveBeenCalledWith('investing', 'Investing');

    await act(async () => root.unmount());
  });
});
