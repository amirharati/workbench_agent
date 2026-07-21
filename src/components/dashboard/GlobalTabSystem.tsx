import React, { useMemo, useRef, useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Search, FileText, X, Layout, Sidebar, PanelLeftClose, PanelLeft, Pin, Star, Globe2, Eye, EyeOff, List } from 'lucide-react';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import type { Item, Collection, Project, UpdateItemOptions } from '../../lib/db';
import { getItem } from '../../lib/db';
import { pinItem, unpinItem, favoriteItem, unfavoriteItem } from '../../lib/itemQuickAccess';
import { ProductSearchView } from './ProductSearchView';
import { FavoritesTab } from './FavoritesTab';
import { PinnedTab } from './PinnedTab';
import { QuickAccessTab } from './QuickAccessTab';
import { TrashTab } from './TrashTab';
import { RecentTab } from './RecentTab';
import { useLibrarySearch } from '../../hooks/useLibrarySearch';
import type { SearchFilters } from '../../lib/search';
import { useItemPipelineContext } from '../../hooks/useItemPipelineContext';
import { resolvePipelineBadge } from '../../lib/pipeline';
import { EnrichmentContent, ItemPipelineBadge, ENRICHMENT_EMPTY_MESSAGE } from './PipelineDisplayBlocks';
import { ItemDigestQuickActions } from './ItemDigestQuickActions';
import { ItemContextMenu } from './ItemContextMenu';
import { TabPaneFrame, TabScrollShell } from './TabScrollShell';
import { DeleteConfirmDialog, type DeleteConfirmResult } from '../DeleteConfirmDialog';
import { ItemOrganizationEditor } from './ItemOrganizationEditor';
import {
  isScopeNarrowed,
  itemMatchesScope,
} from '../../lib/shell/itemScope';

type LibrarySearchApi = ReturnType<typeof useLibrarySearch>;

// ===== Persistent state shape =====
interface GlobalTabScope {
  /** Temporary workspace origin. Missing means the tab was opened from All Library. */
  scopeProjectId?: string;
  /** Informational origin only; collection changes do not hide project tabs. */
  scopeCollectionId?: string;
  /** Project tabs can be made visible in every Home scope without changing item membership. */
  pinnedGlobally?: boolean;
}

export interface GlobalTabItem extends GlobalTabScope { kind: 'item'; id: string; itemId: string; }
export interface GlobalTabSearch {
  kind: 'search';
  id: string;
  query: string;
  filters?: SearchFilters;
  mode?: 'hybrid' | 'lexical-only';
  scopeProjectId?: string;
  scopeCollectionId?: string;
  pinnedGlobally?: boolean;
}
export interface GlobalTabUrl extends GlobalTabScope {
  kind: 'url';
  id: string;
  url: string;
  title?: string;
  favIconUrl?: string;
}
// Add list tabs to support legacy DashboardLayout tabs
export interface GlobalTabList extends GlobalTabScope { kind: 'list'; id: string; listType: 'bookmark-list' | 'note-list' | 'common-list' | 'workspace' | 'favorites' | 'pinned' | 'quick-access' | 'trash' | 'recent'; title: string; itemIds?: string[]; workspaceId?: string; }

const UTILITY_LIST_TYPES = new Set(['favorites', 'pinned', 'quick-access', 'trash', 'recent']);

export type PruneGlobalTabsContext = {
  itemIds: ReadonlySet<string>;
  workspaceIds: ReadonlySet<string>;
};

function pruneTabCollection(sourceTabs: readonly GlobalTab[], ctx: PruneGlobalTabsContext): GlobalTab[] {
  const tabs: GlobalTab[] = [];

  for (const tab of sourceTabs) {
    if (tab.kind === 'search' || tab.kind === 'url') {
      tabs.push(tab);
      continue;
    }
    if (tab.kind === 'item') {
      if (ctx.itemIds.has(tab.itemId)) tabs.push(tab);
      continue;
    }
    if (tab.kind === 'list') {
      if (UTILITY_LIST_TYPES.has(tab.listType)) {
        tabs.push(tab);
        continue;
      }
      if (tab.listType === 'workspace') {
        if (tab.workspaceId && ctx.workspaceIds.has(tab.workspaceId)) tabs.push(tab);
        continue;
      }
      if (tab.itemIds?.length) {
        const kept = tab.itemIds.filter((id) => ctx.itemIds.has(id));
        if (kept.length === 0) continue;
        if (kept.length === tab.itemIds.length) tabs.push(tab);
        else tabs.push({ ...tab, itemIds: kept });
        continue;
      }
      tabs.push(tab);
    }
  }

  return tabs;
}

/** Drop tabs that point at rows removed from SQLite (localStorage survives DB wipe). */
export function pruneGlobalTabs(
  state: GlobalTabState,
  ctx: PruneGlobalTabsContext
): GlobalTabState {
  const tabs = pruneTabCollection(state.tabs, ctx);
  const workspaceSessionSnapshots = Object.fromEntries(
    Object.entries(state.workspaceSessionSnapshots ?? {}).map(([key, snapshotTabs]) => [
      key,
      pruneTabCollection(snapshotTabs, ctx),
    ])
  );

  const activeTabId =
    state.activeTabId && tabs.some((t) => t.id === state.activeTabId)
      ? state.activeTabId
      : null;

  return { ...state, tabs, activeTabId, workspaceSessionSnapshots };
}

export type GlobalTab = GlobalTabItem | GlobalTabSearch | GlobalTabUrl | GlobalTabList;

/** A named Homebase working set. Its generic entries live in workspaceSessionSnapshots. */
export interface SavedWorkspaceSession {
  id: string;
  name: string;
  projectId: string;
  createdAt: number;
  updatedAt: number;
}

export function getGlobalTabProjectId(tab: GlobalTab): string | 'all' {
  return tab.scopeProjectId?.trim() || 'all';
}

export function isGlobalTabVisible(
  tab: GlobalTab,
  currentProjectId: string | 'all',
  showAllTabs = false
): boolean {
  if (showAllTabs || tab.pinnedGlobally) return true;
  return getGlobalTabProjectId(tab) === currentProjectId;
}

export interface GlobalTabState {
  tabs: GlobalTab[];
  activeTabId: string | null;
  bottomLayout: 'tabs' | 'sidebar';
  isSidebarCollapsed: boolean;
  homeSection?: 'overview' | 'search';
  showAllTabs?: boolean;
  topPct?: number;
  searchQuery?: string;
  /** Last focused tab for each project session. `all` is the global session. */
  lastActiveTabByProject?: Record<string, string>;
  /** Project-local preference to temporarily include global workspace entries. */
  includeGlobalWorkByProject?: Record<string, boolean>;
  /** Workspace currently active in each project. Values are stable session keys. */
  activeWorkspaceKeyByProject?: Record<string, string>;
  /** Auto-saved live tab sets for inactive project/saved workspaces. */
  workspaceSessionSnapshots?: Record<string, GlobalTab[]>;
  /** User-created Homebase workspaces; unlike browser workspaces these can contain every GlobalTab kind. */
  savedWorkspaceSessions?: SavedWorkspaceSession[];
}

