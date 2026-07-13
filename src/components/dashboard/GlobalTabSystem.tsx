import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Search, FileText, X, Layout, Sidebar, PanelLeftClose, PanelLeft, Pin, Star } from 'lucide-react';
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
import { LIBRARY_SEARCH_TAB_ID, useLibrarySearch } from '../../hooks/useLibrarySearch';
import { useItemPipelineContext } from '../../hooks/useItemPipelineContext';
import { resolvePipelineBadge } from '../../lib/pipeline';
import { EnrichmentContent, ItemPipelineBadge, ENRICHMENT_EMPTY_MESSAGE } from './PipelineDisplayBlocks';
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
export interface GlobalTabItem { kind: 'item'; id: string; itemId: string; }
export interface GlobalTabSearch { kind: 'search'; id: string; query: string; }
// Add list tabs to support legacy DashboardLayout tabs
export interface GlobalTabList { kind: 'list'; id: string; listType: 'bookmark-list' | 'note-list' | 'common-list' | 'workspace' | 'favorites' | 'pinned' | 'quick-access' | 'trash' | 'recent'; title: string; itemIds?: string[]; workspaceId?: string; }

const UTILITY_LIST_TYPES = new Set(['favorites', 'pinned', 'quick-access', 'trash', 'recent']);

export type PruneGlobalTabsContext = {
  itemIds: ReadonlySet<string>;
  workspaceIds: ReadonlySet<string>;
};

