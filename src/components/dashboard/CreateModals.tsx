import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Collection, Project } from '../../lib/db';
import { Input, ButtonGhost } from '../../styles/primitives';
import { isValidBookmarkUrl } from '../../lib/utils';

const MODAL_Z = 2147483647;

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.5rem 0.65rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text)',
  background: 'var(--input-bg)',
  fontFamily: 'inherit',
};

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({ title, onClose, children, footer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: MODAL_Z,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--bg-panel)',
          color: 'var(--text)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-panel, 0 20px 50px rgba(0,0,0,0.35))',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-glass)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{title}</div>
          <ButtonGhost
            type="button"
            onClick={onClose}
            style={{ padding: '2px 6px', height: 24 }}
            title="Close"
          >
            <X size={14} />
          </ButtonGhost>
        </div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {children}
        </div>
        {footer ? (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'flex-end',
              background: 'var(--bg-glass)',
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
};

const PrimaryButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ active = true, style, children, ...rest }) => (
  <button
    type="button"
    {...rest}
    style={{
      padding: '0.45rem 0.9rem',
      borderRadius: 8,
      border: 'none',
      background: active ? 'var(--accent)' : 'var(--bg-glass)',
      color: active ? 'var(--accent-text, #fff)' : 'var(--text-muted)',
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      cursor: active ? 'pointer' : 'not-allowed',
      ...style,
    }}
  >
    {children}
  </button>
);

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
    <ModalShell
      title="New project"
      onClose={onClose}
      footer={
        <>
          <ButtonGhost type="button" onClick={onClose}>
            Cancel
          </ButtonGhost>
          <PrimaryButton
            active={!!name.trim() && !submitting}
            disabled={!name.trim() || submitting}
            onClick={submit}
          >
            {submitting ? 'Creating…' : 'Create'}
          </PrimaryButton>
        </>
      }
    >
      <div>
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
      <div>
        <label style={labelStyle} htmlFor="new-project-desc">
          Description (optional)
        </label>
        <textarea
          id="new-project-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What is this project about?"
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.4 }}
        />
      </div>
    </ModalShell>
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
  const initialProjectId = useMemo(() => {
    if (defaultProjectId && projects.some((p) => p.id === defaultProjectId)) {
      return defaultProjectId;
    }
    const def = projects.find((p) => p.isDefault);
    return def?.id || projects[0]?.id || '';
  }, [defaultProjectId, projects]);

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
    <ModalShell
      title="New collection"
      onClose={onClose}
      footer={
        <>
          <ButtonGhost type="button" onClick={onClose}>
            Cancel
          </ButtonGhost>
          <PrimaryButton active={canSubmit} disabled={!canSubmit} onClick={submit}>
            {submitting ? 'Creating…' : 'Create'}
          </PrimaryButton>
        </>
      }
    >
      <div>
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
      <div>
        <label style={labelStyle} htmlFor="new-collection-project">
          Project
        </label>
        <select
          id="new-collection-project"
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
      </div>
    </ModalShell>
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
    if (!name || !projectId || !onCreateCollection || creatingCollection) return;
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
    kind === 'note' ? 'Optional. Add a URL if this note refers to a page.' : 'Required for bookmarks; leave empty to save as a note.';

  return (
    <ModalShell
      title={titleText}
      onClose={onClose}
      footer={
        <>
          <ButtonGhost type="button" onClick={onClose}>
            Cancel
          </ButtonGhost>
          <PrimaryButton active={canSubmit} disabled={!canSubmit} onClick={submit}>
            {submitting ? 'Creating…' : 'Create'}
          </PrimaryButton>
        </>
      }
    >
      <div>
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
        <div>
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
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            {urlHelp}
          </div>
        </div>
      )}

      <div>
        <label style={labelStyle} htmlFor="new-item-notes">
          {kind === 'note' ? 'Content' : 'Notes (optional)'}
        </label>
        <textarea
          id="new-item-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={kind === 'note' ? 6 : 4}
          placeholder={kind === 'note' ? 'Write your note…' : 'Add a description'}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {kind === 'note' && (
        <div>
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
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            {urlHelp}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="new-item-project">
              Project
            </label>
            {onCreateProject && (
              <button
                type="button"
                onClick={() => setShowNewProjectInline((v) => !v)}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-glass)',
                  color: 'var(--text)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                + New
              </button>
            )}
          </div>
          <select
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
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                style={{
                  ...fieldStyle,
                  padding: '0.35rem 0.5rem',
                  fontSize: 'var(--text-xs)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createProjectInline();
                }}
              />
              <button
                type="button"
                onClick={() => void createProjectInline()}
                disabled={!newProjectName.trim() || creatingProject}
                style={{
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--accent-text, #fff)',
                  borderRadius: 6,
                  padding: '0 8px',
                  fontSize: 'var(--text-xs)',
                  cursor: !newProjectName.trim() || creatingProject ? 'not-allowed' : 'pointer',
                  opacity: !newProjectName.trim() || creatingProject ? 0.6 : 1,
                }}
              >
                {creatingProject ? '…' : 'Add'}
              </button>
            </div>
          )}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="new-item-collection">
              Collection
            </label>
            {onCreateCollection && (
              <button
                type="button"
                onClick={() => setShowNewCollectionInline((v) => !v)}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-glass)',
                  color: 'var(--text)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                + New
              </button>
            )}
          </div>
          <select
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
          {showNewCollectionInline && onCreateCollection && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Collection name"
                style={{
                  ...fieldStyle,
                  padding: '0.35rem 0.5rem',
                  fontSize: 'var(--text-xs)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createCollectionInline();
                }}
              />
              <button
                type="button"
                onClick={() => void createCollectionInline()}
                disabled={!newCollectionName.trim() || creatingCollection || !projectId}
                style={{
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--accent-text, #fff)',
                  borderRadius: 6,
                  padding: '0 8px',
                  fontSize: 'var(--text-xs)',
                  cursor:
                    !newCollectionName.trim() || creatingCollection || !projectId
                      ? 'not-allowed'
                      : 'pointer',
                  opacity: !newCollectionName.trim() || creatingCollection || !projectId ? 0.6 : 1,
                }}
              >
                {creatingCollection ? '…' : 'Add'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: '0.5rem 0.65rem',
            borderRadius: 8,
            border: '1px solid #ef4444',
            background: 'rgba(239,68,68,0.12)',
            color: '#ef4444',
            fontSize: 'var(--text-xs)',
          }}
        >
          {error}
        </div>
      ) : null}
    </ModalShell>
  );
};
