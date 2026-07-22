import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Pencil, Save, X } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import { BookmarkUrlLink, openBookmarkInBrowser } from './BookmarkUrlLink';
import { ItemFavoriteButton } from './ItemFavoriteButton';
import { ItemOrganizationEditor } from './ItemOrganizationEditor';
import { uiPatterns } from '../../styles/uiPatterns';

interface ItemWorkspaceProps {
  item: Item;
  projects: Project[];
  collections: Collection[];
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  trailingActions?: React.ReactNode;
}

type Draft = { title: string; url: string; notes: string };

const draftFromItem = (item: Item): Draft => ({
  title: item.title || '',
  url: item.url || '',
  notes: item.notes || '',
});

/** Editable in-page item surface; Focus changes canvas size, not capabilities. */
export const ItemWorkspace: React.FC<ItemWorkspaceProps> = ({
  item,
  projects,
  collections,
  onUpdateItem,
  onCreateProject,
  onCreateCollection,
  trailingActions,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFromItem(item));
  const [baseline, setBaseline] = useState<Draft>(() => draftFromItem(item));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = draftFromItem(item);
    setDraft(next);
    setBaseline(next);
    setEditing(false);
    setSaved(false);
    setError(null);
  }, [item.id]);

  const dirty =
    draft.title !== baseline.title ||
    draft.url !== baseline.url ||
    draft.notes !== baseline.notes;

  const startEditing = () => {
    const next = draftFromItem(item);
    setDraft(next);
    setBaseline(next);
    setSaved(false);
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(baseline);
    setEditing(false);
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    if (!onUpdateItem || saving || !dirty) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await onUpdateItem(item.id, {
        title: draft.title,
        url: draft.url || undefined,
        notes: draft.notes || undefined,
        updated_at: Date.now(),
      });
      setBaseline(draft);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save item');
    } finally {
      setSaving(false);
    }
  };

  const canEdit = Boolean(onUpdateItem) && item.deletedAt == null;

  return (
    <div className="ui-item-workspace">
      <div className="ui-item-workspace__header">
        <div className="ui-item-workspace__heading" style={{ minWidth: 0, flex: 1 }}>
          {editing ? (
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Title"
              aria-label="Item title"
              className="ui-field ui-item-workspace__title-input"
              style={titleInputStyle}
            />
          ) : (
            <h2 className="ui-item-workspace__title">{item.title || 'Untitled'}</h2>
          )}
          {!editing && item.url && <BookmarkUrlLink item={item} style={{ marginTop: 6 }} />}
        </div>
        <div className="ui-item-workspace__actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          <ItemFavoriteButton item={item} onUpdateItem={onUpdateItem} showLabel />
          {item.url && !editing && (
            <button className="ui-button ui-button--secondary" type="button" onClick={() => void openBookmarkInBrowser(item)} style={secondaryButtonStyle}>
              <ExternalLink size={12} /> Open
            </button>
          )}
          {!editing && canEdit && (
            <button className="ui-button ui-button--secondary" type="button" onClick={startEditing} style={secondaryButtonStyle}>
              <Pencil size={12} /> Edit
            </button>
          )}
          {editing && (
            <>
              {saved && <span className="ui-item-workspace__saved"><Check size={11} /> Saved</span>}
              <button className="ui-button ui-button--secondary" type="button" onClick={cancelEditing} style={secondaryButtonStyle}>
                <X size={12} /> Done
              </button>
              <button className="ui-button ui-button--primary" type="button" disabled={!dirty || saving} onClick={() => void save()} style={{ ...primaryButtonStyle, opacity: !dirty || saving ? 0.5 : 1 }}>
                <Save size={12} /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
              </button>
            </>
          )}
          {trailingActions}
        </div>
      </div>

      {error && <div className="ui-item-workspace__error" role="alert">{error}</div>}

      {editing && item.url && (
        <section className="ui-item-workspace__section">
          <label style={fieldLabelStyle}>
            URL
            <input
              className="ui-field"
              type="url"
              value={draft.url}
              onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://…"
              style={fieldInputStyle}
            />
          </label>
        </section>
      )}

      <section className="ui-item-workspace__section" aria-labelledby={`item-organization-${item.id}`}>
        <h3 id={`item-organization-${item.id}`} className="ui-item-workspace__section-title">Organization</h3>
        <ItemOrganizationEditor
          item={item}
          projects={projects}
          collections={collections}
          editable={canEdit}
          compact
          onCreateProject={onCreateProject}
          onCreateCollection={onCreateCollection}
          onUpdate={
            onUpdateItem
              ? (patch) => onUpdateItem(item.id, { ...patch, updated_at: Date.now() })
              : undefined
          }
        />
      </section>

      <section className="ui-item-workspace__section">
        <label style={fieldLabelStyle}>
          {item.url ? 'Notes' : 'Note'}
          {editing ? (
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder={item.url ? 'Add notes…' : 'Start writing…'}
              className="ui-field"
              style={notesInputStyle}
            />
          ) : (
            <span className="ui-item-workspace__notes" data-empty={item.notes ? 'false' : 'true'}>
              {item.notes || (item.url ? 'No notes yet.' : 'Empty note.')}
            </span>
          )}
        </label>
      </section>
    </div>
  );
};

const secondaryButtonStyle = uiPatterns.secondaryButton;
const primaryButtonStyle = uiPatterns.primaryButton;
const titleInputStyle: React.CSSProperties = { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '6px 9px', border: '1px solid var(--border-active)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)', color: 'var(--text)', fontSize: 'var(--text-lg)', fontWeight: 650, outline: 'none' };
const fieldLabelStyle = uiPatterns.fieldLabel;
const fieldInputStyle = uiPatterns.fieldInput;
const notesInputStyle: React.CSSProperties = { ...fieldInputStyle, minHeight: 130, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 };
