/** Persisted shell navigation — restore view, scope, and hub UI when returning from other pages. */

export type PersistedDashboardView =
  | 'home'
  | 'search'
  | 'settings'
  | 'projects'
  | 'tab-commander'
  | 'import-studio'
  | 'pipeline'
  | 'bookmarks'
  | 'notes'
  | 'collections'
  | 'workspaces'
  | 'help'
  | 'trash';

export type PipelineHubPersistedState = {
  hubLane: 'enrichment' | 'categories';
  categoriesSubTab: 'queue' | 'taxonomy';
  enrichmentStatusFilter: string;
  enrichmentOutcomeLabel: string;
  enrichmentSearch: string;
  enrichmentTrashSuggestionsOnly: boolean;
  enrichmentFailureCategory: string;
  enrichmentFailureStage: string;
  enrichmentSelectedItemId: string | null;
  categoriesFilter: string;
  categoriesSearch: string;
  categoriesSelectedItemId: string | null;
};

export type NavigationPersistedState = {
  activeView: PersistedDashboardView;
  scopeProjectId: string;
  scopeCollectionId: string;
  recentProjectIds: string[];
  recentProjectAccessIds: string[];
  recentCollectionIdsByProject: Record<string, string[]>;
  pipelineHub: PipelineHubPersistedState;
};

const STORAGE_KEY = 'workbench-navigation-state';

export const PIPELINE_HUB_STATE_DEFAULT: PipelineHubPersistedState = {
  hubLane: 'enrichment',
  categoriesSubTab: 'queue',
  enrichmentStatusFilter: 'all',
  enrichmentOutcomeLabel: 'all',
  enrichmentSearch: '',
  enrichmentTrashSuggestionsOnly: false,
  enrichmentFailureCategory: 'all',
  enrichmentFailureStage: 'all',
  enrichmentSelectedItemId: null,
  categoriesFilter: 'needs_attention',
  categoriesSearch: '',
  categoriesSelectedItemId: null,
};

export const NAVIGATION_STATE_DEFAULT: NavigationPersistedState = {
  activeView: 'home',
  scopeProjectId: 'all',
  scopeCollectionId: 'all',
  recentProjectIds: [],
  recentProjectAccessIds: [],
  recentCollectionIdsByProject: {},
  pipelineHub: PIPELINE_HUB_STATE_DEFAULT,
};

const VALID_VIEWS = new Set<string>([
  'home',
  'search',
  'settings',
  'projects',
  'tab-commander',
  'import-studio',
  'pipeline',
  'bookmarks',
  'notes',
  'collections',
  'workspaces',
  'help',
  'trash',
]);

function normalizeView(raw: unknown): PersistedDashboardView {
  if (raw === 'ai-categories') return 'pipeline';
  if (typeof raw === 'string' && VALID_VIEWS.has(raw)) return raw as PersistedDashboardView;
  return NAVIGATION_STATE_DEFAULT.activeView;
}

function normalizePipelineHub(raw: Partial<PipelineHubPersistedState> | undefined): PipelineHubPersistedState {
  const base = PIPELINE_HUB_STATE_DEFAULT;
  return {
    hubLane: raw?.hubLane === 'categories' ? 'categories' : 'enrichment',
    categoriesSubTab: raw?.categoriesSubTab === 'taxonomy' ? 'taxonomy' : 'queue',
    enrichmentStatusFilter:
      typeof raw?.enrichmentStatusFilter === 'string' ? raw.enrichmentStatusFilter : base.enrichmentStatusFilter,
    enrichmentOutcomeLabel:
      typeof raw?.enrichmentOutcomeLabel === 'string' ? raw.enrichmentOutcomeLabel : 'all',
    enrichmentSearch: typeof raw?.enrichmentSearch === 'string' ? raw.enrichmentSearch : '',
    enrichmentTrashSuggestionsOnly: !!raw?.enrichmentTrashSuggestionsOnly,
    enrichmentFailureCategory:
      typeof raw?.enrichmentFailureCategory === 'string' ? raw.enrichmentFailureCategory : 'all',
    enrichmentFailureStage:
      typeof raw?.enrichmentFailureStage === 'string' ? raw.enrichmentFailureStage : 'all',
    enrichmentSelectedItemId:
      typeof raw?.enrichmentSelectedItemId === 'string' ? raw.enrichmentSelectedItemId : null,
    categoriesFilter: typeof raw?.categoriesFilter === 'string' ? raw.categoriesFilter : base.categoriesFilter,
    categoriesSearch: typeof raw?.categoriesSearch === 'string' ? raw.categoriesSearch : '',
    categoriesSelectedItemId:
      typeof raw?.categoriesSelectedItemId === 'string' ? raw.categoriesSelectedItemId : null,
  };
}

