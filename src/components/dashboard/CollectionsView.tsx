import React, { useMemo, useState, useRef } from 'react';
import type { Collection, Project, Item } from '../../lib/db';
import { Panel } from '../../styles/primitives';
import { ItemsListPanel } from './ItemsListPanel';
import { TabBar, TabBarTab } from './TabBar';
import { TabContent } from './TabContent';
import { Resizer } from './Resizer';
import { SearchBar } from './SearchBar';
import { CollectionPills } from './CollectionPills';

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
  const [selectedProjectId, setSelectedProjectId] = useState<string | 'all'>('all');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(280);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter collections by project
  const filteredCollections = useMemo(() => {
    let filtered = collections;

    // Filter by project
    if (selectedProjectId !== 'all') {
      filtered = filtered.filter(
        (c) =>
          c.primaryProjectId === selectedProjectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(selectedProjectId))
      );
    }

    // Exclude default/unsorted collections
    const projectUnsortedId = selectedProjectId !== 'all' ? `collection_${selectedProjectId}_unsorted` : null;
    filtered = filtered.filter((c) => {
      if (c.isDefault && c.id !== projectUnsortedId) return false;
      if (c.name === 'Unsorted' && c.id !== projectUnsortedId) return false;
      return true;
    });

    return filtered;
  }, [collections, selectedProjectId]);

  // Get items for selected collection
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Filter by collection
    if (selectedCollectionId !== 'all') {
      filtered = filtered.filter((item) => (item.collectionIds || []).includes(selectedCollectionId));
    } else if (selectedProjectId !== 'all') {
      // If "all" but project selected, show items from that project's collections
      const collectionIds = new Set(filteredCollections.map((c) => c.id));
      filtered = filtered.filter((item) => (item.collectionIds || []).some((cid) => collectionIds.has(cid)));
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
  }, [items, selectedCollectionId, selectedProjectId, filteredCollections, searchQuery]);

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

  // Get collections for pills (filtered by project)
  const collectionsForPills = useMemo(() => {
    return filteredCollections;
  }, [filteredCollections]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28 }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Collections
        </h1>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Project filter */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Project:</span>
          <button
            onClick={() => setSelectedProjectId('all')}
            style={{
              padding: '3px 10px',
              height: 24,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: selectedProjectId === 'all' ? 'var(--accent)' : 'var(--bg-glass)',
              color: selectedProjectId === 'all' ? 'var(--accent-text)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
            }}
          >
            All
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              style={{
                padding: '3px 10px',
                height: 24,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: selectedProjectId === p.id ? 'var(--accent)' : 'var(--bg-glass)',
                color: selectedProjectId === p.id ? 'var(--accent-text)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Collection pills */}
        <CollectionPills
          collections={collectionsForPills}
          selectedId={selectedCollectionId}
          onSelect={setSelectedCollectionId}
          totalItems={filteredItems.length}
          getCountForCollection={getItemCount}
          maxVisible={4}
        />

        {/* Search */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="⌘K Search items..."
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
              Collections ({filteredCollections.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {filteredCollections.map((collection) => {
              const itemCount = getItemCount(collection.id);
              const isActive = selectedCollectionId === collection.id;
              return (
                <div
                  key={collection.id}
                  onClick={() => handleCollectionClick(collection)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    height: 28,
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontWeight: isActive ? 500 : 400,
                        fontSize: 'var(--text-sm)',
                        color: isActive ? 'var(--text)' : 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {collection.name}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginLeft: '8px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '280px 4px 1fr', gap: '4px', minHeight: 0 }}>
          {/* Items list */}
          <ItemsListPanel
            items={filteredItems}
            activeItemId={activeItem?.id || null}
            onItemClick={handleItemClick}
            title={selectedCollectionId === 'all' ? 'All Items' : collections.find((c) => c.id === selectedCollectionId)?.name || 'Items'}
          />

          <div style={{ width: 4 }} />

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
