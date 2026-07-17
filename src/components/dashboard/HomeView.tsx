import React, { useMemo } from 'react';
import { Search, Star, Clock, Zap, BarChart2, Pin, Trash2, Home as HomeIcon, Folder, ChevronRight, GripVertical, X } from 'lucide-react';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import type { Item, Collection, Project, UpdateItemOptions } from '../../lib/db';
import { getHomeQuickAccessItems } from '../../lib/itemQuickAccess';
import { GlobalTabSystem, type GlobalTabState, type GlobalTabList } from './GlobalTabSystem';
import { ItemContextMenu } from './ItemContextMenu';
import { useLibrarySearch } from '../../hooks/useLibrarySearch';
import { useHomePipelineStats } from '../../hooks/useHomePipelineStats';
import type { PipelineQueueKind, ProcessingDigest, PipelineMaintenanceSnapshot } from '../../lib/pipeline';
import { MIN_DISCOVER_POOL } from '../../lib/categorization/discoverPolicy';
import { loadItemIdsForCategory, loadItemIdsForPipelineQueue, PIPELINE_QUEUE_LABELS, PIPELINE_QUEUE_HINTS } from '../../lib/pipeline';
import { LibraryLoadingPlaceholder } from './LibraryLoadingPlaceholder';
import { ProductSearchView } from './ProductSearchView';
import { getHomeScopeItems, getProjectCollections, getProjectHomeSummary, reorderProjectSwitcher } from './homeScope';
import { ProjectHomeWorkspace } from './ProjectHomeWorkspace';

type LibrarySearchApi = ReturnType<typeof useLibrarySearch>;

const RECENTLY_ADDED_LIMIT = 15;
const RECENT_SEARCH_LIMIT = 6;

// ===== Props =====
interface HomeViewProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  homeState: GlobalTabState;
  onHomeStateChange: (next: GlobalTabState) => void;
  onUpdateItem?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>, options?: UpdateItemOptions) => Promise<void>;
  onDeleteBookmark?: (id: string, collectionId?: string) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onLibrarySearchInTab?: (query: string) => void;
  librarySearch?: LibrarySearchApi;
  workingSearch?: LibrarySearchApi;
  onOpenItemFromSearch?: (item: Item, origin?: { projectId?: string; collectionId?: string }) => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  onBatchProcessQueue?: (kind: PipelineQueueKind) => Promise<void>;
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
  renderListTab?: (tab: any) => React.ReactNode;
  statusBar?: React.ReactNode;
  libraryLoading?: boolean;
  libraryHydrateProgress?: { label: string; percent?: number } | null;
}

