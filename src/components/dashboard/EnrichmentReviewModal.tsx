import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import type { Item } from '../../lib/db';
import { getAllItems } from '../../lib/db';
import { enrichBatch, enrichOne, getAllEnrichments, loadRawBody, reextractAI, type ItemEnrichment } from '../../lib/enrichment';
import { ItemFieldInventory } from './ItemFieldInventory';

type StatusFilter = 'all' | 'ok' | 'failed' | 'skipped' | 'other';

type ReviewRow = {
  item: Item;
  enrichment?: ItemEnrichment;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** If set, list is limited to these item ids (e.g. last enrich run) */
  itemIds?: string[];
};

const statusColor: Record<string, string> = {
  ok: 'var(--er-ok, #3fb950)',
  failed: 'var(--error, #f85149)',
  skipped: 'var(--er-warn, #d29922)',
  pending: 'var(--text-muted)',
  stale: '#a371f7',
  none: 'var(--text-faint)',
};

function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

const errorCodeHint: Record<string, string> = {
  excluded: 'URL or domain excluded from fetch',
  parse_empty: 'Fetch succeeded but no usable text extracted',
  auth_required: 'Paywall or login required',
  timeout: 'Request timed out',
  rate_limited: 'Provider rate limit',
  network: 'Network error',
  provider_error: 'Provider returned an error',
  oversized: 'Response too large to store',
  no_backup_folder: 'Set backup folder in Settings for disk dumps',
};

const aiStatusHint: Record<string, string> = {
  ok: 'Summary, title, and/or tags extracted',
  not_configured: 'OpenRouter API key missing — set in Settings > AI',
  content_too_short: 'Fetched text too short for AI',
  parse_failed: 'AI response was not valid JSON',
  empty_response: 'AI found no usable content (wall or empty page)',
  api_error: 'AI provider request failed',
};

const aiStatusColor: Record<string, string> = {
  ok: 'var(--er-ok, #3fb950)',
  not_configured: 'var(--er-warn, #d29922)',
  content_too_short: 'var(--text-muted)',
  parse_failed: 'var(--error, #f85149)',
  empty_response: 'var(--text-muted)',
  api_error: 'var(--error, #f85149)',
};

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: string;
}) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
        }}
      >
        {title}
      </h3>
      <div
        className="er-panel"
        style={{
          fontSize: 'var(--text-sm)',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          borderRadius: 6,
          padding: 10,
          maxHeight: 220,
          overflow: 'auto',
          color: 'var(--text)',
        }}
      >
        {empty ? <span className="er-muted">{empty}</span> : children}
      </div>
    </section>
  );
}

