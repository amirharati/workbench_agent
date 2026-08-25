// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLibrarySearchHistory,
  LIBRARY_SEARCH_HISTORY_KEY,
  useLibrarySearch,
} from './useLibrarySearch';

const runSearchMock = vi.hoisted(() => vi.fn(async (options: { query: string }) => ({
  query: options.query,
  mode: 'hybrid' as const,
  results: [],
  totalCandidates: 0,
  matchedCategoryIds: [],
  embeddingPathUsed: false,
  related: { topics: [], tags: [], relatedLinks: [] },
})));

vi.mock('../lib/search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/search')>()),
  runAppHybridSearchWithRelated: runSearchMock,
}));

describe('library search history persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    runSearchMock.mockClear();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('removes the persisted recent-search history', () => {
    localStorage.setItem(LIBRARY_SEARCH_HISTORY_KEY, JSON.stringify(['python', 'rust']));

    clearLibrarySearchHistory();

    expect(localStorage.getItem(LIBRARY_SEARCH_HISTORY_KEY)).toBeNull();
  });

  it('restores cached results and selection after the startup-critical render', async () => {
    vi.useFakeTimers();
    const storageKey = 'test:search-state';
    localStorage.setItem(storageKey, JSON.stringify({
      query: 'python',
      filters: { excludeProjectId: 'project-research' },
      mode: 'hybrid',
      selectedItemId: 'item-python',
      indexEmpty: false,
    }));
    localStorage.setItem(`${storageKey}:results`, JSON.stringify({
      query: 'python',
      filters: { excludeProjectId: 'project-research' },
      mode: 'hybrid',
      result: {
        query: 'python',
        mode: 'hybrid',
        results: [],
        totalCandidates: 1,
        matchedCategoryIds: [],
        embeddingPathUsed: false,
        related: { topics: [], tags: [], relatedLinks: [] },
      },
    }));
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    let search: ReturnType<typeof useLibrarySearch> | null = null;
    const Probe = () => {
      search = useLibrarySearch(undefined, storageKey);
      return null;
    };
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(React.createElement(Probe)));

    expect(search!.state).toMatchObject({
      query: 'python',
      result: null,
      selectedItemId: null,
      restoring: true,
    });
    expect(getItem.mock.calls.some(([key]) => key === `${storageKey}:results`)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => vi.runAllTimers());

    expect(search!.state).toMatchObject({
      query: 'python',
      filters: { excludeProjectId: 'project-research' },
      selectedItemId: 'item-python',
      restoring: false,
    });
    expect(search!.state.result?.query).toBe('python');
    expect(getItem.mock.calls.some(([key]) => key === `${storageKey}:results`)).toBe(true);
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => search!.setQuery('rust trading'));
    expect(search!.state).toMatchObject({
      query: 'rust trading',
      selectedItemId: 'item-python',
    });
    expect(search!.state.result?.query).toBe('python');

    await act(async () => search!.setQuery(''));
    expect(search!.state).toMatchObject({
      query: '',
      result: null,
      selectedItemId: null,
    });

    await act(async () => root.unmount());
  });

  it('opens exact tag and category searches as independent local tabs', async () => {
    let search: ReturnType<typeof useLibrarySearch> | null = null;
    const Probe = () => {
      search = useLibrarySearch();
      return null;
    };
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => search!.openSearch({
      query: 'investing',
      filters: { projectId: 'finance' },
      mode: 'hybrid',
    }));
    await act(async () => search!.openTagTab('risk management'));

    expect(search!.searchTabs).toHaveLength(2);
    expect(search!.searchTabs[1]).toMatchObject({
      kind: 'tag',
      label: 'Tag: risk management',
      tag: 'risk management',
    });
    expect(search!.state.query).toBe('tag:"risk management"');
    expect(search!.state.filters).toEqual({ projectId: 'finance' });
    expect(runSearchMock).toHaveBeenLastCalledWith(expect.objectContaining({
      query: 'tag:"risk management"',
      filters: { projectId: 'finance' },
    }));

    const rootTabId = search!.searchTabs[0].id;
    await act(async () => search!.selectSearchTab(rootTabId));
    expect(search!.state.query).toBe('investing');
    expect(search!.state.filters.tag).toBeUndefined();

    await act(async () => search!.openCategoryTab('trading-strategies', 'Trading strategies'));
    expect(search!.state.query).toBe('category:"Trading strategies"');
    expect(search!.state.filters).toEqual({ projectId: 'finance' });
    expect(search!.searchTabs.at(-1)).toMatchObject({
      kind: 'category',
      label: 'Category: Trading strategies',
    });

    await act(async () => search!.openBlankSearchTab());
    expect(search!.state).toMatchObject({
      query: '',
      filters: { projectId: 'finance' },
      result: null,
      selectedItemId: null,
    });
    expect(search!.searchTabs.at(-1)).toMatchObject({
      kind: 'search',
      label: 'Search',
    });

    await act(async () => root.unmount());
  });
});
