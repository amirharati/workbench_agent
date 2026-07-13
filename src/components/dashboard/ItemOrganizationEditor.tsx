import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Collection, Item, Project } from '../../lib/db';

const isUnsorted = (c: Collection) => c.isDefault || /^unsorted$/i.test(c.name);

export type ItemOrganizationPatch = {
  collectionIds?: string[];
  tags?: string[];
};

export interface ItemOrganizationEditorProps {
  item: Item;
  collections: Collection[];
  projects: Project[];
  /** When false, controls stay visible but disabled (stable layout vs view/edit). */
  editable?: boolean;
  /**
   * Immediate persist for membership/tags.
   * When omitted (e.g. parent form), use controlled `collectionIds`/`tags` + `onLocalChange`.
   */
  onUpdate?: (patch: ItemOrganizationPatch) => Promise<void> | void;
  /** Controlled membership when editing inside a Save form. */
  collectionIds?: string[];
  tags?: string[];
  onLocalChange?: (patch: { collectionIds: string[]; tags: string[] }) => void;
  compact?: boolean;
}

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  maxWidth: '100%',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 'var(--text-xs)',
  color: 'var(--text)',
  lineHeight: 1.35,
  boxSizing: 'border-box',
  // Keep chip as one unit; row wraps instead of stretching the panel.
  flex: '0 1 auto',
  minWidth: 0,
};

