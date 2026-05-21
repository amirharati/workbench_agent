import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Item } from '../../lib/db';
import { getAllItems } from '../../lib/db';
import { enrichBatch, getAllEnrichments, type EnrichBatchResult, type ItemEnrichment } from '../../lib/enrichment';
import { EnrichmentReviewModal } from './EnrichmentReviewModal';

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
  /** Optional: pre-check these ids when modal opens */
  preselectedIds?: string[];
};

export const EnrichmentTestModal: React.FC<Props> = ({
  open,
  onClose,
  onComplete,
  preselectedIds = [],
}) => {
  const [items, setItems] = useState<Item[]>([]);
  const [enrichmentByItem, setEnrichmentByItem] = useState<Map<string, ItemEnrichment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EnrichBatchResult | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ processed: 0, skipped: 0, failed: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const loadGenerationRef = useRef(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lastRunIds, setLastRunIds] = useState<string[]>([]);

  const fetchBookmarks = useCallback(async () => {
    const all = await getAllItems();
    const bookmarks = all
      .filter((i) => i.url?.trim())
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    const enrichments = await getAllEnrichments();
    const map = new Map(enrichments.map((e) => [e.itemId, e]));
    return { bookmarks, map };
  }, []);

  /** Reload list + enrichment badges only — keeps checkbox selection. */
  const refreshStatuses = useCallback(async () => {
    try {
      const { bookmarks, map } = await fetchBookmarks();
      setItems(bookmarks);
      setEnrichmentByItem(map);
    } catch {
      /* keep existing list on background refresh failure */
    }
  }, [fetchBookmarks]);

  // Load once when modal opens — do NOT depend on preselectedIds (new array every parent render).
  useEffect(() => {
    if (!open) return;

    const generation = ++loadGenerationRef.current;
    const initialPreselect = [...preselectedIds];

    setResult(null);
    setError('');
    setSearch('');
    setLoading(true);

    void (async () => {
      try {
        const { bookmarks, map } = await fetchBookmarks();
        if (loadGenerationRef.current !== generation) return;

        setItems(bookmarks);
        setEnrichmentByItem(map);
        setSelected(
          new Set(initialPreselect.filter((id) => bookmarks.some((b) => b.id === id)))
        );
      } catch (e) {
        if (loadGenerationRef.current !== generation) return;
        setError(e instanceof Error ? e.message : 'Failed to load bookmarks');
      } finally {
        if (loadGenerationRef.current === generation) {
          setLoading(false);
        }
      }
    })();
  // preselectedIds intentionally omitted — captured once when open becomes true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchBookmarks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.url || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of filtered) next.add(i.id);
      return next;
    });
  };

  const selectNone = () => setSelected(new Set());

  const selectFirst = (n: number) => {
    setSelected(new Set(filtered.slice(0, n).map((i) => i.id)));
  };

  const selectEnriched = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of filtered) {
        if (enrichmentByItem.has(item.id)) next.add(item.id);
      }
      return next;
    });
  };

  const handleRun = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setError('Select at least one bookmark.');
      return;
    }
    setRunning(true);
    setError('');
    setResult(null);
    abortRef.current = new AbortController();
    try {
      const res = await enrichBatch({
        mode: 'full',
        itemIds: ids,
        maxItems: ids.length,
        force: true,
        signal: abortRef.current.signal,
        onProgress: (p) => {
          setProgress({
            processed: p.processed,
            skipped: p.skipped,
            failed: p.failed,
            total: p.total,
          });
        },
      });
      setResult(res);
      setLastRunIds(ids);
      await refreshStatuses();
      setReviewOpen(true);
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleClose = () => {
    if (running) {
      abortRef.current?.abort();
      return;
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="enrichment-review"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)' }}>
            Enrich — test picker
          </h1>
          <p className="er-muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)' }}>
            Temporary UI: select bookmarks, then run fetch (r.jina.ai). Disk cache needs backup folder in Settings.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 8,
            color: 'var(--text-muted)',
          }}
          title="Close"
        >
          <X size={22} />
        </button>
      </header>

      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <input
          type="search"
          placeholder="Filter by title or URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={running}
          style={{
            flex: '1 1 200px',
            minWidth: 180,
            padding: '6px 10px',
            fontSize: 'var(--text-sm)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--input-bg)',
            color: 'var(--text)',
          }}
        />
        <button type="button" onClick={() => selectFirst(5)} disabled={running || filtered.length === 0} style={btnSm}>
          Select first 5
        </button>
        <button type="button" onClick={selectEnriched} disabled={running || filtered.length === 0} style={btnSm}>
          Select enriched
        </button>
        <button type="button" onClick={selectAllVisible} disabled={running || filtered.length === 0} style={btnSm}>
          Select visible
        </button>
        <button type="button" onClick={selectNone} disabled={running} style={btnSm}>
          Clear
        </button>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {selected.size} selected · {filtered.length} shown · {items.length} total · re-runs overwrite prior enrichment
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        {loading ? (
          <p style={{ padding: 16, color: 'var(--text-muted)' }}>Loading bookmarks…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: 16, color: 'var(--text-muted)' }}>No bookmarks match.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
            {filtered.map((item) => {
              const enrich = enrichmentByItem.get(item.id);
              const checked = selected.has(item.id);
              return (
                <li
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '8px 6px',
                    borderBottom: '1px solid var(--border)',
                    background: checked ? 'var(--accent-weak)' : 'transparent',
                    color: 'var(--text)',
                    cursor: running ? 'default' : 'pointer',
                  }}
                  onClick={() => !running && toggle(item.id)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item.id)}
                    disabled={running}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: 4, flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
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
                      {item.title || 'Untitled'}
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.url}
                    </div>
                  </div>
                  {enrich && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--bg-panel)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        flexShrink: 0,
                        textAlign: 'right',
                        lineHeight: 1.3,
                      }}
                      title={
                        enrich.fetchSourceId
                          ? `via ${enrich.fetchSourceId}`
                          : enrich.providerId === 'jina'
                            ? 'Phase 1 run — re-fetch for hybrid + AI'
                            : enrich.providerId
                      }
                    >
                      {enrich.status}
                      {enrich.fetchSourceId ? (
                        <>
                          <br />
                          {enrich.fetchSourceId}
                        </>
                      ) : enrich.providerId !== 'hybrid' ? (
                        <>
                          <br />
                          {enrich.providerId}
                        </>
                      ) : null}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--bg)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Selected bookmarks always re-fetch (hybrid pipeline + AI when configured).
          </span>
          {running && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {progress.processed + progress.skipped + progress.failed} / {progress.total} — ok {progress.processed},
              skip {progress.skipped}, fail {progress.failed}
            </span>
          )}
          {result && !running && (
            <span style={{ fontSize: 'var(--text-xs)' }}>
              Done: {result.processed} ok, {result.skipped} skipped, {result.failed} failed — review opened
            </span>
          )}
          {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--error, #dc2626)' }}>{error}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {running ? (
            <button type="button" onClick={() => abortRef.current?.abort()} style={btnSecondary}>
              Cancel run
            </button>
          ) : (
            <>
              <button type="button" onClick={handleClose} style={btnSecondary}>
                Close
              </button>
              {lastRunIds.length > 0 && (
                <button type="button" onClick={() => setReviewOpen(true)} style={btnSecondary}>
                  Review results
                </button>
              )}
              <button
                type="button"
                onClick={handleRun}
                disabled={selected.size === 0}
                style={{
                  ...btnPrimary,
                  opacity: selected.size === 0 ? 0.5 : 1,
                }}
              >
                Enrich {selected.size} selected (re-run)
              </button>
            </>
          )}
        </div>
      </footer>

      <EnrichmentReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        itemIds={lastRunIds.length > 0 ? lastRunIds : undefined}
      />
    </div>
  );
};

const btnSm: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 'var(--text-xs)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'var(--bg-panel)',
  color: 'var(--text)',
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 'var(--text-sm)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-panel)',
  color: 'var(--text)',
  cursor: 'pointer',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 'var(--text-sm)',
  border: 'none',
  borderRadius: 6,
  background: 'var(--accent)',
  color: 'var(--accent-text, #fff)',
  cursor: 'pointer',
  fontWeight: 600,
};
