// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLibrarySearchHistory,
  LIBRARY_SEARCH_HISTORY_KEY,
} from './useLibrarySearch';

describe('library search history persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes the persisted recent-search history', () => {
    localStorage.setItem(LIBRARY_SEARCH_HISTORY_KEY, JSON.stringify(['python', 'rust']));

    clearLibrarySearchHistory();

    expect(localStorage.getItem(LIBRARY_SEARCH_HISTORY_KEY)).toBeNull();
  });
});
