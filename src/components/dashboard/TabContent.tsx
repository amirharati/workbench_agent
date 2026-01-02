import React, { useState, useEffect } from 'react';
import type { Item, Collection } from '../../lib/db';
import { getDomain, formatDateTime, isValidHttpUrl } from '../../lib/utils';
import type { TabBarTab } from './TabBar';
import { CollectionsSpace } from './CollectionsSpace';
import { AddItemTab } from './AddItemTab';
import { EditItemTab } from './EditItemTab';
import { SearchTab } from './SearchTab';
import { PinnedTab } from './PinnedTab';
import { FavoritesTab } from './FavoritesTab';
import { TrashTab } from './TrashTab';
import { RecentTab } from './RecentTab';
import { ItemContextMenu } from './ItemContextMenu';
import { Pencil, Trash2, ExternalLink, Calendar, FileText } from 'lucide-react';

interface TabContentProps {
  tab: (TabBarTab & { itemId?: string; content?: string; collectionId?: string; type?: 'item' | 'collection' | 'system' }) | null;
  item?: Item | null;
  items?: Item[];
  collections?: Collection[];
  onMoveItemToCollection?: (itemId: string, targetCollectionId: string, sourceCollectionId?: string) => void;
  onDeleteCollection?: (collection: Collection) => void;
  onRenameCollection?: (collection: Collection, newName: string) => void;
  onOpenCollection?: (collection: Collection) => void;
  onOpenCollectionInTab?: (collection: Collection) => void;
  projectId?: string;
  onCreateItem?: (data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => Promise<string>;
  onUpdateItem?: (id: string, data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => Promise<void>;
  onDeleteItem?: (item: Item) => void;
  onItemClick?: (item: Item) => void;
  defaultCollectionId?: string | 'all';
}

export const TabContent: React.FC<TabContentProps> = ({ 
  tab, 
  item, 
  items = [], 
  collections = [], 
  onMoveItemToCollection,
  onDeleteCollection,
  onRenameCollection,
  onOpenCollection,
  onOpenCollectionInTab,
  projectId,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onItemClick,
  defaultCollectionId,
}) => {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isEditingItem, setIsEditingItem] = useState(false);
  
  // Get current item for edit mode reset
  const currentItemId = item?.id || (tab?.itemId ? items.find((i) => i.id === tab.itemId)?.id : null);
  
  // Reset edit mode when item changes (must be at top level, not in conditional)
  useEffect(() => {
    if (currentItemId) {
      setIsEditingItem(false);
    }
  }, [currentItemId]);

  // Search tab
  if (tab?.id === 'util-search') {
    return (
      <SearchTab
        items={items}
        collections={collections}
        onItemClick={onItemClick}
      />
    );
  }

  // Recent tab
  if (tab?.id === 'util-recent') {
    return <RecentTab items={items} onItemClick={onItemClick} />;
  }

  // Pinned tab
  if (tab?.id === 'util-pinned') {
    return <PinnedTab />;
  }

  // Favorites tab
  if (tab?.id === 'util-favorites') {
    return <FavoritesTab />;
  }

  // Trash tab
  if (tab?.id === 'util-trash') {
    return <TrashTab />;
  }

  // Add Item tab
  if (tab?.id === 'util-add' && onCreateItem) {
    return (
      <AddItemTab
        collections={collections}
        defaultCollectionId={defaultCollectionId}
        onSave={onCreateItem}
      />
    );
  }

  // Edit Item tab
  if (tab?.id?.startsWith('edit-') && onUpdateItem) {
    // Get item from tab.itemId or from item prop
    const editItem = item || (tab?.itemId ? items.find((i) => i.id === tab.itemId) : null);
    if (editItem) {
      return (
        <EditItemTab
          item={editItem}
          collections={collections}
          onSave={onUpdateItem}
        />
      );
    }
  }

  // Collections space tab (all collections)
  if (tab?.type === 'system' && (tab.id === 'collections' || tab.id === 'collections-all')) {
    return (
      <CollectionsSpace
        collections={collections}
        items={items}
        onDeleteCollection={onDeleteCollection}
        onRenameCollection={onRenameCollection}
        onOpenCollection={onOpenCollection}
        onOpenCollectionInTab={onOpenCollectionInTab}
        onMoveItemToCollection={onMoveItemToCollection}
        projectId={projectId}
      />
    );
  }

  if (!tab && !item) {
    return (
      <div
        style={{
          padding: '12px',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--bg-panel)',
          borderRadius: 6,
          border: '1px solid var(--border)',
        }}
      >
        No tab selected
      </div>
    );
  }

