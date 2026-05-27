import { useCallback, useEffect, useState } from 'react';
import {
  runAppHybridSearchWithRelated,
  loadSearchIndexFromDb,
  searchIndexStats,
  type HybridSearchResultWithRelated,
  type SearchFilters,
} from '../lib/search';

export const LIBRARY_SEARCH_TAB_ID = 'product-search';
export const LIBRARY_SEARCH_HISTORY_KEY = 'workbench-search-history';
const MAX_HISTORY = 20;

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

  useEffect(() => {
    void (async () => {
      try {
        const index = await loadSearchIndexFromDb();
        const stats = searchIndexStats(index);
        setState((s) => ({ ...s, indexEmpty: stats.documents === 0 }));
      } catch {
        /* index check is best-effort */
      }
    })();
  }, []);

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

  const runSearch = useCallback(
    async (queryInput?: string) => {
      setState((prev) => {
        const trimmed = (queryInput ?? prev.query).trim();
        if (!trimmed) return prev;

        const { mode, filters } = prev;
        void (async () => {
          try {
            const filterPayload: SearchFilters | undefined =
              filters.collectionId || filters.domain ? { ...filters } : undefined;
            const res = await runAppHybridSearchWithRelated({
              query: trimmed,
              mode,
              limit: 30,
              filters: filterPayload,
            });
            setState((p) => {
              const nextHistory = [
                trimmed,
                ...p.recentQueries.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
              ].slice(0, MAX_HISTORY);
              saveRecentQueries(nextHistory);
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
        })();

        return { ...prev, query: trimmed, loading: true, error: null, selectedItemId: null };
      });
    },
    [onError]
  );

  return {
    state,
    setQuery,
    setFilters,
    setMode,
    setSelectedItemId,
    runSearch,
  };
}
