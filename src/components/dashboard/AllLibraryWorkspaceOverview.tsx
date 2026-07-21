import React from 'react';
import { Clock, ExternalLink, Folder, Layers3, Maximize2, Plus, Search, Star, Trash2, Workflow } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import type { GlobalTab } from './GlobalTabSystem';
import { ActiveWorkspaceCard } from './ActiveWorkspaceCard';
import { ContentBrowser, useContentBrowseMode } from './ContentBrowser';
import type { HomeProjectSummary } from './HomeBrowsePanel';
import { ItemWorkspace } from './ItemWorkspace';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import { uiPatterns } from '../../styles/uiPatterns';

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
  onAddItemToGlobal: (item: Item) => void;
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
  recentItems?: Item[];
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
}

export type AllLibraryView = 'projects' | 'recent' | 'quick-access' | 'workspace';

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
  onAddItemToGlobal,
  onViewSearch,
  onUpdateItem,
  onCreateProject,
  onCreateCollection,
  getEntryScopeLabel,
  projectSummaries = [],
  recentItems = [],
  quickAccessItems = [],
  totalItems = items.length,
  onOpenProject,
  onSelectItem,
  onItemContextMenu,
  onClearSelection,
  onOpenTrash,
  onOpenPipeline,
  initialView = 'projects',
  onActiveViewChange,
}) => {
  const [activeView, setActiveView] = React.useState<AllLibraryView>(initialView);
  const [browseMode, setBrowseMode] = useContentBrowseMode('workbench:home-all-library-content-view');
  const visibleGroups = selectedView === 'all-active'
    ? groups.filter((group) => group.tabs.length > 0)
    : groups.filter((group) => group.key === selectedView);
  const activeSelectedTab = activeView === 'workspace' ? selectedTab : null;
  const previewItem = activeView === 'workspace'
    ? activeSelectedTab?.kind === 'item'
      ? items.find((item) => item.id === activeSelectedTab.itemId) ?? null
      : null
    : activeView === 'recent' || activeView === 'quick-access'
      ? selectedItem
      : null;
  const selectedTabProjectId = activeSelectedTab?.scopeProjectId ?? 'all';
  const previewInGlobalWorkspace = previewItem
    ? groups[0]?.tabs.some((tab) => tab.kind === 'item' && tab.itemId === previewItem.id) ?? false
    : false;
  const visibleItems = activeView === 'recent' ? recentItems : quickAccessItems;
  const browseEntries = activeView === 'projects'
    ? projectSummaries.map(({ project, collectionCount, itemCount }) => ({
        id: `project:${project.id}`,
        title: project.name,
        icon: <Folder size={13} />,
        subtitle: project.isDefault ? `${itemCount} incoming` : `${itemCount} items · ${collectionCount} collections`,
        meta: project.isDefault ? 'Default project' : undefined,
      }))
    : visibleItems.map((item) => ({
        id: item.id,
        title: item.title || 'Untitled',
        icon: <ItemQuickAccessMarkers item={item} size={11} />,
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
    if (activeView === 'projects') {
      onOpenProject?.(id.slice('project:'.length));
      return;
    }
    const item = visibleItems.find((candidate) => candidate.id === id);
    if (item) onSelectItem?.(item);
  };

  return (
    <section style={{ width: '100%', maxWidth: 1120, minHeight: 0, display: 'flex', flexDirection: 'column' }} aria-label="All Library workspace">
      <div data-all-library-view-tabs role="tablist" aria-label="All Library view" style={{ ...uiPatterns.tabBar, marginBottom: 8 }}>
        <button type="button" role="tab" aria-selected={activeView === 'projects'} onClick={() => selectView('projects')} style={viewTabStyle(activeView === 'projects')}><Folder size={12} /> Projects <span style={tabCountStyle}>{projectSummaries.length}</span></button>
        <button type="button" role="tab" aria-selected={activeView === 'recent'} onClick={() => selectView('recent')} style={viewTabStyle(activeView === 'recent')}><Clock size={12} /> Recent <span style={tabCountStyle}>{recentItems.length}</span></button>
        <button type="button" role="tab" aria-selected={activeView === 'quick-access'} onClick={() => selectView('quick-access')} style={viewTabStyle(activeView === 'quick-access')}><Star size={12} /> Favorites &amp; pins <span style={tabCountStyle}>{quickAccessItems.length}</span></button>
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
        <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
        {onOpenPipeline && <button type="button" onClick={onOpenPipeline} style={secondaryButtonStyle}><Workflow size={11} /> Processing</button>}
        {onOpenTrash && <button type="button" onClick={onOpenTrash} style={secondaryButtonStyle}><Trash2 size={11} /> Trash</button>}
      </div>

      <div data-all-library-working-canvas style={{ height: 460, minHeight: 360, display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(0, 1.35fr)', gap: 12 }}>
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
          title={activeView === 'projects' ? 'Projects' : activeView === 'recent' ? 'Recent items' : 'Favorites & pins'}
          entries={browseEntries}
          selectedId={previewItem?.id ?? null}
          onSelect={selectBrowseEntry}
          mode={browseMode}
          onModeChange={setBrowseMode}
          emptyMessage={activeView === 'projects' ? 'Create a project when you want a durable home for related work.' : activeView === 'quick-access' ? 'Favorite or pin items to keep them close.' : 'Newly captured material will appear here.'}
          ariaLabel="All Library material"
        />}

        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ minHeight: 43, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 11px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 650, textTransform: 'uppercase', letterSpacing: 0.4 }}>{previewItem ? 'Item' : 'Workspace entry'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {activeSelectedTab ? (
                <button type="button" onClick={() => onFocusTab(activeSelectedTab)} style={primaryButtonStyle}><Maximize2 size={12} /> Focus</button>
              ) : previewItem && !previewInGlobalWorkspace ? (
                <button type="button" onClick={() => onAddItemToGlobal(previewItem)} style={primaryButtonStyle}><Plus size={12} /> Add to global</button>
              ) : null}
            </div>
          </div>

          {previewItem ? (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 17 }}>
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
              <Layers3 size={23} />
              <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Select something to work with</strong>
              <span style={{ maxWidth: 300, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>{activeView === 'projects' ? 'Choose a project to enter its working canvas, or switch views to inspect recent and favorite material here.' : 'Choose an item or workspace entry. Items can be edited and organized here without entering Focus.'}</span>
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
