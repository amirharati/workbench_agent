import { useCallback, useEffect, useState } from 'react';
import {
  runAppHybridSearchWithRelated,
  type HybridSearchResultWithRelated,
  type SearchFilters,
} from '../lib/search';

export const LIBRARY_SEARCH_TAB_ID = 'product-search';
export const LIBRARY_SEARCH_HISTORY_KEY = 'workbench-search-history';
export const LIBRARY_SEARCH_LAST_QUERY_KEY = 'workbench-search-last-query';
const MAX_HISTORY = 20;
const LIBRARY_SEARCH_HISTORY_CLEARED_EVENT = 'workbench-search-history-cleared';

export interface LibrarySearchState {
  query: string;
  filters: SearchFilters;
  mode: 'hybrid' | 'lexical-only';
  loading: boolean;
  error: string | null;
  result: HybridSearchResultWithRelated | null;
  selectedItemId: string | null;
  recentQueries: string[];
  indexEmpty: boolean;
}

export interface LibrarySearchSnapshot {
  query: string;
  filters: SearchFilters;
  mode: 'hybrid' | 'lexical-only';
}

function loadRecentQueries(): string[] {
  try {
    const raw = localStorage.getItem(LIBRARY_SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((q): q is string => typeof q === 'string').slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveRecentQueries(queries: string[]): void {
  try {
    localStorage.setItem(LIBRARY_SEARCH_HISTORY_KEY, JSON.stringify(queries.slice(0, MAX_HISTORY)));
  } catch {
    /* ignore quota errors */
  }
}

export function clearLibrarySearchHistory(): void {
  try {
    localStorage.removeItem(LIBRARY_SEARCH_HISTORY_KEY);
  } catch {
    /* ignore storage access errors */
  }
}

export function loadLastSearchQuery(): string {
  try {
    return localStorage.getItem(LIBRARY_SEARCH_LAST_QUERY_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

function saveLastSearchQuery(query: string): void {
  try {
    localStorage.setItem(LIBRARY_SEARCH_LAST_QUERY_KEY, query);
  } catch {
    /* ignore quota errors */
  }
}

export function useLibrarySearch(onError?: (message: string) => void) {
  const [state, setState] = useState<LibrarySearchState>(() => ({
    query: '',
    filters: {},
    mode: 'hybrid',
    loading: false,
    error: null,
    result: null,
    selectedItemId: null,
    recentQueries: loadRecentQueries(),
    indexEmpty: false,
  }));

  const setQuery = useCallback((query: string) => {
    setState((s) => ({ ...s, query }));
  }, []);

  const setFilters = useCallback((filters: SearchFilters) => {
    setState((s) => ({ ...s, filters }));
  }, []);

  const setMode = useCallback((mode: 'hybrid' | 'lexical-only') => {
    setState((s) => ({ ...s, mode }));
  }, []);

  const setSelectedItemId = useCallback((selectedItemId: string | null) => {
    setState((s) => ({ ...s, selectedItemId }));
  }, []);

  useEffect(() => {
    const handleHistoryCleared = () => {
      setState((s) => ({ ...s, recentQueries: [] }));
    };
    window.addEventListener(LIBRARY_SEARCH_HISTORY_CLEARED_EVENT, handleHistoryCleared);
    return () => window.removeEventListener(LIBRARY_SEARCH_HISTORY_CLEARED_EVENT, handleHistoryCleared);
  }, []);

  const clearRecentQueries = useCallback(() => {
    clearLibrarySearchHistory();
    setState((s) => ({ ...s, recentQueries: [] }));
    window.dispatchEvent(new Event(LIBRARY_SEARCH_HISTORY_CLEARED_EVENT));
  }, []);

  const executeSearch = useCallback(
    async ({ query, mode, filters }: LibrarySearchSnapshot) => {
      try {
        const filterPayload: SearchFilters | undefined =
          filters.collectionId || filters.domain ? { ...filters } : undefined;
        const res = await runAppHybridSearchWithRelated({
          query,
          mode,
          limit: 30,
          filters: filterPayload,
        });
        setState((p) => {
          const nextHistory = [
            query,
            ...p.recentQueries.filter((q) => q.toLowerCase() !== query.toLowerCase()),
          ].slice(0, MAX_HISTORY);
          saveRecentQueries(nextHistory);
          saveLastSearchQuery(query);
          return {
            ...p,
            loading: false,
            result: res,
            error: null,
            recentQueries: nextHistory,
            indexEmpty: res.totalCandidates === 0 && res.results.length === 0,
          };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((p) => ({ ...p, loading: false, error: message, result: null }));
        onError?.(message);
      }
    },
    [onError]
  );

  const runSearch = useCallback(
    async (queryInput?: string) => {
      setState((prev) => {
        const trimmed = (queryInput ?? prev.query).trim();
        if (!trimmed) return prev;

        void executeSearch({ query: trimmed, mode: prev.mode, filters: prev.filters });

        return { ...prev, query: trimmed, loading: true, error: null, selectedItemId: null };
      });
    },
    [executeSearch]
  );

  const openSearch = useCallback(
    ({ query, filters, mode }: LibrarySearchSnapshot) => {
      const trimmed = query.trim();
      const snapshot = { query: trimmed, filters: { ...filters }, mode };
      setState((prev) => ({
        ...prev,
        ...snapshot,
        loading: !!trimmed,
        error: null,
        result: null,
        selectedItemId: null,
        indexEmpty: false,
      }));
      if (trimmed) void executeSearch(snapshot);
    },
    [executeSearch]
  );

  return {
    state,
    setQuery,
    setFilters,
    setMode,
    setSelectedItemId,
    clearRecentQueries,
    runSearch,
    openSearch,
  };
}
