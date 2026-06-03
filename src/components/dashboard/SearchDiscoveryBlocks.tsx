import { ExternalLink, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { runAppFindSimilar, type FindSimilarResult } from '../../lib/search';
import type { SearchRelatedFacets, SimilarItemResult, SearchResult } from '../../lib/search';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';

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
  title,
  domain,
  category,
  score,
  url,
  onSelect,
  hideScore,
}: {
  title: string;
  domain: string;
  category?: string;
  score?: number;
  url?: string;
  onSelect?: () => void;
  hideScore?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 'var(--dev-fs-sm)',
              color: 'var(--accent)',
            }}
          >
            {title}
          </button>
        ) : (
          <div style={{ fontWeight: 600, fontSize: 'var(--dev-fs-sm)' }}>{title}</div>
        )}
        <div style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
          {domain}
          {category ? ` · ${category}` : ''}
          {!hideScore && score != null ? ` · ${score.toFixed(2)}` : ''}
        </div>
      </div>
      {url ? (
        <ExtensionPageUrlLink
          url={url}
          style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2, display: 'inline-flex' }}
          title="Open URL"
        >
          <ExternalLink size={14} />
        </ExtensionPageUrlLink>
      ) : null}
    </div>
  );
}

export function SearchRelatedPanel({
  related,
  onTopicClick,
  onTagClick,
  onRelatedClick,
  variant = 'dev',
}: {
  related: SearchRelatedFacets;
  onTopicClick?: (name: string) => void;
  onTagClick?: (tag: string) => void;
  onRelatedClick?: (itemId: string, title: string) => void;
  variant?: 'dev' | 'product';
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
        Also explore
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
            Topics
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {related.topics.map((t) => (
              <button
                key={t.categoryId}
                type="button"
                style={{ ...chipStyle, fontSize: chipFontSize }}
                onClick={() => onTopicClick?.(t.name)}
                title={t.source === 'query' ? 'Matched by query' : 'From top results'}
              >
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
            Related links (not in top results)
          </div>
          {related.relatedLinks.map((row) => (
            <LinkRow
              key={row.itemId}
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
  compact,
}: {
  similar: FindSimilarResult | null;
  loading?: boolean;
  error?: string | null;
  onItemClick?: (itemId: string, title: string) => void;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <p style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
        Finding similar bookmarks…
      </p>
    );
  }

  if (error) {
    return (
      <p style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--error, #f85149)', marginBottom: 12 }}>
        {error}
      </p>
    );
  }

  if (!similar) return null;

  return (
    <section style={{ marginBottom: compact ? 8 : 16 }}>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--dev-fs-sm)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Sparkles size={14} />
        Similar bookmarks
        {similar.anchorHasEmbedding ? (
          <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-faint)' }}>
            · semantic
          </span>
        ) : (
          <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-faint)' }}>
            · category + tags
          </span>
        )}
      </h3>

      {!similar.results.length ? (
        <p style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)', margin: 0 }}>
          No similar items found yet — try backfilling embeddings or categorizing this item.
        </p>
      ) : (
        <>
          {!compact ? (
            <p style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)', margin: '0 0 8px' }}>
              {similar.results.length} shown
              {similar.totalCandidates > similar.results.length
                ? ` of ${similar.totalCandidates} candidates`
                : ''}
            </p>
          ) : null}
          {similar.results.map((row) => (
            <SimilarRow key={row.itemId} row={row} onItemClick={onItemClick} />
          ))}
        </>
      )}
    </section>
  );
}

function SimilarRow({
  row,
  onItemClick,
}: {
  row: SimilarItemResult;
  onItemClick?: (itemId: string, title: string) => void;
}) {
  return (
    <LinkRow
      title={row.title || row.itemId}
      domain={row.domain}
      category={row.primaryCategoryName}
      score={row.breakdown.finalScore}
      url={row.url}
      onSelect={
        onItemClick ? () => onItemClick(row.itemId, row.title || row.itemId) : undefined
      }
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
              title={row.title || row.itemId}
              domain={row.domain}
              category={'primaryCategoryName' in row ? row.primaryCategoryName : undefined}
              score={score}
              url={row.url}
              onSelect={
                onItemClick ? () => onItemClick(row.itemId, row.title || row.itemId) : undefined
              }
            />
          );
        })
      )}
    </div>
  );
}

/** Loads similar bookmarks for one item (enrichment detail, etc.). */
export function ItemSimilarSection({ itemId }: { itemId: string }) {
  const [similar, setSimilar] = useState<FindSimilarResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSimilar(null);

    void (async () => {
      try {
        const res = await runAppFindSimilar({ itemId, limit: 12 });
        if (!cancelled) setSimilar(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return (
    <SimilarItemsBlock similar={similar} loading={loading} error={error} />
  );
}
