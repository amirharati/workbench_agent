import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import type { Item } from '../../lib/db';
import { getAllItems } from '../../lib/db';
import { enrichBatch, enrichOne, getAllEnrichments, loadRawBody, reextractAI, type ItemEnrichment } from '../../lib/enrichment';
import { ItemFieldInventory } from './ItemFieldInventory';
import { CategorizationPanel, ItemCategoryLinks } from './CategorizationPanel';
import { ItemSimilarSection } from './SearchDiscoveryBlocks';
import { PipelineDevView } from './PipelineDevView';
import { getAiCategories, ensurePendingClassifySignals, getScopedCategorizationStats, hasSpecificPrimaryTopic } from '../../lib/categorization';
import { resolveEffectiveClassifyState } from '../../lib/categorization/counts';
import { describeClassifyQueueStatus } from '../../lib/categorization/classifyQueueReason';
import { assessCategorizationEligibility } from '../../lib/enrichment/categorizationEligibility';
import { ClassifyQueueReasonBlock } from './ClassifyQueueReasonBlock';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import { getDB } from '../../lib/db';
import type { ClassifyState } from '../../lib/categorization/types';
import {
  formatEnrichmentFailureMessage,
  ENRICHMENT_ERROR_HINTS,
  AI_STATUS_HINTS,
  describeAiFailure,
  resolveEnrichmentFailureLabel,
  FAILURE_CATEGORY_LABELS,
  type FailureCategory,
} from '../../lib/enrichment';

type StatusFilter = 'all' | 'ok' | 'failed' | 'skipped' | 'other';
type FailureCategoryFilter = 'all' | FailureCategory;
type CatFilter = 'all' | 'no_topic' | 'has_topic';
type QueueFilter = 'all' | 'pending' | 'discover' | 'ineligible' | 'manual_review' | 'needs_attention';

function rowPassesFetchFilter(status: string | undefined, statusFilter: StatusFilter): boolean {
  const s = status ?? 'none';
  if (statusFilter === 'all') return true;
  if (statusFilter === 'ok') return s === 'ok';
  if (statusFilter === 'failed') return s === 'failed';
  if (statusFilter === 'skipped') return s === 'skipped';
  return s !== 'ok' && s !== 'failed' && s !== 'skipped';
}

function rowPassesQueueFilter(
  queueFilter: QueueFilter,
  cat: RowCatMeta | undefined,
  aiOk: boolean
): boolean {
  if (queueFilter === 'all') return true;
  if (!aiOk) return false;
  const st = cat?.classifyState ?? 'pending_classify';
  if (queueFilter === 'pending') {
    return !!cat?.readyToClassify;
  }
  if (queueFilter === 'discover') {
    return st === 'pending_discover';
  }
  if (queueFilter === 'ineligible') return st === 'ineligible';
  if (queueFilter === 'manual_review') return st === 'manual_review';
  if (queueFilter === 'needs_attention') {
    if (hasSpecificPrimaryTopic(cat?.primaryCategoryId, st)) return false;
    if (st === 'skipped' || st === 'manual_only') return false;
    return true;
  }
  return true;
}

type RowCatMeta = {
  primaryName: string | null;
  primaryCategoryId: string | null;
  readyToClassify: boolean;
  classifyState?: ClassifyState;
  queueReason?: string;
  signal?: {
    eligibilityReason?: string;
    lastClassifySkipReason?: string;
    classifyRetryCount?: number;
    inputQualityTier?: import('../../lib/categorization/types').ClassifyInputQualityTier;
    llmReview?: { reason?: string };
    signalStatus?: import('../../lib/categorization/types').AiSignalStatus;
  };
};

type ReviewRow = {
  item: Item;
  enrichment?: ItemEnrichment;
};

type DevHubTab = 'results' | 'pipeline';

