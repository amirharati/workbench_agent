import React, { useMemo, useState, useRef } from 'react';
import type { Collection, Project, Item } from '../../lib/db';
import { Panel } from '../../styles/primitives';
import { ItemsListPanel } from './ItemsListPanel';
import { TabBar, TabBarTab } from './TabBar';
import { TabContent } from './TabContent';
import { Resizer } from './Resizer';
import { SearchBar } from './SearchBar';
import { List, Grid } from 'lucide-react';

interface CollectionsViewProps {
  collections: Collection[];
  projects: Project[];
  items: Item[];
  onItemClick?: (item: Item) => void;
  onUpdateItem?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => Promise<void>;
  onDeleteItem?: (item: Item) => void;
}

type Tab = {
  id: string;
  title: string;
  itemId?: string;
  collectionId?: string;
  type?: 'item' | 'collection' | 'system';
};

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  collections,
  projects,
  items,
  onItemClick,
  onUpdateItem,
  onDeleteItem,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(280);
  const [itemsListWidth, setItemsListWidth] = useState(280);
  const [itemsViewMode, setItemsViewMode] = useState<'list' | 'grid'>('list');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get project for a collection
  const getCollectionProject = (collection: Collection): Project | null => {
    if (!collection.primaryProjectId) return null;
    return projects.find(p => p.id === collection.primaryProjectId) || null;
  };

  // Get all collections with project info, sorted by project then collection name
  const allCollectionsWithPath = useMemo(() => {
    return collections
      .map(c => ({
        collection: c,
        project: getCollectionProject(c),
      }))
      .sort((a, b) => {
        // Sort by project name first, then collection name
        const projectA = a.project?.name || 'Unknown';
        const projectB = b.project?.name || 'Unknown';
        if (projectA !== projectB) {
          return projectA.localeCompare(projectB);
        }
        return (a.collection.name || '').localeCompare(b.collection.name || '');
      });
  }, [collections, projects]);

  // Get items for selected collection
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Filter by collection
    if (selectedCollectionId !== 'all') {
      filtered = filtered.filter((item) => (item.collectionIds || []).includes(selectedCollectionId));
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((item) => {
        return (
          item.title?.toLowerCase().includes(query) ||
          item.url?.toLowerCase().includes(query) ||
          item.notes?.toLowerCase().includes(query)
        );
      });
    }

    return filtered;
  }, [items, selectedCollectionId, searchQuery]);

  // Get item count for a collection
  const getItemCount = (collectionId: string) => {
    return items.filter((item) => (item.collectionIds || []).includes(collectionId)).length;
  };

  const handleCollectionClick = (collection: Collection) => {
    setSelectedCollectionId(collection.id);
  };

  const handleItemClick = (item: Item) => {
    // If item is already open, focus it
    const existingTab = tabs.find((t) => t.itemId === item.id);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // Create new tab
    const newTab: Tab = {
      id: item.id,
      title: item.title || 'Untitled',
      itemId: item.id,
      type: 'item',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);

    // Also call external handler if provided
    if (onItemClick) onItemClick(item);
  };

  const handleTabClose = (tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  const activeItem = activeTab?.itemId ? items.find((i) => i.id === activeTab.itemId) || null : null;


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28, flexShrink: 0, marginBottom: '-4px' }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Collections
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* View mode toggle */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px' }}>
            <button
              onClick={() => setItemsViewMode('list')}
              style={{
                padding: '2px 6px',
                height: 20,
                background: itemsViewMode === 'list' ? 'var(--accent-weak)' : 'transparent',
                color: itemsViewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
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
              onClick={() => setItemsViewMode('grid')}
              style={{
                padding: '2px 6px',
                height: 20,
                background: itemsViewMode === 'grid' ? 'var(--accent-weak)' : 'transparent',
                color: itemsViewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
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

      {/* Search */}
      <div style={{ flexShrink: 0 }}>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="⌘K Search collections and items..."
          inputRef={searchInputRef}
        />
      </div>

      {/* Main area: collections list + items list + content */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${listWidth}px 4px 1fr`,
          gap: '4px',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Collections list (left) */}
        <Panel style={{ padding: '4px', overflowY: 'auto' }} className="scrollbar">
          <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', marginBottom: '4px', height: 28 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', fontWeight: 600 }}>
              Collections ({allCollectionsWithPath.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {allCollectionsWithPath.map(({ collection, project }) => {
              const itemCount = getItemCount(collection.id);
              const isActive = selectedCollectionId === collection.id;
              const path = project ? `${project.name}/${collection.name}` : collection.name;
              return (
                <div
                  key={collection.id}
                  onClick={() => handleCollectionClick(collection)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    minHeight: 28,
                    background: isActive ? 'var(--accent-weak)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: isActive ? 500 : 400,
                          fontSize: 'var(--text-sm)',
                          color: isActive ? 'var(--text)' : 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {path}
                      </div>
                      {project && (
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-faint)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: '2px',
                          }}
                        >
                          {collection.name}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                      {itemCount}
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
            setListWidth((w) => Math.min(Math.max(200, w + delta), 600));
          }}
        />

        {/* Items list + Content (right) */}
        <div style={{ display: 'grid', gridTemplateColumns: `${itemsListWidth}px 4px 1fr`, gap: '4px', minHeight: 0 }}>
          {/* Items list */}
          <ItemsListPanel
            items={filteredItems}
            activeItemId={activeItem?.id || null}
            onItemClick={handleItemClick}
            title={selectedCollectionId === 'all' ? 'All Items' : collections.find((c) => c.id === selectedCollectionId)?.name || 'Items'}
            viewMode={itemsViewMode}
            onViewModeChange={setItemsViewMode}
          />

          <Resizer
            direction="vertical"
            onResize={(delta) => {
              setItemsListWidth((w) => Math.min(Math.max(200, w + delta), 600));
            }}
          />

          {/* Tabbed content area */}
          <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
            <TabBar
              tabs={tabs as TabBarTab[]}
              activeTabId={activeTabId}
              onTabSelect={setActiveTabId}
              onTabClose={handleTabClose}
              spaceId="collections"
            />
            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <TabContent
                tab={activeTab}
                item={activeItem || null}
                items={items}
                collections={collections}
                projects={projects}
                onUpdateItem={onUpdateItem}
                onDeleteItem={onDeleteItem}
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};
