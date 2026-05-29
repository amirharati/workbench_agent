import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink,
  Eye,
  HelpCircle,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Collection, Item, Project } from '../../lib/db';
import {
  FAILURE_CATEGORY_LABELS,
  type FailureCategory,
  type FailureStage,
} from '../../lib/enrichment/failureLabels';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { moveItemsToTrash } from '../../lib/itemQuickAccess';
import {
  applyEnrichmentHubFilters,
  describeRowStatusHelp,
  enrichmentHubRowMatchesFilters,
  ENRICHMENT_STATUS_GUIDE,
  loadEnrichmentHubData,
  resolveTrashSuggestion,
  rowMatchesTrashSuggestion,
  type EnrichmentHubFilter,
  type EnrichmentHubFilterState,
  type EnrichmentHubRow,
  type RowStatusHelp,
} from '../../lib/pipeline/pipelineHubQueries';
import { itemMatchesScope } from '../../lib/shell/itemScope';
import { ScopeChipsBar } from './ScopeChipsBar';
import { PipelineItemInspectorPanel } from './PipelineItemInspectorPanel';
import { usePipelineProgress } from './PipelineProgressProvider';

interface PipelineHubViewProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  onOpenItem?: (item: Item) => void;
  onClearProjectScope?: () => void;
  onClearCollectionScope?: () => void;
  onResetScope?: () => void;
}

type FailureCategoryFilter = 'all' | FailureCategory;
type FailureStageFilter = 'all' | FailureStage;

const FAILURE_STAGE_LABELS: Record<FailureStage, string> = {
  fetch: 'Fetch stage',
  ai: 'AI stage',
  embed: 'Embed stage',
};

const STATUS_FILTER_LABELS: Record<EnrichmentHubFilter, string> = {
  all: 'All bookmarks',
  ok: 'Enriched',
  failed: 'Failed',
  not_enriched: 'Not enriched',
  pending_fetch_review: 'Fetch review',
  skipped: 'Skipped',
  embed_failed: 'Embed failed',
};

function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--bg-glass)',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  cursor: 'pointer',
  lineHeight: 1.3,
};

