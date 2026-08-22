// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';
import type { CategoryBrowseSnapshot } from '../../lib/categorization/categoryBrowse';
import { HomeCategoriesView } from './HomeCategoriesView';

const snapshot: CategoryBrowseSnapshot = {
  categories: [
    { id: 'finance', name: 'Finance', kind: 'parent', status: 'approved', assignable: false, created_at: 1, updated_at: 1 },
    { id: 'investing', name: 'Investing', kind: 'leaf', status: 'approved', assignable: true, parentId: 'finance', created_at: 1, updated_at: 1 },
    { id: 'trading', name: 'Trading', kind: 'leaf', status: 'approved', assignable: true, parentId: 'finance', created_at: 1, updated_at: 1 },
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

    const tradingRow = [...host.querySelectorAll<HTMLElement>('[data-content-entry]')]
      .find((row) => row.textContent?.includes('Trading systems'));
    await act(async () => tradingRow?.click());
    expect(onSelectedItemChange).toHaveBeenCalledWith(items[1]);

    await act(async () => root.unmount());
  });
});