export const EnrichmentReviewModal: React.FC<Props> = ({ open, onClose, itemIds }) => {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [rawDump, setRawDump] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState('');
  const [refetching, setRefetching] = useState(false);
  const [refetchAllProgress, setRefetchAllProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [refetchError, setRefetchError] = useState('');
  const [rerunningAi, setRerunningAi] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allItems = await getAllItems();
      const enrichments = await getAllEnrichments();
      const enrichMap = new Map(enrichments.map((e) => [e.itemId, e]));

      const idSet = itemIds?.length ? new Set(itemIds) : null;
      const bookmarks = allItems
        .filter((i) => i.url?.trim() && (!idSet || idSet.has(i.id)))
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

      let list: ReviewRow[] = bookmarks.map((item) => ({
        item,
        enrichment: enrichMap.get(item.id),
      }));

      // When scoped to a run, keep run order; else only items that were enriched at least once
      if (idSet && itemIds) {
        const byId = new Map(list.map((r) => [r.item.id, r]));
        const ordered = itemIds.map((id) => byId.get(id)).filter((r): r is ReviewRow => !!r);
        setRows(ordered);
      } else {
        list = list.filter((r) => r.enrichment);
        list.sort((a, b) => {
          const sa = a.enrichment?.fetchedAt ?? 0;
          const sb = b.enrichment?.fetchedAt ?? 0;
          return sb - sa;
        });
        setRows(list);
      }
      setActiveIndex(0);
    } finally {
      setLoading(false);
    }
  }, [itemIds]);

  useEffect(() => {
    if (open) {
      setRawDump(null);
      setRawError('');
      void load();
    }
  }, [open, load]);

  const filteredRows = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.item.title || '').toLowerCase().includes(q) ||
          (r.item.url || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'all') return list;
    return list.filter((r) => {
      const s = r.enrichment?.status ?? 'none';
      if (statusFilter === 'ok') return s === 'ok';
      if (statusFilter === 'failed') return s === 'failed';
      if (statusFilter === 'skipped') return s === 'skipped';
      return s !== 'ok' && s !== 'failed' && s !== 'skipped';
    });
  }, [rows, search, statusFilter]);

  useEffect(() => {
    if (activeIndex >= filteredRows.length) {
      setActiveIndex(Math.max(0, filteredRows.length - 1));
    }
  }, [filteredRows.length, activeIndex]);

  const active = filteredRows[activeIndex];

  useEffect(() => {
    setRawDump(null);
    setRawError('');
  }, [active?.item.id]);

  const loadDump = async () => {
    const enrich = active?.enrichment;
    if (!enrich?.rawRef) {
      setRawError('No raw dump on disk for this item.');
      return;
    }
    setRawLoading(true);
    setRawError('');
    try {
      const text = await loadRawBody(enrich.rawRef);
      if (!text) {
        setRawError('File missing (stale?) — path: ' + enrich.rawRef);
        setRawDump(null);
      } else {
        setRawDump(text);
      }
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'Failed to load dump');
    } finally {
      setRawLoading(false);
    }
  };

  const handleRerunAi = async () => {
    if (!active?.item.id || rerunningAi || refetching) return;
    setRerunningAi(true);
    setRefetchError('');
    try {
      const result = await reextractAI(active.item.id);
      await load();
      if (result.skipped || result.message) {
        if (result.skipped && result.message !== 'ok') {
          setRefetchError(`Re-run AI: ${result.message}`);
        } else if (result.message && result.message !== 'ok') {
          setRefetchError(`Re-run AI: ${result.message}`);
        }
      }
    } catch (e) {
      setRefetchError(e instanceof Error ? e.message : 'Re-run AI failed');
    } finally {
      setRerunningAi(false);
    }
  };

  const handleRefetch = async () => {
    if (!active?.item.id || refetching) return;
    setRefetching(true);
    setRefetchError('');
    setRawDump(null);
    try {
      const result = await enrichOne(active.item.id, { force: true });
      await load();
      if (result.status === 'failed' || result.skipped) {
        setRefetchError(result.message || result.errorCode || result.status);
      }
    } catch (e) {
      setRefetchError(e instanceof Error ? e.message : 'Re-fetch failed');
    } finally {
      setRefetching(false);
    }
  };

  const handleRefetchAll = async () => {
    if (refetching || rows.length === 0) return;
    setRefetching(true);
    setRefetchError('');
    setRefetchAllProgress({ done: 0, total: rows.length });
    setRawDump(null);
    try {
      const ids = rows.map((r) => r.item.id);
      const result = await enrichBatch({
        itemIds: ids,
        force: true,
        mode: 'full',
        maxItems: ids.length,
        onProgress: (p) => {
          const done = p.processed + p.skipped + p.failed;
          setRefetchAllProgress({ done: Math.min(done, p.total), total: p.total });
        },
      });
      await load();
      if (result.failed > 0) {
        setRefetchError(`Re-fetch all done: ${result.processed} ok, ${result.failed} failed, ${result.skipped} skipped`);
      }
    } catch (e) {
      setRefetchError(e instanceof Error ? e.message : 'Re-fetch all failed');
    } finally {
      setRefetching(false);
      setRefetchAllProgress(null);
    }
  };

  const counts = useMemo(() => {
    const c = { ok: 0, failed: 0, skipped: 0, other: 0, none: 0 };
    for (const r of rows) {
      const s = r.enrichment?.status ?? 'none';
      if (s === 'ok') c.ok++;
      else if (s === 'failed') c.failed++;
      else if (s === 'skipped') c.skipped++;
      else if (s === 'none') c.none++;
      else c.other++;
    }
    return c;
  }, [rows]);

  if (!open) return null;

  const enrich = active?.enrichment;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="enrichment-review"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10002,
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
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)' }}>
            Enrichment review
          </h1>
          <p className="er-muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)' }}>
            {itemIds?.length
              ? `Last run: ${rows.length} items · ok ${counts.ok} · failed ${counts.failed} · skipped ${counts.skipped}`
              : `${rows.length} with enrichment · ok ${counts.ok} · failed ${counts.failed} · skipped ${counts.skipped}`}
            {refetchAllProgress
              ? ` · Re-fetching ${refetchAllProgress.done}/${refetchAllProgress.total}…`
              : null}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefetchAll}
          disabled={refetching || rows.length === 0}
          style={{
            padding: '6px 12px',
            fontSize: 'var(--text-xs)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'var(--bg-panel)',
            color: 'var(--text)',
            cursor: refetching || rows.length === 0 ? 'not-allowed' : 'pointer',
            opacity: refetching || rows.length === 0 ? 0.6 : 1,
            flexShrink: 0,
          }}
          title="Re-fetch every item in this review list (hybrid pipeline + AI)"
        >
          {refetching && refetchAllProgress
            ? `Re-fetching ${refetchAllProgress.done}/${refetchAllProgress.total}…`
            : `Re-fetch all (${rows.length})`}
        </button>
        <button type="button" onClick={onClose} style={iconBtn} title="Close">
          <X size={22} />
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* List */}
        <aside
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-panel)',
          }}
        >
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input
              type="search"
              placeholder="Filter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {(['all', 'ok', 'failed', 'skipped', 'other'] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setStatusFilter(f);
                    setActiveIndex(0);
                  }}
                  className={statusFilter === f ? 'er-btn er-btn-active' : 'er-btn'}
                  style={{
                    ...chipBtn,
                    fontWeight: statusFilter === f ? 600 : 400,
                  }}
                >
                  {f}
                  {f === 'ok' && ` (${counts.ok})`}
                  {f === 'failed' && ` (${counts.failed})`}
                  {f === 'skipped' && ` (${counts.skipped})`}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading ? (
              <p style={{ padding: 12, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Loading…</p>
            ) : filteredRows.length === 0 ? (
              <p style={{ padding: 12, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>No matches.</p>
            ) : (
              filteredRows.map((row, idx) => {
                const st = row.enrichment?.status ?? 'none';
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={row.item.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      background: isActive ? 'var(--accent-weak)' : 'transparent',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text)',
                      }}
                    >
                      {row.item.title || 'Untitled'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: statusColor[st] || '#6b7280',
                        }}
                      >
                        {st}
                      </span>
                      {row.enrichment?.lastErrorCode && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {row.enrichment.lastErrorCode}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Detail */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            background: 'var(--bg)',
            color: 'var(--text)',
          }}
        >
          {!active ? (
            <p style={{ padding: 24, color: 'var(--text-muted)' }}>Select an item from the list.</p>
          ) : (
            <>
              <div
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  disabled={activeIndex <= 0}
                  onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                  style={iconBtn}
                >
                  <ChevronLeft size={18} />
                </button>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {activeIndex + 1} / {filteredRows.length}
                </span>
                <button
                  type="button"
                  disabled={activeIndex >= filteredRows.length - 1}
                  onClick={() => setActiveIndex((i) => Math.min(filteredRows.length - 1, i + 1))}
                  style={iconBtn}
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleRerunAi}
                  disabled={refetching || rerunningAi || enrich?.status !== 'ok'}
                  style={{
                    padding: '4px 10px',
                    fontSize: 'var(--text-xs)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--bg-panel)',
                    color: 'var(--text)',
                    cursor: refetching || rerunningAi || enrich?.status !== 'ok' ? 'not-allowed' : 'pointer',
                    opacity: refetching || rerunningAi || enrich?.status !== 'ok' ? 0.6 : 1,
                  }}
                  title="Re-run AI extraction from cached snippet (no network fetch)"
                >
                  {rerunningAi ? 'Re-running AI…' : 'Re-run AI'}
                </button>
                <button
                  type="button"
                  onClick={handleRefetch}
                  disabled={refetching || rerunningAi}
                  style={{
                    marginLeft: 'auto',
                    padding: '4px 10px',
                    fontSize: 'var(--text-xs)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--bg-panel)',
                    color: 'var(--text)',
                    cursor: refetching || rerunningAi ? 'wait' : 'pointer',
                    opacity: refetching || rerunningAi ? 0.7 : 1,
                  }}
                  title="Re-fetch this item only (hybrid pipeline + AI)"
                >
                  {refetching && !refetchAllProgress ? 'Re-fetching…' : 'Re-fetch this'}
                </button>
                <a
                  href={active.item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--accent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  Open URL <ExternalLink size={12} />
                </a>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 'var(--text-base)', color: 'var(--text)' }}>
                  {active.item.title || 'Untitled'}
                </h2>
                <p
                  className="er-muted"
                  style={{
                    margin: '0 0 16px',
                    fontSize: 'var(--text-xs)',
                    wordBreak: 'break-all',
                  }}
                >
                  {active.item.url}
                </p>
                {refetchError ? (
                  <p style={{ margin: '0 0 12px', fontSize: 'var(--text-xs)', color: 'var(--error, #dc2626)' }}>
                    Re-fetch: {refetchError}
                  </p>
                ) : null}

                <Section
                  title="Status & meta"
                  empty={!enrich ? 'No enrichment record — item was not processed or failed before save.' : undefined}
                >
                  {enrich && (
                    <>
                      <div>
                        <strong>Status:</strong> {enrich.status}
                        {enrich.lastErrorCode ? ` · ${enrich.lastErrorCode}` : ''}
                      </div>
                      {enrich.lastErrorCode && (
                        <div className="er-fetch" style={{ marginTop: 4 }}>
                          {errorCodeHint[enrich.lastErrorCode] ?? enrich.lastErrorCode}
                        </div>
                      )}
                      {enrich.skipReason && (
                        <div style={{ marginTop: 4 }}>
                          <strong>Skip reason:</strong> {enrich.skipReason}
                        </div>
                      )}
                      <div>
                        <strong>Provider:</strong> {enrich.providerId}
                        {enrich.fetchSourceId && enrich.fetchSourceId !== enrich.providerId
                          ? ` (${enrich.fetchSourceId})`
                          : ''}{' '}
                        · <strong>Fetched:</strong> {formatTime(enrich.fetchedAt)}
                      </div>
                      {enrich.aiTags?.length ? (
                        <div>
                          <strong>AI tags:</strong> {enrich.aiTags.join(', ')}
                        </div>
                      ) : null}
                      {enrich.status === 'ok' && enrich.aiStatus ? (
                        <div style={{ marginTop: 4 }}>
                          <strong>AI:</strong>{' '}
                          <span style={{ color: aiStatusColor[enrich.aiStatus] ?? 'var(--text)' }}>
                            {enrich.aiStatus}
                          </span>
                          {enrich.aiAt ? ` · ${formatTime(enrich.aiAt)}` : ''}
                          <div className="er-fetch" style={{ marginTop: 2 }}>
                            {enrich.aiError ?? aiStatusHint[enrich.aiStatus] ?? enrich.aiStatus}
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <strong>Kind:</strong> {enrich.sourceKind ?? '—'} · <strong>Attempts:</strong>{' '}
                        {enrich.attempts}
                        {enrich.skipReason ? ` · skip: ${enrich.skipReason}` : ''}
                      </div>
                      <div>
                        <strong>Disk:</strong>{' '}
                        {enrich.hasRawBody
                          ? `yes · ${enrich.rawRef} (${enrich.rawBytes ?? '?'} bytes)`
                          : 'no raw file'}
                      </div>
                    </>
                  )}
                </Section>

                <Section
                  title="AI summary"
                  empty={
                    !enrich?.summary?.trim() && !enrich?.aiKeyPoints?.length
                      ? enrich?.status === 'ok' && enrich.aiStatus && enrich.aiStatus !== 'ok'
                        ? enrich.aiError || aiStatusHint[enrich.aiStatus] || 'No AI summary'
                        : enrich?.status === 'ok' && enrich.aiStatus === 'ok'
                          ? 'AI ran but returned no summary (tags or title only)'
                          : enrich?.status === 'ok'
                            ? 'Re-fetch after adding an OpenRouter API key in Settings > AI'
                            : 'Available after a successful fetch + AI run'
                      : undefined
                  }
                >
                  {enrich?.summary?.trim()}
                  {enrich?.aiKeyPoints?.length ? (
                    <>
                      {'\n\n'}
                      {enrich.aiKeyPoints.map((p) => `• ${p}`).join('\n')}
                    </>
                  ) : null}
                </Section>

                <ItemFieldInventory item={active.item} enrichment={enrich} />

                <section>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Full dump (disk)
                    </h3>
                    <button
                      type="button"
                      className="er-btn"
                      onClick={loadDump}
                      disabled={rawLoading || !enrich?.rawRef}
                      style={chipBtn}
                    >
                      {rawLoading ? 'Loading…' : rawDump ? 'Reload dump' : 'Load dump'}
                    </button>
                  </div>
                  <div
                    className="er-panel"
                    style={{
                      fontSize: 'var(--text-xs)',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      borderRadius: 6,
                      padding: 10,
                      maxHeight: 360,
                      overflow: 'auto',
                      fontFamily: 'ui-monospace, monospace',
                      color: 'var(--text)',
                    }}
                  >
                    {rawError && <span className="er-fetch">{rawError}</span>}
                    {!rawError && !rawDump && !rawLoading && (
                      <span className="er-muted">
                        {enrich?.hasRawBody
                          ? 'Click Load dump to read enrichment-cache file.'
                          : 'No dump saved (backup folder missing or empty response).'}
                      </span>
                    )}
                    {rawDump}
                  </div>
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 'var(--text-sm)',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  boxSizing: 'border-box',
};

const iconBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 6,
  color: 'var(--text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
};

const chipBtn: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 'var(--text-xs)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
};
