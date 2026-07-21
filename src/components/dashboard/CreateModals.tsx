import React, { useEffect, useMemo, useState } from 'react';
import type { Collection, Project } from '../../lib/db';
import { Input, ButtonGhost, ButtonPrimary } from '../../styles/primitives';
import { isValidBookmarkUrl } from '../../lib/utils';
import { uiPatterns } from '../../styles/uiPatterns';
import { DialogShell } from './DialogShell';

const labelStyle: React.CSSProperties = uiPatterns.fieldLabel;

const fieldStyle: React.CSSProperties = uiPatterns.fieldInput;

// ─────────────────────────────────────────────────────────────────────────────
// New Project
// ─────────────────────────────────────────────────────────────────────────────

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; description?: string }) => Promise<string | void> | string | void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onCreate({ name: trimmed, description: description.trim() || undefined });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell
      title="New project"
      description="Create a durable home for related collections, material, and workspaces."
      onClose={onClose}
      footer={
        <>
          <ButtonGhost type="button" onClick={onClose}>
            Cancel
          </ButtonGhost>
          <ButtonPrimary
            disabled={!name.trim() || submitting}
            onClick={submit}
          >
            {submitting ? 'Creating…' : 'Create'}
          </ButtonPrimary>
        </>
      }
    >
      <div className="ui-form__group">
        <label style={labelStyle} htmlFor="new-project-name">
          Name
        </label>
        <Input
          id="new-project-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Trading research"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) void submit();
          }}
        />
      </div>
      <div className="ui-form__group">
        <label style={labelStyle} htmlFor="new-project-desc">
          Description (optional)
        </label>
        <textarea
          className="ui-field"
          id="new-project-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What is this project about?"
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.4 }}
        />
      </div>
    </DialogShell>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// New Collection
// ─────────────────────────────────────────────────────────────────────────────

interface NewCollectionModalProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  defaultProjectId?: string;
  onCreate: (data: { name: string; projectId: string }) => Promise<string | void> | string | void;
}

export const NewCollectionModal: React.FC<NewCollectionModalProps> = ({
  open,
  onClose,
  projects,
  defaultProjectId,
  onCreate,
}) => {
  const eligibleProjects = useMemo(() => projects.filter((project) => !project.isDefault), [projects]);
  const initialProjectId = useMemo(() => {
    if (defaultProjectId && eligibleProjects.some((p) => p.id === defaultProjectId)) {
      return defaultProjectId;
    }
    return eligibleProjects[0]?.id || '';
  }, [defaultProjectId, eligibleProjects]);

  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setProjectId(initialProjectId);
      setSubmitting(false);
    }
  }, [open, initialProjectId]);

  if (!open) return null;

  const canSubmit = !!name.trim() && !!projectId && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onCreate({ name: name.trim(), projectId });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell
      title="New collection"
      description="Create a focused section inside a project."
      onClose={onClose}
      footer={
        <>
          <ButtonGhost type="button" onClick={onClose}>
            Cancel
          </ButtonGhost>
          <ButtonPrimary disabled={!canSubmit} onClick={submit}>
            {submitting ? 'Creating…' : 'Create'}
          </ButtonPrimary>
        </>
      }
    >
      <div className="ui-form__group">
        <label style={labelStyle} htmlFor="new-collection-name">
          Name
        </label>
        <Input
          id="new-collection-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Reading list"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) void submit();
          }}
        />
      </div>
      <div className="ui-form__group">
        <label style={labelStyle} htmlFor="new-collection-project">
          Project
        </label>
        <select
          className="ui-field"
          id="new-collection-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          style={fieldStyle}
        >
          {eligibleProjects.length === 0 && <option value="">Create a project first</option>}
          {eligibleProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </DialogShell>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// New Item (bookmark or note)
// ─────────────────────────────────────────────────────────────────────────────

export type NewItemKind = 'bookmark' | 'note';

interface NewItemModalProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  collections: Collection[];
  /** Tailors copy and field order. URL is still optional in both modes. */
  kind?: NewItemKind;
  /** Pre-select project (e.g. from current Bookmarks/Notes filter). */
  defaultProjectId?: string;
  /** Pre-select collection if known. */
  defaultCollectionId?: string;
  /** Optional inline creation helpers shown inside this modal. */
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onCreate: (data: {
    title: string;
    url?: string;
    notes?: string;
    collectionIds: string[];
  }) => Promise<void> | void;
}

