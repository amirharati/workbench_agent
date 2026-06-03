import React, { useMemo, useState } from 'react';
import {
  PIPELINE_REPORT_OUTCOME_COLORS,
  pipelineReportStatusLabelCounts,
  reportRowDisplayLabel,
  type PipelineReportOutcome,
  type PipelineReportRow,
  pipelineReportStats,
} from '../../lib/pipeline/pipelineBatchReport';
import { pipelineStatusColorForLabel } from '../../lib/pipeline/pipelineDictionary';

type OutcomeFilter = 'all' | PipelineReportOutcome | `label:${string}`;

interface PipelineBatchReportPanelProps {
  rows: PipelineReportRow[];
  summary?: string;
  /** e.g. "Your 2 selected bookmarks" — clarifies list vs classify progress scope */
  scopeLabel?: string;
}

export const PipelineBatchReportPanel: React.FC<PipelineBatchReportPanelProps> = ({
  rows,
  summary,
  scopeLabel,
}) => {
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const stats = useMemo(() => pipelineReportStats(rows), [rows]);
  const useHubLabels = rows.some((r) => r.statusLabel);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (useHubLabels && filter.startsWith('label:')) {
      const label = filter.slice('label:'.length);
      return rows.filter((r) => reportRowDisplayLabel(r) === label);
    }
    return rows.filter((r) => r.outcome === filter);
  }, [rows, filter, useHubLabels]);

  const statTiles = useMemo(() => {
    if (useHubLabels) {
      const counts = pipelineReportStatusLabelCounts(rows);
      const sampleColor = (label: string) => {
        const sample = rows.find((r) => reportRowDisplayLabel(r) === label);
        return sample?.statusColor ?? pipelineStatusColorForLabel(label);
      };
      const labelTiles = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({
          key: `label:${label}` as OutcomeFilter,
          label,
          count,
          color: sampleColor(label),
        }));
      return [
        { key: 'all' as OutcomeFilter, label: 'Total', count: rows.length, color: 'var(--text)' },
        ...labelTiles,
      ];
    }
    return [
      { key: 'all' as OutcomeFilter, label: 'Total', count: rows.length, color: 'var(--text)' },
      { key: 'enriched' as OutcomeFilter, label: 'Enriched', count: stats.enriched, color: PIPELINE_REPORT_OUTCOME_COLORS.enriched },
      { key: 'fetched' as OutcomeFilter, label: 'Fetched', count: stats.fetched, color: PIPELINE_REPORT_OUTCOME_COLORS.fetched },
      { key: 'ai_updated' as OutcomeFilter, label: 'AI updated', count: stats.ai_updated, color: PIPELINE_REPORT_OUTCOME_COLORS.ai_updated },
      { key: 'classified' as OutcomeFilter, label: 'Classified', count: stats.classified, color: PIPELINE_REPORT_OUTCOME_COLORS.classified },
      { key: 'unchanged' as OutcomeFilter, label: 'Unchanged', count: stats.unchanged, color: PIPELINE_REPORT_OUTCOME_COLORS.unchanged },
      { key: 'failed' as OutcomeFilter, label: 'Failed', count: stats.failed, color: PIPELINE_REPORT_OUTCOME_COLORS.failed },
      { key: 'skipped' as OutcomeFilter, label: 'Skipped', count: stats.skipped, color: PIPELINE_REPORT_OUTCOME_COLORS.skipped },
      { key: 'review' as OutcomeFilter, label: 'Manual review', count: stats.review, color: PIPELINE_REPORT_OUTCOME_COLORS.review },
    ].filter((t) => t.key === 'all' || t.count > 0);
  }, [rows, stats, useHubLabels]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {summary ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {summary}
        </p>
      ) : null}
      {scopeLabel ? (
        <p style={{ margin: summary ? '8px 0 0' : 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
          {scopeLabel}
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
                  {row.subtitle && row.subtitle !== row.title ? (
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: 2,
                      }}
                      title={row.subtitle}
                    >
                      {row.subtitle}
                    </div>
                  ) : null}
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
                  background: `${row.statusColor ?? PIPELINE_REPORT_OUTCOME_COLORS[row.outcome]}22`,
                  color: row.statusColor ?? PIPELINE_REPORT_OUTCOME_COLORS[row.outcome],
                  whiteSpace: 'nowrap',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={reportRowDisplayLabel(row)}
              >
                {reportRowDisplayLabel(row)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
