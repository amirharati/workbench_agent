import React from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, FileText, Folder, Layers3, Link2, List, Maximize2, Search, Star, Trash2, Workflow } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import type { GlobalTab } from './GlobalTabSystem';
import { ActiveWorkspaceCard } from './ActiveWorkspaceCard';
import { ContentBrowser, useContentBrowseMode } from './ContentBrowser';
import type { HomeProjectSummary } from './HomeBrowsePanel';
import { ItemWorkspace } from './ItemWorkspace';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import { uiPatterns } from '../../styles/uiPatterns';
import { WorkspaceDestinationPicker } from './WorkspaceDestinationPicker';
import type { WorkspaceDestination } from './workspaceDestinations';

export interface WorkspaceViewGroup {
  key: string;
  title: string;
  contextLabel: string;
  projectId: string | 'all';
  tabs: GlobalTab[];
}

interface AllLibraryWorkspaceOverviewProps {
  groups: WorkspaceViewGroup[];
  selectedView: string;
  onSelectedViewChange: (key: string) => void;
  selectedTab: GlobalTab | null;
  selectedItem: Item | null;
  items: Item[];
  projects: Project[];
  collections: Collection[];
  onSelectTab: (tab: GlobalTab) => void;
  onRemoveGlobalTab: (tabId: string) => void;
  onFocusTab: (tab: GlobalTab) => void;
  onFocusGlobal: () => void;
  workspaceDestinations?: WorkspaceDestination[];
  recentWorkspaceDestinationKeys?: readonly string[];
  isItemInWorkspace?: (item: Item, destination: WorkspaceDestination) => boolean;
  onAddItemToWorkspace?: (item: Item, destination: WorkspaceDestination) => void;
  onViewSearch: (tab: GlobalTab) => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  getEntryScopeLabel?: (tab: GlobalTab) => string | undefined;
  projectSummaries?: HomeProjectSummary[];
  recentProjectAccessIds?: string[];
  quickAccessItems?: Item[];
  totalItems?: number;
  onOpenProject?: (projectId: string) => void;
  onSelectItem?: (item: Item) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: Item) => void;
  onClearSelection?: () => void;
  onOpenTrash?: () => void;
  onOpenPipeline?: () => void;
  initialView?: AllLibraryView;
  onActiveViewChange?: (view: AllLibraryView) => void;
  initialProjectQuery?: string;
  onProjectQueryChange?: (query: string) => void;
  initialItemFilter?: AllLibraryItemFilter;
  onItemFilterChange?: (filter: AllLibraryItemFilter) => void;
}

export type AllLibraryView = 'all' | 'quick-access' | 'workspace';
export type AllLibraryItemFilter = 'all' | 'links' | 'notes';
export type ProjectLauncherFilter = 'all' | 'recent';

export function normalizeAllLibraryView(value: unknown): AllLibraryView {
  return value === 'quick-access' || value === 'workspace' ? value : 'all';
}

export function normalizeAllLibraryItemFilter(value: unknown): AllLibraryItemFilter {
  return value === 'links' || value === 'notes' ? value : 'all';
}

