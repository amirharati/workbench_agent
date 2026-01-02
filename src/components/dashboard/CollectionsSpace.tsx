import React, { useState } from 'react';
import type { Collection, Item } from '../../lib/db';
import { CollectionContextMenu } from './CollectionContextMenu';
import { Trash2, ExternalLink, Pencil } from 'lucide-react';

interface CollectionsSpaceProps {
  collections: Collection[];
  items: Item[];
  onDeleteCollection?: (collection: Collection) => void;
  onRenameCollection?: (collection: Collection, newName: string) => void;
  onOpenCollection?: (collection: Collection) => void;
  onOpenCollectionInTab?: (collection: Collection) => void;
  onMoveItemToCollection?: (itemId: string, targetCollectionId: string, sourceCollectionId?: string) => void;
  projectId?: string;
}

export const CollectionsSpace: React.FC<CollectionsSpaceProps> = ({
  collections,
  items,
  onDeleteCollection,
  onRenameCollection,
  onOpenCollection,
  onOpenCollectionInTab,
  onMoveItemToCollection,
  projectId,
}) => {
  const [contextMenu, setContextMenu] = useState<{ collection: Collection; x: number; y: number } | null>(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Filter collections for this project
  const projectCollections = collections.filter((c) => {
    if (projectId) {
      return c.primaryProjectId === projectId || (Array.isArray(c.projectIds) && c.projectIds.includes(projectId));
    }
    return true;
  });

  const getItemCount = (collectionId: string) => {
    return items.filter((i) => (i.collectionIds || []).includes(collectionId)).length;
  };

  const handleContextMenu = (e: React.MouseEvent, collection: Collection) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ collection, x: e.clientX, y: e.clientY });
  };

  const handleDragOver = (e: React.DragEvent, collectionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCollectionId(collectionId);
  };

  const handleDrop = (e: React.DragEvent, targetCollectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId && onMoveItemToCollection) {
      // Find source collection - use the first one if item has multiple
      const item = items.find((i) => i.id === itemId);
      if (item) {
        const sourceCollectionId = item.collectionIds?.[0]; // Use first collection as source
        onMoveItemToCollection(itemId, targetCollectionId, sourceCollectionId);
      }
    }
    setDragOverCollectionId(null);
  };

  const handleDragLeave = () => {
    setDragOverCollectionId(null);
  };

  const handleStartRename = (collection: Collection) => {
    console.log('Starting rename for:', collection.name, 'onRenameCollection:', !!onRenameCollection);
    if (onRenameCollection) {
      setEditingCollectionId(collection.id);
      setEditName(collection.name);
      setContextMenu(null);
    } else {
      console.error('onRenameCollection handler not provided');
      alert('Rename handler not available');
    }
  };

  const handleRenameSubmit = async (collection: Collection) => {
    if (!onRenameCollection) {
      console.error('onRenameCollection not provided');
      setEditingCollectionId(null);
      setEditName('');
      return;
    }
    if (editName.trim() && editName.trim() !== collection.name) {
      try {
        await onRenameCollection(collection, editName.trim());
      } catch (error) {
        console.error('Failed to rename:', error);
      }
    }
    setEditingCollectionId(null);
    setEditName('');
  };

  const handleRenameCancel = () => {
    setEditingCollectionId(null);
    setEditName('');
  };

  return (
    <div
      style={{
        padding: '1.25rem',
        overflowY: 'auto',
        height: '100%',
        color: 'var(--text)',
        background: 'var(--bg-panel)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        // Handle drop on empty space - could move to unsorted
      }}
    >
      {contextMenu && (
        <CollectionContextMenu
          collection={contextMenu.collection}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={onDeleteCollection}
          onRename={handleStartRename}
          onOpenInTab={onOpenCollectionInTab}
        />
      )}

      <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2, marginBottom: '1rem' }}>
        Collections
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        {projectCollections.map((collection) => {
          const itemCount = getItemCount(collection.id);
          const isDragOver = dragOverCollectionId === collection.id;
          const isEditing = editingCollectionId === collection.id;

          return (
            <div
              key={collection.id}
              onContextMenu={(e) => handleContextMenu(e, collection)}
              onDragOver={(e) => handleDragOver(e, collection.id)}
              onDrop={(e) => handleDrop(e, collection.id)}
              onDragLeave={handleDragLeave}
              style={{
                padding: '1rem',
                background: isDragOver ? 'var(--accent-weak)' : 'var(--bg-glass)',
                border: `2px solid ${isDragOver ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 12,
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isDragOver && !isEditing) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isDragOver && !isEditing) {
                  e.currentTarget.style.background = 'var(--bg-glass)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }
              }}
            >
              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRenameSubmit(collection)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleRenameSubmit(collection);
                    } else if (e.key === 'Escape') {
                      handleRenameCancel();
                    }
                  }}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--accent)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: '1rem',
                    fontWeight: 600,
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div
                      onClick={() => {
                        if (onOpenCollection && !isEditing) {
                          onOpenCollection(collection);
                        }
                      }}
                      onDoubleClick={() => {
                        if (onRenameCollection && !isEditing) {
                          handleStartRename(collection);
                        }
                      }}
                      style={{
                        flex: 1,
                        cursor: isEditing ? 'default' : 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)' }}>
                        {collection.name}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
                      {onRenameCollection && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(collection);
                          }}
                          style={{
                            padding: '0.25rem',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: 4,
                            transition: 'all 0.15s ease',
                          }}
                          title="Rename collection"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--bg-glass)';
                            e.currentTarget.style.color = 'var(--text)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--text-muted)';
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {onOpenCollectionInTab && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCollectionInTab(collection);
                          }}
                          style={{
                            padding: '0.25rem',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: 4,
                            transition: 'all 0.15s ease',
                          }}
                          title="Open in tab"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--bg-glass)';
                            e.currentTarget.style.color = 'var(--text)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--text-muted)';
                          }}
                        >
                          <ExternalLink size={14} />
                        </button>
                      )}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          console.log('Delete button clicked for:', collection.name, 'onDeleteCollection:', !!onDeleteCollection);
                          if (onDeleteCollection) {
                            if (window.confirm(`Delete "${collection.name}"? Items will be moved to Unsorted.`)) {
                              console.log('Calling onDeleteCollection');
                              await onDeleteCollection(collection);
                            }
                          } else {
                            console.error('onDeleteCollection handler not provided');
                            alert('Delete handler not available');
                          }
                        }}
                        style={{
                          padding: '0.25rem',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: 4,
                          transition: 'all 0.15s ease',
                          opacity: 0.8,
                        }}
                        title="Delete collection"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                          e.currentTarget.style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.opacity = '0.8';
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {projectCollections.length === 0 && (
        <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
          No collections found
        </div>
      )}
    </div>
  );
};

