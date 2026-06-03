import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
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
  PIPELINE_STATE_COLORS,
  pipelineStatusColorForLabel,
} from '../../lib/pipeline/pipelineDictionary';
import { getCategorizationQueueStats } from '../../lib/categorization/classifyTopicExtract';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { moveItemsToTrash } from '../../lib/itemQuickAccess';
import {
  applyEnrichmentHubFilters,
  buildHubOutcomeChips,
  describeRowStatusHelp,
  enrichmentHubRowMatchesFilters,
  ENRICHMENT_STATUS_GUIDE,
  loadEnrichmentHubData,
  resolveTrashSuggestion,
  rowMatchesTrashSuggestion,
  type EnrichmentHubFilterState,
  type EnrichmentHubRow,
  type RowStatusHelp,
} from '../../lib/pipeline/pipelineHubQueries';
import { itemMatchesScope } from '../../lib/shell/itemScope';
import { loadNavigationState, patchNavigationState } from '../../lib/shell/navigationState';
import { buildDisplayListWithRecentHolds } from '../../lib/pipeline/recentListHolds';
import { ScopeChipsBar } from './ScopeChipsBar';
import { PipelineItemInspectorPanel } from './PipelineItemInspectorPanel';
import { PipelineHubCategoriesLane } from './PipelineHubCategoriesLane';
import { usePipelineProgress } from './PipelineProgressProvider';
import { HubActionConfirmModal } from './HubActionConfirmModal';
import { BookmarkUrlLink, openBookmarkInBrowser } from './BookmarkUrlLink';
import { getBookmarkOpenUrl } from '../../lib/itemQuickAccess';

type HubLane = 'enrichment' | 'categories';