export const GLOBAL_TAB_STATE_DEFAULT: GlobalTabState = {
  tabs: [],
  activeTabId: null,
  bottomLayout: 'tabs',
  isSidebarCollapsed: false,
  homeSection: 'overview',
  showAllTabs: false,
  topPct: 40,
  searchQuery: '',
  lastActiveTabByProject: {},
  includeGlobalWorkByProject: {},
  activeWorkspaceKeyByProject: {},
  workspaceSessionSnapshots: {},
  savedWorkspaceSessions: [],
};

const LS_KEY = 'workbench-global-tabs';

function normalizeGlobalTabs(tabs: unknown[]): GlobalTab[] {
  const valid = tabs.filter(
    (t): t is GlobalTab =>
      t != null && typeof t === 'object' && 'kind' in t && typeof (t as GlobalTab).kind === 'string'
  );
  return valid.map((tab) => {
    const scopeProjectId =
      typeof tab.scopeProjectId === 'string' && tab.scopeProjectId !== 'all'
        ? tab.scopeProjectId
        : undefined;
    const scopeCollectionId =
      scopeProjectId && typeof tab.scopeCollectionId === 'string' && tab.scopeCollectionId !== 'all'
        ? tab.scopeCollectionId
        : undefined;
    const normalizedScope = {
      scopeProjectId,
      scopeCollectionId,
      pinnedGlobally: tab.pinnedGlobally || undefined,
    };
    return tab.kind === 'search'
      ? {
          ...tab,
          ...normalizedScope,
          query: tab.query || '',
          filters: tab.filters ?? {},
          mode: tab.mode === 'lexical-only' ? 'lexical-only' : 'hybrid',
        }
      : { ...tab, ...normalizedScope };
  });
}

export function loadGlobalTabState(): GlobalTabState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return GLOBAL_TAB_STATE_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<GlobalTabState>;
    const tabs = normalizeGlobalTabs(Array.isArray(parsed.tabs) ? parsed.tabs : []);
    const workspaceSessionSnapshots = Object.fromEntries(
      Object.entries(parsed.workspaceSessionSnapshots ?? {})
        .filter(([, snapshotTabs]) => Array.isArray(snapshotTabs))
        .map(([key, snapshotTabs]) => [key, normalizeGlobalTabs(snapshotTabs as unknown[])])
    );
    const savedWorkspaceSessions = Array.isArray(parsed.savedWorkspaceSessions)
      ? parsed.savedWorkspaceSessions.filter(
          (session): session is SavedWorkspaceSession =>
            session != null &&
            typeof session === 'object' &&
            typeof session.id === 'string' &&
            typeof session.name === 'string' &&
            typeof session.projectId === 'string' &&
            typeof session.createdAt === 'number' &&
            typeof session.updatedAt === 'number'
        )
      : [];
    const activeTabId =
      parsed.activeTabId && tabs.some((t) => t.id === parsed.activeTabId)
        ? parsed.activeTabId
        : null;
    return {
      tabs,
      activeTabId,
      bottomLayout: parsed.bottomLayout === 'sidebar' ? 'sidebar' : 'tabs',
      isSidebarCollapsed: !!parsed.isSidebarCollapsed,
      homeSection: parsed.homeSection === 'search' ? 'search' : 'overview',
      showAllTabs: !!parsed.showAllTabs,
      topPct: typeof parsed.topPct === 'number' ? parsed.topPct : 40,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
      lastActiveTabByProject:
        parsed.lastActiveTabByProject && typeof parsed.lastActiveTabByProject === 'object'
          ? parsed.lastActiveTabByProject
          : {},
      includeGlobalWorkByProject:
        parsed.includeGlobalWorkByProject && typeof parsed.includeGlobalWorkByProject === 'object'
          ? parsed.includeGlobalWorkByProject
          : {},
      activeWorkspaceKeyByProject:
        parsed.activeWorkspaceKeyByProject && typeof parsed.activeWorkspaceKeyByProject === 'object'
          ? parsed.activeWorkspaceKeyByProject
          : {},
      workspaceSessionSnapshots,
      savedWorkspaceSessions,
    };
  } catch {
    return GLOBAL_TAB_STATE_DEFAULT;
  }
}

export function saveGlobalTabState(state: GlobalTabState): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

function getTabLabel(tab: GlobalTab, items: Item[]): string {
  if (tab.kind === 'search') {
    const q = tab.query?.trim();
    if (!q) return 'Search';
    return q.length > 28 ? `🔍 ${q.slice(0, 28)}…` : `🔍 ${q}`;
  }
  if (tab.kind === 'list') return tab.title || 'List';
  if (tab.kind === 'url') return tab.title?.trim() || tab.url || 'Web page';

  const item = items.find(i => i.id === tab.itemId);
  if (!item) return 'Untitled';
  
  return item.title?.trim() || 'Untitled';
}

function getTabAccessibleLabel(tab: GlobalTab, items: Item[]): string {
  if (tab.kind === 'search') return `Search: ${tab.query?.trim() || 'Untitled search'}`;
  if (tab.kind === 'list') return tab.title || 'Untitled list';
  if (tab.kind === 'url') return tab.title?.trim() || tab.url || 'Web page';
  const item = items.find((candidate) => candidate.id === tab.itemId);
  return item?.title?.trim() || 'Untitled item';
}

function TabOutOfScopeBadge({
  tab,
  items,
  collections,
  scopeProjectId = 'all',
  scopeCollectionId = 'all',
  onSwitchScopeForItem,
  compact,
}: {
  tab: GlobalTab;
  items: Item[];
  collections: Collection[];
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  onSwitchScopeForItem?: (item: Item) => void;
  compact?: boolean;
}) {
  if (tab.kind !== 'item') return null;
  const item = items.find((i) => i.id === tab.itemId);
  if (!item || !isScopeNarrowed(scopeProjectId, scopeCollectionId)) return null;
  if (itemMatchesScope(item, scopeProjectId, scopeCollectionId, collections)) return null;

  return (
    <button
      type="button"
      title="Out of scope — click to switch to this item's collection"
      onClick={(e) => {
        e.stopPropagation();
        onSwitchScopeForItem?.(item);
      }}
      style={{
        flexShrink: 0,
        padding: compact ? '0 4px' : '1px 5px',
        borderRadius: 4,
        border: '1px solid var(--warning-border)',
        background: 'var(--warning-weak)',
        color: 'var(--warning)',
        fontSize: compact ? 9 : 10,
        fontWeight: 700,
        lineHeight: 1.3,
        cursor: 'pointer',
        letterSpacing: 0.2,
      }}
    >
      {compact ? '!' : 'OOS'}
    </button>
  );
}

// ===== Props =====
interface GlobalTabSystemProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  tabState: GlobalTabState;
  onTabStateChange: (next: GlobalTabState) => void;
  onUpdateItem?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>, options?: UpdateItemOptions) => Promise<void>;
  onDeleteBookmark?: (id: string, collectionId?: string) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  // For rendering lists
  renderListTab?: (tab: GlobalTabList) => React.ReactNode;
  statusBar?: React.ReactNode;
  librarySearch?: LibrarySearchApi;
  onOpenItemFromSearch?: (item: Item, origin?: { projectId?: string; collectionId?: string }) => void;
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  onSwitchScopeForItem?: (item: Item) => void;
  /** Optional fixed, non-closeable Home workspace rendered when activeTabId is null. */
  homeContent?: React.ReactNode;
  /** Home activity + scope navigation, kept above working tabs and their content. */
  workspaceHeader?: React.ReactNode;
  /** Home/project focus mode: replaces the generic Open work label with an explicit return action. */
  focusContextLabel?: string;
  onExitFocus?: () => void;
  /** Show only tabs belonging to the active project workspace unless All is requested. */
  strictProjectScope?: boolean;
  /** In strict project Focus, also reveal entries from the global workspace. */
  includeGlobalWork?: boolean;
}

