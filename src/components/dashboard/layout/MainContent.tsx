import React, { useMemo, useState, useEffect } from 'react';
import { Workspace, Item, Collection, Project, deleteProject, ALL_PROJECTS_ID, UpdateItemOptions } from '../../../lib/db';
import type { BackupStatusSnapshot, RestoreBackupResult } from '../../../lib/backupCoordinator';
import type { DbWorkerStatus } from '../../../lib/storage/dbClient';
import type { AISettings } from '../../../lib/ai/types';
import { buildBookmarkGroundingPrompt, type BookmarkAISource } from '../../../lib/ai/bookmarkContext';
import { formatDateTime } from '../../../lib/utils';
import { DashboardView } from './DashboardLayout';
import type { WindowGroup } from '../../../App';
import { HomeView } from '../HomeView';
import { HelpView } from '../HelpView';
import { ProductSearchView } from '../ProductSearchView';
import { useLibrarySearch } from '../../../hooks/useLibrarySearch';
import { usePipelineBadgeMap } from '../../../hooks/usePipelineBadgeMap';
import type { CategoryBrowseFilter, PipelineBrowseFilter, PipelineQueueKind } from '../../../lib/pipeline';
import { ListPipelineBadge } from '../PipelineDisplayBlocks';
import { ScopeChipsBar } from '../ScopeChipsBar';
import { type GlobalTabState } from '../GlobalTabSystem';
import { SHELL_LAYOUT_DEFAULTS, type ShellLayoutState } from '../../../lib/shell/shellLayoutState';
import { SettingsView } from '../SettingsView';
import { ImportStudioView } from '../ImportStudioView';
import { PipelineHubView } from '../PipelineHubView';
import { EnrichmentPanel } from '../EnrichmentPanel';
import { TabCommanderView } from '../TabCommanderView';
import { ProjectDashboard } from '../ProjectDashboard';
import { CollectionsView } from '../CollectionsView';
import { sortItemsWithPinsFirst } from '../../../lib/itemQuickAccess';
import { WorkspacesView } from '../WorkspacesView';
import { SearchBar } from '../SearchBar';
import { Resizer } from '../Resizer';
import { Panel } from '../../../styles/primitives';
import { ItemContextMenu } from '../ItemContextMenu';
import { List, Grid, ExternalLink, Eye, Pencil, Trash2, Calendar, Plus } from 'lucide-react';
import { NewProjectModal, NewCollectionModal, NewItemModal } from '../CreateModals';
import { DeleteConfirmDialog } from '../../DeleteConfirmDialog';
import { TrashView } from '../TrashView';
import { ExtensionPageUrlLink } from '../BookmarkUrlLink';

type LibrarySearchApi = ReturnType<typeof useLibrarySearch>;

interface MainContentProps {
  activeView: DashboardView;
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  projects: Project[];
  items: Item[];
  collections: Collection[];
  workspaces: Workspace[];
  windows: WindowGroup[];
  onWorkspacesChanged?: () => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onAddBookmark?: (url: string, title?: string, collectionId?: string) => Promise<void>;
  onUpdateBookmark?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onDeleteBookmark?: (id: string, collectionId?: string) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onCreateItem?: (data: {
    title: string;
    url?: string;
    notes?: string;
    collectionIds: string[];
  }) => Promise<void>;
  onRefresh?: (scope?: import('../../../lib/libraryRefresh').LibraryRefreshScope) => Promise<void>;
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
  listMode?: boolean;
  onOpenItem?: (item: Item) => void;
  onOpenWorkspace?: (workspace: Workspace) => void;
  onOpenListTab?: (type: 'bookmark-list' | 'note-list', itemIds: string[], title: string) => void;
  onAddToCommonListTab?: (type: 'bookmark-list' | 'note-list', itemIds: string[], sectionTitle: string) => void;
  globalTabState?: GlobalTabState;
  onGlobalTabStateChange?: (next: GlobalTabState) => void;
  renderListTab?: (tab: any) => React.ReactNode;
  statusBar?: React.ReactNode;
  librarySearch?: LibrarySearchApi;
  onLibrarySearch?: (query?: string) => void;
  onLibrarySearchInTab?: (query?: string) => void;
  onOpenItemFromSearch?: (item: Item) => void;
  categoryBrowse?: CategoryBrowseFilter | null;
  onClearCategoryBrowse?: () => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  pipelineBrowse?: PipelineBrowseFilter | null;
  onClearPipelineBrowse?: () => void;
  onBatchProcessQueue?: (kind: PipelineQueueKind) => Promise<void>;
  onOpenPipelineHub?: () => void;
  batchRunning?: boolean;
  batchCancellable?: boolean;
  onCancelBatch?: () => void;
  onSelectView?: (view: DashboardView) => void;
  shellLayout?: ShellLayoutState;
  onShellLayoutPatch?: (patch: Partial<ShellLayoutState>) => void;
  onClearProjectScope?: () => void;
  onClearCollectionScope?: () => void;
  onResetScope?: () => void;
  onSwitchScopeForItem?: (item: Item) => void;
}

