import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { MainContent } from './MainContent';
import { WindowGroup } from '../../../App';
import { Workspace, Collection, Item, Project, UpdateItemOptions, getItem } from '../../../lib/db';
import type { BackupStatusSnapshot, RestoreBackupResult } from '../../../lib/backupCoordinator';
import type { DbWorkerStatus } from '../../../lib/storage/dbClient';
import type { AISettings } from '../../../lib/ai/types';
import { ensurePendingClassifySignals } from '../../../lib/categorization';
import {
  type GlobalTabState,
  loadGlobalTabState,
  pruneGlobalTabs,
  saveGlobalTabState,
  GlobalTabSystem,
  type GlobalTab,
  type GlobalTabSearch,
} from '../GlobalTabSystem';
import { WorkspaceTabRenderer } from '../WorkspaceTabRenderer';
import { RightPanel } from './RightPanel';
import { StatusBar, useStatusBar } from '../StatusBar';
import { ToastProvider, useToast } from '../../ToastContainer';
import { PipelineProgressProvider, usePipelineProgress } from '../PipelineProgressProvider';
import { PipelineBatchConfirmModal } from '../PipelineBatchConfirmModal';
import { PipelineCoordinatorBanner } from '../PipelineCoordinatorBanner';
import { CommandPalette } from '../CommandPalette';
import {
  useLibrarySearch,
  useSearchNavigationScope,
  LIBRARY_SEARCH_TAB_ID,
  loadLastSearchQuery,
} from '../../../hooks/useLibrarySearch';
import { addProjectToSwitcher, rememberProjectAccess, rememberRecentCollection } from '../homeScope';
import {
  loadItemIdsForCategory,
  loadItemIdsForPipelineQueue,
  type CategoryBrowseFilter,
  type PipelineBrowseFilter,
  type PipelineQueueKind,
} from '../../../lib/pipeline';
import {
  loadShellLayout,
  patchShellLayout,
  type ShellLayoutState,
} from '../../../lib/shell/shellLayoutState';
import {
  loadNavigationState,
  patchNavigationState,
  type PersistedDashboardView,
} from '../../../lib/shell/navigationState';
import { getItemPrimaryScope } from '../../../lib/shell/itemScope';
import { Resizer } from '../Resizer';
import { TabPaneFrame, TabScrollShell } from '../TabScrollShell';
import { loadLibraryPageUi } from '../BookmarksLibraryView';
import {
  addEntryToProjectWorkspace,
  addItemToWorkspaceTarget,
  activateWorkspace,
  getActiveWorkspaceKey,
  getPreferredWorkspaceKey,
  getWorkspaceProjectId,
  removeItemFromWorkspaceTarget,
  reorderItemInWorkspaceTarget,
  transferItemBetweenWorkspaceTargets,
  workspaceTargetContainsItem,
} from '../workspaceSession';
import { buildWorkspaceDestinations, rememberWorkspaceDestination, type WorkspaceDestination } from '../workspaceDestinations';
import { WorkspaceDestinationPicker } from '../WorkspaceDestinationPicker';
import { ItemDragDropProvider, type ItemTransferResult } from '../ItemDragDropProvider';
import { ItemPeekProvider } from '../ItemPeekProvider';
import type { ItemDragPayload, ItemDropTarget, ItemTransferOperation } from '../itemDragDrop';
import { buildCollectionTransferPatch } from '../../../lib/collectionTransfer';

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export type DashboardView =
  | 'home'
  | 'search'
  | 'settings'
  | 'projects'
  | 'tab-commander'
  | 'ai-categories'
  | 'import-studio'
  | 'pipeline'
  | 'bookmarks'
  | 'notes'
  | 'collections'
  | 'workspaces'
  | 'help'
  | 'trash';

export interface ItemTab {
  id: string;
  type: 'bookmark' | 'note' | 'workspace' | 'bookmark-list' | 'note-list' | 'common-list';
  title: string;
  // For list tabs, store the item IDs
  itemIds?: string[];
  sections?: {
    id: string;
    type: 'bookmark-list' | 'note-list';
    title: string;
    itemIds: string[];
  }[];
}

const FULL_PAGE_VIEWS = new Set<DashboardView>([
  'settings',
  'trash',
  'workspaces',
  'tab-commander',
  'import-studio',
  'help',
]);
/** Keep the right Inspector visible beside the primary browse surfaces. */
const FULL_MIDDLE_VIEWS = new Set<DashboardView>(['home', 'search', 'pipeline', 'bookmarks', 'notes']);

export function isFullPageDashboardView(activeView: DashboardView): boolean {
  return FULL_PAGE_VIEWS.has(activeView);
}

export function isFullMiddleDashboardView(activeView: DashboardView): boolean {
  return FULL_MIDDLE_VIEWS.has(activeView);
}

export function resolveShellInspectorItemId({
  activeView,
  isSearchSurface,
  selectedSearchItemId,
  selectedBrowseItemId,
  activeGlobalTab,
}: {
  activeView: DashboardView;
  isSearchSurface: boolean;
  selectedSearchItemId: string | null;
  selectedBrowseItemId: string | null;
  activeGlobalTab: GlobalTab | null;
}): string | null {
  if (isSearchSurface) return selectedSearchItemId;
  // Library and Notes own their visible selection independently of the Home
  // workspace entries. Their selection must therefore win over a stale entry.
  if (activeView === 'bookmarks' || activeView === 'notes' || activeView === 'pipeline') {
    return selectedBrowseItemId;
  }
  if (activeGlobalTab?.kind === 'item') return activeGlobalTab.itemId;
  if (activeView === 'home' && activeGlobalTab == null) return selectedBrowseItemId;
  return null;
}

export function loadRestoredBrowseItemId(
  activeView: DashboardView,
  projectId: string,
  collectionId: string
): string | null {
  if (activeView !== 'bookmarks' && activeView !== 'notes') return null;
  return loadLibraryPageUi(
    activeView === 'notes' ? 'notes' : 'library',
    projectId,
    collectionId
  ).selectedItemId;
}

interface DashboardLayoutProps {
  windows: WindowGroup[];
  projects: Project[];
  collections: Collection[];
  items: Item[];
  workspaces: Workspace[];
  onWorkspacesChanged?: () => Promise<void>;
  onAddBookmark?: (url: string, title?: string, collectionId?: string) => Promise<string | undefined>;
  onUpdateBookmark?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onDeleteBookmark?: (id: string, collectionId?: string) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onDeleteProject?: (projectId: string) => Promise<boolean | void>;
  onDeleteCollection?: (collectionId: string) => Promise<boolean | void>;
  onCreateItem?: (data: {
    title: string;
    url?: string;
    notes?: string;
    collectionIds: string[];
  }) => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onRefresh?: (scope?: import('../../../lib/libraryRefresh').LibraryRefreshScope) => Promise<void>;
  /** True while first library hydrate / loadData is in flight */
  libraryLoading?: boolean;
  libraryHydrateProgress?: { label: string; percent?: number } | null;
  onChooseBackupFolder?: () => Promise<void>;
  onSetAsBrowserHome?: () => Promise<void>;
  onRestoreBackupFile?: (file: File, mode: 'replace' | 'merge') => Promise<RestoreBackupResult>;
  onManualBackup?: () => Promise<void>;
  onExportJsonSnapshot?: () => Promise<void>;
  onExportPipelineAnalysis?: () => Promise<void>;
  onResolveConflictLoadRemote?: () => Promise<void>;
  onResolveConflictKeepLocal?: () => Promise<void>;
  backupFolderLinked?: boolean;
  backupFolderReady?: boolean;
  backupFolderName?: string | null;
  backupStatus?: BackupStatusSnapshot;
  folderMirrorStatus?: DbWorkerStatus | null;
  aiSettings?: AISettings;
  onSaveAISettings?: (settings: AISettings) => Promise<void>;
  onTestAI?: (
    settings: AISettings,
    prompt: string
  ) => Promise<{ text: string; model: string; requestedModel?: string; modelMismatch?: boolean }>;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = (props) => (
  <ToastProvider>
    <PipelineProgressProvider onRefresh={props.onRefresh}>
      <DashboardLayoutInner {...props} />
    </PipelineProgressProvider>
  </ToastProvider>
);

const DashboardLayoutInner: React.FC<DashboardLayoutProps> = ({ 
  windows,
  projects,
  collections,
  items,
  workspaces,
  onWorkspacesChanged,
  onAddBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
  onCreateProject,
  onCreateCollection,
  onDeleteProject,
  onDeleteCollection,
  onCreateItem,
  onCloseTab,
  onCloseWindow,
  onRefresh,
  libraryLoading = false,
  libraryHydrateProgress = null,
  onChooseBackupFolder,
  onSetAsBrowserHome,
  onRestoreBackupFile,
  onManualBackup,
  onExportJsonSnapshot,
  onExportPipelineAnalysis,
  onResolveConflictLoadRemote,
  onResolveConflictKeepLocal,
  backupFolderLinked = false,
  backupFolderReady,
  backupFolderName,
  backupStatus,
  folderMirrorStatus,
  aiSettings,
  onSaveAISettings,
  onTestAI,
}) => {
  const { addToast } = useToast();
  const pipeline = usePipelineProgress();
  const { messages: statusMessages, addStatusMessage, dismissStatusMessage } = useStatusBar();
  const librarySearch = useLibrarySearch((message) => {
    addToast({ type: 'error', message: `Search failed: ${message}` });
  }, 'workbench:home-search-state:v2');
  const workingLibrarySearch = useLibrarySearch((message) => {
    addToast({ type: 'error', message: `Search tab failed: ${message}` });
  }, 'workbench:working-search-state:v2');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shellLayout, setShellLayout] = useState<ShellLayoutState>(() => loadShellLayout());
  const patchShellLayoutState = useCallback((patch: Partial<ShellLayoutState>) => {
    // Left nav expand/collapse is manual-only (chevron toggle) — never via generic patches.
    const { leftSidebarCollapsed: _omit, ...rest } = patch;
    if (Object.keys(rest).length === 0) return;
    setShellLayout((prev) => patchShellLayout(rest, prev));
  }, []);
  const handleLeftSidebarToggle = useCallback(() => {
    setShellLayout((prev) =>
      patchShellLayout({ leftSidebarCollapsed: !prev.leftSidebarCollapsed }, prev)
    );
  }, []);
  const statusBar = (
    <StatusBar messages={statusMessages} onDismiss={dismissStatusMessage} />
  );

