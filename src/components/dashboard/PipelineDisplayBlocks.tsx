import React from 'react';
import { StatusBadge } from '../StatusBadge';
import {
  shouldShowListPipelineBadge,
  type PipelineBadge,
} from '../../lib/pipeline';

export const ENRICHMENT_EMPTY_MESSAGE =
  'Not enriched yet. Use Run digest in the Inspector, or Process not enriched on Home. Batch tools will move to Settings → Advanced.';

export const ItemPipelineBadge: React.FC<{ badge?: PipelineBadge | null }> = ({ badge }) => {
  if (!badge) return null;
  return <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>;
};

/** Badge for list/search rows — hides Ready and Not processed. */
export const ListPipelineBadge: React.FC<{ badge?: PipelineBadge | null }> = ({ badge }) => {
  if (!shouldShowListPipelineBadge(badge)) return null;
  return <ItemPipelineBadge badge={badge} />;
};

interface EnrichmentContentProps {
  summary?: string;
  keyPoints: string[];
  compact?: boolean;
  emptyMessage?: string;
  showKeyPoints?: boolean;
}

export const EnrichmentContent: React.FC<EnrichmentContentProps> = ({
  summary,
  keyPoints,
  compact,
  emptyMessage,
  showKeyPoints = true,
}) => {
  const visibleKeyPoints = showKeyPoints ? keyPoints : [];

  if (!summary && visibleKeyPoints.length === 0) {
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
