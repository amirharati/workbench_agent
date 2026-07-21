import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Item } from '../../lib/db';
import { getItem } from '../../lib/db';
import { previewClassifyBatchItemIds } from '../../lib/categorization/classifyTopicExtract';
import type { PipelineQueueKind } from '../../lib/pipeline';
import { PIPELINE_QUEUE_LABELS } from '../../lib/pipeline';

export interface PipelineBatchConfirmModalProps {
  kind: PipelineQueueKind;
  itemIds: string[];
  items?: Item[];
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}

type RowItem = {
  id: string;
  title: string;
  url?: string;
  runnable: boolean;
  skipReason?: string;
};

export const PipelineBatchConfirmModal: React.FC<PipelineBatchConfirmModalProps> = ({
  kind,
  itemIds,
  items = [],
  onConfirm,
  onCancel,
}) => {
  const isClassify = kind === 'pending_classify';
  const [selected, setSelected] = useState<Set<string>>(() => new Set(itemIds));
  const [rows, setRows] = useState<RowItem[]>([]);
  const [loading, setLoading] = useState(true);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const preview = isClassify ? await previewClassifyBatchItemIds(itemIds) : null;
      const previewById = new Map(preview?.map((p) => [p.itemId, p]) ?? []);

      const resolved: RowItem[] = [];
      for (const id of itemIds) {
        const fromProps = itemById.get(id);
        let title = fromProps?.title?.trim() || '';
        let url = fromProps?.url;
        if (!fromProps) {
          const fetched = await getItem(id);
          if (cancelled) return;
          title = fetched?.title?.trim() || 'Untitled';
          url = fetched?.url;
        }
        const pv = previewById.get(id);
        resolved.push({
          id,
          title: title || 'Untitled',
          url,
          runnable: isClassify ? (pv?.runnable ?? true) : true,
          skipReason: pv?.skipReason,
        });
      }

      if (cancelled) return;

      const defaultSelected = isClassify
        ? resolved.filter((r) => r.runnable).map((r) => r.id)
        : itemIds;

      setRows(resolved);
      setSelected(new Set(defaultSelected));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [itemIds, itemById, isClassify]);

  const runnableCount = rows.filter((r) => r.runnable).length;
  const skippedCount = rows.length - runnableCount;
  const selectedCount = selected.size;
  const selectedRunnable = rows.filter((r) => selected.has(r.id) && r.runnable).length;
  const allSelected = selectedCount === itemIds.length && itemIds.length > 0;

  const actionLabel = isClassify ? 'Run AI classify' : kind === 'not_enriched' ? 'Process selected' : 'Run selected';

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(itemIds));
  const selectRunnable = () => setSelected(new Set(rows.filter((r) => r.runnable).map((r) => r.id)));
  const clearAll = () => setSelected(new Set());

  return (
    <div
      className="ui-dialog-backdrop"
      role="presentation"
      data-layer="raised"
      style={{
      }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipeline-batch-confirm-title"
        tabIndex={-1}
        style={{
          maxWidth: 520,
          maxHeight: 'min(85vh, 640px)',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="ui-dialog__header"
          style={{
            flexShrink: 0,
            display: 'block',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 8,
            }}
          >
            <h2
              id="pipeline-batch-confirm-title"
              style={{
                margin: 0,
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              {isClassify ? 'Review classify queue' : PIPELINE_QUEUE_LABELS[kind]}
            </h2>
            <button
              className="ui-button ui-button--icon ui-dialog__close"
              type="button"
              onClick={onCancel}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <p
            style={{
              margin: '0 0 6px',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {loading
              ? 'Checking which items can run…'
              : isClassify
                ? `${runnableCount} will run AI · ${skippedCount} in queue but can't run (see notes) · ${selectedCount} checked`
                : `${selectedCount} of ${itemIds.length} selected — only checked items will run.`}
          </p>
          {isClassify && !loading ? (
            <p
              style={{
                margin: '0 0 10px',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-faint)',
                lineHeight: 1.45,
              }}
            >
              Items that get &quot;Other&quot; or need discover stay in this queue until discover runs or you
              accept a category.
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--text-xs)' }}>
            {isClassify ? (
              <button
                type="button"
                onClick={selectRunnable}
                disabled={loading || runnableCount === 0}
                style={{
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: loading || runnableCount === 0 ? 'var(--text-faint)' : 'var(--accent)',
                  cursor: loading || runnableCount === 0 ? 'default' : 'pointer',
                  fontWeight: 600,
                }}
              >
                Select runnable ({runnableCount})
              </button>
            ) : null}
            <button
              type="button"
              onClick={selectAll}
              disabled={allSelected || loading}
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
          className="scrollbar"
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
              Loading items…
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
              No items in this queue.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {rows.map((row) => {
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
                        opacity: row.runnable ? 1 : 0.75,
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
                        {row.url ? (
                          <span
                            style={{
                              display: 'block',
                              marginTop: 2,
                              fontSize: 'var(--text-xs)',
                              color: 'var(--text-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {row.url}
                          </span>
                        ) : null}
                        {row.skipReason ? (
                          <span
                            style={{
                              display: 'block',
                              marginTop: 4,
                              fontSize: 'var(--text-xs)',
                              color: 'var(--warning)',
                              lineHeight: 1.4,
                            }}
                          >
                            Won&apos;t run: {row.skipReason}
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
          className="ui-dialog__footer"
          style={{
            flexShrink: 0,
          }}
        >
          <button
            className="ui-button ui-button--secondary"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="ui-button ui-button--primary"
            type="button"
            disabled={selectedCount === 0 || loading}
            onClick={() => onConfirm([...selected])}
          >
            {actionLabel} ({isClassify ? selectedRunnable : selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
};
