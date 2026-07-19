import React from 'react';
import { ExternalLink, Layers3, Maximize2, Plus, Search } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import type { GlobalTab } from './GlobalTabSystem';
import { ActiveWorkspaceCard } from './ActiveWorkspaceCard';
import { ItemWorkspace } from './ItemWorkspace';

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
  onAddItemToGlobal,
  onViewSearch,
  onUpdateItem,
  onCreateProject,
  onCreateCollection,
  getEntryScopeLabel,
}) => {
  const visibleGroups = selectedView === 'all-active'
    ? groups.filter((group) => group.tabs.length > 0)
    : groups.filter((group) => group.key === selectedView);
  const previewItem = selectedTab?.kind === 'item'
    ? items.find((item) => item.id === selectedTab.itemId) ?? null
    : selectedItem;
  const selectedTabProjectId = selectedTab?.scopeProjectId ?? 'all';
  const previewInGlobalWorkspace = previewItem
    ? groups[0]?.tabs.some((tab) => tab.kind === 'item' && tab.itemId === previewItem.id) ?? false
    : false;

  return (
    <section style={{ width: '100%', maxWidth: 1000 }} aria-labelledby="all-library-workspace-heading">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <h2 id="all-library-workspace-heading" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 650 }}>
            <Layers3 size={13} /> Continue working
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
            Look across working sets without merging or moving their contents.
          </p>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
          Workspace view
          <select
            value={selectedView}
            onChange={(event) => onSelectedViewChange(event.target.value)}
            style={{ minHeight: 30, maxWidth: 220, padding: '0 28px 0 9px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-panel)', color: 'var(--text)', fontSize: 'var(--text-xs)' }}
          >
            <option value="global">Global workspace</option>
            <option value="all-active">All active workspaces</option>
            {groups.slice(1).map((group) => (
              <option key={group.key} value={group.key}>{group.contextLabel} · {group.title}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, alignItems: 'stretch' }}>
        <div className="scrollbar" style={{ minHeight: 250, maxHeight: 390, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              activeEntryId={selectedTab?.id ?? null}
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
        </div>

        <div style={{ height: 390, minHeight: 250, maxHeight: 390, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ minHeight: 43, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 11px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 650, textTransform: 'uppercase', letterSpacing: 0.4 }}>{previewItem ? 'Item' : 'Workspace entry'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {selectedTab ? (
                <button type="button" onClick={() => onFocusTab(selectedTab)} style={primaryButtonStyle}><Maximize2 size={12} /> Focus</button>
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
          ) : selectedTab?.kind === 'search' ? (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 17 }}>
              <span style={previewIconStyle}><Search size={15} /></span>
              <h3 style={{ margin: '12px 0 0', color: 'var(--text)', fontSize: 'var(--text-lg)' }}>{selectedTab.query || 'Search'}</h3>
              <p style={{ margin: '7px 0 15px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Saved search · {searchScopeLabel(selectedTab, projects, collections)}</p>
              <button type="button" onClick={() => onViewSearch(selectedTab)} style={secondaryButtonStyle}><Search size={12} /> View results</button>
            </div>
          ) : selectedTab?.kind === 'url' ? (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 17 }}>
              <span style={previewIconStyle}><ExternalLink size={15} /></span>
              <h3 style={{ margin: '12px 0 0', color: 'var(--text)', fontSize: 'var(--text-lg)' }}>{selectedTab.title || 'Web page'}</h3>
              <ExtensionPageUrlLink url={selectedTab.url} style={{ display: 'inline-block', marginTop: 7, color: 'var(--accent)', fontSize: 'var(--text-sm)', overflowWrap: 'anywhere' }}>{selectedTab.url}</ExtensionPageUrlLink>
              <p style={{ margin: '15px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{selectedTabProjectId === 'all' ? 'Global workspace' : projects.find((project) => project.id === selectedTabProjectId)?.name ?? 'Project workspace'}</p>
            </div>
          ) : selectedTab ? (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', placeItems: 'center', padding: 24, color: 'var(--text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
              This entry uses its full interactive view in Focus.
            </div>
          ) : (
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, color: 'var(--text-faint)', textAlign: 'center' }}>
              <Layers3 size={23} />
              <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Select something to work with</strong>
              <span style={{ maxWidth: 280, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>Choose an active workspace entry, favorite, or recent item. Items can be edited and organized here without entering Focus.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const previewIconStyle: React.CSSProperties = { width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--accent-weak)', color: 'var(--accent)' };
const secondaryButtonStyle: React.CSSProperties = { minHeight: 29, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 9px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' };
const primaryButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' };
