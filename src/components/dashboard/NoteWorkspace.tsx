import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import { formatDateTime } from '../../lib/utils';
import { SearchBar } from './SearchBar';
import { Resizer } from './Resizer';
import { sortItemsWithPinsFirst } from '../../lib/itemQuickAccess';
import { ItemOrganizationEditor } from './ItemOrganizationEditor';

const isNoteItem = (item: Item) => !item.url || item.url.trim().length === 0;

function previewSnippet(notes: string | undefined, max = 72): string {
  const text = (notes || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Empty note';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface NoteWorkspaceProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  listWidth?: number;
  onListWidthChange?: (width: number) => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onRequestDelete?: (item: Item) => void;
  onNewNote?: () => void;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  scopeChips?: React.ReactNode;
}

export const NoteWorkspace: React.FC<NoteWorkspaceProps> = ({
  items,
  collections,
  projects,
  scopeProjectId = 'all',
  scopeCollectionId = 'all',
  listWidth = 300,
  onListWidthChange,
  onUpdateItem,
  onRequestDelete,
  onNewNote,
  onCreateProject,
  onCreateCollection,
  scopeChips,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const notes = useMemo(() => {
    let list = items.filter(isNoteItem);

    if (scopeCollectionId && scopeCollectionId !== 'all') {
      list = list.filter((item) => (item.collectionIds || []).includes(scopeCollectionId));
    } else if (scopeProjectId && scopeProjectId !== 'all') {
      const projectCollectionIds = new Set(
        collections
          .filter(
            (c) =>
              c.primaryProjectId === scopeProjectId ||
              (Array.isArray(c.projectIds) && c.projectIds.includes(scopeProjectId))
          )
          .map((c) => c.id)
      );
      list = list.filter((item) =>
        (item.collectionIds || []).some((cid) => projectCollectionIds.has(cid))
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((item) => {
        const haystack = `${item.title} ${item.notes || ''}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    return sortItemsWithPinsFirst(list);
  }, [items, collections, scopeProjectId, scopeCollectionId, searchQuery]);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  useEffect(() => {
    if (selectedId && notes.some((n) => n.id === selectedId)) return;
    setSelectedId(notes[0]?.id ?? null);
  }, [notes, selectedId]);

  useEffect(() => {
    if (!selected) {
      setEditTitle('');
      setEditBody('');
      setSaveError(null);
      return;
    }
    setEditTitle(selected.title || '');
    setEditBody(selected.notes || '');
    setSaveError(null);
  }, [selected?.id, selected?.title, selected?.notes, selected?.updated_at]);

  const dirty =
    !!selected &&
    (editTitle.trim() !== (selected.title || '').trim() ||
      editBody !== (selected.notes || ''));

  const handleSave = useCallback(async () => {
    if (!selected || !onUpdateItem || !dirty || saving) return;
    const title = editTitle.trim() || 'Untitled note';
    setSaving(true);
    setSaveError(null);
    try {
      await onUpdateItem(selected.id, {
        title,
        notes: editBody.trim() || undefined,
        updated_at: Date.now(),
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [selected, onUpdateItem, dirty, saving, editTitle, editBody]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  const selectNote = (item: Item) => {
    if (item.id === selectedId) return;
    void (async () => {
      if (dirty) await handleSave();
      setSelectedId(item.id);
    })();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 14px 8px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h1
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              color: 'var(--text)',
              margin: 0,
            }}
          >
            Notes
          </h1>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            {notes.length}
          </span>
        </div>
        {onNewNote && (
          <button
            type="button"
            onClick={onNewNote}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'var(--accent)',
              color: 'var(--accent-text, #fff)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <Plus size={14} /> New note
          </button>
        )}
      </div>

      {scopeChips ? (
        <div style={{ padding: '6px 14px 0', flexShrink: 0 }}>{scopeChips}</div>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* List */}
        <div
          style={{
            width: listWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}
        >
          <div style={{ padding: '10px 10px 8px', flexShrink: 0 }}>
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search notes..."
            />
          </div>
          <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 6px 10px' }}>
            {notes.length === 0 ? (
              <div
                style={{
                  padding: '24px 12px',
                  textAlign: 'center',
                  color: 'var(--text-faint)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.5,
                }}
              >
                {searchQuery.trim()
                  ? 'No notes match this search.'
                  : 'No notes yet. Create one to get started.'}
              </div>
            ) : (
              notes.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectNote(item)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 10px',
                      marginBottom: 2,
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: active ? 'var(--accent-weak)' : 'transparent',
                      borderLeft: active
                        ? '2px solid var(--accent)'
                        : '2px solid transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: active ? 600 : 500,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title || 'Untitled note'}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-muted)',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {previewSnippet(item.notes)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {onListWidthChange && (
          <Resizer
            direction="vertical"
            onResize={(delta) => {
              onListWidthChange(Math.min(480, Math.max(220, listWidth + delta)));
            }}
          />
        )}

        {/* Editor */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg)',
            overflow: 'hidden',
          }}
        >
          {!selected ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-faint)',
                fontSize: 'var(--text-sm)',
                padding: 24,
                textAlign: 'center',
              }}
            >
              Select a note or create a new one.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '14px 20px 10px',
                  flexShrink: 0,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Note title"
                  disabled={!onUpdateItem}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    padding: '8px 0',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingTop: 4 }}>
                  {onUpdateItem && (
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={!dirty || saving}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: 'none',
                        background: dirty ? 'var(--accent)' : 'var(--bg-glass)',
                        color: dirty ? 'var(--accent-text, #fff)' : 'var(--text-muted)',
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        cursor: dirty && !saving ? 'pointer' : 'default',
                        opacity: saving ? 0.7 : 1,
                      }}
                      title="Save (⌘S / Ctrl+S)"
                    >
                      {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                    </button>
                  )}
                  {onRequestDelete && (
                    <button
                      type="button"
                      onClick={() => onRequestDelete(selected)}
                      title="Move to trash"
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {(saveError) && (
                <div
                  style={{
                    padding: '6px 20px',
                    flexShrink: 0,
                    fontSize: 'var(--text-xs)',
                    color: '#ef4444',
                  }}
                >
                  {saveError}
                </div>
              )}

              <div style={{ padding: '8px 20px', flexShrink: 0, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                <ItemOrganizationEditor
                  item={selected}
                  collections={collections}
                  projects={projects}
                  editable={!!onUpdateItem}
                  compact
                  onCreateProject={onCreateProject}
                  onCreateCollection={onCreateCollection}
                  onUpdate={
                    onUpdateItem
                      ? async (patch) => {
                          await onUpdateItem(selected.id, {
                            ...(patch.collectionIds !== undefined
                              ? { collectionIds: patch.collectionIds }
                              : {}),
                            ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
                            updated_at: Date.now(),
                          });
                        }
                      : undefined
                  }
                />
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '0 20px 12px',
                }}
              >
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Start writing…"
                  disabled={!onUpdateItem}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    padding: '14px 0',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: '0.95rem',
                    lineHeight: 1.65,
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div
                style={{
                  flexShrink: 0,
                  padding: '8px 20px 12px',
                  borderTop: '1px solid var(--border)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-faint)',
                  display: 'flex',
                  gap: 16,
                }}
              >
                <span>Updated {formatDateTime(selected.updated_at)}</span>
                <span>Created {formatDateTime(selected.created_at)}</span>
                {dirty && <span style={{ color: 'var(--accent)' }}>Unsaved changes</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