export const MainContent: React.FC<MainContentProps> = ({ 
  activeView, 
  scopeProjectId = 'all',
  scopeCollectionId = 'all',
  projects,
  items, 
  collections, 
  workspaces,
  windows,
  onWorkspacesChanged,
  onCloseTab,
  onCloseWindow,
  onAddBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
  onCreateProject,
  onCreateCollection,
  onCreateItem,
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
  backupFolderReady,
  backupFolderName,
  backupStatus,
  folderMirrorStatus,
  aiSettings,
  onSaveAISettings,
  onTestAI,
  listMode = false,
  onOpenItem,
  onOpenWorkspace,
  onOpenListTab,
  onAddToCommonListTab,
  globalTabState,
  onGlobalTabStateChange,
  renderListTab,
  statusBar,
  librarySearch,
  onLibrarySearchInTab,
  onOpenItemFromSearch,
  categoryBrowse,
  onClearCategoryBrowse,
  onBrowseCategory,
  pipelineBrowse,
  onClearPipelineBrowse,
  onBatchProcessQueue,
  onOpenPipelineHub,
  batchRunning,
  batchCancellable,
  onCancelBatch,
  onSelectView,
  shellLayout,
  onShellLayoutPatch,
  onClearProjectScope,
  onClearCollectionScope,
  onResetScope,
  onSwitchScopeForItem,
}) => {
  const resolvedShellLayout = shellLayout ?? SHELL_LAYOUT_DEFAULTS;
  const bookmarkListWidth = resolvedShellLayout.bookmarkListWidth;
  const bookmarkDetailWidth = resolvedShellLayout.bookmarkDetailWidth;
  const notesListWidth = resolvedShellLayout.notesListWidth;
  const notesDetailWidth = resolvedShellLayout.notesDetailWidth;
  const patchLayout = (patch: Partial<ShellLayoutState>) => {
    onShellLayoutPatch?.(patch);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCollectionId, setNewCollectionId] = useState<string | undefined>(undefined);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCollectionId, setEditCollectionId] = useState<string | undefined>(undefined);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBookmarkProjectId, setSelectedBookmarkProjectId] = useState<string | 'all'>('all');
  const [bookmarkContextMenu, setBookmarkContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [bookmarkViewMode, setBookmarkViewMode] = useState<'list' | 'grid'>('grid');
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [bookmarkDeleteTarget, setBookmarkDeleteTarget] = useState<Item | null>(null);
  const [bookmarkDeleteExplicitCollectionId, setBookmarkDeleteExplicitCollectionId] = useState<string | undefined>(undefined);

  const getDeleteDialogCollectionContext = (item: Item) => {
    if (bookmarkDeleteExplicitCollectionId && (item.collectionIds || []).includes(bookmarkDeleteExplicitCollectionId)) {
      const id = bookmarkDeleteExplicitCollectionId;
      return { id, name: collections.find((c) => c.id === id)?.name };
    }
    if (viewingItem?.id === item.id && selectedPlacementId && (item.collectionIds || []).includes(selectedPlacementId)) {
      return { id: selectedPlacementId, name: collections.find((c) => c.id === selectedPlacementId)?.name };
    }
    if (selectedNoteId === item.id && scopeCollectionId !== 'all' && (item.collectionIds || []).includes(scopeCollectionId)) {
      return { id: scopeCollectionId, name: collections.find((c) => c.id === scopeCollectionId)?.name };
    }
    if (scopeCollectionId !== 'all' && (item.collectionIds || []).includes(scopeCollectionId)) {
      return { id: scopeCollectionId, name: collections.find((c) => c.id === scopeCollectionId)?.name };
    }
    const first = item.collectionIds?.[0];
    return { id: first, name: first ? collections.find((c) => c.id === first)?.name : undefined };
  };

  const openBookmarkDeleteDialog = (item: Item, explicitCollectionId?: string) => {
    setBookmarkDeleteTarget(item);
    setBookmarkDeleteExplicitCollectionId(explicitCollectionId);
  };

  // Notes view state
  const [selectedNotesProjectId, setSelectedNotesProjectId] = useState<string | 'all'>('all');
  const [notesContextMenu, setNotesContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [notesViewMode, setNotesViewMode] = useState<'list' | 'grid'>('grid');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNoteContent, setEditNoteContent] = useState('');
  // Create modals (top-level views: Projects, Collections, Bookmarks, Notes)
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [showAddBookmark, setShowAddBookmark] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showImportStudio, setShowImportStudio] = useState(false);
  const [bookmarkAiPrompt, setBookmarkAiPrompt] = useState('');
  const [bookmarkAiRunning, setBookmarkAiRunning] = useState(false);
  const [bookmarkAiResult, setBookmarkAiResult] = useState('');
  const [bookmarkAiError, setBookmarkAiError] = useState('');
  const [bookmarkAiSources, setBookmarkAiSources] = useState<BookmarkAISource[]>([]);

  // Keep bookmark/note classification mutually exclusive:
  // - Bookmark: has a non-empty URL
  // - Note: no URL
  const isBookmarkItem = (item: Item) => !!item.url && item.url.trim().length > 0;
  const isNoteItem = (item: Item) => !item.url || item.url.trim().length === 0;

  const bookmarkItems = useMemo(() => items.filter(isBookmarkItem), [items]);

  // Filter bookmarks by selected project (must be at top level for hooks)
  const filteredBookmarkItems = useMemo(() => {
    if (activeView !== 'bookmarks') return [];
    
    let filtered = bookmarkItems;

    if (scopeCollectionId && scopeCollectionId !== 'all') {
      filtered = filtered.filter((item) => (item.collectionIds || []).includes(scopeCollectionId));
    }
    
    // Filter by project
    if (scopeCollectionId === 'all' && selectedBookmarkProjectId && selectedBookmarkProjectId !== 'all') {
      const projectCollectionIds = new Set(
        collections
          .filter(c => c.primaryProjectId === selectedBookmarkProjectId || 
                      (Array.isArray(c.projectIds) && c.projectIds.includes(selectedBookmarkProjectId)))
          .map(c => c.id)
      );
      filtered = filtered.filter(item => 
        (item.collectionIds || []).some(cid => projectCollectionIds.has(cid))
      );
    }

    if (categoryBrowse) {
      const allowed = new Set(categoryBrowse.itemIds);
      filtered = filtered.filter((item) => allowed.has(item.id));
    }

    if (pipelineBrowse) {
      const allowed = new Set(pipelineBrowse.itemIds);
      filtered = filtered.filter((item) => allowed.has(item.id));
    }
    
    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((item) => {
        const haystack = [
          item.title,
          item.url,
          item.notes,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    
    return sortItemsWithPinsFirst(filtered);
  }, [activeView, bookmarkItems, collections, selectedBookmarkProjectId, searchQuery, scopeCollectionId, categoryBrowse, pipelineBrowse]);

  const bookmarkBadgeIds = useMemo(() => {
    if (activeView !== 'bookmarks') return [];
    return filteredBookmarkItems.map((i) => i.id);
  }, [activeView, filteredBookmarkItems]);
  const bookmarkBadgeMap = usePipelineBadgeMap(bookmarkBadgeIds);

  // Notes are items without URLs (bookmark notes stay in Bookmarks view).
  const notesItems = useMemo(() => {
    return items.filter(isNoteItem);
  }, [items]);

  // Filter notes by selected project (must be at top level for hooks)
  const filteredNotesItems = useMemo(() => {
    if (activeView !== 'notes') return [];
    
    let filtered = notesItems;

    if (scopeCollectionId && scopeCollectionId !== 'all') {
      filtered = filtered.filter((item) => (item.collectionIds || []).includes(scopeCollectionId));
    }
    
    // Filter by project
    if (scopeCollectionId === 'all' && selectedNotesProjectId && selectedNotesProjectId !== 'all') {
      const projectCollectionIds = new Set(
        collections
          .filter(c => c.primaryProjectId === selectedNotesProjectId || 
                      (Array.isArray(c.projectIds) && c.projectIds.includes(selectedNotesProjectId)))
          .map(c => c.id)
      );
      filtered = filtered.filter(item => 
        (item.collectionIds || []).some(cid => projectCollectionIds.has(cid))
      );
    }
    
    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((item) => {
        const haystack = [
          item.title,
          item.notes || '',
          item.url || '',
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    
    return sortItemsWithPinsFirst(filtered);
  }, [activeView, notesItems, collections, selectedNotesProjectId, searchQuery, scopeCollectionId]);

  // Filter workspaces by project scope
  const filteredWorkspaces = useMemo(() => {
    if (activeView !== 'workspaces') return [];
    
    let filtered = workspaces;
    
    // Filter by project - when "all", show everything including detached
    // When specific project, show only that project's workspaces
    if (scopeProjectId && scopeProjectId !== 'all') {
      filtered = filtered.filter(ws => ws.projectId === scopeProjectId);
    }
    
    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((ws) => {
        const haystack = [
          ws.name,
          ...ws.windows.flatMap(w => w.tabs.map(t => t.title || t.url)),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    
    return filtered.sort((a, b) => b.updated_at - a.updated_at);
  }, [activeView, workspaces, scopeProjectId, searchQuery]);

  // Get selected note for notes view
  const selectedNote = useMemo(() => {
    if (activeView !== 'notes') return null;
    return filteredNotesItems.find(item => item.id === selectedNoteId) || null;
  }, [activeView, filteredNotesItems, selectedNoteId]);

  // Initialize edit content when note is selected
  useEffect(() => {
    if (selectedNote && !isEditingNote) {
      setEditNoteContent(selectedNote.notes || '');
    }
  }, [selectedNote, isEditingNote]);

  useEffect(() => {
    if (!scopeProjectId || scopeProjectId === 'all') {
      setSelectedBookmarkProjectId('all');
      setSelectedNotesProjectId('all');
      return;
    }
    setSelectedBookmarkProjectId(scopeProjectId);
    setSelectedNotesProjectId(scopeProjectId);
  }, [scopeProjectId]);

  // Keep bookmark detail selection valid as filters/scope change.
  useEffect(() => {
    if (activeView !== 'bookmarks') return;
    if (!viewingItem) return;
    const stillVisible = filteredBookmarkItems.some((item) => item.id === viewingItem.id);
    if (!stillVisible) setViewingItem(null);
  }, [activeView, filteredBookmarkItems, viewingItem]);

  // Reset placement selection when viewing item changes
  useEffect(() => {
    setSelectedPlacementId(null);
  }, [viewingItem?.id]);

  // Keep notes selection stable and auto-pick a first note when possible.
  useEffect(() => {
    if (activeView !== 'notes') return;
    if (filteredNotesItems.length === 0) {
      if (selectedNoteId !== null) setSelectedNoteId(null);
      return;
    }
    const hasSelected = selectedNoteId
      ? filteredNotesItems.some((item) => item.id === selectedNoteId)
      : false;
    if (!hasSelected) {
      setSelectedNoteId(filteredNotesItems[0]?.id ?? null);
    }
  }, [activeView, filteredNotesItems, selectedNoteId]);


  const openInNewTab = async (url: string) => {
    if (!url.startsWith('http')) return;
    try {
      await chrome.tabs.create({ url, active: true });
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  // getDomain moved to utils - keeping for backward compatibility if needed
  // const getDomain = (url: string) => {
  //   try {
  //     return new URL(url).hostname.replace(/^www\./, '');
  //   } catch {
  //     return url;
  //   }
  // };



  const handleAddSubmit = async () => {
    if (!newUrl.trim()) return;
    if (!onAddBookmark) return;
    await onAddBookmark(newUrl.trim(), newTitle.trim(), newCollectionId);
    setShowAddModal(false);
    setNewUrl('');
    setNewTitle('');
    setNewCollectionId(undefined);
  };

  const forwardTabUpdateItem = useMemo(
    () =>
      !onUpdateBookmark
        ? undefined
        : async (
            id: string,
            data: {
              title: string;
              url?: string;
              notes?: string;
              collectionIds: string[];
              notesPlacementCollectionId?: string;
            }
          ) => {
            await onUpdateBookmark(
              id,
              {
                title: data.title,
                url: data.url,
                notes: data.notes,
                collectionIds: data.collectionIds,
              },
              data.notesPlacementCollectionId
                ? { notesPlacementCollectionId: data.notesPlacementCollectionId }
                : undefined
            );
          },
    [onUpdateBookmark]
  );

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setEditTitle(item.title || '');
    const cid =
      item.id === viewingItem?.id
        ? selectedPlacementId || item.collectionIds?.[0]
        : item.collectionIds?.[0];
    setEditCollectionId(cid);
    const placementNotes = cid ? item.placements?.[cid]?.notes : undefined;
    setEditNotes(placementNotes ?? item.notes ?? '');
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditTitle('');
    setEditNotes('');
    setEditCollectionId(undefined);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !onUpdateBookmark) return;
    const ids =
      editingItem.collectionIds && editingItem.collectionIds.length > 0
        ? [...editingItem.collectionIds]
        : editCollectionId
          ? [editCollectionId]
          : [];
    await onUpdateBookmark(
      editingItem.id,
      {
        title: editTitle || editingItem.title,
        notes: editNotes,
        collectionIds: ids,
      },
      editCollectionId ? { notesPlacementCollectionId: editCollectionId } : undefined
    );
    closeEditModal();
  };


  // formatDate moved to utils - keeping for backward compatibility if needed
  // const formatDate = (ts: number) => {
  //   const d = new Date(ts);
  //   return d.toLocaleDateString();
  // };

  // Helper functions for bookmarks view (used in modal too)
  const getItemCollection = (item: Item) => {
    if (!item.collectionIds || item.collectionIds.length === 0) return null;
    return collections.find(c => c.id === item.collectionIds[0]) || null;
  };

  const getCollectionProject = (collection: Collection) => {
    if (!collection) return null;
    return projects.find(p => p.id === collection.primaryProjectId) || null;
  };

  const runBookmarkAIAssist = async () => {
    if (!onTestAI || !aiSettings) {
      setBookmarkAiError('Configure AI provider/settings first.');
      return;
    }
    const query = bookmarkAiPrompt.trim();
    if (!query) {
      setBookmarkAiError('Enter a question first.');
      return;
    }
    if (filteredBookmarkItems.length === 0) {
      setBookmarkAiError('No bookmarks in the current scope.');
      return;
    }

    const { prompt, sources } = buildBookmarkGroundingPrompt(query, filteredBookmarkItems, 20);
    setBookmarkAiRunning(true);
    setBookmarkAiError('');
    setBookmarkAiResult('');
    setBookmarkAiSources(sources);
    try {
      const result = await onTestAI(aiSettings, prompt);
      setBookmarkAiResult(result.text.trim());
    } catch (error) {
      setBookmarkAiError(error instanceof Error ? error.message : 'Bookmark AI request failed.');
    } finally {
      setBookmarkAiRunning(false);
    }
  };

  const renderScopeChipsBar = (itemCount?: number) => (
    <ScopeChipsBar
      scopeProjectId={scopeProjectId}
      scopeCollectionId={scopeCollectionId}
      projects={projects}
      collections={collections}
      categoryBrowse={categoryBrowse}
      pipelineBrowse={pipelineBrowse}
      itemCount={itemCount}
      onClearProject={onClearProjectScope ?? (() => {})}
      onClearCollection={onClearCollectionScope ?? (() => {})}
      onResetScope={onResetScope ?? (() => {})}
      onClearCategoryBrowse={onClearCategoryBrowse}
      onClearPipelineBrowse={onClearPipelineBrowse}
    />
  );

  const renderContent = () => {
    switch (activeView) {
      case 'home':
        return (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', height: '100%' }}>
            <HomeView
            items={items}
            collections={collections}
            projects={projects}
            libraryLoading={libraryLoading}
            libraryHydrateProgress={libraryHydrateProgress}
            homeState={globalTabState ?? { tabs: [], activeTabId: null, topPct: 40, searchQuery: '', bottomLayout: 'tabs', isSidebarCollapsed: false }}
            onHomeStateChange={onGlobalTabStateChange ?? (() => {})}
            onUpdateItem={onUpdateBookmark}
            onDeleteBookmark={onDeleteBookmark}
            searchQuery={globalTabState?.searchQuery ?? ''}
            onSearchQueryChange={(q) => onGlobalTabStateChange?.({ ...globalTabState!, searchQuery: q })}
            onLibrarySearchInTab={(q) => onLibrarySearchInTab?.(q)}
            librarySearch={librarySearch}
            onOpenItemFromSearch={onOpenItemFromSearch}
            topPct={globalTabState?.topPct ?? 40}
            onTopPctChange={(pct) => onGlobalTabStateChange?.({ ...globalTabState!, topPct: pct })}
            renderListTab={renderListTab}
            statusBar={statusBar}
            onBrowseCategory={onBrowseCategory}
            onBatchProcessQueue={onBatchProcessQueue}
            onOpenPipelineHub={onOpenPipelineHub}
            batchRunning={batchRunning}
            batchCancellable={batchCancellable}
            onCancelBatch={onCancelBatch}
            scopeProjectId={scopeProjectId}
            scopeCollectionId={scopeCollectionId}
            onSwitchScopeForItem={onSwitchScopeForItem}
          />
          </div>
        );
      case 'help':
        return <HelpView />;
      case 'search':
        if (!librarySearch) {
          return (
            <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Library search is unavailable.
            </div>
          );
        }
        return (
          <ProductSearchView
            items={items}
            collections={collections}
            state={librarySearch.state}
            onQueryChange={librarySearch.setQuery}
            onFiltersChange={librarySearch.setFilters}
            onModeChange={librarySearch.setMode}
            onSelectedItemIdChange={librarySearch.setSelectedItemId}
            onRunSearch={librarySearch.runSearch}
            onOpenItem={onOpenItemFromSearch ?? (() => {})}
            showOpenInTab
            onOpenInTab={() => onLibrarySearchInTab?.(librarySearch.state.query)}
          />
        );
      case 'trash':
        return (
          <TrashView
            onOpenItem={onOpenItemFromSearch ?? onOpenItem}
          />
        );
      case 'settings':
        return (
          <SettingsView
            backupFolderReady={backupFolderReady}
            backupFolderName={backupFolderName}
            onSetAsBrowserHome={onSetAsBrowserHome}
            onChooseBackupFolder={onChooseBackupFolder}
            onRestoreBackupFile={onRestoreBackupFile}
            onManualBackup={onManualBackup}
            onExportJsonSnapshot={onExportJsonSnapshot}
            onExportPipelineAnalysis={onExportPipelineAnalysis}
            onResolveConflictLoadRemote={onResolveConflictLoadRemote}
            onResolveConflictKeepLocal={onResolveConflictKeepLocal}
            backupStatus={backupStatus}
            folderMirrorStatus={folderMirrorStatus}
            aiSettings={aiSettings}
            onSaveAISettings={onSaveAISettings}
            onTestAI={onTestAI}
          />
        );
      case 'tab-commander':
        return (
          <TabCommanderView
            windows={windows}
            workspaces={workspaces}
            projects={projects}
            onWorkspacesChanged={onWorkspacesChanged}
            onCloseTab={onCloseTab}
            onCloseWindow={onCloseWindow}
            onRefresh={onRefresh}
          />
        );
      case 'ai-categories':
        return (
          <PipelineHubView
            items={items}
            collections={collections}
            projects={projects}
            scopeProjectId={scopeProjectId}
            scopeCollectionId={scopeCollectionId}
            onOpenItem={onOpenItemFromSearch ?? onOpenItem}
            onBrowseCategory={onBrowseCategory}
            onClearProjectScope={onClearProjectScope}
            onClearCollectionScope={onClearCollectionScope}
            onResetScope={onResetScope}
          />
        );
      case 'import-studio':
        return (
          <ImportStudioView
            projects={projects}
            collections={collections}
            onBack={() => onSelectView?.('bookmarks')}
            onImported={onRefresh}
          />
        );
      case 'pipeline':
        return (
          <PipelineHubView
            items={items}
            collections={collections}
            projects={projects}
            scopeProjectId={scopeProjectId}
            scopeCollectionId={scopeCollectionId}
            onOpenItem={onOpenItemFromSearch ?? onOpenItem}
            onBrowseCategory={onBrowseCategory}
            onClearProjectScope={onClearProjectScope}
            onClearCollectionScope={onClearCollectionScope}
            onResetScope={onResetScope}
          />
        );
      case 'projects':
        // Virtual "All" project that aggregates everything
        const virtualAllProject: Project = {
          id: ALL_PROJECTS_ID,
          name: 'All',
          description: 'All items from all projects',
          isDefault: false,
          created_at: 0,
          updated_at: Date.now(),
        };

        // Combined list with "All" first, then real projects
        const allProjectsWithVirtual = [virtualAllProject, ...projects];

        const activeProject = selectedProjectId
          ? (selectedProjectId === ALL_PROJECTS_ID 
              ? virtualAllProject 
              : projects.find((p) => p.id === selectedProjectId) || null)
          : null;

        const collectionsForProject = (pid: string | null) => {
          if (!pid) return [];
          
          // For "All" virtual project, show all non-default collections
          if (pid === ALL_PROJECTS_ID) {
            return collections.filter((c) => !c.isDefault && c.name !== 'Unsorted');
          }
          
          const projectUnsortedId = `collection_${pid}_unsorted`;
          return collections.filter((c) => {
            // Must belong to this project
            const belongsToProject =
              c.primaryProjectId === pid || (Array.isArray(c.projectIds) && c.projectIds.includes(pid));
            if (!belongsToProject) return false;

            // Include the current project's unsorted collection
            if (c.id === projectUnsortedId) return true;

            // Exclude other unsorted/default collections
            if (c.isDefault && c.id !== projectUnsortedId) return false;
            if (c.name === 'Unsorted' && c.id !== projectUnsortedId) return false;

            // Include all other collections
            return true;
          });
        };

        const itemsForProject = (pid: string | null) => {
          if (!pid) return [];
          
          // For "All" virtual project, show ALL items
          if (pid === ALL_PROJECTS_ID) {
            return items;
          }
          
          const colIds = new Set(collectionsForProject(pid).map((c) => c.id));
          return items.filter((it) => (it.collectionIds || []).some((cid) => colIds.has(cid)));
        };

        const handleCreateProject = () => {
          setShowNewProject(true);
        };

        const handleDeleteProject = async (id: string) => {
          // Can't delete the virtual "All" project
          if (id === ALL_PROJECTS_ID) {
            alert('Cannot delete the "All" aggregate view.');
            return;
          }
          if (!window.confirm('Delete this project? This does not delete bookmarks.')) return;
          const ok = await deleteProject(id);
          if (!ok) {
            alert('Cannot delete default project.');
            return;
          }
          if (selectedProjectId === id) setSelectedProjectId(null);
          if (onRefresh) await onRefresh();
        };

        const ProjectCard: React.FC<{ project: Project }> = ({ project }) => {
          const isVirtualAll = project.id === ALL_PROJECTS_ID;
          const cols = collectionsForProject(project.id);
          const its = itemsForProject(project.id);
          const canDelete = !project.isDefault && !isVirtualAll;
          
          return (
            <Panel
              key={project.id}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                // Special styling for "All" virtual project
                ...(isVirtualAll ? {
                  background: 'linear-gradient(135deg, var(--accent-subtle) 0%, var(--bg-panel) 100%)',
                  borderColor: 'var(--accent)',
                  borderStyle: 'dashed',
                } : {}),
              }}
              onClick={() => setSelectedProjectId(project.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.background = isVirtualAll 
                  ? 'linear-gradient(135deg, var(--accent-subtle) 0%, var(--bg-hover) 100%)'
                  : 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isVirtualAll ? 'var(--accent)' : 'var(--border)';
                e.currentTarget.style.background = isVirtualAll 
                  ? 'linear-gradient(135deg, var(--accent-subtle) 0%, var(--bg-panel) 100%)'
                  : 'var(--bg-panel)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div>
                  <div style={{ 
                    fontWeight: 600, 
                    fontSize: 'var(--text-base)', 
                    color: isVirtualAll ? 'var(--accent)' : 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    {isVirtualAll && <span style={{ fontSize: '14px' }}>📊</span>}
                    {project.name}
                    {isVirtualAll && (
                      <span style={{ 
                        fontSize: 'var(--text-xs)', 
                        background: 'var(--accent)', 
                        color: 'var(--accent-text)',
                        padding: '1px 6px',
                        borderRadius: 8,
                        fontWeight: 500,
                      }}>
                        Aggregate
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: '2px' }}>{project.description}</div>
                  )}
                </div>
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                <span>{cols.length} collections</span>
                <span>•</span>
                <span>{its.length} bookmarks</span>
              </div>
            </Panel>
          );
        };

        if (!activeProject) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 28 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  Choose a project to view its collections and bookmarks.
                </div>
                <button
                  onClick={handleCreateProject}
                  style={{
                    padding: '3px 10px',
                    height: 24,
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: 'var(--text-xs)',
                    background: 'var(--accent)',
                    color: 'var(--accent-text)',
                    border: 'none',
                    borderRadius: 4,
                  }}
                >
                  + New Project
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '8px',
                }}
              >
                {projects.length === 0 && (
                  <Panel style={{ borderStyle: 'dashed', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No projects yet. Create one to get started.
                  </Panel>
                )}
                {allProjectsWithVirtual.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </div>
          );
        }

        // New Project Dashboard (Phase 1)
        return (
          <ProjectDashboard
            project={activeProject}
            collections={collections}
            items={items}
            projects={projects}
            onBack={() => setSelectedProjectId(null)}
            onUpdateItem={forwardTabUpdateItem}
            onDeleteItem={
              onDeleteBookmark
                ? async (id, collectionId) => {
                    await onDeleteBookmark(id, collectionId);
                  }
                : undefined
            }
            onRefresh={onRefresh}
          />
        );
      case 'bookmarks':
        if (showImportStudio) {
          return (
            <ImportStudioView
              projects={projects}
              collections={collections}
              onBack={() => setShowImportStudio(false)}
              onImported={onRefresh}
            />
          );
        }

        // Get item count for a project
        const getProjectItemCount = (projectId: string) => {
          const projectCollectionIds = new Set(
            collections
              .filter(c => c.primaryProjectId === projectId || 
                          (Array.isArray(c.projectIds) && c.projectIds.includes(projectId)))
              .map(c => c.id)
          );
          return bookmarkItems.filter(item => 
            (item.collectionIds || []).some(cid => projectCollectionIds.has(cid))
          ).length;
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28, flexShrink: 0, marginBottom: '-4px' }}>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                Bookmarks
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setShowImportStudio(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 10px',
                    height: 24,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}
                  title="Open import studio"
                >
                  Import
                </button>
                <EnrichmentPanel
                  preselectedIds={filteredBookmarkItems.map((i) => i.id)}
                  onComplete={onRefresh}
                />
                <button
                  onClick={() => setShowAddBookmark(true)}
                  disabled={!onCreateItem}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 10px',
                    height: 24,
                    background: 'var(--accent)',
                    color: 'var(--accent-text, #fff)',
                    border: 'none',
                    borderRadius: 4,
                    cursor: onCreateItem ? 'pointer' : 'not-allowed',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}
                  title="Add bookmark"
                >
                  <Plus size={12} /> Add bookmark
                </button>
                {/* View mode toggle */}
                <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px' }}>
                  <button
                    onClick={() => setBookmarkViewMode('list')}
                    style={{
                      padding: '2px 6px',
                      height: 20,
                      background: bookmarkViewMode === 'list' ? 'var(--accent-weak)' : 'transparent',
                      color: bookmarkViewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                    title="List view"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => setBookmarkViewMode('grid')}
                    style={{
                      padding: '2px 6px',
                      height: 20,
                      background: bookmarkViewMode === 'grid' ? 'var(--accent-weak)' : 'transparent',
                      color: bookmarkViewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                    title="Grid view"
                  >
                    <Grid size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div style={{ flexShrink: 0 }}>
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Filter in list..."
              />
              {renderScopeChipsBar(filteredBookmarkItems.length)}
            </div>

            <Panel
              style={{
                flexShrink: 0,
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  value={bookmarkAiPrompt}
                  onChange={(e) => setBookmarkAiPrompt(e.target.value)}
                  placeholder="Ask AI from current bookmark scope..."
                  style={{
                    flex: 1,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    background: 'var(--input-bg, var(--bg))',
                    color: 'var(--text)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
                <button
                  type="button"
                  onClick={runBookmarkAIAssist}
                  disabled={bookmarkAiRunning}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--accent)',
                    background: bookmarkAiRunning ? 'var(--accent-weak)' : 'var(--accent)',
                    color: 'var(--accent-text, #fff)',
                    cursor: bookmarkAiRunning ? 'progress' : 'pointer',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}
                >
                  {bookmarkAiRunning ? 'Asking…' : 'Ask AI'}
                </button>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Uses up to 20 bookmarks from current filters and asks the model to cite sources like [B1].
              </div>
              {bookmarkAiError ? (
                <div style={{ fontSize: 'var(--text-xs)', color: '#dc2626' }}>{bookmarkAiError}</div>
              ) : null}
              {bookmarkAiResult ? (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px',
                    background: 'var(--bg-glass)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.45,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div>{bookmarkAiResult}</div>
                  {bookmarkAiSources.length > 0 ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Sources used: {bookmarkAiSources.map((source) => `[${source.ref}] ${source.title}`).join(' · ')}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Panel>

            {/* Main area: project nav + items */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${bookmarkListWidth}px 4px 1fr 4px ${bookmarkDetailWidth}px`,
                gap: '4px',
                flex: 1,
                minHeight: 0,
              }}
            >
              {/* Left: Project navigation */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                }}>
                  Projects
                </div>
                <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                  {/* "All" option */}
                  <div
                    onClick={() => setSelectedBookmarkProjectId('all')}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: selectedBookmarkProjectId === 'all' ? 'var(--accent-weak)' : 'transparent',
                      borderLeft: selectedBookmarkProjectId === 'all' ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: '2px',
                      fontSize: 'var(--text-sm)',
                      color: selectedBookmarkProjectId === 'all' ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: selectedBookmarkProjectId === 'all' ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedBookmarkProjectId !== 'all') {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedBookmarkProjectId !== 'all') {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📊</span>
                      <span>All</span>
                      <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                        {bookmarkItems.length}
                      </span>
                    </div>
                  </div>
                  
                  {/* Project list */}
                  {projects.map((project) => {
                    const projectItemCount = getProjectItemCount(project.id);
                    
                    return (
                      <div
                        key={project.id}
                        onClick={() => setSelectedBookmarkProjectId(project.id)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: selectedBookmarkProjectId === project.id ? 'var(--accent-weak)' : 'transparent',
                          borderLeft: selectedBookmarkProjectId === project.id ? '2px solid var(--accent)' : '2px solid transparent',
                          marginBottom: '2px',
                          fontSize: 'var(--text-sm)',
                          color: selectedBookmarkProjectId === project.id ? 'var(--text)' : 'var(--text-muted)',
                          fontWeight: selectedBookmarkProjectId === project.id ? 500 : 400,
                        }}
                        onMouseEnter={(e) => {
                          if (selectedBookmarkProjectId !== project.id) {
                            e.currentTarget.style.background = 'var(--bg-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedBookmarkProjectId !== project.id) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📁</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {project.name}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                            {projectItemCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  patchLayout({ bookmarkListWidth: bookmarkListWidth + delta });
                }}
              />

              {/* Right: Items grid */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                  {filteredBookmarkItems.length === 0 ? (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: '100%',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-sm)'
                    }}>
                      {searchQuery.trim() ? 'No bookmarks found' : 'No bookmarks'}
                    </div>
                  ) : bookmarkViewMode === 'list' ? (
                    // List view
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {filteredBookmarkItems.map((item) => {
                        const collection = getItemCollection(item);
                        const project = collection ? getCollectionProject(collection) : null;
                        const isSelected = viewingItem?.id === item.id;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setViewingItem(item);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setBookmarkContextMenu({ item, x: e.clientX, y: e.clientY });
                            }}
                            style={{
                              padding: '8px 12px',
                              background: isSelected ? 'var(--accent-weak)' : 'var(--bg-glass)',
                              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              overflow: 'hidden',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.borderColor = 'var(--accent)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-glass)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                              }
                            }}
                          >
                            {/* Title and URL */}
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ 
                                fontWeight: 600, 
                                fontSize: 'var(--text-sm)', 
                                color: 'var(--text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginBottom: '2px',
                              }}>
                                {item.title || 'Untitled'}
                              </div>
                              {item.url && (
                                <div style={{ 
                                  fontSize: 'var(--text-xs)', 
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {item.url}
                                </div>
                              )}
                            </div>
                            
                            {/* Collection and Project tags */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '6px', 
                              flexWrap: 'nowrap',
                              flexShrink: 0,
                              alignItems: 'center',
                            }}>
                              <ListPipelineBadge badge={bookmarkBadgeMap.get(item.id)} />
                              {collection && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {collection.name}
                                </span>
                              )}
                              {project && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {project.name}
                                </span>
                              )}
                              {/* Open URL icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.url) {
                                    openInNewTab(item.url);
                                  }
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  transition: 'all 0.1s ease',
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                title="Open URL in new tab"
                              >
                                <ExternalLink size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Grid view
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '12px',
                    }}>
                      {filteredBookmarkItems.map((item) => {
                        const collection = getItemCollection(item);
                        const project = collection ? getCollectionProject(collection) : null;
                        const isSelected = viewingItem?.id === item.id;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setViewingItem(item);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setBookmarkContextMenu({ item, x: e.clientX, y: e.clientY });
                            }}
                            style={{
                              padding: '12px',
                              background: isSelected ? 'var(--accent-weak)' : 'var(--bg-glass)',
                              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                              borderRadius: 8,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              overflow: 'hidden',
                              minHeight: 0,
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.borderColor = 'var(--accent)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-glass)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                              }
                            }}
                          >
                            {/* Title */}
                            <div style={{ 
                              fontWeight: 600, 
                              fontSize: 'var(--text-base)', 
                              color: 'var(--text)',
                              lineHeight: 1.3,
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}>
                              {item.title || 'Untitled'}
                            </div>
                            
                            {/* URL */}
                            {item.url && (
                              <div style={{ 
                                fontSize: 'var(--text-xs)', 
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                wordBreak: 'break-all',
                              }}>
                                {item.url}
                              </div>
                            )}
                            
                            {/* Notes preview */}
                            {item.notes && (
                              <div style={{ 
                                fontSize: 'var(--text-xs)', 
                                color: 'var(--text-muted)',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                lineHeight: 1.4,
                                wordBreak: 'break-word',
                              }}>
                                {item.notes}
                              </div>
                            )}
                            
                            {/* Collection and Project tags */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '6px', 
                              flexWrap: 'wrap',
                              marginTop: 'auto',
                              paddingTop: '8px',
                              borderTop: '1px solid var(--border)',
                              overflow: 'hidden',
                              alignItems: 'center',
                            }}>
                              <ListPipelineBadge badge={bookmarkBadgeMap.get(item.id)} />
                              {collection && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                }}>
                                  {collection.name}
                                </span>
                              )}
                              {project && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                }}>
                                  {project.name}
                                </span>
                              )}
                              {/* Open URL icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.url) {
                                    openInNewTab(item.url);
                                  }
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  transition: 'all 0.1s ease',
                                  marginLeft: 'auto',
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                title="Open URL in new tab"
                              >
                                <ExternalLink size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Panel>

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  patchLayout({ bookmarkDetailWidth: bookmarkDetailWidth - delta });
                }}
              />

              {/* Right: Bookmark detail panel */}
              <Panel
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  padding: 0,
                  overflow: 'hidden',
                }}
              >
                {viewingItem ? (
                  <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                          {viewingItem.title || 'Untitled'}
                        </h2>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {onUpdateBookmark && (
                            <button
                              onClick={() => {
                                setEditingItem(viewingItem);
                                setEditTitle(viewingItem.title || '');
                                setEditNotes(viewingItem.notes || '');
                                setEditCollectionId(viewingItem.collectionIds?.[0]);
                                setViewingItem(null);
                              }}
                              style={{
                                padding: '4px 8px',
                                fontSize: 'var(--text-xs)',
                                background: 'var(--bg-glass)',
                                border: '1px solid var(--border)',
                                borderRadius: 4,
                                color: 'var(--text)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Pencil size={12} />
                              Edit
                            </button>
                          )}
                          {onDeleteBookmark && (
                            <button
                              onClick={() => openBookmarkDeleteDialog(viewingItem)}
                              style={{
                                padding: '4px 8px',
                                fontSize: 'var(--text-xs)',
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: 4,
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {viewingItem.url && (
                        <ExtensionPageUrlLink
                          url={viewingItem.url}
                          style={{
                            color: 'var(--accent)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: 'var(--text-xs)',
                            wordBreak: 'break-all',
                            marginBottom: '10px',
                          }}
                        >
                          <ExternalLink size={13} />
                          {viewingItem.url}
                        </ExtensionPageUrlLink>
                      )}

                      {/* Saved In info */}
                      {(() => {
                        const itemCollections = collections.filter((c) => (viewingItem.collectionIds || []).includes(c.id));
                        if (itemCollections.length === 0) return null;
                        
                        return (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {itemCollections.map((c) => {
                              const project = projects.find(p => p.id === c.primaryProjectId);
                              return (
                                <span
                                  key={c.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    padding: '2px 6px',
                                    background: 'var(--bg-glass)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 3,
                                  }}
                                >
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color || 'var(--accent)' }} />
                                  {project?.name || '?'} / {c.name}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                      
                      {/* Notes - with collection tabs */}
                      {(() => {
                        const itemCollections = collections.filter((c) => (viewingItem.collectionIds || []).includes(c.id));
                        const placements = viewingItem.placements || {};
                        const hasMultipleCollections = itemCollections.length > 1;
                        
                        const placementData = itemCollections.map((c) => {
                          const project = projects.find(p => p.id === c.primaryProjectId);
                          return { collection: c, project };
                        });
                        
                        const effectiveSelectedId = selectedPlacementId || placementData[0]?.collection.id;
                        const selectedPlacement = placements[effectiveSelectedId];
                        const displayNotes = selectedPlacement?.notes || viewingItem.notes;
                        
                        return (
                          <>
                            {/* Tab bar - only show if multiple collections */}
                            {hasMultipleCollections && (
                              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: 0, overflowX: 'auto', marginBottom: 0 }}>
                                {placementData.map(({ collection: c, project }) => {
                                  const isSelected = c.id === effectiveSelectedId;
                                  return (
                                    <button
                                      key={c.id}
                                      onClick={() => setSelectedPlacementId(c.id)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 3,
                                        padding: '4px 8px',
                                        background: isSelected ? 'var(--bg-glass)' : 'transparent',
                                        border: 'none',
                                        borderBottom: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                                        marginBottom: -1,
                                        fontSize: 'var(--text-xs)',
                                        color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color || 'var(--accent)' }} />
                                      <span>{project?.name || '?'} / {c.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            
                            {/* Notes panel */}
                            <div
                              style={{
                                padding: '8px',
                                background: 'var(--bg-glass)',
                                borderRadius: hasMultipleCollections ? '0 0 4px 4px' : 4,
                                fontSize: 'var(--text-sm)',
                                lineHeight: 1.55,
                                whiteSpace: 'pre-wrap',
                                minHeight: 40,
                                color: displayNotes ? 'var(--text)' : 'var(--text-muted)',
                              }}
                            >
                              {displayNotes || 'No notes'}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    Select a bookmark to view details
                  </div>
                )}
              </Panel>
            </div>
            
            {/* Context menu */}
            {bookmarkContextMenu && (
              <ItemContextMenu
                item={bookmarkContextMenu.item}
                x={bookmarkContextMenu.x}
                y={bookmarkContextMenu.y}
                onClose={() => setBookmarkContextMenu(null)}
                onEdit={handleEditItem}
                onDelete={(item) => {
                  openBookmarkDeleteDialog(item);
                  setBookmarkContextMenu(null);
                }}
                onOpenInNewTab={(item) => {
                  if (item.url) {
                    openInNewTab(item.url);
                  }
                  setBookmarkContextMenu(null);
                }}
              />
            )}
          </div>
        );
      case 'notes':
        // Get item count for a project (for notes)
        const getNotesProjectItemCount = (projectId: string) => {
          const projectCollectionIds = new Set(
            collections
              .filter(c => c.primaryProjectId === projectId || 
                          (Array.isArray(c.projectIds) && c.projectIds.includes(projectId)))
              .map(c => c.id)
          );
          return notesItems.filter(item => 
            (item.collectionIds || []).some(cid => projectCollectionIds.has(cid))
          ).length;
        };


        const handleNoteSave = async () => {
          if (!selectedNote || !onUpdateBookmark) return;
          await onUpdateBookmark(selectedNote.id, { notes: editNoteContent.trim() || undefined });
          setIsEditingNote(false);
        };

        const handleNoteCancel = () => {
          setIsEditingNote(false);
          if (selectedNote) {
            setEditNoteContent(selectedNote.notes || '');
          }
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28, flexShrink: 0, marginBottom: '-4px' }}>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                Notes
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setShowAddNote(true)}
                  disabled={!onCreateItem}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 10px',
                    height: 24,
                    background: 'var(--accent)',
                    color: 'var(--accent-text, #fff)',
                    border: 'none',
                    borderRadius: 4,
                    cursor: onCreateItem ? 'pointer' : 'not-allowed',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}
                  title="New note"
                >
                  <Plus size={12} /> New note
                </button>
                {/* View mode toggle */}
                <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px' }}>
                  <button
                    onClick={() => setNotesViewMode('list')}
                    style={{
                      padding: '2px 6px',
                      height: 20,
                      background: notesViewMode === 'list' ? 'var(--accent-weak)' : 'transparent',
                      color: notesViewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                    title="List view"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => setNotesViewMode('grid')}
                    style={{
                      padding: '2px 6px',
                      height: 20,
                      background: notesViewMode === 'grid' ? 'var(--accent-weak)' : 'transparent',
                      color: notesViewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                    title="Grid view"
                  >
                    <Grid size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div style={{ flexShrink: 0 }}>
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Filter in list..."
              />
            </div>

            {/* Main area: project nav + items + detail */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${notesListWidth}px 4px 1fr 4px ${notesDetailWidth}px`,
                gap: '4px',
                flex: 1,
                minHeight: 0,
              }}
            >
              {/* Left: Project navigation */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                }}>
                  Projects
                </div>
                <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                  {/* "All" option */}
                  <div
                    onClick={() => setSelectedNotesProjectId('all')}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: selectedNotesProjectId === 'all' ? 'var(--accent-weak)' : 'transparent',
                      borderLeft: selectedNotesProjectId === 'all' ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: '2px',
                      fontSize: 'var(--text-sm)',
                      color: selectedNotesProjectId === 'all' ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: selectedNotesProjectId === 'all' ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedNotesProjectId !== 'all') {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedNotesProjectId !== 'all') {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📊</span>
                      <span>All</span>
                      <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                        {notesItems.length}
                      </span>
                    </div>
                  </div>
                  
                  {/* Project list */}
                  {projects.map((project) => {
                    const projectNotesCount = getNotesProjectItemCount(project.id);
                    
                    return (
                      <div
                        key={project.id}
                        onClick={() => setSelectedNotesProjectId(project.id)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: selectedNotesProjectId === project.id ? 'var(--accent-weak)' : 'transparent',
                          borderLeft: selectedNotesProjectId === project.id ? '2px solid var(--accent)' : '2px solid transparent',
                          marginBottom: '2px',
                          fontSize: 'var(--text-sm)',
                          color: selectedNotesProjectId === project.id ? 'var(--text)' : 'var(--text-muted)',
                          fontWeight: selectedNotesProjectId === project.id ? 500 : 400,
                        }}
                        onMouseEnter={(e) => {
                          if (selectedNotesProjectId !== project.id) {
                            e.currentTarget.style.background = 'var(--bg-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedNotesProjectId !== project.id) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📁</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {project.name}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                            {projectNotesCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  patchLayout({ notesListWidth: notesListWidth + delta });
                }}
              />

              {/* Middle: Notes grid/list */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                  {filteredNotesItems.length === 0 ? (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: '100%',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-sm)'
                    }}>
                      {searchQuery.trim() ? 'No notes found' : 'No notes'}
                    </div>
                  ) : notesViewMode === 'list' ? (
                    // List view
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {filteredNotesItems.map((item) => {
                        const collection = getItemCollection(item);
                        const project = collection ? getCollectionProject(collection) : null;
                        const isSelected = item.id === selectedNoteId;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedNoteId(item.id);
                              setIsEditingNote(false);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setNotesContextMenu({ item, x: e.clientX, y: e.clientY });
                            }}
                            style={{
                              padding: '8px 12px',
                              background: isSelected ? 'var(--accent-weak)' : 'var(--bg-glass)',
                              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              overflow: 'hidden',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.borderColor = 'var(--accent)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-glass)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                              }
                            }}
                          >
                            {/* Title and preview */}
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ 
                                fontWeight: 600, 
                                fontSize: 'var(--text-sm)', 
                                color: 'var(--text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginBottom: '2px',
                              }}>
                                {item.title || 'Untitled'}
                              </div>
                              {item.notes && (
                                <div style={{ 
                                  fontSize: 'var(--text-xs)', 
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {item.notes.substring(0, 80)}...
                                </div>
                              )}
                            </div>
                            
                            {/* Collection and Project tags */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '6px', 
                              flexWrap: 'nowrap',
                              flexShrink: 0,
                              alignItems: 'center',
                            }}>
                              {collection && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {collection.name}
                                </span>
                              )}
                              {project && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {project.name}
                                </span>
                              )}
                              {/* Open icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedNoteId(item.id);
                                  setIsEditingNote(false);
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  transition: 'all 0.1s ease',
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                title="Open detail"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Grid view
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '12px',
                    }}>
                      {filteredNotesItems.map((item) => {
                        const collection = getItemCollection(item);
                        const project = collection ? getCollectionProject(collection) : null;
                        const isSelected = item.id === selectedNoteId;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedNoteId(item.id);
                              setIsEditingNote(false);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setNotesContextMenu({ item, x: e.clientX, y: e.clientY });
                            }}
                            style={{
                              padding: '12px',
                              background: isSelected ? 'var(--accent-weak)' : 'var(--bg-glass)',
                              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                              borderRadius: 8,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              overflow: 'hidden',
                              minHeight: 0,
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.borderColor = 'var(--accent)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-glass)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                              }
                            }}
                          >
                            {/* Title */}
                            <div style={{ 
                              fontWeight: 600, 
                              fontSize: 'var(--text-base)', 
                              color: 'var(--text)',
                              lineHeight: 1.3,
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}>
                              {item.title || 'Untitled'}
                            </div>
                            
                            {/* Notes preview */}
                            {item.notes && (
                              <div style={{ 
                                fontSize: 'var(--text-xs)', 
                                color: 'var(--text-muted)',
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                lineHeight: 1.4,
                                wordBreak: 'break-word',
                              }}>
                                {item.notes}
                              </div>
                            )}
                            
                            {/* Collection and Project tags */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '6px', 
                              flexWrap: 'wrap',
                              marginTop: 'auto',
                              paddingTop: '8px',
                              borderTop: '1px solid var(--border)',
                              overflow: 'hidden',
                              alignItems: 'center',
                            }}>
                              {collection && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                }}>
                                  {collection.name}
                                </span>
                              )}
                              {project && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                }}>
                                  {project.name}
                                </span>
                              )}
                              {/* Open icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedNoteId(item.id);
                                  setIsEditingNote(false);
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  transition: 'all 0.1s ease',
                                  marginLeft: 'auto',
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                title="Open detail"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Panel>

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  patchLayout({ notesDetailWidth: notesDetailWidth - delta });
                }}
              />

              {/* Right: Note detail panel */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                {selectedNote ? (
                  <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                  {/* Header */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                        {selectedNote.title || 'Untitled'}
                      </h2>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {!isEditingNote && onUpdateBookmark && (
                          <button
                            onClick={() => setIsEditingNote(true)}
                            style={{
                              padding: '4px 8px',
                              fontSize: 'var(--text-xs)',
                              background: 'var(--bg-glass)',
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              color: 'var(--text)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        )}
                        {onDeleteBookmark && (
                          <button
                            onClick={() => selectedNote && openBookmarkDeleteDialog(selectedNote)}
                            style={{
                              padding: '4px 8px',
                              fontSize: 'var(--text-xs)',
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Context */}
                    {(() => {
                      const itemCollection = getItemCollection(selectedNote);
                      const itemProject = itemCollection ? getCollectionProject(itemCollection) : null;
                      
                      return (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          {itemCollection && (
                            <span>📂 {itemCollection.name}</span>
                          )}
                          {itemProject && (
                            <>
                              <span>•</span>
                              <span>📁 {itemProject.name}</span>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Metadata */}
                    <div style={{ display: 'flex', gap: '12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        <span>Updated: {formatDateTime(selectedNote.updated_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes content */}
                  {isEditingNote ? (
                    <div>
                      <textarea
                        value={editNoteContent}
                        onChange={(e) => setEditNoteContent(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '300px',
                          padding: '12px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          color: 'var(--text)',
                          fontSize: 'var(--text-sm)',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          lineHeight: 1.6,
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button
                          onClick={handleNoteCancel}
                          style={{
                            padding: '6px 12px',
                            fontSize: 'var(--text-xs)',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            color: 'var(--text)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleNoteSave}
                          style={{
                            padding: '6px 12px',
                            fontSize: 'var(--text-xs)',
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: 4,
                            color: 'var(--accent-text)',
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
                      {selectedNote.notes || 'No content'}
                    </div>
                  )}
                </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    Select a note to view
                  </div>
                )}
              </Panel>
            </div>
            
            {/* Context menu */}
            {notesContextMenu && (
              <ItemContextMenu
                item={notesContextMenu.item}
                x={notesContextMenu.x}
                y={notesContextMenu.y}
                onClose={() => setNotesContextMenu(null)}
                onEdit={onUpdateBookmark ? (itemToEdit) => {
                  setSelectedNoteId(itemToEdit.id);
                  setIsEditingNote(true);
                  setEditNoteContent(itemToEdit.notes || '');
                  setNotesContextMenu(null);
                } : undefined}
                onDelete={onDeleteBookmark ? (itemToDelete) => {
                  openBookmarkDeleteDialog(itemToDelete);
                  setNotesContextMenu(null);
                } : undefined}
                onOpenInNewTab={(itemToOpen) => {
                  if (itemToOpen.url) openInNewTab(itemToOpen.url);
                  setNotesContextMenu(null);
                }}
              />
            )}
          </div>
        );
      case 'workspaces':
        return <WorkspacesView projects={projects} workspaces={workspaces} />;
      case 'collections':
        return (
          <CollectionsView
            collections={collections}
            projects={projects}
            items={items}
            onItemClick={undefined}
            onUpdateItem={forwardTabUpdateItem}
            onDeleteItem={(item, fromCollectionId) => {
              openBookmarkDeleteDialog(item, fromCollectionId);
            }}
            onNewCollection={onCreateCollection ? () => setShowNewCollection(true) : undefined}
          />
        );
      default:
        return <div>Select a view</div>;
    }
  };

  // LIST MODE: Simplified list view for split layout
  if (listMode && (activeView === 'bookmarks' || activeView === 'notes' || activeView === 'workspaces')) {
    const listItems = activeView === 'bookmarks' 
      ? filteredBookmarkItems 
      : activeView === 'notes' 
        ? filteredNotesItems 
        : [];
    
    // For workspaces, render a different list
    if (activeView === 'workspaces') {
      
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                Workspaces
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                {filteredWorkspaces.length}
              </span>
            </div>
            <SearchBar 
              value={searchQuery} 
              onChange={setSearchQuery} 
              placeholder="Filter in list..."
            />
            {renderScopeChipsBar(filteredWorkspaces.length)}
          </div>

          {/* Workspace list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }} className="scrollbar">
            {filteredWorkspaces.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
                No workspaces found
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filteredWorkspaces.map((ws) => {
                  const tabCount = ws.windows.reduce((sum, w) => sum + w.tabs.length, 0);
                  return (
                    <button
                      key={ws.id}
                      onClick={() => onOpenWorkspace?.(ws)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span style={{ 
                        fontSize: 'var(--text-sm)', 
                        fontWeight: 500, 
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {ws.name}
                      </span>
                      <span style={{ 
                        fontSize: 'var(--text-xs)', 
                        color: 'var(--text-faint)',
                      }}>
                        {tabCount} tab{tabCount !== 1 ? 's' : ''} · {ws.windows.length} window{ws.windows.length !== 1 ? 's' : ''}
                        {!ws.projectId && <span style={{ marginLeft: 6, color: 'var(--warning, #f59e0b)' }}>detached</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }
    
    // Generate tab title based on scope
    const getListTabTitle = () => {
      if (scopeCollectionId !== 'all') {
        const collection = collections.find(c => c.id === scopeCollectionId);
        const project = collection ? projects.find((p) => p.id === collection.primaryProjectId) : null;
        return `${project?.name || 'Unassigned'} / ${collection?.name || 'Collection'}`;
      }
      if (scopeProjectId !== 'all') {
        const project = projects.find(p => p.id === scopeProjectId);
        return `${project?.name || 'Project'} / All`;
      }
      return 'All / All';
    };
    
    const handleOpenAsTab = () => {
      if (!onOpenListTab || listItems.length === 0) return;
      const type = activeView === 'bookmarks' ? 'bookmark-list' : 'note-list';
      const title = `${getListTabTitle()} — ${activeView === 'bookmarks' ? 'Bookmarks' : 'Notes'}`;
      onOpenListTab(type, listItems.map(i => i.id), title);
    };

    const handleAddToCommonTab = () => {
      if (!onAddToCommonListTab || listItems.length === 0) return;
      const type = activeView === 'bookmarks' ? 'bookmark-list' : 'note-list';
      const sectionTitle = `${getListTabTitle()} — ${activeView === 'bookmarks' ? 'Bookmarks' : 'Notes'}`;
      onAddToCommonListTab(type, listItems.map((i) => i.id), sectionTitle);
    };
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header with search and actions */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                {activeView === 'bookmarks' ? 'Bookmarks' : 'Notes'}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                {listItems.length}
              </span>
            </div>
            {listItems.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleOpenAsTab}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                  }}
                  title="Open this scope as its own tab"
                >
                  Open as tab
                </button>
                <button
                  onClick={handleAddToCommonTab}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                  }}
                  title="Add this scope into common tab"
                >
                  Add to common
                </button>
              </div>
            )}
          </div>
          <SearchBar 
            value={searchQuery} 
            onChange={setSearchQuery} 
            placeholder="Filter in list..."
          />
          {renderScopeChipsBar(listItems.length)}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={() => activeView === 'bookmarks' ? setShowAddBookmark(true) : setShowAddNote(true)}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Plus size={14} />
              Add
            </button>
            {activeView === 'bookmarks' && (
              <button
                onClick={() => setShowImportStudio(true)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                Import
              </button>
            )}
          </div>
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }} className="scrollbar">
          {listItems.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
              No {activeView} found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {listItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onOpenItem?.(item)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ 
                    fontSize: 'var(--text-sm)', 
                    fontWeight: 500, 
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    {activeView === 'bookmarks' && (
                      <ListPipelineBadge badge={bookmarkBadgeMap.get(item.id)} />
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title || 'Untitled'}
                    </span>
                  </span>
                  {item.url && (
                    <span style={{ 
                      fontSize: 'var(--text-xs)', 
                      color: 'var(--text-faint)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.url}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>


        {/* Modals for list mode */}
        <NewItemModal
          open={showAddBookmark}
          onClose={() => setShowAddBookmark(false)}
          kind="bookmark"
          projects={projects}
          collections={collections}
          defaultProjectId={scopeProjectId !== 'all' ? scopeProjectId : undefined}
          onCreateProject={onCreateProject}
          onCreateCollection={onCreateCollection}
          onCreate={async (data) => {
            if (onCreateItem) await onCreateItem(data);
          }}
        />
        <NewItemModal
          open={showAddNote}
          onClose={() => setShowAddNote(false)}
          kind="note"
          projects={projects}
          collections={collections}
          defaultProjectId={scopeProjectId !== 'all' ? scopeProjectId : undefined}
          onCreateProject={onCreateProject}
          onCreateCollection={onCreateCollection}
          onCreate={async (data) => {
            if (onCreateItem) await onCreateItem(data);
          }}
        />
        {showImportStudio && (
          <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 100 }}>
            <ImportStudioView
              projects={projects}
              collections={collections}
              onBack={() => setShowImportStudio(false)}
              onImported={onRefresh}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ 
      height: '100%', 
      width: '100%', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      {/* Wrapper header is only shown for views that don't render their own header. */}
      {!(activeView === 'projects' && selectedProjectId !== null) &&
        !['bookmarks', 'notes', 'collections', 'tab-commander', 'settings', 'trash', 'ai-categories', 'import-studio', 'pipeline', 'help'].includes(
          activeView
        ) && (
          <div style={{ 
            marginBottom: '8px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            flexShrink: 0,
            height: 28,
          }}>
            <h1 style={{ 
              fontSize: 'var(--text-lg)', 
              fontWeight: 600, 
              color: 'var(--text)',
              margin: 0,
              textTransform: 'capitalize',
            }}>
              {activeView}
            </h1>
            <div />
          </div>
      )}
      
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: activeView === 'home' ? 'hidden' : 'auto',
          display: activeView === 'home' ? 'flex' : 'block',
          flexDirection: 'column',
        }}
      >
        {renderContent()}
      </div>

      {/* Top-level create modals (Projects / Collections / Bookmarks / Notes) */}
      <NewProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreate={async (data) => {
          if (onCreateProject) await onCreateProject(data);
        }}
      />
      <NewCollectionModal
        open={showNewCollection}
        onClose={() => setShowNewCollection(false)}
        projects={projects}
        onCreate={async (data) => {
          if (onCreateCollection) await onCreateCollection(data);
        }}
      />
      <NewItemModal
        open={showAddBookmark}
        onClose={() => setShowAddBookmark(false)}
        kind="bookmark"
        projects={projects}
        collections={collections}
        defaultProjectId={
          selectedBookmarkProjectId !== 'all' ? selectedBookmarkProjectId : undefined
        }
        onCreateProject={onCreateProject}
        onCreateCollection={onCreateCollection}
        onCreate={async (data) => {
          if (onCreateItem) await onCreateItem(data);
        }}
      />
      <NewItemModal
        open={showAddNote}
        onClose={() => setShowAddNote(false)}
        kind="note"
        projects={projects}
        collections={collections}
        defaultProjectId={
          selectedNotesProjectId !== 'all' ? selectedNotesProjectId : undefined
        }
        onCreateProject={onCreateProject}
        onCreateCollection={onCreateCollection}
        onCreate={async (data) => {
          if (onCreateItem) await onCreateItem(data);
        }}
      />

      {bookmarkDeleteTarget && onDeleteBookmark && (
        <DeleteConfirmDialog
          item={bookmarkDeleteTarget}
          collectionId={getDeleteDialogCollectionContext(bookmarkDeleteTarget).id}
          collectionName={getDeleteDialogCollectionContext(bookmarkDeleteTarget).name}
          onResult={async (result) => {
            const target = bookmarkDeleteTarget;
            if (!target || !onDeleteBookmark) {
              setBookmarkDeleteTarget(null);
              setBookmarkDeleteExplicitCollectionId(undefined);
              return;
            }
            const ctx = getDeleteDialogCollectionContext(target);
            setBookmarkDeleteTarget(null);
            setBookmarkDeleteExplicitCollectionId(undefined);
            if (result.action === 'cancel') return;
            if (result.action === 'remove-from-collection' && ctx.id) {
              await onDeleteBookmark(target.id, ctx.id);
            } else if (result.action === 'delete-everywhere') {
              await onDeleteBookmark(target.id);
            }
            setViewingItem((v) => (v?.id === target.id ? null : v));
            setSelectedNoteId((n) => (n === target.id ? null : n));
            if (onRefresh) await onRefresh();
          }}
        />
      )}

      {/* Add bookmark modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1rem', width: '420px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>Add bookmark</div>
              <button onClick={() => setShowAddModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>URL</label>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Title (optional)</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title"
                  style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Collection</label>
                <select
                  value={newCollectionId || ''}
                  onChange={(e) => setNewCollectionId(e.target.value || undefined)}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem', background: 'white' }}
                >
                  <option value="">Unsorted</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSubmit}
                  style={{ padding: '0.5rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #111827', background: '#111827', color: 'white', cursor: 'pointer', fontWeight: 800 }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item detail view modal */}
      {viewingItem && !editingItem && activeView !== 'bookmarks' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}
        onClick={() => setViewingItem(null)}
        >
          <div 
            style={{ 
              background: 'var(--bg-panel)', 
              borderRadius: '0.75rem', 
              padding: '1.5rem', 
              width: '600px', 
              maxWidth: '90%', 
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-panel)', 
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
            onClick={(e) => e.stopPropagation()}
            className="scrollbar"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)' }}>
                {viewingItem.title || 'Untitled'}
              </h2>
              <button 
                onClick={() => setViewingItem(null)} 
                style={{ 
                  border: 'none', 
                  background: 'transparent', 
                  cursor: 'pointer', 
                  color: 'var(--text-muted)', 
                  fontSize: '1.5rem',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
            
            {/* URL */}
            {viewingItem.url && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  URL
                </div>
                <ExtensionPageUrlLink
                  url={viewingItem.url}
                  style={{
                    color: 'var(--accent)',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: 'var(--text-sm)',
                    wordBreak: 'break-all',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  <ExternalLink size={14} />
                  {viewingItem.url}
                </ExtensionPageUrlLink>
              </div>
            )}
            
            {/* Saved In - always show which collections */}
            {(() => {
              const itemCollections = collections.filter((c) => (viewingItem.collectionIds || []).includes(c.id));
              if (itemCollections.length === 0) return null;
              
              return (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Saved In
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {itemCollections.map((c) => {
                      const project = projects.find(p => p.id === c.primaryProjectId);
                      return (
                        <span
                          key={c.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            background: 'var(--bg-glass)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text)',
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color || 'var(--accent)' }} />
                          {project?.name || 'Unassigned'} / {c.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            
            {/* Notes - with collection tabs */}
            {(() => {
              const itemCollections = collections.filter((c) => (viewingItem.collectionIds || []).includes(c.id));
              const placements = viewingItem.placements || {};
              const hasMultipleCollections = itemCollections.length > 1;
              
              const placementData = itemCollections.map((c) => {
                const project = projects.find(p => p.id === c.primaryProjectId);
                const placement = placements[c.id];
                return { collection: c, project, placement };
              });
              
              const effectiveSelectedId = selectedPlacementId || placementData[0]?.collection.id;
              const selectedPlacement = placementData.find(p => p.collection.id === effectiveSelectedId);
              const displayNotes = selectedPlacement?.placement?.notes || viewingItem.notes;
              
              return (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Notes
                  </div>
                  
                  {/* Tab bar - only show if multiple collections */}
                  {hasMultipleCollections && (
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: 0, overflowX: 'auto' }}>
                      {placementData.map(({ collection: c, project }) => {
                        const isSelected = c.id === effectiveSelectedId;
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSelectedPlacementId(c.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.5rem 0.75rem',
                              background: isSelected ? 'var(--bg-glass)' : 'transparent',
                              border: 'none',
                              borderBottom: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                              marginBottom: -1,
                              fontSize: 'var(--text-xs)',
                              color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color || 'var(--accent)', flexShrink: 0 }} />
                            <span>{project?.name || 'Unassigned'} / {c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Notes content */}
                  <div style={{
                    padding: '0.75rem',
                    background: 'var(--bg-glass)',
                    borderRadius: hasMultipleCollections ? '0 0 0.5rem 0.5rem' : '0.5rem',
                    minHeight: 60,
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    color: displayNotes ? 'var(--text)' : 'var(--text-muted)',
                  }}>
                    {displayNotes || 'No notes'}
                  </div>
                </div>
              );
            })()}
            
            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setViewingItem(null)}
                style={{ 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '0.5rem', 
                  border: '1px solid var(--border)', 
                  background: 'var(--bg)', 
                  cursor: 'pointer', 
                  fontWeight: 500,
                  color: 'var(--text)',
                }}
              >
                Close
              </button>
              {onUpdateBookmark && (
                <button
                  onClick={() => {
                    setEditingItem(viewingItem);
                    setEditTitle(viewingItem.title || '');
                    setEditNotes(viewingItem.notes || '');
                    setEditCollectionId(viewingItem.collectionIds?.[0]);
                    setViewingItem(null);
                  }}
                  style={{ 
                    padding: '0.5rem 0.9rem', 
                    borderRadius: '0.5rem', 
                    border: '1px solid var(--accent)', 
                    background: 'var(--accent)', 
                    color: 'var(--accent-text)', 
                    cursor: 'pointer', 
                    fontWeight: 600,
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit bookmark modal */}
      {editingItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1rem', width: '440px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>Edit bookmark</div>
              <button onClick={closeEditModal} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Title</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem', resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Collection</label>
                <select
                  value={editCollectionId || ''}
                  onChange={(e) => setEditCollectionId(e.target.value || undefined)}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem', background: 'white' }}
                >
                  <option value="">Unsorted</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  onClick={closeEditModal}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  style={{ padding: '0.5rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #111827', background: '#111827', color: 'white', cursor: 'pointer', fontWeight: 800 }}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
