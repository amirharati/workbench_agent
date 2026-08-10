// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLibrarySearchHistory,
  LIBRARY_SEARCH_HISTORY_KEY,
  useLibrarySearch,
  useSearchNavigationScope,
} from './useLibrarySearch';

describe('library search history persistence', () => {
  beforeEach(() => {
    localStorage.clear();
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
      result: null,
      selectedItemId: null,
    });

    await act(async () => root.unmount());
  });

  it('preserves restored Search scope on startup and follows later shell navigation', async () => {
    const setFilters = vi.fn();
    let scope = { projectId: 'project-inbox', collectionId: 'collection-incoming' };
    const filters = { domain: 'example.com' };
    const Probe = () => {
      useSearchNavigationScope(filters, setFilters, scope.projectId, scope.collectionId);
      return null;
    };
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(
      React.createElement(React.StrictMode, null, React.createElement(Probe))
    ));

    // Search may deliberately be set to All Library while Home remains in
    // Inbox. Startup must not replace the restored Search choice with Inbox.
    expect(setFilters).not.toHaveBeenCalled();

    scope = { projectId: 'project-research', collectionId: 'all' };
    await act(async () => root.render(
      React.createElement(React.StrictMode, null, React.createElement(Probe))
    ));

    expect(setFilters).toHaveBeenCalledTimes(1);
    expect(setFilters).toHaveBeenCalledWith({
      domain: 'example.com',
      projectId: 'project-research',
      collectionId: undefined,
    });

    await act(async () => root.unmount());
  });
});