export const GlobalTabSystem: React.FC<GlobalTabSystemProps> = ({
  items,
  collections,
  projects,
  tabState,
  onTabStateChange,
  onUpdateItem,
  onDeleteBookmark,
  onCreateProject,
  onCreateCollection,
  renderListTab,
  statusBar,
  librarySearch,
  onOpenItemFromSearch,
  scopeProjectId = 'all',
  scopeCollectionId = 'all',
  onSwitchScopeForItem,
  homeContent,
  workspaceHeader,
  focusContextLabel,
  onExitFocus,
  strictProjectScope = false,
  includeGlobalWork = false,
}) => {
  const { tabs, activeTabId, bottomLayout, isSidebarCollapsed, showAllTabs = false } = tabState;
  const set = (patch: Partial<GlobalTabState>) => {
    const next = { ...tabState, ...patch };
    if (typeof patch.activeTabId === 'string') {
      const focusedTab = next.tabs.find((tab) => tab.id === patch.activeTabId);
      if (focusedTab) {
        const projectId = getGlobalTabProjectId(focusedTab);
        next.lastActiveTabByProject = {
          ...(tabState.lastActiveTabByProject ?? {}),
          [projectId]: focusedTab.id,
        };
      }
    }
    onTabStateChange(next);
  };

  const tabStripRef = useRef<HTMLDivElement>(null);
  const tabStripContainerRef = useRef<HTMLDivElement>(null);
  const sidebarListRef = useRef<HTMLDivElement>(null);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');
  const [editUrl, setEditUrl] = React.useState('');
  const [editNotes, setEditNotes] = React.useState('');
  const [editBaseline, setEditBaseline] = React.useState<{
    title: string;
    url: string;
    notes: string;
  } | null>(null);
  const [editSavedFlash, setEditSavedFlash] = React.useState(false);
  
  const [isTabMenuOpen, setIsTabMenuOpen] = React.useState(false);
  const [maxVisibleTabs, setMaxVisibleTabs] = React.useState(5);
  const [draggedTabId, setDraggedTabId] = React.useState<string | null>(null);
  const [itemContextMenu, setItemContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [trashConfirmItem, setTrashConfirmItem] = React.useState<Item | null>(null);

  React.useEffect(() => {
    if (!tabStripContainerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const count = Math.max(1, Math.floor(width / 160));
        setMaxVisibleTabs(count);
      }
    });
    observer.observe(tabStripContainerRef.current);
    return () => observer.disconnect();
  }, [bottomLayout]);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;
  const isTabVisible = (tab: GlobalTab, showAll = showAllTabs) =>
    strictProjectScope && scopeProjectId !== 'all'
      ? showAll ||
        getGlobalTabProjectId(tab) === scopeProjectId ||
        (includeGlobalWork && getGlobalTabProjectId(tab) === 'all')
      : isGlobalTabVisible(tab, scopeProjectId, showAll);
  const scopedTabs = useMemo(
    () => tabs.filter((tab) => isTabVisible(tab, showAllTabs)),
    [tabs, scopeProjectId, showAllTabs, strictProjectScope, includeGlobalWork]
  );
  const hiddenScopeTabCount = tabs.length - tabs.filter((tab) => isTabVisible(tab, false)).length;
  const prevActiveTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    const switchedToSearch =
      activeTab?.kind === 'search' && prevActiveTabIdRef.current !== activeTabId;

    if (!librarySearch || activeTab?.kind !== 'search') {
      prevActiveTabIdRef.current = activeTabId;
      return;
    }

    const tabQuery = activeTab.query?.trim() ?? '';
    if (!tabQuery) {
      prevActiveTabIdRef.current = activeTabId;
      return;
    }

    const current = librarySearch.state.query.trim();
    const tabMode = activeTab.mode === 'lexical-only' ? 'lexical-only' : 'hybrid';
    const tabFilters = activeTab.filters ?? {};
    const filtersMatch = JSON.stringify(librarySearch.state.filters) === JSON.stringify(tabFilters);
    const needsRestore =
      current === '' ||
      (switchedToSearch &&
        (current !== tabQuery || librarySearch.state.mode !== tabMode || !filtersMatch));

    if (!needsRestore) {
      if (
        current === tabQuery &&
        !librarySearch.state.result &&
        !librarySearch.state.loading &&
        !librarySearch.state.restoring
      ) {
        void librarySearch.runSearch(tabQuery);
      }
      prevActiveTabIdRef.current = activeTabId;
      return;
    }

    librarySearch.openSearch({ query: tabQuery, filters: tabFilters, mode: tabMode });
    prevActiveTabIdRef.current = activeTabId;
  }, [
    activeTabId,
    activeTab,
    librarySearch,
    librarySearch?.state.query,
    librarySearch?.state.result,
    librarySearch?.state.loading,
    librarySearch?.state.restoring,
  ]);

  const [resolvedItem, setResolvedItem] = useState<Item | null>(null);

  useEffect(() => {
    if (activeTab?.kind !== 'item' || !activeTab.itemId) {
      setResolvedItem(null);
      return;
    }
    const fromProps = items.find((i) => i.id === activeTab.itemId);
    if (fromProps) {
      setResolvedItem(fromProps);
      return;
    }
    let cancelled = false;
    void getItem(activeTab.itemId).then((item) => {
      if (!cancelled) setResolvedItem(item ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, items]);

  const activeItemObj =
    activeTab?.kind === 'item'
      ? items.find((i) => i.id === activeTab.itemId) ?? resolvedItem
      : null;

  const closeTab = (id: string) => {
    const next = tabs.filter(t => t.id !== id);
    const nextVisible = next.filter((tab) => isTabVisible(tab, showAllTabs));
    const nextActiveId = activeTabId === id ? (nextVisible[nextVisible.length - 1]?.id ?? null) : activeTabId;
    set({ tabs: next, activeTabId: nextActiveId });
    setIsEditing(false);
    if (next.length === 0) setIsTabMenuOpen(false);
  };

  const { visibleTabs } = useMemo(() => {
    if (scopedTabs.length <= maxVisibleTabs) {
      return { visibleTabs: scopedTabs, dropdownTabs: [] };
    }

    const activeIndex = activeTabId ? scopedTabs.findIndex((t) => t.id === activeTabId) : -1;
    if (activeIndex === -1 || activeIndex < maxVisibleTabs) {
      return {
        visibleTabs: scopedTabs.slice(0, maxVisibleTabs),
        dropdownTabs: scopedTabs.slice(maxVisibleTabs),
      };
    }

    // Keep the active tab in the visible strip even when it would overflow.
    const activeTabEntry = scopedTabs[activeIndex];
    const others = scopedTabs.filter((t) => t.id !== activeTabId);
    const visible = [...others.slice(0, maxVisibleTabs - 1), activeTabEntry];
    const visibleIds = new Set(visible.map((t) => t.id));
    const hidden = scopedTabs.filter((t) => !visibleIds.has(t.id));
    return { visibleTabs: visible, dropdownTabs: hidden };
  }, [scopedTabs, maxVisibleTabs, activeTabId]);

  useEffect(() => {
    if (!activeTab || isTabVisible(activeTab, showAllTabs)) return;
    set({ activeTabId: null });
  }, [activeTab, scopeProjectId, showAllTabs, strictProjectScope, includeGlobalWork]);

  const scrollActiveTabIntoView = React.useCallback(() => {
    if (!activeTabId) return;
    const container = bottomLayout === 'sidebar' ? sidebarListRef.current : tabStripRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-tab-id="${activeTabId}"]`);
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTabId, bottomLayout]);

  React.useEffect(() => {
    // Defer until after layout — tab strip may mount the same frame tabs are added.
    let innerId = 0;
    const outerId = window.requestAnimationFrame(() => {
      innerId = window.requestAnimationFrame(() => {
        scrollActiveTabIntoView();
      });
    });
    return () => {
      window.cancelAnimationFrame(outerId);
      if (innerId) window.cancelAnimationFrame(innerId);
    };
  }, [scrollActiveTabIntoView, activeTabId, tabs.length, maxVisibleTabs, bottomLayout]);

  const startEditing = () => {
    if (!activeItemObj) return;
    const baseline = {
      title: activeItemObj.title || '',
      url: activeItemObj.url || '',
      notes: activeItemObj.notes || '',
    };
    setEditTitle(baseline.title);
    setEditUrl(baseline.url);
    setEditNotes(baseline.notes);
    setEditBaseline(baseline);
    setEditSavedFlash(false);
    setIsEditing(true);
  };
  const finishEditing = () => {
    setIsEditing(false);
    setEditBaseline(null);
    setEditSavedFlash(false);
  };
  const undoEditing = () => {
    if (!editBaseline) return;
    setEditTitle(editBaseline.title);
    setEditUrl(editBaseline.url);
    setEditNotes(editBaseline.notes);
    setEditSavedFlash(false);
  };
  const saveEditing = async () => {
    if (!activeItemObj || !onUpdateItem) {
      finishEditing();
      return;
    }
    const next = { title: editTitle, url: editUrl, notes: editNotes };
    await onUpdateItem(activeItemObj.id, {
      title: next.title,
      url: next.url || undefined,
      notes: next.notes || undefined,
      updated_at: Date.now(),
    });
    // Stay in edit mode — user exits with Done. Baseline becomes last save for Undo.
    setEditBaseline(next);
    setEditSavedFlash(true);
    window.setTimeout(() => setEditSavedFlash(false), 1800);
  };

  const editDirty =
    !!editBaseline &&
    (editTitle !== editBaseline.title ||
      editUrl !== editBaseline.url ||
      editNotes !== editBaseline.notes);

  // Enter edit for notes when switching items; bookmarks start in view.
  // Depend only on item identity — not onUpdateItem (new fn each parent render used to kick out of edit).
  const editingItemIdRef = useRef<string | null>(null);
  React.useEffect(() => {
    const id = activeItemObj?.id ?? null;
    if (id === editingItemIdRef.current) return;
    editingItemIdRef.current = id;

    if (!activeItemObj) {
      setIsEditing(false);
      setEditBaseline(null);
      setEditSavedFlash(false);
      return;
    }
    if (!activeItemObj.url && onUpdateItem && !activeItemObj.deletedAt) {
      const baseline = {
        title: activeItemObj.title || '',
        url: activeItemObj.url || '',
        notes: activeItemObj.notes || '',
      };
      setEditTitle(baseline.title);
      setEditUrl(baseline.url);
      setEditNotes(baseline.notes);
      setEditBaseline(baseline);
      setEditSavedFlash(false);
      setIsEditing(true);
      return;
    }
    setIsEditing(false);
    setEditBaseline(null);
    setEditSavedFlash(false);
  }, [activeItemObj?.id, activeItemObj, onUpdateItem]);
  
  const requestMoveToTrash = () => {
    if (!activeItemObj || !onDeleteBookmark || activeItemObj.deletedAt) return;
    setTrashConfirmItem(activeItemObj);
  };

  const runTrashConfirm = async (result: DeleteConfirmResult) => {
    const target = trashConfirmItem;
    setTrashConfirmItem(null);
    if (!target || !onDeleteBookmark || result.action === 'cancel') return;
    if (result.action !== 'delete-everywhere') return;
    try {
      await onDeleteBookmark(target.id);
    } catch (e) {
      console.error('Move to trash failed:', e);
      window.alert(`Could not move to trash: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const togglePin = async () => {
    if (!activeItemObj || activeItemObj.deletedAt) return;
    if (activeItemObj.pinnedAt) await unpinItem(activeItemObj.id);
    else await pinItem(activeItemObj.id);
  };

  const toggleFavorite = async () => {
    if (!activeItemObj || activeItemObj.deletedAt) return;
    if (activeItemObj.favoriteAt) await unfavoriteItem(activeItemObj.id);
    else await favoriteItem(activeItemObj.id);
  };

  const toggleTabGlobalPin = (tab: GlobalTab) => {
    if (getGlobalTabProjectId(tab) === 'all') return;
    const pinnedGlobally = !tab.pinnedGlobally;
    set({
      tabs: tabs.map((candidate) =>
        candidate.id === tab.id
          ? { ...candidate, pinnedGlobally: pinnedGlobally || undefined }
          : candidate
      ),
    });
  };

  const tabOrigin = (tab: GlobalTab | null = activeTab) => {
    const projectId = tab
      ? tab.scopeProjectId
      : scopeProjectId !== 'all'
        ? scopeProjectId
        : undefined;
    const collectionId = tab
      ? tab.scopeCollectionId
      : projectId && scopeCollectionId !== 'all'
        ? scopeCollectionId
        : undefined;
    return {
      ...(projectId ? { scopeProjectId: projectId } : {}),
      ...(projectId && collectionId ? { scopeCollectionId: collectionId } : {}),
    };
  };

  const openItemFromUtilityList = (item: Item) => {
    const origin = tabOrigin();
    const projectId = origin.scopeProjectId;
    const id = `item-${item.id}${projectId ? `@project:${projectId}` : ''}`;
    const existing = tabs.find(
      (tab) =>
        tab.kind === 'item' &&
        tab.itemId === item.id &&
        tab.scopeProjectId === projectId
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    set({ tabs: [...tabs, { kind: 'item', id, itemId: item.id, ...origin }], activeTabId: id });
  };

  const renderUtilityListTab = (listType: GlobalTabList['listType']) => {
    switch (listType) {
      case 'favorites':
        return <FavoritesTab onItemClick={openItemFromUtilityList} />;
      case 'pinned':
        return <PinnedTab onItemClick={openItemFromUtilityList} />;
      case 'quick-access':
        return <QuickAccessTab onItemClick={openItemFromUtilityList} />;
      case 'trash':
        return <TrashTab onItemClick={openItemFromUtilityList} />;
      case 'recent':
        return <RecentTab items={items} onItemClick={openItemFromUtilityList} />;
      default:
        return null;
    }
  };

  const renderTabScope = (tab: GlobalTab, compact = false, forceLabel = false) => {
    const projectId = getGlobalTabProjectId(tab);
    const projectName =
      projectId === 'all' ? 'Global' : projects.find((project) => project.id === projectId)?.name ?? 'Project';
    const showScopeLabel = showAllTabs || forceLabel;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        {showScopeLabel && (
          <span
            title={projectName}
            style={{
              maxWidth: compact ? 58 : 78,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              padding: '1px 4px',
              borderRadius: 4,
              background: projectId === 'all' ? 'var(--bg-hover)' : 'var(--accent-weak)',
              color: projectId === 'all' ? 'var(--text-faint)' : 'var(--accent)',
              fontSize: 9,
              fontWeight: 600,
            }}
          >
            {projectName}
          </span>
        )}
        {projectId !== 'all' && (
          <button
            type="button"
            aria-label={tab.pinnedGlobally ? `Unpin ${projectName} tab from all projects` : `Pin ${projectName} tab globally`}
            title={tab.pinnedGlobally ? 'Visible everywhere — return to project only' : 'Make visible in every project'}
            onClick={(event) => {
              event.stopPropagation();
              toggleTabGlobalPin(tab);
            }}
            style={{
              width: 18,
              height: 18,
              padding: 0,
              border: 'none',
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: tab.pinnedGlobally ? 'var(--accent-weak)' : 'transparent',
              color: tab.pinnedGlobally ? 'var(--accent)' : 'var(--text-faint)',
              cursor: 'pointer',
            }}
          >
            <Globe2 size={compact ? 10 : 11} />
          </button>
        )}
      </span>
    );
  };

  React.useEffect(() => { setIsEditing(false); }, [activeTabId]);

  return (
    <div
      className="ui-workspace-tabs"
      style={{
        height: '100%',
        width: '100%',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {workspaceHeader}
      <div
        className="ui-workspace-tabs__layout"
        data-layout={bottomLayout}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: bottomLayout === 'sidebar' ? 'row' : 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
      {/* --- SIDEBAR LAYOUT --- */}
      {bottomLayout === 'sidebar' && (
        <div className="ui-workspace-tabs__sidebar" data-collapsed={isSidebarCollapsed ? 'true' : 'false'} style={{ width: isSidebarCollapsed ? 48 : 220 }}>
          <div className="ui-workspace-tabs__sidebar-header" data-collapsed={isSidebarCollapsed ? 'true' : 'false'}>
            {!isSidebarCollapsed && (
              onExitFocus ? (
                <button
                  type="button"
                  data-focus-entry
                  onClick={onExitFocus}
                  title={`Return to ${focusContextLabel || 'Home'}`}
                  style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 650, cursor: 'pointer' }}
                >
                  <ArrowLeft size={14} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focusContextLabel || 'Home'}</span>
                </button>
              ) : (
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)' }}>Open work</span>
              )
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => set({ isSidebarCollapsed: !isSidebarCollapsed })} title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 4 }}>
                {isSidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
              </button>
              {!isSidebarCollapsed && (
                <button onClick={() => set({ bottomLayout: 'tabs' })} title="Switch to Top Tabs Layout" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 4 }}>
                  <Layout size={16} />
                </button>
              )}
            </div>
          </div>
          <div ref={sidebarListRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }} className="scrollbar">
            {scopedTabs.map(tab => {
              const isActive = tab.id === activeTabId;
              const label = getTabLabel(tab, items);
              const accessibleLabel = getTabAccessibleLabel(tab, items);
              const isSearch = tab.kind === 'search';
              const isList = tab.kind === 'list';
              const isUrl = tab.kind === 'url';
              return (
                <div
                  key={tab.id}
                  className="ui-workspace-tabs__sidebar-tab"
                  data-active={isActive ? 'true' : 'false'}
                  data-collapsed={isSidebarCollapsed ? 'true' : 'false'}
                  data-tab-id={tab.id}
                  role="tab"
                  tabIndex={0}
                  aria-selected={isActive}
                  onClick={() => set({ activeTabId: tab.id })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      set({ activeTabId: tab.id });
                    }
                  }}
                  draggable
                  onDragStart={(e) => { setDraggedTabId(tab.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tab.id); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!draggedTabId || draggedTabId === tab.id) return;
                    const draggedIdx = tabs.findIndex(t => t.id === draggedTabId);
                    const targetIdx = tabs.findIndex(t => t.id === tab.id);
                    if (draggedIdx !== -1 && targetIdx !== -1) {
                      const newTabs = [...tabs];
                      const [movedTab] = newTabs.splice(draggedIdx, 1);
                      newTabs.splice(targetIdx, 0, movedTab);
                      set({ tabs: newTabs });
                    }
                    setDraggedTabId(null);
                  }}
                  onDragEnd={() => setDraggedTabId(null)}
                  title={label}
                  style={{ opacity: draggedTabId === tab.id ? 0.4 : 1 }}
                >
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20 }}>
                    {isSearch ? <Search size={14} /> : isList ? <Layout size={14} /> : isUrl ? <ExternalLink size={14} /> : <FileText size={14} />}
                  </div>
                  {!isSidebarCollapsed && (
                    <>
                      <span style={{ marginLeft: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 'var(--text-sm)' }}>{label}</span>
                      <TabOutOfScopeBadge
                        tab={tab}
                        items={items}
                        collections={collections}
                        scopeProjectId={scopeProjectId}
                        scopeCollectionId={scopeCollectionId}
                        onSwitchScopeForItem={onSwitchScopeForItem}
                        compact
                      />
                      {renderTabScope(tab, true)}
                      <button
                        type="button"
                        className="ui-workspace-tabs__close"
                        onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                        onKeyDown={(event) => event.stopPropagation()}
                        aria-label={`Close ${accessibleLabel}`}
                        title={`Close ${accessibleLabel}`}
                      >
                        <X size={12} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {!isSidebarCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
              {(hiddenScopeTabCount > 0 || showAllTabs) && (
                <button
                  type="button"
                  onClick={() => set({ showAllTabs: !showAllTabs, activeTabId: showAllTabs && activeTab && !isTabVisible(activeTab, false) ? null : activeTabId })}
                  style={{ height: 32, border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  {showAllTabs ? 'Show current project' : `Show all · ${hiddenScopeTabCount} hidden`}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsTabMenuOpen(!isTabMenuOpen)}
                style={{ height: 32, border: 'none', background: isTabMenuOpen ? 'var(--bg-active)' : 'transparent', color: isTabMenuOpen ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
              >
                All open · {tabs.length}
              </button>
            </div>
          )}
          {isSidebarCollapsed && (
             <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--border)' }}>
               <button onClick={() => set({ bottomLayout: 'tabs' })} title="Switch to Top Tabs Layout" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}><Layout size={16} /></button>
             </div>
          )}
        </div>
      )}

      {/* --- TOP TABS LAYOUT --- */}
      {bottomLayout === 'tabs' && (
        <div ref={tabStripContainerRef} className="ui-workspace-tabs__strip">
          <div className="ui-workspace-tabs__strip-label">
            {onExitFocus ? (
              <>
                <button
                  type="button"
                  onClick={() => set({ bottomLayout: 'sidebar' })}
                  title="Switch to sidebar tabs"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Sidebar size={13} />
                </button>
                <button
                  type="button"
                  data-focus-entry
                  onClick={onExitFocus}
                  title={`Return to ${focusContextLabel || 'Home'}`}
                  style={{ minWidth: 0, maxWidth: 150, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 2px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-xs)', fontWeight: 650, cursor: 'pointer' }}
                >
                  <ArrowLeft size={14} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focusContextLabel || 'Home'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => set({ bottomLayout: 'sidebar' })}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  title="Switch to Sidebar Layout"
                >
                  <Sidebar size={14} />
                </button>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Open work</span>
              </>
            )}
          </div>
          <div ref={tabStripRef} className="ui-workspace-tabs__tab-list hide-scrollbar" role="tablist" aria-label="Open work">
            {visibleTabs.map(tab => {
              const isActive = tab.id === activeTabId;
              const label = getTabLabel(tab, items);
              const accessibleLabel = getTabAccessibleLabel(tab, items);
              return (
                <div
                  key={tab.id}
                  className="ui-workspace-tabs__tab"
                  data-active={isActive ? 'true' : 'false'}
                  data-tab-id={tab.id}
                  role="tab"
                  tabIndex={0}
                  aria-selected={isActive}
                  onClick={() => set({ activeTabId: tab.id })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      set({ activeTabId: tab.id });
                    }
                  }}
                  draggable
                  onDragStart={(e) => { setDraggedTabId(tab.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tab.id); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!draggedTabId || draggedTabId === tab.id) return;
                    const draggedIdx = tabs.findIndex(t => t.id === draggedTabId);
                    const targetIdx = tabs.findIndex(t => t.id === tab.id);
                    if (draggedIdx !== -1 && targetIdx !== -1) {
                      const newTabs = [...tabs];
                      const [movedTab] = newTabs.splice(draggedIdx, 1);
                      newTabs.splice(targetIdx, 0, movedTab);
                      set({ tabs: newTabs });
                    }
                    setDraggedTabId(null);
                  }}
                  onDragEnd={() => setDraggedTabId(null)}
                  style={{ opacity: draggedTabId === tab.id ? 0.4 : 1 }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, pointerEvents: 'none' }}>{label}</span>
                  <TabOutOfScopeBadge
                    tab={tab}
                    items={items}
                    collections={collections}
                    scopeProjectId={scopeProjectId}
                    scopeCollectionId={scopeCollectionId}
                    onSwitchScopeForItem={onSwitchScopeForItem}
                    compact
                  />
                  {renderTabScope(tab, true)}
                  <button
                    type="button"
                    className="ui-workspace-tabs__close"
                    onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                    onKeyDown={(event) => event.stopPropagation()}
                    aria-label={`Close ${accessibleLabel}`}
                    title={`Close ${accessibleLabel}`}
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>
          {(hiddenScopeTabCount > 0 || showAllTabs) && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', borderLeft: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => set({ showAllTabs: !showAllTabs, activeTabId: showAllTabs && activeTab && !isTabVisible(activeTab, false) ? null : activeTabId })}
                title={showAllTabs ? 'Hide tabs from other projects' : `Show ${hiddenScopeTabCount} tabs from other projects`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 7px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: showAllTabs ? 'var(--bg-active)' : 'transparent', color: showAllTabs ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {showAllTabs ? <EyeOff size={12} /> : <Eye size={12} />}
                {showAllTabs ? 'Current' : `All · ${tabs.length}`}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', borderLeft: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setIsTabMenuOpen(!isTabMenuOpen)}
              title={`Show all ${tabs.length} open tabs`}
              aria-expanded={isTabMenuOpen}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 7px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: isTabMenuOpen ? 'var(--bg-active)' : 'transparent', color: isTabMenuOpen ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <List size={12} />
              All open · {tabs.length}
            </button>
          </div>
        </div>
      )}

      {isTabMenuOpen && (
        <>
          <div onClick={() => setIsTabMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99, pointerEvents: draggedTabId ? 'none' : 'auto' }} />
          <div style={{ position: 'absolute', top: bottomLayout === 'tabs' ? 40 : 8, right: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '6px 0', width: 320, maxWidth: 'calc(100% - 16px)', zIndex: 'var(--layer-dropdown)', maxHeight: '60%', overflowY: 'auto' }} className="scrollbar">
            <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              All open work · {tabs.length}
            </div>
            {tabs.map(tab => {
              const isActive = tab.id === activeTabId;
              const label = getTabLabel(tab, items);
              const hiddenInCurrentProject = !isTabVisible(tab, false);
              return (
                <div
                  key={tab.id}
                  onClick={() => {
                    set({ activeTabId: tab.id, ...(hiddenInCurrentProject ? { showAllTabs: true } : {}) });
                    setIsTabMenuOpen(false);
                  }}
                  draggable
                  onDragStart={(e) => { setDraggedTabId(tab.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tab.id); }}
                  onDragEnd={() => { setDraggedTabId(null); setIsTabMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: isActive ? 'var(--bg-active)' : 'transparent', color: isActive ? 'var(--accent)' : 'var(--text-muted)', fontWeight: isActive ? 600 : 400, fontSize: 'var(--text-sm)', cursor: 'pointer', borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent', opacity: draggedTabId === tab.id ? 0.4 : 1 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent'}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
                  {renderTabScope(tab, true, true)}
                  <X size={12} style={{ marginLeft: 2, color: 'var(--text-muted)', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); closeTab(tab.id); if(tabs.length === 1) setIsTabMenuOpen(false); }} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* --- TAB CONTENT --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        {statusBar}
        <TabPaneFrame>
        {!activeTab && homeContent}
        {activeTab?.kind === 'search' && librarySearch && (
          <ProductSearchView
            embedded
            items={items}
            collections={collections}
            state={librarySearch.state}
            onQueryChange={(query) => {
              librarySearch.setQuery(query);
              set({
                tabs: tabs.map((tab) =>
                  tab.id === activeTab.id && tab.kind === 'search' ? { ...tab, query } : tab
                ),
              });
            }}
            onFiltersChange={(filters) => {
              librarySearch.setFilters(filters);
              set({
                tabs: tabs.map((tab) =>
                  tab.id === activeTab.id && tab.kind === 'search' ? { ...tab, filters } : tab
                ),
              });
            }}
            onModeChange={(mode) => {
              librarySearch.setMode(mode);
              set({
                tabs: tabs.map((tab) =>
                  tab.id === activeTab.id && tab.kind === 'search' ? { ...tab, mode } : tab
                ),
              });
            }}
            onSelectedItemIdChange={librarySearch.setSelectedItemId}
            onRunSearch={librarySearch.runSearch}
            onOpenItem={(item) => onOpenItemFromSearch?.(item, {
              projectId: activeTab.scopeProjectId,
              collectionId: activeTab.scopeCollectionId,
            })}
            onClearRecentQueries={librarySearch.clearRecentQueries}
            scopeLabel={
              activeTab.filters?.collectionId
                ? collections.find((collection) => collection.id === activeTab.filters?.collectionId)?.name
                : activeTab.filters?.projectId
                  ? projects.find((project) => project.id === activeTab.filters?.projectId)?.name
                  : undefined
            }
            autofocus={false}
          />
        )}
        {activeTab?.kind === 'search' && !librarySearch && (
          <div style={{ padding: 20, color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
            Search is unavailable.
          </div>
        )}
        {activeTab?.kind === 'url' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, background: 'var(--bg)' }}>
            <div style={{ width: '100%', maxWidth: 620, padding: '28px', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--accent-weak)', color: 'var(--accent)' }}>
                <ExternalLink size={18} />
              </span>
              <h2 style={{ margin: '16px 0 0', color: 'var(--text)', fontSize: 'var(--text-xl)', lineHeight: 1.3 }}>{activeTab.title || 'Web page'}</h2>
              <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.55, overflowWrap: 'anywhere' }}>{activeTab.url}</p>
              <button
                type="button"
                className="ui-button ui-button--primary"
                onClick={() => chrome.tabs.create({ url: activeTab.url })}
                style={{ marginTop: 20, minHeight: 32, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 12px', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-sm)', fontWeight: 650, cursor: 'pointer' }}
              >
                <ExternalLink size={14} /> Open in browser
              </button>
            </div>
          </div>
        )}
        {activeTab?.kind === 'item' && activeItemObj && (
          !activeItemObj.url ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                padding: '16px 20px 32px',
                scrollPaddingBottom: 32,
                background: 'var(--bg)',
              }}
              className="reading-content"
              onContextMenu={(e) => {
                e.preventDefault();
                setItemContextMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              <ItemDetail
                item={activeItemObj}
                collections={collections}
                projects={projects}
                isEditing={isEditing}
                editTitle={editTitle}
                editUrl={editUrl}
                editNotes={editNotes}
                onEditTitleChange={setEditTitle}
                onEditUrlChange={setEditUrl}
                onEditNotesChange={setEditNotes}
                onStartEdit={startEditing}
                onUndoEdit={undoEditing}
                onDoneEdit={finishEditing}
                onSaveEdit={() => void saveEditing()}
                editDirty={editDirty}
                editSavedFlash={editSavedFlash}
                onDelete={requestMoveToTrash}
                onTogglePin={togglePin}
                onToggleFavorite={toggleFavorite}
                canEdit={!!onUpdateItem}
                onUpdateOrganization={
                  onUpdateItem
                    ? (updates) => onUpdateItem(activeItemObj.id, updates)
                    : undefined
                }
                onCreateProject={onCreateProject}
                onCreateCollection={onCreateCollection}
              />
            </div>
          ) : (
          <TabScrollShell
            style={{ padding: '16px 20px 32px', scrollPaddingBottom: 32, background: 'var(--bg)' }}
            className="scrollbar reading-content"
          >
            <div
              onContextMenu={(e) => {
                e.preventDefault();
                setItemContextMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              <ItemDetail
                item={activeItemObj}
                collections={collections}
                projects={projects}
                isEditing={isEditing}
                editTitle={editTitle}
                editUrl={editUrl}
                editNotes={editNotes}
                onEditTitleChange={setEditTitle}
                onEditUrlChange={setEditUrl}
                onEditNotesChange={setEditNotes}
                onStartEdit={startEditing}
                onUndoEdit={undoEditing}
                onDoneEdit={finishEditing}
                onSaveEdit={() => void saveEditing()}
                editDirty={editDirty}
                editSavedFlash={editSavedFlash}
                onDelete={requestMoveToTrash}
                onTogglePin={togglePin}
                onToggleFavorite={toggleFavorite}
                canEdit={!!onUpdateItem}
                onUpdateOrganization={
                  onUpdateItem
                    ? (updates) => onUpdateItem(activeItemObj.id, updates)
                    : undefined
                }
                onCreateProject={onCreateProject}
                onCreateCollection={onCreateCollection}
              />
            </div>
          </TabScrollShell>
          )
        )}
        {activeTab?.kind === 'item' && !activeItemObj && (
          <div style={{ padding: 20, color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Item not found.</div>
        )}
        {activeTab?.kind === 'list' && UTILITY_LIST_TYPES.has(activeTab.listType) && (
          <TabPaneFrame>
            {renderUtilityListTab(activeTab.listType)}
          </TabPaneFrame>
        )}
        {activeTab?.kind === 'list' && !UTILITY_LIST_TYPES.has(activeTab.listType) && renderListTab && (
          <TabPaneFrame>{renderListTab(activeTab)}</TabPaneFrame>
        )}
        </TabPaneFrame>
      </div>
      {itemContextMenu && activeItemObj && (
        <ItemContextMenu
          item={activeItemObj}
          x={itemContextMenu.x}
          y={itemContextMenu.y}
          onClose={() => setItemContextMenu(null)}
          onEdit={onUpdateItem ? () => { startEditing(); setItemContextMenu(null); } : undefined}
          onDelete={
            onDeleteBookmark
              ? () => {
                  requestMoveToTrash();
                  setItemContextMenu(null);
                }
              : undefined
          }
          onOpenInNewTab={
            activeItemObj.url
              ? (it) => {
                  if (it.url) window.open(it.url, '_blank');
                }
              : undefined
          }
        />
      )}
      {trashConfirmItem && (
        <DeleteConfirmDialog item={trashConfirmItem} onResult={runTrashConfirm} />
      )}
      </div>
    </div>
  );
};

interface ItemDetailProps {
  item: Item; collections: Collection[]; projects: Project[];
  isEditing: boolean; editTitle: string; editUrl: string; editNotes: string;
  onEditTitleChange: (v: string) => void; onEditUrlChange: (v: string) => void; onEditNotesChange: (v: string) => void;
  onStartEdit: () => void;
  onUndoEdit: () => void;
  onDoneEdit: () => void;
  onSaveEdit: () => void;
  editDirty?: boolean;
  editSavedFlash?: boolean;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  canEdit: boolean;
  onUpdateOrganization?: (updates: Partial<Omit<Item, 'id' | 'created_at'>>) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
}

const ItemDetail: React.FC<ItemDetailProps> = ({
  item, collections, projects, isEditing, editTitle, editUrl, editNotes,
  onEditTitleChange, onEditUrlChange, onEditNotesChange,
  onStartEdit, onUndoEdit, onDoneEdit, onSaveEdit, editDirty = false, editSavedFlash = false,
  onDelete, onTogglePin, onToggleFavorite, canEdit,
  onUpdateOrganization,
  onCreateProject,
  onCreateCollection,
}) => {
  const isBookmark = !!item.url;
  const isNote = !isBookmark;
  const isTrashed = item.deletedAt != null;

  // Same chrome in view + edit so switching modes doesn't reflow width/height.
  const titleInputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: isNote ? '1.25rem' : 'var(--text-lg)',
    fontWeight: 600,
    padding: isNote ? '6px 0' : '6px 10px',
    borderRadius: 'var(--radius-sm)',
    border: isNote ? 'none' : '1px solid var(--border)',
    background: isNote ? 'transparent' : 'var(--bg-input)',
    color: 'var(--text)',
    outline: 'none',
    lineHeight: 1.3,
  };
  const urlInputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-input)',
    color: isEditing ? 'var(--text)' : 'var(--accent)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
  };
  const notesStyle: React.CSSProperties = {
    flex: 1,
    minHeight: isNote ? 0 : 180,
    height: isNote ? '100%' : undefined,
    width: '100%',
    boxSizing: 'border-box',
    padding: isNote ? '8px 0' : '10px 12px',
    borderRadius: 'var(--radius-sm)',
    border: isNote ? 'none' : '1px solid var(--border)',
    background: isNote ? 'transparent' : 'var(--bg-input)',
    color: editNotes || isEditing ? 'var(--text)' : 'var(--text-faint)',
    fontSize: isNote ? '0.95rem' : 'var(--text-sm)',
    resize: isNote ? 'none' : 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.65,
    outline: 'none',
    overflowY: 'auto',
  };

  return (
    <div
      style={{
        height: isNote ? '100%' : 'auto',
        minHeight: isNote ? 0 : '100%',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: isNote ? 10 : 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            value={isEditing ? editTitle : (item.title || '')}
            readOnly={!isEditing}
            onChange={(e) => onEditTitleChange(e.target.value)}
            placeholder={isNote ? 'Note title' : 'Title'}
            style={{
              ...titleInputStyle,
              cursor: isEditing ? 'text' : 'default',
            }}
          />
          {!isEditing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <ItemQuickAccessMarkers item={item} size={14} hideWhenTrashed />
              {isTrashed && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', fontWeight: 600 }}>In trash</span>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexShrink: 0,
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            // Stable toolbar footprint so Edit ↔ Save swap doesn't shove layout.
            minWidth: isBookmark ? 220 : 160,
          }}
        >
          {isBookmark && (
            <button type="button" onClick={() => window.open(item.url, '_blank')} style={btnStyle('primary')}>
              Open
            </button>
          )}
          {!isTrashed && (
            <button
              type="button"
              onClick={() => void onToggleFavorite()}
              title={item.favoriteAt ? 'Remove from favorites' : 'Add to favorites'}
              style={{
                ...btnStyle('secondary'),
                color: item.favoriteAt ? 'var(--favorite)' : 'var(--text)',
                background: item.favoriteAt ? 'var(--favorite-weak)' : 'transparent',
              }}
            >
              <Star size={14} fill={item.favoriteAt ? 'var(--favorite)' : 'none'} />
            </button>
          )}
          {!isTrashed && (
            <button
              type="button"
              onClick={() => void onTogglePin()}
              title={item.pinnedAt ? 'Unpin' : 'Pin'}
              style={{
                ...btnStyle('secondary'),
                background: item.pinnedAt ? 'var(--accent-weak)' : 'transparent',
              }}
            >
              <Pin size={14} style={{ opacity: item.pinnedAt ? 1 : 0.5 }} />
            </button>
          )}
          {!isEditing ? (
            <>
              {canEdit && !isTrashed && (
                <button type="button" onClick={onStartEdit} style={btnStyle('secondary')}>
                  Edit
                </button>
              )}
              {canEdit && !isTrashed && (
                <button type="button" onClick={onDelete} style={{ ...btnStyle('secondary'), color: 'var(--danger)' }}>
                  Trash
                </button>
              )}
            </>
          ) : (
            <>
              {editSavedFlash && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>Saved</span>
              )}
              <button
                type="button"
                onClick={onUndoEdit}
                disabled={!editDirty}
                title="Restore last saved values"
                style={{
                  ...btnStyle('secondary'),
                  opacity: editDirty ? 1 : 0.45,
                  cursor: editDirty ? 'pointer' : 'default',
                }}
              >
                Undo
              </button>
              {!isNote && (
                <button type="button" onClick={onDoneEdit} style={btnStyle('secondary')}>
                  Done
                </button>
              )}
              <button type="button" onClick={onSaveEdit} style={btnStyle('primary')}>
                {editDirty ? 'Save' : 'Saved'}
              </button>
              {canEdit && !isTrashed && (
                <button type="button" onClick={onDelete} style={{ ...btnStyle('secondary'), color: 'var(--danger)' }}>
                  Trash
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isBookmark && (
        <div style={{ flexShrink: 0, width: '100%', minWidth: 0 }}>
          <Label>URL</Label>
          <input
            type="url"
            value={isEditing ? editUrl : (item.url || '')}
            readOnly={!isEditing}
            onChange={(e) => onEditUrlChange(e.target.value)}
            placeholder="https://..."
            style={{
              ...urlInputStyle,
              cursor: isEditing ? 'text' : 'pointer',
            }}
            onClick={() => {
              if (isEditing) return;
              const url = item.url;
              if (url) window.open(url, '_blank');
            }}
          />
        </div>
      )}

      {isBookmark && (
        <ItemDetailEnrichment itemId={item.id} />
      )}

      <div style={{ flexShrink: 0, width: '100%', minWidth: 0, maxWidth: '100%' }}>
        <ItemOrganizationEditor
          item={
            isEditing
              ? {
                  ...item,
                  title: editTitle,
                  url: editUrl || item.url,
                  notes: editNotes,
                }
              : item
          }
          collections={collections}
          projects={projects}
          editable={canEdit && !isTrashed && !!onUpdateOrganization}
          compact
          onCreateProject={onCreateProject}
          onCreateCollection={onCreateCollection}
          onUpdate={
            onUpdateOrganization
              ? async (patch) => {
                  await onUpdateOrganization({
                    ...(patch.collectionIds !== undefined
                      ? { collectionIds: patch.collectionIds }
                      : {}),
                    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
                    updated_at: Date.now(),
                  });
                }
              : undefined
          }
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
        {!isNote && <Label>Notes</Label>}
        <textarea
          value={isEditing ? editNotes : (item.notes || '')}
          readOnly={!isEditing}
          onChange={(e) => onEditNotesChange(e.target.value)}
          placeholder={isNote ? 'Start writing…' : 'Add notes...'}
          style={{
            ...notesStyle,
            cursor: isEditing ? 'text' : 'default',
          }}
        />
      </div>

      <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', display: 'flex', gap: 16, flexShrink: 0 }}>
        <span>Created: {new Date(item.created_at).toLocaleDateString()}</span>
        <span>Updated: {new Date(item.updated_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{children}</div>
);

const ItemDetailEnrichment: React.FC<{ itemId: string }> = ({ itemId }) => {
  const { context, reload } = useItemPipelineContext(itemId);
  const badge = context ? resolvePipelineBadge(context) : null;
  const item = context?.item;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {badge && (
        <div>
          <ItemPipelineBadge badge={badge} />
        </div>
      )}
      {item?.url ? (
        <ItemDigestQuickActions
          itemId={itemId}
          itemUrl={item.url}
          context={context}
          badge={badge}
          enrichment={context?.enrichment}
          onDone={() => void reload()}
        />
      ) : null}
      <EnrichmentContent
        summary={context?.summary}
        keyPoints={context?.keyPoints ?? []}
        references={context?.references ?? []}
        emptyMessage={ENRICHMENT_EMPTY_MESSAGE}
      />
    </div>
  );
};

const btnStyle = (variant: 'primary' | 'secondary'): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', cursor: 'pointer',
  border: variant === 'primary' ? 'none' : '1px solid var(--border)',
  background: variant === 'primary' ? 'var(--accent)' : 'transparent',
  color: variant === 'primary' ? 'var(--accent-text)' : 'var(--text)',
});