interface PipelineHubViewProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  onOpenItem?: (item: Item) => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  onClearProjectScope?: () => void;
  onClearCollectionScope?: () => void;
  onResetScope?: () => void;
}

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
  dimmed = false,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  color?: string;
  dimmed?: boolean;
  onClick: () => void;
}) {
  const tinted = color !== 'var(--text-muted)';
  const isEmpty = count === 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={isEmpty ? 'No bookmarks in this status in current scope' : undefined}
      style={{
        ...chipBase,
        opacity: dimmed && !active ? 0.5 : 1,
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
  color,
  dimmed,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  dimmed?: boolean;
  onClick: () => void;
}) {
  const toneColor = color ?? pipelineStatusColorForLabel(label);

  return (
    <FilterChip
      label={label}
      count={count}
      active={active}
      color={toneColor}
      dimmed={dimmed}
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
  onBrowseCategory,
  onClearProjectScope,
  onClearCollectionScope,
  onResetScope,
}) => {
  const hubSaved = loadNavigationState().pipelineHub;
  const pipeline = usePipelineProgress();
  const [hubLane, setHubLane] = useState<HubLane>(hubSaved.hubLane);
  const [rows, setRows] = useState<EnrichmentHubRow[]>([]);
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof loadEnrichmentHubData>>['counts'] | null>(
    null
  );
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [taxonomyLeafCount, setTaxonomyLeafCount] = useState<number | null>(null);
  const [outcomeLabel, setOutcomeLabel] = useState<string | 'all'>(
    typeof hubSaved.enrichmentOutcomeLabel === 'string' ? hubSaved.enrichmentOutcomeLabel : 'all'
  );
  const [trashSuggestionsOnly, setTrashSuggestionsOnly] = useState(hubSaved.enrichmentTrashSuggestionsOnly);
  const [search, setSearch] = useState(hubSaved.enrichmentSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectState, setInspectState] = useState<{ ids: string[]; index: number } | null>(null);
  /** Preserve list order + show rows that left the filter after hub actions until filters change. */
  const [displayOrderIds, setDisplayOrderIds] = useState<string[] | null>(null);
  const [recentUpdateIds, setRecentUpdateIds] = useState<string[]>([]);
  const recentUpdateIdSet = useMemo(() => new Set(recentUpdateIds), [recentUpdateIds]);
  const [statusHelpItemId, setStatusHelpItemId] = useState<string | null>(null);
  const [showStatusGuide, setShowStatusGuide] = useState(false);
  const [trashConfirmIds, setTrashConfirmIds] = useState<string[] | null>(null);
  const [frozenRows, setFrozenRows] = useState<EnrichmentHubRow[] | null>(null);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const wasProcessingRef = useRef(false);
  const isRunningRef = useRef(pipeline.isRunning);
  const tableRowsForListRef = useRef<EnrichmentHubRow[]>([]);
  const processingHoldRef = useRef<{ order: string[]; targets: string[] } | null>(null);
  /** After bulk trash, skip expensive hub reload until DB + parent items settle. */
  const skipHubReloadUntilRef = useRef(0);
  const validatedPersistedFilterRef = useRef(false);
  const selectedIdsRef = useRef(selectedIds);
  const inspectStateRef = useRef(inspectState);
  selectedIdsRef.current = selectedIds;
  inspectStateRef.current = inspectState;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  isRunningRef.current = pipeline.isRunning;

  useEffect(() => {
    patchNavigationState({
      pipelineHub: {
        hubLane,
        enrichmentOutcomeLabel: outcomeLabel,
        enrichmentSearch: search,
        enrichmentTrashSuggestionsOnly: trashSuggestionsOnly,
      },
    });
  }, [hubLane, outcomeLabel, search, trashSuggestionsOnly]);

  const isProcessing = pipeline.isRunning;

  const reload = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (isRunningRef.current) return undefined;
    if (!opts?.force && Date.now() < skipHubReloadUntilRef.current) return undefined;
    const silent = opts?.silent === true && rows.length > 0;
    if (!silent) {
      if (rows.length === 0) setInitialLoading(true);
      else setRefreshing(true);
    }
    try {
      const [data, queueStats] = await Promise.all([
        loadEnrichmentHubData(itemsRef.current),
        getCategorizationQueueStats().catch(() => null),
      ]);
      setRows(data.rows);
      setCounts(data.counts);
      setTaxonomyLeafCount(queueStats?.leafCount ?? 0);
      return data.rows;
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [rows.length]);

  const hubFilters = useMemo<EnrichmentHubFilterState>(
    () => ({
      outcomeLabel,
      search,
      trashSuggestionsOnly,
    }),
    [outcomeLabel, search, trashSuggestionsOnly]
  );

  const filterSessionKey = useMemo(
    () =>
      JSON.stringify({
        outcomeLabel,
        search,
        trashSuggestionsOnly,
        scopeProjectId,
        scopeCollectionId,
      }),
    [outcomeLabel, search, trashSuggestionsOnly, scopeProjectId, scopeCollectionId]
  );

  const clearOutcomeFilter = useCallback(() => {
    setOutcomeLabel('all');
  }, []);

  const clearHubFilters = useCallback(() => {
    clearOutcomeFilter();
    setTrashSuggestionsOnly(false);
  }, [clearOutcomeFilter]);

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

  const applyHoldForIds = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const order = tableRowsForListRef.current.map((r) => r.item.id);
      void (async () => {
        const freshRows = await reload({ silent: true });
        if (freshRows?.length) {
          applyRecentHolds({ order, targets: ids }, freshRows, hubFilters);
        }
      })();
    },
    [reload, applyRecentHolds, hubFilters]
  );

  const debouncedReload = useMemo(
    () =>
      debounceFn(() => {
        if (Date.now() < skipHubReloadUntilRef.current) return;
        void reload({ silent: true });
      }, 500),
    [reload]
  );

  useEffect(() => {
    void reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only

  /** Once after first load: clear persisted filter only if label no longer exists (not on every chip click). */
  useEffect(() => {
    if (initialLoading || validatedPersistedFilterRef.current) return;
    validatedPersistedFilterRef.current = true;
    if (outcomeLabel === 'all') return;
    const scoped = rows.filter((row) =>
      itemMatchesScope(row.item, scopeProjectId, scopeCollectionId, collections)
    );
    const hasMatch = scoped.some((r) => r.meta.statusBadge.text === outcomeLabel);
    if (!hasMatch) setOutcomeLabel('all');
  }, [initialLoading, rows, outcomeLabel, scopeProjectId, scopeCollectionId, collections]);

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

  /** Scope + search only — chip counts stay fixed when a status or trash filter is active. */
  const rowsForStatusCounts = useMemo(
    () => applyEnrichmentHubFilters(scopedRows, { outcomeLabel: 'all', search }),
    [scopedRows, search]
  );

  const filteredRows = useMemo(
    () => applyEnrichmentHubFilters(scopedRows, hubFilters),
    [scopedRows, hubFilters]
  );

  const trashSuggestionRows = useMemo(
    () => scopedRows.filter((r) => rowMatchesTrashSuggestion(r)),
    [scopedRows]
  );

  const statusFilterActive = outcomeLabel !== 'all' || trashSuggestionsOnly;

  const tableRowsForList = useMemo(() => {
    if (statusFilterActive) {
      return filteredRows;
    }
    return buildDisplayListWithRecentHolds(
      filteredRows,
      displayOrderIds,
      recentUpdateIdSet,
      scopedRows,
      rows
    );
  }, [
    filteredRows,
    displayOrderIds,
    recentUpdateIdSet,
    scopedRows,
    rows,
    statusFilterActive,
  ]);

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

  const statusBarChips = useMemo(() => buildHubOutcomeChips(rowsForStatusCounts), [rowsForStatusCounts]);

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
        skipDiscover: true,
        drainPendingClassifyQueue: false,
        itemLabels,
      });
    } catch {
      /* report modal shows outcome */
    }
  };

  const handleMoveSelectedToTrash = async (idsOverride?: string[]) => {
    const ids = idsOverride ?? getOrderedSelectedIds();
    if (!ids.length || pipeline.isRunning) return;
    setTrashConfirmIds(ids);
  };

  const executeMoveToTrash = () => {
    const ids = trashConfirmIds;
    if (!ids?.length) return;
    const idSet = new Set(ids);
    setTrashConfirmIds(null);
    setSelectedIds(new Set());
    setInspectState(null);
    setDisplayOrderIds(null);
    setRecentUpdateIds([]);

    // Instant table update — do not wait on worker batch + full hub re-query.
    setRows((prev) => prev.filter((r) => !idSet.has(r.item.id)));
    skipHubReloadUntilRef.current = Date.now() + 4000;
    window.setTimeout(() => {
      skipHubReloadUntilRef.current = 0;
      if (!isRunningRef.current) void reload({ silent: true, force: true });
    }, 4100);

    const rowById = new Map(scopedRows.map((r) => [r.item.id, r]));
    const reasonsById: Record<string, { reason: string; reasonCode: 'trash_suggestion' | 'hub_bulk' }> = {};
    const knownItems: Item[] = [];
    for (const id of ids) {
      const row = rowById.get(id);
      if (row) knownItems.push(row.item);
      const suggestion = row ? resolveTrashSuggestion(row) : null;
      reasonsById[id] = suggestion
        ? { reason: suggestion, reasonCode: 'trash_suggestion' }
        : { reason: 'Moved to trash from Enrichment Hub', reasonCode: 'hub_bulk' };
    }

    void moveItemsToTrash(ids, { reasonsById, knownItems }).catch((err) => {
      console.error('moveItemsToTrash failed:', err);
      skipHubReloadUntilRef.current = 0;
      void reload({ force: true });
    });
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
              {hubLane === 'enrichment'
                ? 'Fetch, AI, embed, and classify — queues, filters, and bulk actions'
                : 'Classify queue, topic assignment, and taxonomy overview'}
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

      {taxonomyLeafCount === 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            background: '#fef9c3',
            border: '1px solid #fde047',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 'var(--text-sm)',
            color: '#713f12',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, color: '#d97706' }} />
          <span>
            <strong>Taxonomy not loaded — classify cannot run.</strong>{' '}
            Go to <strong>Settings → Fetch enrichment → Import seed taxonomy</strong> to load topics,
            then run classify from here or Import Studio.
          </span>
        </div>
      )}

      {(onClearProjectScope || onClearCollectionScope || onResetScope) && (
        <div style={{ marginBottom: 12 }}>
          <ScopeChipsBar
            scopeProjectId={scopeProjectId}
            scopeCollectionId={scopeCollectionId}
            projects={projects}
            collections={collections}
            itemCount={scopedRows.length}
            onClearProject={onClearProjectScope ?? (() => {})}
            onClearCollection={onClearCollectionScope ?? (() => {})}
            onResetScope={onResetScope ?? (() => {})}
          />
        </div>
      )}

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
          onClick={() => setHubLane('enrichment')}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderBottom: hubLane === 'enrichment' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: hubLane === 'enrichment' ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 'var(--text-sm)',
            fontWeight: hubLane === 'enrichment' ? 600 : 500,
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >
          Enrichment
        </button>
        <button
          type="button"
          onClick={() => setHubLane('categories')}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderBottom: hubLane === 'categories' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: hubLane === 'categories' ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 'var(--text-sm)',
            fontWeight: hubLane === 'categories' ? 600 : 500,
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >
          Categories & taxonomy
        </button>
      </div>

      {hubLane === 'categories' ? (
        <PipelineHubCategoriesLane
          collections={collections}
          scopeProjectId={scopeProjectId}
          scopeCollectionId={scopeCollectionId}
          onOpenItem={onOpenItem}
          onBrowseCategory={onBrowseCategory}
        />
      ) : null}

      {hubLane === 'enrichment' ? (
        <>
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

      {/* Status filters — counts stay fixed; selection highlights active chip only */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <SummaryChip
            label="All"
            count={rowsForStatusCounts.length}
            active={outcomeLabel === 'all' && !trashSuggestionsOnly}
            color={PIPELINE_STATE_COLORS.neutral}
            onClick={clearHubFilters}
          />
          {trashSuggestionRows.length > 0 ? (
            <SummaryChip
              label="Trash suggestions"
              count={trashSuggestionRows.length}
              active={trashSuggestionsOnly}
              color={PIPELINE_STATE_COLORS.skipped}
              onClick={() => {
                if (trashSuggestionsOnly) {
                  setTrashSuggestionsOnly(false);
                } else {
                  clearOutcomeFilter();
                  setTrashSuggestionsOnly(true);
                }
              }}
            />
          ) : null}
          {initialLoading ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-faint)',
                fontSize: 'var(--text-xs)',
              }}
            >
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
          Status
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {statusBarChips.map((chip) => (
            <SummaryChip
              key={chip.label}
              label={chip.label}
              count={chip.count}
              color={chip.color}
              dimmed={chip.count === 0}
              active={outcomeLabel === chip.label && !trashSuggestionsOnly}
              onClick={() => {
                setTrashSuggestionsOnly(false);
                setDisplayOrderIds(null);
                setRecentUpdateIds([]);
                setOutcomeLabel(chip.label);
              }}
            />
          ))}
        </div>
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
        {outcomeLabel !== 'all' || trashSuggestionsOnly ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Showing {filteredRows.length} of {rowsForStatusCounts.length}
            {outcomeLabel !== 'all' ? ` · ${outcomeLabel}` : ''}
            {trashSuggestionsOnly ? ' · trash suggestions' : ''}
          </span>
        ) : null}
      </div>

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
                    <BookmarkUrlLink item={item} />
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
                    {getBookmarkOpenUrl(item) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openBookmarkInBrowser(item);
                        }}
                        title="Open URL in new tab"
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
                      onActionComplete={() =>
                        applyHoldForIds(inspectState.ids.slice(inspectState.index, inspectState.index + 1))
                      }
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
        {filteredRows.length !== scopedRows.length
          ? ` (${scopedRows.length} in scope)`
          : ''}
        {counts && counts.failed > 0 ? (
          <> · {counts.failed} enrich failures in library</>
        ) : null}
      </div>
        </>
      ) : null}

      {trashConfirmIds && trashConfirmIds.length > 0 ? (
        <HubActionConfirmModal
          title={
            trashConfirmIds.length === 1 ? 'Move bookmark to trash?' : `Move ${trashConfirmIds.length} bookmarks to trash?`
          }
          description="You can restore items later from Home → Trash."
          confirmLabel={trashConfirmIds.length === 1 ? 'Move to trash' : `Move ${trashConfirmIds.length} to trash`}
          confirmVariant="danger"
          onConfirm={() => void executeMoveToTrash()}
          onCancel={() => setTrashConfirmIds(null)}
        />
      ) : null}
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
