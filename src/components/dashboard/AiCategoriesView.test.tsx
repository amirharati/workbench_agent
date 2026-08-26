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
const findSimilarCategories = vi.hoisted(() => vi.fn(async (
  _draft: unknown,
  categories: Array<{ id: string }>
) => ({
  matches: [{
    category: categories.find((category: { id: string }) => category.id === 'investing'),
    score: 0.91,
    lexicalScore: 0.5,
    semanticScore: 0.91,
    exact: false,
  }],
  semanticAvailable: true,
})));

vi.mock('../../lib/categorization/devQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/categorization/devQueries')>()),
  getTaxonomyTreeWithCounts,
}));

vi.mock('../../lib/dataChangeNotifier', () => ({
  subscribeToDataChanges: () => () => {},
}));

vi.mock('../../lib/categorization/categoryManagement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/categorization/categoryManagement')>()),
  findSimilarCategories,
}));

describe('AiCategoriesView', () => {
  beforeEach(() => {
    getTaxonomyTreeWithCounts.mockClear();
    findSimilarCategories.mockClear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('shows parent navigation and the selected parent children without a long expanded page', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onBrowseCategory = vi.fn();

    await act(async () => root.render(
      <AiCategoriesView embedded onBrowseCategory={onBrowseCategory} />
    ));

    expect(host.textContent).toContain('All categories');
    expect(host.textContent).toContain('Complete parent and child hierarchy');
    expect(host.textContent).toContain('Topics');
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
    expect(host.querySelector('.ui-taxonomy__parent-nav-item')?.getAttribute('data-selected')).toBe('true');

    const investing = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Investing'));
    await act(async () => investing?.click());
    expect(onBrowseCategory).toHaveBeenCalledWith('investing', 'Investing');

    await act(async () => root.unmount());
  });

  it('uses semantic and keyword category search and keeps the parent context visible', async () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<AiCategoriesView embedded />));

    const input = host.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      if (input) {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(input, 'long term portfolio');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(findSimilarCategories).toHaveBeenCalled();
    expect(host.textContent).toContain('Category investigation');
    expect(host.textContent).toContain('Keyword and semantic matches');
    expect(host.textContent).toContain('Finance');
    expect(host.textContent).toContain('Investing');

    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it('labels creation as bookmark-scoped when the hub retains a current item', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <AiCategoriesView
        embedded
        targetItem={{ id: 'item-1', title: 'Current bookmark', url: 'https://example.com' }}
      />
    ));
    expect(host.textContent).toContain('Add category to current bookmark');
    await act(async () => root.unmount());
  });
});
