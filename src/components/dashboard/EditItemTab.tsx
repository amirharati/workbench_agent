import React, { useEffect, useMemo, useState } from 'react';
import type { Collection, Item, Project } from '../../lib/db';
import { isValidBookmarkUrl } from '../../lib/utils';
import { Input, ButtonGhost } from '../../styles/primitives';
import { X } from 'lucide-react';

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
      notesPlacementCollectionId?: string;
    }
  ) => Promise<void>;
  onCancel?: () => void;
}

const isUnsorted = (c: Collection) => c.isDefault || /^unsorted$/i.test(c.name);

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
  const initialProjectId = useMemo(() => {
    if (defaultProjectId && projects.some((p) => p.id === defaultProjectId)) return defaultProjectId;
    const firstCollectionId = (item.collectionIds || [])[0];
    if (firstCollectionId) {
      const c = collections.find((cc) => cc.id === firstCollectionId);
      if (c?.primaryProjectId) return c.primaryProjectId;
    }
    return projects.find((p) => p.isDefault)?.id || projects[0]?.id || '';
  }, [defaultProjectId, item.collectionIds, collections, projects]);

  const placementNotesForCollection = (collectionId: string) => {
    if (!collectionId) return item.notes || '';
    return item.placements?.[collectionId]?.notes ?? item.notes ?? '';
  };

  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url || '');
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selectedCollectionId, setSelectedCollectionId] = useState(item.collectionIds?.[0] || '');
  const [notes, setNotes] = useState(placementNotesForCollection(item.collectionIds?.[0] || ''));
  const [newProjectName, setNewProjectName] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collectionsForProject = useMemo(
    () =>
      collections.filter(
        (c) =>
          c.primaryProjectId === selectedProjectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(selectedProjectId))
      ),
    [collections, selectedProjectId]
  );

  useEffect(() => {
    setTitle(item.title);
    setUrl(item.url || '');
    const cid = item.collectionIds?.[0] || '';
    setSelectedProjectId(initialProjectId);
    setSelectedCollectionId(cid);
    setNotes(placementNotesForCollection(cid));
  }, [item.id, item.title, item.url, item.notes, item.collectionIds, item.placements, initialProjectId]);

  // When user switches collection in the form, show notes for that placement only.
  useEffect(() => {
    setNotes(placementNotesForCollection(selectedCollectionId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placementNotesForCollection reads latest item
  }, [selectedCollectionId, item.id, item.placements, item.notes]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (collectionsForProject.some((c) => c.id === selectedCollectionId)) return;
    const unsorted = collectionsForProject.find(isUnsorted);
    setSelectedCollectionId(unsorted?.id || collectionsForProject[0]?.id || '');
  }, [selectedProjectId, collectionsForProject, selectedCollectionId]);

  const handleCreateProjectInline = async () => {
    const name = newProjectName.trim();
    if (!name || !onCreateProject || creatingProject) return;
    setError(null);
    setCreatingProject(true);
    try {
      const createdId = await onCreateProject({ name });
      if (createdId) setSelectedProjectId(createdId);
      setNewProjectName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateCollectionInline = async () => {
    const name = newCollectionName.trim();
    if (!name || !selectedProjectId || !onCreateCollection || creatingCollection) return;
    setError(null);
    setCreatingCollection(true);
    try {
      const createdId = await onCreateCollection({ name, projectId: selectedProjectId });
      if (createdId) setSelectedCollectionId(createdId);
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
    setIsSaving(true);
    try {
      let preservedCollectionIds =
        item.collectionIds && item.collectionIds.length > 0 ? [...item.collectionIds] : [];
      if (selectedCollectionId && !preservedCollectionIds.includes(selectedCollectionId)) {
        preservedCollectionIds = [...preservedCollectionIds, selectedCollectionId];
      }
      if (preservedCollectionIds.length === 0 && selectedCollectionId) {
        preservedCollectionIds = [selectedCollectionId];
      }

      const notesPlacementId = selectedCollectionId || item.collectionIds?.[0];

      await onSave(item.id, {
        title: title.trim(),
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
        collectionIds: preservedCollectionIds,
        notesPlacementCollectionId: notesPlacementId || undefined,
      });
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
          <ButtonGhost onClick={onCancel} style={{ padding: '0.25rem' }} title="Close">
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

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
                Project
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-glass)', color: 'var(--text)' }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {onCreateProject && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="New project"
                    style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-glass)', color: 'var(--text)', fontSize: '0.8rem' }}
                  />
                  <button type="button" onClick={() => void handleCreateProjectInline()} disabled={!newProjectName.trim() || creatingProject} style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)' }}>
                    +
                  </button>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
                Collection
              </label>
              <select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-glass)', color: 'var(--text)' }}
              >
                <option value="">Unsorted (default)</option>
                {collectionsForProject.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {onCreateCollection && selectedProjectId && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="New collection"
                    style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-glass)', color: 'var(--text)', fontSize: '0.8rem' }}
                  />
                  <button type="button" onClick={() => void handleCreateCollectionInline()} disabled={!newCollectionName.trim() || creatingCollection} style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)' }}>
                    +
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            {onCancel && (
              <ButtonGhost type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem' }}>
                Cancel
              </ButtonGhost>
            )}
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              style={{
                padding: '0.5rem 1.5rem',
                background: isSaving || !title.trim() ? 'var(--bg-glass)' : 'var(--accent)',
                color: isSaving || !title.trim() ? 'var(--text-muted)' : '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: isSaving || !title.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
