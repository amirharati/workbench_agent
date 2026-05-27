import React from 'react';
import { StatusBadge } from '../StatusBadge';
import type { PipelineBadge } from '../../lib/pipeline';

export const ItemPipelineBadge: React.FC<{ badge?: PipelineBadge | null }> = ({ badge }) => {
  if (!badge) return null;
  return <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>;
};

interface EnrichmentContentProps {
  summary?: string;
  keyPoints: string[];
  compact?: boolean;
  emptyMessage?: string;
}

export const EnrichmentContent: React.FC<EnrichmentContentProps> = ({
  summary,
  keyPoints,
  compact,
  emptyMessage,
}) => {
  if (!summary && keyPoints.length === 0) {
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
        {emptyMessage ??
          'Not enriched yet. Run fetch enrichment from the dev hub (Settings → Dev tools).'}
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
      {keyPoints.length > 0 && (
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
            {keyPoints.map((point, i) => (
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
