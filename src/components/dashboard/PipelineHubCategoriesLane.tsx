import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink,
  Eye,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Tags,
} from 'lucide-react';
import type { Collection, Item } from '../../lib/db';
import { ensurePipelineHydrated, refreshPipelineCacheFromWorker } from '../../lib/db';
import { ensurePendingClassifySignals } from '../../lib/categorization';
import { isAnyDigestInFlight } from '../../lib/pipeline/singleLinkDigest';
import {
  countPipelineQueueFilters,
  isClassifyPendingRunnable,
  isReclassifyScopeCandidate,
  listPipelineQueueItems,
  matchesPipelineQueueFilter,
  PIPELINE_QUEUE_FILTER_OPTIONS,
  type PipelineQueueFilter,
  type PipelineQueueItemRow,
} from '../../lib/categorization/devQueries';
import { invalidatePipelineCatalog } from '../../lib/pipeline/pipelineCatalog';
import { resolveClassificationPresentation } from '../../lib/categorization/classificationPresentation';
import {
  displayClassifyStateLabel,
  resolveClassifyQueueBlocker,
} from '../../lib/categorization/classifyQueueBlocker';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { loadEmbedFailedIds } from '../../lib/pipeline/pipelineHubQueries';
import { itemMatchesScope } from '../../lib/shell/itemScope';
import { loadNavigationState, patchNavigationState } from '../../lib/shell/navigationState';
import { buildDisplayListWithRecentHolds } from '../../lib/pipeline/recentListHolds';
import { usePipelineMaintenanceSnapshot } from '../../hooks/usePipelineMaintenanceSnapshot';
import { AiCategoriesView } from './AiCategoriesView';
import { ClassifyQueueReasonBlock } from './ClassifyQueueReasonBlock';
import { PipelineMaintenanceStrip } from './PipelineMaintenanceStrip';
import { type DiscoverConfigPlan, type DiscoverInputScope } from './DiscoverConfigModal';
import { ManualReviewRetryModal, type ManualReviewRetryRow } from './ManualReviewRetryModal';
import { PipelineItemInspectorPanel } from './PipelineItemInspectorPanel';
import { BookmarkUrlLink, openBookmarkInBrowser } from './BookmarkUrlLink';
import { getBookmarkOpenUrl } from '../../lib/itemQuickAccess';
import { usePipelineProgress } from './PipelineProgressProvider';
import { useItemPeek } from './ItemPeekProvider';
import { ItemResultRow } from './ItemResultRow';

const PAGE_SIZE = 80;

const RECLASSIFY_ACCENT = 'var(--status-verified)';

const STATE_COLORS: Record<string, string> = {
  pending_classify: 'var(--status-info)',
  pending_reclassify: RECLASSIFY_ACCENT,
  pending_discover: 'var(--er-warn, #d29922)',
  classified_general: 'var(--er-warn, #d29922)',
  classified_removal: 'var(--error, #f85149)',
  classified_attention: 'var(--er-warn, #d29922)',
  manual_review: 'var(--error, #f85149)',
  ineligible: 'var(--text-faint)',
  skipped: 'var(--text-muted)',
  classified: 'var(--er-ok, #3fb950)',
  manual_only: 'var(--status-verified)',
  none: 'var(--text-faint)',
};

function rowStateColor(row: PipelineQueueItemRow): string {
  if (row.enrichmentStatusLabel) {
    if (row.enrichmentStatusLabel.startsWith('Fetch OK ·')) return 'var(--er-warn, #d29922)';
    if (row.enrichmentStatusLabel.startsWith('Fetch ·')) return 'var(--error, #f85149)';
    if (row.enrichmentStatusLabel.startsWith('Embed ·')) return 'var(--error, #f85149)';
    return 'var(--er-warn, #d29922)';
  }
  const stateLabel = rowStateLabel(row);
  if (stateLabel === 'Removal candidate') return 'var(--error, #f85149)';
  if (stateLabel === 'Needs attention' || stateLabel === 'General / Other') {
    return 'var(--er-warn, #d29922)';
  }
  const st = row.classifyState;
  if (st && STATE_COLORS[st]) return STATE_COLORS[st];
  const blocker = resolveClassifyQueueBlocker({
    item: row.item,
    enrichment: row.enrichment,
    classifyState: st,
    hasSignal: row.hasSignal,
    eligible: row.eligible,
    eligibilityReason: row.eligibilityReason,
  });
  if (blocker.code === 'not_enriched' || blocker.code === 'fetch_failed') return 'var(--text-faint)';
  if (blocker.code === 'fetch_review' || blocker.code === 'no_ai_summary') return 'var(--er-warn, #d29922)';
  if (blocker.code === 'ready_for_classify') return STATE_COLORS.pending_classify;
  return 'var(--text-muted)';
}

