import React from 'react';
import { StatusBadge, type StatusBadgeVariant } from '../StatusBadge';
import type { EnrichmentReference } from '../../lib/enrichment/types';
import {
  shouldShowListPipelineBadge,
  type PipelineBadge,
} from '../../lib/pipeline';

export const ENRICHMENT_EMPTY_MESSAGE =
  'Not enriched yet. Use Run digest in the Inspector, or Process not enriched on Home. Batch tools will move to Settings → Advanced.';

function statusBadgeVariant(badge: PipelineBadge): StatusBadgeVariant {
  if (badge.kind === 'verified') return 'verified';
  return badge.variant;
}

export const ItemPipelineBadge: React.FC<{ badge?: PipelineBadge | null }> = ({ badge }) => {
  if (!badge) return null;
  return <StatusBadge variant={statusBadgeVariant(badge)}>{badge.label}</StatusBadge>;
};

/** Badge for list/search rows — hides Ready and Not processed. */
export const ListPipelineBadge: React.FC<{ badge?: PipelineBadge | null }> = ({ badge }) => {
  if (!shouldShowListPipelineBadge(badge)) return null;
  return (
    <span className="ui-list-pipeline-badge" title={badge.label} aria-label={badge.label}>
      <ItemPipelineBadge badge={badge} />
    </span>
  );
};

interface EnrichmentContentProps {
  summary?: string;
  tags?: string[];
  keyPoints: string[];
  references?: EnrichmentReference[];
  compact?: boolean;
  emptyMessage?: string;
  showKeyPoints?: boolean;
  showReferences?: boolean;
}

export const EnrichmentContent: React.FC<EnrichmentContentProps> = ({
  summary,
  tags = [],
  keyPoints,
  references = [],
  compact,
  emptyMessage,
  showKeyPoints = true,
  showReferences = true,
}) => {
  const visibleTags = [...new Map(
    tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => [tag.toLocaleLowerCase(), tag] as const)
  ).values()];
  const visibleKeyPoints = showKeyPoints ? keyPoints : [];
  const visibleReferences = showReferences ? references : [];

  if (!summary && visibleTags.length === 0 && visibleKeyPoints.length === 0 && visibleReferences.length === 0) {
    return (
      <div
        style={{
          padding: compact ? '8px 10px' : '10px 12px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-faint)',
          lineHeight: 1.5,
        }}
      >
        {emptyMessage ?? ENRICHMENT_EMPTY_MESSAGE}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
      {summary && (
        <div>
          <SectionLabel>Summary</SectionLabel>
          <p
            style={{
              margin: 0,
              fontSize: compact ? 'var(--text-xs)' : 'var(--text-sm)',
              color: 'var(--text-muted)',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
            }}
          >
            {summary}
          </p>
        </div>
      )}
      {visibleTags.length > 0 && (
        <div>
          <SectionLabel>Tags</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {visibleTags.map((tag) => (
              <span
                key={tag.toLocaleLowerCase()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minWidth: 0,
                  padding: '2px 7px',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  background: 'var(--bg)',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-xs)',
                  lineHeight: 1.35,
                  overflowWrap: 'anywhere',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      {visibleKeyPoints.length > 0 && (
        <div>
          <SectionLabel>Key points</SectionLabel>
          <ul
            style={{
              margin: 0,
              paddingLeft: '1.1rem',
              fontSize: compact ? 'var(--text-xs)' : 'var(--text-sm)',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {visibleKeyPoints.map((point, i) => (
              <li key={`${i}-${point.slice(0, 24)}`}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {visibleReferences.length > 0 && (
        <div>
          <SectionLabel>Resources</SectionLabel>
          <ul
            style={{
              margin: 0,
              paddingLeft: '1.1rem',
              fontSize: compact ? 'var(--text-xs)' : 'var(--text-sm)',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {visibleReferences.map((ref) => (
              <li key={ref.url}>
                {ref.label}
                {ref.followed ? '' : ' (link only)'}
                {' — '}
                <a href={ref.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                  {ref.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
    }}
  >
    {children}
  </div>
);
