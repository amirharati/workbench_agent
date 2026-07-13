import React, { useEffect, useMemo, useState } from 'react';
import type { Collection, Item, Project } from '../../lib/db';
import { isValidBookmarkUrl } from '../../lib/utils';
import { Input, ButtonGhost } from '../../styles/primitives';
import { X } from 'lucide-react';
import { ItemOrganizationEditor } from './ItemOrganizationEditor';

interface EditItemTabProps {
  item: Item;
  collections: Collection[];
  projects: Project[];
  defaultProjectId?: string;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onSave: (
    id: string,
    data: {
      title: string;
      url?: string;
      notes?: string;
      collectionIds: string[];
      tags?: string[];
      notesPlacementCollectionId?: string;
    }
  ) => Promise<void>;
  onCancel?: () => void;
}

export const EditItemTab: React.FC<EditItemTabProps> = ({
  item,
  collections,
  projects,
  defaultProjectId,
  onCreateProject,
  onCreateCollection,
  onSave,
  onCancel,
}) => {
  const placementNotesForCollection = (collectionId: string) => {
    if (!collectionId) return item.notes || '';
    return item.placements?.[collectionId]?.notes ?? item.notes ?? '';
  };

  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url || '');
  const [membershipIds, setMembershipIds] = useState<string[]>(
    item.collectionIds?.length ? [...item.collectionIds] : []
  );
  const [tags, setTags] = useState<string[]>(item.tags ? [...item.tags] : []);
  const [notesPlacementId, setNotesPlacementId] = useState(item.collectionIds?.[0] || '');
  const [notes, setNotes] = useState(placementNotesForCollection(item.collectionIds?.[0] || ''));
  const [newProjectName, setNewProjectName] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [inlineProjectId, setInlineProjectId] = useState(
    defaultProjectId || projects.find((p) => p.isDefault)?.id || projects[0]?.id || ''
  );
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [baseline, setBaseline] = useState(() => ({
    title: item.title,
    url: item.url || '',
    membershipIds: item.collectionIds?.length ? [...item.collectionIds] : ([] as string[]),
    tags: item.tags ? [...item.tags] : ([] as string[]),
    notesPlacementId: item.collectionIds?.[0] || '',
    notes: placementNotesForCollection(item.collectionIds?.[0] || ''),
  }));

  const collectionsForInlineProject = useMemo(
    () =>
      collections.filter(
        (c) =>
          c.primaryProjectId === inlineProjectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(inlineProjectId))
      ),
    [collections, inlineProjectId]
  );

  useEffect(() => {
    const ids = item.collectionIds?.length ? [...item.collectionIds] : [];
    const cid = ids[0] || '';
    const next = {
      title: item.title,
      url: item.url || '',
      membershipIds: ids,
      tags: item.tags ? [...item.tags] : [],
      notesPlacementId: cid,
      notes: placementNotesForCollection(cid),
    };
    setTitle(next.title);
    setUrl(next.url);
    setMembershipIds(next.membershipIds);
    setTags(next.tags);
    setNotesPlacementId(next.notesPlacementId);
    setNotes(next.notes);
    setBaseline(next);
    setSavedFlash(false);
  }, [item.id]);

  useEffect(() => {
    if (!notesPlacementId || !membershipIds.includes(notesPlacementId)) {
      setNotesPlacementId(membershipIds[0] || '');
    }
  }, [membershipIds, notesPlacementId]);

  // When switching notes placement, load that collection's notes from the item
  // only if the field still matches the previous placement's stored value.
  useEffect(() => {
    setNotes(placementNotesForCollection(notesPlacementId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads latest item placements
  }, [notesPlacementId]);

  const dirty =
    title !== baseline.title ||
    url !== baseline.url ||
    notes !== baseline.notes ||
    notesPlacementId !== baseline.notesPlacementId ||
    tags.join('\0') !== baseline.tags.join('\0') ||
    membershipIds.join('\0') !== baseline.membershipIds.join('\0');

  const handleUndo = () => {
    setTitle(baseline.title);
    setUrl(baseline.url);
    setMembershipIds([...baseline.membershipIds]);
    setTags([...baseline.tags]);
    setNotesPlacementId(baseline.notesPlacementId);
    setNotes(baseline.notes);
    setError(null);
    setSavedFlash(false);
  };

  const handleCreateProjectInline = async () => {
    const name = newProjectName.trim();
    if (!name || !onCreateProject || creatingProject) return;
    setError(null);
    setCreatingProject(true);
    try {
      const createdId = await onCreateProject({ name });
      if (createdId) setInlineProjectId(createdId);
      setNewProjectName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateCollectionInline = async () => {
    const name = newCollectionName.trim();
    if (!name || !inlineProjectId || !onCreateCollection || creatingCollection) return;
    setError(null);
    setCreatingCollection(true);
    try {
      const createdId = await onCreateCollection({ name, projectId: inlineProjectId });
      if (createdId && !membershipIds.includes(createdId)) {
        setMembershipIds([...membershipIds, createdId]);
      }
      setNewCollectionName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setCreatingCollection(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (url.trim() && !isValidBookmarkUrl(url.trim())) {
      setError('URL must be http(s) or a local file (file://)');
      return;
    }
    if (membershipIds.length === 0) {
      setError('Pick at least one collection');
      return;
    }
    setIsSaving(true);
    try {
      const nextBaseline = {
        title: title.trim(),
        url: url.trim(),
        membershipIds: [...membershipIds],
        tags: [...tags],
        notesPlacementId: notesPlacementId || membershipIds[0] || '',
        notes: notes.trim(),
      };
      await onSave(item.id, {
        title: nextBaseline.title,
        url: nextBaseline.url || undefined,
        notes: nextBaseline.notes || undefined,
        collectionIds: nextBaseline.membershipIds,
        tags: nextBaseline.tags,
        notesPlacementCollectionId: nextBaseline.notesPlacementId || nextBaseline.membershipIds[0],
      });
      setBaseline(nextBaseline);
      setTitle(nextBaseline.title);
      setUrl(nextBaseline.url);
      setNotes(nextBaseline.notes);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
    } finally {
      setIsSaving(false);
    }
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
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>Edit Item</h2>
        {onCancel && (
          <ButtonGhost onClick={onCancel} style={{ padding: '0.25rem' }} title="Done">
            <X size={16} />
          </ButtonGhost>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
              Title <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
              URL (optional)
            </label>
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Leave empty for a note (no URL)
            </div>
          </div>

          <div style={{ width: '100%', minWidth: 0 }}>
            <ItemOrganizationEditor
              item={item}
              collections={collections}
              projects={projects}
              editable
              collectionIds={membershipIds}
              tags={tags}
              onLocalChange={({ collectionIds, tags: nextTags }) => {
                setMembershipIds(collectionIds);
                setTags(nextTags);
              }}
            />
          </div>

          {(onCreateProject || onCreateCollection) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {onCreateProject && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    New project
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Name"
                      style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-glass)', color: 'var(--text)', fontSize: '0.8rem' }}
                    />
                    <button type="button" onClick={() => void handleCreateProjectInline()} disabled={!newProjectName.trim() || creatingProject} style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)' }}>
                      +
                    </button>
                  </div>
                </div>
              )}
              {onCreateCollection && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    New collection
                  </label>
                  <select
                    value={inlineProjectId}
                    onChange={(e) => setInlineProjectId(e.target.value)}
                    style={{ width: '100%', marginBottom: 6, padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-glass)', color: 'var(--text)', fontSize: '0.8rem' }}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      placeholder="Name"
                      style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-glass)', color: 'var(--text)', fontSize: '0.8rem' }}
                    />
                    <button type="button" onClick={() => void handleCreateCollectionInline()} disabled={!newCollectionName.trim() || creatingCollection || !inlineProjectId} style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)' }}>
                      +
                    </button>
                  </div>
                  {collectionsForInlineProject.length === 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)', marginTop: 4 }}>No collections in this project yet</div>
                  )}
                </div>
              )}
            </div>
          )}

          {membershipIds.length > 1 && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
                Notes for collection
              </label>
              <select
                value={notesPlacementId}
                onChange={(e) => setNotesPlacementId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-glass)', color: 'var(--text)' }}
              >
                {membershipIds.map((cid) => {
                  const c = collections.find((col) => col.id === cid);
                  const p = c ? projects.find((proj) => proj.id === c.primaryProjectId) : undefined;
                  return (
                    <option key={cid} value={cid}>
                      {p?.name || '?'} / {c?.name || cid}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={8}
              style={{
                width: '100%',
                minHeight: 160,
                padding: '0.75rem',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
          </div>

          {error && (
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {savedFlash && (
              <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600, marginRight: 'auto' }}>
                Saved
              </span>
            )}
            <ButtonGhost
              type="button"
              onClick={handleUndo}
              disabled={!dirty || isSaving}
              style={{ padding: '0.5rem 1rem', opacity: dirty ? 1 : 0.45 }}
              title="Restore last saved values"
            >
              Undo
            </ButtonGhost>
            {onCancel && (
              <ButtonGhost type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem' }}>
                Done
              </ButtonGhost>
            )}
            <button
              type="submit"
              disabled={isSaving || !title.trim() || membershipIds.length === 0 || !dirty}
              style={{
                padding: '0.5rem 1.5rem',
                background:
                  isSaving || !title.trim() || membershipIds.length === 0 || !dirty
                    ? 'var(--bg-glass)'
                    : 'var(--accent)',
                color:
                  isSaving || !title.trim() || membershipIds.length === 0 || !dirty
                    ? 'var(--text-muted)'
                    : '#fff',
                border: 'none',
                borderRadius: 8,
                cursor:
                  isSaving || !title.trim() || membershipIds.length === 0 || !dirty
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              {isSaving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
