import { ExternalLink, Eye, FolderOpen, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { FindSimilarResult } from '../../lib/search';
import type { SearchRelatedFacets, SimilarItemResult, SearchResult } from '../../lib/search';
import { useInspectorItemData } from '../../hooks/useInspectorItemData';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import { ItemResultRow } from './ItemResultRow';
import { useItemPeek } from './ItemPeekProvider';

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  fontSize: 'var(--dev-fs-caption)',
  cursor: 'pointer',
  lineHeight: 1.3,
};

function LinkRow({
  itemId,
  title,
  domain,
  category,
  score,
  url,
  onSelect,
  selected,
  workspaceAction,
  hideScore,
  previewItemIds,
}: {
  itemId: string;
  title: string;
  domain: string;
  category?: string;
  score?: number;
  url?: string;
  onSelect?: () => void;
  selected?: boolean;
  workspaceAction?: ReactNode;
  hideScore?: boolean;
  previewItemIds?: readonly string[];
}) {
  const { openPeek } = useItemPeek();
  return (
    <ItemResultRow
      item={{ id: itemId, title, url }}
      dragSource={{ kind: 'reference', label: 'Related results' }}
      selected={selected}
      onSelectItem={onSelect}
      className="ui-related-link-row"
      data-has-workspace-action={workspaceAction ? 'true' : 'false'}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, input')) return;
        openPeek(itemId, { itemIds: previewItemIds, sourceLabel: 'Related results' });
      }}
    >
      <div className="ui-related-link-row__copy">
        <div className="ui-related-link-row__title-line">
          <div className="ui-related-link-row__title">{title}</div>
          {url ? (
            <ExtensionPageUrlLink
              url={url}
              className="ui-related-link-row__external"
              title="Open URL"
            >
              <ExternalLink size={13} />
            </ExtensionPageUrlLink>
          ) : null}
          <button
            type="button"
            className="ui-related-link-row__external"
            onClick={() => openPeek(itemId, { itemIds: previewItemIds, sourceLabel: 'Related results' })}
            title="Preview without leaving this view"
            aria-label={`Preview ${title}`}
          >
            <Eye size={13} />
          </button>
        </div>
        <div className="ui-related-link-row__meta">
          {domain}
          {category ? ` · ${category}` : ''}
          {!hideScore && score != null ? ` · ${score.toFixed(2)}` : ''}
        </div>
      </div>
      {workspaceAction ? (
        <div className="ui-related-link-row__workspace">{workspaceAction}</div>
      ) : null}
    </ItemResultRow>
  );
}