export function getVisibleProjectSummaries(
  projectSummaries: HomeProjectSummary[],
  recentProjectAccessIds: string[],
  filter: ProjectLauncherFilter,
  query: string
): HomeProjectSummary[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery) {
    return projectSummaries.filter(({ project }) =>
      `${project.name} ${project.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
    );
  }
  if (filter === 'recent') {
    const summariesById = new Map(projectSummaries.map((summary) => [summary.project.id, summary]));
    return recentProjectAccessIds
      .map((projectId) => summariesById.get(projectId))
      .filter((summary): summary is HomeProjectSummary => summary != null);
  }
  return projectSummaries;
}

function searchScopeLabel(tab: GlobalTab, projects: Project[], collections: Collection[]): string {
  if (tab.kind !== 'search') return '';
  if (tab.filters?.collectionId) {
    return collections.find((collection) => collection.id === tab.filters?.collectionId)?.name ?? 'Collection';
  }
  if (tab.filters?.projectId) {
    return projects.find((project) => project.id === tab.filters?.projectId)?.name ?? 'Project';
  }
  return 'All Library';
}

export const AllLibraryWorkspaceOverview: React.FC<AllLibraryWorkspaceOverviewProps> = ({
  groups,
  selectedView,
  onSelectedViewChange,
  selectedTab,
  selectedItem,
  items,
  projects,
  collections,
  onSelectTab,
  onRemoveGlobalTab,
  onFocusTab,
  onFocusGlobal,
  workspaceDestinations = [],
  recentWorkspaceDestinationKeys,
  isItemInWorkspace = () => false,
  onAddItemToWorkspace = () => {},
  onViewSearch,
  onUpdateItem,
  onCreateProject,
  onCreateCollection,
  getEntryScopeLabel,
  projectSummaries = [],
  recentProjectAccessIds = [],
  quickAccessItems = [],
  totalItems = items.length,
  onOpenProject,
  onSelectItem,
  onItemContextMenu,
  onClearSelection,
  onOpenTrash,
  onOpenPipeline,
  initialView = 'all',
  onActiveViewChange,
  initialProjectQuery = '',
  onProjectQueryChange,
  initialItemFilter = 'all',
  onItemFilterChange,
}) => {
  const [activeView, setActiveView] = React.useState<AllLibraryView>(() => normalizeAllLibraryView(initialView));
  const [projectQuery, setProjectQuery] = React.useState(initialProjectQuery);
  const [projectBrowserOpen, setProjectBrowserOpen] = React.useState(() => initialProjectQuery.trim().length > 0);
  const [itemFilter, setItemFilter] = React.useState<AllLibraryItemFilter>(() => normalizeAllLibraryItemFilter(initialItemFilter));
  const [browseMode, setBrowseMode] = useContentBrowseMode('workbench:home-all-library-content-view');
  const projectSwitcherRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (!projectBrowserOpen || typeof document === 'undefined') return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!projectSwitcherRef.current?.contains(event.target as Node)) setProjectBrowserOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProjectBrowserOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [projectBrowserOpen]);
  const recentProjectSummaries = getVisibleProjectSummaries(
    projectSummaries,
    recentProjectAccessIds,
    'recent',
    ''
  );
  const visibleProjectSummaries = getVisibleProjectSummaries(
    projectSummaries,
    recentProjectAccessIds,
    'all',
    projectQuery
  );
  const quickProjectSummaries = (
    recentProjectSummaries.length > 0 ? recentProjectSummaries : projectSummaries
  ).slice(0, 6);
  const visibleGroups = selectedView === 'all-active'
    ? groups.filter((group) => group.tabs.length > 0)
    : groups.filter((group) => group.key === selectedView);
  const activeSelectedTab = activeView === 'workspace' ? selectedTab : null;
  const previewItem = activeView === 'workspace'
    ? activeSelectedTab?.kind === 'item'
      ? items.find((item) => item.id === activeSelectedTab.itemId) ?? null
      : null
    : activeView === 'all' || activeView === 'quick-access'
      ? selectedItem
      : null;
  const selectedTabProjectId = activeSelectedTab?.scopeProjectId ?? 'all';
  const sortedLibraryItems = React.useMemo(
    () => [...items].sort((a, b) => (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at)),
    [items]
  );
  const visibleItems = activeView === 'all'
    ? sortedLibraryItems.filter((item) => itemFilter === 'all' || (itemFilter === 'links' ? Boolean(item.url) : !item.url))
    : quickAccessItems;
  const browseEntries = visibleItems.map((item) => ({
        id: item.id,
        title: item.title || 'Untitled',
        icon: (
          <span className="ui-content-browser__item-kind">
            {item.url ? <Link2 size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />}
            <ItemQuickAccessMarkers item={item} size={9} />
          </span>
        ),
        subtitle: item.url || item.notes || 'Note',
        meta: new Date(item.updated_at ?? item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        onContextMenu: onItemContextMenu ? (event: React.MouseEvent) => onItemContextMenu(event, item) : undefined,
      }));
  const selectView = (view: AllLibraryView) => {
    setActiveView(view);
    onActiveViewChange?.(view);
    onClearSelection?.();
  };
  const selectBrowseEntry = (id: string) => {
    const item = visibleItems.find((candidate) => candidate.id === id);
    if (item) onSelectItem?.(item);
  };
  const selectItemFilter = (filter: AllLibraryItemFilter) => {
    setItemFilter(filter);
    onItemFilterChange?.(filter);
    onClearSelection?.();
  };

  return (
    <section className="ui-all-library-workspace" style={{ width: '100%', maxWidth: 1180, minHeight: 0, display: 'flex', flexDirection: 'column' }} aria-label="All Library workspace">
      <div className="ui-all-library-controlbar">
      <section ref={projectSwitcherRef} className="ui-project-switcher" data-expanded={projectBrowserOpen ? 'true' : 'false'} aria-labelledby="all-library-projects-heading">
        <div className="ui-project-switcher__row">
          <h2 className="ui-project-switcher__title" id="all-library-projects-heading">
            <Folder size={13} /> Recent projects
          </h2>
          <div className="ui-project-switcher__quick-list hide-scrollbar" aria-label="Recent project navigation">
            {quickProjectSummaries.length === 0 ? (
              <span className="ui-project-switcher__empty">No projects yet</span>
            ) : quickProjectSummaries.map(({ project, itemCount }) => (
              <button
                key={project.id}
                className="ui-project-switcher__quick-project"
                type="button"
                onClick={() => { setProjectBrowserOpen(false); onOpenProject?.(project.id); }}
                aria-label={`Open ${project.name}`}
                title={`Open ${project.name}`}
              >
                <Folder size={12} aria-hidden="true" />
                <strong>{project.name}</strong>
                <span>{project.isDefault ? `${itemCount} incoming` : itemCount}</span>
              </button>
            ))}
          </div>
          <button
            className="ui-button ui-button--secondary ui-project-switcher__browse"
            type="button"
            aria-expanded={projectBrowserOpen}
            aria-controls="all-library-project-browser"
            onClick={() => setProjectBrowserOpen((open) => !open)}
          >
            All projects <span>{projectSummaries.length}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </div>
        {projectBrowserOpen ? <div className="ui-project-browser" id="all-library-project-browser">
          <div className="ui-project-launcher__controls">
          <label className="ui-project-launcher__search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              value={projectQuery}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setProjectQuery(nextQuery);
                onProjectQueryChange?.(nextQuery);
              }}
              placeholder="Search projects"
              aria-label="Search projects"
            />
          </label>
          </div>
          <div className="ui-project-launcher__grid scrollbar" aria-label="All project navigation">
          {projectSummaries.length === 0 ? (
            <div className="ui-project-launcher__empty">
              Create a project when related material needs a durable home.
            </div>
          ) : visibleProjectSummaries.length === 0 ? (
            <div className="ui-project-launcher__empty">
              {projectQuery.trim()
                ? `No projects match “${projectQuery.trim()}”.`
                : 'Projects you open will appear in Recent.'}
            </div>
          ) : visibleProjectSummaries.map(({ project, collectionCount, itemCount }) => (
            <button
              key={project.id}
              className="ui-project-launcher__project"
              type="button"
              onClick={() => { setProjectBrowserOpen(false); onOpenProject?.(project.id); }}
              aria-label={`Open ${project.name}`}
            >
              <span className="ui-project-launcher__icon" data-inbox={project.isDefault ? 'true' : 'false'}>
                <Folder size={14} />
              </span>
              <span className="ui-project-launcher__project-copy">
                <strong>{project.name}</strong>
                <span>
                  {project.isDefault
                    ? `${itemCount} incoming`
                    : `${itemCount} item${itemCount !== 1 ? 's' : ''} · ${collectionCount} collection${collectionCount !== 1 ? 's' : ''}`}
                </span>
              </span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ))}
          </div>
        </div> : null}
      </section>

      <div className="ui-tab-bar ui-all-library-tabs" data-all-library-view-tabs role="tablist" aria-label="All Library view" style={{ ...uiPatterns.tabBar, marginBottom: 0 }}>
        <button className="ui-view-tab" type="button" role="tab" aria-selected={activeView === 'all'} onClick={() => selectView('all')} style={viewTabStyle(activeView === 'all')}><List size={12} /> All items <span style={tabCountStyle}>{items.length}</span></button>
        <button className="ui-view-tab" type="button" role="tab" aria-selected={activeView === 'quick-access'} onClick={() => selectView('quick-access')} style={viewTabStyle(activeView === 'quick-access')}><Star size={12} /> Favorites &amp; pins <span style={tabCountStyle}>{quickAccessItems.length}</span></button>
        <div style={compoundTabStyle(activeView === 'workspace')}>
          <button type="button" role="tab" aria-selected={activeView === 'workspace'} onClick={() => selectView('workspace')} style={compoundTabButtonStyle}><Layers3 size={12} /> Workspace</button>
          <select
            value={selectedView}
            onChange={(event) => { setActiveView('workspace'); onActiveViewChange?.('workspace'); onSelectedViewChange(event.target.value); onClearSelection?.(); }}
            aria-label="Workspace view"
            style={tabSelectStyle}
          >
            <option value="global">Global workspace</option>
            <option value="all-active">All active workspaces</option>
            {groups.slice(1).map((group) => <option key={group.key} value={group.key}>{group.contextLabel} · {group.title}</option>)}
          </select>
        </div>
        <span className="ui-all-library-count" style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
        {onOpenPipeline && <button className="ui-button ui-button--secondary ui-all-library-utility" type="button" onClick={onOpenPipeline} style={secondaryButtonStyle} title="Processing" aria-label="Processing"><Workflow size={11} /> <span>Processing</span></button>}
        {onOpenTrash && <button className="ui-button ui-button--secondary ui-all-library-utility" type="button" onClick={onOpenTrash} style={secondaryButtonStyle} title="Trash" aria-label="Trash"><Trash2 size={11} /> <span>Trash</span></button>}
      </div>
      </div>

      <div
        className="ui-working-canvas ui-adaptive-browser"
        data-all-library-working-canvas
        data-detail-open={activeSelectedTab || previewItem ? 'true' : 'false'}
        style={{ height: 'clamp(430px, calc(100dvh - 180px), 720px)', minHeight: 360, display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(0, 1.35fr)', gap: 12 }}
      >
        {activeView === 'workspace' ? <div className="scrollbar" style={{ minWidth: 0, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleGroups.length === 0 ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
              No active workspace entries in this view.
            </div>
          ) : visibleGroups.map((group) => (
            <ActiveWorkspaceCard
              key={group.key}
              title={group.title}
              contextLabel={group.contextLabel}
              tabs={group.tabs}
              items={items}
              activeEntryId={activeSelectedTab?.id ?? null}
              emptyMessage={group.projectId === 'all' ? 'Select library material and add it to this cross-project working set.' : 'This project workspace is empty.'}
              onSelectEntry={onSelectTab}
              onRemoveEntry={onRemoveGlobalTab}
              onFocus={() => group.projectId === 'all' ? onFocusGlobal() : group.tabs[0] && onFocusTab(group.tabs[0])}
              getEntryScopeLabel={getEntryScopeLabel}
              allowRemove={group.projectId === 'all' && selectedView !== 'all-active'}
              showFocus={selectedView !== 'all-active'}
              maxListHeight={null}
            />
          ))}
        </div> : <ContentBrowser
          title={activeView === 'all' ? itemFilter === 'links' ? 'Links' : itemFilter === 'notes' ? 'Notes' : 'All items' : 'Favorites & pins'}
          entries={browseEntries}
          selectedId={previewItem?.id ?? null}
          onSelect={selectBrowseEntry}
          mode={browseMode}
          onModeChange={setBrowseMode}
          emptyMessage={activeView === 'quick-access' ? 'Favorite or pin items to keep them close.' : 'Newly captured material will appear here.'}
          ariaLabel="All Library material"
          headerActions={activeView === 'all' ? (
            <div className="ui-library-type-filter" role="group" aria-label="Filter All Library items">
              <button type="button" aria-pressed={itemFilter === 'all'} onClick={() => selectItemFilter('all')}>All</button>
              <button type="button" aria-pressed={itemFilter === 'links'} onClick={() => selectItemFilter('links')}><Link2 size={11} /> Links</button>
              <button type="button" aria-pressed={itemFilter === 'notes'} onClick={() => selectItemFilter('notes')}><FileText size={11} /> Notes</button>
            </div>
          ) : undefined}
        />}

        <div className="ui-panel ui-detail-panel" style={uiPatterns.panel}>
          <div className="ui-detail-panel__header" style={uiPatterns.panelHeader}>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 650, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {activeView === 'workspace' ? 'Workspace entry' : 'Item details'}
            </span>
            <div className="ui-detail-panel__actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="ui-button ui-button--secondary ui-adaptive-detail-back"
                type="button"
                onClick={onClearSelection}
                style={secondaryButtonStyle}
              >
                <ArrowLeft size={12} /> Browse
              </button>
              {activeSelectedTab ? (
                <button type="button" onClick={() => onFocusTab(activeSelectedTab)} style={primaryButtonStyle}><Maximize2 size={12} /> Focus</button>
              ) : previewItem ? (
                <WorkspaceDestinationPicker
                  item={previewItem}
                  destinations={workspaceDestinations}
                  recentDestinationKeys={recentWorkspaceDestinationKeys}
                  isAdded={(destination) => isItemInWorkspace(previewItem, destination)}
                  onAdd={(destination) => onAddItemToWorkspace(previewItem, destination)}
                />
              ) : null}
            </div>
          </div>

          {previewItem ? (
            <div className="scrollbar ui-scroll-footer-safe ui-detail-panel__body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 17 }}>
              <ItemWorkspace
                item={previewItem}
                projects={projects}
                collections={collections}
                onUpdateItem={onUpdateItem}
                onCreateProject={onCreateProject}
                onCreateCollection={onCreateCollection}
              />
            </div>
          ) : activeSelectedTab?.kind === 'search' ? (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 17 }}>
              <span style={previewIconStyle}><Search size={15} /></span>
              <h3 style={{ margin: '12px 0 0', color: 'var(--text)', fontSize: 'var(--text-lg)' }}>{activeSelectedTab.query || 'Search'}</h3>
              <p style={{ margin: '7px 0 15px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Saved search · {searchScopeLabel(activeSelectedTab, projects, collections)}</p>
              <button type="button" onClick={() => onViewSearch(activeSelectedTab)} style={secondaryButtonStyle}><Search size={12} /> View results</button>
            </div>
          ) : activeSelectedTab?.kind === 'url' ? (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 17 }}>
              <span style={previewIconStyle}><ExternalLink size={15} /></span>
              <h3 style={{ margin: '12px 0 0', color: 'var(--text)', fontSize: 'var(--text-lg)' }}>{activeSelectedTab.title || 'Web page'}</h3>
              <ExtensionPageUrlLink url={activeSelectedTab.url} style={{ display: 'inline-block', marginTop: 7, color: 'var(--accent)', fontSize: 'var(--text-sm)', overflowWrap: 'anywhere' }}>{activeSelectedTab.url}</ExtensionPageUrlLink>
              <p style={{ margin: '15px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{selectedTabProjectId === 'all' ? 'Global workspace' : projects.find((project) => project.id === selectedTabProjectId)?.name ?? 'Project workspace'}</p>
            </div>
          ) : activeSelectedTab ? (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', placeItems: 'center', padding: 24, color: 'var(--text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
              This entry uses its full interactive view in Focus.
            </div>
          ) : (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, color: 'var(--text-faint)', textAlign: 'center' }}>
              {activeView === 'workspace' ? <Layers3 size={23} /> : activeView === 'all' ? <List size={23} /> : <Star size={23} />}
              <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                {activeView === 'workspace' ? 'Select a workspace entry' : 'Select an item to inspect'}
              </strong>
              <span style={{ maxWidth: 300, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
                {activeView === 'workspace'
                  ? 'Choose active work to inspect it here, or use Focus for its full interactive view.'
                  : 'Selecting an item opens its editable details here. Adding it to a workspace is always a separate action.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const previewIconStyle: React.CSSProperties = { width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--accent-weak)', color: 'var(--accent)' };
const secondaryButtonStyle = uiPatterns.secondaryButton;
const primaryButtonStyle = uiPatterns.primaryButton;
const viewTabStyle = uiPatterns.viewTab;
const compoundTabStyle = (active: boolean): React.CSSProperties => ({ minHeight: 31, display: 'inline-flex', alignItems: 'stretch', overflow: 'hidden', border: active ? '1px solid var(--border-active)' : '1px solid transparent', borderRadius: 'var(--radius-sm)', background: active ? 'var(--accent-weak)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)' });
const compoundTabButtonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 8px 0 10px', border: 'none', background: 'transparent', color: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 650, cursor: 'pointer' };
const tabSelectStyle: React.CSSProperties = { minWidth: 128, maxWidth: 210, padding: '0 24px 0 7px', border: 'none', borderLeft: '1px solid var(--border)', background: 'transparent', color: 'inherit', fontSize: 'var(--text-xs)', outline: 'none', cursor: 'pointer' };
const tabCountStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: 10 };