type Props = {
  open: boolean;
  onClose: () => void;
  /** If set, list is limited to these item ids (e.g. last enrich run) */
  itemIds?: string[];
  /** Which top-level dev tab to show when the modal opens. */
  initialTab?: DevHubTab;
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
          fontSize: 'var(--dev-fs-sm)',
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
          fontSize: 'var(--dev-fs-base)',
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

export const EnrichmentReviewModal: React.FC<Props> = ({ open, onClose, itemIds, initialTab = 'results' }) => {
  const [devTab, setDevTab] = useState<DevHubTab>(initialTab);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [failureCategoryFilter, setFailureCategoryFilter] = useState<FailureCategoryFilter>('all');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [catByItem, setCatByItem] = useState<Map<string, RowCatMeta>>(new Map());
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
      await ensurePendingClassifySignals();
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

      const rowIds = new Set(list.map((r) => r.item.id));
      const catMeta = new Map<string, RowCatMeta>();
      try {
        const db = await getDB();
        const [categories, links, signals] = await Promise.all([
          getAiCategories(),
          db.objectStoreNames.contains('ai_item_category_links')
            ? db.getAll('ai_item_category_links')
            : [],
          db.objectStoreNames.contains('ai_item_signals')
            ? db.getAll('ai_item_signals')
            : [],
        ]);
        const nameById = new Map(categories.map((c) => [c.id, c.name]));
        const primaryNameByItem = new Map<string, string>();
        const primaryIdByItem = new Map<string, string>();
        for (const l of links) {
          if (
            !rowIds.has(l.itemId) ||
            l.source !== 'ai' ||
            !l.isPrimary ||
            l.status === 'rejected'
          ) {
            continue;
          }
          primaryIdByItem.set(l.itemId, l.categoryId);
          primaryNameByItem.set(l.itemId, nameById.get(l.categoryId) ?? l.categoryId);
        }
        const signalByItem = new Map(signals.map((s) => [s.itemId, s]));
        for (const row of list) {
          const id = row.item.id;
          const rawSignal = signalByItem.get(id);
          const rawSt = rawSignal?.classifyState;
          const primaryId = primaryIdByItem.get(id);
          const primaryName = primaryNameByItem.get(id) ?? null;
          const effectiveSt = resolveEffectiveClassifyState({
            signalState: rawSt,
            primaryCategoryId: primaryId,
          });
          const eligibility = assessCategorizationEligibility(row.item, row.enrichment);
          const reasonInfo = describeClassifyQueueStatus({
            classifyState: effectiveSt,
            signal: rawSignal,
            enrichment: row.enrichment,
            hasSignal: !!rawSignal,
            eligibleNow: eligibility.eligible,
            eligibilityReasonNow: eligibility.reason,
            hasPrimaryTopic: !!primaryName,
          });
          catMeta.set(id, {
            primaryName,
            primaryCategoryId: primaryId ?? null,
            readyToClassify: false,
            classifyState: effectiveSt,
            queueReason: reasonInfo.primaryReason,
            signal: rawSignal
              ? {
                  eligibilityReason: rawSignal.eligibilityReason,
                  lastClassifySkipReason: rawSignal.lastClassifySkipReason,
                  classifyRetryCount: rawSignal.classifyRetryCount,
                  inputQualityTier: rawSignal.inputQualityTier,
                  llmReview: rawSignal.llmReview,
                  signalStatus: rawSignal.signalStatus,
                }
              : undefined,
          });
        }
      } catch {
        /* non-fatal */
      }
      try {
        const scopeStats = await getScopedCategorizationStats(list.map((r) => r.item.id));
        const readySet = new Set(scopeStats.readyItemIds);
        for (const [id, meta] of catMeta) {
          catMeta.set(id, { ...meta, readyToClassify: readySet.has(id) });
        }
      } catch {
        /* non-fatal */
      }
      setCatByItem(catMeta);
    } finally {
      setLoading(false);
    }
  }, [itemIds]);

  useEffect(() => {
    if (open) {
      setDevTab(initialTab);
      setRawDump(null);
      setRawError('');
      void load();
    }
  }, [open, initialTab, load]);

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
    if (statusFilter !== 'all') {
      list = list.filter((r) =>
        rowPassesFetchFilter(r.enrichment?.status, statusFilter)
      );
    }
    if (failureCategoryFilter !== 'all') {
      list = list.filter((r) => {
        const label = resolveEnrichmentFailureLabel(r.enrichment);
        return label?.category === failureCategoryFilter;
      });
    }
    if (catFilter !== 'all') {
      list = list.filter((r) => {
        const cat = catByItem.get(r.item.id);
        if (catFilter === 'has_topic') return !!cat?.primaryName;
        return r.enrichment?.aiStatus === 'ok' && !cat?.primaryName;
      });
    }
    if (queueFilter !== 'all') {
      list = list.filter((r) => {
        const cat = catByItem.get(r.item.id);
        return rowPassesQueueFilter(queueFilter, cat, r.enrichment?.aiStatus === 'ok');
      });
    }
    return list;
  }, [rows, search, statusFilter, failureCategoryFilter, catFilter, queueFilter, catByItem]);

  const failureCategoryCounts = useMemo(() => {
    const counts: Partial<Record<FailureCategory, number>> = {};
    for (const row of rows) {
      if (!rowPassesFetchFilter(row.enrichment?.status, statusFilter)) continue;
      const label = resolveEnrichmentFailureLabel(row.enrichment);
      if (!label) continue;
      counts[label.category] = (counts[label.category] ?? 0) + 1;
    }
    return counts;
  }, [rows, statusFilter]);

  const queueCounts = useMemo(() => {
    const c = {
      pending: 0,
      pendingDiscover: 0,
      ineligible: 0,
      manualReview: 0,
      needsAttention: 0,
      noTopic: 0,
      hasTopic: 0,
    };
    for (const row of rows) {
      if (!rowPassesFetchFilter(row.enrichment?.status, statusFilter)) continue;
      const cat = catByItem.get(row.item.id);
      if (row.enrichment?.aiStatus !== 'ok') continue;
      const st = cat?.classifyState ?? 'pending_classify';
      if (cat?.primaryName) c.hasTopic++;
      else c.noTopic++;
      if (cat?.readyToClassify) c.pending++;
      if (st === 'pending_discover') c.pendingDiscover++;
      if (st === 'ineligible') c.ineligible++;
      if (st === 'manual_review') c.manualReview++;
      if (rowPassesQueueFilter('needs_attention', cat, true)) c.needsAttention++;
    }
    return c;
  }, [rows, catByItem, statusFilter]);

  const noTopicBreakdown = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const row of rows) {
      if (!rowPassesFetchFilter(row.enrichment?.status, statusFilter)) continue;
      const cat = catByItem.get(row.item.id);
      if (row.enrichment?.aiStatus !== 'ok' || cat?.primaryName) continue;
      const st = cat?.classifyState ?? 'pending_classify';
      buckets[st] = (buckets[st] ?? 0) + 1;
    }
    return buckets;
  }, [rows, catByItem, statusFilter]);

  useEffect(() => {
    if (activeIndex >= filteredRows.length) {
      setActiveIndex(Math.max(0, filteredRows.length - 1));
    }
  }, [filteredRows.length, activeIndex]);

  const active = filteredRows[activeIndex];
  const activeCat = active ? catByItem.get(active.item.id) : undefined;
  const activeEligibility = useMemo(() => {
    if (!active?.item || active.enrichment?.aiStatus !== 'ok') return null;
    return assessCategorizationEligibility(active.item, active.enrichment);
  }, [active?.item, active?.enrichment]);

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

  /** Items in this review list with AI summary ready — default scope for categorize. */
  const aiReadyItemIds = useMemo(
    () =>
      rows
        .filter((r) => r.enrichment?.aiStatus === 'ok')
        .map((r) => r.item.id),
    [rows]
  );

  if (!open) return null;

  const enrich = active?.enrichment;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="enrichment-review dev-pipeline-ui"
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
          <h1 style={{ margin: 0, fontSize: 'var(--dev-fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
            Enrichment dev
          </h1>
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginTop: 8,
              flexWrap: 'wrap',
            }}
          >
            {(
              [
                ['results', 'Results'],
                ['pipeline', 'Queue & taxonomy'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDevTab(id)}
                style={{
                  padding: '5px 12px',
                  fontSize: 'var(--dev-fs-sm)',
                  fontWeight: devTab === id ? 600 : 400,
                  border: `1px solid ${devTab === id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  background: devTab === id ? 'var(--accent-weak)' : 'var(--bg-panel)',
                  color: devTab === id ? 'var(--text)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {devTab === 'results' ? (
          <p className="er-muted" style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-sm)' }}>
            {itemIds?.length
              ? `Last run: ${rows.length} items · ok ${counts.ok} · failed ${counts.failed} · skipped ${counts.skipped}`
              : `${rows.length} with enrichment · ok ${counts.ok} · failed ${counts.failed} · skipped ${counts.skipped}`}
            {refetchAllProgress
              ? ` · Re-fetching ${refetchAllProgress.done}/${refetchAllProgress.total}…`
              : null}
          </p>
          ) : (
          <p className="er-muted" style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-sm)' }}>
            Classify queue filters, taxonomy tree with counts, and pipeline controls for the whole library.
          </p>
          )}
        </div>
        {devTab === 'results' ? (
        <button
          type="button"
          onClick={handleRefetchAll}
          disabled={refetching || rows.length === 0}
          style={{
            padding: '6px 12px',
            fontSize: 'var(--dev-fs-sm)',
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
        ) : null}
        <button type="button" onClick={onClose} style={iconBtn} title="Close">
          <X size={22} />
        </button>
      </header>

      {devTab === 'pipeline' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <PipelineDevView embedded />
        </div>
      ) : (
      <>
      <CategorizationPanel
        scopedItemIds={aiReadyItemIds}
        scopeLabel={itemIds?.length ? 'this enrich run' : 'all results'}
        defaultCollapsed
        onPipelineComplete={() => void load()}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* List */}
        <aside
          style={{
            width: 320,
            flexShrink: 0,
            minHeight: 0,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-panel)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 10,
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              maxHeight: '38vh',
              overflowY: 'auto',
            }}
          >
            <input
              type="search"
              className="er-field"
              placeholder="Filter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              <span style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', width: '100%' }}>Fetch</span>
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
            {counts.failed > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', width: '100%' }}>
                  Error type
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFailureCategoryFilter('all');
                    setActiveIndex(0);
                  }}
                  className={failureCategoryFilter === 'all' ? 'er-btn er-btn-active' : 'er-btn'}
                  style={{ ...chipBtn, fontWeight: failureCategoryFilter === 'all' ? 600 : 400 }}
                >
                  all ({counts.failed})
                </button>
                {(Object.entries(failureCategoryCounts) as Array<[FailureCategory, number]>)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, n]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setFailureCategoryFilter(cat);
                        setStatusFilter('failed');
                        setActiveIndex(0);
                      }}
                      className={failureCategoryFilter === cat ? 'er-btn er-btn-active' : 'er-btn'}
                      style={{ ...chipBtn, fontWeight: failureCategoryFilter === cat ? 600 : 400 }}
                      title={FAILURE_CATEGORY_LABELS[cat]}
                    >
                      {cat.replace(/^ai_/, 'ai:')} ({n})
                    </button>
                  ))}
              </div>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', width: '100%' }}>Topic</span>
              {(['all', 'has_topic', 'no_topic'] as CatFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setCatFilter(f);
                    setActiveIndex(0);
                  }}
                  className={catFilter === f ? 'er-btn er-btn-active' : 'er-btn'}
                  style={{
                    ...chipBtn,
                    fontWeight: catFilter === f ? 600 : 400,
                  }}
                >
                  {f === 'all'
                    ? 'all'
                    : f === 'has_topic'
                      ? `has topic (${queueCounts.hasTopic})`
                      : `no topic (${queueCounts.noTopic})`}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', width: '100%' }}>Classify</span>
              {(
                [
                  ['all', 'all', null],
                  ['pending', 'ready', queueCounts.pending],
                  ['discover', 'need discover', queueCounts.pendingDiscover],
                  ['needs_attention', 'needs attn', queueCounts.needsAttention],
                  ['ineligible', 'ineligible', queueCounts.ineligible],
                  ['manual_review', 'manual', queueCounts.manualReview],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  title={
                    id === 'pending'
                      ? 'Eligible for the next Classify pending run (matches the button above)'
                      : id === 'needs_attention'
                        ? 'No specific topic yet — includes ineligible, manual review, general/other'
                        : undefined
                  }
                  onClick={() => {
                    setQueueFilter(id);
                    setActiveIndex(0);
                  }}
                  className={queueFilter === id ? 'er-btn er-btn-active' : 'er-btn'}
                  style={{
                    ...chipBtn,
                    fontWeight: queueFilter === id ? 600 : 400,
                    ...(id === 'pending' && queueFilter !== id && queueCounts.pending > 0
                      ? { borderColor: '#58a6ff55' }
                      : {}),
                  }}
                >
                  {label}
                  {id !== 'all' ? ` (${n ?? 0})` : ''}
                </button>
              ))}
            </div>
            {(catFilter === 'no_topic' || queueFilter !== 'all') &&
            Object.keys(noTopicBreakdown).length > 0 ? (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Queue:{' '}
                {Object.entries(noTopicBreakdown)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([st, n]) => `${st.replace(/_/g, ' ')} ${n}`)
                  .join(' · ')}
              </p>
            ) : null}
          </div>
          <div style={{ flex: 1, minHeight: 240, overflowY: 'auto', overflowX: 'hidden' }}>
            {loading ? (
              <p style={{ padding: 12, fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>Loading…</p>
            ) : filteredRows.length === 0 ? (
              <p style={{ padding: 12, fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>No matches.</p>
            ) : (
              filteredRows.map((row, idx) => {
                const st = row.enrichment?.status ?? 'none';
                const cat = catByItem.get(row.item.id);
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
                        fontSize: 'var(--dev-fs-base)',
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
                          fontSize: 'var(--dev-fs-caption)',
                          fontWeight: 600,
                          color: statusColor[st] || '#6b7280',
                        }}
                      >
                        {st}
                      </span>
                      {row.enrichment?.lastErrorCode || resolveEnrichmentFailureLabel(row.enrichment) ? (
                        <span
                          style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}
                          title={
                            resolveEnrichmentFailureLabel(row.enrichment)?.reviewHint ??
                            row.enrichment?.lastErrorCode
                          }
                        >
                          {(
                            resolveEnrichmentFailureLabel(row.enrichment)?.shortLabel ??
                            formatEnrichmentFailureMessage(row.enrichment) ??
                            row.enrichment?.lastErrorCode ??
                            ''
                          ).slice(0, 48)}
                          {(
                            resolveEnrichmentFailureLabel(row.enrichment)?.label ??
                            formatEnrichmentFailureMessage(row.enrichment) ??
                            ''
                          ).length > 48
                            ? '…'
                            : ''}
                        </span>
                      ) : null}
                      {cat?.primaryName ? (
                        <span
                          style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--accent)', maxWidth: 120 }}
                          title={cat.primaryName}
                        >
                          {cat.primaryName.length > 18
                            ? `${cat.primaryName.slice(0, 16)}…`
                            : cat.primaryName}
                        </span>
                      ) : row.enrichment?.aiStatus === 'ok' ? (
                        <span
                          style={{
                            fontSize: 'var(--dev-fs-caption)',
                            color:
                              cat?.classifyState === 'pending_classify'
                                ? '#58a6ff'
                                : cat?.classifyState === 'ineligible'
                                  ? 'var(--text-faint)'
                                  : cat?.classifyState === 'manual_review'
                                    ? '#f85149'
                                    : 'var(--text-muted)',
                          }}
                          title="Classify queue state"
                        >
                          {(cat?.classifyState ?? 'pending_classify').replace(/_/g, ' ')}
                        </span>
                      ) : null}
                      {cat?.queueReason && !cat.primaryName ? (
                        <span
                          style={{
                            fontSize: 'var(--dev-fs-caption)',
                            color: 'var(--text-faint)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 140,
                          }}
                          title={cat.queueReason}
                        >
                          {cat.queueReason.length > 36
                            ? `${cat.queueReason.slice(0, 34)}…`
                            : cat.queueReason}
                        </span>
                      ) : null}
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
                <span style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>
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
                    fontSize: 'var(--dev-fs-sm)',
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
                    fontSize: 'var(--dev-fs-sm)',
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
                <ExtensionPageUrlLink
                  url={active.item.url}
                  style={{
                    fontSize: 'var(--dev-fs-sm)',
                    color: 'var(--accent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  Open URL <ExternalLink size={12} />
                </ExtensionPageUrlLink>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 'var(--dev-fs-md)', color: 'var(--text)' }}>
                  {active.item.title || 'Untitled'}
                </h2>
                <p
                  className="er-muted"
                  style={{
                    margin: '0 0 16px',
                    fontSize: 'var(--dev-fs-sm)',
                    wordBreak: 'break-all',
                  }}
                >
                  {active.item.url}
                </p>
                {refetchError ? (
                  <p style={{ margin: '0 0 12px', fontSize: 'var(--dev-fs-sm)', color: 'var(--error, #dc2626)' }}>
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
                          {formatEnrichmentFailureMessage(enrich) ??
                            ENRICHMENT_ERROR_HINTS[enrich.lastErrorCode] ??
                            enrich.lastErrorCode}
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
                            {enrich.aiError ??
                              describeAiFailure(enrich.aiStatus, enrich.aiError) ??
                              AI_STATUS_HINTS[enrich.aiStatus] ??
                              enrich.aiStatus}
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

                {active?.item.id && activeCat ? (
                  <ClassifyQueueReasonBlock
                    itemId={active.item.id}
                    onActionComplete={() => void load()}
                    classifyState={activeCat.classifyState}
                    signal={activeCat.signal}
                    eligibleNow={activeEligibility?.eligible}
                    eligibilityReasonNow={activeEligibility?.reason}
                    hasPrimaryTopic={!!activeCat.primaryName}
                  />
                ) : null}

                {active?.item.id ? <ItemCategoryLinks itemId={active.item.id} /> : null}

                {active?.item.id ? <ItemSimilarSection itemId={active.item.id} /> : null}

                <Section
                  title="AI summary"
                  empty={
                    !enrich?.summary?.trim() && !enrich?.aiKeyPoints?.length
                      ? enrich?.status === 'ok' && enrich.aiStatus && enrich.aiStatus !== 'ok'
                        ? enrich.aiError ||
                          describeAiFailure(enrich.aiStatus, enrich.aiError) ||
                          AI_STATUS_HINTS[enrich.aiStatus] ||
                          'No AI summary'
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
                        fontSize: 'var(--dev-fs-sm)',
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
                      fontSize: 'var(--dev-fs-sm)',
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
      </>
      )}
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 'var(--dev-fs-base)',
  borderRadius: 6,
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
  padding: '6px 10px',
  fontSize: 'var(--dev-fs-sm)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
};
