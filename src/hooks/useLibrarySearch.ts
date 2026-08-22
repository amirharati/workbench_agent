import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatSearchFieldQuery,
  parseSearchQuery,
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

export type LibrarySearchTabKind = 'search' | 'tag' | 'category';

export interface LibrarySearchTab {
  id: string;
  kind: LibrarySearchTabKind;
  label: string;
  tag?: string;
  categoryId?: string;
}

interface LibrarySearchTabRecord extends LibrarySearchTab {
  state: LibrarySearchState;
}

const ROOT_SEARCH_TAB_ID = 'search-root';

function searchTabLabel(kind: LibrarySearchTabKind, value: string): string {
  const trimmed = value.trim();
  if (kind === 'tag') return `Tag: ${trimmed}`;
  if (kind === 'category') return `Category: ${trimmed}`;
  return trimmed ? `Search: ${trimmed}` : 'Search';
}

function structuredTabFromQuery(query: string): { kind: 'tag' | 'category'; value: string } | null {
  const atoms = parseSearchQuery(query).clauses.flatMap((clause) =>
    clause.atoms.filter((atom) => atom.kind === 'tag' || atom.kind === 'category')
  );
  if (atoms.length !== 1) return null;
  return { kind: atoms[0].kind as 'tag' | 'category', value: atoms[0].value };
}

/**
 * Treat shell navigation as a new Search default only after the user actually
 * changes shell scope. On the first render, Search has already restored its
 * own last-used filters and must not be reset to the surrounding Home scope.
 */