export const HomeView: React.FC<HomeViewProps> = ({
  items, collections, projects, homeState, onHomeStateChange, onUpdateItem, onDeleteBookmark, onCreateProject, onCreateCollection, searchQuery, onSearchQueryChange, onLibrarySearchInTab, librarySearch, workingSearch, onOpenItemFromSearch, onBatchProcessQueue, onOpenPipelineHub, batchRunning = false, batchCancellable = false, onCancelBatch, scopeProjectId = 'all', scopeCollectionId = 'all', recentProjectIds = [], onSelectProjectScope, onReorderProjectScopes, onCloseProjectScope, onSelectCollectionScope, onResetScope, onSwitchScopeForItem, renderListTab, statusBar, libraryLoading = false, libraryHydrateProgress = null
}) => {
  const {
    digest,
    maintenance,
    categories,
    loading: pipelineLoading,
    classifyRunnable,
    classifyRunnableLoading,
  } = useHomePipelineStats();
  const showPipelineCardsLoading = libraryLoading || pipelineLoading;
  const [homeItemContextMenu, setHomeItemContextMenu] = React.useState<{
    item: Item;
    x: number;
    y: number;
  } | null>(null);
  const [draggedProjectId, setDraggedProjectId] = React.useState<string | null>(null);

  const handleProcessNotEnriched = () => {
    if (!onBatchProcessQueue || batchRunning || !digest?.notEnriched) return;
    void onBatchProcessQueue('not_enriched');
  };

  const handleClassifyReady = () => {
    if (!onBatchProcessQueue || batchRunning || !digest?.pendingClassify) return;
    void onBatchProcessQueue('pending_classify');
  };

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
  const projectSummaries = useMemo(
    () =>
      [...projects]
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 6)
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

  const quickAccessItems = useMemo(() => getHomeQuickAccessItems(scopedItems, 8), [scopedItems]);
  const recentSearches = librarySearch?.state.recentQueries.slice(0, RECENT_SEARCH_LIMIT) ?? [];

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
      onHomeStateChange({ ...homeState, activeTabId: id });
      return;
    }
    onHomeStateChange({
      ...homeState,
      tabs: [
        ...homeState.tabs,
        { kind: 'list' as const, id, listType: meta.listType, title: meta.title, ...currentTabScope },
      ],
      activeTabId: id,
    });
  };

  const openItemTab = (item: Item) => {
    const existing = homeState.tabs.find(
      (tab) =>
        tab.kind === 'item' &&
        tab.itemId === item.id &&
        (tab.scopeProjectId ?? 'all') === scopeProjectId
    );
    if (existing) { onHomeStateChange({ ...homeState, activeTabId: existing.id }); return; }
    const id = scopedTabId('item-' + item.id);
    // ensure new tab is at the end
    const nextTabs = [...homeState.tabs, { kind: 'item' as const, id, itemId: item.id, ...currentTabScope }];
    onHomeStateChange({ ...homeState, tabs: nextTabs, activeTabId: id });
  };

  const openCategoryBrowseTab = async (categoryId: string, name: string) => {
    const itemIds = await loadItemIdsForCategory(categoryId);
    const tabId = scopedTabId(`category-${categoryId}`);
    const existing = homeState.tabs.find((t) => t.id === tabId);
    if (existing) {
      onHomeStateChange({ ...homeState, activeTabId: tabId });
      return;
    }
    onHomeStateChange({
      ...homeState,
      tabs: [
        ...homeState.tabs,
        {
          kind: 'list' as const,
          id: tabId,
          listType: 'bookmark-list' as const,
          title: name,
          itemIds,
          ...currentTabScope,
        },
      ],
      activeTabId: tabId,
    });
  };

  const openPipelineBrowseTab = async (kind: PipelineQueueKind) => {
    const itemIds = await loadItemIdsForPipelineQueue(kind);
    const title = PIPELINE_QUEUE_LABELS[kind];
    const tabId = scopedTabId(`pipeline-${kind}`);
    const existing = homeState.tabs.find((t) => t.id === tabId);
    if (existing) {
      onHomeStateChange({ ...homeState, activeTabId: tabId });
      return;
    }
    onHomeStateChange({
      ...homeState,
      tabs: [
        ...homeState.tabs,
        {
          kind: 'list' as const,
          id: tabId,
          listType: 'bookmark-list' as const,
          title,
          itemIds,
          ...currentTabScope,
        },
      ],
      activeTabId: tabId,
    });
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

  const reopenRecentSearch = (query: string) => {
    if (!librarySearch) return;
    librarySearch.openSearch({
      query,
      filters: {
        projectId: scopeProjectId === 'all' ? undefined : scopeProjectId,
        collectionId: scopeCollectionId === 'all' ? undefined : scopeCollectionId,
      },
      mode: 'hybrid',
    });
    onSearchQueryChange(query);
    onHomeStateChange({
      ...homeState,
      activeTabId: null,
      homeSection: 'search',
      searchQuery: query,
    });
  };

  const homeSection = homeState.homeSection === 'search' ? 'search' : 'overview';
  const selectHomeSection = (section: 'overview' | 'search') => {
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
          collections={projectCollections}
          selectedCollectionId={scopeCollectionId}
          onSelectCollection={(collectionId) => {
            if (collectionId === 'all') openProjectScope(activeProject.id);
            else openCollectionScope(collectionId, activeProject.id);
          }}
          onOpenItem={openItemTab}
          onOpenSearch={() => selectHomeSection('search')}
          onUpdateItem={onUpdateItem}
        />
      ) : (
      <div
        style={{
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          alignItems: 'center',
        }}
        className="scrollbar"
      >
        {/* Hero search */}
        <div style={{ maxWidth: 640, width: '100%' }}>
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

        {scopeProjectId === 'all' && projectSummaries.length > 0 && (
          <section style={{ width: '100%', maxWidth: 1000 }} aria-labelledby="home-projects-heading">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <div>
                <h2 id="home-projects-heading" style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--text)', fontWeight: 650 }}>
                  Your projects
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                  Choose a project to focus Home and Search.
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
              {projectSummaries.map(({ project, collectionCount, itemCount }) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => openProjectScope(project.id)}
                  style={scopeLauncherStyle}
                >
                  <Folder size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.name}
                    </span>
                    <span style={{ display: 'block', color: 'var(--text-faint)', fontSize: 'var(--text-xs)', marginTop: 3 }}>
                      {itemCount} item{itemCount !== 1 ? 's' : ''} · {collectionCount} collection{collectionCount !== 1 ? 's' : ''}
                    </span>
                  </span>
                  <ChevronRight size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Quick access links */}
        {scopeProjectId === 'all' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 640, width: '100%' }}>
          {(
            [
              { id: 'util-pinned' as const, label: 'Pinned', Icon: Pin },
              { id: 'util-favorites' as const, label: 'Favorites', Icon: Star },
              { id: 'util-recent' as const, label: 'Recent', Icon: Clock },
              { id: 'util-trash' as const, label: 'Trash', Icon: Trash2 },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => openUtilityTab(id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-panel)',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        )}

        {libraryLoading ? (
          <div style={{ width: '100%', maxWidth: 1000 }}>
            <LibraryLoadingPlaceholder
              message="Loading library…"
              progress={libraryHydrateProgress}
            />
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, width: '100%', maxWidth: 1000 }}>
          <HomeCard
            icon={<Star size={14} />}
            title="Favorites & pins"
            headerExtra={
              quickAccessItems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => openUtilityTab('util-quick-access')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--accent)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                  }}
                >
                  View all
                </button>
              ) : null
            }
          >
            {quickAccessItems.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                Star or pin items to see them here.<br />Right-click any item &rarr; Add to favorites or Pin.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
                {quickAccessItems.map((item) => {
                  const tabId = scopedTabId('item-' + item.id);
                  const isActive = homeState.activeTabId === tabId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => openItemTab(item)}
                      onContextMenu={(e) => showHomeItemContextMenu(e, item)}
                      title={item.title || 'Untitled'}
                      style={{
                        background: isActive ? 'var(--bg-active)' : 'none',
                        border: 'none',
                        padding: '4px 6px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: isActive ? 'var(--accent)' : 'var(--text)',
                        fontSize: 'var(--text-xs)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--accent)'; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text)'; }}
                    >
                      <ItemQuickAccessMarkers item={item} size={10} />
                      {item.title || 'Untitled'}
                    </button>
                  );
                })}
              </div>
            )}
          </HomeCard>

          <HomeCard icon={<Clock size={14} />} title="Recently Added">
            {recentItems.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>Add your first bookmark or note.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
                {recentItems.map(item => {
                  const tabId = scopedTabId('item-' + item.id);
                  const isActive = homeState.activeTabId === tabId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => openItemTab(item)}
                      onContextMenu={(e) => showHomeItemContextMenu(e, item)}
                      title={item.title || 'Untitled'}
                      style={{ background: isActive ? 'var(--bg-active)' : 'none', border: 'none', padding: '4px 6px', textAlign: 'left', cursor: 'pointer', color: isActive ? 'var(--accent)' : 'var(--text)', fontSize: 'var(--text-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 'var(--radius-sm)' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text)'; }}
                    >
                      {item.title || 'Untitled'}
                    </button>
                  );
                })}
              </div>
            )}
          </HomeCard>

          <HomeCard
            icon={<Search size={14} />}
            title="Recent searches"
            headerExtra={
              recentSearches.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => selectHomeSection('search')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--accent)',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => librarySearch?.clearRecentQueries()}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--text-faint)',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : null
            }
          >
            {recentSearches.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                Your recent library searches will appear here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
                {recentSearches.map((query) => (
                  <button
                    key={query}
                    type="button"
                    onClick={() => reopenRecentSearch(query)}
                    title={`Search again for ${query}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '4px 6px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--text)',
                      fontSize: 'var(--text-xs)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.color = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none';
                      e.currentTarget.style.color = 'var(--text)';
                    }}
                  >
                    <Search size={11} style={{ flexShrink: 0, color: 'var(--text-faint)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {query}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </HomeCard>

          {scopeProjectId === 'all' && (
          <HomeCard icon={<Zap size={14} />} title="Processing Digest">
            {showPipelineCardsLoading ? (
              <LibraryLoadingPlaceholder variant="inline" message="Loading…" />
            ) : digest?.healthy ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                All caught up — library processing looks healthy.
              </div>
            ) : digest ? (
              <ProcessingDigestBody
                digest={digest}
                maintenance={maintenance}
                classifyRunnable={classifyRunnable}
                classifyRunnableLoading={classifyRunnableLoading}
                onBrowsePipelineQueue={(kind) => void openPipelineBrowseTab(kind)}
                onBatchProcessQueue={onBatchProcessQueue}
                onOpenPipelineHub={onOpenPipelineHub}
                batchRunning={batchRunning}
                batchCancellable={batchCancellable}
                onCancelBatch={onCancelBatch}
                onProcessNotEnriched={handleProcessNotEnriched}
                onClassifyReady={handleClassifyReady}
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                No processing data yet.
              </div>
            )}
          </HomeCard>
          )}

          {scopeProjectId === 'all' && (
          <HomeCard icon={<BarChart2 size={14} />} title="Library Overview">
            {showPipelineCardsLoading ? (
              <LibraryLoadingPlaceholder variant="inline" message="Loading…" />
            ) : categories.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                No AI categories with items yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {categories.map((tile) => (
                  <button
                    key={tile.categoryId}
                    type="button"
                    onClick={() => void openCategoryBrowseTab(tile.categoryId, tile.name)}
                    title={`Open ${tile.name} on Home`}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '5px 8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--text)',
                      fontSize: 'var(--text-xs)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none';
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tile.name}
                    </span>
                    <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>{tile.itemCount}</span>
                  </button>
                ))}
              </div>
            )}
          </HomeCard>
          )}
        </div>
        )}

        {scopedItems.length > 0 && !libraryLoading && (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginTop: 16 }}>
            {scopedItems.length} item{scopedItems.length !== 1 ? 's' : ''} in {scopeLabel}
          </div>
        )}
      </div>
      ) : librarySearch ? (
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
          onOpenItem={openItemTab}
          onClearRecentQueries={librarySearch.clearRecentQueries}
          scopeLabel={scopeProjectId === 'all' ? undefined : scopeLabel}
          showOpenInTab
          onOpenInTab={() => onLibrarySearchInTab?.(librarySearch.state.query)}
        />
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

  if (homeState.tabs.length === 0) {
    return (
      <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {workspaceHeader}
        <div style={{ flex: 1, minHeight: 0 }}>{homeContent}</div>
      </div>
    );
  }

  return (
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
      workspaceHeader={workspaceHeader}
      homeContent={homeContent}
    />
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

const scopeLauncherStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '11px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-panel)',
  boxShadow: 'var(--shadow-sm)',
  textAlign: 'left',
  cursor: 'pointer',
};

// ===== Shared card =====
interface HomeCardProps { icon: React.ReactNode; title: string; children: React.ReactNode; headerExtra?: React.ReactNode; }
const HomeCard: React.FC<HomeCardProps> = ({ icon, title, children, headerExtra }) => (
  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 70 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>{icon}{title}</div>
      {headerExtra}
    </div>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);

const DigestLine: React.FC<{
  label: string;
  count: number;
  tone: 'warning' | 'error' | 'info' | 'muted';
  onBrowse?: () => void;
  hint?: string;
  deemphasized?: boolean;
  countSuffix?: string;
}> = ({ label, count, tone, onBrowse, hint, deemphasized, countSuffix }) => {
  if (count === 0) return null;

  const color =
    tone === 'warning'
      ? '#d29922'
      : tone === 'error'
        ? '#ef4444'
        : tone === 'info'
          ? '#818cf8'
          : 'var(--text-muted)';

  const row = (
    <>
      <span style={deemphasized ? { color: 'var(--text-faint)' } : undefined}>{label}</span>
      <span style={{ fontWeight: deemphasized ? 500 : 600, color: deemphasized ? 'var(--text-faint)' : color }}>
        {count}
        {countSuffix ? (
          <span style={{ fontWeight: 500, color: 'var(--text-faint)' }}>{countSuffix}</span>
        ) : null}
      </span>
    </>
  );

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 'var(--text-xs)',
    color: deemphasized ? 'var(--text-faint)' : 'var(--text-muted)',
    opacity: deemphasized ? 0.85 : 1,
  };

  if (!onBrowse) {
    return (
      <div style={rowStyle} title={hint}>
        {row}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onBrowse}
      title={hint ?? `Browse ${label.toLowerCase()}`}
      style={{
        all: 'unset',
        ...rowStyle,
        width: '100%',
        cursor: 'pointer',
        padding: '3px 6px',
        margin: '0 -6px',
        borderRadius: 'var(--radius-sm)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)';
        e.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = deemphasized ? 'var(--text-faint)' : 'var(--text-muted)';
      }}
    >
      {row}
    </button>
  );
};

const digestCalloutStyle: React.CSSProperties = {
  margin: '4px 6px 0',
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-glass)',
  border: '1px solid var(--border)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  lineHeight: 1.5,
};

interface ProcessingDigestBodyProps {
  digest: ProcessingDigest;
  maintenance?: PipelineMaintenanceSnapshot | null;
  classifyRunnable?: number | null;
  classifyRunnableLoading?: boolean;
  onBrowsePipelineQueue?: (kind: PipelineQueueKind) => void;
  onBatchProcessQueue?: (kind: PipelineQueueKind) => Promise<void>;
  onOpenPipelineHub?: () => void;
  batchRunning: boolean;
  batchCancellable?: boolean;
  onCancelBatch?: () => void;
  onProcessNotEnriched: () => void;
  onClassifyReady: () => void;
}

const ACTIONABLE_DIGEST_LINES: Array<{
  kind: PipelineQueueKind;
  countKey: keyof Pick<
    ProcessingDigest,
    'suggestedCategories' | 'manualReview' | 'enrichFailed' | 'pendingClassify'
  >;
  tone: 'warning' | 'error' | 'info';
}> = [
  { kind: 'suggested_categories', countKey: 'suggestedCategories', tone: 'warning' },
  { kind: 'manual_review', countKey: 'manualReview', tone: 'warning' },
  { kind: 'enrich_failed', countKey: 'enrichFailed', tone: 'error' },
  { kind: 'pending_classify', countKey: 'pendingClassify', tone: 'info' },
];

const ProcessingDigestBody: React.FC<ProcessingDigestBodyProps> = ({
  digest,
  maintenance,
  classifyRunnable = null,
  classifyRunnableLoading = false,
  onBrowsePipelineQueue,
  onBatchProcessQueue,
  onOpenPipelineHub,
  batchRunning,
  batchCancellable,
  onCancelBatch,
  onProcessNotEnriched,
  onClassifyReady,
}) => {
  const hasActionable = ACTIONABLE_DIGEST_LINES.some((line) => digest[line.countKey] > 0);
  const queueTotal = digest.pendingClassify;
  const runnableKnown = classifyRunnable !== null && !classifyRunnableLoading;
  const runnableCount = classifyRunnable ?? 0;
  const queuedButBlocked = runnableKnown ? Math.max(0, queueTotal - runnableCount) : null;
  const batchButtonStyle = (disabled: boolean): React.CSSProperties => ({
    marginTop: 4,
    padding: '5px 8px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: disabled ? 'var(--bg-hover)' : 'transparent',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    width: 'fit-content',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
      {ACTIONABLE_DIGEST_LINES.map(({ kind, countKey, tone }) => (
        <React.Fragment key={kind}>
          <DigestLine
            label={PIPELINE_QUEUE_LABELS[kind]}
            count={digest[countKey]}
            tone={tone}
            hint={
              kind === 'enrich_failed' && digest.enrichFailedBreakdown
                ? `${PIPELINE_QUEUE_HINTS[kind]} — ${digest.enrichFailedBreakdown}`
                : PIPELINE_QUEUE_HINTS[kind]
            }
            onBrowse={onBrowsePipelineQueue ? () => onBrowsePipelineQueue(kind) : undefined}
            countSuffix={
              kind === 'pending_classify' && runnableKnown && queueTotal > 0
                ? ` · ${runnableCount} AI-ready`
                : undefined
            }
          />
          {kind === 'pending_classify' && queueTotal > 0 ? (
            <div style={digestCalloutStyle}>
              {classifyRunnableLoading ? (
                <span style={{ color: 'var(--text-faint)' }}>Checking which items can run AI…</span>
              ) : runnableKnown ? (
                <>
                  <strong style={{ color: 'var(--text)' }}>{runnableCount}</strong> of{' '}
                  <strong style={{ color: 'var(--text)' }}>{queueTotal}</strong> in this queue can run AI
                  classification now.
                  {queuedButBlocked && queuedButBlocked > 0 ? (
                    <>
                      {' '}
                      The other <strong style={{ color: 'var(--text)' }}>{queuedButBlocked}</strong> are blocked
                      (unchanged text, ineligible, or waiting on discover / general topic).
                    </>
                  ) : null}{' '}
                  Running classify may still leave items here if AI picks general/Other or needs discover.
                </>
              ) : (
                <>
                  This count is the <strong style={{ color: 'var(--text)' }}>queue</strong>, not a promise that every
                  item will run AI. Use the button below to review the checklist before confirming.
                </>
              )}
            </div>
          ) : null}
        </React.Fragment>
      ))}

      {digest.pendingClassify > 0 && onBatchProcessQueue ? (
        <button
          type="button"
          onClick={onClassifyReady}
          disabled={batchRunning || (runnableKnown && runnableCount === 0)}
          title={
            runnableKnown && runnableCount === 0
              ? 'Nothing in the queue can run AI right now — browse the list for details'
              : 'Review items, then confirm which run AI classification'
          }
          style={batchButtonStyle(batchRunning || (runnableKnown && runnableCount === 0))}
        >
          {batchRunning
            ? 'Processing…'
            : classifyRunnableLoading
              ? 'Review classify queue…'
              : runnableKnown
                ? `Review & classify (${runnableCount} AI-ready)`
                : `Review classify queue (${queueTotal})`}
        </button>
      ) : null}

      {maintenance &&
      onOpenPipelineHub &&
      (maintenance.discoverPool.stuckPool >= MIN_DISCOVER_POOL ||
        maintenance.queue.pendingDiscover > 0) ? (
        <div
          style={{
            ...digestCalloutStyle,
            borderLeft: '3px solid var(--er-warn, #d29922)',
            paddingLeft: 10,
          }}
        >
          <strong style={{ color: 'var(--text)' }}>{maintenance.discoverPool.stuckPool}</strong> bookmarks
          staged for discover (General/Other or unassigned)
          {maintenance.queue.pendingDiscover > 0 ? (
            <>
              {' '}
              (<strong style={{ color: 'var(--text)' }}>{maintenance.queue.pendingDiscover}</strong> marked
              pending discover)
            </>
          ) : null}
          . Nothing runs until you confirm in the Hub — discover can propose new taxonomy topics (uses AI).{' '}
          <button
            type="button"
            onClick={onOpenPipelineHub}
            style={{
              marginTop: 6,
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--er-warn, #d29922)',
              background: 'color-mix(in srgb, var(--er-warn, #d29922) 15%, transparent)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Review & run discover
          </button>
        </div>
      ) : null}

      {digest.notEnriched > 0 && (
        <>
          {hasActionable && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                marginTop: 4,
                paddingTop: 4,
              }}
            />
          )}
          <DigestLine
            label={PIPELINE_QUEUE_LABELS.not_enriched}
            count={digest.notEnriched}
            tone="muted"
            hint={PIPELINE_QUEUE_HINTS.not_enriched}
            deemphasized={hasActionable}
            onBrowse={onBrowsePipelineQueue ? () => onBrowsePipelineQueue('not_enriched') : undefined}
          />
          {onBatchProcessQueue ? (
            <button
              type="button"
              onClick={onProcessNotEnriched}
              disabled={batchRunning}
              style={batchButtonStyle(batchRunning)}
            >
              {batchRunning
                ? 'Processing…'
                : `Process not enriched (${digest.notEnriched})`}
            </button>
          ) : null}
        </>
      )}

      {batchRunning && batchCancellable && onCancelBatch ? (
        <button
          type="button"
          onClick={onCancelBatch}
          style={{
            ...batchButtonStyle(false),
            color: 'var(--text)',
            borderColor: 'var(--accent)',
          }}
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
};
