import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw, Tags, X } from 'lucide-react';
import { CategorizationPanel } from './CategorizationPanel';
import { ensurePendingClassifySignals } from '../../lib/categorization';
import {
  getPipelineQueueFilterCounts,
  getTaxonomyTreeWithCounts,
  listPipelineQueueItems,
  PIPELINE_QUEUE_FILTER_OPTIONS,
  type PipelineQueueFilter,
  type PipelineQueueItemRow,
  type TaxonomyParentRow,
} from '../../lib/categorization/devQueries';
import {
  displayClassifyStateLabel,
  resolveClassifyQueueBlocker,
} from '../../lib/categorization/classifyQueueBlocker';
import { ClassifyQueueReasonBlock } from './ClassifyQueueReasonBlock';
import { SearchDevPanel } from './SearchDevPanel';
import type { CategorizationQueueStats } from '../../lib/categorization/types';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';

type DevTab = 'queue' | 'taxonomy' | 'search';

const stateColor: Record<string, string> = {
  pending_classify: '#58a6ff',
  pending_reclassify: '#a371f7',
  pending_discover: '#d29922',
  classified_general: '#d29922',
  manual_review: '#f85149',
  ineligible: 'var(--text-faint)',
  skipped: 'var(--text-muted)',
  classified: 'var(--er-ok, #3fb950)',
  manual_only: '#a371f7',
  none: 'var(--text-faint)',
};

function rowStateLabel(row: PipelineQueueItemRow): string {
  const blocker = resolveClassifyQueueBlocker({
    item: row.item,
    enrichment: row.enrichment,
    classifyState: row.classifyState,
    hasSignal: row.hasSignal,
    eligible: row.eligible,
    eligibilityReason: row.eligibilityReason,
  });
  return displayClassifyStateLabel(row.classifyState, blocker);
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 10px',
    fontSize: 'var(--dev-fs-caption)',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-weak)' : 'var(--bg)',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function CountBadge({ n, muted }: { n: number; muted?: boolean }) {
  return (
    <span
      style={{
        marginLeft: 4,
        fontSize: 'var(--dev-fs-caption)',
        opacity: muted ? 0.7 : 1,
        color: 'var(--text-faint)',
      }}
    >
      {n}
    </span>
  );
}

function SourceBadge({ source }: { source?: string }) {
  const isDiscovered = source === 'discovered';
  return (
    <span
      style={{
        fontSize: 'var(--dev-fs-caption)',
        padding: '1px 5px',
        borderRadius: 4,
        background: isDiscovered ? 'rgba(88,166,255,0.15)' : 'rgba(63,185,80,0.12)',
        color: isDiscovered ? '#58a6ff' : 'var(--er-ok, #3fb950)',
      }}
    >
      {source ?? 'seed'}
    </span>
  );
}

function QueueTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: PipelineQueueItemRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!rows.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--dev-fs-base)' }}>
        No items match this filter.
      </div>
    );
  }

  return (
    <div className="scrollbar" style={{ overflow: 'auto', flex: 1, minHeight: 200 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--dev-fs-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>Title</th>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>Why (gate / skip)</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, width: 120 }}>State</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, width: 180 }}>Topic</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, width: 72 }}>AI</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, width: 56 }}>Retry</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, width: 72 }}>Quality</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = row.item.id;
            const active = selectedId === id;
            const st = row.classifyState;
            return (
              <tr
                key={id}
                onClick={() => onSelect(id)}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: active ? 'var(--accent-weak)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <td style={{ padding: '6px 8px', maxWidth: 280 }}>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: active ? 600 : 400,
                      color: 'var(--text)',
                    }}
                    title={row.item.title || row.item.url}
                  >
                    {row.item.title || '(untitled)'}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--dev-fs-caption)',
                      color: 'var(--text-faint)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row.item.url}
                  >
                    {row.item.url}
                  </div>
                </td>
                <td style={{ padding: '6px 8px', maxWidth: 220 }}>
                  <ClassifyQueueReasonBlock
                    compact
                    classifyState={st}
                    enrichment={row.enrichment}
                    hasSignal={row.hasSignal}
                    signal={{
                      eligibilityReason: row.eligibilityReason,
                      lastClassifySkipReason: row.lastClassifySkipReason,
                      classifyRetryCount: row.classifyRetryCount,
                      inputQualityTier: row.inputQualityTier,
                    }}
                    eligibleNow={row.eligible}
                    eligibilityReasonNow={row.eligibilityReason}
                    hasPrimaryTopic={!!row.topicPath}
                  />
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <span style={{ color: stateColor[st ?? 'none'] ?? 'var(--text-muted)' }}>
                    {rowStateLabel(row)}
                  </span>
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                  {row.topicPath ?? '—'}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <span style={{ color: row.enrichment?.aiStatus === 'ok' ? 'var(--er-ok)' : 'var(--text-faint)' }}>
                    {row.enrichment?.aiStatus ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                  {row.classifyRetryCount ?? 0}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                  {row.inputQualityTier ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ItemDetail({
  row,
  onActionComplete,
}: {
  row: PipelineQueueItemRow | null;
  onActionComplete?: () => void;
}) {
  if (!row) {
    return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 'var(--dev-fs-base)' }}>
        Select a row to inspect signal details.
      </div>
    );
  }

  return (
    <div style={{ padding: 12, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 'var(--dev-fs-base)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.item.title || row.item.url}
        </strong>
        {row.item.url ? (
          <ExtensionPageUrlLink
            url={row.item.url}
            style={{ color: 'var(--accent)', display: 'flex' }}
            title="Open URL"
          >
            <ExternalLink size={14} />
          </ExtensionPageUrlLink>
        ) : null}
      </div>
      <ClassifyQueueReasonBlock
        itemId={row.item.id}
        onActionComplete={onActionComplete}
        classifyState={row.classifyState}
        signal={{
          eligibilityReason: row.eligibilityReason,
          lastClassifySkipReason: row.lastClassifySkipReason,
          classifyRetryCount: row.classifyRetryCount,
          inputQualityTier: row.inputQualityTier,
        }}
        eligibleNow={row.eligible}
        eligibilityReasonNow={row.eligibilityReason}
        hasPrimaryTopic={!!row.topicPath}
        style={{ marginBottom: 8 }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '4px 16px',
          fontSize: 'var(--dev-fs-caption)',
          color: 'var(--text-muted)',
        }}
      >
        <div>
          <span style={{ color: 'var(--text-faint)' }}>Fetch: </span>
          {row.enrichment?.status ?? 'none'}
        </div>
        <div>
          <span style={{ color: 'var(--text-faint)' }}>AI: </span>
          {row.enrichment?.aiStatus ?? '—'}
        </div>
        <div>
          <span style={{ color: 'var(--text-faint)' }}>Quality tier: </span>
          {row.inputQualityTier ?? '—'}
        </div>
        <div>
          <span style={{ color: 'var(--text-faint)' }}>Retries: </span>
          {row.classifyRetryCount ?? 0}
        </div>
      </div>
      {row.enrichment?.summary ? (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--dev-fs-caption)',
            color: 'var(--text-muted)',
            lineHeight: 1.45,
            maxHeight: 120,
            overflow: 'auto',
          }}
        >
          {row.enrichment.summary.slice(0, 400)}
          {row.enrichment.summary.length > 400 ? '…' : ''}
        </p>
      ) : null}
    </div>
  );
}