function rowStateLabel(row: PipelineQueueItemRow): string {
  const blocker = resolveClassifyQueueBlocker({
    item: row.item,
    enrichment: row.enrichment,
    classifyState: row.classifyState,
    hasSignal: row.hasSignal,
    eligible: row.eligible,
    eligibilityReason: row.eligibilityReason,
  });
  return displayClassifyStateLabel(row.classifyState, blocker, row.enrichmentStatusLabel);
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

function topicSourcePresentation(row: PipelineQueueItemRow) {
  return resolveClassificationPresentation({
    primaryCategoryId: row.primaryCategoryId,
    classifyState: row.classifyState,
  });
}

function topicSourceLabel(row: PipelineQueueItemRow): string | null {
  if (!row.topicPath) return null;
  const presentation = topicSourcePresentation(row);
  if (presentation) return presentation.sourceTag;
  if (row.primaryLinkStatus === 'accepted') return 'Assigned';
  if (row.primaryLinkStatus === 'suggested') {
    return row.classifyState === 'pending_classify' || row.classifyState === 'pending_reclassify'
      ? 'AI suggested'
      : 'Model selected';
  }
  return 'Topic';
}

function topicSourceColor(row: PipelineQueueItemRow): string {
  const presentation = topicSourcePresentation(row);
  if (presentation) return presentation.color;
  if (row.primaryLinkStatus === 'accepted') return 'var(--er-ok, #3fb950)';
  if (row.primaryLinkStatus === 'suggested') return 'var(--er-warn, #d29922)';
  return 'var(--text-faint)';
}

function FilterChip({
  label,
  count,
  active,
  hint,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={hint}
      onClick={onClick}
      aria-pressed={active}
      className="ui-pipeline-chip ui-pipeline-chip--neutral"
    >
      <span className="ui-pipeline-chip__dot" aria-hidden="true" />
      {label}
      {count != null ? (
        <span className="ui-pipeline-chip__count">{count}</span>
      ) : null}
    </button>
  );
}

export type PipelineHubCategoriesLaneProps = {
  collections: Collection[];
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  onOpenItem?: (item: Item) => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  /** Current item retained by the parent hub while switching into Taxonomy. */
  targetItem?: Item | null;
  /** Scope chips bar — full scoped/filtered count (not enrichment page size). */
  onScopeItemCount?: (count: number) => void;
  activeView?: 'queue' | 'taxonomy';
  hideViewTabs?: boolean;
};

export const PipelineHubCategoriesLane: React.FC<PipelineHubCategoriesLaneProps> = ({
  collections,
  scopeProjectId = 'all',
  scopeCollectionId = 'all',
  onOpenItem,
  onBrowseCategory,
  targetItem = null,
  onScopeItemCount,
  activeView,
  hideViewTabs = false,
}) => {
  const { openPeek } = useItemPeek();
  const hubSaved = loadNavigationState().pipelineHub;
  const pipeline = usePipelineProgress();
  const [subTab, setSubTab] = useState<'queue' | 'taxonomy'>(hubSaved.categoriesSubTab);
  const [filter, setFilter] = useState<PipelineQueueFilter>(
    hubSaved.categoriesFilter as PipelineQueueFilter
  );
  const [search, setSearch] = useState(hubSaved.categoriesSearch);
  const [allRows, setAllRows] = useState<PipelineQueueItemRow[]>([]);
  const [embedFailedIds, setEmbedFailedIds] = useState<Set<string>>(new Set());
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectState, setInspectState] = useState<{ ids: string[]; index: number } | null>(null);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [retryManualRows, setRetryManualRows] = useState<ManualReviewRetryRow[] | null>(null);
  const [retryManualLoading, setRetryManualLoading] = useState(false);
  const [displayOrderIds, setDisplayOrderIds] = useState<string[] | null>(null);
  const [recentUpdateIds, setRecentUpdateIds] = useState<string[]>([]);
  const recentUpdateIdSet = useMemo(() => new Set(recentUpdateIds), [recentUpdateIds]);
  const wasProcessingRef = useRef(false);
  const tableRowsForListRef = useRef<PipelineQueueItemRow[]>([]);
  const processingHoldRef = useRef<{ order: string[]; targets: string[] } | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  const inspectStateRef = useRef(inspectState);
  selectedIdsRef.current = selectedIds;
  inspectStateRef.current = inspectState;

  useEffect(() => {
    if (activeView && activeView !== subTab) setSubTab(activeView);
  }, [activeView, subTab]);

  useEffect(() => {
    patchNavigationState({
      pipelineHub: {
        categoriesSubTab: subTab,
        categoriesFilter: filter,
        categoriesSearch: search,
      },
    });
  }, [subTab, filter, search]);

  const filterSessionKey = useMemo(
    () =>
      JSON.stringify({
        filter,
        search,
        scopeProjectId,
        scopeCollectionId,
      }),
    [filter, search, scopeProjectId, scopeCollectionId]
  );

  const applyRecentHolds = useCallback(
    (ctx: { order: string[]; targets: string[] }, freshRows: PipelineQueueItemRow[]) => {
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
          if (!matchesPipelineQueueFilter(filter, row)) next.add(id);
          else next.delete(id);
        }
        return [...next];
      });
      setDisplayOrderIds(ctx.order);
    },
    [collections, filter, scopeCollectionId, scopeProjectId]
  );

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    // Allow search/filter while a pipeline job runs. Auto data-change reloads
    // stay suppressed while busy (see subscribeToDataChanges below).
    const silent = opts?.silent === true && allRows.length > 0;
    if (!silent) {
      if (allRows.length === 0) setInitialLoading(true);
      else setRefreshing(true);
    }
    try {
      await refreshPipelineCacheFromWorker();
      // Classification derives fetch, AI, and category state from pipeline
      // tables. After a page reload those are still paging in; reading first
      // would turn persisted enrichment into a false “Not fetched yet”.
      if (!isAnyDigestInFlight()) {
        await ensurePipelineHydrated();
        await ensurePendingClassifySignals();
      }
      invalidatePipelineCatalog();
      await refreshPipelineCacheFromWorker();
      const [list, embedFailed] = await Promise.all([
        listPipelineQueueItems('all', search),
        loadEmbedFailedIds(),
      ]);
      const hadPipelineData = allRows.some(
        (r) =>
          !!r.primaryCategoryId ||
          r.hasSignal ||
          (r.enrichment?.status != null && r.enrichment.status !== 'none')
      );
      const looksLikeEmptyCache =
        list.length > 0 &&
        list.every(
          (r) =>
            !r.primaryCategoryId &&
            !r.hasSignal &&
            (!r.enrichment || r.enrichment.status === 'none')
        );
      if (!(silent && hadPipelineData && looksLikeEmptyCache)) {
        setAllRows(list);
      }
      setEmbedFailedIds(embedFailed);
      return list;
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [allRows.length, search]);

  const applyHoldForIds = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const order = tableRowsForListRef.current.map((r) => r.item.id);
      void (async () => {
        const fresh = await reload({ silent: true });
        if (fresh?.length) {
          applyRecentHolds({ order, targets: ids }, fresh);
        }
      })();
    },
    [applyRecentHolds, reload]
  );

  useEffect(() => {
    void reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = window.setTimeout(() => void reload({ silent: true }), search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [search, reload]);

  useEffect(() => {
    return subscribeToDataChanges(() => {
      // Don't thrash Categories lane on every bulk item write; search/filter still reload.
      if (pipeline.isRunning) return;
      void reload({ silent: true });
    });
  }, [pipeline.isRunning, reload]);

  const isProcessing = pipeline.isRunning;

  useEffect(() => {
    if (isProcessing && !wasProcessingRef.current) {
      wasProcessingRef.current = true;
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
      const holdCtx = processingHoldRef.current;
      processingHoldRef.current = null;
      void (async () => {
        // Do NOT force full-library ensurePending here — that OOMs after bulk enrich.
        // Soft reload only; queue heal runs on the normal debounced path.
        await refreshPipelineCacheFromWorker();
        invalidatePipelineCatalog();
        const fresh = await reload({ silent: true });
        if (holdCtx && fresh?.length) {
          applyRecentHolds(holdCtx, fresh);
        }
      })();
    }
  }, [isProcessing, reload, applyRecentHolds]);

  const tableRows = allRows;

  const scopedRows = useMemo(
    () =>
      tableRows.filter((row) =>
        itemMatchesScope(row.item, scopeProjectId, scopeCollectionId, collections)
      ),
    [tableRows, collections, scopeCollectionId, scopeProjectId]
  );

  const scopedItemIds = useMemo(() => scopedRows.map((r) => r.item.id), [scopedRows]);

  const scopeActive = scopeProjectId !== 'all' || scopeCollectionId !== 'all';

  const {
    snapshot: maintenanceSnapshot,
    loading: maintenanceLoading,
    refreshing: maintenanceRefreshing,
    reload: reloadMaintenance,
  } = usePipelineMaintenanceSnapshot({
    itemIds: scopeActive ? scopedItemIds : undefined,
    pauseWhileRunning: true,
    isRunning: pipeline.isRunning,
  });

  const filterCounts = useMemo(() => countPipelineQueueFilters(scopedRows), [scopedRows]);

  const filteredRows = useMemo(
    () => scopedRows.filter((row) => matchesPipelineQueueFilter(filter, row)),
    [scopedRows, filter]
  );

  useEffect(() => {
    if (!onScopeItemCount) return;
    const count =
      subTab === 'taxonomy'
        ? scopedRows.length
        : filter === 'all'
          ? scopedRows.length
          : filteredRows.length;
    onScopeItemCount(count);
  }, [onScopeItemCount, subTab, filter, scopedRows.length, filteredRows.length]);

  const tableRowsForList = useMemo(
    () =>
      buildDisplayListWithRecentHolds(
        filteredRows,
        displayOrderIds,
        recentUpdateIdSet,
        scopedRows,
        allRows
      ),
    [filteredRows, displayOrderIds, recentUpdateIdSet, scopedRows, allRows]
  );

  tableRowsForListRef.current = tableRowsForList;

  useEffect(() => {
    setDisplayOrderIds(null);
    setRecentUpdateIds([]);
    setPageLimit(PAGE_SIZE);
  }, [filterSessionKey]);

  const visibleRows = useMemo(
    () => tableRowsForList.slice(0, pageLimit),
    [tableRowsForList, pageLimit]
  );

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(filteredRows.map((r) => r.item.id));
      const pinned = new Set([...(inspectState?.ids ?? []), ...recentUpdateIds]);
      const next = new Set([...prev].filter((id) => visible.has(id) || pinned.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRows, inspectState?.ids, recentUpdateIds]);

  const allSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.item.id));

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredRows.map((r) => r.item.id)));
  };

  const getOrderedSelectedIds = () =>
    filteredRows.filter((r) => selectedIds.has(r.item.id)).map((r) => r.item.id);

  // SINGLE SOURCE OF TRUTH: Calculate IDs for each scope ONCE
  // Both the modal counts AND handleDiscover use these exact IDs
  const discoverScopeIds = useMemo(() => {
    const baseRows = selectedIds.size > 0 
      ? filteredRows.filter(r => selectedIds.has(r.item.id))
      : scopedRows;

    const unassignedIds: string[] = [];
    const generalIds: string[] = [];
    const pendingClassifyIds: string[] = [];
    const allEligibleIds: string[] = [];

    for (const row of baseRows) {
      if (isReclassifyScopeCandidate(row)) {
        allEligibleIds.push(row.item.id);
      }

      if (isClassifyPendingRunnable(row)) {
        pendingClassifyIds.push(row.item.id);
      } else if (row.eligible && row.classifyState === 'classified_general') {
        generalIds.push(row.item.id);
      } else if (row.eligible && row.classifyState === 'pending_discover') {
        // Classify ran but no specific topic matched — "no category found"
        unassignedIds.push(row.item.id);
      }
    }

    return { unassignedIds, generalIds, pendingClassifyIds, allEligibleIds };
  }, [scopedRows, filteredRows, selectedIds]);

  const discoverWaiting = useMemo(
    () => discoverScopeIds.unassignedIds.length + discoverScopeIds.generalIds.length,
    [discoverScopeIds]
  );

  const discoverConfigPlan = useMemo<DiscoverConfigPlan | undefined>(() => {
    if (!maintenanceSnapshot) return undefined;
    
    return {
      scopeLabel: scopeActive
        ? 'Current scope (project/collection)'
        : selectedIds.size > 0
          ? `${selectedIds.size} selected`
          : 'Entire library',
      counts: {
        unassigned: discoverScopeIds.unassignedIds.length,
        general: discoverScopeIds.generalIds.length,
        pendingClassify: discoverScopeIds.pendingClassifyIds.length,
        all: discoverScopeIds.allEligibleIds.length,
      }
    };
  }, [maintenanceSnapshot, discoverScopeIds, selectedIds, scopeActive]);

  const handleDiscover = (scope: DiscoverInputScope, andClassify: boolean, batches: number) => {
    // Use the SAME IDs that were shown in the modal - no recalculation
    let targetIds: string[];
    
    if (scope === 'all') {
      targetIds = discoverScopeIds.allEligibleIds;
    } else if (scope === 'unassigned') {
      targetIds = discoverScopeIds.unassignedIds;
    } else if (scope === 'unassigned_general') {
      targetIds = [...discoverScopeIds.unassignedIds, ...discoverScopeIds.generalIds];
    } else {
      // unassigned_general_pending
      targetIds = [...discoverScopeIds.unassignedIds, ...discoverScopeIds.generalIds, ...discoverScopeIds.pendingClassifyIds];
    }

    if (targetIds.length === 0) return;

    void pipeline
      .runDiscover({
        itemIds: targetIds,
        andClassify,
        maxBatches: batches,
        stuckOnly: false,
        title: andClassify ? `Discover + Classify (${targetIds.length})` : `Discover (${targetIds.length})`,
      })
      .then(() => {
        if (targetIds.length) applyHoldForIds(targetIds);
        void reloadMaintenance(true);
      })
      .catch(() => {});
  };

  const handleClassifyPending = () => {
    const baseRows = selectedIds.size > 0 
      ? filteredRows.filter(r => selectedIds.has(r.item.id))
      : scopedRows;
      
    const targetIds = baseRows.filter(isClassifyPendingRunnable).map((r) => r.item.id);
    
    if (targetIds.length === 0) return;
    
    void pipeline
      .runClassify({
        title: `Classify Pending (${targetIds.length})`,
        itemIds: targetIds,
        maxItems: targetIds.length,
      })
      .then(() => void reloadMaintenance(true))
      .catch(() => {});
  };

  const handleReclassifyAll = () => {
    const baseRows = selectedIds.size > 0 
      ? filteredRows.filter(r => selectedIds.has(r.item.id))
      : scopedRows;
      
    const targetIds = baseRows.filter(isReclassifyScopeCandidate).map((r) => r.item.id);
    
    if (targetIds.length === 0) return;
    
    void pipeline
      .runClassify({
        title: `Reclassify All (${targetIds.length})`,
        itemIds: targetIds,
        maxItems: targetIds.length,
        forceReclassify: true,
      })
      .then(() => void reloadMaintenance(true))
      .catch(() => {});
  };

  const handleRetryManualRequest = () => {
        setRetryManualLoading(true);
    setRetryManualRows([]);
    void (async () => {
      try {
        let queueRows = await listPipelineQueueItems('manual_review', search);
        if (scopeActive && scopedItemIds.length > 0) {
          const scope = new Set(scopedItemIds);
          queueRows = queueRows.filter((r) => scope.has(r.item.id));
        }
        const rows: ManualReviewRetryRow[] = queueRows.map((row) => ({
          id: row.item.id,
          title: row.item.title?.trim() || row.item.url || row.item.id,
          url: row.item.url,
          reason: row.lastClassifySkipReason,
        }));
        setRetryManualRows(rows);
      } finally {
        setRetryManualLoading(false);
      }
    })();
  };

  const handleRetryManualConfirm = (selectedIds: string[]) => {
    setRetryManualRows(null);
    if (!selectedIds.length) return;
    const itemLabels = Object.fromEntries(
      selectedIds.map((id) => {
        const row = allRows.find((r) => r.item.id === id);
        return [id, row?.item.title?.trim() || row?.item.url || id];
      })
    );
    void pipeline
      .runClassify({
        title: `Retry manual review (${selectedIds.length})`,
        itemIds: selectedIds,
        maxItems: selectedIds.length,
        retryManualReview: true,
        itemLabels,
      })
      .then(() => {
        setFilter('manual_review');
        setSubTab('queue');
        void reloadMaintenance(true);
      })
      .catch(() => {});
  };

  const handleViewManualReview = () => {
    setFilter('manual_review');
    setSubTab('queue');
  };

  const handleBulkClassify = async (forceReclassify?: boolean) => {
    const ids = getOrderedSelectedIds();
    if (!ids.length) return;
    const itemLabels = Object.fromEntries(
      filteredRows
        .filter((r) => selectedIds.has(r.item.id))
        .map((r) => [r.item.id, r.item.title || r.item.url || r.item.id])
    );
    try {
      await pipeline.runBatch(ids, {
        title: forceReclassify ? `Force reclassify (${ids.length})` : `Classify (${ids.length})`,
        enrich: false,
        classify: true,
        processAll: true,
        forceReclassify: forceReclassify === true,
        cancellable: true,
        collectItemResults: false,
        skipDiscover: true,
        drainPendingClassifyQueue: false,
        itemLabels,
      });
    } catch {
      /* report modal */
    }
  };

  const openInspect = (item: Item) => {
    setInspectState({ ids: [item.id], index: 0 });
    onOpenItem?.(item);
  };

  const inspectRow = inspectState
    ? tableRowsForList.find((r) => r.item.id === inspectState.ids[inspectState.index]) ??
      scopedRows.find((r) => r.item.id === inspectState.ids[inspectState.index])
    : null;

  const laneTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    marginBottom: -1,
  });

  return (
    <>
      {retryManualRows ? (
        <ManualReviewRetryModal
          rows={retryManualRows}
          loading={retryManualLoading}
          scopeLabel={
            scopeActive
              ? 'Current scope (project/collection)'
              : filter !== 'all'
                ? `Filter: ${filter}`
                : 'Entire library'
          }
          onConfirm={handleRetryManualConfirm}
          onCancel={() => setRetryManualRows(null)}
        />
      ) : null}
    <div>
      {subTab === 'queue' && <PipelineMaintenanceStrip
        snapshot={maintenanceSnapshot}
        loading={maintenanceLoading}
        refreshing={maintenanceRefreshing}
        scopeLabel={
          scopeActive
            ? 'Current scope (project/collection)'
            : selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : 'Entire library'
        }
        discoverConfigPlan={discoverConfigPlan}
        discoverWaiting={discoverWaiting}
        onRefresh={() => void reloadMaintenance(true)}
        onDiscover={handleDiscover}
        onClassifyPending={handleClassifyPending}
        onReclassifyAll={handleReclassifyAll}
        onRetryManual={handleRetryManualRequest}
        onViewManualReview={handleViewManualReview}
      />}
      {!hideViewTabs && <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <button type="button" style={laneTabStyle(subTab === 'queue')} onClick={() => setSubTab('queue')}>
          Classify queue
        </button>
        <button
          type="button"
          style={laneTabStyle(subTab === 'taxonomy')}
          onClick={() => setSubTab('taxonomy')}
        >
          Browse taxonomy
        </button>
        <div style={{ flex: 1 }} />
        {subTab === 'queue' ? (
          initialLoading ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginBottom: 6 }}>
              <Loader2 size={14} className="spin" />
              Loading…
            </span>
          ) : refreshing ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginBottom: 6 }}>Refreshing…</span>
          ) : (
            <button
              type="button"
              onClick={() => void reload({ silent: true })}
              title="Refresh queue"
              className="ui-button ui-button--secondary ui-button--icon"
              style={{ marginBottom: 6 }}
            >
              <RefreshCw size={13} />
            </button>
          )
        ) : null}
      </div>}

      {subTab === 'taxonomy' ? (
        <AiCategoriesView
          embedded
          onBrowseCategory={onBrowseCategory}
          targetItem={inspectRow?.item ?? targetItem}
        />
      ) : (
        <>
          <p className="ui-pipeline-hub__queue-note">
            Filter chip counts = {scopedRows.length} bookmark{scopedRows.length === 1 ? '' : 's'} in
            current scope
            {scopeActive ? ' (project/collection)' : ''}. Use <strong>Update categories</strong>{' '}
            above when the waiting counts look ready — select rows first to limit scope.
          </p>
          <div className="ui-pipeline-hub__chip-row ui-pipeline-hub__classification-chips">
            {PIPELINE_QUEUE_FILTER_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.id}
                label={opt.label}
                hint={opt.hint}
                count={filterCounts[opt.id] ?? 0}
                active={filter === opt.id}
                onClick={() => setFilter(opt.id)}
              />
            ))}
          </div>

          <div className="ui-pipeline-hub__search-row ui-pipeline-hub__classification-search">
            <div className="ui-pipeline-hub__search-field">
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
                className="ui-field"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, URL, topic…"
              />
            </div>
            <span className="ui-pipeline-hub__filter-summary">
              {tableRowsForList.length} in view · filter:{' '}
              {PIPELINE_QUEUE_FILTER_OPTIONS.find((o) => o.id === filter)?.label}
              {recentUpdateIds.length > 0
                ? ` · ${recentUpdateIds.length} just updated (shown until you change filters)`
                : ''}
            </span>
          </div>

          {selectedIds.size > 0 ? (
            <div className="ui-pipeline-hub__selection-bar">
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{selectedIds.size} selected</span>
              <button
                type="button"
                onClick={() => void handleBulkClassify(false)}
                className="ui-button ui-button--primary"
                title={
                  pipeline.isRunning
                    ? 'Queues classify behind the current job'
                    : undefined
                }
              >
                <Tags size={13} />
                {pipeline.isRunning ? 'Queue classify' : 'Classify'}
              </button>
              <button
                type="button"
                onClick={() => void handleBulkClassify(true)}
                className="ui-button ui-button--secondary ui-pipeline-hub__reclassify"
                title="Re-run topic LLM even when already classified"
              >
                <RotateCcw size={13} />
                {pipeline.isRunning ? 'Queue reclassify' : 'Force reclassify'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="ui-button ui-button--secondary"
              >
                Clear
              </button>
            </div>
          ) : null}

          <div
            className="ui-pipeline-table"
          >
            <div
              className="ui-pipeline-table__header"
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 120px 1fr 140px 100px',
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
              <span>State</span>
              <span>Queue reason</span>
              <span>Topic</span>
              <span>Actions</span>
            </div>

            {initialLoading && filteredRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                Loading classify queue…
              </div>
            ) : visibleRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                No items match this filter.
              </div>
            ) : (
              visibleRows.map((row) => {
                const st = row.classifyState;
                const topicPresentation = topicSourcePresentation(row);
                const isRecentUpdate = recentUpdateIdSet.has(row.item.id);
                const stillMatchesFilter = filteredRows.some((r) => r.item.id === row.item.id);
                const isCurrentInspect =
                  inspectState != null && inspectState.ids[inspectState.index] === row.item.id;
                return (
                  <div
                    key={row.item.id}
                    className="ui-pipeline-table__row-shell"
                    data-recent={isRecentUpdate ? 'true' : 'false'}
                  >
                    <ItemResultRow
                      className="ui-pipeline-table__row"
                      item={row.item}
                      dragSource={{ kind: 'reference', label: 'Classification queue' }}
                      selected={isCurrentInspect}
                      data-checked={selectedIds.has(row.item.id) ? 'true' : 'false'}
                      data-recent={isRecentUpdate ? 'true' : 'false'}
                      onSelectItem={() => openInspect(row.item)}
                      onDoubleClick={(event) => {
                        if ((event.target as HTMLElement).closest('button, input, a')) return;
                        openPeek(row.item.id, { itemIds: visibleRows.map((candidate) => candidate.item.id), sourceLabel: 'Classification queue' });
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '32px 1fr 120px 1fr 140px 100px',
                        gap: 8,
                        padding: '10px 12px',
                        alignItems: 'center',
                        fontSize: 'var(--text-sm)',
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.item.id)}
                          onChange={(e) => toggleSelect(row.item.id, e.target.checked)}
                        />
                      </label>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.item.title || row.item.url || 'Untitled'}
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
                        <BookmarkUrlLink item={row.item} style={{ marginTop: 0 }} />
                        {isRecentUpdate && !stillMatchesFilter ? (
                          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                            No longer matches filter
                          </div>
                        ) : null}
                      </div>
                      <span
                        className="ui-pipeline-table__state"
                        style={{ '--pipeline-status-tone': rowStateColor(row) } as React.CSSProperties}
                        title={row.pendingBlockerLabel ?? rowStateLabel(row)}
                      >
                        {rowStateLabel(row)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <ClassifyQueueReasonBlock
                          compact
                          itemId={row.item.id}
                          onActionComplete={() => applyHoldForIds([row.item.id])}
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
                          style={{ maxWidth: '100%', fontSize: 'var(--text-xs)' }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={row.topicPath ?? undefined}
                      >
                        {row.topicPath ? (
                          <>
                            <span
                              style={{
                                color: topicPresentation?.color ?? 'var(--text)',
                              }}
                            >
                              {row.topicPath}
                            </span>
                            <span
                              style={{
                                marginLeft: 6,
                                color: topicPresentation?.color ?? topicSourceColor(row),
                                fontWeight: 600,
                              }}
                            >
                              {topicSourceLabel(row)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => openInspect(row.item)}
                          title="Inspect pipeline"
                          className="ui-button ui-button--icon"
                        >
                          <Eye size={13} />
                        </button>
                        {getBookmarkOpenUrl(row.item) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openBookmarkInBrowser(row.item);
                            }}
                            title="Open URL in new tab"
                            className="ui-button ui-button--icon"
                          >
                            <ExternalLink size={13} />
                          </button>
                        ) : null}
                      </div>
                    </ItemResultRow>
                    {isCurrentInspect && inspectRow ? (
                      <PipelineItemInspectorPanel
                        item={inspectRow.item}
                        enrichment={inspectRow.enrichment}
                        embedFailed={embedFailedIds.has(inspectRow.item.id)}
                        collections={collections}
                        targetIds={inspectState!.ids}
                        itemLabels={{ [inspectRow.item.id]: inspectRow.item.title || inspectRow.item.url }}
                        navIndex={0}
                        navTotal={1}
                        onClose={() => setInspectState(null)}
                        onActionComplete={() => applyHoldForIds(inspectState!.ids)}
                      />
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
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                Show more ({tableRowsForList.length - pageLimit} remaining)
              </button>
            </div>
          ) : null}

          <div style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            Updated {formatTime(scopedRows[0]?.item.updated_at)} · {scopedRows.length} bookmarks in scope
          </div>
        </>
      )}
    </div>
    </>
  );
};
