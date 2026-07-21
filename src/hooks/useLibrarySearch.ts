import { useCallback, useEffect, useRef, useState } from 'react';
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

type PersistedLibrarySearchState = Pick<
  LibrarySearchState,
  'query' | 'filters' | 'mode' | 'selectedItemId' | 'indexEmpty'
>;

type PersistedLibrarySearchResult = {
  query: string;
  filters: SearchFilters;
  mode: LibrarySearchState['mode'];
  result: HybridSearchResultWithRelated;
};

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
  /** A cached result is being restored after the startup-critical paint. */
  restoring: boolean;
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

function getSearchResultStorageKey(storageKey: string): string {
  return `${storageKey}:results`;
}

function loadPersistedSearchState(storageKey?: string): Partial<PersistedLibrarySearchState> {
  if (!storageKey) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<PersistedLibrarySearchState> | null;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      filters: parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : {},
      mode: parsed.mode === 'lexical-only' ? 'lexical-only' : 'hybrid',
      selectedItemId: typeof parsed.selectedItemId === 'string' ? parsed.selectedItemId : null,
      indexEmpty: parsed.indexEmpty === true,
    };
  } catch {
    return {};
  }
}

function serializePersistedSearchState(state: LibrarySearchState): string {
  const persisted: PersistedLibrarySearchState = {
    query: state.query,
    filters: state.filters,
    mode: state.mode,
    selectedItemId: state.selectedItemId,
    indexEmpty: state.indexEmpty,
  };
  return JSON.stringify(persisted);
}

function savePersistedSearchState(storageKey: string, serialized: string): void {
  try {
    if (localStorage.getItem(storageKey) !== serialized) {
      localStorage.setItem(storageKey, serialized);
    }
  } catch {
    // Search state is resumable UI context, not canonical library data.
  }
}

function loadPersistedSearchResult(storageKey: string): PersistedLibrarySearchResult | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(getSearchResultStorageKey(storageKey)) ?? 'null'
    ) as Partial<PersistedLibrarySearchResult> | null;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.query !== 'string' ||
      (parsed.mode !== 'hybrid' && parsed.mode !== 'lexical-only') ||
      !parsed.filters ||
      typeof parsed.filters !== 'object' ||
      !parsed.result ||
      typeof parsed.result !== 'object'
    ) {
      return null;
    }
    return parsed as PersistedLibrarySearchResult;
  } catch {
    return null;
  }
}

function sameSearchSnapshot(
  left: Pick<PersistedLibrarySearchResult, 'query' | 'filters' | 'mode'>,
  right: LibrarySearchSnapshot
): boolean {
  const filterKeys: Array<keyof SearchFilters> = [
    'projectId',
    'collectionId',
    'domain',
    'sourceKind',
    'updatedAfter',
    'updatedBefore',
  ];
  return (
    left.query === right.query &&
    left.mode === right.mode &&
    filterKeys.every((key) => left.filters[key] === right.filters[key])
  );
}

function scheduleDeferredWork(work: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work, { timeout: 200 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(work, 0);
  return () => window.clearTimeout(id);
}

function savePersistedSearchResultDeferred(
  storageKey: string,
  snapshot: LibrarySearchSnapshot,
  result: HybridSearchResultWithRelated
): void {
  scheduleDeferredWork(() => {
    try {
      const key = getSearchResultStorageKey(storageKey);
      const serialized = JSON.stringify({ ...snapshot, result } satisfies PersistedLibrarySearchResult);
      if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
    } catch {
      // Cached results are optional and must never interrupt a completed search.
    }
  });
}

export function useLibrarySearch(onError?: (message: string) => void, storageKey?: string) {
  const [initialPersisted] = useState(() => loadPersistedSearchState(storageKey));
  const pendingSelectedItemIdRef = useRef(initialPersisted.selectedItemId ?? null);
  const hasInteractedRef = useRef(false);
  const [state, setState] = useState<LibrarySearchState>(() => ({
    query: initialPersisted.query ?? '',
    filters: initialPersisted.filters ?? {},
    mode: initialPersisted.mode ?? 'hybrid',
    loading: false,
    error: null,
    result: null,
    // Restoring the inspector is useful, but it should not compete with first paint.
    selectedItemId: null,
    recentQueries: loadRecentQueries(),
    indexEmpty: initialPersisted.indexEmpty ?? false,
    restoring: Boolean(storageKey && initialPersisted.query?.trim()),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastPersistedStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    const serialized = serializePersistedSearchState(
      state.restoring
        ? { ...state, selectedItemId: pendingSelectedItemIdRef.current }
        : state
    );
    if (lastPersistedStateRef.current === serialized) return;
    lastPersistedStateRef.current = serialized;
    savePersistedSearchState(storageKey, serialized);
  }, [state.filters, state.indexEmpty, state.mode, state.query, state.restoring, state.selectedItemId, storageKey]);

  useEffect(() => {
    if (!storageKey || !initialPersisted.query?.trim()) return;
    return scheduleDeferredWork(() => {
      if (hasInteractedRef.current) return;
      const cached = loadPersistedSearchResult(storageKey);
      const current = stateRef.current;
      if (
        !cached ||
        !sameSearchSnapshot(cached, {
          query: current.query,
          filters: current.filters,
          mode: current.mode,
        })
      ) {
        setState((previous) => ({ ...previous, restoring: false }));
        return;
      }
      setState((previous) => ({
        ...previous,
        result: cached.result,
        selectedItemId: pendingSelectedItemIdRef.current,
        indexEmpty: cached.result.totalCandidates === 0 && cached.result.results.length === 0,
        restoring: false,
      }));
    });
  }, [initialPersisted.query, storageKey]);

  const setQuery = useCallback((query: string) => {
    hasInteractedRef.current = true;
    setState((s) => ({ ...s, query, restoring: false }));
  }, []);

  const setFilters = useCallback((filters: SearchFilters) => {
    hasInteractedRef.current = true;
    setState((s) => ({ ...s, filters, restoring: false }));
  }, []);

  const setMode = useCallback((mode: 'hybrid' | 'lexical-only') => {
    hasInteractedRef.current = true;
    setState((s) => ({ ...s, mode, restoring: false }));
  }, []);

  const setSelectedItemId = useCallback((selectedItemId: string | null) => {
    hasInteractedRef.current = true;
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
        const filterPayload: SearchFilters | undefined = Object.values(filters).some(
          (value) => value !== undefined && value !== ''
        )
          ? { ...filters }
          : undefined;
        const res = await runAppHybridSearchWithRelated({
          query,
          mode,
          limit: 30,
          filters: filterPayload,
        });
        if (storageKey) savePersistedSearchResultDeferred(storageKey, { query, mode, filters }, res);
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
            restoring: false,
          };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((p) => ({ ...p, loading: false, error: message, result: null, restoring: false }));
        onError?.(message);
      }
    },
    [onError, storageKey]
  );

  const runSearch = useCallback(
    async (queryInput?: string) => {
      hasInteractedRef.current = true;
      setState((prev) => {
        const trimmed = (queryInput ?? prev.query).trim();
        if (!trimmed) return prev;

        void executeSearch({ query: trimmed, mode: prev.mode, filters: prev.filters });

        return {
          ...prev,
          query: trimmed,
          loading: true,
          error: null,
          result: null,
          selectedItemId: null,
          indexEmpty: false,
          restoring: false,
        };
      });
    },
    [executeSearch]
  );

  const openSearch = useCallback(
    ({ query, filters, mode }: LibrarySearchSnapshot) => {
      hasInteractedRef.current = true;
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
        restoring: false,
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
