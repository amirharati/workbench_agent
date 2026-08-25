import React, { useMemo } from 'react';
import { FileText, Folder, Home as HomeIcon, Layers3, Search, GripVertical, X } from 'lucide-react';
import type { Item, Collection, Project, UpdateItemOptions, Workspace } from '../../lib/db';
import type { GlobalTab, GlobalTabState, GlobalTabList, GlobalTabSearch, SavedWorkspaceSession } from './GlobalTabSystem';
import { ItemContextMenu } from './ItemContextMenu';
import { DeleteConfirmDialog } from '../DeleteConfirmDialog';
import { useLibrarySearch } from '../../hooks/useLibrarySearch';
import { LibraryLoadingPlaceholder } from './LibraryLoadingPlaceholder';
import { ProductSearchView } from './ProductSearchView';
import { getHomeScopeItems, getProjectCollections, getProjectHomeSummary, reorderProjectSwitcher } from './homeScope';
import { ProjectHomeWorkspace } from './ProjectHomeWorkspace';
import { ContentBrowser, useContentBrowseMode, type ContentBrowseEntry } from './ContentBrowser';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import { Resizer } from './Resizer';
import { WorkspaceDestinationPicker } from './WorkspaceDestinationPicker';
import { LinkVisual } from './LinkVisual';
import { HomeCategoriesView } from './HomeCategoriesView';
import {
  AllLibraryWorkspaceOverview,
  normalizeAllLibraryItemFilter,
  normalizeAllLibraryView,
  type AllLibraryItemFilter,
  type WorkspaceViewGroup,
} from './AllLibraryWorkspaceOverview';
import type { AllLibraryView } from './AllLibraryWorkspaceOverview';
import { homePageUiKey, loadPageUiState, savePageUiState } from '../../lib/shell/pageUiState';
import {
  activateProjectWorkspace,
  activateSavedProjectWorkspace,
  activateWorkspace as activateWorkspaceByKey,
  addEntryToProjectWorkspace,
  addItemToWorkspaceTarget,
  createProjectWorkspace,
  deleteSavedProjectWorkspace,
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionWorkspaceKey,
  getProjectWorkspaceTabs,
  getSavedWorkspaceSessionKey,
  getWorkspaceProjectId,
  mergeSavedProjectWorkspace,
  removeEntryFromProjectWorkspace,
  renameSavedProjectWorkspace,
  transferProjectWorkspaceEntry,
  workspaceTargetContainsItem,
} from './workspaceSession';
import {
  buildWorkspaceDestinations,
  filterWorkspaceSwitcherDestinations,
  rememberWorkspaceDestination,
  type WorkspaceDestination,
} from './workspaceDestinations';
import { uiPatterns } from '../../styles/uiPatterns';

type LibrarySearchApi = ReturnType<typeof useLibrarySearch>;

const SEARCH_COMPANION_DEFAULT_HEIGHT = 330;
const SEARCH_COMPANION_MIN_HEIGHT = 170;
const SEARCH_RESULTS_MIN_HEIGHT = 220;

function normalizeSearchCompanionHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SEARCH_COMPANION_DEFAULT_HEIGHT;
  return Math.max(SEARCH_COMPANION_MIN_HEIGHT, Math.min(720, Math.round(value)));
}

// ===== Props =====
interface HomeViewProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  workspaces: Workspace[];
  homeState: GlobalTabState;
  onHomeStateChange: (next: GlobalTabState) => void;
  onUpdateItem?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>, options?: UpdateItemOptions) => Promise<void>;
  onDeleteBookmark?: (id: string, collectionIds?: string | string[]) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onSearchQueryChange: (query: string) => void;
  librarySearch?: LibrarySearchApi;
  workingSearch?: LibrarySearchApi;
  onOpenItemFromSearch?: (item: Item, origin?: { projectId?: string; collectionId?: string }) => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  focusedCategory?: { categoryId: string; name: string } | null;
  onExitFocusedCategory?: () => void;
  onBatchProcessQueue?: (kind: import('../../lib/pipeline').PipelineQueueKind) => Promise<void>;
  onOpenPipelineHub?: () => void;
  batchRunning?: boolean;
  batchCancellable?: boolean;
  onCancelBatch?: () => void;
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  scopeNavigationRevision?: number;
  recentProjectIds?: string[];
  recentProjectAccessIds?: string[];
  onSelectProjectScope?: (projectId: string | 'all') => void;
  onReorderProjectScopes?: (projectIds: string[]) => void;
  onCloseProjectScope?: (projectId: string) => void;
  onSelectCollectionScope?: (collectionId: string, projectId?: string) => void;
  onResetScope?: () => void;
  onSwitchScopeForItem?: (item: Item) => void;
  onSelectedBrowseItemChange?: (item: Item | null) => void;
  renderListTab?: (tab: any) => React.ReactNode;
  statusBar?: React.ReactNode;
  libraryLoading?: boolean;
  libraryHydrateProgress?: { label: string; percent?: number } | null;
}