  const initialNav = loadNavigationState();
  const [activeView, setActiveView] = useState<DashboardView>(() => initialNav.activeView as DashboardView);
  const [scopeProjectId, setScopeProjectId] = useState<string | 'all'>(() => initialNav.scopeProjectId);
  const [scopeCollectionId, setScopeCollectionId] = useState<string | 'all'>(() => initialNav.scopeCollectionId);
  const [scopeNavigationRevision, setScopeNavigationRevision] = useState(0);
  useEffect(() => {
    if (scopeNavigationRevision === 0) return;
    const timeoutId = window.setTimeout(() => setScopeNavigationRevision(0), 0);
    return () => window.clearTimeout(timeoutId);
  }, [scopeNavigationRevision]);
  const [selectedBrowseItemId, setSelectedBrowseItemId] = useState<string | null>(() =>
    loadRestoredBrowseItemId(
      initialNav.activeView as DashboardView,
      initialNav.scopeProjectId,
      initialNav.scopeCollectionId
    )
  );
  const handleSelectedBrowseItemChange = useCallback((item: Item | null) => {
    setSelectedBrowseItemId(item?.id ?? null);
  }, []);
  const browseContextKey = `${activeView}:${scopeProjectId}:${scopeCollectionId}`;
  const previousBrowseContextRef = useRef(browseContextKey);

  useEffect(() => {
    if (previousBrowseContextRef.current === browseContextKey) return;
    previousBrowseContextRef.current = browseContextKey;
    setSelectedBrowseItemId(
      loadRestoredBrowseItemId(activeView, scopeProjectId, scopeCollectionId)
    );
  }, [activeView, browseContextKey, scopeCollectionId, scopeProjectId]);