const isUnsorted = (c: Collection) => c.isDefault || /^unsorted$/i.test(c.name);

export const NewItemModal: React.FC<NewItemModalProps> = ({
  open,
  onClose,
  projects,
  collections,
  kind = 'bookmark',
  defaultProjectId,
  defaultCollectionId,
  onCreateProject,
  onCreateCollection,
  onCreate,
}) => {
  const initialProjectId = useMemo(() => {
    if (defaultProjectId && projects.some((p) => p.id === defaultProjectId)) {
      return defaultProjectId;
    }
    if (defaultCollectionId) {
      const c = collections.find((cc) => cc.id === defaultCollectionId);
      if (c?.primaryProjectId) return c.primaryProjectId;
    }
    const def = projects.find((p) => p.isDefault);
    return def?.id || projects[0]?.id || '';
  }, [defaultProjectId, defaultCollectionId, projects, collections]);

  const collectionsForProject = (pid: string) =>
    collections.filter(
      (c) => c.primaryProjectId === pid || (Array.isArray(c.projectIds) && c.projectIds.includes(pid))
    );

  const initialCollectionId = useMemo(() => {
    if (defaultCollectionId && collections.some((c) => c.id === defaultCollectionId)) {
      return defaultCollectionId;
    }
    const cols = collectionsForProject(initialProjectId);
    const unsorted = cols.find(isUnsorted);
    return unsorted?.id || cols[0]?.id || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCollectionId, initialProjectId, collections]);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId);
  const [collectionId, setCollectionId] = useState(initialCollectionId);
  const [showNewProjectInline, setShowNewProjectInline] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [showNewCollectionInline, setShowNewCollectionInline] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setUrl('');
      setNotes('');
      setProjectId(initialProjectId);
      setCollectionId(initialCollectionId);
      setShowNewProjectInline(false);
      setNewProjectName('');
      setCreatingProject(false);
      setShowNewCollectionInline(false);
      setNewCollectionName('');
      setCreatingCollection(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialProjectId, initialCollectionId]);

  // When the project changes, snap the collection to that project's Unsorted (or first).
  useEffect(() => {
    if (!projectId) return;
    const cols = collectionsForProject(projectId);
    if (cols.find((c) => c.id === collectionId)) return;
    const unsorted = cols.find(isUnsorted);
    setCollectionId(unsorted?.id || cols[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, collections]);

  if (!open) return null;

  const projectCollections = collectionsForProject(projectId);
  const selectedProjectIsInbox = projects.find((project) => project.id === projectId)?.isDefault === true;

  const canSubmit = !!title.trim() && !!collectionId && !submitting;

  const createProjectInline = async () => {
    const name = newProjectName.trim();
    if (!name || !onCreateProject || creatingProject) return;
    setError(null);
    setCreatingProject(true);
    try {
      const createdId = await onCreateProject({ name });
      if (createdId) setProjectId(createdId);
      setShowNewProjectInline(false);
      setNewProjectName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const createCollectionInline = async () => {
    const name = newCollectionName.trim();
    if (!name || !projectId || selectedProjectIsInbox || !onCreateCollection || creatingCollection) return;
    setError(null);
    setCreatingCollection(true);
    try {
      const createdId = await onCreateCollection({ name, projectId });
      if (createdId) setCollectionId(createdId);
      setShowNewCollectionInline(false);
      setNewCollectionName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setCreatingCollection(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (url.trim() && !isValidBookmarkUrl(url.trim())) {
      setError('URL must be http(s) or a local file (file://)');
      return;
    }
    if (!collectionId) {
      setError('Pick a collection');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
        collectionIds: [collectionId],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const titleText = kind === 'note' ? 'New note' : 'Add bookmark';
  const urlHelp =
    kind === 'note' ? 'Optional. Add a URL if this note refers to a page.' : 'Add a URL for a bookmark, or leave it empty to create a note instead.';

  return (
    <DialogShell
      title={titleText}
      description={kind === 'note' ? 'Capture an idea and organize it now or refine it later.' : 'Save a useful page and choose where it belongs.'}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <ButtonGhost type="button" onClick={onClose}>
            Cancel
          </ButtonGhost>
          <ButtonPrimary disabled={!canSubmit} onClick={submit}>
            {submitting ? 'Creating…' : 'Create'}
          </ButtonPrimary>
        </>
      }
    >
      <div className="ui-form__group">
        <label style={labelStyle} htmlFor="new-item-title">
          Title
        </label>
        <Input
          id="new-item-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'note' ? 'Note title' : 'Bookmark title'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) void submit();
          }}
        />
      </div>

      {kind === 'bookmark' && (
        <div className="ui-form__group">
          <label style={labelStyle} htmlFor="new-item-url">
            URL
          </label>
          <Input
            id="new-item-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
          />
          <div className="ui-form__help">
            {urlHelp}
          </div>
        </div>
      )}

      <div className="ui-form__group">
        <label style={labelStyle} htmlFor="new-item-notes">
          {kind === 'note' ? 'Content' : 'Notes (optional)'}
        </label>
        <textarea
          className="ui-field"
          id="new-item-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={kind === 'note' ? 8 : 5}
          placeholder={kind === 'note' ? 'Write your note…' : 'Add a description'}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {kind === 'note' && (
        <div className="ui-form__group">
          <label style={labelStyle} htmlFor="new-item-url-note">
            URL (optional)
          </label>
          <Input
            id="new-item-url-note"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
          />
          <div className="ui-form__help">
            {urlHelp}
          </div>
        </div>
      )}

      <div className="ui-form__grid">
        <div className="ui-form__group">
          <div className="ui-form__label-row">
            <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="new-item-project">
              Project
            </label>
            {onCreateProject && (
              <button
                className="ui-button ui-button--secondary ui-button--compact"
                type="button"
                onClick={() => setShowNewProjectInline((v) => !v)}
              >
                + New
              </button>
            )}
          </div>
          <select
            className="ui-field"
            id="new-item-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={fieldStyle}
          >
            {projects.length === 0 && <option value="">No projects available</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
          {showNewProjectInline && onCreateProject && (
            <div className="ui-form__inline-create">
              <input
                className="ui-field"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                style={fieldStyle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createProjectInline();
                }}
              />
              <button
                className="ui-button ui-button--primary ui-button--compact"
                type="button"
                onClick={() => void createProjectInline()}
                disabled={!newProjectName.trim() || creatingProject}
              >
                {creatingProject ? '…' : 'Add'}
              </button>
            </div>
          )}
        </div>
        <div className="ui-form__group">
          <div className="ui-form__label-row">
            <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="new-item-collection">
              Collection
            </label>
            {onCreateCollection && !selectedProjectIsInbox && (
              <button
                className="ui-button ui-button--secondary ui-button--compact"
                type="button"
                onClick={() => setShowNewCollectionInline((v) => !v)}
              >
                + New
              </button>
            )}
          </div>
          <select
            className="ui-field"
            id="new-item-collection"
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            style={fieldStyle}
          >
            {projectCollections.length === 0 && <option value="">No collections</option>}
            {projectCollections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {isUnsorted(c) ? ' (default)' : ''}
              </option>
            ))}
          </select>
          {showNewCollectionInline && onCreateCollection && !selectedProjectIsInbox && (
            <div className="ui-form__inline-create">
              <input
                className="ui-field"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Collection name"
                style={fieldStyle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createCollectionInline();
                }}
              />
              <button
                className="ui-button ui-button--primary ui-button--compact"
                type="button"
                onClick={() => void createCollectionInline()}
                disabled={!newCollectionName.trim() || creatingCollection || !projectId}
              >
                {creatingCollection ? '…' : 'Add'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="ui-status" data-tone="error" role="alert">
          {error}
        </div>
      ) : null}
    </DialogShell>
  );
};