function ParentTaxonomyRow({ row, defaultOpen }: { row: TaxonomyParentRow; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? row.primaryItemCount > 0);
  const p = row.category;

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          border: 'none',
          background: open ? 'var(--accent-weak)' : 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text)',
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontWeight: 600, flex: 1 }}>{p.name}</span>
        <SourceBadge source={p.source} />
        <span style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', width: 48, textAlign: 'right' }}>
          {row.childLeafCount} leaves
        </span>
        <span style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', width: 56, textAlign: 'right' }}>
          {row.primaryItemCount} pri
        </span>
        <span style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)', width: 48, textAlign: 'right' }}>
          {row.itemCount} all
        </span>
      </button>
      {open ? (
        <div style={{ paddingLeft: 28, paddingBottom: 4 }}>
          {row.leaves.map((leaf) => (
            <div
              key={leaf.category.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                fontSize: 'var(--dev-fs-sm)',
                color: leaf.primaryItemCount ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {leaf.category.isGeneralFallback ? '◦ ' : '• '}
                {leaf.category.name}
              </span>
              <SourceBadge source={leaf.category.source} />
              <span style={{ width: 56, textAlign: 'right', fontSize: 'var(--dev-fs-caption)' }}>{leaf.primaryItemCount}</span>
              <span style={{ width: 48, textAlign: 'right', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)' }}>
                {leaf.itemCount}
              </span>
            </div>
          ))}
          {!row.leaves.length ? (
            <div style={{ padding: '4px 10px', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)' }}>No leaves</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type PipelineDevViewProps = {
  onClose?: () => void;
  /** Hide standalone header when nested inside Enrichment dev modal. */
  embedded?: boolean;
};

export function PipelineDevView({ onClose, embedded = false }: PipelineDevViewProps) {
  const [tab, setTab] = useState<DevTab>('queue');
  const [filter, setFilter] = useState<PipelineQueueFilter>('needs_attention');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PipelineQueueItemRow[]>([]);
  const [filterCounts, setFilterCounts] = useState<Partial<Record<PipelineQueueFilter, number>>>({});
  const [queueStats, setQueueStats] = useState<CategorizationQueueStats | null>(null);
  const [taxonomy, setTaxonomy] = useState<Awaited<ReturnType<typeof getTaxonomyTreeWithCounts>> | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await ensurePendingClassifySignals();
      const [{ counts, queue }, list] = await Promise.all([
        getPipelineQueueFilterCounts(),
        listPipelineQueueItems(filter, search),
      ]);
      setFilterCounts(counts);
      setQueueStats(queue);
      setRows(list);
      const tree = await getTaxonomyTreeWithCounts();
      setTaxonomy(tree);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scopedIds = useMemo(() => rows.map((r) => r.item.id), [rows]);
  const selectedRow = rows.find((r) => r.item.id === selectedId) ?? rows[0] ?? null;

  useEffect(() => {
    if (rows.length && (!selectedId || !rows.some((r) => r.item.id === selectedId))) {
      setSelectedId(rows[0].item.id);
    }
    if (!rows.length) setSelectedId(null);
  }, [rows, selectedId]);

  const tabBtn = (id: DevTab, label: string) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        style={{
          padding: '6px 14px',
          fontSize: 'var(--dev-fs-base)',
          fontWeight: active ? 600 : 400,
          border: 'none',
          borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
          background: 'transparent',
          color: active ? 'var(--text)' : 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="dev-pipeline-ui"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
        color: 'var(--text)',
      }}
    >
      {!embedded ? (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <Tags size={18} />
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 'var(--dev-fs-md)', fontWeight: 600 }}>Pipeline dev</h1>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
              Inspect classify queue buckets and taxonomy counts. Run pipeline on filtered sets below.
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 6,
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <X size={20} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          paddingLeft: 8,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {tabBtn('queue', 'Classify queue')}
        {tabBtn('taxonomy', `Taxonomy (${taxonomy?.totals.leaves ?? '…'} topics)`)}
        {tabBtn('search', 'Search (dev)')}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginRight: 8,
            padding: '6px 10px',
            fontSize: 'var(--dev-fs-sm)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-muted)',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw size={14} style={loading ? { animation: 'wb-spin 1s linear infinite' } : undefined} />
          Refresh
        </button>
      </div>

      {tab === 'search' ? (
        <SearchDevPanel />
      ) : tab === 'queue' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {PIPELINE_QUEUE_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.hint}
                  onClick={() => setFilter(opt.id)}
                  style={chipStyle(filter === opt.id)}
                >
                  {opt.label}
                  <CountBadge n={filterCounts[opt.id] ?? 0} />
                </button>
              ))}
            </div>
            <input
              type="search"
              placeholder="Search title, URL, topic, state…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                maxWidth: 420,
                padding: '6px 10px',
                fontSize: 'var(--dev-fs-base)',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text)',
              }}
            />
            <p style={{ margin: '8px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
              Showing <strong>{rows.length}</strong> bookmark(s) · scoped pipeline runs affect this filter only
            </p>
          </div>

          <CategorizationPanel
            scopedItemIds={scopedIds.length ? scopedIds : undefined}
            scopeLabel="filtered queue"
            defaultCollapsed
            onPipelineComplete={() => void refresh()}
          />

          <div
            style={{
              flex: 1,
              display: 'flex',
              minHeight: 320,
              borderTop: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <QueueTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <div
              className="scrollbar"
              style={{
                width: 360,
                flexShrink: 0,
                borderLeft: '1px solid var(--border)',
                overflow: 'auto',
                background: 'var(--bg)',
              }}
            >
              <ItemDetail row={selectedRow} onActionComplete={() => void refresh()} />
            </div>
          </div>
        </div>
      ) : (
        <div className="scrollbar" style={{ flex: 1, overflow: 'auto', padding: '0 0 16px' }}>
          {taxonomy ? (
            <>
              <div
                style={{
                  padding: '10px 16px',
                  fontSize: 'var(--dev-fs-sm)',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  <strong>{taxonomy.totals.parents}</strong> parents
                </span>
                <span>
                  <strong>{taxonomy.totals.leaves}</strong> leaves
                </span>
                <span>
                  <strong>{taxonomy.totals.itemsWithPrimary}</strong> items with primary topic
                </span>
                {queueStats ? (
                  <>
                    <span>
                      {queueStats.classified} specific · {queueStats.classifiedGeneral} general
                    </span>
                    <span>
                      {queueStats.pendingClassify} pending · {queueStats.manualReview} manual review
                    </span>
                  </>
                ) : null}
              </div>
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: 'var(--dev-fs-caption)',
                  color: 'var(--text-faint)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  gap: 8,
                }}
              >
                <span style={{ flex: 1 }}>Parent / leaf</span>
                <span style={{ width: 48, textAlign: 'right' }}>leaves</span>
                <span style={{ width: 56, textAlign: 'right' }}>primary</span>
                <span style={{ width: 48, textAlign: 'right' }}>total</span>
              </div>
              {taxonomy.parents.map((row, i) => (
                <ParentTaxonomyRow key={row.category.id} row={row} defaultOpen={i < 3} />
              ))}
              {taxonomy.orphanLeaves.length ? (
                <div style={{ marginTop: 12, padding: '0 10px' }}>
                  <div style={{ fontSize: 'var(--dev-fs-caption)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Orphan leaves (no parent)
                  </div>
                  {taxonomy.orphanLeaves.map((leaf) => (
                    <div
                      key={leaf.category.id}
                      style={{
                        display: 'flex',
                        gap: 8,
                        padding: '4px 0',
                        fontSize: 'var(--dev-fs-sm)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span style={{ flex: 1 }}>{leaf.category.name}</span>
                      <span style={{ width: 56, textAlign: 'right' }}>{leaf.primaryItemCount}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading taxonomy…</div>
          )}
        </div>
      )}
      <style>{`@keyframes wb-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