  // Collection tab
  if (tab?.type === 'collection' && tab.collectionId) {
    const collectionItems = items.filter((i) => (i.collectionIds || []).includes(tab.collectionId!));
    const otherCollections = collections.filter((c) => c.id !== tab.collectionId);

    const handleDragStart = (e: React.DragEvent, itemId: string) => {
      setDraggedItemId(itemId);
      e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, collectionId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverCollectionId(collectionId);
    };

    const handleDrop = (e: React.DragEvent, targetCollectionId: string) => {
      e.preventDefault();
      if (draggedItemId && onMoveItemToCollection) {
        onMoveItemToCollection(draggedItemId, targetCollectionId);
      }
      setDraggedItemId(null);
      setDragOverCollectionId(null);
    };

    const handleDragLeave = () => {
      setDragOverCollectionId(null);
    };

    return (
      <div
        style={{
          padding: '12px',
          overflowY: 'auto',
          height: '100%',
          color: 'var(--text)',
          background: 'var(--bg-panel)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2, marginBottom: '1rem' }}>
          {tab.title || 'Collection'}
        </h2>
        
        {/* Drop zones for other collections */}
        {otherCollections.length > 0 && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 8 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Move items to:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {otherCollections.map((c) => (
                <div
                  key={c.id}
                  onDragOver={(e) => handleDragOver(e, c.id)}
                  onDrop={(e) => handleDrop(e, c.id)}
                  onDragLeave={handleDragLeave}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 8,
                    border: `2px dashed ${dragOverCollectionId === c.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: dragOverCollectionId === c.id ? 'var(--accent-weak)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {c.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collection items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {collectionItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
              No items in this collection
            </div>
          ) : (
            collectionItems.map((i) => (
              <div
                key={i.id}
                draggable
                onDragStart={(e) => handleDragStart(e, i.id)}
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-glass)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  cursor: 'grab',
                  opacity: draggedItemId === i.id ? 0.5 : 1,
                }}
              >
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{i.title || 'Untitled'}</div>
                {i.url && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {getDomain(i.url)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Item tab - check if this is an item tab (has itemId and not a system/collection tab)
  // An item tab has itemId and is not a system tab (util-*, edit-*) or collection tab
  const isItemTab = tab?.itemId && 
    tab.type !== 'collection' && 
    tab.type !== 'system' && 
    !tab.id?.startsWith('util-') && 
    !tab.id?.startsWith('edit-') &&
    tab.id !== 'collections' &&
    tab.id !== 'collections-all';
  
  if (isItemTab) {
    // Try to get item from prop, or look it up from items array using tab.itemId
    const effectiveItem = item || items.find((i) => i.id === tab.itemId) || null;
  
    if (!effectiveItem) {
      return (
        <div
          style={{
            padding: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            background: 'var(--bg-panel)',
            borderRadius: 6,
            border: '1px solid var(--border)',
          }}
        >
          Item not found
        </div>
      );
    }

    // If in edit mode, show edit form
    if (isEditingItem && onUpdateItem) {
      return (
        <EditItemTab
          item={effectiveItem}
          collections={collections}
          onSave={async (id, data) => {
            await onUpdateItem(id, data);
            setIsEditingItem(false);
          }}
          onCancel={() => setIsEditingItem(false)}
        />
      );
    }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      style={{
        padding: '12px',
        overflowY: 'auto',
        height: '100%',
        background: 'var(--bg-panel)',
        borderRadius: 6,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
        position: 'relative',
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Header with title and action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>
            {effectiveItem.title || 'Untitled'}
          </h2>
          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {effectiveItem.url && isValidHttpUrl(effectiveItem.url) ? (
              <a
                href={effectiveItem.url}
                onClick={(e) => {
                  e.preventDefault();
                  chrome.tabs.create({ url: effectiveItem.url });
                }}
                style={{
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none';
                }}
                title={`Open ${effectiveItem.url} in new tab`}
              >
                <ExternalLink size={12} />
                {getDomain(effectiveItem.url)}
              </a>
            ) : (
              <span>{effectiveItem.source || 'Note'}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
          {onUpdateItem && (
            <button
              onClick={() => setIsEditingItem(true)}
              style={{
                padding: '0.5rem',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              title="Edit item"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <Pencil size={16} />
            </button>
          )}
          {onDeleteItem && (
            <button
              onClick={() => onDeleteItem(effectiveItem)}
              style={{
                padding: '0.5rem',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: '#ef4444',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              title="Delete item"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                e.currentTarget.style.borderColor = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Calendar size={14} />
            <span>Created: {formatDateTime(effectiveItem.created_at)}</span>
          </div>
          {effectiveItem.updated_at !== effectiveItem.created_at && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={14} />
              <span>Updated: {formatDateTime(effectiveItem.updated_at)}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <FileText size={14} />
            <span>Source: {effectiveItem.source || 'manual'}</span>
          </div>
        </div>
      </div>

      {/* Notes/Content */}
      {effectiveItem.notes && (
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>Notes</h3>
          <div style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 8 }}>
            {effectiveItem.notes}
          </div>
        </div>
      )}

      {/* URL (if no notes, show URL as content) */}
      {!effectiveItem.notes && effectiveItem.url && isValidHttpUrl(effectiveItem.url) && (
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>URL</h3>
          <a
            href={effectiveItem.url}
            onClick={(e) => {
              e.preventDefault();
              chrome.tabs.create({ url: effectiveItem.url });
            }}
            style={{
              color: 'var(--accent)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem',
              background: 'var(--bg-glass)',
              borderRadius: 8,
              cursor: 'pointer',
              wordBreak: 'break-all',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = 'underline';
              e.currentTarget.style.background = 'var(--accent-weak)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none';
              e.currentTarget.style.background = 'var(--bg-glass)';
            }}
            title={`Open ${effectiveItem.url} in new tab`}
          >
            <ExternalLink size={16} />
            {effectiveItem.url}
          </a>
        </div>
      )}

      {/* Empty state */}
      {!effectiveItem.notes && !effectiveItem.url && (
        <div style={{ marginTop: '1rem', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No details available.
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (onUpdateItem || onDeleteItem) && (
        <ItemContextMenu
          item={effectiveItem}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={onUpdateItem ? () => setIsEditingItem(true) : undefined}
          onDelete={onDeleteItem}
        />
      )}
    </div>
    );
  }

  // System tab with content (only if not an item tab)
  if (tab && !item && tab.type !== 'collection' && !tab.itemId) {
    return (
      <div
        style={{
          padding: '12px',
          overflowY: 'auto',
          height: '100%',
          color: 'var(--text)',
          background: 'var(--bg-panel)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>{tab.title || 'Untitled'}</h2>
        <div style={{ marginTop: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
          {tab.content || 'No content available.'}
        </div>
      </div>
    );
  }

  // Fallback: should not reach here
  return (
    <div
      style={{
        padding: '1.5rem',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'var(--bg-panel)',
        borderRadius: 6,
        border: '1px solid var(--border)',
      }}
    >
      Unable to render tab content
    </div>
  );
};



