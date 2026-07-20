import React, { useMemo } from 'react';
import { Search, Home as HomeIcon, Folder, GripVertical, X, Globe2 } from 'lucide-react';
import type { Item, Collection, Project, UpdateItemOptions, Workspace } from '../../lib/db';
import { getQuickAccessItemsFromList } from '../../lib/itemQuickAccess';
import { GlobalTabSystem, type GlobalTab, type GlobalTabState, type GlobalTabList, type GlobalTabSearch, type SavedWorkspaceSession } from './GlobalTabSystem';
import { ItemContextMenu } from './ItemContextMenu';
import { useLibrarySearch } from '../../hooks/useLibrarySearch';
import { LibraryLoadingPlaceholder } from './LibraryLoadingPlaceholder';
import { ProductSearchView } from './ProductSearchView';
import { getHomeScopeItems, getProjectCollections, getProjectHomeSummary, reorderProjectSwitcher } from './homeScope';
import { ProjectHomeWorkspace } from './ProjectHomeWorkspace';
import { ActiveWorkspaceCard } from './ActiveWorkspaceCard';
import { AllLibraryWorkspaceOverview, type WorkspaceViewGroup } from './AllLibraryWorkspaceOverview';
import {
  activateProjectWorkspace,
  activateSavedProjectWorkspace,
  addEntryToProjectWorkspace,
  deleteSavedProjectWorkspace,
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionTabs,
  getProjectSessionResumeTabId,
  getProjectSessionWorkspaceKey,
  getSavedWorkspaceSessionKey,
  getVisibleWorkspaceTabs,
  saveCurrentProjectWorkspace,
  transferProjectWorkspaceEntry,
} from './workspaceSession';

type LibrarySearchApi = ReturnType<typeof useLibrarySearch>;

const RECENTLY_ADDED_LIMIT = 15;