  useEffect(() => {
    if (scopeProjectId === 'all' || scopeCollectionId === 'all') return;
    const scopedProject = projects.find((project) => project.id === scopeProjectId);
    if (!scopedProject?.isDefault) return;
    setScopeCollectionId('all');
    setScopeNavigationRevision((revision) => revision + 1);
    patchNavigationState({ scopeProjectId, scopeCollectionId: 'all' });
  }, [projects, scopeCollectionId, scopeProjectId]);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() =>
    initialNav.scopeProjectId === 'all'
      ? initialNav.recentProjectIds
      : addProjectToSwitcher(initialNav.recentProjectIds, initialNav.scopeProjectId)
  );
  const [recentProjectAccessIds, setRecentProjectAccessIds] = useState<string[]>(() =>
    initialNav.scopeProjectId === 'all'
      ? initialNav.recentProjectAccessIds
      : rememberProjectAccess(initialNav.recentProjectAccessIds, initialNav.scopeProjectId)
  );
  const [, setRecentCollectionIdsByProject] = useState<Record<string, string[]>>(() => {
    if (initialNav.scopeProjectId === 'all' || initialNav.scopeCollectionId === 'all') {
      return initialNav.recentCollectionIdsByProject;
    }
    return {
      ...initialNav.recentCollectionIdsByProject,
      [initialNav.scopeProjectId]: rememberRecentCollection(
        initialNav.recentCollectionIdsByProject[initialNav.scopeProjectId] ?? [],
        initialNav.scopeCollectionId
      ),
    };
  });
  const [categoryBrowse, setCategoryBrowse] = useState<CategoryBrowseFilter | null>(null);
  const [pipelineBrowse, setPipelineBrowse] = useState<PipelineBrowseFilter | null>(null);
  const [batchConfirm, setBatchConfirm] = useState<{
    kind: PipelineQueueKind;
    itemIds: string[];
  } | null>(null);
  const [globalTabState, setGlobalTabState] = useState<GlobalTabState>(() => {
    const loaded = loadGlobalTabState();
    const workspaceKey = getPreferredWorkspaceKey(loaded, initialNav.scopeProjectId);
    return activateWorkspace({
      state: loaded,
      workspaceKey,
      projectId: getWorkspaceProjectId(loaded, workspaceKey),
    });
  });
  const workspaceDestinations = useMemo(
    () => buildWorkspaceDestinations({
      projects,
      browserWorkspaces: workspaces,
      state: globalTabState,
      contextProjectId: scopeProjectId,
    }),
    [globalTabState, projects, scopeProjectId, workspaces]
  );
  const prevSearchViewRef = useRef(false);

  useSearchNavigationScope(
    librarySearch.state.filters,
    librarySearch.setFilters,
    scopeProjectId,
    scopeCollectionId
  );

  const handleGlobalTabStateChange = (next: GlobalTabState) => {
    setGlobalTabState(next);
    saveGlobalTabState(next);
  };

  useEffect(() => {
    if (libraryLoading) return;
    void ensurePendingClassifySignals();
  }, [libraryLoading]);

  /** Remove workspace entries whose item/snapshot ids no longer exist (for example after a DB clear). */
  useEffect(() => {
    if (libraryLoading) return;
    // Skip while any items exist and only metadata timestamps change — prune is for deletes/clear.
    let cancelled = false;
    void (async () => {
      try {
      const { getAllItems } = await import('../../../lib/db');
      const allItems = await getAllItems();
      if (cancelled) return;
      const itemIds = new Set(allItems.map((i) => i.id));
      const workspaceIds = new Set(workspaces.map((w) => w.id));
      setGlobalTabState((prev) => {
        const pruned = pruneGlobalTabs(prev, { itemIds, workspaceIds });
        if (
          pruned.tabs.length === prev.tabs.length &&
          pruned.activeTabId === prev.activeTabId &&
          pruned.tabs.every((t, i) => t.id === prev.tabs[i]?.id && t.kind === prev.tabs[i]?.kind)
        ) {
          return prev;
        }
        if (
          JSON.stringify(pruned.tabs) === JSON.stringify(prev.tabs) &&
          pruned.activeTabId === prev.activeTabId
        ) {
          return prev;
        }
        saveGlobalTabState(pruned);
        return pruned;
      });
      } catch {
        /* DB not ready — keep tabs until next items/workspaces update */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items.length, workspaces.length, libraryLoading]);

  useEffect(() => {
    const stored = localStorage.getItem('workbench-font-scale');
    if (stored) {
      document.documentElement.style.setProperty('--font-scale', stored);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        if (isEditableKeyboardTarget(e.target)) return;
        const activeId = globalTabState.activeTabId;
        if (!activeId) return;
        e.preventDefault();
        setGlobalTabState((prev) => {
          if (!prev.activeTabId) return prev;
          const nextTabs = prev.tabs.filter((t) => t.id !== prev.activeTabId);
          const nextActiveId = nextTabs[nextTabs.length - 1]?.id ?? null;
          const next = { ...prev, tabs: nextTabs, activeTabId: nextActiveId };
          saveGlobalTabState(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, globalTabState.activeTabId]);

  const openLibrarySearch = useCallback(
    (query?: string) => {
      setActiveView('home');
      patchNavigationState({ activeView: 'home' });
      setGlobalTabState((prev) => {
        const next = { ...prev, activeTabId: null, homeSection: 'search' as const };
        saveGlobalTabState(next);
        return next;
      });
      if (query?.trim()) {
        librarySearch.setQuery(query.trim());
        void librarySearch.runSearch(query.trim());
      }
    },
    [librarySearch]
  );

  const openLibrarySearchInTab = useCallback(
    (query?: string) => {
      const q = (query ?? librarySearch.state.query).trim();
      const filters = { ...librarySearch.state.filters };
      const mode = librarySearch.state.mode;
      workingLibrarySearch.openSearch({ query: q, filters, mode });

      setGlobalTabState((prev) => {
        const searchTabId = `search-${crypto.randomUUID()}`;
        const searchTab: GlobalTabSearch = {
          kind: 'search',
          id: searchTabId,
          query: q,
          filters,
          mode,
          ...(scopeProjectId !== 'all' ? { scopeProjectId } : {}),
          ...(scopeProjectId !== 'all' && scopeCollectionId !== 'all' ? { scopeCollectionId } : {}),
        };
        const next = {
          ...prev,
          tabs: [...prev.tabs, searchTab],
          activeTabId: searchTabId,
        };
        saveGlobalTabState(next);
        return next;
      });

      setActiveView('home');
      patchNavigationState({ activeView: 'home' });
    },
    [librarySearch.state.filters, librarySearch.state.mode, librarySearch.state.query, scopeCollectionId, scopeProjectId, workingLibrarySearch]
  );

  useEffect(() => {
    const onSearchView = activeView === 'search';
    const enteredSearchView = onSearchView && !prevSearchViewRef.current;
    prevSearchViewRef.current = onSearchView;
    if (!onSearchView) return;

    const searchTab = globalTabState.tabs.find(
      (t): t is GlobalTabSearch => t.kind === 'search' && t.id === LIBRARY_SEARCH_TAB_ID
    );
    const tabQuery = searchTab?.query?.trim() ?? '';
    const fallback = loadLastSearchQuery() || librarySearch.state.recentQueries[0]?.trim() || '';
    const targetQuery = tabQuery || fallback;
    if (!targetQuery) return;

    const current = librarySearch.state.query.trim();
    const needsRestore = current === '' || enteredSearchView;

    if (needsRestore && current !== targetQuery) {
      librarySearch.setQuery(targetQuery);
      void librarySearch.runSearch(targetQuery);
      return;
    }

    if (current === targetQuery && !librarySearch.state.result && !librarySearch.state.loading) {
      void librarySearch.runSearch(targetQuery);
    }
  }, [
    activeView,
    globalTabState.tabs,
    librarySearch,
    librarySearch.state.query,
    librarySearch.state.result,
    librarySearch.state.loading,
    librarySearch.state.recentQueries,
  ]);

  const collectionLabel = useCallback((collectionId?: string) => {
    if (!collectionId) return 'library';
    return collections.find(c => c.id === collectionId)?.name ?? 'library';
  }, [collections]);

  const handleAddBookmarkWithToast = useCallback(async (url: string, title?: string, collectionId?: string) => {
    if (!onAddBookmark) return;
    if (!url || !/^https?:\/\//i.test(url)) {
      addStatusMessage({ type: 'warning', message: 'Please enter a valid http(s) URL' });
      return;
    }
    try {
      await onAddBookmark(url, title, collectionId);
      addToast({ type: 'success', message: `Bookmark saved to ${collectionLabel(collectionId)}` });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not add bookmark',
      });
    }
  }, [onAddBookmark, addToast, addStatusMessage, collectionLabel]);

  const handleUpdateBookmarkWithToast = useCallback(async (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => {
    if (!onUpdateBookmark) return;
    try {
      await onUpdateBookmark(id, updates, options);
      const keys = Object.keys(updates).filter((k) => k !== 'updated_at');
      const orgOnly =
        keys.length > 0 && keys.every((k) => k === 'collectionIds' || k === 'tags');
      addToast({
        type: 'success',
        message: orgOnly
          ? keys.includes('tags') && !keys.includes('collectionIds')
            ? 'Tags updated'
            : 'Collections updated'
          : 'Changes saved',
      });
    } catch (error) {
      const { isBackupFolderPermissionPaused } = await import('../../../lib/backupFolder');
      if (isBackupFolderPermissionPaused(error)) {
        // Folder is linked; Chrome sync pause is not a user-facing save error.
        return;
      }
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not save changes',
      });
      throw error;
    }
  }, [onUpdateBookmark, addToast]);

  const handleDeleteBookmarkWithToast = useCallback(async (id: string, collectionId?: string) => {
    if (!onDeleteBookmark) return;
    await onDeleteBookmark(id, collectionId);
    addToast({ type: 'info', message: 'Bookmark removed' });
  }, [onDeleteBookmark, addToast]);

  const handleSelectView = (view: DashboardView) => {
    if (view === 'ai-categories') {
      patchNavigationState({
        activeView: 'pipeline',
        pipelineHub: { hubLane: 'categories', categoriesSubTab: 'taxonomy' },
      });
      setActiveView('pipeline');
      setSelectedBrowseItemId(null);
      setPipelineBrowse(null);
      setCategoryBrowse(null);
      return;
    }
    if (view === 'search') {
      setGlobalTabState((prev) => {
        const next = { ...prev, activeTabId: null, homeSection: 'search' as const };
        saveGlobalTabState(next);
        return next;
      });
      setActiveView('home');
      patchNavigationState({ activeView: 'home' });
      return;
    }
    if (view === 'home') {
      setGlobalTabState((prev) => {
        const next = { ...prev, activeTabId: null };
        saveGlobalTabState(next);
        return next;
      });
    }
    if (view === 'pipeline') {
      setActiveView('pipeline');
      setSelectedBrowseItemId(null);
      patchNavigationState({ activeView: 'pipeline' });
      setPipelineBrowse(null);
      setCategoryBrowse(null);
      return;
    }
    setActiveView(view);
    patchNavigationState({ activeView: view as PersistedDashboardView });
    if (view !== 'bookmarks') {
      setPipelineBrowse(null);
      setCategoryBrowse(null);
    }
  };

  /** Reveal an already-focused Home workspace without clearing its active entry. */
  const handleOpenHomeWorkspace = useCallback(() => {
    setActiveView('home');
    patchNavigationState({ activeView: 'home' });
  }, []);

  const handleOpenPipelineHub = useCallback(
    (opts?: { filter?: string }) => {
      patchNavigationState({
        activeView: 'pipeline',
        pipelineHub: {
          hubLane: 'categories',
          categoriesSubTab: 'queue',
          ...(opts?.filter ? { categoriesFilter: opts.filter } : {}),
        },
      });
      setActiveView('pipeline');
      setSelectedBrowseItemId(null);
      setPipelineBrowse(null);
      setCategoryBrowse(null);
    },
    []
  );

  const handleCancelBatch = useCallback(() => {
    pipeline.cancel();
  }, [pipeline]);

  const handleBrowseCategory = useCallback(async (categoryId: string, name: string) => {
    const itemIds = await loadItemIdsForCategory(categoryId);
    setPipelineBrowse(null);
    setCategoryBrowse({ categoryId, name, itemIds });
    setScopeProjectId('all');
    setScopeCollectionId('all');
    setActiveView('bookmarks');
  }, []);

  const handleClearCategoryBrowse = useCallback(() => {
    setCategoryBrowse(null);
  }, []);

  const handleClearPipelineBrowse = useCallback(() => {
    setPipelineBrowse(null);
  }, []);

  const handleBatchProcessQueue = useCallback(async (kind: PipelineQueueKind) => {
    if (kind !== 'not_enriched' && kind !== 'pending_classify') return;
    if (pipeline.isRunning || batchConfirm) return;

    const allIds = await loadItemIdsForPipelineQueue(kind);
    if (allIds.length === 0) {
      addToast({ type: 'info', message: 'Nothing to process' });
      return;
    }

    setBatchConfirm({ kind, itemIds: allIds });
  }, [addToast, batchConfirm, pipeline.isRunning]);

  const handleBatchConfirm = useCallback(
    async (selectedIds: string[]) => {
      if (!batchConfirm || selectedIds.length === 0) {
        setBatchConfirm(null);
        return;
      }

      const { kind } = batchConfirm;
      setBatchConfirm(null);

      try {
        await pipeline.runBatch(selectedIds, {
          title:
            kind === 'pending_classify'
              ? `Classify queue (${selectedIds.length})`
              : `Process not enriched (${selectedIds.length})`,
          enrich: kind !== 'pending_classify',
          classify: kind === 'pending_classify' ? true : undefined,
          processAll: true,
          cancellable: true,
        });
      } catch {
        // Summary shown in modal
      } finally {
        // Durable coordinator state is independent of dashboard lifecycle.
      }
    },
    [batchConfirm, pipeline]
  );

  const rememberProjectScope = (projectId: string) => {
    setRecentProjectIds((previous) => {
      const next = addProjectToSwitcher(previous, projectId);
      patchNavigationState({ recentProjectIds: next });
      return next;
    });
    setRecentProjectAccessIds((previous) => {
      const next = rememberProjectAccess(previous, projectId);
      patchNavigationState({ recentProjectAccessIds: next });
      return next;
    });
  };

  const handleReorderProjectScopes = (projectIds: string[]) => {
    const validIds = Array.from(new Set(projectIds.filter((id) => projects.some((project) => project.id === id)))).slice(0, 5);
    setRecentProjectIds(validIds);
    patchNavigationState({ recentProjectIds: validIds });
  };

  const handleCloseProjectScope = (projectId: string) => {
    setRecentProjectIds((previous) => {
      const next = previous.filter((id) => id !== projectId);
      patchNavigationState({
        recentProjectIds: next,
        ...(scopeProjectId === projectId
          ? { scopeProjectId: 'all', scopeCollectionId: 'all' }
          : {}),
      });
      return next;
    });
    if (scopeProjectId === projectId) {
      setScopeProjectId('all');
      setScopeCollectionId('all');
      setGlobalTabState((previous) => {
        const workspaceKey = getPreferredWorkspaceKey(previous, 'all');
        const activated = activateWorkspace({
          state: previous,
          workspaceKey,
          projectId: getWorkspaceProjectId(previous, workspaceKey),
        });
        const next = { ...activated, activeTabId: null };
        saveGlobalTabState(next);
        return next;
      });
    }
  };

  const rememberCollectionScope = (projectId: string, collectionId: string) => {
    setRecentCollectionIdsByProject((previous) => {
      const next = {
        ...previous,
        [projectId]: rememberRecentCollection(previous[projectId] ?? [], collectionId),
      };
      patchNavigationState({ recentCollectionIdsByProject: next });
      return next;
    });
  };

  const handleSelectProjectScope = (projectId: string | 'all') => {
    setScopeNavigationRevision((revision) => revision + 1);
    setScopeProjectId(projectId);
    setScopeCollectionId('all');
    if (projectId !== 'all') rememberProjectScope(projectId);
    setGlobalTabState((previous) => {
      const workspaceKey = getPreferredWorkspaceKey(previous, projectId);
      const next = activateWorkspace({
        state: previous,
        workspaceKey,
        projectId: getWorkspaceProjectId(previous, workspaceKey),
      });
      saveGlobalTabState(next);
      return next;
    });
    patchNavigationState({ scopeProjectId: projectId, scopeCollectionId: 'all' });
  };

  const handleSelectCollectionScope = (collectionId: string, projectId?: string) => {
    setScopeNavigationRevision((revision) => revision + 1);
    setScopeCollectionId(collectionId);
    const nextProjectId = projectId ?? scopeProjectId;
    if (projectId) setScopeProjectId(projectId);
    if (nextProjectId !== 'all') rememberProjectScope(nextProjectId);
    setGlobalTabState((previous) => {
      const workspaceKey = getPreferredWorkspaceKey(previous, nextProjectId);
      const next = activateWorkspace({
        state: previous,
        workspaceKey,
        projectId: getWorkspaceProjectId(previous, workspaceKey),
      });
      saveGlobalTabState(next);
      return next;
    });
    if (nextProjectId !== 'all' && collectionId !== 'all') {
      rememberCollectionScope(nextProjectId, collectionId);
    }
    patchNavigationState({
      scopeProjectId: nextProjectId,
      scopeCollectionId: collectionId,
    });
  };

  const handleDeleteProjectFromSidebar = async (projectId: string) => {
    if (!onDeleteProject) return false;
    const deleted = await onDeleteProject(projectId);
    if (deleted !== false && scopeProjectId === projectId) {
      setScopeProjectId('all');
      setScopeCollectionId('all');
    }
    if (deleted !== false) {
      setRecentProjectAccessIds((previous) => {
        const next = previous.filter((id) => id !== projectId);
        patchNavigationState({ recentProjectAccessIds: next });
        return next;
      });
    }
    return deleted;
  };

  const handleDeleteCollectionFromSidebar = async (collectionId: string) => {
    if (!onDeleteCollection) return false;
    const deleted = await onDeleteCollection(collectionId);
    if (deleted !== false && scopeCollectionId === collectionId) {
      setScopeCollectionId('all');
    }
    return deleted;
  };


  const handleOpenItemTab = (
    item: Item,
    origin?: { projectId?: string; collectionId?: string }
  ) => {
    setGlobalTabState(prev => {
      const workspaceKey = getActiveWorkspaceKey(prev);
      const projectId = getWorkspaceProjectId(prev, workspaceKey);
      const collectionId =
        projectId !== 'all' && origin?.projectId === projectId
          ? origin.collectionId
          : undefined;
      const entry: GlobalTab = {
        kind: 'item',
        id: `item-${item.id}${projectId === 'all' ? '' : `@project:${projectId}`}`,
        itemId: item.id,
        ...(collectionId ? { scopeCollectionId: collectionId } : {}),
      };
      const added = addEntryToProjectWorkspace({
        state: prev,
        projectId,
        targetWorkspaceKey: workspaceKey,
        entry,
      });
      const activeEntry = added.tabs.find(
        (candidate) => candidate.kind === 'item' && candidate.itemId === item.id
      );
      const next = {
        ...added,
        activeTabId: activeEntry?.id ?? added.activeTabId,
        lastActiveEntryByWorkspace: activeEntry
          ? {
              ...(added.lastActiveEntryByWorkspace ?? {}),
              [workspaceKey]: activeEntry.id,
            }
          : added.lastActiveEntryByWorkspace,
      };
      saveGlobalTabState(next);
      return next;
    });
  };

  /** Select an item for the shared Inspector without changing activity or workspace membership. */
  const handleOpenItemInInspector = (item: Item, origin?: { projectId?: string; collectionId?: string }) => {
    void origin;
    setSelectedBrowseItemId(item.id);
    patchShellLayoutState({ rightPanelCollapsed: false, rightPanelTab: 'inspector' });
  };

  /** Inspect a Hub item without creating or activating a Home workspace tab. */
  const handleInspectPipelineItem = useCallback((item: Item) => {
    setSelectedBrowseItemId(item.id);
    patchShellLayoutState({ rightPanelCollapsed: false, rightPanelTab: 'inspector' });
  }, [patchShellLayoutState]);

  const handleAddItemToWorkspace = (
    item: Item,
    origin?: { projectId?: string; collectionId?: string }
  ) => {
    setGlobalTabState((prev) => {
      const workspaceKey = getActiveWorkspaceKey(prev);
      const projectId = getWorkspaceProjectId(prev, workspaceKey);
      const collectionId =
        projectId !== 'all' && origin?.projectId === projectId
          ? origin.collectionId
          : undefined;
      const next = addEntryToProjectWorkspace({
        state: prev,
        projectId,
        targetWorkspaceKey: workspaceKey,
        entry: {
          kind: 'item',
          id: `item-${item.id}${projectId === 'all' ? '' : `@project:${projectId}`}`,
          itemId: item.id,
          ...(collectionId ? { scopeCollectionId: collectionId } : {}),
        },
      });
      saveGlobalTabState(next);
      return next;
    });
  };

  const itemIsInWorkspace = (item: Item, destination: WorkspaceDestination) =>
    workspaceTargetContainsItem({
      state: globalTabState,
      projectId: destination.projectId,
      targetWorkspaceKey: destination.key,
      itemId: item.id,
      items,
    });

  const updateItemWorkspace = (item: Item, destination: WorkspaceDestination, view: boolean) => {
    setGlobalTabState((previous) => {
      const added = addItemToWorkspaceTarget({
        state: previous,
        projectId: destination.projectId,
        targetWorkspaceKey: destination.key,
        item,
        items,
      });
      const activated = view
        ? activateWorkspace({
            state: added,
            workspaceKey: destination.key,
            projectId: destination.projectId,
            preferenceProjectId: destination.projectId,
          })
        : added;
      const entry = view
        ? activated.tabs.find((candidate) => candidate.kind === 'item' && candidate.itemId === item.id)
        : undefined;
      const next = {
        ...activated,
        activeTabId: view ? entry?.id ?? activated.activeTabId : activated.activeTabId,
        lastActiveEntryByWorkspace: entry
          ? { ...(activated.lastActiveEntryByWorkspace ?? {}), [destination.key]: entry.id }
          : activated.lastActiveEntryByWorkspace,
        recentWorkspaceDestinationKeys: rememberWorkspaceDestination(
          activated.recentWorkspaceDestinationKeys,
          destination.key
        ),
      };
      saveGlobalTabState(next);
      return next;
    });
    if (view) {
      setScopeNavigationRevision((revision) => revision + 1);
      setScopeProjectId(destination.projectId);
      setScopeCollectionId('all');
      patchNavigationState({
        scopeProjectId: destination.projectId,
        scopeCollectionId: 'all',
      });
      setActiveView('home');
      patchNavigationState({ activeView: 'home' });
    }
  };

  const dragTargetContainsItem = useCallback((itemId: string, target: ItemDropTarget) => {
    if (target.kind === 'collection') {
      return items.find((item) => item.id === itemId)?.collectionIds?.includes(target.containerId) ?? false;
    }
    const projectId = target.projectId ?? getWorkspaceProjectId(globalTabState, target.containerId);
    return workspaceTargetContainsItem({
      state: globalTabState,
      projectId,
      targetWorkspaceKey: target.containerId,
      itemId,
      items,
    });
  }, [globalTabState, items]);

  const mutateWorkspaceState = useCallback((
    mutation: (state: GlobalTabState) => GlobalTabState,
    recentDestinationKey?: string
  ) => {
    setGlobalTabState((previous) => {
      const mutated = mutation(previous);
      const next = recentDestinationKey
        ? {
            ...mutated,
            recentWorkspaceDestinationKeys: rememberWorkspaceDestination(
              mutated.recentWorkspaceDestinationKeys,
              recentDestinationKey
            ),
          }
        : mutated;
      saveGlobalTabState(next);
      return next;
    });
  }, []);

  const handleDraggedItemTransfer = useCallback(async (
    payload: ItemDragPayload,
    target: ItemDropTarget,
    operation: ItemTransferOperation
  ): Promise<ItemTransferResult> => {
    const item = items.find((candidate) => candidate.id === payload.itemId) ??
      await getItem(payload.itemId);
    if (!item) throw new Error('This item is no longer available.');
    const transferItems = items.some((candidate) => candidate.id === item.id)
      ? items
      : [...items, item];

    if (target.kind === 'workspace') {
      const targetProjectId = target.projectId ?? getWorkspaceProjectId(globalTabState, target.containerId);
      const wasInTarget = workspaceTargetContainsItem({
        state: globalTabState,
        projectId: targetProjectId,
        targetWorkspaceKey: target.containerId,
        itemId: item.id,
        items: transferItems,
      });
      if (operation === 'copy' || payload.source.kind !== 'workspace') {
        if (wasInTarget) return { message: `Already in ${target.containerLabel}` };
        mutateWorkspaceState((state) => addItemToWorkspaceTarget({
          state,
          projectId: targetProjectId,
          targetWorkspaceKey: target.containerId,
          item,
          items: transferItems,
        }), target.containerId);
        return {
          message: `Added to ${target.containerLabel}`,
          undo: () => mutateWorkspaceState((state) => removeItemFromWorkspaceTarget({
            state,
            projectId: targetProjectId,
            targetWorkspaceKey: target.containerId,
            itemId: item.id,
          })),
        };
      }

      const source = payload.source;
      const sourceProjectId = source.projectId ??
        getWorkspaceProjectId(globalTabState, source.containerId);
      mutateWorkspaceState((state) => transferItemBetweenWorkspaceTargets({
        state,
        item,
        items: transferItems,
        sourceProjectId,
        sourceWorkspaceKey: source.containerId,
        targetProjectId,
        targetWorkspaceKey: target.containerId,
        mode: 'move',
      }), target.containerId);
      return {
        message: `Moved to ${target.containerLabel}`,
        undo: () => mutateWorkspaceState((state) => wasInTarget
          ? addItemToWorkspaceTarget({
              state,
              projectId: sourceProjectId,
              targetWorkspaceKey: source.containerId,
              item,
              items: transferItems,
            })
          : transferItemBetweenWorkspaceTargets({
              state,
              item,
              items: transferItems,
              sourceProjectId: targetProjectId,
              sourceWorkspaceKey: target.containerId,
              targetProjectId: sourceProjectId,
              targetWorkspaceKey: source.containerId,
              mode: 'move',
            })),
      };
    }

    if (!onUpdateBookmark) throw new Error('Collection updates are unavailable.');
    const previousCollectionIds = [...(item.collectionIds ?? [])];
    if (operation === 'copy' || payload.source.kind !== 'collection') {
      const patch = buildCollectionTransferPatch({
        item,
        targetCollectionId: target.containerId,
        operation: 'copy',
      });
      if (!patch.changed) {
        return { message: `Already in ${target.containerLabel}` };
      }
      await onUpdateBookmark(item.id, {
        collectionIds: patch.collectionIds,
        placements: patch.placements,
      });
      return {
        message: `Added to ${target.containerLabel}`,
        undo: () => onUpdateBookmark(item.id, {
          collectionIds: previousCollectionIds,
          placements: item.placements,
        }),
      };
    }

    const source = payload.source;
    const patch = buildCollectionTransferPatch({
      item,
      sourceCollectionId: source.containerId,
      targetCollectionId: target.containerId,
      operation: 'move',
    });
    await onUpdateBookmark(item.id, {
      collectionIds: patch.collectionIds,
      placements: patch.placements,
    });
    return {
      message: `Moved to ${target.containerLabel}`,
      undo: () => onUpdateBookmark(item.id, {
        collectionIds: previousCollectionIds,
        placements: item.placements,
      }),
    };
  }, [globalTabState, items, mutateWorkspaceState, onUpdateBookmark]);

  const handleWorkspaceItemReorder = useCallback((
    itemId: string,
    beforeItemId: string,
    target: ItemDropTarget
  ) => {
    const projectId = target.projectId ?? getWorkspaceProjectId(globalTabState, target.containerId);
    mutateWorkspaceState((state) => reorderItemInWorkspaceTarget({
      state,
      projectId,
      workspaceKey: target.containerId,
      itemId,
      beforeItemId,
    }));
  }, [globalTabState, mutateWorkspaceState]);

  const renderSimilarWorkspaceAction = (itemId: string) => {
    const similarItem = items.find((item) => item.id === itemId);
    if (!similarItem) return null;
    return (
      <WorkspaceDestinationPicker
        item={similarItem}
        destinations={workspaceDestinations}
        recentDestinationKeys={globalTabState.recentWorkspaceDestinationKeys}
        isAdded={(destination) => itemIsInWorkspace(similarItem, destination)}
        onAdd={(destination) => updateItemWorkspace(similarItem, destination, false)}
      />
    );
  };

  const handleOpenWorkspaceTab = (workspace: Workspace) => {
    const tabId = 'workspace-' + workspace.id + (scopeProjectId === 'all' ? '' : `@project:${scopeProjectId}`);
    setGlobalTabState(prev => {
      const existing = prev.tabs.find(t => t.id === tabId);
      if (existing) return { ...prev, activeTabId: existing.id };
      const next = { ...prev, tabs: [...prev.tabs, { kind: 'list' as const, id: tabId, listType: 'workspace' as const, title: workspace.name, workspaceId: workspace.id, ...(scopeProjectId !== 'all' ? { scopeProjectId } : {}), ...(scopeProjectId !== 'all' && scopeCollectionId !== 'all' ? { scopeCollectionId } : {}) }], activeTabId: tabId };
      saveGlobalTabState(next);
      return next;
    });
  };

  const handleOpenListTab = (type: 'bookmark-list' | 'note-list', itemIds: string[], title: string) => {
    const titleKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tabId = `${type}-${titleKey}-${itemIds.slice(0, 5).join('-')}-${itemIds.length}${scopeProjectId === 'all' ? '' : `@project:${scopeProjectId}`}`;
    setGlobalTabState(prev => {
      const existing = prev.tabs.find(t => t.id === tabId);
      if (existing) return { ...prev, activeTabId: existing.id };
      const next = { ...prev, tabs: [...prev.tabs, { kind: 'list' as const, id: tabId, listType: type as any, title, itemIds, ...(scopeProjectId !== 'all' ? { scopeProjectId } : {}), ...(scopeProjectId !== 'all' && scopeCollectionId !== 'all' ? { scopeCollectionId } : {}) }], activeTabId: tabId };
      saveGlobalTabState(next);
      return next;
    });
  };

  const handleAddToCommonListTab = (_type: 'bookmark-list' | 'note-list', itemIds: string[], _title: string) => {
    const tabId = `common-list${scopeProjectId === 'all' ? '' : `@project:${scopeProjectId}`}`;
    setGlobalTabState(prev => {
      const existingIdx = prev.tabs.findIndex(t => t.id === tabId);
      if (existingIdx === -1) {
        const next = { ...prev, tabs: [...prev.tabs, { kind: 'list' as const, id: tabId, listType: 'common-list' as const, title: 'Combined workspace list', itemIds, ...(scopeProjectId !== 'all' ? { scopeProjectId } : {}), ...(scopeProjectId !== 'all' && scopeCollectionId !== 'all' ? { scopeCollectionId } : {}) }], activeTabId: tabId };
        saveGlobalTabState(next);
        return next;
      }
      const existingTab = prev.tabs[existingIdx];
      if (existingTab.kind !== 'list') return prev;
      
      const newTabs = [...prev.tabs];
      newTabs[existingIdx] = { ...existingTab, itemIds: Array.from(new Set([...(existingTab.itemIds || []), ...itemIds])) };
      const next = { ...prev, tabs: newTabs, activeTabId: tabId };
      saveGlobalTabState(next);
      return next;
    });
  };

  const renderListTab = (tab: any) => {
    if (tab.listType === 'workspace') {
      const ws = workspaces.find(w => w.id === tab.workspaceId);
      if (!ws) return <div style={{ padding: 20, color: 'var(--text-faint)' }}>Workspace not found.</div>;
      return (
        <WorkspaceTabRenderer 
          workspace={ws} 
        />
      );
    }
    if (tab.listType === 'bookmark-list' || tab.listType === 'note-list' || tab.listType === 'common-list') {
      const tabItems = items.filter(i => (tab.itemIds || []).includes(i.id));
      return (
        <TabPaneFrame style={{ background: 'var(--bg)' }}>
          <TabScrollShell style={{ padding: '16px 20px' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: '0 0 16px', lineHeight: 1.3 }}>{tab.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tabItems.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No items.</div>}
            {tabItems.map(item => (
              <div key={item.id} style={{ padding: '12px 14px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || 'Untitled'}</div>
                  {item.url && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 4 }}>{item.url}</div>}
                </div>
                <button onClick={() => handleOpenItemTab(item)} style={{ flexShrink: 0, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Open</button>
              </div>
            ))}
          </div>
          </TabScrollShell>
        </TabPaneFrame>
      );
    }
    return null;
  };






  const isSearchSurface = useMemo(() => {
    if (activeView === 'search') return true;
    if (
      activeView === 'home' &&
      globalTabState.activeTabId == null &&
      globalTabState.homeSection === 'search'
    ) {
      return true;
    }
    const activeGlobalTab = globalTabState.tabs.find((t) => t.id === globalTabState.activeTabId);
    return activeGlobalTab?.kind === 'search';
  }, [activeView, globalTabState.tabs, globalTabState.activeTabId, globalTabState.homeSection]);

  const activeGlobalTab = useMemo(
    () => globalTabState.tabs.find((t) => t.id === globalTabState.activeTabId) ?? null,
    [globalTabState.tabs, globalTabState.activeTabId]
  );
  const activeSearch = activeGlobalTab?.kind === 'search' ? workingLibrarySearch : librarySearch;

  const inspectorItemId = useMemo(() => resolveShellInspectorItemId({
    activeView,
    isSearchSurface,
    selectedSearchItemId: activeSearch.state.selectedItemId,
    selectedBrowseItemId,
    activeGlobalTab,
  }), [
    activeView,
    isSearchSurface,
    activeSearch.state.selectedItemId,
    selectedBrowseItemId,
    activeGlobalTab,
  ]);

  const [inspectorResolvedItem, setInspectorResolvedItem] = React.useState<Item | null>(null);
  const [inspectorItemLoading, setInspectorItemLoading] = React.useState(false);

  React.useEffect(() => {
    if (!inspectorItemId) {
      setInspectorResolvedItem(null);
      setInspectorItemLoading(false);
      return;
    }
    const fromList = items.find((i) => i.id === inspectorItemId);
    if (fromList) {
      setInspectorResolvedItem(fromList);
      setInspectorItemLoading(false);
      return;
    }
    let cancelled = false;
    setInspectorResolvedItem(null);
    setInspectorItemLoading(true);
    void getItem(inspectorItemId)
      .then((item) => {
        if (!cancelled) setInspectorResolvedItem(item ?? null);
      })
      .finally(() => {
        if (!cancelled) setInspectorItemLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inspectorItemId, items]);

  const inspectorItem = inspectorResolvedItem?.id === inspectorItemId
    ? inspectorResolvedItem
    : null;
  const inspectorWorkspaceAction = inspectorItem ? (
    <WorkspaceDestinationPicker
      item={inspectorItem}
      destinations={workspaceDestinations}
      recentDestinationKeys={globalTabState.recentWorkspaceDestinationKeys}
      isAdded={(destination) => itemIsInWorkspace(inspectorItem, destination)}
      onAdd={(destination) => updateItemWorkspace(inspectorItem, destination, false)}
      onView={(destination) => updateItemWorkspace(inspectorItem, destination, true)}
    />
  ) : undefined;

  const searchContext = useMemo(() => {
    if (!isSearchSurface || !activeSearch.state.result?.results.length) return null;
    return {
      query: activeSearch.state.query,
      resultItemIds: activeSearch.state.result.results.slice(0, 20).map((r) => r.itemId),
      items,
    };
  }, [isSearchSurface, activeSearch.state.result, activeSearch.state.query, items]);

  const enrichmentPrimaryInItemTab = useMemo(() => {
    const activeGlobalTab = globalTabState.tabs.find((t) => t.id === globalTabState.activeTabId);
    if (activeGlobalTab?.kind !== 'item' || !inspectorItem) return false;
    return activeGlobalTab.itemId === inspectorItem.id;
  }, [globalTabState.tabs, globalTabState.activeTabId, inspectorItem]);

  const handleRerunSearch = useCallback(
    (query: string) => {
      activeSearch.setQuery(query);
      void activeSearch.runSearch(query);
    },
    [activeSearch]
  );

  const handleSwitchScopeForItem = useCallback(
    (item: Item) => {
      const target = getItemPrimaryScope(item, collections);
      setScopeNavigationRevision((revision) => revision + 1);
      setScopeProjectId(target.projectId);
      setScopeCollectionId(target.collectionId);
      patchNavigationState({
        scopeProjectId: target.projectId,
        scopeCollectionId: target.collectionId,
      });
    },
    [collections]
  );

  const handleClearProjectScope = useCallback(() => {
    setScopeNavigationRevision((revision) => revision + 1);
    setScopeProjectId('all');
    setScopeCollectionId('all');
    patchNavigationState({ scopeProjectId: 'all', scopeCollectionId: 'all' });
  }, []);

  const handleClearCollectionScope = useCallback(() => {
    setScopeNavigationRevision((revision) => revision + 1);
    setScopeCollectionId('all');
    patchNavigationState({ scopeCollectionId: 'all' });
  }, []);

  const handleResetScope = useCallback(() => {
    setScopeNavigationRevision((revision) => revision + 1);
    setScopeProjectId('all');
    setScopeCollectionId('all');
    patchNavigationState({ scopeProjectId: 'all', scopeCollectionId: 'all' });
  }, []);

  const isFullPageView = isFullPageDashboardView(activeView);
  const isFullMiddleView = isFullMiddleDashboardView(activeView);

  return (
    <ItemDragDropProvider
      projects={projects}
      collections={collections}
      workspaceDestinations={workspaceDestinations}
      openProjectIds={recentProjectIds}
      isInTarget={dragTargetContainsItem}
      onTransfer={handleDraggedItemTransfer}
      onReorderWorkspaceItem={handleWorkspaceItemReorder}
    >
    <ItemPeekProvider
      items={items}
      projects={projects}
      collections={collections}
      workspaceDestinations={workspaceDestinations}
      activeWorkspaceKey={getActiveWorkspaceKey(globalTabState)}
      isItemInWorkspace={itemIsInWorkspace}
      onAddItemToWorkspace={(item, destination) => updateItemWorkspace(item, destination, false)}
      onViewItemInWorkspace={(item, destination) => updateItemWorkspace(item, destination, true)}
      onUpdateItem={handleUpdateBookmarkWithToast}
      onCreateProject={onCreateProject}
      onCreateCollection={onCreateCollection}
    >
    <div className="ui-dashboard-shell">
      {/* Left Sidebar */}
      <div
        className="ui-dashboard-shell__sidebar"
        data-collapsed={shellLayout.leftSidebarCollapsed ? 'true' : 'false'}
      >
        <LeftSidebar 
          isCollapsed={shellLayout.leftSidebarCollapsed} 
          onToggle={handleLeftSidebarToggle}
          activeView={activeView}
          onSelectView={handleSelectView}
          projects={projects}
          collections={collections}
          items={items}
          scopeProjectId={scopeProjectId}
          scopeCollectionId={scopeCollectionId}
          onSelectProjectScope={handleSelectProjectScope}
          onSelectCollectionScope={handleSelectCollectionScope}
          onCreateProject={onCreateProject}
          onDeleteProject={handleDeleteProjectFromSidebar}
          onCreateCollection={onCreateCollection}
          onDeleteCollection={handleDeleteCollectionFromSidebar}
        />
      </div>

      {/* Middle + Right Area */}
      <div className="ui-dashboard-shell__body">
        
        {/* Middle workspace */}
        <main className="ui-dashboard-shell__workspace">
          <PipelineCoordinatorBanner />
          {isFullPageView ? (
            // Full-page views (Settings, Tab Commander, Workspaces)
            <div className="ui-dashboard-shell__full-page scrollbar">
              <MainContent 
                activeView={activeView} 
                projects={projects}
                workspaces={workspaces} 
                items={items}
                collections={collections}
                windows={windows}
                onWorkspacesChanged={onWorkspacesChanged}
                onCloseTab={onCloseTab}
                onCloseWindow={onCloseWindow}
                onAddBookmark={handleAddBookmarkWithToast}
                onUpdateBookmark={handleUpdateBookmarkWithToast}
                onDeleteBookmark={handleDeleteBookmarkWithToast}
                onCreateProject={onCreateProject}
                onCreateCollection={onCreateCollection}
                onCreateItem={onCreateItem}
                onRefresh={onRefresh}
                libraryLoading={libraryLoading}
                libraryHydrateProgress={libraryHydrateProgress}
                onChooseBackupFolder={onChooseBackupFolder}
                onSetAsBrowserHome={onSetAsBrowserHome}
                onRestoreBackupFile={onRestoreBackupFile}
                onManualBackup={onManualBackup}
                onExportJsonSnapshot={onExportJsonSnapshot}
                onExportPipelineAnalysis={onExportPipelineAnalysis}
                onResolveConflictLoadRemote={onResolveConflictLoadRemote}
                onResolveConflictKeepLocal={onResolveConflictKeepLocal}
                backupFolderLinked={backupFolderLinked}
                backupFolderReady={backupFolderReady}
                backupFolderName={backupFolderName}
                backupStatus={backupStatus}
                folderMirrorStatus={folderMirrorStatus}
                aiSettings={aiSettings}
                onSaveAISettings={onSaveAISettings}
                onTestAI={onTestAI}
                scopeProjectId={scopeProjectId}
                scopeCollectionId={scopeCollectionId}
                scopeNavigationRevision={scopeNavigationRevision}
                globalTabState={globalTabState}
                onGlobalTabStateChange={handleGlobalTabStateChange}
                categoryBrowse={categoryBrowse}
                onClearCategoryBrowse={handleClearCategoryBrowse}
                onBrowseCategory={handleBrowseCategory}
                pipelineBrowse={pipelineBrowse}
                onClearPipelineBrowse={handleClearPipelineBrowse}
                onBatchProcessQueue={handleBatchProcessQueue}
                onOpenPipelineHub={() => handleOpenPipelineHub({ filter: 'needs_attention' })}
                onSelectView={handleSelectView}
                onOpenHomeWorkspace={handleOpenHomeWorkspace}
                onSelectProjectScope={handleSelectProjectScope}
                onOpenItemFromSearch={handleOpenItemInInspector}
                onInspectItem={handleInspectPipelineItem}
                onClearProjectScope={handleClearProjectScope}
                onClearCollectionScope={handleClearCollectionScope}
                onResetScope={handleResetScope}
              />
            </div>
          ) : isFullMiddleView ? (
            // Full-middle views: no list pane, right panel stays (Home, future Search tab)
            // The right panel is rendered outside this block, at the same level as the middle workspace
            <MainContent 
              activeView={activeView} 
              projects={projects}
              workspaces={workspaces} 
              items={items}
              collections={collections}
              windows={windows}
              onWorkspacesChanged={onWorkspacesChanged}
              onCloseTab={onCloseTab}
              onCloseWindow={onCloseWindow}
              onAddBookmark={handleAddBookmarkWithToast}
              onUpdateBookmark={handleUpdateBookmarkWithToast}
              onDeleteBookmark={handleDeleteBookmarkWithToast}
              onCreateProject={onCreateProject}
              onCreateCollection={onCreateCollection}
              onCreateItem={onCreateItem}
              onRefresh={onRefresh}
              libraryLoading={libraryLoading}
              libraryHydrateProgress={libraryHydrateProgress}
              onChooseBackupFolder={onChooseBackupFolder}
              onSetAsBrowserHome={onSetAsBrowserHome}
              onRestoreBackupFile={onRestoreBackupFile}
              onManualBackup={onManualBackup}
              onExportJsonSnapshot={onExportJsonSnapshot}
              onExportPipelineAnalysis={onExportPipelineAnalysis}
              onResolveConflictLoadRemote={onResolveConflictLoadRemote}
              onResolveConflictKeepLocal={onResolveConflictKeepLocal}
              backupFolderLinked={backupFolderLinked}
              backupFolderReady={backupFolderReady}
              backupFolderName={backupFolderName}
              backupStatus={backupStatus}
              folderMirrorStatus={folderMirrorStatus}
              aiSettings={aiSettings}
              onSaveAISettings={onSaveAISettings}
              onTestAI={onTestAI}
              scopeProjectId={scopeProjectId}
              scopeCollectionId={scopeCollectionId}
              scopeNavigationRevision={scopeNavigationRevision}
              recentProjectIds={recentProjectIds}
              recentProjectAccessIds={recentProjectAccessIds}
              globalTabState={globalTabState}
              onGlobalTabStateChange={handleGlobalTabStateChange}
              renderListTab={renderListTab}
              statusBar={statusBar}
              librarySearch={librarySearch}
              workingLibrarySearch={workingLibrarySearch}
              onLibrarySearch={openLibrarySearch}
              onLibrarySearchInTab={openLibrarySearchInTab}
              onOpenItemFromSearch={handleOpenItemInInspector}
              onInspectItem={handleInspectPipelineItem}
              categoryBrowse={categoryBrowse}
              onClearCategoryBrowse={handleClearCategoryBrowse}
              onBrowseCategory={handleBrowseCategory}
              pipelineBrowse={pipelineBrowse}
              onClearPipelineBrowse={handleClearPipelineBrowse}
              onBatchProcessQueue={handleBatchProcessQueue}
              onOpenPipelineHub={() => handleOpenPipelineHub({ filter: 'needs_attention' })}
              batchRunning={pipeline.isRunning}
              batchCancellable={pipeline.isCancellable}
              onCancelBatch={handleCancelBatch}
              onSelectView={handleSelectView}
              onOpenHomeWorkspace={handleOpenHomeWorkspace}
              shellLayout={shellLayout}
              onShellLayoutPatch={patchShellLayoutState}
              onClearProjectScope={handleClearProjectScope}
              onClearCollectionScope={handleClearCollectionScope}
              onResetScope={handleResetScope}
              onSelectProjectScope={handleSelectProjectScope}
              onReorderProjectScopes={handleReorderProjectScopes}
              onCloseProjectScope={handleCloseProjectScope}
              onSelectCollectionScope={handleSelectCollectionScope}
              onSwitchScopeForItem={handleSwitchScopeForItem}
              onSelectedBrowseItemChange={handleSelectedBrowseItemChange}
            />
          ) : (
            // Split view: List pane (left) + Tabbed detail pane (right)
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              
              {/* LIST PANE - left middle */}
              <div style={{ 
                width: shellLayout.listPaneWidth, 
                flexShrink: 0, 
                display: 'flex', 
                flexDirection: 'column',
                borderRight: '1px solid var(--border)',
                background: 'var(--bg-panel)',
              }}>
                <MainContent 
                  activeView={activeView} 
                  projects={projects}
                  workspaces={workspaces} 
                  items={items}
                  collections={collections}
                  windows={windows}
                  onWorkspacesChanged={onWorkspacesChanged}
                  onCloseTab={onCloseTab}
                  onCloseWindow={onCloseWindow}
                  onAddBookmark={handleAddBookmarkWithToast}
                  onUpdateBookmark={handleUpdateBookmarkWithToast}
                  onDeleteBookmark={handleDeleteBookmarkWithToast}
                  onCreateProject={onCreateProject}
                  onCreateCollection={onCreateCollection}
                  onCreateItem={onCreateItem}
                  onRefresh={onRefresh}
                  libraryLoading={libraryLoading}
                  libraryHydrateProgress={libraryHydrateProgress}
                  onChooseBackupFolder={onChooseBackupFolder}
                  onSetAsBrowserHome={onSetAsBrowserHome}
                  onRestoreBackupFile={onRestoreBackupFile}
                  onManualBackup={onManualBackup}
                  onExportJsonSnapshot={onExportJsonSnapshot}
                onExportPipelineAnalysis={onExportPipelineAnalysis}
                  onResolveConflictLoadRemote={onResolveConflictLoadRemote}
                  onResolveConflictKeepLocal={onResolveConflictKeepLocal}
                  backupFolderLinked={backupFolderLinked}
                  backupFolderReady={backupFolderReady}
                  backupFolderName={backupFolderName}
                  backupStatus={backupStatus}
                  folderMirrorStatus={folderMirrorStatus}
                  aiSettings={aiSettings}
                  onSaveAISettings={onSaveAISettings}
                  onTestAI={onTestAI}
                  scopeProjectId={scopeProjectId}
                  scopeCollectionId={scopeCollectionId}
                  scopeNavigationRevision={scopeNavigationRevision}
                  listMode
                  onOpenItem={handleOpenItemTab}
                  onOpenWorkspace={handleOpenWorkspaceTab}
                  onOpenListTab={handleOpenListTab}
                  onAddToCommonListTab={handleAddToCommonListTab}
              globalTabState={globalTabState}
              onGlobalTabStateChange={handleGlobalTabStateChange}
              renderListTab={renderListTab}
              categoryBrowse={categoryBrowse}
              onClearCategoryBrowse={handleClearCategoryBrowse}
              onBrowseCategory={handleBrowseCategory}
              pipelineBrowse={pipelineBrowse}
              onClearPipelineBrowse={handleClearPipelineBrowse}
              shellLayout={shellLayout}
              onShellLayoutPatch={patchShellLayoutState}
              onClearProjectScope={handleClearProjectScope}
              onClearCollectionScope={handleClearCollectionScope}
              onResetScope={handleResetScope}
                />
              </div>

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  setShellLayout((prev) =>
                    patchShellLayout({ listPaneWidth: prev.listPaneWidth + delta }, prev)
                  );
                }}
              />

              {/* TABBED DETAIL PANE - right middle */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {globalTabState.tabs.length === 0 ? (
                  <div style={{ 
                    flex: 1, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: 'var(--text-faint)',
                    fontSize: 'var(--text-sm)',
                    background: 'var(--bg-panel)'
                  }}>
                    Click an item to open it here
                  </div>
                ) : (
                  <GlobalTabSystem 
                    items={items} 
                    collections={collections} 
                    projects={projects} 
                    tabState={globalTabState} 
                    onTabStateChange={handleGlobalTabStateChange} 
                    onUpdateItem={handleUpdateBookmarkWithToast} 
                    onDeleteBookmark={handleDeleteBookmarkWithToast}
                    onCreateProject={onCreateProject}
                    onCreateCollection={onCreateCollection}
                    renderListTab={renderListTab}
                    statusBar={statusBar}
                    librarySearch={workingLibrarySearch}
                    onOpenItemFromSearch={handleOpenItemInInspector}
                    scopeProjectId={scopeProjectId}
                    scopeCollectionId={scopeCollectionId}
                    onSwitchScopeForItem={handleSwitchScopeForItem}
                  />
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right Panel */}
        {!isFullPageView && !shellLayout.rightPanelCollapsed ? (
          <Resizer
            direction="vertical"
            thickness={6}
            ariaLabel="Resize Inspector panel"
            onResize={(delta) => {
              setShellLayout((prev) =>
                patchShellLayout({ rightPanelWidth: prev.rightPanelWidth - delta }, prev)
              );
            }}
          />
        ) : null}
        {!isFullPageView && (
          <RightPanel
            activeItem={inspectorItem}
            activeItemLoading={inspectorItemLoading}
            aiSettings={aiSettings}
            scopeProjectId={scopeProjectId}
            scopeCollectionId={scopeCollectionId}
            searchContext={searchContext}
            isSearchSurface={isSearchSurface}
            enrichmentPrimaryInItemTab={enrichmentPrimaryInItemTab}
            isCollapsed={shellLayout.rightPanelCollapsed}
            width={shellLayout.rightPanelWidth}
            activeTab={shellLayout.rightPanelTab}
            onCollapsedChange={(collapsed) => patchShellLayoutState({ rightPanelCollapsed: collapsed })}
            onActiveTabChange={(tab) => patchShellLayoutState({ rightPanelTab: tab })}
            recentQueries={activeSearch.state.recentQueries}
            currentSearchQuery={activeSearch.state.query}
            onRerunSearch={handleRerunSearch}
            onOpenItemInTab={activeView === 'home' || isSearchSurface ? handleAddItemToWorkspace : undefined}
            workspaceAction={inspectorWorkspaceAction}
            renderWorkspaceActionForItem={renderSimilarWorkspaceAction}
            onTestAI={onTestAI}
          />
        )}
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        recentQueries={librarySearch.state.recentQueries}
        onClose={() => setCommandPaletteOpen(false)}
        onSearch={(query) => openLibrarySearch(query)}
      />

      {batchConfirm ? (
        <PipelineBatchConfirmModal
          kind={batchConfirm.kind}
          itemIds={batchConfirm.itemIds}
          items={items}
          onConfirm={(selectedIds) => void handleBatchConfirm(selectedIds)}
          onCancel={() => setBatchConfirm(null)}
        />
      ) : null}
    </div>
    </ItemPeekProvider>
    </ItemDragDropProvider>
  );
};
