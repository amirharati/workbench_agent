import React from 'react';
import {
  importReportStats,
  IMPORT_REPORT_STATUS_LABELS,
  type ImportReport,
  type ImportReportPipelineStatus,
  type ImportReportRow,
} from '../../lib/pipeline/importReport';

type ReportFilter = 'all' | 'success' | 'failed' | 'not_processed';

interface ImportReportOverlayProps {
  report: ImportReport;
  onClose: () => void;
  onImportAnother: () => void;
}

const STATUS_COLORS: Record<ImportReportPipelineStatus, string> = {
  not_run: 'var(--text-muted)',
  enriched: '#22c55e',
  unchanged: 'var(--text-muted)',
  failed: '#ef4444',
  classified: '#818cf8',
  pending_classify: '#d29922',
  not_enriched: 'var(--text-faint)',
  review_needed: '#f97316',
};

function rowMatchesFilter(row: ImportReportRow, filter: ReportFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'success':
      return ['enriched', 'unchanged', 'classified'].includes(row.pipelineStatus);
    case 'failed':
      return row.pipelineStatus === 'failed' || row.pipelineStatus === 'review_needed';
    case 'not_processed':
      return row.pipelineStatus === 'not_run' || row.pipelineStatus === 'not_enriched';
    default:
      return true;
  }
}

export const ImportReportOverlay: React.FC<ImportReportOverlayProps> = ({
  report,
  onClose,
  onImportAnother,
}) => {
  const [filter, setFilter] = React.useState<ReportFilter>('all');
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(report.rows[0]?.itemId ?? null);

  const stats = React.useMemo(() => importReportStats(report), [report]);

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return report.rows.filter((row) => {
      if (!rowMatchesFilter(row, filter)) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.url.toLowerCase().includes(q) ||
        row.detail.toLowerCase().includes(q) ||
        (row.categoryName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [report.rows, filter, query]);

  React.useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredRows.some((row) => row.itemId === selectedId)) {
      setSelectedId(filteredRows[0].itemId);
    }
  }, [filteredRows, selectedId]);

  const selectedIndex = filteredRows.findIndex((row) => row.itemId === selectedId);
  const selectedRow = selectedIndex >= 0 ? filteredRows[selectedIndex] : null;

  const goPrev = () => {
    if (filteredRows.length === 0) return;
    const next = selectedIndex <= 0 ? filteredRows.length - 1 : selectedIndex - 1;
    setSelectedId(filteredRows[next].itemId);
  };

  const goNext = () => {
    if (filteredRows.length === 0) return;
    const next = selectedIndex < 0 || selectedIndex >= filteredRows.length - 1 ? 0 : selectedIndex + 1;
    setSelectedId(filteredRows[next].itemId);
  };

  const statTiles = [
    { label: 'Committed', value: stats.total, color: 'var(--text)' },
    { label: 'Created', value: report.created, color: 'var(--accent)' },
    { label: 'Merged', value: report.merged, color: 'var(--text-muted)' },
    { label: 'Classified', value: stats.classified, color: STATUS_COLORS.classified },
    { label: 'Summarized', value: stats.enriched, color: STATUS_COLORS.enriched },
    { label: 'Unchanged', value: stats.unchanged, color: STATUS_COLORS.unchanged },
    { label: 'Failed', value: stats.failed, color: STATUS_COLORS.failed },
    { label: 'Review needed', value: stats.reviewNeeded, color: STATUS_COLORS.review_needed },
    { label: 'Not processed', value: stats.notRun, color: STATUS_COLORS.not_run },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10002,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(960px, 100%)',
          maxHeight: 'min(90vh, 900px)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)' }}>
                Import report
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                {report.importSummary}
                {report.pipelineMessage ? ` · ${report.pipelineMessage}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
              gap: 8,
              marginTop: 12,
            }}
          >
            {statTiles.map((tile) => (
              <div
                key={tile.label}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  background: 'var(--bg)',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
                  {tile.label}
                </div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: tile.color }}>{tile.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([
            ['all', 'All'],
            ['success', 'Success'],
            ['failed', 'Failed'],
            ['not_processed', 'Not processed'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${filter === id ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === id ? 'var(--accent-weak)' : 'var(--bg)',
                color: filter === id ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search links…"
            style={{
              flex: '1 1 160px',
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
            }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1.1fr 0.9fr' }}>
          <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto' }} className="scrollbar">
            {filteredRows.length === 0 ? (
              <div style={{ padding: 16, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                No links match this filter.
              </div>
            ) : (
              filteredRows.map((row) => {
                const active = row.itemId === selectedId;
                return (
                  <button
                    key={row.itemId}
                    type="button"
                    onClick={() => setSelectedId(row.itemId)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      background: active ? 'var(--accent-weak)' : 'transparent',
                      padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text)' }}>
                          {row.title || 'Untitled'}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            wordBreak: 'break-all',
                            marginTop: 2,
                          }}
                        >
                          {row.url}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: STATUS_COLORS[row.pipelineStatus],
                          flexShrink: 0,
                        }}
                      >
                        {IMPORT_REPORT_STATUS_LABELS[row.pipelineStatus]}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{row.detail}</div>
                  </button>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text)' }}>
                Review {selectedIndex >= 0 ? `${selectedIndex + 1} / ${filteredRows.length}` : '—'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={goPrev} disabled={filteredRows.length === 0} style={navBtnStyle}>
                  Prev
                </button>
                <button type="button" onClick={goNext} disabled={filteredRows.length === 0} style={navBtnStyle}>
                  Next
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }} className="scrollbar">
              {selectedRow ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Title</div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
                      {selectedRow.title || 'Untitled'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase' }}>URL</div>
                    <a
                      href={selectedRow.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', wordBreak: 'break-all' }}
                    >
                      {selectedRow.url}
                    </a>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Badge label={selectedRow.outcome === 'created' ? 'New' : 'Existing'} />
                    <Badge
                      label={IMPORT_REPORT_STATUS_LABELS[selectedRow.pipelineStatus]}
                      color={STATUS_COLORS[selectedRow.pipelineStatus]}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Result</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {selectedRow.detail}
                    </div>
                  </div>
                  {selectedRow.categoryName ? (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Category</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text)' }}>{selectedRow.categoryName}</div>
                    </div>
                  ) : null}
                  {selectedRow.summary ? (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Summary</div>
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-muted)',
                          lineHeight: 1.55,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {selectedRow.summary}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Select a link to review.</div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onImportAnother}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
            }}
          >
            Import another file
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: 'var(--accent-text, #fff)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const navBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
};

const Badge: React.FC<{ label: string; color?: string }> = ({ label, color = 'var(--text-muted)' }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 700,
      color,
      background: 'var(--bg-hover)',
    }}
  >
    {label}
  </span>
);