// ===== Props =====
interface HomeViewProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  workspaces: Workspace[];
  homeState: GlobalTabState;
  onHomeStateChange: (next: GlobalTabState) => void;
  onUpdateItem?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>, options?: UpdateItemOptions) => Promise<void>;
  onDeleteBookmark?: (id: string, collectionId?: string) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  librarySearch?: LibrarySearchApi;
  workingSearch?: LibrarySearchApi;
  onOpenItemFromSearch?: (item: Item, origin?: { projectId?: string; collectionId?: string }) => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  onBatchProcessQueue?: (kind: import('../../lib/pipeline').PipelineQueueKind) => Promise<void>;
  onOpenPipelineHub?: () => void;
  batchRunning?: boolean;
  batchCancellable?: boolean;
  onCancelBatch?: () => void;
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  recentProjectIds?: string[];
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
  items, collections, projects, workspaces, homeState, onHomeStateChange, onUpdateItem, onDeleteBookmark, onCreateProject, onCreateCollection, searchQuery, onSearchQueryChange, librarySearch, workingSearch, onOpenItemFromSearch, onOpenPipelineHub, scopeProjectId = 'all', scopeCollectionId = 'all', recentProjectIds = [], onSelectProjectScope, onReorderProjectScopes, onCloseProjectScope, onSelectCollectionScope, onResetScope, onSwitchScopeForItem, onSelectedBrowseItemChange, renderListTab, statusBar, libraryLoading = false, libraryHydrateProgress = null
}) => {
  const [homeItemContextMenu, setHomeItemContextMenu] = React.useState<{
    item: Item;
    x: number;
    y: number;
  } | null>(null);
  const [draggedProjectId, setDraggedProjectId] = React.useState<string | null>(null);
  const [selectedOverviewItemId, setSelectedOverviewItemId] = React.useState<string | null>(null);
  const [selectedAllLibraryWorkspaceTabId, setSelectedAllLibraryWorkspaceTabId] = React.useState<string | null>(null);
  const [allLibraryWorkspaceView, setAllLibraryWorkspaceView] = React.useState('global');
  const focusLayerRef = React.useRef<HTMLDivElement>(null);
  const lastBrowseFocusRef = React.useRef<HTMLElement | null>(null);
  const wasFocusOpenRef = React.useRef(false);

  React.useEffect(() => {
    setSelectedOverviewItemId(null);
  }, [scopeProjectId, scopeCollectionId]);

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
    const globalTabs = getProjectSessionTabs(homeState.tabs, 'all');
    const projectGroups = projects
      .map((project) => {
        const tabs = getProjectSessionTabs(homeState.tabs, project.id);
        const activeKey = getActiveProjectWorkspaceKey(homeState, project.id);
        const savedSession = homeState.savedWorkspaceSessions?.find(
          (session) => getHomebaseWorkspaceSessionKey(session.id) === activeKey
        );
        const savedWorkspace = workspaces.find(
          (workspace) => getSavedWorkspaceSessionKey(workspace.id) === activeKey
        );
        return {
          key: `project:${project.id}`,
          title: savedSession?.name ?? savedWorkspace?.name ?? 'Live session',
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
    if (
      allLibraryWorkspaceView.startsWith('project:') &&
      !allLibraryWorkspaceGroups.some((group) => group.key === allLibraryWorkspaceView)
    ) {
      setAllLibraryWorkspaceView('global');
    }
  }, [allLibraryWorkspaceGroups, allLibraryWorkspaceView]);
  const includeGlobalWork =
    scopeProjectId !== 'all' && Boolean(homeState.includeGlobalWorkByProject?.[scopeProjectId]);
  const currentSessionTabs = useMemo(
    () => getVisibleWorkspaceTabs(homeState.tabs, scopeProjectId, includeGlobalWork),
    [homeState.tabs, scopeProjectId, includeGlobalWork]
  );
  const activeWorkspaceKey = activeProject
    ? getActiveProjectWorkspaceKey(homeState, activeProject.id)
    : '';
  const projectWorkspaceDestinations = useMemo(
    () => activeProject
      ? [
          { key: getProjectSessionWorkspaceKey(activeProject.id), label: 'Live session' },
          ...projectSavedWorkspaceSessions.map((session) => ({
            key: getHomebaseWorkspaceSessionKey(session.id),
            label: session.name,
          })),
        ]
      : [],
    [activeProject, projectSavedWorkspaceSessions]
  );
  const projectSummaries = useMemo(
    () =>
      [...projects]
        .sort((a, b) => b.updated_at - a.updated_at)
        .map((project) => getProjectHomeSummary(project, items, collections)),
    [projects, items, collections]
  );
  const recentProjects = useMemo(
    () =>
      recentProjectIds
        .map((projectId) => projects.find((project) => project.id === projectId))
        .filter((project): project is Project => project != null),
    [recentProjectIds, projects]
  );
  const recentItems = useMemo(
    () =>
      [...scopedItems]
        .sort(
          (a, b) =>
            (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at)
        )
        .slice(0, RECENTLY_ADDED_LIMIT),
    [scopedItems]
  );

  const quickAccessItems = useMemo(() => getQuickAccessItemsFromList(scopedItems), [scopedItems]);
  const hasStartupContent = projects.length > 0 || collections.length > 0 || items.length > 0;

  type HomeUtilTabId =
    | 'util-pinned'
    | 'util-favorites'
    | 'util-quick-access'
    | 'util-recent'
    | 'util-trash';

  const currentTabScope = {
    ...(scopeProjectId !== 'all' ? { scopeProjectId } : {}),
    ...(scopeProjectId !== 'all' && scopeCollectionId !== 'all' ? { scopeCollectionId } : {}),
  };
  const scopedTabId = (baseId: string) =>
    scopeProjectId === 'all' ? baseId : `${baseId}@project:${scopeProjectId}`;

  const focusSessionTab = (tabs: GlobalTabState['tabs'], activeTabId: string) => {
    onHomeStateChange({
      ...homeState,
      tabs,
      activeTabId,
      showAllTabs: false,
      lastActiveTabByProject: {
        ...(homeState.lastActiveTabByProject ?? {}),
        [scopeProjectId]: activeTabId,
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
    const existing = homeState.tabs.find(
      (tab) =>
        tab.kind === 'item' &&
        tab.itemId === item.id &&
        (tab.scopeProjectId ?? 'all') === scopeProjectId
    );
    if (existing) {
      onHomeStateChange({
        ...homeState,
        activeTabId: null,
        lastActiveTabByProject: {
          ...(homeState.lastActiveTabByProject ?? {}),
          [scopeProjectId]: existing.id,
        },
      });
      return;
    }
    const id = scopedTabId('item-' + item.id);
    onHomeStateChange({
      ...homeState,
      tabs: [...homeState.tabs, { kind: 'item', id, itemId: item.id, ...currentTabScope }],
      activeTabId: null,
      lastActiveTabByProject: {
        ...(homeState.lastActiveTabByProject ?? {}),
        [scopeProjectId]: id,
      },
    });
  };

  const addSearchToCurrentWorkspace = () => {
    if (!librarySearch) return;
    const query = librarySearch.state.query.trim();
    if (!query) return;
    const filters = { ...librarySearch.state.filters };
    const mode = librarySearch.state.mode;
    const existing = currentSessionTabs.find(
      (tab): tab is GlobalTabSearch =>
        tab.kind === 'search' &&
        (tab.scopeProjectId ?? 'all') === scopeProjectId &&
        tab.query.trim().toLowerCase() === query.toLowerCase() &&
        (tab.mode === 'lexical-only' ? 'lexical-only' : 'hybrid') === mode &&
        JSON.stringify(tab.filters ?? {}) === JSON.stringify(filters)
    );
    if (existing) {
      onHomeStateChange({
        ...homeState,
        activeTabId: null,
        lastActiveTabByProject: {
          ...(homeState.lastActiveTabByProject ?? {}),
          [scopeProjectId]: existing.id,
        },
      });
      return;
    }
    const id = `search-${crypto.randomUUID()}${scopeProjectId === 'all' ? '' : `@project:${scopeProjectId}`}`;
    const searchTab: GlobalTabSearch = {
      kind: 'search',
      id,
      query,
      filters,
      mode,
      ...currentTabScope,
    };
    onHomeStateChange({
      ...homeState,
      tabs: [...homeState.tabs, searchTab],
      activeTabId: null,
      lastActiveTabByProject: {
        ...(homeState.lastActiveTabByProject ?? {}),
        [scopeProjectId]: id,
      },
    });
  };

  const selectCurrentWorkspaceEntry = (tab: GlobalTab) => {
    const tabProjectId = tab.scopeProjectId ?? 'all';
    const nextState: GlobalTabState = {
      ...homeState,
      activeTabId: null,
      lastActiveTabByProject: {
        ...(homeState.lastActiveTabByProject ?? {}),
        [tabProjectId]: tab.id,
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
    const projectId = tab.scopeProjectId ?? 'all';
    setSelectedAllLibraryWorkspaceTabId(tab.id);
    setSelectedOverviewItemId(null);
    onSelectedBrowseItemChange?.(
      tab.kind === 'item' ? items.find((item) => item.id === tab.itemId) ?? null : null
    );
    onHomeStateChange({
      ...homeState,
      activeTabId: null,
      lastActiveTabByProject: {
        ...(homeState.lastActiveTabByProject ?? {}),
        [projectId]: tab.id,
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

  const focusCurrentSession = (requestedTabId?: string) => {
    const rememberedTabId = homeState.lastActiveTabByProject?.[scopeProjectId];
    const activeTabId =
      requestedTabId && currentSessionTabs.some((tab) => tab.id === requestedTabId)
        ? requestedTabId
        : rememberedTabId && currentSessionTabs.some((tab) => tab.id === rememberedTabId)
          ? rememberedTabId
        : getProjectSessionResumeTabId(homeState, scopeProjectId);
    if (!activeTabId) return;
    focusSessionTab(homeState.tabs, activeTabId);
  };

  const focusWorkspaceEntry = (tab: GlobalTab) => {
    const projectId = tab.scopeProjectId ?? 'all';
    if (projectId !== 'all') onSelectProjectScope?.(projectId);
    onHomeStateChange({
      ...homeState,
      activeTabId: tab.id,
      showAllTabs: false,
      lastActiveTabByProject: {
        ...(homeState.lastActiveTabByProject ?? {}),
        [projectId]: tab.id,
      },
    });
  };

  const toggleIncludeGlobalWork = () => {
    if (scopeProjectId === 'all') return;
    onHomeStateChange({
      ...homeState,
      activeTabId: null,
      includeGlobalWorkByProject: {
        ...(homeState.includeGlobalWorkByProject ?? {}),
        [scopeProjectId]: !includeGlobalWork,
      },
    });
  };

  const removeCurrentSessionTab = (tabId: string) => {
    const lastActiveTabByProject = { ...(homeState.lastActiveTabByProject ?? {}) };
    if (lastActiveTabByProject[scopeProjectId] === tabId) delete lastActiveTabByProject[scopeProjectId];
    onHomeStateChange({
      ...homeState,
      tabs: homeState.tabs.filter((tab) => tab.id !== tabId),
      activeTabId: homeState.activeTabId === tabId ? null : homeState.activeTabId,
      lastActiveTabByProject,
    });
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

  const saveCurrentWorkspace = (name: string): string | void => {
    if (!activeProject) return 'Open a project first.';
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) return 'Workspace name is required.';
    if (
      projectSavedWorkspaceSessions.some((session) => session.name.trim().toLowerCase() === normalizedName) ||
      projectWorkspaces.some((workspace) => workspace.name.trim().toLowerCase() === normalizedName)
    ) {
      return 'A workspace with this name already exists in this project.';
    }
    onHomeStateChange(saveCurrentProjectWorkspace({
      state: homeState,
      projectId: activeProject.id,
      name: name.trim(),
    }));
  };

  const activateSavedWorkspace = (session: SavedWorkspaceSession) => {
    onHomeStateChange(activateSavedProjectWorkspace({ state: homeState, session }));
  };

  const deleteSavedWorkspace = (sessionId: string) => {
    onHomeStateChange(deleteSavedProjectWorkspace({ state: homeState, sessionId }));
  };

  const addItemToWorkspace = (item: Item, targetWorkspaceKey: string) => {
    if (!activeProject) return;
    const id = `item-${item.id}@project:${activeProject.id}`;
    onHomeStateChange(addEntryToProjectWorkspace({
      state: homeState,
      projectId: activeProject.id,
      targetWorkspaceKey,
      entry: { kind: 'item', id, itemId: item.id, scopeProjectId: activeProject.id },
    }));
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

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || !librarySearch) return;
    librarySearch.setQuery(q);
    void librarySearch.runSearch(q);
    onHomeStateChange({
      ...homeState,
      activeTabId: null,
      homeSection: 'search',
      searchQuery: q,
    });
  };

  const homeSection = homeState.homeSection === 'search' ? 'search' : 'overview';
  const selectHomeSection = (section: 'overview' | 'search') => {
    if (section === 'search' && librarySearch?.state.query.trim()) {
      librarySearch.openSearch({
        query: librarySearch.state.query,
        filters: { ...librarySearch.state.filters },
        mode: librarySearch.state.mode,
      });
    }
    onHomeStateChange({ ...homeState, activeTabId: null, homeSection: section });
  };

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

  const scopeLabel = activeCollection?.name ?? activeProject?.name ?? 'All Library';

  const workspaceHeader = (
    <>
      <div
        style={{
          height: 44,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}
      >
        {(
          [
            { id: 'overview' as const, label: 'Overview', Icon: HomeIcon },
            { id: 'search' as const, label: 'Search', Icon: Search },
          ]
        ).map(({ id, label, Icon }) => {
          const active = homeSection === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => selectHomeSection(id)}
              style={{
                height: 30,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '0 11px',
                border: '1px solid',
                borderColor: active ? 'var(--border-active)' : 'transparent',
                borderRadius: 'var(--radius-md)',
                background: active ? 'var(--bg-active)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 'var(--text-sm)',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          minHeight: 40,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-xs)',
          minWidth: 0,
        }}
      >
        <div
          className="hide-scrollbar"
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
    </>
  );

  const homeContent = (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {homeSection === 'overview' ? activeProject ? (
        <ProjectHomeWorkspace
          project={activeProject}
          items={projectItems}
          organizationItems={items}
          collections={projectCollections}
          organizationProjects={projects}
          organizationCollections={collections}
          selectedCollectionId={scopeCollectionId}
          onSelectCollection={(collectionId) => {
            if (collectionId === 'all') openProjectScope(activeProject.id);
            else openCollectionScope(collectionId, activeProject.id);
          }}
          sessionTabs={currentSessionTabs}
          activeSessionTabId={homeState.lastActiveTabByProject?.[scopeProjectId] ?? null}
          onAddItemToSession={addItemToCurrentSession}
          onRemoveSessionTab={removeCurrentSessionTab}
          onFocusSession={focusCurrentSession}
          onOpenSearch={() => selectHomeSection('search')}
          onUpdateItem={onUpdateItem}
          onCreateProject={onCreateProject}
          onCreateCollection={onCreateCollection}
          workspaces={projectWorkspaces}
          savedWorkspaceSessions={projectSavedWorkspaceSessions}
          activeWorkspaceKey={activeWorkspaceKey}
          onActivateWorkspace={activateWorkspace}
          onActivateSavedWorkspace={activateSavedWorkspace}
          onSaveWorkspace={saveCurrentWorkspace}
          onDeleteSavedWorkspace={deleteSavedWorkspace}
          workspaceDestinations={projectWorkspaceDestinations}
          onAddItemToWorkspace={addItemToWorkspace}
          onTransferSessionEntry={transferWorkspaceEntry}
          onSelectedItemChange={onSelectedBrowseItemChange}
          onSelectSessionEntry={selectCurrentWorkspaceEntry}
          includeGlobalWork={includeGlobalWork}
          onToggleIncludeGlobalWork={toggleIncludeGlobalWork}
        />
      ) : (
      <div
        style={{
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '32px 24px 80px',
          scrollPaddingBottom: 80,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          alignItems: 'center',
        }}
        className="scrollbar"
      >
        <section style={{ maxWidth: 1000, width: '100%' }} aria-labelledby="home-find-heading">
          <h2 id="home-find-heading" style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 650 }}>Find</h2>
          <div style={{ maxWidth: 680 }}>
          <form onSubmit={handleHeroSearch}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 18px', boxShadow: 'var(--shadow-sm)' }}>
              <Search size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => onSearchQueryChange(e.target.value)}
                placeholder={scopeProjectId === 'all' ? 'Search your library...' : `Search in ${scopeLabel}...`}
                autoFocus
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 'var(--text-lg)', fontFamily: 'var(--font-sans)' }}
              />
              {searchQuery && (
                <button type="submit" style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', padding: '5px 14px', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  Search
                </button>
              )}
            </div>
          </form>
          </div>
        </section>

        {scopeProjectId === 'all' && (
          <AllLibraryWorkspaceOverview
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
            onFocusTab={focusWorkspaceEntry}
            onFocusGlobal={focusCurrentSession}
            onAddItemToGlobal={addItemToCurrentSession}
            onViewSearch={selectCurrentWorkspaceEntry}
            onUpdateItem={onUpdateItem}
            onCreateProject={onCreateProject}
            onCreateCollection={onCreateCollection}
            getEntryScopeLabel={getWorkspaceEntryScopeLabel}
            projectSummaries={projectSummaries}
            recentItems={recentItems}
            quickAccessItems={quickAccessItems}
            totalItems={items.length}
            onOpenProject={openProjectScope}
            onSelectItem={selectOverviewItem}
            onItemContextMenu={showHomeItemContextMenu}
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
      ) : librarySearch ? (
        <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, margin: '12px 20px 0' }}>
          <ActiveWorkspaceCard
            title={activeProject
              ? projectSavedWorkspaceSessions.find((session) => getHomebaseWorkspaceSessionKey(session.id) === activeWorkspaceKey)?.name
                ?? projectWorkspaces.find((workspace) => getSavedWorkspaceSessionKey(workspace.id) === activeWorkspaceKey)?.name
                ?? 'Live session'
              : 'Global workspace'}
            contextLabel={activeProject?.name ?? 'All Library'}
            tabs={currentSessionTabs}
            items={items}
            activeEntryId={homeState.lastActiveTabByProject?.[scopeProjectId] ?? null}
            emptyMessage={activeProject ? 'Add this search to begin the active workspace.' : 'Add this search or selected library material to begin the global workspace.'}
            onSelectEntry={selectCurrentWorkspaceEntry}
            onRemoveEntry={removeCurrentSessionTab}
            onFocus={focusCurrentSession}
            getEntryScopeLabel={getWorkspaceEntryScopeLabel}
            trailingControl={activeProject ? (
              <button type="button" onClick={toggleIncludeGlobalWork} aria-pressed={includeGlobalWork} style={{ minHeight: 27, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 8px', border: '1px solid', borderColor: includeGlobalWork ? 'var(--border-active)' : 'var(--border)', borderRadius: 'var(--radius-sm)', background: includeGlobalWork ? 'var(--accent-weak)' : 'transparent', color: includeGlobalWork ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}><Globe2 size={11} /> {includeGlobalWork ? 'Including global' : 'Include global'}</button>
            ) : undefined}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
        <ProductSearchView
          items={scopedItems}
          collections={scopeProjectId === 'all' ? collections : projectCollections}
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
          onClearRecentQueries={librarySearch.clearRecentQueries}
          scopeLabel={effectiveSearchScopeLabel}
          scopeOptions={searchScopeOptions}
          scopeValue={searchScopeValue}
          onScopeValueChange={changeSearchScope}
          showOpenInTab
          onOpenInTab={addSearchToCurrentWorkspace}
          openInTabLabel="Add search to workspace"
          itemActionLabel="Add to workspace"
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
                  void onDeleteBookmark(it.id);
                  setHomeItemContextMenu(null);
                }
              : undefined
          }
          onOpenInNewTab={(it) => {
            if (it.url) chrome.tabs.create({ url: it.url });
          }}
        />
      )}
    </div>
  );

  const focusOpen = !!homeState.activeTabId && homeState.tabs.some((tab) => tab.id === homeState.activeTabId);

  React.useEffect(() => {
    let frame: number | undefined;
    if (focusOpen && !wasFocusOpenRef.current) {
      frame = window.requestAnimationFrame(() => {
        focusLayerRef.current?.querySelector<HTMLElement>('[data-focus-entry], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
      });
    } else if (!focusOpen && wasFocusOpenRef.current) {
      frame = window.requestAnimationFrame(() => {
        const previousFocus = lastBrowseFocusRef.current;
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    }
    wasFocusOpenRef.current = focusOpen;
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [focusOpen]);

  return (
    <div style={{ height: '100%', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <div
        {...(focusOpen ? { inert: '' } : {})}
        onFocusCapture={(event) => {
          lastBrowseFocusRef.current = event.target as HTMLElement;
        }}
        style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', visibility: focusOpen ? 'hidden' : 'visible', pointerEvents: focusOpen ? 'none' : 'auto' }}
      >
        {workspaceHeader}
        <div style={{ flex: 1, minHeight: 0 }}>{homeContent}</div>
      </div>
      {focusOpen && (
        <div ref={focusLayerRef} style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', minHeight: 0, minWidth: 0, background: 'var(--bg)' }}>
          <GlobalTabSystem
            items={items}
            collections={collections}
            projects={projects}
            tabState={homeState}
            onTabStateChange={onHomeStateChange}
            onUpdateItem={onUpdateItem}
            onDeleteBookmark={onDeleteBookmark}
            onCreateProject={onCreateProject}
            onCreateCollection={onCreateCollection}
            renderListTab={renderListTab}
            statusBar={statusBar}
            librarySearch={workingSearch ?? librarySearch}
            onOpenItemFromSearch={onOpenItemFromSearch}
            scopeProjectId={scopeProjectId}
            scopeCollectionId={scopeCollectionId}
            onSwitchScopeForItem={onSwitchScopeForItem}
            focusContextLabel={scopeLabel}
            onExitFocus={() => onHomeStateChange({ ...homeState, activeTabId: null })}
            strictProjectScope={scopeProjectId !== 'all'}
            includeGlobalWork={includeGlobalWork}
          />
        </div>
      )}
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