function FilterChip({
  label,
  count,
  active,
  color = 'var(--text-muted)',
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  const tinted = color !== 'var(--text-muted)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...chipBase,
        border: active
          ? `2px solid ${color}`
          : tinted
            ? `1px solid ${color}55`
            : '1px solid var(--border)',
        background: active
          ? `${color}24`
          : tinted
            ? `${color}10`
            : 'var(--bg-glass)',
        color: tinted ? color : active ? 'var(--text)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 600,
        padding: active ? '3px 9px' : '4px 10px',
        boxShadow: active ? `0 0 0 1px ${color}18` : undefined,
      }}
    >
      {active ? '✓ ' : ''}
      <span>{label}</span>
      {count !== undefined ? (
        <span
          style={{
            minWidth: 18,
            textAlign: 'center',
            padding: '0 4px',
            borderRadius: 999,
            background: active ? color : tinted ? `${color}20` : 'var(--bg-hover)',
            color: active ? '#fff' : tinted ? color : 'var(--text)',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

const PAGE_SIZE = 80;

function buildDisplayListWithRecentHolds(
  filteredRows: EnrichmentHubRow[],
  displayOrderIds: string[] | null,
  recentUpdateIds: ReadonlySet<string>,
  scopedRows: EnrichmentHubRow[],
  allRows: EnrichmentHubRow[]
): EnrichmentHubRow[] {
  if (recentUpdateIds.size === 0) return filteredRows;

  const freshById = new Map<string, EnrichmentHubRow>();
  for (const row of allRows) freshById.set(row.item.id, row);
  for (const row of scopedRows) freshById.set(row.item.id, row);
  for (const row of filteredRows) freshById.set(row.item.id, row);

  const filteredIds = new Set(filteredRows.map((r) => r.item.id));
  let order = displayOrderIds ?? filteredRows.map((r) => r.item.id);
  for (const row of filteredRows) {
    if (!order.includes(row.item.id)) order = [...order, row.item.id];
  }

  return order
    .map((id) => freshById.get(id))
    .filter((row): row is EnrichmentHubRow => {
      if (!row) return false;
      return filteredIds.has(row.item.id) || recentUpdateIds.has(row.item.id);
    });
}

function debounceFn<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function StatusHelpPanel({
  help,
  color,
  onClose,
  compact,
}: {
  help: RowStatusHelp;
  color: string;
  onClose?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        padding: compact ? '10px 12px' : '14px 16px',
        borderBottom: '1px solid var(--border)',
        background: `${color}08`,
        borderLeft: `3px solid ${color}`,
        fontSize: 'var(--text-xs)',
        lineHeight: 1.55,
        color: 'var(--text-muted)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 700, color, fontSize: 'var(--text-sm)' }}>{help.badge}</div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close status help"
            style={{
              padding: 2,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-faint)',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      <p style={{ margin: '6px 0 0', color: 'var(--text)' }}>{help.meaning}</p>
      {help.detail ? (
        <p style={{ margin: '6px 0 0' }}>
          <strong style={{ color: 'var(--text)' }}>Details:</strong> {help.detail}
        </p>
      ) : null}
      <p style={{ margin: '8px 0 0' }}>
        <strong style={{ color: 'var(--text)' }}>What to try:</strong> {help.tryThis}
      </p>
    </div>
  );
}

function SummaryChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: 'ok' | 'error' | 'warn' | 'info' | 'neutral';
  onClick: () => void;
}) {
  const toneColor =
    tone === 'ok'
      ? 'var(--er-ok, #3fb950)'
      : tone === 'error'
        ? 'var(--error, #f85149)'
        : tone === 'warn'
          ? 'var(--er-warn, #d29922)'
          : tone === 'info'
            ? '#6366f1'
            : 'var(--text-muted)';

  return (
    <FilterChip
      label={label}
      count={count}
      active={active}
      color={toneColor}
      onClick={onClick}
    />
  );
}

export const PipelineHubView: React.FC<PipelineHubViewProps> = ({
  items,
  collections,
  projects,
  scopeProjectId = 'all',
  scopeCollectionId = 'all',
  onOpenItem,
  onClearProjectScope,
  onClearCollectionScope,
  onResetScope,
}) => {
  const pipeline = usePipelineProgress();
  const [rows, setRows] = useState<EnrichmentHubRow[]>([]);
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof loadEnrichmentHubData>>['counts'] | null>(
    null
  );
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<EnrichmentHubFilter>('all');
  const [failureCategoryFilter, setFailureCategoryFilter] = useState<FailureCategoryFilter>('all');
  const [failureStageFilter, setFailureStageFilter] = useState<FailureStageFilter>('all');
  const [trashSuggestionsOnly, setTrashSuggestionsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectState, setInspectState] = useState<{ ids: string[]; index: number } | null>(null);
  /** Preserve list order + show rows that left the filter after hub actions until filters change. */
  const [displayOrderIds, setDisplayOrderIds] = useState<string[] | null>(null);
  const [recentUpdateIds, setRecentUpdateIds] = useState<string[]>([]);
  const recentUpdateIdSet = useMemo(() => new Set(recentUpdateIds), [recentUpdateIds]);
  const [statusHelpItemId, setStatusHelpItemId] = useState<string | null>(null);
  const [showStatusGuide, setShowStatusGuide] = useState(false);
  const [frozenRows, setFrozenRows] = useState<EnrichmentHubRow[] | null>(null);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const wasProcessingRef = useRef(false);
  const isRunningRef = useRef(pipeline.isRunning);
  const tableRowsForListRef = useRef<EnrichmentHubRow[]>([]);
  const processingHoldRef = useRef<{ order: string[]; targets: string[] } | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  const inspectStateRef = useRef(inspectState);
  selectedIdsRef.current = selectedIds;
  inspectStateRef.current = inspectState;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  isRunningRef.current = pipeline.isRunning;

  const isProcessing = pipeline.isRunning;

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (isRunningRef.current) return undefined;
    const silent = opts?.silent === true && rows.length > 0;
    if (!silent) {
      if (rows.length === 0) setInitialLoading(true);
      else setRefreshing(true);
    }
    try {
      const data = await loadEnrichmentHubData(itemsRef.current);
      setRows(data.rows);
      setCounts(data.counts);
      return data.rows;
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [rows.length]);

  const hubFilters = useMemo<EnrichmentHubFilterState>(
    () => ({
      search,
      statusFilter,
      failureStageFilter,
      failureCategoryFilter,
    }),
    [search, statusFilter, failureStageFilter, failureCategoryFilter]
  );

  const filterSessionKey = useMemo(
    () =>
      JSON.stringify({
        ...hubFilters,
        trashSuggestionsOnly,
        scopeProjectId,
        scopeCollectionId,
      }),
    [hubFilters, trashSuggestionsOnly, scopeProjectId, scopeCollectionId]
  );

  const applyRecentHolds = useCallback(
    (
      ctx: { order: string[]; targets: string[] },
      freshRows: EnrichmentHubRow[],
      filters: EnrichmentHubFilterState
    ) => {
      const scoped = freshRows.filter((row) =>
        itemMatchesScope(row.item, scopeProjectId, scopeCollectionId, collections)
      );
      setRecentUpdateIds((prev) => {
        const next = new Set(prev);
        for (const id of ctx.targets) {
          if (!ctx.order.includes(id)) continue;
          const row =
            scoped.find((r) => r.item.id === id) ?? freshRows.find((r) => r.item.id === id);
          if (!row) {
            next.delete(id);
            continue;
          }
          if (!enrichmentHubRowMatchesFilters(row, filters)) next.add(id);
          else next.delete(id);
        }
        return [...next];
      });
      setDisplayOrderIds(ctx.order);
    },
    [collections, scopeCollectionId, scopeProjectId]
  );

  const debouncedReload = useMemo(
    () => debounceFn(() => void reload({ silent: true }), 500),
    [reload]
  );

  useEffect(() => {
    void reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only

  useEffect(() => {
    debouncedReload();
  }, [items, debouncedReload]);

  useEffect(() => {
    return subscribeToDataChanges(() => {
      if (isRunningRef.current) return;
      debouncedReload();
    });
  }, [debouncedReload]);

  useEffect(() => {
    if (isProcessing && !wasProcessingRef.current) {
      wasProcessingRef.current = true;
      setFrozenRows(
        rows.filter((row) =>
          itemMatchesScope(row.item, scopeProjectId, scopeCollectionId, collections)
        )
      );
      const order = tableRowsForListRef.current.map((r) => r.item.id);
      const targets = [
        ...selectedIdsRef.current,
        ...(inspectStateRef.current?.ids ?? []),
      ];
      processingHoldRef.current = {
        order,
        targets: [...new Set(targets)],
      };
    }
    if (!isProcessing && wasProcessingRef.current) {
      wasProcessingRef.current = false;
      setFrozenRows(null);
      const holdCtx = processingHoldRef.current;
      processingHoldRef.current = null;
      void (async () => {
        const freshRows = await reload({ silent: true });
        if (holdCtx && freshRows?.length) {
          applyRecentHolds(holdCtx, freshRows, hubFilters);
        }
      })();
    }
  }, [
    isProcessing,
    rows,
    scopeProjectId,
    scopeCollectionId,
    collections,
    reload,
    applyRecentHolds,
    hubFilters,
  ]);

  const tableRows = isProcessing && frozenRows ? frozenRows : rows;

  const scopedRows = useMemo(
    () =>
      tableRows.filter((row) =>
        itemMatchesScope(row.item, scopeProjectId, scopeCollectionId, collections)
      ),
    [tableRows, scopeProjectId, scopeCollectionId, collections]
  );

  const filteredRows = useMemo(() => {
    let list = applyEnrichmentHubFilters(scopedRows, hubFilters);
    if (trashSuggestionsOnly) {
      list = list.filter((r) => rowMatchesTrashSuggestion(r));
    }
    return list;
  }, [scopedRows, hubFilters, trashSuggestionsOnly]);

  const trashSuggestionRows = useMemo(
    () => scopedRows.filter((r) => rowMatchesTrashSuggestion(r)),
    [scopedRows]
  );

  const tableRowsForList = useMemo(
    () =>
      buildDisplayListWithRecentHolds(
        filteredRows,
        displayOrderIds,
        recentUpdateIdSet,
        scopedRows,
        rows
      ),
    [filteredRows, displayOrderIds, recentUpdateIdSet, scopedRows, rows]
  );

  tableRowsForListRef.current = tableRowsForList;

  useEffect(() => {
    setDisplayOrderIds(null);
    setRecentUpdateIds([]);
    setPageLimit(PAGE_SIZE);
  }, [filterSessionKey]);

  const visibleRows = useMemo(() => {
    const base = tableRowsForList.slice(0, pageLimit);
    if (!inspectState?.ids.length) return base;
    const inBase = new Set(base.map((r) => r.item.id));
    const extra = inspectState.ids
      .filter((id) => !inBase.has(id))
      .map(
        (id) =>
          tableRowsForList.find((r) => r.item.id === id) ??
          scopedRows.find((r) => r.item.id === id) ??
          rows.find((r) => r.item.id === id)
      )
      .filter((r): r is EnrichmentHubRow => r != null);
    return extra.length ? [...base, ...extra] : base;
  }, [tableRowsForList, pageLimit, inspectState?.ids, scopedRows, rows]);

  const statusHelpRow = useMemo(
    () =>
      statusHelpItemId
        ? filteredRows.find((r) => r.item.id === statusHelpItemId) ?? null
        : null,
    [filteredRows, statusHelpItemId]
  );

  const statusHelp = useMemo(
    () => (statusHelpRow ? describeRowStatusHelp(statusHelpRow) : null),
    [statusHelpRow]
  );

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(filteredRows.map((r) => r.item.id));
      const pinned = new Set([...(inspectState?.ids ?? []), ...recentUpdateIds]);
      const next = new Set([...prev].filter((id) => visible.has(id) || pinned.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRows, inspectState?.ids, recentUpdateIds]);

  const scopedCounts = useMemo(() => {
    let ok = 0;
    let failed = 0;
    let notEnriched = 0;
    let pendingFetchReview = 0;
    let skipped = 0;
    let embedFailed = 0;
    for (const row of scopedRows) {
      const m = row.meta;
      if (m.ok) ok++;
      if (m.failed) failed++;
      if (m.notEnriched) notEnriched++;
      if (m.pendingFetchReview) pendingFetchReview++;
      if (m.skipped) skipped++;
      if (m.embedFailedLane) embedFailed++;
    }
    return {
      total: scopedRows.length,
      ok,
      failed,
      notEnriched,
      pendingFetchReview,
      skipped,
      embedFailed,
    };
  }, [scopedRows]);

  const failureStageCounts = useMemo(() => {
    const c: Partial<Record<FailureStage, number>> = {};
    for (const row of scopedRows) {
      const stage = row.meta.failureStage;
      if (!stage) continue;
      c[stage] = (c[stage] ?? 0) + 1;
    }
    return c;
  }, [scopedRows]);

  const failureCategoryCounts = useMemo(() => {
    const c: Partial<Record<FailureCategory, number>> = {};
    for (const row of scopedRows) {
      const cat = row.meta.failureCategory;
      if (!cat) continue;
      if (failureStageFilter !== 'all' && row.meta.failureStage !== failureStageFilter) continue;
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [scopedRows, failureStageFilter]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(tableRowsForList.map((r) => r.item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const getOrderedSelectedIds = useCallback(
    () => tableRowsForList.filter((r) => selectedIds.has(r.item.id)).map((r) => r.item.id),
    [tableRowsForList, selectedIds]
  );

  const openInspect = useCallback(
    (itemId: string) => {
      const multiSelected = selectedIds.has(itemId) && selectedIds.size > 1;
      const ids = multiSelected ? getOrderedSelectedIds() : [itemId];
      const index = Math.max(0, ids.indexOf(itemId));
      setInspectState({ ids, index });
      setStatusHelpItemId(null);
    },
    [getOrderedSelectedIds, selectedIds]
  );

  const handleInspectClick = useCallback(
    (itemId: string) => {
      if (inspectState?.ids.includes(itemId)) {
        if (inspectState.ids.length > 1) {
          setInspectState({ ...inspectState, index: inspectState.ids.indexOf(itemId) });
        }
        return;
      }
      openInspect(itemId);
    },
    [inspectState, openInspect]
  );

  const inspectItemLabels = useMemo(() => {
    if (!inspectState) return {};
    return Object.fromEntries(
      inspectState.ids.map((id) => {
        const row =
          rows.find((r) => r.item.id === id) ??
          filteredRows.find((r) => r.item.id === id);
        return [id, row?.item.title || row?.item.url || id];
      })
    );
  }, [inspectState, rows, filteredRows]);

  const inspectPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rows.length === 0) return;
    setInspectState((current) => {
      if (!current) return current;
      const validIds = current.ids.filter((id) => rows.some((r) => r.item.id === id));
      if (validIds.length === 0) return null;
      if (
        validIds.length === current.ids.length &&
        validIds.every((id, i) => id === current.ids[i])
      ) {
        return current;
      }
      return {
        ids: validIds,
        index: Math.min(current.index, validIds.length - 1),
      };
    });
  }, [rows]);

  useEffect(() => {
    if (!inspectState) return;
    const id = inspectState.ids[inspectState.index];
    if (!id) return;
    const idx = tableRowsForList.findIndex((r) => r.item.id === id);
    if (idx >= 0 && idx >= pageLimit) {
      setPageLimit(idx + 1);
    }
  }, [inspectState, tableRowsForList, pageLimit]);

  useEffect(() => {
    if (!inspectState) return;
    inspectPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [inspectState?.ids.join(','), inspectState?.index]);

  const handleBulkRedigest = async () => {
    const ids = [...selectedIds];
    if (!ids.length || pipeline.isRunning) return;
    const itemLabels = Object.fromEntries(
      scopedRows
        .filter((r) => selectedIds.has(r.item.id))
        .map((r) => [r.item.id, r.item.title || r.item.url || r.item.id])
    );
    try {
      await pipeline.runBatch(ids, {
        title: `Re-digest (${ids.length})`,
        enrich: true,
        classify: true,
        processAll: true,
        forceEnrich: true,
        forceReclassify: true,
        cancellable: true,
        collectItemResults: true,
        itemLabels,
      });
    } catch {
      /* report modal shows outcome */
    }
  };

  const handleMoveSelectedToTrash = async (idsOverride?: string[]) => {
    const ids = idsOverride ?? getOrderedSelectedIds();
    if (!ids.length || pipeline.isRunning) return;
    const msg =
      ids.length === 1
        ? 'Move this bookmark to trash? Restore later from Home → Trash.'
        : `Move ${ids.length} bookmarks to trash? Restore later from Home → Trash.`;
    if (!window.confirm(msg)) return;
    const rowById = new Map(scopedRows.map((r) => [r.item.id, r]));
    const reasonsById: Record<string, { reason: string; reasonCode: 'trash_suggestion' | 'hub_bulk' }> = {};
    for (const id of ids) {
      const row = rowById.get(id);
      const suggestion = row ? resolveTrashSuggestion(row) : null;
      reasonsById[id] = suggestion
        ? { reason: suggestion, reasonCode: 'trash_suggestion' }
        : { reason: 'Moved to trash from Enrichment Hub', reasonCode: 'hub_bulk' };
    }
    await moveItemsToTrash(ids, { reasonsById });
    setSelectedIds(new Set());
    setInspectState(null);
    setDisplayOrderIds(null);
    setRecentUpdateIds([]);
  };

  const handleSelectAllTrashSuggestions = () => {
    setSelectedIds(new Set(trashSuggestionRows.map((r) => r.item.id)));
  };

  const allSelected =
    tableRowsForList.length > 0 &&
    tableRowsForList.every((r) => selectedIds.has(r.item.id));

  const closeInspect = useCallback(() => {
    setInspectState(null);
  }, []);

  return (
    <div
      className="scrollbar"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '20px 24px 32px',
        maxWidth: 1100,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text)' }}>
              Enrichment Hub
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Fetch, AI, embed, and classify — queues, filters, and bulk actions
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowStatusGuide((v) => !v)}
            aria-expanded={showStatusGuide}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${showStatusGuide ? 'var(--accent)' : 'var(--border)'}`,
              background: showStatusGuide ? 'var(--accent-weak)' : 'transparent',
              color: showStatusGuide ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <HelpCircle size={14} />
            Status guide
          </button>
        </div>
      </header>

      {showStatusGuide ? (
        <div
          style={{
            marginBottom: 16,
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--bg-panel)',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            What statuses mean
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ENRICHMENT_STATUS_GUIDE.map((entry) => (
              <StatusHelpPanel
                key={entry.badge}
                help={{
                  badge: entry.badge,
                  meaning: entry.meaning,
                  tryThis: entry.tryThis,
                }}
                color={entry.color}
                compact
              />
            ))}
          </div>
          <div style={{ padding: '8px 14px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            Tip: click any status badge in the table for item-specific help.
          </div>
        </div>
      ) : null}

      {(onClearProjectScope || onClearCollectionScope || onResetScope) && (
        <div style={{ marginBottom: 12 }}>
          <ScopeChipsBar
            scopeProjectId={scopeProjectId}
            scopeCollectionId={scopeCollectionId}
            projects={projects}
            collections={collections}
            itemCount={scopedCounts.total}
            onClearProject={onClearProjectScope ?? (() => {})}
            onClearCollection={onClearCollectionScope ?? (() => {})}
            onResetScope={onResetScope ?? (() => {})}
          />
        </div>
      )}

      {/* Summary row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <SummaryChip
          label="All"
          count={scopedCounts.total}
          active={statusFilter === 'all' && failureCategoryFilter === 'all' && failureStageFilter === 'all'}
          tone="neutral"
          onClick={() => {
            setStatusFilter('all');
            setFailureCategoryFilter('all');
            setFailureStageFilter('all');
            setTrashSuggestionsOnly(false);
          }}
        />
        <SummaryChip
          label="Enriched"
          count={scopedCounts.ok}
          active={statusFilter === 'ok'}
          tone="ok"
          onClick={() => {
            setStatusFilter('ok');
            setFailureCategoryFilter('all');
            setFailureStageFilter('all');
            setTrashSuggestionsOnly(false);
          }}
        />
        <SummaryChip
          label="Not enriched"
          count={scopedCounts.notEnriched}
          active={statusFilter === 'not_enriched'}
          tone="info"
          onClick={() => {
            setStatusFilter('not_enriched');
            setFailureCategoryFilter('all');
            setFailureStageFilter('all');
            setTrashSuggestionsOnly(false);
          }}
        />
        <SummaryChip
          label="Failed"
          count={scopedCounts.failed}
          active={statusFilter === 'failed'}
          tone="error"
          onClick={() => {
            setStatusFilter('failed');
            setFailureCategoryFilter('all');
            setFailureStageFilter('all');
            setTrashSuggestionsOnly(false);
          }}
        />
        {trashSuggestionRows.length > 0 ? (
          <SummaryChip
            label="Trash suggestions"
            count={trashSuggestionRows.length}
            active={trashSuggestionsOnly}
            tone="warn"
            onClick={() => {
              setTrashSuggestionsOnly((v) => !v);
              if (!trashSuggestionsOnly) {
                setStatusFilter('all');
                setFailureCategoryFilter('all');
                setFailureStageFilter('all');
              }
            }}
          />
        ) : null}
        <SummaryChip
          label="Fetch review"
          count={scopedCounts.pendingFetchReview}
          active={statusFilter === 'pending_fetch_review'}
          tone="warn"
          onClick={() => {
            setStatusFilter('pending_fetch_review');
            setFailureCategoryFilter('all');
            setFailureStageFilter('all');
            setTrashSuggestionsOnly(false);
          }}
        />
        <SummaryChip
          label="Skipped"
          count={scopedCounts.skipped}
          active={statusFilter === 'skipped'}
          onClick={() => {
            setStatusFilter('skipped');
            setFailureCategoryFilter('all');
            setFailureStageFilter('all');
            setTrashSuggestionsOnly(false);
          }}
        />
        {scopedCounts.embedFailed > 0 ? (
          <SummaryChip
            label="Embed failed"
            count={scopedCounts.embedFailed}
            active={statusFilter === 'embed_failed'}
            tone="error"
            onClick={() => {
              setStatusFilter('embed_failed');
              setFailureCategoryFilter('all');
              setFailureStageFilter('all');
              setTrashSuggestionsOnly(false);
            }}
          />
        ) : null}
        {initialLoading ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
            <Loader2 size={14} className="spin" />
            Loading…
          </span>
        ) : refreshing ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Refreshing…</span>
        ) : (
          <button
            type="button"
            onClick={() => void reload({ silent: true })}
            title="Refresh"
            style={{
              ...chipBase,
              marginLeft: 'auto',
              padding: '4px 8px',
            }}
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      {trashSuggestionsOnly && trashSuggestionRows.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid color-mix(in srgb, var(--er-warn, #d29922) 45%, var(--border))',
            background: 'color-mix(in srgb, var(--er-warn, #d29922) 10%, transparent)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          <span style={{ flex: '1 1 200px' }}>
            {trashSuggestionRows.length} bookmark{trashSuggestionRows.length === 1 ? '' : 's'} look like dead
            or invalid links (404, unreachable host, localhost, bad URL).
          </span>
          <button
            type="button"
            disabled={pipeline.isRunning}
            onClick={handleSelectAllTrashSuggestions}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Select all
          </button>
          <button
            type="button"
            disabled={pipeline.isRunning}
            onClick={() => void handleMoveSelectedToTrash(trashSuggestionRows.map((r) => r.item.id))}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 6,
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
            Trash all {trashSuggestionRows.length}
          </button>
        </div>
      ) : null}

      {/* Lane tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 0,
        }}
      >
        <button
          type="button"
          style={{
            padding: '8px 14px',
            border: 'none',
            borderBottom: '2px solid var(--accent)',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            cursor: 'default',
            marginBottom: -1,
          }}
        >
          Enrichment
        </button>
        <button
          type="button"
          disabled
          title="Coming in Slice 2"
          style={{
            padding: '8px 14px',
            border: 'none',
            borderBottom: '2px solid transparent',
            background: 'transparent',
            color: 'var(--text-faint)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'not-allowed',
            marginBottom: -1,
          }}
        >
          Categories — coming soon
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-faint)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or URL…"
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              fontSize: 'var(--text-sm)',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {statusFilter !== 'all' ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Filter: {STATUS_FILTER_LABELS[statusFilter]}
          </span>
        ) : trashSuggestionsOnly ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Filter: Trash suggestions
          </span>
        ) : null}
      </div>

      {Object.keys(failureStageCounts).length > 0 ||
      Object.keys(failureCategoryCounts).length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          {Object.keys(failureStageCounts).length > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-faint)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 6,
                }}
              >
                Failed stage
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip
                  label="All stages"
                  active={failureStageFilter === 'all'}
                  color="var(--text-muted)"
                  onClick={() => setFailureStageFilter('all')}
                />
                {(Object.entries(failureStageCounts) as [FailureStage, number][]).map(
                  ([stage, n]) => (
                    <FilterChip
                      key={stage}
                      label={`${FAILURE_STAGE_LABELS[stage]} (${n})`}
                      active={failureStageFilter === stage}
                      color={
                        stage === 'fetch'
                          ? 'var(--error, #f85149)'
                          : stage === 'ai'
                            ? 'var(--er-warn, #d29922)'
                            : '#a371f7'
                      }
                      onClick={() =>
                        setFailureStageFilter((prev) => (prev === stage ? 'all' : stage))
                      }
                    />
                  )
                )}
              </div>
            </div>
          ) : null}
          {Object.keys(failureCategoryCounts).length > 0 ? (
            <div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-faint)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 6,
                }}
              >
                Issue type
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip
                  label="All issues"
                  active={failureCategoryFilter === 'all'}
                  color="var(--error, #f85149)"
                  onClick={() => setFailureCategoryFilter('all')}
                />
                {(Object.entries(failureCategoryCounts) as [FailureCategory, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, n]) => (
                    <FilterChip
                      key={cat}
                      label={`${FAILURE_CATEGORY_LABELS[cat]} (${n})`}
                      active={failureCategoryFilter === cat}
                      color="var(--error, #f85149)"
                      onClick={() =>
                        setFailureCategoryFilter((prev) => (prev === cat ? 'all' : cat))
                      }
                    />
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isProcessing ? (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-glass)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          <Loader2 size={16} className="spin" />
          Processing… the table is frozen until complete. Results will appear in the report when done.
        </div>
      ) : null}

      {/* Bulk bar */}
      {selectedIds.size > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            marginBottom: 12,
            borderRadius: 8,
            border: '1px solid var(--accent)',
            background: 'var(--accent-weak)',
          }}
        >
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={() => {
              const ids = getOrderedSelectedIds();
              if (ids.length) setInspectState({ ids, index: 0 });
            }}
            disabled={pipeline.isRunning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: pipeline.isRunning ? 'wait' : 'pointer',
              opacity: pipeline.isRunning ? 0.7 : 1,
            }}
          >
            <Eye size={13} />
            Inspect
          </button>
          <button
            type="button"
            onClick={() => void handleBulkRedigest()}
            disabled={pipeline.isRunning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: pipeline.isRunning ? 'wait' : 'pointer',
              opacity: pipeline.isRunning ? 0.7 : 1,
            }}
            title="Re-fetch, re-run AI, and classify selected items"
          >
            <RotateCcw size={13} />
            Re-digest
          </button>
          <button
            type="button"
            onClick={() => void handleMoveSelectedToTrash()}
            disabled={pipeline.isRunning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid color-mix(in srgb, #ef4444 40%, var(--border))',
              background: 'var(--bg)',
              color: '#ef4444',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: pipeline.isRunning ? 'wait' : 'pointer',
              opacity: pipeline.isRunning ? 0.7 : 1,
            }}
            title="Move selected bookmarks to trash"
          >
            <Trash2 size={13} />
            Trash
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Table */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--bg-panel)',
          opacity: isProcessing ? 0.72 : 1,
          pointerEvents: isProcessing ? 'none' : 'auto',
          transition: 'opacity 0.15s ease',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '32px 1fr 140px 1fr 120px 100px',
            gap: 8,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: 'var(--text-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => toggleSelectAll(e.target.checked)}
              aria-label="Select all"
            />
          </label>
          <span>Title</span>
          <span>Status</span>
          <span>Next step</span>
          <span>Updated</span>
          <span>Actions</span>
        </div>

        {initialLoading && filteredRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Loading enrichment data…
          </div>
        ) : visibleRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No items match the current filters.
          </div>
        ) : (
          visibleRows.map((row) => {
            const { item, enrichment } = row;
            const nextStep = row.meta.nextStep;
            const statusBadge = row.meta.statusBadge;
            const trashSuggestion = resolveTrashSuggestion(row);
            const showStatusHelp = statusHelpItemId === item.id;
            const isInInspectSet = inspectState?.ids.includes(item.id) ?? false;
            const isRecentUpdate = recentUpdateIdSet.has(item.id);
            const isCurrentInspect =
              inspectState != null && inspectState.ids[inspectState.index] === item.id;
            const rowBackground = isCurrentInspect
              ? 'var(--accent-weak)'
              : isRecentUpdate
                ? 'color-mix(in srgb, var(--er-ok, #3fb950) 12%, transparent)'
                : isInInspectSet
                  ? 'color-mix(in srgb, var(--accent-weak) 55%, transparent)'
                  : selectedIds.has(item.id)
                    ? 'var(--accent-weak)'
                    : 'transparent';

            return (
              <div
                key={item.id}
                style={
                  isRecentUpdate
                    ? { boxShadow: 'inset 3px 0 0 var(--er-ok, #3fb950)' }
                    : undefined
                }
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 140px 1fr 120px 100px',
                    gap: 8,
                    padding: '10px 12px',
                    borderBottom: isCurrentInspect ? 'none' : '1px solid var(--border)',
                    alignItems: 'center',
                    fontSize: 'var(--text-sm)',
                    background: rowBackground,
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => toggleSelect(item.id, e.target.checked)}
                      aria-label={`Select ${item.title || item.url}`}
                    />
                  </label>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title || item.url || 'Untitled'}
                      {isRecentUpdate ? (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            color: 'var(--er-ok, #3fb950)',
                          }}
                        >
                          Just updated
                        </span>
                      ) : null}
                    </div>
                    {item.url ? (
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-faint)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: 2,
                        }}
                      >
                        {item.url}
                      </div>
                    ) : null}
                    {trashSuggestion ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          marginTop: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--er-warn, #d29922)',
                        }}
                        title="Suggested for trash — bad or dead link"
                      >
                        <Trash2 size={10} />
                        {trashSuggestion}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      onClick={() =>
                        setStatusHelpItemId((prev) => (prev === item.id ? null : item.id))
                      }
                      aria-expanded={showStatusHelp}
                      title="Click for what this status means"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        background: `${statusBadge.color}22`,
                        color: statusBadge.color,
                        border: showStatusHelp
                          ? `2px solid ${statusBadge.color}`
                          : `1px solid ${statusBadge.color}44`,
                        cursor: 'pointer',
                      }}
                    >
                      {statusBadge.text}
                      <HelpCircle size={11} style={{ opacity: 0.75, flexShrink: 0 }} />
                    </button>
                    {isRecentUpdate ? (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--text-faint)',
                          lineHeight: 1.2,
                        }}
                      >
                        No longer matches filter
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={nextStep}
                  >
                    {nextStep}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                    {formatTime(enrichment?.fetchedAt ?? item.updated_at)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleInspectClick(item.id)}
                      title={
                        inspectState?.ids.includes(item.id)
                          ? 'Inspect (selected set)'
                          : 'Inspect enrichment data & run steps'
                      }
                      aria-expanded={isInInspectSet}
                      style={{
                        ...actionBtnStyle,
                        borderColor: isCurrentInspect ? 'var(--accent)' : 'var(--border)',
                        color: isCurrentInspect ? 'var(--accent)' : 'var(--text-muted)',
                      }}
                    >
                      <Eye size={13} />
                    </button>
                    {onOpenItem ? (
                      <button
                        type="button"
                        onClick={() => onOpenItem(item)}
                        title="Open in Inspector tab"
                        style={actionBtnStyle}
                      >
                        <ExternalLink size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>
                {showStatusHelp && statusHelp ? (
                  <StatusHelpPanel
                    help={statusHelp}
                    color={statusBadge.color}
                    onClose={() => setStatusHelpItemId(null)}
                  />
                ) : null}
                {isCurrentInspect && inspectState ? (
                  <div ref={inspectPanelRef}>
                    <PipelineItemInspectorPanel
                      item={item}
                      enrichment={enrichment}
                      embedFailed={row.embedFailed}
                      targetIds={inspectState.ids}
                      itemLabels={inspectItemLabels}
                      navIndex={inspectState.index}
                      navTotal={inspectState.ids.length}
                      onPrev={() =>
                        setInspectState((s) =>
                          s && s.index > 0 ? { ...s, index: s.index - 1 } : s
                        )
                      }
                      onNext={() =>
                        setInspectState((s) =>
                          s && s.index < s.ids.length - 1 ? { ...s, index: s.index + 1 } : s
                        )
                      }
                      onClose={closeInspect}
                      onOpenInTab={onOpenItem ? () => onOpenItem(item) : undefined}
                      onActionComplete={() => void reload({ silent: true })}
                    />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {tableRowsForList.length > pageLimit ? (
        <div style={{ padding: '12px 0', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setPageLimit((n) => n + PAGE_SIZE)}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
            }}
          >
            Show more ({tableRowsForList.length - pageLimit} remaining)
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: 12, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
        Showing {Math.min(pageLimit, tableRowsForList.length)} of {tableRowsForList.length} in view
        {recentUpdateIds.length > 0
          ? ` · ${recentUpdateIds.length} just updated (shown until you change filters)`
          : ''}
        {filteredRows.length !== tableRowsForList.length
          ? ` · ${filteredRows.length} match current filters`
          : ''}
        {filteredRows.length !== scopedCounts.total
          ? ` (${scopedCounts.total} in scope)`
          : ''}
        {counts && counts.failed > 0 ? (
          <> · {counts.failed} enrich failures in library</>
        ) : null}
      </div>
    </div>
  );
};

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};
