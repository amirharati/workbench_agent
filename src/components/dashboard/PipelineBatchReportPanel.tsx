import React, { useMemo, useState } from 'react';
import {
  PIPELINE_REPORT_OUTCOME_COLORS,
  PIPELINE_REPORT_OUTCOME_LABELS,
  type PipelineReportOutcome,
  type PipelineReportRow,
  pipelineReportStats,
} from '../../lib/pipeline/pipelineBatchReport';

type OutcomeFilter = 'all' | PipelineReportOutcome;

interface PipelineBatchReportPanelProps {
  rows: PipelineReportRow[];
  summary?: string;
}

export const PipelineBatchReportPanel: React.FC<PipelineBatchReportPanelProps> = ({
  rows,
  summary,
}) => {
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const stats = useMemo(() => pipelineReportStats(rows), [rows]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.outcome === filter);
  }, [rows, filter]);

  const statTiles: Array<{ key: OutcomeFilter; label: string; count: number; color: string }> = [
    { key: 'all', label: 'Total', count: rows.length, color: 'var(--text)' },
    { key: 'enriched', label: 'Enriched', count: stats.enriched, color: PIPELINE_REPORT_OUTCOME_COLORS.enriched },
    { key: 'fetched', label: 'Fetched', count: stats.fetched, color: PIPELINE_REPORT_OUTCOME_COLORS.fetched },
    { key: 'ai_updated', label: 'AI updated', count: stats.ai_updated, color: PIPELINE_REPORT_OUTCOME_COLORS.ai_updated },
    { key: 'classified', label: 'Classified', count: stats.classified, color: PIPELINE_REPORT_OUTCOME_COLORS.classified },
    { key: 'unchanged', label: 'Unchanged', count: stats.unchanged, color: PIPELINE_REPORT_OUTCOME_COLORS.unchanged },
    { key: 'failed', label: 'Failed', count: stats.failed, color: PIPELINE_REPORT_OUTCOME_COLORS.failed },
    { key: 'skipped', label: 'Skipped', count: stats.skipped, color: PIPELINE_REPORT_OUTCOME_COLORS.skipped },
    { key: 'review', label: 'Review', count: stats.review, color: PIPELINE_REPORT_OUTCOME_COLORS.review },
  ].filter((t) => t.key === 'all' || t.count > 0) as Array<{
    key: OutcomeFilter;
    label: string;
    count: number;
    color: string;
  }>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {summary ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {summary}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {statTiles.map((tile) => {
          const active = filter === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => setFilter(tile.key)}
              aria-pressed={active}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: active ? '3px 9px' : '4px 10px',
                borderRadius: 999,
                border: active
                  ? `2px solid ${tile.color}`
                  : tile.key === 'all'
                    ? '1px solid var(--border)'
                    : `1px solid ${tile.color}55`,
                background: active
                  ? `${tile.color}24`
                  : tile.key === 'all'
                    ? 'var(--bg-glass)'
                    : `${tile.color}10`,
                color: tile.key === 'all' && !active ? 'var(--text-muted)' : tile.color,
                fontSize: 'var(--text-xs)',
                fontWeight: active ? 700 : 600,
                cursor: 'pointer',
                boxShadow: active ? `0 0 0 1px ${tile.color}18` : undefined,
              }}
            >
              {active ? '✓ ' : ''}
              {tile.label} ({tile.count})
            </button>
          );
        })}
      </div>

      <div
        className="scrollbar"
        style={{
          maxHeight: 280,
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg)',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 16, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            No items in this group.
          </div>
        ) : (
          filtered.map((row) => (
            <div
              key={row.itemId}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'start',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.title}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                  {row.detail}
                </div>
              </div>
              <span
                style={{
                  flexShrink: 0,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  background: `${PIPELINE_REPORT_OUTCOME_COLORS[row.outcome]}22`,
                  color: PIPELINE_REPORT_OUTCOME_COLORS[row.outcome],
                  whiteSpace: 'nowrap',
                }}
              >
                {PIPELINE_REPORT_OUTCOME_LABELS[row.outcome]}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
