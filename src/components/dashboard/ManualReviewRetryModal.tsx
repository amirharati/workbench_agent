import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

export type ManualReviewRetryRow = {
  id: string;
  title: string;
  url?: string;
  reason?: string;
};

export interface ManualReviewRetryModalProps {
  rows: ManualReviewRetryRow[];
  loading?: boolean;
  scopeLabel?: string;
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}

export const ManualReviewRetryModal: React.FC<ManualReviewRetryModalProps> = ({
  rows,
  loading,
  scopeLabel,
  onConfirm,
  onCancel,
}) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));

  useEffect(() => {
    setSelected(new Set(rows.map((r) => r.id)));
  }, [rows]);

  const selectedCount = selected.size;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(rows.map((r) => r.id)));
  const clearAll = () => setSelected(new Set());

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.title.localeCompare(b.title)),
    [rows]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-retry-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--layer-modal-raised)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0,0,0,0.45)',
        boxSizing: 'border-box',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          maxHeight: 'min(88vh, 680px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-panel)',
          color: 'var(--text)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            flexShrink: 0,
            padding: '18px 20px 12px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 10,
            }}
          >
            <h2
              id="manual-retry-title"
              style={{
                margin: 0,
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              Retry manual review
            </h2>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              style={{
                padding: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                borderRadius: 4,
              }}
            >
              <X size={18} />
            </button>
          </div>

          <p
            style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: 'var(--text)' }}>Manual review</strong> means auto-classify
            stopped on these bookmarks — usually after repeated LLM errors, no matching topic, or
            stuck on General/Other.{' '}
            <strong style={{ color: 'var(--text)' }}>Retry manual</strong> runs topic AI again on
            your selection (one LLM call per bookmark, paid API).
          </p>
          {scopeLabel ? (
            <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
              Scope: {scopeLabel}
            </p>
          ) : null}
          <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {loading
              ? 'Loading bookmarks…'
              : `${selectedCount} of ${rows.length} selected — only checked items will run.`}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--text-xs)' }}>
            <button
              type="button"
              onClick={selectAll}
              disabled={allSelected || loading || rows.length === 0}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: allSelected ? 'var(--text-faint)' : 'var(--accent)',
                cursor: allSelected || loading ? 'default' : 'pointer',
                fontWeight: 600,
              }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={selectedCount === 0 || loading}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: selectedCount === 0 ? 'var(--text-faint)' : 'var(--accent)',
                cursor: selectedCount === 0 || loading ? 'default' : 'pointer',
                fontWeight: 600,
              }}
            >
              Clear all
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '8px 12px',
          }}
        >
          {loading ? (
            <div
              style={{
                padding: '24px 8px',
                textAlign: 'center',
                color: 'var(--text-faint)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div
              style={{
                padding: '24px 8px',
                textAlign: 'center',
                color: 'var(--text-faint)',
                fontSize: 'var(--text-sm)',
              }}
            >
              No bookmarks in manual review right now.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sortedRows.map((row) => {
                const checked = selected.has(row.id);
                return (
                  <li key={row.id}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        background: checked ? 'var(--accent-weak)' : 'transparent',
                        border: checked
                          ? '1px solid color-mix(in srgb, var(--accent) 35%, transparent)'
                          : '1px solid transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(row.id)}
                        style={{ marginTop: 3, flexShrink: 0 }}
                      />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.title}
                        </span>
                        {row.reason ? (
                          <span
                            style={{
                              display: 'block',
                              marginTop: 4,
                              fontSize: 'var(--text-xs)',
                              color: '#f85149',
                              lineHeight: 1.4,
                            }}
                          >
                            Why: {row.reason}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedCount === 0 || loading}
            onClick={() => onConfirm([...selected])}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: selectedCount === 0 || loading ? 'var(--bg-hover)' : 'var(--accent)',
              color: selectedCount === 0 || loading ? 'var(--text-muted)' : '#fff',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: selectedCount === 0 || loading ? 'not-allowed' : 'pointer',
            }}
          >
            Retry {selectedCount} bookmark{selectedCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};
