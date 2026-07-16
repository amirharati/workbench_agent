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
  type GlobalTabSearch,
} from '../GlobalTabSystem';
import { WorkspaceTabRenderer } from '../WorkspaceTabRenderer';
import { RightPanel } from './RightPanel';
import { StatusBar, useStatusBar } from '../StatusBar';
import { ToastProvider, useToast } from '../../ToastContainer';
import { PipelineProgressProvider, usePipelineProgress } from '../PipelineProgressProvider';
import { PipelineBatchConfirmModal } from '../PipelineBatchConfirmModal';
import { CommandPalette } from '../CommandPalette';
import { useLibrarySearch, LIBRARY_SEARCH_TAB_ID, loadLastSearchQuery } from '../../../hooks/useLibrarySearch';
import { useImportPipelineJob } from '../../../hooks/useImportPipelineJob';
import { ImportPipelineJobBanner } from '../ImportPipelineJobBanner';
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
  'tab-commander',
  'import-studio',
  'help',
]);
/** Keep right Inspector visible (Home, Search, Enrichment Hub). */
const FULL_MIDDLE_VIEWS = new Set<DashboardView>(['home', 'search', 'notes', 'pipeline']);

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
  const importPipelineJob = useImportPipelineJob(backupFolderReady);
  const pipeline = usePipelineProgress();
  const { messages: statusMessages, addStatusMessage, dismissStatusMessage } = useStatusBar();
  const librarySearch = useLibrarySearch((message) => {
    addToast({ type: 'error', message: `Search failed: ${message}` });
  });
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
  const [categoryBrowse, setCategoryBrowse] = useState<CategoryBrowseFilter | null>(null);
  const [pipelineBrowse, setPipelineBrowse] = useState<PipelineBrowseFilter | null>(null);
  const [batchConfirm, setBatchConfirm] = useState<{
    kind: PipelineQueueKind;
    itemIds: string[];
  } | null>(null);
  const [globalTabState, setGlobalTabState] = useState<GlobalTabState>(() => loadGlobalTabState());
  const prevSearchViewRef = useRef(false);
  const handleGlobalTabStateChange = (next: GlobalTabState) => {
    setGlobalTabState(next);
    saveGlobalTabState(next);
  };

  useEffect(() => {
    void ensurePendingClassifySignals();
  }, []);

  /** Close tabs whose item/workspace ids no longer exist (e.g. after DB clear). */
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
      setActiveView('search');
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
      if (q) {
        librarySearch.setQuery(q);
        void librarySearch.runSearch(q);
      }

      setGlobalTabState((prev) => {
        const withoutSearch = prev.tabs.filter((t) => t.kind !== 'search');
        const searchTab: GlobalTabSearch = {
          kind: 'search',
          id: LIBRARY_SEARCH_TAB_ID,
          query: q,
        };
        const next = {
          ...prev,
          tabs: [...withoutSearch, searchTab],
          activeTabId: LIBRARY_SEARCH_TAB_ID,
        };
        saveGlobalTabState(next);
        return next;
      });

      setActiveView('home');
    },
    [librarySearch]
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

  useEffect(() => {
    const q = librarySearch.state.query.trim();
    if (!q) return;
    setGlobalTabState((prev) => {
      const searchTab = prev.tabs.find(
        (t) => t.kind === 'search' && t.id === LIBRARY_SEARCH_TAB_ID
      );
      if (!searchTab || searchTab.kind !== 'search' || searchTab.query === q) return prev;
      const next = {
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.kind === 'search' && t.id === LIBRARY_SEARCH_TAB_ID ? { ...t, query: q } : t
        ),
      };
      saveGlobalTabState(next);
      return next;
    });
  }, [librarySearch.state.query]);

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
        void importPipelineJob.refresh();
      }
    },
    [batchConfirm, importPipelineJob, pipeline]
  );

  const handleSelectProjectScope = (projectId: string | 'all') => {
    setScopeProjectId(projectId);
    setScopeCollectionId('all');
    patchNavigationState({ scopeProjectId: projectId, scopeCollectionId: 'all' });
  };

  const handleSelectCollectionScope = (collectionId: string, projectId?: string) => {
    setScopeCollectionId(collectionId);
    const nextProjectId = projectId ?? scopeProjectId;
    if (projectId) setScopeProjectId(projectId);
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


  const handleOpenItemTab = (item: Item) => {
    setGlobalTabState(prev => {
      const existing = prev.tabs.find(t => t.kind === 'item' && t.itemId === item.id);
      if (existing) return { ...prev, activeTabId: existing.id };
      const id = 'item-' + item.id;
      const next = { ...prev, tabs: [...prev.tabs, { kind: 'item' as const, id, itemId: item.id }], activeTabId: id };
      saveGlobalTabState(next);
      return next;
    });
  };

  /** Dedicated Search has no GlobalTabSystem — switch to Home so the open tab is visible. */
  const revealWorkspaceTabsIfNeeded = () => {
    if (activeView !== 'search') return;
    setActiveView('home');
    patchNavigationState({ activeView: 'home' });
  };

  /** Open item and focus the right-side Inspector (Hub / search). */
  const handleOpenItemInInspector = (item: Item) => {
    handleOpenItemTab(item);
    patchShellLayoutState({ rightPanelCollapsed: false, rightPanelTab: 'inspector' });
    revealWorkspaceTabsIfNeeded();
  };

  /** Search surface Inspector “Open in tab” — same tab reveal as result-row Open tab. */
  const handleOpenItemTabFromSearchSurface = (item: Item) => {
    handleOpenItemTab(item);
    revealWorkspaceTabsIfNeeded();
  };

  const handleOpenItemIdInTab = (itemId: string) => {
    const fromList = items.find((i) => i.id === itemId);
    if (fromList) {
      handleOpenItemTab(fromList);
      revealWorkspaceTabsIfNeeded();
      return;
    }
    void getItem(itemId).then((item) => {
      if (!item || item.deletedAt != null) return;
      handleOpenItemTab(item);
      revealWorkspaceTabsIfNeeded();
    });
  };

  const handleOpenWorkspaceTab = (workspace: Workspace) => {
    const tabId = 'workspace-' + workspace.id;
    setGlobalTabState(prev => {
      const existing = prev.tabs.find(t => t.id === tabId);
      if (existing) return { ...prev, activeTabId: existing.id };
      const next = { ...prev, tabs: [...prev.tabs, { kind: 'list' as const, id: tabId, listType: 'workspace' as const, title: workspace.name, workspaceId: workspace.id }], activeTabId: tabId };
      saveGlobalTabState(next);
      return next;
    });
  };

  const handleOpenListTab = (type: 'bookmark-list' | 'note-list', itemIds: string[], title: string) => {
    const titleKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tabId = `${type}-${titleKey}-${itemIds.slice(0, 5).join('-')}-${itemIds.length}`;
    setGlobalTabState(prev => {
      const existing = prev.tabs.find(t => t.id === tabId);
      if (existing) return { ...prev, activeTabId: existing.id };
      const next = { ...prev, tabs: [...prev.tabs, { kind: 'list' as const, id: tabId, listType: type as any, title, itemIds }], activeTabId: tabId };
      saveGlobalTabState(next);
      return next;
    });
  };

  const handleAddToCommonListTab = (_type: 'bookmark-list' | 'note-list', itemIds: string[], _title: string) => {
    const tabId = 'common-list';
    setGlobalTabState(prev => {
      const existingIdx = prev.tabs.findIndex(t => t.id === tabId);
      if (existingIdx === -1) {
        const next = { ...prev, tabs: [...prev.tabs, { kind: 'list' as const, id: tabId, listType: 'common-list' as const, title: 'Common tab', itemIds }], activeTabId: tabId };
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
    const activeGlobalTab = globalTabState.tabs.find((t) => t.id === globalTabState.activeTabId);
    return activeGlobalTab?.kind === 'search';
  }, [activeView, globalTabState.tabs, globalTabState.activeTabId]);

  const inspectorItemId = useMemo(() => {
    if (isSearchSurface) {
      return librarySearch.state.selectedItemId;
    }
    const activeGlobalTab = globalTabState.tabs.find((t) => t.id === globalTabState.activeTabId);
    if (activeGlobalTab?.kind === 'item') return activeGlobalTab.itemId;
    return null;
  }, [
    isSearchSurface,
    librarySearch.state.selectedItemId,
    globalTabState.tabs,
    globalTabState.activeTabId,
  ]);

  const [inspectorResolvedItem, setInspectorResolvedItem] = React.useState<Item | null>(null);

  React.useEffect(() => {
    if (!inspectorItemId) {
      setInspectorResolvedItem(null);
      return;
    }
    const fromList = items.find((i) => i.id === inspectorItemId);
    if (fromList) {
      setInspectorResolvedItem(fromList);
      return;
    }
    let cancelled = false;
    void getItem(inspectorItemId).then((item) => {
      if (!cancelled) setInspectorResolvedItem(item ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [inspectorItemId, items]);

  const inspectorItem = inspectorItemId ? inspectorResolvedItem : null;

  const searchContext = useMemo(() => {
    if (!isSearchSurface || !librarySearch.state.result?.results.length) return null;
    return {
      query: librarySearch.state.query,
      resultItemIds: librarySearch.state.result.results.slice(0, 20).map((r) => r.itemId),
      items,
    };
  }, [isSearchSurface, librarySearch.state.result, librarySearch.state.query, items]);

  const enrichmentPrimaryInItemTab = useMemo(() => {
    const activeGlobalTab = globalTabState.tabs.find((t) => t.id === globalTabState.activeTabId);
    if (activeGlobalTab?.kind !== 'item' || !inspectorItem) return false;
    return activeGlobalTab.itemId === inspectorItem.id;
  }, [globalTabState.tabs, globalTabState.activeTabId, inspectorItem]);

  const handleRerunSearch = useCallback(
    (query: string) => {
      librarySearch.setQuery(query);
      void librarySearch.runSearch(query);
    },
    [librarySearch]
  );

  const handleSwitchScopeForItem = useCallback(
    (item: Item) => {
      const target = getItemPrimaryScope(item, collections);
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
    setScopeProjectId('all');
    setScopeCollectionId('all');
    patchNavigationState({ scopeProjectId: 'all', scopeCollectionId: 'all' });
  }, []);

  const handleClearCollectionScope = useCallback(() => {
    setScopeCollectionId('all');
    patchNavigationState({ scopeCollectionId: 'all' });
  }, []);

  const handleResetScope = useCallback(() => {
    setScopeProjectId('all');
    setScopeCollectionId('all');
    patchNavigationState({ scopeProjectId: 'all', scopeCollectionId: 'all' });
  }, []);

  const isFullPageView = FULL_PAGE_VIEWS.has(activeView);
  const isFullMiddleView = FULL_MIDDLE_VIEWS.has(activeView);

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      overflow: 'hidden', 
      background: 'var(--bg)', 
      color: 'var(--text)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-base)',
    }}>
      {/* Left Sidebar */}
      <div style={{ 
        width: shellLayout.leftSidebarCollapsed ? '48px' : '200px',
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        transition: 'width 0.2s ease',
      }}>
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
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', background: 'var(--bg)' }}>
        
        {/* Middle workspace */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {backupFolderReady ? (
            <ImportPipelineJobBanner
              job={importPipelineJob.job}
              loading={importPipelineJob.loading}
              isResumable={importPipelineJob.isResumable}
              onDismiss={importPipelineJob.dismissJob}
              onJobChanged={importPipelineJob.refresh}
            />
          ) : null}

          {isFullPageView ? (
            // Full-page views (Settings, Tab Commander, Workspaces)
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }} className="scrollbar">
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
                categoryBrowse={categoryBrowse}
                onClearCategoryBrowse={handleClearCategoryBrowse}
                onBrowseCategory={handleBrowseCategory}
                pipelineBrowse={pipelineBrowse}
                onClearPipelineBrowse={handleClearPipelineBrowse}
                onBatchProcessQueue={handleBatchProcessQueue}
                onOpenPipelineHub={() => handleOpenPipelineHub({ filter: 'needs_attention' })}
                onSelectView={handleSelectView}
                onOpenItemFromSearch={handleOpenItemInInspector}
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
              globalTabState={globalTabState}
              onGlobalTabStateChange={handleGlobalTabStateChange}
              renderListTab={renderListTab}
              statusBar={statusBar}
              librarySearch={librarySearch}
              onLibrarySearch={openLibrarySearch}
              onLibrarySearchInTab={openLibrarySearchInTab}
              onOpenItemFromSearch={handleOpenItemInInspector}
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
              shellLayout={shellLayout}
              onShellLayoutPatch={patchShellLayoutState}
              onClearProjectScope={handleClearProjectScope}
              onClearCollectionScope={handleClearCollectionScope}
              onResetScope={handleResetScope}
              onSwitchScopeForItem={handleSwitchScopeForItem}
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
                    librarySearch={librarySearch}
                    onOpenItemFromSearch={handleOpenItemInInspector}
                    scopeProjectId={scopeProjectId}
                    scopeCollectionId={scopeCollectionId}
                    onSwitchScopeForItem={handleSwitchScopeForItem}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel */}
        {!isFullPageView && (
          <RightPanel
            activeItem={inspectorItem}
            aiSettings={aiSettings}
            scopeProjectId={scopeProjectId}
            scopeCollectionId={scopeCollectionId}
            searchContext={searchContext}
            isSearchSurface={isSearchSurface}
            enrichmentPrimaryInItemTab={enrichmentPrimaryInItemTab}
            isCollapsed={shellLayout.rightPanelCollapsed}
            activeTab={shellLayout.rightPanelTab}
            onCollapsedChange={(collapsed) => patchShellLayoutState({ rightPanelCollapsed: collapsed })}
            onActiveTabChange={(tab) => patchShellLayoutState({ rightPanelTab: tab })}
            recentQueries={librarySearch.state.recentQueries}
            currentSearchQuery={librarySearch.state.query}
            onRerunSearch={handleRerunSearch}
            onOpenItemInTab={isSearchSurface ? handleOpenItemTabFromSearchSurface : undefined}
            onOpenItemIdInTab={handleOpenItemIdInTab}
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
  );
};