export function SearchRelatedPanel({
  related,
  onTopicClick,
  onCategoryOpen,
  onTagClick,
  onRelatedClick,
  variant = 'dev',
  semanticRelated = false,
}: {
  related: SearchRelatedFacets;
  onTopicClick?: (name: string) => void;
  onCategoryOpen?: (categoryId: string, name: string) => void;
  onTagClick?: (tag: string) => void;
  onRelatedClick?: (itemId: string, title: string) => void;
  variant?: 'dev' | 'product';
  semanticRelated?: boolean;
}) {
  const hideScore = variant === 'product';
  const chipFontSize = variant === 'product' ? 'var(--text-xs)' : 'var(--dev-fs-caption)';
  const sectionFontSize = variant === 'product' ? 'var(--text-sm)' : 'var(--dev-fs-sm)';
  const hasTopics = related.topics.length > 0;
  const hasTags = related.tags.length > 0;
  const hasRelated = related.relatedLinks.length > 0;

  if (!hasTopics && !hasTags && !hasRelated) return null;

  return (
    <section
      className="ui-search-discovery"
      style={{
        marginTop: 16,
        padding: '12px 14px',
        borderRadius: 8,
        border: '1px dashed var(--border)',
        background: 'var(--bg-subtle, var(--bg))',
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          fontSize: sectionFontSize,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
        }}
      >
        {semanticRelated && hasRelated ? 'Related results' : 'Also explore'}
      </h3>

      {hasTopics ? (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 'var(--dev-fs-caption)',
              color: 'var(--text-faint)',
              marginBottom: 6,
            }}
          >
            Categories
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {related.topics.map((t) => (
              <button
                key={t.categoryId}
                type="button"
                style={{ ...chipStyle, fontSize: chipFontSize }}
                onClick={() => {
                  if (onCategoryOpen) onCategoryOpen(t.categoryId, t.name);
                  else onTopicClick?.(t.name);
                }}
                title={
                  onCategoryOpen
                    ? `Open the full ${t.name} category`
                    : t.source === 'query'
                      ? 'Search this matched category'
                      : 'Search this category from the top results'
                }
              >
                {onCategoryOpen ? <FolderOpen size={12} /> : null}
                {t.name}
                <span style={{ color: 'var(--text-faint)' }}>{t.count || ''}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasTags ? (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 'var(--dev-fs-caption)',
              color: 'var(--text-faint)',
              marginBottom: 6,
            }}
          >
            Tags in results
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {related.tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                style={{ ...chipStyle, fontSize: chipFontSize }}
                onClick={() => onTagClick?.(t.tag)}
              >
                {t.tag}
                <span style={{ color: 'var(--text-faint)' }}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasRelated ? (
        <div>
          <div
            style={{
              fontSize: 'var(--dev-fs-caption)',
              color: 'var(--text-faint)',
              marginBottom: 4,
            }}
          >
            {semanticRelated
              ? 'Semantic matches outside the exact query rules'
              : 'Related links (not in top results)'}
          </div>
          {related.relatedLinks.map((row) => (
            <LinkRow
              key={row.itemId}
              itemId={row.itemId}
              title={row.title || row.itemId}
              domain={row.domain}
              category={row.primaryCategoryName}
              score={row.breakdown.finalScore}
              url={row.url}
              hideScore={hideScore}
              onSelect={
                onRelatedClick
                  ? () => onRelatedClick(row.itemId, row.title || row.itemId)
                  : undefined
              }
              previewItemIds={related.relatedLinks.map((candidate) => candidate.itemId)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SimilarItemsBlock({
  similar,
  loading,
  error,
  onItemClick,
  renderWorkspaceAction,
  compact,
}: {
  similar: FindSimilarResult | null;
  loading?: boolean;
  error?: string | null;
  onItemClick?: (itemId: string, title: string) => void;
  renderWorkspaceAction?: (itemId: string, title: string) => ReactNode;
  compact?: boolean;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  if (loading) {
    return (
      <p style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
        Finding similar bookmarks…
      </p>
    );
  }

  if (error) {
    return (
      <p style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--error)', marginBottom: 12 }}>
        {error}
      </p>
    );
  }

  if (!similar) return null;

  return (
    <section style={{ marginBottom: compact ? 8 : 16 }}>
      <div className="ui-similar-bookmarks__header">
        <h3 className="ui-similar-bookmarks__title">
          <Sparkles size={13} />
          Similar bookmarks
        </h3>
        <span className="ui-similar-bookmarks__method">
          {similar.anchorHasEmbedding ? 'Semantic matches' : 'Category and tag matches'}
        </span>
      </div>

      {!similar.results.length ? (
        <p style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)', margin: 0 }}>
          No similar items found yet — try backfilling embeddings or categorizing this item.
        </p>
      ) : (
        <>
          {!compact ? (
            <p style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)', margin: '0 0 8px' }}>
              {similar.results.length.toLocaleString()} shown
              {similar.totalCandidates > similar.results.length
                ? ` of ${similar.totalCandidates.toLocaleString()} candidates`
                : ''}
            </p>
          ) : null}
          {similar.results.map((row) => (
            <SimilarRow
              key={row.itemId}
              row={row}
              onItemClick={onItemClick}
              selected={selectedItemId === row.itemId}
              onSelect={() => setSelectedItemId(row.itemId)}
              workspaceAction={renderWorkspaceAction?.(row.itemId, row.title || row.itemId)}
              previewItemIds={similar.results.map((candidate) => candidate.itemId)}
            />
          ))}
        </>
      )}
    </section>
  );
}

function SimilarRow({
  row,
  onItemClick,
  selected,
  onSelect,
  workspaceAction,
  previewItemIds,
}: {
  row: SimilarItemResult;
  onItemClick?: (itemId: string, title: string) => void;
  selected?: boolean;
  onSelect?: () => void;
  workspaceAction?: ReactNode;
  previewItemIds?: readonly string[];
}) {
  return (
    <LinkRow
      itemId={row.itemId}
      title={row.title || row.itemId}
      domain={row.domain}
      category={row.primaryCategoryName}
      score={row.breakdown.finalScore}
      url={row.url}
      selected={selected}
      onSelect={() => {
        onSelect?.();
        onItemClick?.(row.itemId, row.title || row.itemId);
      }}
      workspaceAction={workspaceAction}
      previewItemIds={previewItemIds}
    />
  );
}

export function InlineSimilarPanel({
  anchorTitle,
  results,
  loading,
  onClose,
  onItemClick,
}: {
  anchorTitle: string;
  results: SearchResult[] | SimilarItemResult[];
  loading?: boolean;
  onClose?: () => void;
  onItemClick?: (itemId: string, title: string) => void;
}) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid var(--accent-weak, var(--border))',
        background: 'var(--accent-weak, var(--bg))',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 'var(--dev-fs-caption)', fontWeight: 600 }}>
          Similar to: {anchorTitle}
        </span>
        {onClose ? (
          <button type="button" className="er-btn" onClick={onClose} style={{ fontSize: 'var(--dev-fs-caption)' }}>
            Close
          </button>
        ) : null}
      </div>
      {loading ? (
        <p style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', margin: 0 }}>
          Loading…
        </p>
      ) : !results.length ? (
        <p style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', margin: 0 }}>
          No similar items.
        </p>
      ) : (
        results.map((row) => {
          const score =
            'breakdown' in row && 'finalScore' in row.breakdown
              ? row.breakdown.finalScore
              : undefined;
          return (
            <LinkRow
              key={row.itemId}
              itemId={row.itemId}
              title={row.title || row.itemId}
              domain={row.domain}
              category={'primaryCategoryName' in row ? row.primaryCategoryName : undefined}
              score={score}
              url={row.url}
              onSelect={
                onItemClick ? () => onItemClick(row.itemId, row.title || row.itemId) : undefined
              }
              previewItemIds={results.map((candidate) => candidate.itemId)}
            />
          );
        })
      )}
    </div>
  );
}

/** Loads similar bookmarks for one item (enrichment detail, etc.). */
export function ItemSimilarSection({
  itemId,
  renderWorkspaceAction,
}: {
  itemId: string;
  renderWorkspaceAction?: (itemId: string, title: string) => ReactNode;
}) {
  const {
    similar,
    similarLoading: loading,
    similarError: error,
  } = useInspectorItemData(itemId);

  return (
    <ItemSimilarSectionView
      similar={similar}
      loading={loading}
      error={error}
      renderWorkspaceAction={renderWorkspaceAction}
    />
  );
}

export function ItemSimilarSectionView({
  similar,
  loading,
  error,
  renderWorkspaceAction,
}: {
  similar: FindSimilarResult | null;
  loading: boolean;
  error: string | null;
  renderWorkspaceAction?: (itemId: string, title: string) => ReactNode;
}) {

  return (
    <SimilarItemsBlock
      similar={similar}
      loading={loading}
      error={error}
      renderWorkspaceAction={renderWorkspaceAction}
    />
  );
}