export const HomeView: React.FC<HomeViewProps> = ({
  items, collections, projects, workspaces, homeState, onHomeStateChange, onUpdateItem, onDeleteBookmark, onCreateProject, onCreateCollection, onSearchQueryChange, librarySearch, onOpenPipelineHub, onBrowseCategory, focusedCategory, onExitFocusedCategory, scopeProjectId = 'all', scopeCollectionId = 'all', scopeNavigationRevision = 0, recentProjectIds = [], recentProjectAccessIds = [], onSelectProjectScope, onReorderProjectScopes, onCloseProjectScope, onSelectCollectionScope, onResetScope, onSelectedBrowseItemChange, libraryLoading = false, libraryHydrateProgress = null
}) => {
  const [homeItemContextMenu, setHomeItemContextMenu] = React.useState<{
    item: Item;
    x: number;
    y: number;
  } | null>(null);
  const [libraryRemovalTarget, setLibraryRemovalTarget] = React.useState<Item | null>(null);
  const requestLibraryRemoval = React.useCallback((item: Item) => {
    if (onDeleteBookmark && !item.deletedAt) setLibraryRemovalTarget(item);
  }, [onDeleteBookmark]);
  const [draggedProjectId, setDraggedProjectId] = React.useState<string | null>(null);
  const pageUiKey = homePageUiKey(scopeProjectId, scopeCollectionId);
  const [initialPageUi] = React.useState(() => loadPageUiState(pageUiKey, {
    selectedOverviewItemId: null as string | null,
    selectedAllLibraryWorkspaceTabId: null as string | null,
    allLibraryWorkspaceView: 'global',
    allLibraryActiveView: 'all' as AllLibraryView,
    allLibraryItemFilter: 'all' as AllLibraryItemFilter,
    projectLauncherQuery: '',
    searchCompanionView: 'workspace' as 'workspace' | 'collection',
    searchCompanionCollectionId: null as string | null,
    searchCompanionHeight: SEARCH_COMPANION_DEFAULT_HEIGHT,
  }));
  const [selectedOverviewItemId, setSelectedOverviewItemId] = React.useState<string | null>(
    initialPageUi.selectedOverviewItemId
  );
  const [selectedAllLibraryWorkspaceTabId, setSelectedAllLibraryWorkspaceTabId] = React.useState<string | null>(
    initialPageUi.selectedAllLibraryWorkspaceTabId
  );
  const [allLibraryWorkspaceView, setAllLibraryWorkspaceView] = React.useState(initialPageUi.allLibraryWorkspaceView);
  const [allLibraryActiveView, setAllLibraryActiveView] = React.useState<AllLibraryView>(() =>
    normalizeAllLibraryView(initialPageUi.allLibraryActiveView)
  );
  const [allLibraryItemFilter, setAllLibraryItemFilter] = React.useState<AllLibraryItemFilter>(
    normalizeAllLibraryItemFilter(initialPageUi.allLibraryItemFilter)
  );
  const [projectLauncherQuery, setProjectLauncherQuery] = React.useState(initialPageUi.projectLauncherQuery);
  const [searchCompanionView, setSearchCompanionView] = React.useState<'workspace' | 'collection'>(() =>
    initialPageUi.searchCompanionView === 'collection' ? 'collection' : 'workspace'
  );
  const [searchCompanionCollectionId, setSearchCompanionCollectionId] = React.useState<string | null>(
    initialPageUi.searchCompanionCollectionId
  );
  const [searchCompanionHeight, setSearchCompanionHeight] = React.useState(() =>
    normalizeSearchCompanionHeight(initialPageUi.searchCompanionHeight)
  );
  const searchLayoutRef = React.useRef<HTMLDivElement>(null);
  const searchCompanionRef = React.useRef<HTMLDivElement>(null);
  const [searchCollectionBrowseMode, setSearchCollectionBrowseMode] = useContentBrowseMode(
    'workbench:search-companion-collection-view:v1'
  );
  const [searchWorkspaceBrowseMode, setSearchWorkspaceBrowseMode] = useContentBrowseMode(
    'workbench:search-companion-workspace-view:v1'
  );
  React.useEffect(() => {
    savePageUiState(pageUiKey, {
      selectedOverviewItemId,
      selectedAllLibraryWorkspaceTabId,
      allLibraryWorkspaceView,
      allLibraryActiveView,
      allLibraryItemFilter,
      projectLauncherQuery,
      searchCompanionView,
      searchCompanionCollectionId,
      searchCompanionHeight,
    });
  }, [allLibraryActiveView, allLibraryItemFilter, allLibraryWorkspaceView, pageUiKey, projectLauncherQuery, searchCompanionCollectionId, searchCompanionHeight, searchCompanionView, selectedAllLibraryWorkspaceTabId, selectedOverviewItemId]);

  const resizeSearchCompanion = React.useCallback((delta: number) => {
    setSearchCompanionHeight((previous) => {
      const renderedHeight = searchCompanionRef.current?.getBoundingClientRect().height;
      const current = renderedHeight && renderedHeight > 0 ? renderedHeight : previous;
      const layoutHeight = searchLayoutRef.current?.getBoundingClientRect().height;
      const maximum = layoutHeight && layoutHeight > 0
        ? Math.max(SEARCH_COMPANION_MIN_HEIGHT, layoutHeight - SEARCH_RESULTS_MIN_HEIGHT)
        : 720;
      return Math.round(Math.max(SEARCH_COMPANION_MIN_HEIGHT, Math.min(maximum, current + delta)));
    });
  }, []);

  const activeProject = useMemo(
    () => (scopeProjectId === 'all' ? undefined : projects.find((project) => project.id === scopeProjectId)),
    [projects, scopeProjectId]
  );
  const activeCollection = useMemo(
    () => (scopeCollectionId === 'all' ? undefined : collections.find((collection) => collection.id === scopeCollectionId)),
    [collections, scopeCollectionId]
  );
  const projectCollections = useMemo(
    () => getProjectCollections(collections, scopeProjectId),
    [collections, scopeProjectId]
  );
  const scopedItems = useMemo(
    () => getHomeScopeItems(items, collections, scopeProjectId, scopeCollectionId),
    [items, collections, scopeProjectId, scopeCollectionId]
  );
  const projectItems = useMemo(
    () => getHomeScopeItems(items, collections, scopeProjectId, 'all'),
    [items, collections, scopeProjectId]
  );
  const projectWorkspaces = useMemo(
    () =>
      activeProject
        ? workspaces
            .filter((workspace) => workspace.projectId === activeProject.id)
            .sort((a, b) => b.updated_at - a.updated_at)
        : [],
    [activeProject, workspaces]
  );
  const projectSavedWorkspaceSessions = useMemo(
    () =>
      activeProject
        ? (homeState.savedWorkspaceSessions ?? [])
            .filter((session) => session.projectId === activeProject.id)
            .sort((a, b) => b.updatedAt - a.updatedAt)
        : [],
    [activeProject, homeState.savedWorkspaceSessions]
  );
  const allLibraryWorkspaceGroups = useMemo<WorkspaceViewGroup[]>(() => {
    const globalTabs = getProjectWorkspaceTabs(
      homeState,
      'all',
      getProjectSessionWorkspaceKey('all')
    );
    const projectGroups = projects
      .map((project) => {
        const activeKey = getProjectSessionWorkspaceKey(project.id);
        const tabs = getProjectWorkspaceTabs(homeState, project.id, activeKey);
        const savedSession = homeState.savedWorkspaceSessions?.find(
          (session) => getHomebaseWorkspaceSessionKey(session.id) === activeKey
        );
        const savedWorkspace = workspaces.find(
          (workspace) => getSavedWorkspaceSessionKey(workspace.id) === activeKey
        );
        return {
          key: `project:${project.id}`,
          title: savedSession?.name ?? savedWorkspace?.name ?? 'General',
          contextLabel: project.name,
          projectId: project.id,
          tabs,
        } satisfies WorkspaceViewGroup;
      })
      .filter((group) => group.tabs.length > 0);
    return [
      {
        key: 'global',
        title: 'Global workspace',
        contextLabel: 'All Library',
        projectId: 'all',
        tabs: globalTabs,
      },
      ...projectGroups,
    ];
  }, [homeState, projects, workspaces]);
  const selectedAllLibraryWorkspaceTab = useMemo(
    () => homeState.tabs.find((tab) => tab.id === selectedAllLibraryWorkspaceTabId) ?? null,
    [homeState.tabs, selectedAllLibraryWorkspaceTabId]
  );
  const selectedOverviewItem = useMemo(
    () => items.find((item) => item.id === selectedOverviewItemId) ?? null,
    [items, selectedOverviewItemId]
  );

  React.useEffect(() => {
    if (selectedOverviewItemId) {
      if (selectedOverviewItem) {
        onSelectedBrowseItemChange?.(selectedOverviewItem);
      } else if (items.length > 0) {
        setSelectedOverviewItemId(null);
      }
      return;
    }
    if (selectedAllLibraryWorkspaceTabId) {
      if (selectedAllLibraryWorkspaceTab) {
        onSelectedBrowseItemChange?.(
          selectedAllLibraryWorkspaceTab.kind === 'item'
            ? items.find((item) => item.id === selectedAllLibraryWorkspaceTab.itemId) ?? null
            : null
        );
      } else if (homeState.tabs.length > 0) {
        setSelectedAllLibraryWorkspaceTabId(null);
      }
    }
  }, [homeState.tabs.length, items, onSelectedBrowseItemChange, selectedAllLibraryWorkspaceTab, selectedAllLibraryWorkspaceTabId, selectedOverviewItem, selectedOverviewItemId]);

  React.useEffect(() => {
    if (
      allLibraryWorkspaceView.startsWith('project:') &&
      !allLibraryWorkspaceGroups.some((group) => group.key === allLibraryWorkspaceView)
    ) {
      setAllLibraryWorkspaceView('global');
    }
  }, [allLibraryWorkspaceGroups, allLibraryWorkspaceView]);

  React.useEffect(() => {
    if (scopeProjectId !== 'all' || !homeState.activeTabId) return;
    const requestedEntry = homeState.tabs.find((entry) => entry.id === homeState.activeTabId);
    if (!requestedEntry) return;
    setAllLibraryActiveView('workspace');
    setAllLibraryWorkspaceView('global');
    setSelectedAllLibraryWorkspaceTabId(requestedEntry.id);
    setSelectedOverviewItemId(null);
  }, [homeState.activeTabId, homeState.tabs, scopeProjectId]);
  const currentSessionTabs = homeState.tabs;
  const activeWorkspaceKey = getActiveProjectWorkspaceKey(homeState, scopeProjectId);
  const workspaceDestinations = useMemo(
    () => buildWorkspaceDestinations({
      projects,
      browserWorkspaces: workspaces,
      state: homeState,
      contextProjectId: scopeProjectId,
    }),
    [homeState, projects, scopeProjectId, workspaces]
  );
  const activeWorkspaceDestination = workspaceDestinations.find(
    (destination) => destination.key === activeWorkspaceKey
  );
  const workspaceSwitcherDestinations = useMemo(
    () => filterWorkspaceSwitcherDestinations({
      destinations: workspaceDestinations,
      openProjectIds: recentProjectIds,
      contextProjectId: scopeProjectId,
      activeWorkspaceKey,
    }),
    [activeWorkspaceKey, recentProjectIds, scopeProjectId, workspaceDestinations]
  );
  const projectWorkspaceDestinations = useMemo(
    () => activeProject
      ? [
          ...workspaceSwitcherDestinations
            .map((destination) => ({ key: destination.key, label: destination.path })),
          ...projectWorkspaces
            .filter((workspace) => workspace.projectId === activeProject.id)
            .map((workspace) => ({
              key: getSavedWorkspaceSessionKey(workspace.id),
              label: `Snapshot · ${workspace.name}`,
            })),
        ]
      : [],
    [activeProject, projectWorkspaces, workspaceSwitcherDestinations]
  );
  const projectWorkspaceManagerEntries = useMemo(() => activeProject
    ? [
        {
          key: getProjectSessionWorkspaceKey(activeProject.id),
          name: 'General',
          count: getProjectWorkspaceTabs(homeState, activeProject.id, getProjectSessionWorkspaceKey(activeProject.id)).length,
        },
        ...projectSavedWorkspaceSessions.map((session) => ({
          key: getHomebaseWorkspaceSessionKey(session.id),
          name: session.name,
          count: getProjectWorkspaceTabs(homeState, activeProject.id, getHomebaseWorkspaceSessionKey(session.id)).length,
          sessionId: session.id,
        })),
      ]
    : [],
    [activeProject, homeState, projectSavedWorkspaceSessions]
  );
  const projectSummaries = useMemo(
    () =>
      projects.map((project) => getProjectHomeSummary(project, items, collections)),
    [projects, items, collections]
  );
  const recentProjects = useMemo(
    () => {
      const visibleProjects = recentProjectIds
        .map((projectId) => projects.find((project) => project.id === projectId))
        .filter((project): project is Project => project != null);
      if (activeProject && !visibleProjects.some((project) => project.id === activeProject.id)) {
        visibleProjects.unshift(activeProject);
      }
      return visibleProjects;
    },
    [activeProject, recentProjectIds, projects]
  );
  const favoriteItems = useMemo(
    () => scopedItems
      .filter((item) => item.favoriteAt != null)
      .sort((left, right) => (right.favoriteAt ?? 0) - (left.favoriteAt ?? 0)),
    [scopedItems]
  );
  const hasStartupContent = projects.length > 0 || collections.length > 0 || items.length > 0;

  type HomeUtilTabId =
    | 'util-pinned'
    | 'util-favorites'
    | 'util-quick-access'
    | 'util-recent'
    | 'util-trash';

  const activeWorkspaceProjectId = getWorkspaceProjectId(homeState, activeWorkspaceKey);
  const currentTabScope = {
    ...(activeWorkspaceProjectId !== 'all' ? { scopeProjectId: activeWorkspaceProjectId } : {}),
    ...(activeWorkspaceProjectId !== 'all' && scopeProjectId === activeWorkspaceProjectId && scopeCollectionId !== 'all' ? { scopeCollectionId } : {}),
  };
  const scopedTabId = (baseId: string) =>
    activeWorkspaceProjectId === 'all' ? baseId : `${baseId}@project:${activeWorkspaceProjectId}`;

  const focusSessionTab = (tabs: GlobalTabState['tabs'], activeTabId: string) => {
    const workspaceKey = homeState.activeWorkspaceKey ?? getProjectSessionWorkspaceKey('all');
    onHomeStateChange({
      ...homeState,
      tabs,
      activeTabId,
      showAllTabs: false,
      lastActiveEntryByWorkspace: {
        ...(homeState.lastActiveEntryByWorkspace ?? {}),
        [workspaceKey]: activeTabId,
      },
    });
  };

  const HOME_UTIL_META: Record<HomeUtilTabId, { listType: GlobalTabList['listType']; title: string }> = {
    'util-pinned': { listType: 'pinned', title: 'Pinned' },
    'util-favorites': { listType: 'favorites', title: 'Favorites' },
    'util-quick-access': { listType: 'quick-access', title: 'Favorites & pins' },
    'util-recent': { listType: 'recent', title: 'Recent' },
    'util-trash': { listType: 'trash', title: 'Trash' },
  };

  const openUtilityTab = (tabId: HomeUtilTabId) => {
    const meta = HOME_UTIL_META[tabId];
    const id = scopedTabId(tabId);
    const existing = homeState.tabs.find((t) => t.id === id);
    if (existing) {
      focusSessionTab(homeState.tabs, id);
      return;
    }
    focusSessionTab(
      [
        ...homeState.tabs,
        { kind: 'list' as const, id, listType: meta.listType, title: meta.title, ...currentTabScope },
      ],
      id
    );
  };

  const addItemToCurrentSession = (item: Item) => {
    const workspaceKey = homeState.activeWorkspaceKey ?? getProjectSessionWorkspaceKey('all');
    onHomeStateChange(addItemToWorkspaceTarget({
      state: homeState,
      projectId: activeWorkspaceProjectId,
      targetWorkspaceKey: workspaceKey,
      item,
      items,
    }));
  };

  const searchEntryInDestination = (destination: WorkspaceDestination) => {
    if (!librarySearch) return undefined;
    const query = librarySearch.state.query.trim();
    if (!query) return undefined;
    const filters = { ...librarySearch.state.filters };
    const mode = librarySearch.state.mode;
    return getProjectWorkspaceTabs(homeState, destination.projectId, destination.key).find(
      (tab): tab is GlobalTabSearch =>
        tab.kind === 'search' &&
        tab.query.trim().toLowerCase() === query.toLowerCase() &&
        (tab.mode === 'lexical-only' ? 'lexical-only' : 'hybrid') === mode &&
        JSON.stringify(tab.filters ?? {}) === JSON.stringify(filters)
    );
  };

  const addSearchToWorkspaceDestination = (destination: WorkspaceDestination): GlobalTabState => {
    if (!librarySearch) return homeState;
    const query = librarySearch.state.query.trim();
    if (!query) return homeState;
    if (searchEntryInDestination(destination)) return homeState;
    const id = `search-${crypto.randomUUID()}${destination.projectId === 'all' ? '' : `@project:${destination.projectId}`}`;
    const searchTab: GlobalTabSearch = {
      kind: 'search',
      id,
      query,
      filters: { ...librarySearch.state.filters },
      mode: librarySearch.state.mode,
      ...(destination.projectId !== 'all' ? { scopeProjectId: destination.projectId } : {}),
    };
    const added = addEntryToProjectWorkspace({
      state: homeState,
      projectId: destination.projectId,
      targetWorkspaceKey: destination.key,
      entry: searchTab,
    });
    return {
      ...added,
      recentWorkspaceDestinationKeys: rememberWorkspaceDestination(
        added.recentWorkspaceDestinationKeys,
        destination.key
      ),
    };
  };

  const addSearchToWorkspace = (destination: WorkspaceDestination) => {
    onHomeStateChange(addSearchToWorkspaceDestination(destination));
  };

  const viewSearchWorkspace = (destination: WorkspaceDestination) => {
    const added = addSearchToWorkspaceDestination(destination);
    const activated = activateWorkspaceByKey({
      state: added,
      workspaceKey: destination.key,
      projectId: destination.projectId,
    });
    const query = librarySearch?.state.query.trim().toLowerCase() ?? '';
    const filters = JSON.stringify(librarySearch?.state.filters ?? {});
    const mode = librarySearch?.state.mode ?? 'hybrid';
    const entry = activated.tabs.find(
      (candidate): candidate is GlobalTabSearch =>
        candidate.kind === 'search' &&
        candidate.query.trim().toLowerCase() === query &&
        (candidate.mode === 'lexical-only' ? 'lexical-only' : 'hybrid') === mode &&
        JSON.stringify(candidate.filters ?? {}) === filters
    );
    onHomeStateChange({
      ...activated,
      homeSection: 'overview',
      activeTabId: entry?.id ?? activated.activeTabId,
      lastActiveEntryByWorkspace: entry
        ? { ...(activated.lastActiveEntryByWorkspace ?? {}), [destination.key]: entry.id }
        : activated.lastActiveEntryByWorkspace,
    });
    if (destination.projectId === 'all') {
      setAllLibraryActiveView('workspace');
      setAllLibraryWorkspaceView('global');
      setSelectedAllLibraryWorkspaceTabId(entry?.id ?? null);
      setSelectedOverviewItemId(null);
      onResetScope?.();
    } else {
      onSelectProjectScope?.(destination.projectId);
    }
  };

  const selectCurrentWorkspaceEntry = (tab: GlobalTab) => {
    const workspaceKey = homeState.activeWorkspaceKey ?? getProjectSessionWorkspaceKey('all');
    const nextState: GlobalTabState = {
      ...homeState,
      activeTabId: null,
      lastActiveEntryByWorkspace: {
        ...(homeState.lastActiveEntryByWorkspace ?? {}),
        [workspaceKey]: tab.id,
      },
    };
    if (tab.kind === 'search' && librarySearch) {
      librarySearch.openSearch({
        query: tab.query,
        filters: { ...(tab.filters ?? {}) },
        mode: tab.mode === 'lexical-only' ? 'lexical-only' : 'hybrid',
      });
      nextState.homeSection = 'search';
      nextState.searchQuery = tab.query;
    } else if (tab.kind === 'item') {
      librarySearch?.setSelectedItemId(tab.itemId);
    }
    onHomeStateChange(nextState);
  };

  const selectOverviewItem = (item: Item) => {
    setSelectedOverviewItemId(item.id);
    setSelectedAllLibraryWorkspaceTabId(null);
    onSelectedBrowseItemChange?.(item);
  };

  const selectAllLibraryWorkspaceEntry = (tab: GlobalTab) => {
    const workspaceKey = Object.entries(homeState.workspaceSessionSnapshots ?? {})
      .find(([, entries]) => entries.some((entry) => entry.id === tab.id))?.[0]
      ?? homeState.activeWorkspaceKey
      ?? getProjectSessionWorkspaceKey('all');
    setSelectedAllLibraryWorkspaceTabId(tab.id);
    setSelectedOverviewItemId(null);
    onSelectedBrowseItemChange?.(
      tab.kind === 'item' ? items.find((item) => item.id === tab.itemId) ?? null : null
    );
    onHomeStateChange({
      ...homeState,
      activeTabId: null,
      lastActiveEntryByWorkspace: {
        ...(homeState.lastActiveEntryByWorkspace ?? {}),
        [workspaceKey]: tab.id,
      },
    });
  };

  const clearAllLibrarySelection = () => {
    setSelectedOverviewItemId(null);
    setSelectedAllLibraryWorkspaceTabId(null);
    onSelectedBrowseItemChange?.(null);
  };

  const effectiveSearchScopeLabel = librarySearch?.state.filters.collectionId
    ? collections.find((collection) => collection.id === librarySearch.state.filters.collectionId)?.name ?? 'Collection'
    : librarySearch?.state.filters.projectId
      ? projects.find((project) => project.id === librarySearch.state.filters.projectId)?.name ?? 'Project'
      : 'All Library';
  const filteredSearchCollection = librarySearch?.state.filters.collectionId
    ? collections.find((collection) => collection.id === librarySearch.state.filters.collectionId)
    : undefined;
  const filteredSearchProject = librarySearch?.state.filters.projectId
    ? projects.find((project) => project.id === librarySearch.state.filters.projectId)
    : undefined;
  const searchCollections = useMemo(() => {
    if (filteredSearchProject) return getProjectCollections(collections, filteredSearchProject.id);
    if (filteredSearchCollection) {
      return getProjectCollections(collections, filteredSearchCollection.primaryProjectId);
    }
    return collections;
  }, [collections, filteredSearchCollection, filteredSearchProject]);
  const selectedSearchCompanionCollection = useMemo(() => {
    const selected = searchCollections.find((collection) => collection.id === searchCompanionCollectionId);
    if (selected) return selected;
    if (activeCollection) {
      const scoped = searchCollections.find((collection) => collection.id === activeCollection.id);
      if (scoped) return scoped;
    }
    return searchCollections.find((collection) => collection.isDefault) ?? searchCollections[0];
  }, [activeCollection, searchCollections, searchCompanionCollectionId]);
  React.useEffect(() => {
    const resolvedId = selectedSearchCompanionCollection?.id ?? null;
    if (resolvedId !== searchCompanionCollectionId) setSearchCompanionCollectionId(resolvedId);
  }, [searchCompanionCollectionId, selectedSearchCompanionCollection]);
  const searchCompanionCollectionItems = useMemo(
    () => selectedSearchCompanionCollection
      ? items
          .filter((item) => item.collectionIds.includes(selectedSearchCompanionCollection.id))
          .sort((a, b) => b.updated_at - a.updated_at)
      : [],
    [items, selectedSearchCompanionCollection]
  );
  const searchCompanionCollectionEntries = useMemo<ContentBrowseEntry[]>(() => {
    if (!selectedSearchCompanionCollection) return [];
    const source = {
      kind: 'collection' as const,
      containerId: selectedSearchCompanionCollection.id,
      containerLabel: selectedSearchCompanionCollection.name,
      projectId: selectedSearchCompanionCollection.primaryProjectId,
    };
    return searchCompanionCollectionItems.map((item) => ({
      id: item.id,
      title: item.title || 'Untitled',
      icon: item.url ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} /> : <FileText size={12} />,
      subtitle: item.url || item.notes || 'Empty note',
      searchText: `${item.tags.join(' ')} ${item.notes ?? ''}`,
      actions: <ItemQuickAccessMarkers item={item} size={12} />,
      dragSource: source,
      dragItem: item,
    }));
  }, [searchCompanionCollectionItems, selectedSearchCompanionCollection]);
  const searchScopeOptions = [
    ...(filteredSearchCollection ? [{ value: `collection:${filteredSearchCollection.id}`, label: filteredSearchCollection.name }] : []),
    ...(activeCollection && activeCollection.id !== filteredSearchCollection?.id ? [{ value: `collection:${activeCollection.id}`, label: activeCollection.name }] : []),
    ...(activeProject ? [{ value: `project:${activeProject.id}`, label: activeProject.name }] : []),
    ...(filteredSearchProject && filteredSearchProject.id !== activeProject?.id ? [{ value: `project:${filteredSearchProject.id}`, label: filteredSearchProject.name }] : []),
    { value: 'all', label: 'All Library' },
  ];
  const searchScopeValue = filteredSearchCollection
    ? `collection:${filteredSearchCollection.id}`
    : filteredSearchProject
      ? `project:${filteredSearchProject.id}`
      : 'all';
  const changeSearchScope = (value: string) => {
    if (!librarySearch) return;
    const projectId = value.startsWith('project:') ? value.slice('project:'.length) : undefined;
    const collectionId = value.startsWith('collection:') ? value.slice('collection:'.length) : undefined;
    const filters = {
      ...librarySearch.state.filters,
      projectId,
      collectionId,
    };
    const snapshot = {
      query: librarySearch.state.query,
      filters,
      mode: librarySearch.state.mode,
    };
    if (snapshot.query.trim()) librarySearch.openSearch(snapshot);
    else librarySearch.setFilters(filters);
  };
  const getWorkspaceEntryScopeLabel = (tab: GlobalTab) => {
    if (tab.kind !== 'search') return tab.scopeProjectId ? undefined : 'Global';
    if (tab.filters?.collectionId) {
      return collections.find((collection) => collection.id === tab.filters?.collectionId)?.name ?? 'Collection';
    }
    if (tab.filters?.projectId) {
      return projects.find((project) => project.id === tab.filters?.projectId)?.name ?? 'Project';
    }
    return 'All Library';
  };
  const searchCompanionWorkspaceEntries = useMemo<ContentBrowseEntry[]>(() => {
    const target = {
      kind: 'workspace' as const,
      containerId: activeWorkspaceKey,
      containerLabel: activeWorkspaceDestination?.workspaceName ?? 'Global workspace',
      projectId: activeWorkspaceDestination?.projectId ?? 'all',
    };
    return currentSessionTabs.map((tab) => {
      const item = tab.kind === 'item'
        ? items.find((candidate) => candidate.id === tab.itemId)
        : undefined;
      const title = item?.title?.trim()
        || (tab.kind === 'url'
          ? tab.title?.trim() || tab.url
          : tab.kind === 'search'
            ? tab.query.trim() || 'Search'
            : tab.kind === 'list'
              ? tab.title || 'List'
              : 'Untitled');
      const subtitle = tab.kind === 'url'
        ? tab.url
        : tab.kind === 'search'
          ? `Search · ${getWorkspaceEntryScopeLabel(tab)}`
          : tab.kind === 'list'
            ? 'Saved list'
            : item?.url || item?.notes || getWorkspaceEntryScopeLabel(tab);
      return {
        id: tab.id,
        title,
        icon: tab.kind === 'search'
          ? <Search size={12} />
          : tab.kind === 'url'
            ? <LinkVisual url={tab.url} title={tab.title} favicon={tab.favIconUrl} />
            : item?.url
              ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} />
              : <FileText size={12} />,
        subtitle,
        searchText: item ? `${item.tags.join(' ')} ${item.notes ?? ''}` : subtitle,
        actions: (
          <>
            {item ? <ItemQuickAccessMarkers item={item} size={12} /> : null}
            <button
              type="button"
              className="ui-button ui-button--ghost ui-button--compact"
              onClick={() => removeCurrentSessionTab(tab.id)}
              title={`Remove ${title} from workspace`}
              aria-label={`Remove ${title} from workspace`}
            >
              <X size={11} />
            </button>
          </>
        ),
        dragSource: item ? target : undefined,
        dragItem: item,
        reorderTarget: item ? target : undefined,
      };
    });
  }, [activeWorkspaceDestination, activeWorkspaceKey, currentSessionTabs, items]);

  const removeCurrentSessionTab = (tabId: string) => {
    const workspaceKey = homeState.activeWorkspaceKey ?? getProjectSessionWorkspaceKey('all');
    onHomeStateChange(removeEntryFromProjectWorkspace({
      state: homeState,
      projectId: getWorkspaceProjectId(homeState, workspaceKey) ?? 'all',
      workspaceKey,
      entryId: tabId,
    }));
  };

  const activateWorkspace = (workspace: Workspace | null) => {
    if (!activeProject) return;
    onHomeStateChange(activateProjectWorkspace({
      state: homeState,
      projectId: activeProject.id,
      workspace,
      items,
    }));
  };

  const activateWorkspaceKey = (workspaceKey: string) => {
    const browserSnapshot = workspaces.find(
      (workspace) => getSavedWorkspaceSessionKey(workspace.id) === workspaceKey
    );
    if (browserSnapshot) {
      activateWorkspace(browserSnapshot);
      return;
    }
    onHomeStateChange(activateWorkspaceByKey({
      state: homeState,
      workspaceKey,
      preferenceProjectId: scopeProjectId,
    }));
  };

  const validateWorkspaceName = (name: string, excludeSessionId?: string): string | void => {
    if (!activeProject) return 'Open a project first.';
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) return 'Workspace name is required.';
    if (
      projectSavedWorkspaceSessions.some((session) => session.id !== excludeSessionId && session.name.trim().toLowerCase() === normalizedName) ||
      projectWorkspaces.some((workspace) => workspace.name.trim().toLowerCase() === normalizedName)
    ) {
      return 'A workspace with this name already exists in this project.';
    }
  };

  const createWorkspace = (name: string, copyCurrent: boolean): string | void => {
    const error = validateWorkspaceName(name);
    if (error) return error;
    if (!activeProject) return 'Open a project first.';
    onHomeStateChange(createProjectWorkspace({
      state: homeState,
      projectId: activeProject.id,
      name: name.trim(),
      copyCurrent,
    }));
  };

  const renameSavedWorkspace = (sessionId: string, name: string): string | void => {
    const error = validateWorkspaceName(name, sessionId);
    if (error) return error;
    onHomeStateChange(renameSavedProjectWorkspace({ state: homeState, sessionId, name }));
  };

  const mergeSavedWorkspace = (sourceSessionId: string, targetWorkspaceKey: string) => {
    onHomeStateChange(mergeSavedProjectWorkspace({ state: homeState, sourceSessionId, targetWorkspaceKey }));
  };

  const activateSavedWorkspace = (session: SavedWorkspaceSession) => {
    onHomeStateChange(activateSavedProjectWorkspace({ state: homeState, session }));
  };

  const deleteSavedWorkspace = (sessionId: string) => {
    onHomeStateChange(deleteSavedProjectWorkspace({ state: homeState, sessionId }));
  };

  const browserWorkspaceForDestination = (destination: WorkspaceDestination) =>
    destination.sourceWorkspaceId
      ? workspaces.find((workspace) => workspace.id === destination.sourceWorkspaceId)
      : undefined;

  const isItemInWorkspaceDestination = (item: Item, destination: WorkspaceDestination) =>
    workspaceTargetContainsItem({
      state: homeState,
      projectId: destination.projectId,
      targetWorkspaceKey: destination.key,
      itemId: item.id,
      browserWorkspace: browserWorkspaceForDestination(destination),
      items,
    });

  const addItemToWorkspaceDestination = (item: Item, destination: WorkspaceDestination) => {
    const next = addItemToWorkspaceTarget({
      state: homeState,
      projectId: destination.projectId,
      targetWorkspaceKey: destination.key,
      item,
      browserWorkspace: browserWorkspaceForDestination(destination),
      items,
    });
    onHomeStateChange({
      ...next,
      recentWorkspaceDestinationKeys: rememberWorkspaceDestination(
        next.recentWorkspaceDestinationKeys,
        destination.key
      ),
    });
  };

  const viewItemInWorkspaceDestination = (item: Item, destination: WorkspaceDestination) => {
    const added = addItemToWorkspaceTarget({
      state: homeState,
      projectId: destination.projectId,
      targetWorkspaceKey: destination.key,
      item,
      browserWorkspace: browserWorkspaceForDestination(destination),
      items,
    });
    const activated = activateWorkspaceByKey({
      state: added,
      workspaceKey: destination.key,
      projectId: destination.projectId,
    });
    const entry = activated.tabs.find((candidate) => candidate.kind === 'item' && candidate.itemId === item.id);
    onHomeStateChange({
      ...activated,
      homeSection: 'overview',
      activeTabId: entry?.id ?? activated.activeTabId,
      lastActiveEntryByWorkspace: entry
        ? { ...(activated.lastActiveEntryByWorkspace ?? {}), [destination.key]: entry.id }
        : activated.lastActiveEntryByWorkspace,
      recentWorkspaceDestinationKeys: rememberWorkspaceDestination(
        activated.recentWorkspaceDestinationKeys,
        destination.key
      ),
    });
    if (destination.projectId === 'all') {
      setAllLibraryActiveView('workspace');
      setAllLibraryWorkspaceView('global');
      setSelectedAllLibraryWorkspaceTabId(entry?.id ?? null);
      setSelectedOverviewItemId(null);
      onResetScope?.();
    } else {
      onSelectProjectScope?.(destination.projectId);
    }
  };

  const transferWorkspaceEntry = (
    entry: GlobalTab,
    targetWorkspaceKey: string,
    mode: 'copy' | 'move'
  ) => {
    if (!activeProject) return;
    onHomeStateChange(transferProjectWorkspaceEntry({
      state: homeState,
      projectId: activeProject.id,
      sourceWorkspaceKey: activeWorkspaceKey,
      targetWorkspaceKey,
      entry,
      mode,
    }));
  };

  const showHomeItemContextMenu = (e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    setHomeItemContextMenu({ item, x: e.clientX, y: e.clientY });
  };

  const homeSection =
    homeState.homeSection === 'search' || homeState.homeSection === 'categories'
      ? homeState.homeSection
      : 'overview';
  const openAllLibraryScope = () => {
    onHomeStateChange({ ...homeState, activeTabId: null, homeSection: 'overview' });
    onResetScope?.();
  };

  const openProjectScope = (projectId: string) => {
    onHomeStateChange({ ...homeState, activeTabId: null, homeSection: 'overview' });
    onSelectProjectScope?.(projectId);
  };

  const openCollectionScope = (collectionId: string, projectId: string) => {
    onHomeStateChange({ ...homeState, activeTabId: null, homeSection: 'overview' });
    onSelectCollectionScope?.(collectionId, projectId);
  };

  const workspaceHeader = (
    <div className="ui-home-context-bar">
        <div
          className="hide-scrollbar ui-home-scope-switcher"
          style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflowX: 'auto' }}
          aria-label="Open project scopes"
        >
          <button type="button" onClick={openAllLibraryScope} style={scopeSwitcherButton(scopeProjectId === 'all')}>
            <HomeIcon size={12} />
            All Library
          </button>
          {recentProjects.map((project) => {
            const active = scopeProjectId === project.id;
            return (
            <div
              key={project.id}
              draggable
              onDragStart={(event) => {
                setDraggedProjectId(project.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', project.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggedProjectId || draggedProjectId === project.id) return;
                onReorderProjectScopes?.(
                  reorderProjectSwitcher(
                    recentProjects.map((candidate) => candidate.id),
                    draggedProjectId,
                    project.id
                  )
                );
                setDraggedProjectId(null);
              }}
              onDragEnd={() => setDraggedProjectId(null)}
              style={{
                ...scopeSwitcherButton(active),
                padding: 0,
                maxWidth: 175,
                overflow: 'hidden',
                opacity: draggedProjectId === project.id ? 0.45 : 1,
                cursor: 'grab',
              }}
              title={`Switch Home to ${project.name}`}
            >
              <GripVertical size={11} style={{ marginLeft: 5, color: 'var(--text-faint)', flexShrink: 0 }} />
              <button
                type="button"
                onClick={() => openProjectScope(project.id)}
                style={{
                  minWidth: 0,
                  flex: 1,
                  alignSelf: 'stretch',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0 4px',
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <Folder size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {project.name}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Close ${project.name} from project switcher`}
                title={`Close ${project.name} from this switcher`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseProjectScope?.(project.id);
                }}
                style={{
                  width: 23,
                  alignSelf: 'stretch',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  background: 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-faint)',
                  cursor: 'pointer',
                }}
              >
                <X size={11} />
              </button>
            </div>
            );
          })}
        </div>
        <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {scopedItems.length} item{scopedItems.length !== 1 ? 's' : ''}
        </span>
    </div>
  );

  const homeContent = (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {homeSection === 'overview' ? activeProject ? (
        <ProjectHomeWorkspace
          key={`${activeProject.id}:${scopeCollectionId}`}
          project={activeProject}
          items={projectItems}
          organizationItems={items}
          collections={projectCollections}
          organizationProjects={projects}
          organizationCollections={collections}
          selectedCollectionId={scopeCollectionId}
          scopeNavigationRevision={scopeNavigationRevision}
          onSelectCollection={(collectionId) => {
            if (collectionId === 'all') openProjectScope(activeProject.id);
            else openCollectionScope(collectionId, activeProject.id);
          }}
          sessionTabs={currentSessionTabs}
          activeSessionTabId={homeState.activeTabId}
          onAddItemToSession={addItemToCurrentSession}
          onRemoveSessionTab={removeCurrentSessionTab}
          onUpdateItem={onUpdateItem}
          onRequestDeleteItem={requestLibraryRemoval}
          onCreateProject={onCreateProject}
          onCreateCollection={onCreateCollection}
          workspaces={projectWorkspaces}
          savedWorkspaceSessions={projectSavedWorkspaceSessions}
          activeWorkspaceKey={activeWorkspaceKey}
          onActivateWorkspaceKey={activateWorkspaceKey}
          onActivateWorkspace={activateWorkspace}
          onActivateSavedWorkspace={activateSavedWorkspace}
          workspaceManagerEntries={projectWorkspaceManagerEntries}
          onCreateWorkspace={createWorkspace}
          onRenameSavedWorkspace={renameSavedWorkspace}
          onMergeSavedWorkspace={mergeSavedWorkspace}
          onDeleteSavedWorkspace={deleteSavedWorkspace}
          workspaceDestinations={projectWorkspaceDestinations}
          availableWorkspaceDestinations={workspaceDestinations}
          recentWorkspaceDestinationKeys={homeState.recentWorkspaceDestinationKeys}
          isItemInWorkspace={isItemInWorkspaceDestination}
          onAddItemToWorkspace={(item, targetWorkspaceKey) => {
            const destination = workspaceDestinations.find((candidate) => candidate.key === targetWorkspaceKey);
            if (destination) addItemToWorkspaceDestination(item, destination);
          }}
          onAddItemToWorkspaceDestination={addItemToWorkspaceDestination}
          onViewItemInWorkspaceDestination={viewItemInWorkspaceDestination}
          onTransferSessionEntry={transferWorkspaceEntry}
          onSelectedItemChange={onSelectedBrowseItemChange}
          onSelectSessionEntry={selectCurrentWorkspaceEntry}
        />
      ) : (
      <div
        className="scrollbar ui-home-overview"
        style={{
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 20px var(--scroll-footer-safe-bottom)',
          scrollPaddingBottom: 'var(--scroll-footer-safe-bottom)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {scopeProjectId === 'all' && (
          <AllLibraryWorkspaceOverview
            initialView={allLibraryActiveView}
            onActiveViewChange={setAllLibraryActiveView}
            initialProjectQuery={projectLauncherQuery}
            onProjectQueryChange={setProjectLauncherQuery}
            initialItemFilter={allLibraryItemFilter}
            onItemFilterChange={setAllLibraryItemFilter}
            groups={allLibraryWorkspaceGroups}
            selectedView={allLibraryWorkspaceView}
            onSelectedViewChange={(view) => {
              setAllLibraryWorkspaceView(view);
              setSelectedAllLibraryWorkspaceTabId(null);
            }}
            selectedTab={selectedAllLibraryWorkspaceTab}
            selectedItem={selectedOverviewItem}
            items={items}
            projects={projects}
            collections={collections}
            onSelectTab={selectAllLibraryWorkspaceEntry}
            onRemoveGlobalTab={removeCurrentSessionTab}
            workspaceDestinations={workspaceDestinations}
            recentWorkspaceDestinationKeys={homeState.recentWorkspaceDestinationKeys}
            isItemInWorkspace={isItemInWorkspaceDestination}
            onAddItemToWorkspace={addItemToWorkspaceDestination}
            onViewItemInWorkspace={viewItemInWorkspaceDestination}
            onViewSearch={selectCurrentWorkspaceEntry}
            onUpdateItem={onUpdateItem}
            onCreateProject={onCreateProject}
            onCreateCollection={onCreateCollection}
            getEntryScopeLabel={getWorkspaceEntryScopeLabel}
            projectSummaries={projectSummaries}
            recentProjectAccessIds={recentProjectAccessIds}
            favoriteItems={favoriteItems}
            totalItems={items.length}
            onOpenProject={openProjectScope}
            onSelectItem={selectOverviewItem}
            onItemContextMenu={showHomeItemContextMenu}
            onRequestDeleteItem={requestLibraryRemoval}
            onClearSelection={clearAllLibrarySelection}
            onOpenTrash={() => openUtilityTab('util-trash')}
            onOpenPipeline={onOpenPipelineHub}
          />
        )}

        {libraryLoading && !hasStartupContent ? (
          <div style={{ width: '100%', maxWidth: 1000 }}>
            <LibraryLoadingPlaceholder
              message="Loading library…"
              progress={libraryHydrateProgress}
            />
          </div>
        ) : scopeProjectId === 'all' && libraryLoading ? (
          <div style={{ width: '100%', maxWidth: 1120, display: 'flex', justifyContent: 'center' }}>
            <LibraryLoadingPlaceholder variant="inline" message="Refreshing library in the background…" progress={libraryHydrateProgress} />
          </div>
        ) : null}
      </div>
      ) : homeSection === 'categories' ? (
        <HomeCategoriesView
          key={scopeProjectId}
          items={scopeProjectId === 'all' ? items : projectItems}
          scopeLabel={activeProject?.name ?? 'All Library'}
          scopeKey={scopeProjectId}
          focusedCategory={focusedCategory}
          onExitFocusedCategory={onExitFocusedCategory}
          onSelectedItemChange={onSelectedBrowseItemChange}
        />
      ) : librarySearch ? (
        <div ref={searchLayoutRef} style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          ref={searchCompanionRef}
          className="ui-search-companion"
          style={{
            flexShrink: 0,
            margin: '12px 20px 0',
            height: searchCompanionHeight,
            minHeight: SEARCH_COMPANION_MIN_HEIGHT,
            maxHeight: `calc(100% - ${SEARCH_RESULTS_MIN_HEIGHT}px)`,
          }}
        >
          <div className="ui-search-companion__switcher" role="group" aria-label="Search companion view">
            <button
              type="button"
              aria-pressed={searchCompanionView === 'workspace'}
              onClick={() => setSearchCompanionView('workspace')}
            >
              <Layers3 size={12} /> Workspace
            </button>
            <button
              type="button"
              aria-pressed={searchCompanionView === 'collection'}
              onClick={() => setSearchCompanionView('collection')}
            >
              <Folder size={12} /> Collection
            </button>
          </div>
          {searchCompanionView === 'workspace' ? (
            <ContentBrowser
              title={activeWorkspaceDestination?.workspaceName ?? 'Global workspace'}
              entries={searchCompanionWorkspaceEntries}
              selectedId={homeState.lastActiveEntryByWorkspace?.[activeWorkspaceKey] ?? null}
              onSelect={(entryId) => {
                const entry = currentSessionTabs.find((candidate) => candidate.id === entryId);
                if (entry) selectCurrentWorkspaceEntry(entry);
              }}
              mode={searchWorkspaceBrowseMode}
              onModeChange={setSearchWorkspaceBrowseMode}
              emptyMessage={activeProject ? 'Add this search to begin the active workspace.' : 'Add this search or selected library material to begin the global workspace.'}
              ariaLabel={`Workspace ${activeWorkspaceDestination?.workspaceName ?? 'Global workspace'}`}
              headerActions={(
                <select
                  value={activeWorkspaceKey}
                  onChange={(event) => activateWorkspaceKey(event.target.value)}
                  aria-label="Active workspace"
                  title="Switch active workspace"
                  style={{ ...uiPatterns.select, minWidth: 170, maxWidth: 260 }}
                >
                  {workspaceSwitcherDestinations.map((destination) => (
                    <option key={destination.key} value={destination.key}>{destination.path}</option>
                  ))}
                </select>
              )}
              dropTarget={{
                kind: 'workspace',
                containerId: activeWorkspaceKey,
                containerLabel: activeWorkspaceDestination?.workspaceName ?? 'Global workspace',
                projectId: activeWorkspaceDestination?.projectId ?? 'all',
              }}
            />
          ) : selectedSearchCompanionCollection ? (
            <ContentBrowser
              title={selectedSearchCompanionCollection.name}
              entries={searchCompanionCollectionEntries}
              selectedId={librarySearch.state.selectedItemId}
              onSelect={(itemId) => librarySearch.setSelectedItemId(itemId)}
              mode={searchCollectionBrowseMode}
              onModeChange={setSearchCollectionBrowseMode}
              emptyMessage="No items in this collection."
              ariaLabel={`Collection ${selectedSearchCompanionCollection.name}`}
              headerActions={(
                <select
                  value={selectedSearchCompanionCollection.id}
                  onChange={(event) => setSearchCompanionCollectionId(event.target.value)}
                  aria-label="Search companion collection"
                  title="Switch collection"
                  style={{ ...uiPatterns.select, minWidth: 170, maxWidth: 300 }}
                >
                  {searchCollections.map((collection) => {
                    const projectName = projects.find((project) => project.id === collection.primaryProjectId)?.name;
                    return (
                      <option key={collection.id} value={collection.id}>
                        {scopeProjectId === 'all' && projectName ? `${projectName} — ${collection.name}` : collection.name}
                      </option>
                    );
                  })}
                </select>
              )}
              dropTarget={{
                kind: 'collection',
                containerId: selectedSearchCompanionCollection.id,
                containerLabel: selectedSearchCompanionCollection.name,
                projectId: selectedSearchCompanionCollection.primaryProjectId,
              }}
            />
          ) : (
            <div className="ui-status">No collection is available in this scope.</div>
          )}
        </div>
        <div className="ui-search-companion__resizer">
          <Resizer
            direction="horizontal"
            thickness={8}
            ariaLabel="Resize Workspace or Collection and Search results"
            onResize={resizeSearchCompanion}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
        <ProductSearchView
          items={items}
          collections={searchCollections}
          projects={projects}
          organizationCollections={collections}
          state={librarySearch.state}
          onQueryChange={(query) => {
            librarySearch.setQuery(query);
            onSearchQueryChange(query);
          }}
          onFiltersChange={librarySearch.setFilters}
          onModeChange={librarySearch.setMode}
          onSelectedItemIdChange={librarySearch.setSelectedItemId}
          onRunSearch={librarySearch.runSearch}
          onOpenItem={addItemToCurrentSession}
          onUpdateItem={onUpdateItem}
          onCreateProject={onCreateProject}
          onCreateCollection={onCreateCollection}
          organizationContextProjectId={scopeProjectId === 'all' ? undefined : scopeProjectId}
          organizationContextCollectionId={scopeCollectionId === 'all' ? undefined : scopeCollectionId}
          onClearRecentQueries={librarySearch.clearRecentQueries}
          scopeLabel={effectiveSearchScopeLabel}
          scopeOptions={searchScopeOptions}
          scopeValue={searchScopeValue}
          onScopeValueChange={changeSearchScope}
          workspaceAction={librarySearch.state.query.trim() ? (
            <WorkspaceDestinationPicker
              subjectTitle={`Search: ${librarySearch.state.query.trim()}`}
              destinations={workspaceDestinations}
              recentDestinationKeys={homeState.recentWorkspaceDestinationKeys}
              isAdded={(destination) => Boolean(searchEntryInDestination(destination))}
              onAdd={addSearchToWorkspace}
              onView={viewSearchWorkspace}
            />
          ) : undefined}
          workspaceDestinations={workspaceDestinations}
          recentWorkspaceDestinationKeys={homeState.recentWorkspaceDestinationKeys}
          isItemInWorkspace={isItemInWorkspaceDestination}
          onAddItemToWorkspace={addItemToWorkspaceDestination}
          onViewItemInWorkspace={viewItemInWorkspaceDestination}
          searchTabs={librarySearch.searchTabs}
          activeSearchTabId={librarySearch.activeSearchTabId}
          onSelectSearchTab={librarySearch.selectSearchTab}
          onCloseSearchTab={librarySearch.closeSearchTab}
          onOpenTagTab={librarySearch.openTagTab}
          onOpenCategoryTab={librarySearch.openCategoryTab}
          onBrowseCategory={onBrowseCategory}
        />
        </div>
        </div>
      ) : (
        <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          Library search is unavailable.
        </div>
      )}
      {homeItemContextMenu && (
        <ItemContextMenu
          item={homeItemContextMenu.item}
          x={homeItemContextMenu.x}
          y={homeItemContextMenu.y}
          onClose={() => setHomeItemContextMenu(null)}
          onDelete={
            onDeleteBookmark
              ? (it) => {
                  requestLibraryRemoval(it);
                  setHomeItemContextMenu(null);
                }
              : undefined
          }
          onOpenInNewTab={(it) => {
            if (it.url) chrome.tabs.create({ url: it.url });
          }}
        />
      )}
      {libraryRemovalTarget && onDeleteBookmark && (
        <DeleteConfirmDialog
          item={libraryRemovalTarget}
          collections={collections}
          projects={projects}
          onResult={(result) => {
            const target = libraryRemovalTarget;
            setLibraryRemovalTarget(null);
            if (result.action === 'cancel' || !result.collectionIds?.length) return;
            void onDeleteBookmark(target.id, result.collectionIds).catch((error) => {
              console.error('Could not remove Library item:', error);
              window.alert(`Could not remove item: ${error instanceof Error ? error.message : String(error)}`);
            });
          }}
        />
      )}
    </div>
  );

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {workspaceHeader}
        <div style={{ flex: 1, minHeight: 0 }}>{homeContent}</div>
    </div>
  );
};

const scopeSwitcherButton = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 28,
  maxWidth: 150,
  flexShrink: 0,
  border: 'none',
  background: active ? 'var(--bg-active)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  borderRadius: 'var(--radius-sm)',
  padding: '0 8px',
  fontSize: 'var(--text-xs)',
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
});
