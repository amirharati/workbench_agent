import React, { useState, useEffect } from 'react';
import type { Item, Collection, Project, Workspace } from '../../lib/db';
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
import { WorkspaceTab } from './WorkspaceTab';
import { ItemContextMenu } from './ItemContextMenu';
import { Pencil, Trash2, ExternalLink, Calendar, FileText } from 'lucide-react';

interface TabContentProps {
  tab: (TabBarTab & { itemId?: string; content?: string; collectionId?: string; workspaceId?: string; type?: 'item' | 'collection' | 'system' | 'workspace' }) | null;
  item?: Item | null;
  items?: Item[];
  collections?: Collection[];
  projects?: Project[];
  workspaces?: Workspace[];
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
  projects = [],
  workspaces = [],
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
  // Track filter state per collection tab (collectionId -> 'collection' | 'all')
  const [collectionFilters, setCollectionFilters] = useState<Map<string, 'collection' | 'all'>>(new Map());
  
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

  // Workspace tab
  if (tab?.workspaceId) {
    const workspace = workspaces.find((w) => w.id === tab.workspaceId);
    if (!workspace) {
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
          Workspace not found
        </div>
      );
    }
    return <WorkspaceTab workspace={workspace} />;
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
    const collectionId = tab.collectionId;
    const isAllCollection = collectionId === '__all__';
    // For "All" collection, default to 'all', otherwise default to 'collection'
    const selectedFilter = collectionFilters.get(collectionId) || (isAllCollection ? 'all' : 'collection');
    const setSelectedFilter = (filter: 'collection' | 'all') => {
      setCollectionFilters(prev => new Map(prev).set(collectionId, filter));
    };
    
    const collectionItems = isAllCollection ? [] : items.filter((i) => (i.collectionIds || []).includes(collectionId));
    const displayedItems = selectedFilter === 'all' ? items : collectionItems;
    const otherCollections = isAllCollection ? collections : collections.filter((c) => c.id !== collectionId);

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
        // If we're in a collection tab (not "All"), use it as the source
        // Otherwise, find the item and use its first collection as source
        let sourceCollectionId: string | undefined;
        if (!isAllCollection && collectionId) {
          sourceCollectionId = collectionId;
        } else {
          // Find the item to get its source collection
          const item = items.find((i) => i.id === draggedItemId);
          if (item && item.collectionIds && item.collectionIds.length > 0) {
            sourceCollectionId = item.collectionIds[0];
          }
        }
        onMoveItemToCollection(draggedItemId, targetCollectionId, sourceCollectionId);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>
            {tab.title || 'Collection'}
          </h2>
          
          {/* Filter toggle: Collection / All - only show if not "All" collection */}
          {!isAllCollection && (
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px' }}>
              <button
                onClick={() => setSelectedFilter('collection')}
                style={{
                  padding: '2px 8px',
                  background: selectedFilter === 'collection' ? 'var(--accent-weak)' : 'transparent',
                  color: selectedFilter === 'collection' ? 'var(--accent)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  height: 20,
                }}
              >
                Collection ({collectionItems.length})
              </button>
              <button
                onClick={() => setSelectedFilter('all')}
                style={{
                  padding: '2px 8px',
                  background: selectedFilter === 'all' ? 'var(--accent-weak)' : 'transparent',
                  color: selectedFilter === 'all' ? 'var(--accent)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  height: 20,
                }}
              >
                All ({items.length})
              </button>
            </div>
          )}
        </div>
        
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
          {displayedItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
              {selectedFilter === 'all' ? 'No items' : 'No items in this collection'}
            </div>
          ) : (
            displayedItems.map((i) => (
              <div
                key={i.id}
                draggable
                onDragStart={(e) => handleDragStart(e, i.id)}
                onClick={() => {
                  if (onItemClick) {
                    onItemClick(i);
                  }
                }}
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-glass)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  opacity: draggedItemId === i.id ? 0.5 : 1,
                  transition: 'all 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  if (draggedItemId !== i.id) {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (draggedItemId !== i.id) {
                    e.currentTarget.style.background = 'var(--bg-glass)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }
                }}
              >
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{i.title || 'Untitled'}</div>
                {i.url && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {getDomain(i.url)}
                  </div>
                )}
                {i.notes && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.notes}
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

      {/* Projects and Collections */}
      {(() => {
        const itemCollections = collections.filter((c) => (effectiveItem.collectionIds || []).includes(c.id));
        const projectIds = new Set<string>();
        itemCollections.forEach((c) => {
          let collectionHasProjectId = false;
          // Add primaryProjectId if it exists
          if (c.primaryProjectId && c.primaryProjectId.trim()) {
            projectIds.add(c.primaryProjectId);
            collectionHasProjectId = true;
          }
          // Add all projectIds from the array
          if (Array.isArray(c.projectIds) && c.projectIds.length > 0) {
            c.projectIds.forEach((pid) => {
              if (pid && pid.trim()) {
                projectIds.add(pid);
                collectionHasProjectId = true;
              }
            });
          }
          // Fallback: if this specific collection has no project associations but we have a projectId prop, use it
          // This handles edge cases where collections might not have project associations set
          if (!collectionHasProjectId && projectId && projectId.trim()) {
            projectIds.add(projectId);
          }
        });
        // Filter projects to only include those that exist in our projects array
        const itemProjects = projects.filter((p) => p && p.id && projectIds.has(p.id));
        
        // Debug logging (can be removed later)
        if (itemCollections.length > 0 && itemProjects.length === 0 && projectIds.size > 0) {
          console.warn('Item collections found but no matching projects:', {
            itemId: effectiveItem.id,
            collections: itemCollections.map(c => ({ id: c.id, name: c.name, primaryProjectId: c.primaryProjectId, projectIds: c.projectIds })),
            projectIds: Array.from(projectIds),
            availableProjects: projects.map(p => ({ id: p.id, name: p.name })),
            projectIdProp: projectId
          });
        }
        
        // Also log when we have collections but no projectIds extracted
        if (itemCollections.length > 0 && projectIds.size === 0) {
          console.warn('Item has collections but no project IDs extracted:', {
            itemId: effectiveItem.id,
            collections: itemCollections.map(c => ({ 
              id: c.id, 
              name: c.name, 
              primaryProjectId: c.primaryProjectId, 
              projectIds: c.projectIds,
              hasPrimaryProjectId: !!c.primaryProjectId,
              hasProjectIds: Array.isArray(c.projectIds) && c.projectIds.length > 0
            }))
          });
        }

        if (itemProjects.length > 0 || itemCollections.length > 0) {
          return (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 8 }}>
              {itemProjects.length > 0 && (
                <div style={{ marginBottom: itemCollections.length > 0 ? '0.75rem' : 0 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Projects
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {itemProjects.map((p) => (
                      <span
                        key={p.id}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          fontSize: '0.85rem',
                          color: 'var(--text)',
                        }}
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {itemCollections.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Collections
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {itemCollections.map((c) => (
                      <span
                        key={c.id}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          fontSize: '0.85rem',
                          color: 'var(--text)',
                        }}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }
        return null;
      })()}

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



