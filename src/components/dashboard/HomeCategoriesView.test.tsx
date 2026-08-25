// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';
import type { CategoryBrowseSnapshot } from '../../lib/categorization/categoryBrowse';
import { HomeCategoriesView } from './HomeCategoriesView';

const snapshot: CategoryBrowseSnapshot = {
  categories: [
    { id: 'finance', name: 'Finance', kind: 'parent', status: 'approved', assignable: false, source: 'seed', created_at: 1, updated_at: 1 },
    { id: 'investing', name: 'Investing', kind: 'leaf', status: 'approved', assignable: true, parentId: 'finance', source: 'discovered', created_at: 1, updated_at: 1 },
    { id: 'trading', name: 'Trading', kind: 'leaf', status: 'approved', assignable: true, parentId: 'finance', source: 'seed', created_at: 1, updated_at: 1 },
    { id: 'empty', name: 'No assignments yet', kind: 'leaf', status: 'approved', assignable: true, parentId: 'finance', source: 'seed', created_at: 1, updated_at: 1 },
    { id: 'link-quality', name: 'Link quality', kind: 'parent', status: 'approved', assignable: false, source: 'seed', created_at: 1, updated_at: 1 },
    { id: 'seed_page-not-found', name: 'Page not found', kind: 'leaf', status: 'approved', assignable: true, parentId: 'link-quality', source: 'seed', created_at: 1, updated_at: 1 },
  ],
  links: [
    { id: 'one-investing', itemId: 'one', categoryId: 'investing', score: 0.9, isPrimary: true, source: 'ai', status: 'suggested', created_at: 1, updated_at: 1 },
    { id: 'two-trading', itemId: 'two', categoryId: 'trading', score: 0.9, isPrimary: true, source: 'ai', status: 'suggested', created_at: 1, updated_at: 1 },
  ],
};

const loadCategoryBrowseSnapshot = vi.hoisted(() => vi.fn(async () => snapshot));

vi.mock('../../lib/categorization/categoryBrowse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/categorization/categoryBrowse')>()),
  loadCategoryBrowseSnapshot,
}));

const items: Item[] = [
  { id: 'one', title: 'Long-term portfolio', url: 'https://example.com/one', collectionIds: [], tags: [], source: 'manual', created_at: 1, updated_at: 2 },
  { id: 'two', title: 'Trading systems', url: 'https://example.com/two', collectionIds: [], tags: [], source: 'manual', created_at: 1, updated_at: 1 },
];

describe('HomeCategoriesView', () => {
  beforeEach(() => {
    localStorage.clear();
    loadCategoryBrowseSnapshot.mockClear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('loads the scoped category snapshot and unions multiple selected categories', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSelectedItemChange = vi.fn();

    await act(async () => root.render(
      <HomeCategoriesView
        items={items}
        scopeLabel="Research"
        scopeKey="project-research"
        onSelectedItemChange={onSelectedItemChange}
      />
    ));

    expect(loadCategoryBrowseSnapshot).toHaveBeenCalledWith(['one', 'two']);
    expect(host.textContent).toContain('Research categories');
    expect(host.textContent).toContain('Select one or more categories');
    expect(host.textContent).toContain('No assignments yet');
    expect(host.textContent).toContain('Page status & errors');
    expect(host.textContent).toContain('Page not found');
    expect(host.textContent).toContain('Seed');
    expect(host.textContent).toContain('Discovered');
    expect(host.textContent).not.toContain('Show empty categories');

    const investing = [...host.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('Investing'))
      ?.querySelector<HTMLInputElement>('input');
    await act(async () => investing?.click());
    expect(host.textContent).toContain('Long-term portfolio');
    expect(host.textContent).not.toContain('Trading systems');

    const trading = [...host.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('Trading'))
      ?.querySelector<HTMLInputElement>('input');
    await act(async () => trading?.click());
    expect(host.textContent).toContain('Long-term portfolio');
    expect(host.textContent).toContain('Trading systems');
    expect(host.textContent).toContain('2 selected · showing items in any selected category');

    const financeParent = host.querySelector<HTMLInputElement>(
      'input[aria-label="Select all child categories under Finance"]'
    );
    expect(financeParent?.checked).toBe(false);
    expect(financeParent?.indeterminate).toBe(true);

    await act(async () => financeParent?.click());
    expect(host.textContent).toContain('Long-term portfolio');
    expect(host.textContent).toContain('Trading systems');
    expect(host.textContent).toContain('3 selected · showing items in any selected category');

    await act(async () => financeParent?.click());
    expect(host.textContent).not.toContain('Long-term portfolio');
    expect(host.textContent).not.toContain('Trading systems');
    expect(host.textContent).toContain('Select one or more child categories');

    await act(async () => financeParent?.click());
    expect(host.textContent).toContain('Long-term portfolio');
    expect(host.textContent).toContain('Trading systems');

    const tradingRow = [...host.querySelectorAll<HTMLElement>('[data-content-entry]')]
      .find((row) => row.textContent?.includes('Trading systems'));
    await act(async () => tradingRow?.click());
    expect(onSelectedItemChange).toHaveBeenCalledWith(items[1]);

    await act(async () => root.unmount());
  });

  it('shows exact focused membership without replacing the saved explorer selection', async () => {
    localStorage.setItem(
      'workbench-home-category-selection:all',
      JSON.stringify(['trading'])
    );
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onExitFocusedCategory = vi.fn();

    await act(async () => root.render(
      <HomeCategoriesView
        items={items}
        scopeLabel="All Library"
        scopeKey="all"
        focusedCategory={{ categoryId: 'investing', name: 'Investing' }}
        onExitFocusedCategory={onExitFocusedCategory}
      />
    ));

    expect(host.textContent).toContain('Exact category membership');
    expect(host.textContent).toContain('Long-term portfolio');
    expect(host.textContent).not.toContain('Trading systems');
    expect(localStorage.getItem('workbench-home-category-selection:all')).toBe(
      JSON.stringify(['trading'])
    );

    const back = [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('All categories'));
    await act(async () => back?.click());
    expect(onExitFocusedCategory).toHaveBeenCalledTimes(1);

    await act(async () => root.render(
      <HomeCategoriesView
        items={items}
        scopeLabel="All Library"
        scopeKey="all"
      />
    ));
    expect(host.textContent).toContain('Trading systems');
    expect(host.textContent).not.toContain('Long-term portfolio');

    await act(async () => root.unmount());
  });

  it('changes browsing context without navigating away from Categories', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onScopeValueChange = vi.fn();

    await act(async () => root.render(
      <HomeCategoriesView
        items={items}
        scopeLabel="Research"
        scopeKey="project-research"
        scopeOptions={[
          { value: 'project', label: 'Research' },
          { value: 'all', label: 'All Library' },
        ]}
        scopeValue="project"
        onScopeValueChange={onScopeValueChange}
      />
    ));

    const scope = host.querySelector<HTMLSelectElement>('[aria-label="Categories scope"]');
    expect(scope?.value).toBe('project');
    await act(async () => {
      scope!.value = 'all';
      scope!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onScopeValueChange).toHaveBeenCalledWith('all');

    await act(async () => root.unmount());
  });
});