export const ItemOrganizationEditor: React.FC<ItemOrganizationEditorProps> = ({
  item,
  collections,
  projects,
  editable = true,
  onUpdate,
  collectionIds: controlledCollectionIds,
  tags: controlledTags,
  onLocalChange,
  compact = false,
}) => {
  // Write path exists → always render the same chrome (view/edit won't reflow).
  const hasWritePath = !!onUpdate || !!onLocalChange;
  const canMutate = editable && hasWritePath;

  const membershipIds = controlledCollectionIds ?? item.collectionIds ?? [];
  const tagList = controlledTags ?? item.tags ?? [];

  const [addProjectId, setAddProjectId] = useState('');
  const [addCollectionId, setAddCollectionId] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const memberships = useMemo(() => {
    return membershipIds
      .map((cid) => {
        const collection = collections.find((c) => c.id === cid);
        if (!collection) return null;
        const project = projects.find((p) => p.id === collection.primaryProjectId);
        return { collection, project };
      })
      .filter(Boolean) as { collection: Collection; project: Project | undefined }[];
  }, [membershipIds, collections, projects]);

  const collectionsForAddProject = useMemo(
    () =>
      collections.filter(
        (c) =>
          c.primaryProjectId === addProjectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(addProjectId))
      ),
    [collections, addProjectId]
  );

  useEffect(() => {
    if (!hasWritePath) return;
    if (!addProjectId && projects.length > 0) {
      const firstMember = memberships[0];
      setAddProjectId(
        firstMember?.project?.id ||
          projects.find((p) => p.isDefault)?.id ||
          projects[0]?.id ||
          ''
      );
    }
  }, [addProjectId, projects, memberships, hasWritePath]);

  useEffect(() => {
    if (!hasWritePath) return;
    if (!addProjectId) return;
    if (collectionsForAddProject.some((c) => c.id === addCollectionId)) return;
    const unsorted = collectionsForAddProject.find(isUnsorted);
    const available = collectionsForAddProject.find((c) => !membershipIds.includes(c.id));
    setAddCollectionId(available?.id || unsorted?.id || collectionsForAddProject[0]?.id || '');
  }, [addProjectId, collectionsForAddProject, addCollectionId, membershipIds, hasWritePath]);

  const applyPatch = async (patch: ItemOrganizationPatch) => {
    if (!canMutate || busyRef.current) return;
    setError(null);
    const nextCollectionIds = patch.collectionIds ?? membershipIds;
    const nextTags = patch.tags ?? tagList;

    // Form mode (Save later): update local draft only — do not pretend it persisted.
    if (onLocalChange && !onUpdate) {
      onLocalChange({ collectionIds: nextCollectionIds, tags: nextTags });
      return;
    }

    if (!onUpdate) return;

    busyRef.current = true;
    setBusy(true);
    try {
      await onUpdate(patch);
      // Parent props are source of truth after persist; only sync local draft if form also tracks it.
      if (onLocalChange) {
        onLocalChange({ collectionIds: nextCollectionIds, tags: nextTags });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const removeMembership = (cid: string) => {
    if (membershipIds.length <= 1) {
      setError('Keep at least one collection');
      return;
    }
    void applyPatch({ collectionIds: membershipIds.filter((id) => id !== cid) });
  };

  const addMembership = () => {
    if (!addCollectionId) return;
    if (membershipIds.includes(addCollectionId)) {
      setError('Already in that collection');
      return;
    }
    void applyPatch({ collectionIds: [...membershipIds, addCollectionId] });
  };

  const normalizeTag = (raw: string) => raw.trim().replace(/^#/, '');

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    if (tagList.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setTagDraft('');
      return;
    }
    setTagDraft('');
    void applyPatch({ tags: [...tagList, tag] });
  };

  const removeTag = (tag: string) => {
    void applyPatch({ tags: tagList.filter((t) => t !== tag) });
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  };

  const chipRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'flex-start',
    gap: 6,
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    minWidth: 0,
    padding: compact ? '4px 6px' : '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-input, var(--bg-glass))',
    color: 'var(--text)',
    fontSize: 'var(--text-sm)',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 10,
        // Fill parent width so chip count never grows/shrinks the panel.
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', minWidth: 0 }}>
        <div style={labelStyle}>Saved in</div>
        <div style={chipRowStyle}>
          {memberships.length === 0 ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>No collections</span>
          ) : (
            memberships.map(({ collection, project }) => (
              <span
                key={collection.id}
                title={`${project?.name || 'Unassigned'} / ${collection.name}`}
                style={{
                  ...chipBase,
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: collection.color || 'var(--accent)',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {project?.name || 'Unassigned'} / {collection.name}
                </span>
                {hasWritePath && (
                  <button
                    type="button"
                    title={
                      !canMutate
                        ? 'Switch to Edit to change collections'
                        : membershipIds.length <= 1
                          ? 'Keep at least one collection'
                          : 'Remove'
                    }
                    disabled={!canMutate || busy || membershipIds.length <= 1}
                    onClick={() => removeMembership(collection.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      marginLeft: 2,
                      cursor: !canMutate || membershipIds.length <= 1 ? 'default' : 'pointer',
                      color: 'var(--text-muted)',
                      display: 'inline-flex',
                      flexShrink: 0,
                      opacity: !canMutate || membershipIds.length <= 1 ? 0.35 : 1,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))
          )}
        </div>
      </div>

      {hasWritePath && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
            gap: 6,
            width: '100%',
            minWidth: 0,
            alignItems: 'center',
            opacity: canMutate ? 1 : 0.55,
          }}
        >
          <select
            value={addProjectId}
            onChange={(e) => setAddProjectId(e.target.value)}
            disabled={!canMutate || busy}
            style={selectStyle}
            aria-label="Project"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={addCollectionId}
            onChange={(e) => setAddCollectionId(e.target.value)}
            disabled={!canMutate || busy || collectionsForAddProject.length === 0}
            style={selectStyle}
            aria-label="Collection"
          >
            {collectionsForAddProject.map((c) => (
              <option key={c.id} value={c.id} disabled={membershipIds.includes(c.id)}>
                {c.name}
                {membershipIds.includes(c.id) ? ' (already)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addMembership}
            disabled={!canMutate || busy || !addCollectionId || membershipIds.includes(addCollectionId)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: compact ? '4px 8px' : '6px 10px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-text, #fff)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: !canMutate ? 'default' : 'pointer',
              opacity:
                !canMutate || busy || !addCollectionId || membershipIds.includes(addCollectionId)
                  ? 0.5
                  : 1,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={12} /> Add
          </button>
        </div>
      )}

      <div style={{ width: '100%', minWidth: 0 }}>
        <div style={labelStyle}>Tags</div>
        <div style={chipRowStyle}>
          {tagList.length === 0 && !hasWritePath ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>No tags</span>
          ) : null}
          {tagList.map((tag) => (
            <span
              key={tag}
              title={tag}
              style={{
                ...chipBase,
                background: 'var(--accent-weak)',
                border: '1px solid var(--border)',
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  maxWidth: '14rem',
                }}
              >
                {tag}
              </span>
              {hasWritePath && (
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  disabled={!canMutate || busy}
                  title={!canMutate ? 'Switch to Edit to change tags' : 'Remove tag'}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: !canMutate ? 'default' : 'pointer',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    flexShrink: 0,
                    opacity: !canMutate ? 0.35 : 1,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
          {hasWritePath && (
            <input
              type="text"
              value={tagDraft}
              disabled={!canMutate || busy}
              placeholder={canMutate ? 'Add tag…' : 'Edit to add tags'}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (!canMutate) return;
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag(tagDraft);
                }
              }}
              onBlur={() => {
                if (canMutate && tagDraft.trim()) addTag(tagDraft);
              }}
              style={{
                flex: '1 1 7rem',
                minWidth: '6rem',
                maxWidth: '100%',
                padding: '3px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-input, var(--bg-glass))',
                color: 'var(--text)',
                fontSize: 'var(--text-xs)',
                boxSizing: 'border-box',
                opacity: canMutate ? 1 : 0.55,
              }}
            />
          )}
        </div>
        {hasWritePath && onLocalChange && !onUpdate ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 4 }}>
            Changes apply when you save.
          </div>
        ) : null}
      </div>

      {error && (
        <div style={{ fontSize: 'var(--text-xs)', color: '#ef4444' }}>{error}</div>
      )}
    </div>
  );
};
