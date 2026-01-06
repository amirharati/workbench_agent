import React, { useMemo, useState } from 'react';
import type { Item, Collection, Project } from '../../lib/db';
import { formatDateTime } from '../../lib/utils';
import { Panel } from '../../styles/primitives';
import { SearchBar } from './SearchBar';
import { Resizer } from './Resizer';
import { Calendar, FolderOpen, ExternalLink } from 'lucide-react';

interface NotesViewProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  onItemClick?: (item: Item) => void;
  onUpdateItem?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => Promise<void>;
}

export const NotesView: React.FC<NotesViewProps> = ({
  items,
  collections,
  projects,
  onItemClick,
  onUpdateItem,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(320);
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // Get all items that are notes:
  // 1. Items with notes content, OR
  // 2. Items without a URL (which are notes by definition)
  const itemsWithNotes = useMemo(() => {
    return items.filter((item) => {
      const hasNotesContent = item.notes && item.notes.trim().length > 0;
      const isNoteItem = !item.url || item.url.trim().length === 0;
      return hasNotesContent || isNoteItem;
    });
  }, [items]);

  // Filter by search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return itemsWithNotes;
    const q = searchQuery.trim().toLowerCase();
    return itemsWithNotes.filter((item) => {
      const haystack = [
        item.title,
        item.notes || '',
        item.url || '',
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [itemsWithNotes, searchQuery]);

  const selectedItem = useMemo(() => {
    return filteredItems.find((item) => item.id === selectedItemId) || null;
  }, [filteredItems, selectedItemId]);

  // Get collection and project for an item
  const getItemContext = (item: Item) => {
    const itemCollections = collections.filter((c) => (item.collectionIds || []).includes(c.id));
    const primaryCollection = itemCollections[0];
    const projectId = primaryCollection?.primaryProjectId;
    const project = projectId ? projects.find((p) => p.id === projectId) : null;
    return { collection: primaryCollection, project };
  };

  const handleItemClick = (item: Item) => {
    setSelectedItemId(item.id);
    setIsEditing(false);
    setEditNotes(item.notes || '');
    if (onItemClick) onItemClick(item);
  };

  const handleEdit = () => {
    if (selectedItem) {
      setIsEditing(true);
      setEditNotes(selectedItem.notes || '');
    }
  };

  const handleSave = async () => {
    if (!selectedItem || !onUpdateItem) return;
    await onUpdateItem(selectedItem.id, { notes: editNotes.trim() || undefined });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (selectedItem) {
      setEditNotes(selectedItem.notes || '');
    }
  };

  // Group items by Project -> Collection with stable sorting
  const groupedItems = useMemo(() => {
    const projectMap: Record<string, { project: Project | null; collections: Record<string, { collection: Collection | null; items: Item[] }> }> = {};

    filteredItems.forEach((item) => {
      const { collection, project } = getItemContext(item);
      const projectId = project?.id || 'unknown';
      const collectionId = collection?.id || 'unsorted';

      if (!projectMap[projectId]) {
        projectMap[projectId] = { project: project ?? null, collections: {} };
      }
      if (!projectMap[projectId].collections[collectionId]) {
        projectMap[projectId].collections[collectionId] = { collection: collection ?? null, items: [] };
      }
      projectMap[projectId].collections[collectionId].items.push(item);
    });

    // Convert to sorted arrays
    return Object.entries(projectMap)
      .map(([pid, pg]) => ({
        projectId: pid,
        project: pg.project,
        collections: Object.entries(pg.collections)
          .map(([cid, cg]) => ({
            collectionId: cid,
            collection: cg.collection,
            items: cg.items,
          }))
          .sort((a, b) => (a.collection?.name || '').localeCompare(b.collection?.name || '')),
      }))
      .sort((a, b) => (a.project?.name || '').localeCompare(b.project?.name || ''));
  }, [filteredItems, collections, projects]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28, flexShrink: 0 }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Notes
        </h1>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {filteredItems.length} note{filteredItems.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Search */}
      <div style={{ flexShrink: 0 }}>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="⌘K Search notes..."
        />
      </div>

      {/* Main content: list + viewer */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${listWidth}px 4px 1fr`,
          gap: '4px',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Notes list */}
        <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
          <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>
            {filteredItems.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {searchQuery ? 'No notes match your search' : 'No notes yet'}
              </div>
            ) : (
              groupedItems.map((projectGroup, idx) => (
                <div key={projectGroup.projectId} style={{ padding: '0 8px 8px 8px' }}>
                  {/* Project Header */}
                  <div
                    style={{
                      padding: '4px 8px',
                      background: 'var(--bg-panel)',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid var(--border)',
                      borderTop: idx === 0 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    {projectGroup.project?.name || 'Unknown Project'}
                  </div>

                  {projectGroup.collections.map((collectionGroup) => (
                    <div key={collectionGroup.collectionId} style={{ marginBottom: '6px' }}>
                      <div
                        style={{
                          padding: '4px 12px',
                          color: 'var(--text-muted)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {collectionGroup.collection?.name || 'Unsorted'}
                      </div>

                      {collectionGroup.items.map((item) => {
                        const isSelected = item.id === selectedItemId;
                        const preview = (item.notes || '').substring(0, 100).replace(/\n/g, ' ');

                        return (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item)}
                            style={{
                              padding: '0.4rem 0.75rem',
                              height: 56,
                              cursor: 'pointer',
                              borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                              background: isSelected ? 'var(--bg-hover)' : 'transparent',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              paddingLeft: '1.25rem',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'transparent';
                              }
                            }}
                          >
                            <div
                              style={{
                                fontWeight: isSelected ? 600 : 500,
                                fontSize: 'var(--text-sm)',
                                color: 'var(--text)',
                                marginBottom: '2px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.title || 'Untitled'}
                            </div>
                            <div
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                lineHeight: 1.3,
                                marginBottom: '2px',
                              }}
                            >
                              {preview}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </Panel>

        <Resizer
          direction="vertical"
          onResize={(delta) => {
            setListWidth((w) => Math.min(Math.max(200, w + delta), 600));
          }}
        />

        {/* Note viewer/editor */}
        <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0, overflow: 'hidden' }}>
          {selectedItem ? (
            <>
              <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px', overflowX: 'hidden' }}>
                {/* Header */}
                <div style={{ marginBottom: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                    }}
                  >
                    <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                      {selectedItem.title || 'Untitled'}
                    </h2>
                    {!isEditing && onUpdateItem && (
                      <button
                        onClick={handleEdit}
                        style={{
                          padding: '4px 8px',
                          fontSize: 'var(--text-xs)',
                          background: 'var(--bg-glass)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          color: 'var(--text)',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {/* Context */}
                  {(() => {
                    const { collection, project } = getItemContext(selectedItem);
                    return (
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-muted)',
                          marginBottom: '8px',
                        }}
                      >
                        {collection && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FolderOpen size={12} />
                            <span>{collection.name}</span>
                          </div>
                        )}
                        {project && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>•</span>
                            <span>{project.name}</span>
                          </div>
                        )}
                        {selectedItem.url && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>•</span>
                            <ExternalLink size={12} />
                            <a
                              href={selectedItem.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--accent)', textDecoration: 'none' }}
                            >
                              Open URL
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Metadata */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      marginBottom: '12px',
                      paddingBottom: '12px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} />
                      <span>Updated: {formatDateTime(selectedItem.updated_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes content */}
                {isEditing ? (
                  <div>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '300px',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        color: 'var(--text)',
                        fontSize: 'var(--text-sm)',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        lineHeight: 1.6,
                      }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                      <button
                        onClick={handleCancel}
                        style={{
                          padding: '6px 12px',
                          fontSize: 'var(--text-xs)',
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          color: 'var(--text)',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        style={{
                          padding: '6px 12px',
                          fontSize: 'var(--text-xs)',
                          background: 'var(--accent)',
                          border: 'none',
                          borderRadius: 4,
                          color: 'var(--accent-text)',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    {selectedItem.notes}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Select a note to view
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