/** Drop tabs that point at rows removed from SQLite (localStorage survives DB wipe). */
export function pruneGlobalTabs(
  state: GlobalTabState,
  ctx: PruneGlobalTabsContext
): GlobalTabState {
  const tabs: GlobalTab[] = [];

  for (const tab of state.tabs) {
    if (tab.kind === 'search') {
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

  const activeTabId =
    state.activeTabId && tabs.some((t) => t.id === state.activeTabId)
      ? state.activeTabId
      : tabs[tabs.length - 1]?.id ?? null;

  return { ...state, tabs, activeTabId };
}

export type GlobalTab = GlobalTabItem | GlobalTabSearch | GlobalTabList;

export interface GlobalTabState {
  tabs: GlobalTab[];
  activeTabId: string | null;
  bottomLayout: 'tabs' | 'sidebar';
  isSidebarCollapsed: boolean;
  topPct?: number;
  searchQuery?: string;
}

export const GLOBAL_TAB_STATE_DEFAULT: GlobalTabState = {
  tabs: [],
  activeTabId: null,
  bottomLayout: 'tabs',
  isSidebarCollapsed: false,
  topPct: 40,
  searchQuery: '',
};

const LS_KEY = 'workbench-global-tabs';

function normalizeGlobalTabs(tabs: unknown[]): GlobalTab[] {
  const valid = tabs.filter(
    (t): t is GlobalTab =>
      t != null && typeof t === 'object' && 'kind' in t && typeof (t as GlobalTab).kind === 'string'
  );
  const nonSearch = valid.filter((t) => t.kind !== 'search');
  const searchTabs = valid.filter((t): t is GlobalTabSearch => t.kind === 'search');
  if (searchTabs.length === 0) return nonSearch;
  const query = searchTabs[searchTabs.length - 1]?.query || '';
  return [...nonSearch, { kind: 'search', id: LIBRARY_SEARCH_TAB_ID, query }];
}

export function loadGlobalTabState(): GlobalTabState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return GLOBAL_TAB_STATE_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<GlobalTabState>;
    const tabs = normalizeGlobalTabs(Array.isArray(parsed.tabs) ? parsed.tabs : []);
    const activeTabId =
      parsed.activeTabId === LIBRARY_SEARCH_TAB_ID && tabs.some((t) => t.id === LIBRARY_SEARCH_TAB_ID)
        ? LIBRARY_SEARCH_TAB_ID
        : parsed.activeTabId && tabs.some((t) => t.id === parsed.activeTabId)
          ? parsed.activeTabId
          : tabs[tabs.length - 1]?.id ?? null;
    return {
      tabs,
      activeTabId,
      bottomLayout: parsed.bottomLayout === 'sidebar' ? 'sidebar' : 'tabs',
      isSidebarCollapsed: !!parsed.isSidebarCollapsed,
      topPct: typeof parsed.topPct === 'number' ? parsed.topPct : 40,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
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

  const item = items.find(i => i.id === tab.itemId);
  if (!item) return 'Untitled';
  
  return item.title?.trim() || 'Untitled';
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
        border: '1px solid #d29922',
        background: 'rgba(210, 153, 34, 0.12)',
        color: '#d29922',
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
  // For rendering lists
  renderListTab?: (tab: GlobalTabList) => React.ReactNode;
  statusBar?: React.ReactNode;
  librarySearch?: LibrarySearchApi;
  onOpenItemFromSearch?: (item: Item) => void;
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  onSwitchScopeForItem?: (item: Item) => void;
}

export const GlobalTabSystem: React.FC<GlobalTabSystemProps> = ({
  items,
  collections,
  projects,
  tabState,
  onTabStateChange,
  onUpdateItem,
  onDeleteBookmark,
  renderListTab,
  statusBar,
  librarySearch,
  onOpenItemFromSearch,
  scopeProjectId = 'all',
  scopeCollectionId = 'all',
  onSwitchScopeForItem,
}) => {
  const { tabs, activeTabId, bottomLayout, isSidebarCollapsed } = tabState;
  const set = (patch: Partial<GlobalTabState>) => onTabStateChange({ ...tabState, ...patch });

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
  const prevActiveTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    const switchedToSearch =
      activeTabId === LIBRARY_SEARCH_TAB_ID &&
      prevActiveTabIdRef.current !== LIBRARY_SEARCH_TAB_ID;

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
    const needsRestore = current === '' || (switchedToSearch && current !== tabQuery);

    if (!needsRestore) {
      if (current === tabQuery && !librarySearch.state.result && !librarySearch.state.loading) {
        void librarySearch.runSearch(tabQuery);
      }
      prevActiveTabIdRef.current = activeTabId;
      return;
    }

    librarySearch.setQuery(tabQuery);
    void librarySearch.runSearch(tabQuery);
    prevActiveTabIdRef.current = activeTabId;
  }, [
    activeTabId,
    activeTab,
    librarySearch,
    librarySearch?.state.query,
    librarySearch?.state.result,
    librarySearch?.state.loading,
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
    const nextActiveId = activeTabId === id ? (next[next.length - 1]?.id ?? null) : activeTabId;
    set({ tabs: next, activeTabId: nextActiveId });
    setIsEditing(false);
    if (next.length === 0) setIsTabMenuOpen(false);
  };

  const { visibleTabs, dropdownTabs } = useMemo(() => {
    if (tabs.length <= maxVisibleTabs) {
      return { visibleTabs: tabs, dropdownTabs: [] };
    }

    const activeIndex = activeTabId ? tabs.findIndex((t) => t.id === activeTabId) : -1;
    if (activeIndex === -1 || activeIndex < maxVisibleTabs) {
      return {
        visibleTabs: tabs.slice(0, maxVisibleTabs),
        dropdownTabs: tabs.slice(maxVisibleTabs),
      };
    }

    // Keep the active tab in the visible strip even when it would overflow.
    const activeTabEntry = tabs[activeIndex];
    const others = tabs.filter((t) => t.id !== activeTabId);
    const visible = [...others.slice(0, maxVisibleTabs - 1), activeTabEntry];
    const visibleIds = new Set(visible.map((t) => t.id));
    const hidden = tabs.filter((t) => !visibleIds.has(t.id));
    return { visibleTabs: visible, dropdownTabs: hidden };
  }, [tabs, maxVisibleTabs, activeTabId]);

  const isDropdownActive = dropdownTabs.some((t) => t.id === activeTabId);

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

  const openItemFromUtilityList = (item: Item) => {
    const id = `item-${item.id}`;
    const existing = tabs.find((t) => t.kind === 'item' && t.itemId === item.id);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    set({ tabs: [...tabs, { kind: 'item', id, itemId: item.id }], activeTabId: id });
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

  React.useEffect(() => { setIsEditing(false); }, [activeTabId]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: bottomLayout === 'sidebar' ? 'row' : 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* --- SIDEBAR LAYOUT --- */}
      {bottomLayout === 'sidebar' && (
        <div style={{ width: isSidebarCollapsed ? 48 : 220, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-panel)', transition: 'width 200ms ease', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', padding: isSidebarCollapsed ? 0 : '0 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {!isSidebarCollapsed && <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)' }}>Open Tabs</span>}
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
            {tabs.map(tab => {
              const isActive = tab.id === activeTabId;
              const label = getTabLabel(tab, items);
              const isSearch = tab.kind === 'search';
              const isList = tab.kind === 'list';
              return (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  onClick={() => set({ activeTabId: tab.id })}
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
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                    padding: isSidebarCollapsed ? '8px 0' : '8px 12px', cursor: 'pointer', background: isActive ? 'var(--bg-active)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)', fontWeight: isActive ? 600 : 400,
                    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent', opacity: draggedTabId === tab.id ? 0.4 : 1, position: 'relative'
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20 }}>
                    {isSearch ? <Search size={14} /> : isList ? <Layout size={14} /> : <FileText size={14} />}
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
                      <span
                        onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, color: 'var(--text-faint)', cursor: 'pointer', flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'var(--error-weak)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <X size={12} />
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {isSidebarCollapsed && (
             <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--border)' }}>
               <button onClick={() => set({ bottomLayout: 'tabs' })} title="Switch to Top Tabs Layout" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}><Layout size={16} /></button>
             </div>
          )}
        </div>
      )}

      {/* --- TOP TABS LAYOUT --- */}
      {bottomLayout === 'tabs' && (
        <div ref={tabStripContainerRef} style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0, height: 40, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderRight: '1px solid var(--border)', background: 'var(--bg-panel)', zIndex: 2 }}>
            <button 
              onClick={() => set({ bottomLayout: 'sidebar' })}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              title="Switch to Sidebar Layout"
            >
              <Sidebar size={14} />
            </button>
          </div>
          <div ref={tabStripRef} style={{ display: 'flex', alignItems: 'flex-end', gap: 2, paddingLeft: 8, flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }} className="hide-scrollbar">
            {visibleTabs.map(tab => {
              const isActive = tab.id === activeTabId;
              const label = getTabLabel(tab, items);
              return (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  onClick={() => set({ activeTabId: tab.id })}
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
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1, height: 34, padding: '0 12px', borderRadius: '6px 6px 0 0',
                    borderLeft: isActive ? '1px solid var(--border)' : '1px solid transparent', borderRight: isActive ? '1px solid var(--border)' : '1px solid transparent',
                    borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent', borderBottom: isActive ? '1px solid var(--bg)' : '1px solid transparent',
                    background: isActive ? 'var(--bg)' : 'var(--bg-hover)', color: isActive ? 'var(--text)' : 'var(--text-muted)',
                    fontWeight: isActive ? 600 : 400, fontSize: 'var(--text-sm)', cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 160, minWidth: 80, userSelect: 'none',
                    opacity: draggedTabId === tab.id ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-glass)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
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
                  <span
                    onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, color: 'var(--text-faint)', cursor: 'pointer', flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'var(--error-weak)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <X size={11} />
                  </span>
                </div>
              );
            })}
          </div>
          {dropdownTabs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderLeft: '1px solid var(--border)', background: 'var(--bg-panel)', zIndex: 2 }}>
            <button 
              onClick={() => setIsTabMenuOpen(!isTabMenuOpen)}
              style={{ background: isTabMenuOpen || isDropdownActive ? 'var(--bg-active)' : 'transparent', border: '1px solid', borderColor: isDropdownActive ? 'var(--accent)' : 'transparent', color: isDropdownActive ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isDropdownActive ? '0 0 0 1px var(--accent)' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = isTabMenuOpen || isDropdownActive ? 'var(--bg-active)' : 'transparent'}
              title="Show all tabs"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
              </div>
            </button>
          </div>
          )}
          {isTabMenuOpen && (
            <>
              <div onClick={() => setIsTabMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99, pointerEvents: draggedTabId ? 'none' : 'auto' }} />
              <div style={{ position: 'absolute', top: 40, right: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '6px 0', minWidth: 200, zIndex: 100, maxHeight: '50vh', overflowY: 'auto' }} className="scrollbar">
                {dropdownTabs.map(tab => {
                  const isActive = tab.id === activeTabId;
                  const label = getTabLabel(tab, items);
                  return (
                    <div
                      key={tab.id}
                      onClick={() => { set({ activeTabId: tab.id }); setIsTabMenuOpen(false); }}
                      draggable
                      onDragStart={(e) => { setDraggedTabId(tab.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tab.id); }}
                      onDragEnd={() => { setDraggedTabId(null); setIsTabMenuOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: isActive ? 'var(--bg-active)' : 'transparent', color: isActive ? 'var(--accent)' : 'var(--text-muted)', fontWeight: isActive ? 600 : 400, fontSize: 'var(--text-sm)', cursor: 'pointer', borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent', opacity: draggedTabId === tab.id ? 0.4 : 1 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent'}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
                      <X size={12} style={{ marginLeft: 8, color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); closeTab(tab.id); if(tabs.length === 1) setIsTabMenuOpen(false); }} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* --- TAB CONTENT --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        {statusBar}
        <TabPaneFrame>
        {activeTab?.kind === 'search' && librarySearch && (
          <ProductSearchView
            embedded
            items={items}
            collections={collections}
            state={librarySearch.state}
            onQueryChange={librarySearch.setQuery}
            onFiltersChange={librarySearch.setFilters}
            onModeChange={librarySearch.setMode}
            onSelectedItemIdChange={librarySearch.setSelectedItemId}
            onRunSearch={librarySearch.runSearch}
            onOpenItem={onOpenItemFromSearch ?? (() => {})}
            autofocus={false}
          />
        )}
        {activeTab?.kind === 'search' && !librarySearch && (
          <div style={{ padding: 20, color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
            Search is unavailable.
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
                padding: '16px 20px',
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
              />
            </div>
          ) : (
          <TabScrollShell
            style={{ padding: '16px 20px', background: 'var(--bg)' }}
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
}

const ItemDetail: React.FC<ItemDetailProps> = ({
  item, collections, projects, isEditing, editTitle, editUrl, editNotes,
  onEditTitleChange, onEditUrlChange, onEditNotesChange,
  onStartEdit, onUndoEdit, onDoneEdit, onSaveEdit, editDirty = false, editSavedFlash = false,
  onDelete, onTogglePin, onToggleFavorite, canEdit,
  onUpdateOrganization,
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
  };

  return (
    <div style={{ height: '100%', minHeight: 0, width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: isNote ? 10 : 14 }}>
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
                <span style={{ fontSize: 'var(--text-xs)', color: '#ef4444', fontWeight: 600 }}>In trash</span>
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
                color: item.favoriteAt ? '#ef4444' : 'var(--text)',
                background: item.favoriteAt ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
              }}
            >
              <Star size={14} fill={item.favoriteAt ? '#ef4444' : 'none'} />
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
                <button type="button" onClick={onDelete} style={{ ...btnStyle('secondary'), color: '#ef4444' }}>
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
                <button type="button" onClick={onDelete} style={{ ...btnStyle('secondary'), color: '#ef4444' }}>
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
          editable={canEdit && isEditing && !isTrashed && !!onUpdateOrganization}
          compact
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
  const { context } = useItemPipelineContext(itemId);
  const badge = context ? resolvePipelineBadge(context) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {badge && (
        <div>
          <ItemPipelineBadge badge={badge} />
        </div>
      )}
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
  color: variant === 'primary' ? '#fff' : 'var(--text)',
});
