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

function ChipDismiss({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      className="ui-scope-chip__dismiss"
      onClick={onClick}
      title={title}
      aria-label={title}
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
    <div className="ui-scope-bar" aria-label="Current library scope">
      {scopeProjectId === 'all' && scopeCollectionId === 'all' && !hasBrowseFilter ? (
        <span className="ui-scope-chip" title="Showing all projects and collections">
          All projects
        </span>
      ) : null}

      {project && scopeCollectionId === 'all' ? (
        <span className="ui-scope-chip" data-active="true">
          Project: {project.name}
          <ChipDismiss onClick={onClearProject} title="Clear project scope" />
        </span>
      ) : null}

      {collection ? (
        <span className="ui-scope-chip" data-active="true">
          Collection: {collection.name}
          <ChipDismiss onClick={onClearCollection} title="Clear collection scope" />
        </span>
      ) : null}

      {hasScopeFilter && scopeProjectId !== 'all' && scopeCollectionId !== 'all' ? (
        <button
          type="button"
          className="ui-scope-chip ui-scope-chip--reset"
          onClick={onResetScope}
          title="Reset to all projects and collections"
        >
          Reset scope
        </button>
      ) : null}

      {categoryBrowse ? (
        <span className="ui-scope-chip" data-active="true">
          Category: {categoryBrowse.name}
          {onClearCategoryBrowse ? (
            <ChipDismiss onClick={onClearCategoryBrowse} title="Clear category filter" />
          ) : null}
        </span>
      ) : null}

      {pipelineBrowse ? (
        <span className="ui-scope-chip" data-active="true">
          Queue: {pipelineBrowse.label}
          {onClearPipelineBrowse ? (
            <ChipDismiss onClick={onClearPipelineBrowse} title="Clear queue filter" />
          ) : null}
        </span>
      ) : null}

      {typeof itemCount === 'number' ? (
        <span className="ui-scope-bar__count">
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>
      ) : null}
    </div>
  );
};