function normalizeNavigationState(
  raw: (Partial<NavigationPersistedState> & { activeView?: string }) | null | undefined
): NavigationPersistedState {
  const rawView = raw?.activeView as string | undefined;
  const hub = normalizePipelineHub(raw?.pipelineHub);
  const recentProjectIds = Array.isArray(raw?.recentProjectIds)
    ? Array.from(new Set(raw.recentProjectIds.filter((id): id is string => typeof id === 'string'))).slice(0, 5)
    : [];
  if (rawView === 'ai-categories') {
    hub.hubLane = 'categories';
    hub.categoriesSubTab = 'taxonomy';
  }
  return {
    activeView: normalizeView(rawView),
    scopeProjectId: typeof raw?.scopeProjectId === 'string' ? raw.scopeProjectId : 'all',
    scopeCollectionId: typeof raw?.scopeCollectionId === 'string' ? raw.scopeCollectionId : 'all',
    recentProjectIds,
    recentProjectAccessIds: Array.isArray(raw?.recentProjectAccessIds)
      ? Array.from(new Set(raw.recentProjectAccessIds.filter((id): id is string => typeof id === 'string'))).slice(0, 12)
      : recentProjectIds,
    recentCollectionIdsByProject:
      raw?.recentCollectionIdsByProject &&
      typeof raw.recentCollectionIdsByProject === 'object' &&
      !Array.isArray(raw.recentCollectionIdsByProject)
        ? Object.fromEntries(
            Object.entries(raw.recentCollectionIdsByProject)
              .filter(([projectId, ids]) => projectId.length > 0 && Array.isArray(ids))
              .map(([projectId, ids]) => [
                projectId,
                Array.from(new Set(ids.filter((id): id is string => typeof id === 'string'))).slice(0, 5),
              ])
          )
        : {},
    pipelineHub: hub,
  };
}

let cached: NavigationPersistedState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function loadNavigationState(): NavigationPersistedState {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cached = NAVIGATION_STATE_DEFAULT;
      return cached;
    }
    cached = normalizeNavigationState(JSON.parse(raw) as Partial<NavigationPersistedState>);
    return cached;
  } catch {
    cached = NAVIGATION_STATE_DEFAULT;
    return cached;
  }
}

export function saveNavigationState(state: NavigationPersistedState): void {
  cached = normalizeNavigationState(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // ignore quota errors
  }
}

export function saveNavigationStateDebounced(state: NavigationPersistedState, delayMs = 200): void {
  cached = normalizeNavigationState(state);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveNavigationState(cached!);
    saveTimer = null;
  }, delayMs);
}

export function patchNavigationState(
  patch: Partial<Omit<NavigationPersistedState, 'pipelineHub'>> & {
    pipelineHub?: Partial<PipelineHubPersistedState>;
  }
): NavigationPersistedState {
  const current = loadNavigationState();
  const next: NavigationPersistedState = {
    ...current,
    ...patch,
    pipelineHub: patch.pipelineHub ? normalizePipelineHub({ ...current.pipelineHub, ...patch.pipelineHub }) : current.pipelineHub,
  };
  saveNavigationStateDebounced(next);
  return next;
}