export function useSearchNavigationScope(
  filters: SearchFilters,
  setFilters: (filters: SearchFilters) => void,
  scopeProjectId: string | 'all',
  scopeCollectionId: string | 'all'
): void {
  const previousScopeRef = useRef({ scopeProjectId, scopeCollectionId });
  const filtersRef = useRef(filters);
  const setFiltersRef = useRef(setFilters);
  filtersRef.current = filters;
  setFiltersRef.current = setFilters;

  useEffect(() => {
    const previous = previousScopeRef.current;
    if (
      previous.scopeProjectId === scopeProjectId &&
      previous.scopeCollectionId === scopeCollectionId
    ) {
      return;
    }
    previousScopeRef.current = { scopeProjectId, scopeCollectionId };
    setFiltersRef.current({
      ...filtersRef.current,
      projectId: scopeProjectId === 'all' ? undefined : scopeProjectId,
      collectionId: scopeCollectionId === 'all' ? undefined : scopeCollectionId,
    });
  }, [scopeCollectionId, scopeProjectId]);
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
    'categoryId',
    'tag',
    'excludeProjectId',
    'excludeCollectionId',
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
  const initialStructuredTab = structuredTabFromQuery(initialPersisted.query ?? '');
  const initialTabKind: LibrarySearchTabKind = initialPersisted.filters?.categoryId
    ? 'category'
    : initialPersisted.filters?.tag
      ? 'tag'
      : initialStructuredTab?.kind ?? 'search';
  const initialTabValue = initialPersisted.filters?.tag ??
    (initialPersisted.filters?.categoryId ? initialPersisted.query ?? '' : undefined) ??
    initialStructuredTab?.value ??
    initialPersisted.query ?? '';
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
  const [searchTabs, setSearchTabs] = useState<LibrarySearchTabRecord[]>(() => [{
    id: ROOT_SEARCH_TAB_ID,
    kind: initialTabKind,
    label: searchTabLabel(initialTabKind, initialTabValue),
    tag: initialPersisted.filters?.tag ?? (initialStructuredTab?.kind === 'tag' ? initialStructuredTab.value : undefined),
    categoryId: initialPersisted.filters?.categoryId,
    state: {
      query: initialPersisted.query ?? '',
      filters: initialPersisted.filters ?? {},
      mode: initialPersisted.mode ?? 'hybrid',
      loading: false,
      error: null,
      result: null,
      selectedItemId: null,
      recentQueries: loadRecentQueries(),
      indexEmpty: initialPersisted.indexEmpty ?? false,
      restoring: Boolean(storageKey && initialPersisted.query?.trim()),
    },
  }]);
  const [activeSearchTabId, setActiveSearchTabId] = useState(ROOT_SEARCH_TAB_ID);
  const stateRef = useRef(state);
  stateRef.current = state;
  const searchTabsRef = useRef(searchTabs);
  searchTabsRef.current = searchTabs;
  const activeSearchTabIdRef = useRef(activeSearchTabId);
  activeSearchTabIdRef.current = activeSearchTabId;
  const requestRevisionRef = useRef(0);
  const tabSequenceRef = useRef(0);
  const lastPersistedStateRef = useRef<string | null>(null);

  useEffect(() => {
    setSearchTabs((tabs) => tabs.map((tab) =>
      tab.id === activeSearchTabId
        ? {
            ...tab,
            label: tab.kind === 'search' ? searchTabLabel('search', state.query) : tab.label,
            state,
          }
        : tab
    ));
  }, [activeSearchTabId, state]);

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
    const activeTab = searchTabsRef.current.find((tab) => tab.id === activeSearchTabIdRef.current);
    setState((s) => {
      if (query === s.query) return { ...s, restoring: false };
      const filters = activeTab?.kind === 'search'
        ? s.filters
        : { ...s.filters, categoryId: undefined, tag: undefined };
      return {
        ...s,
        query,
        filters,
        // Keep the last completed result set mounted while the user refines
        // the input. It is replaced only after Search runs successfully.
        result: query.trim() ? s.result : null,
        selectedItemId: query.trim() ? s.selectedItemId : null,
        indexEmpty: query.trim() ? s.indexEmpty : false,
        restoring: false,
      };
    });
    if (activeTab?.kind !== 'search') {
      setSearchTabs((tabs) => tabs.map((tab) =>
        tab.id === activeSearchTabIdRef.current
          ? {
              ...tab,
              kind: 'search',
              label: searchTabLabel('search', query),
              tag: undefined,
              categoryId: undefined,
            }
          : tab
      ));
    }
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
      setSearchTabs((tabs) => tabs.map((tab) => ({
        ...tab,
        state: { ...tab.state, recentQueries: [] },
      })));
    };
    window.addEventListener(LIBRARY_SEARCH_HISTORY_CLEARED_EVENT, handleHistoryCleared);
    return () => window.removeEventListener(LIBRARY_SEARCH_HISTORY_CLEARED_EVENT, handleHistoryCleared);
  }, []);

  const clearRecentQueries = useCallback(() => {
    clearLibrarySearchHistory();
    setState((s) => ({ ...s, recentQueries: [] }));
    setSearchTabs((tabs) => tabs.map((tab) => ({
      ...tab,
      state: { ...tab.state, recentQueries: [] },
    })));
    window.dispatchEvent(new Event(LIBRARY_SEARCH_HISTORY_CLEARED_EVENT));
  }, []);

  const executeSearch = useCallback(
    async (
      { query, mode, filters }: LibrarySearchSnapshot,
      requestRevision: number,
      targetTabId: string
    ) => {
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
        if (
          requestRevision !== requestRevisionRef.current ||
          targetTabId !== activeSearchTabIdRef.current
        ) return;
        if (storageKey) {
          savePersistedSearchResultDeferred(storageKey, { query, mode, filters }, res);
        }
        const current = stateRef.current;
        const nextHistory = [
          query,
          ...current.recentQueries.filter((q) => q.toLowerCase() !== query.toLowerCase()),
        ].slice(0, MAX_HISTORY);
        saveRecentQueries(nextHistory);
        saveLastSearchQuery(query);
        const next: LibrarySearchState = {
          ...current,
          loading: false,
          result: res,
          error: null,
          recentQueries: nextHistory,
          indexEmpty: res.totalCandidates === 0 && res.results.length === 0,
          restoring: false,
        };
        stateRef.current = next;
        setState(next);
        const nextTabs = searchTabsRef.current.map((tab) => ({
          ...tab,
          state: {
            ...tab.state,
            recentQueries: nextHistory,
            ...(tab.id === targetTabId
              ? next
              : {}),
          },
        }));
        searchTabsRef.current = nextTabs;
        setSearchTabs(nextTabs);
      } catch (err) {
        if (
          requestRevision !== requestRevisionRef.current ||
          targetTabId !== activeSearchTabIdRef.current
        ) return;
        const message = err instanceof Error ? err.message : String(err);
        const next = {
          ...stateRef.current,
          loading: false,
          error: message,
          result: null,
          restoring: false,
        };
        stateRef.current = next;
        setState(next);
        onError?.(message);
      }
    },
    [onError, storageKey]
  );

  const runSearch = useCallback(
    async (queryInput?: string, filtersInput?: SearchFilters) => {
      hasInteractedRef.current = true;
      const previous = stateRef.current;
      const trimmed = (queryInput ?? previous.query).trim();
      if (!trimmed) return;
      const filters = filtersInput ? { ...filtersInput } : previous.filters;
      const next: LibrarySearchState = {
        ...previous,
        query: trimmed,
        filters,
        loading: true,
        error: null,
        // Avoid a blank-results flash while the replacement query is running.
        result: previous.result,
        selectedItemId: previous.selectedItemId,
        indexEmpty: false,
        restoring: false,
      };
      stateRef.current = next;
      setState(next);
      const requestRevision = ++requestRevisionRef.current;
      await executeSearch(
        { query: trimmed, mode: previous.mode, filters },
        requestRevision,
        activeSearchTabIdRef.current
      );
    },
    [executeSearch]
  );

  const openSearch = useCallback(
    ({ query, filters, mode }: LibrarySearchSnapshot) => {
      hasInteractedRef.current = true;
      const trimmed = query.trim();
      const snapshot = { query: trimmed, filters: { ...filters }, mode };
      const next: LibrarySearchState = {
        ...stateRef.current,
        ...snapshot,
        loading: !!trimmed,
        error: null,
        result: null,
        selectedItemId: null,
        indexEmpty: false,
        restoring: false,
      };
      stateRef.current = next;
      setState(next);
      setSearchTabs((tabs) => tabs.map((tab) =>
        tab.id === activeSearchTabIdRef.current
          ? {
              ...tab,
              kind: 'search',
              label: searchTabLabel('search', trimmed),
              tag: undefined,
              categoryId: undefined,
              state: next,
            }
          : tab
      ));
      const requestRevision = ++requestRevisionRef.current;
      if (trimmed) {
        void executeSearch(snapshot, requestRevision, activeSearchTabIdRef.current);
      }
    },
    [executeSearch]
  );

  const openDerivedSearchTab = useCallback((input: {
    kind: 'tag' | 'category';
    value: string;
    categoryId?: string;
  }) => {
    const value = input.value.trim();
    if (!value) return;
    hasInteractedRef.current = true;
    const currentState = stateRef.current;
    const baseFilters = {
      ...currentState.filters,
      categoryId: undefined,
      tag: undefined,
    };
    const filters: SearchFilters = baseFilters;
    const query = formatSearchFieldQuery(input.kind, value);
    const id = `${input.kind}-${Date.now()}-${++tabSequenceRef.current}`;
    const next: LibrarySearchState = {
      ...currentState,
      query,
      filters,
      loading: true,
      error: null,
      result: null,
      selectedItemId: null,
      indexEmpty: false,
      restoring: false,
    };
    const nextTabs: LibrarySearchTabRecord[] = [
      ...searchTabsRef.current.map((tab) =>
        tab.id === activeSearchTabIdRef.current ? { ...tab, state: currentState } : tab
      ),
      {
        id,
        kind: input.kind,
        label: searchTabLabel(input.kind, value),
        tag: input.kind === 'tag' ? value : undefined,
        categoryId: input.categoryId,
        state: next,
      },
    ];
    searchTabsRef.current = nextTabs;
    setSearchTabs(nextTabs);
    activeSearchTabIdRef.current = id;
    setActiveSearchTabId(id);
    stateRef.current = next;
    setState(next);
    const requestRevision = ++requestRevisionRef.current;
    void executeSearch(
      { query, filters, mode: currentState.mode },
      requestRevision,
      id
    );
  }, [executeSearch]);

  const openTagTab = useCallback((tag: string) => {
    openDerivedSearchTab({ kind: 'tag', value: tag });
  }, [openDerivedSearchTab]);

  const openCategoryTab = useCallback((categoryId: string, name: string) => {
    openDerivedSearchTab({ kind: 'category', value: name, categoryId });
  }, [openDerivedSearchTab]);

  const selectSearchTab = useCallback((id: string) => {
    if (id === activeSearchTabIdRef.current) return;
    const target = searchTabsRef.current.find((tab) => tab.id === id);
    if (!target) return;
    const currentHistory = stateRef.current.recentQueries;
    const nextTabs = searchTabsRef.current.map((tab) =>
      tab.id === activeSearchTabIdRef.current
        ? { ...tab, state: stateRef.current }
        : tab
    );
    searchTabsRef.current = nextTabs;
    setSearchTabs(nextTabs);
    activeSearchTabIdRef.current = id;
    setActiveSearchTabId(id);
    const next = { ...target.state, recentQueries: currentHistory };
    stateRef.current = next;
    setState(next);
    ++requestRevisionRef.current;
    if (next.loading && next.query.trim()) {
      const requestRevision = requestRevisionRef.current;
      void executeSearch(
        { query: next.query, filters: next.filters, mode: next.mode },
        requestRevision,
        id
      );
    }
  }, [executeSearch]);

  const closeSearchTab = useCallback((id: string) => {
    const tabs = searchTabsRef.current;
    if (tabs.length <= 1) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const remaining = tabs.filter((tab) => tab.id !== id);
    searchTabsRef.current = remaining;
    setSearchTabs(remaining);
    if (id !== activeSearchTabIdRef.current) return;
    const target = remaining[Math.max(0, Math.min(index - 1, remaining.length - 1))];
    activeSearchTabIdRef.current = target.id;
    setActiveSearchTabId(target.id);
    const next = {
      ...target.state,
      recentQueries: stateRef.current.recentQueries,
    };
    stateRef.current = next;
    setState(next);
    ++requestRevisionRef.current;
    if (next.loading && next.query.trim()) {
      const requestRevision = requestRevisionRef.current;
      void executeSearch(
        { query: next.query, filters: next.filters, mode: next.mode },
        requestRevision,
        target.id
      );
    }
  }, [executeSearch]);

  return {
    state,
    searchTabs: searchTabs.map(({ state: _state, ...tab }) => tab),
    activeSearchTabId,
    setQuery,
    setFilters,
    setMode,
    setSelectedItemId,
    clearRecentQueries,
    runSearch,
    openSearch,
    openTagTab,
    openCategoryTab,
    selectSearchTab,
    closeSearchTab,
  };
}
