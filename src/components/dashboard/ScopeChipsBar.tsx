import React from 'react';
import type { Collection, Project } from '../../lib/db';
import type { CategoryBrowseFilter, PipelineBrowseFilter } from '../../lib/pipeline';

interface ScopeChipsBarProps {
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
  projects: Project[];
  collections: Collection[];
  categoryBrowse?: CategoryBrowseFilter | null;
  pipelineBrowse?: PipelineBrowseFilter | null;
  itemCount?: number;
  onClearProject: () => void;
  onClearCollection: () => void;
  onResetScope: () => void;
  onClearCategoryBrowse?: () => void;
  onClearPipelineBrowse?: () => void;
}

const chipStyle = (accent?: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
  background: accent ? 'var(--accent-weak)' : 'var(--bg-glass)',
  color: accent ? 'var(--accent)' : 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  lineHeight: 1.4,
});

const dismissStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: 999,
  color: 'var(--text-faint)',
  fontSize: 12,
  lineHeight: 1,
};

function ChipDismiss({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={dismissStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)';
        e.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-faint)';
      }}
    >
      ×
    </button>
  );
}

export const ScopeChipsBar: React.FC<ScopeChipsBarProps> = ({
  scopeProjectId,
  scopeCollectionId,
  projects,
  collections,
  categoryBrowse,
  pipelineBrowse,
  itemCount,
  onClearProject,
  onClearCollection,
  onResetScope,
  onClearCategoryBrowse,
  onClearPipelineBrowse,
}) => {
  const project =
    scopeProjectId !== 'all' ? projects.find((p) => p.id === scopeProjectId) : undefined;
  const collection =
    scopeCollectionId !== 'all' ? collections.find((c) => c.id === scopeCollectionId) : undefined;

  const hasScopeFilter = scopeProjectId !== 'all' || scopeCollectionId !== 'all';
  const hasBrowseFilter = Boolean(categoryBrowse || pipelineBrowse);
  const showBar = hasScopeFilter || hasBrowseFilter || scopeProjectId === 'all';

  if (!showBar) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        marginTop: 6,
      }}
    >
      {scopeProjectId === 'all' && scopeCollectionId === 'all' && !hasBrowseFilter ? (
        <span style={chipStyle()} title="Showing all projects and collections">
          All projects
        </span>
      ) : null}

      {project && scopeCollectionId === 'all' ? (
        <span style={chipStyle(true)}>
          Project: {project.name}
          <ChipDismiss onClick={onClearProject} title="Clear project scope" />
        </span>
      ) : null}

      {collection ? (
        <span style={chipStyle(true)}>
          Collection: {collection.name}
          <ChipDismiss onClick={onClearCollection} title="Clear collection scope" />
        </span>
      ) : null}

      {hasScopeFilter && scopeProjectId !== 'all' && scopeCollectionId !== 'all' ? (
        <button
          type="button"
          onClick={onResetScope}
          style={{
            ...chipStyle(),
            cursor: 'pointer',
            border: '1px dashed var(--border)',
          }}
          title="Reset to all projects and collections"
        >
          Reset scope
        </button>
      ) : null}

      {categoryBrowse ? (
        <span style={chipStyle(true)}>
          Category: {categoryBrowse.name}
          {onClearCategoryBrowse ? (
            <ChipDismiss onClick={onClearCategoryBrowse} title="Clear category filter" />
          ) : null}
        </span>
      ) : null}

      {pipelineBrowse ? (
        <span style={chipStyle(true)}>
          Queue: {pipelineBrowse.label}
          {onClearPipelineBrowse ? (
            <ChipDismiss onClick={onClearPipelineBrowse} title="Clear queue filter" />
          ) : null}
        </span>
      ) : null}

      {typeof itemCount === 'number' ? (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>
      ) : null}
    </div>
  );
};
