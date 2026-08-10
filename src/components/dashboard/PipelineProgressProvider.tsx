import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import {
  runItemPipeline,
  formatItemPipelineProgress,
  pipelineProgressBar,
  loadItemIdsForPipelineQueue,
  isFullPipelineBatch,
  scopedProgressToItemProgress,
  type BatchDigestResult,
  type SingleLinkDigestResult,
  type ItemPipelineProgress,
} from '../../lib/pipeline';
import { reextractAI, embedIncrementalBatch, type EnrichmentResult } from '../../lib/enrichment';
import {
  classifyIncremental,
  discoverBatch,
  APP_DISCOVER_MAP_BATCH_SIZE,
  type ClassifyProgressUpdate,
} from '../../lib/categorization';
import { emptyTopicClassifySummary } from '../../lib/categorization/classifyPolicy';
import {
  buildClassifyOutcomeReportRows,
  buildEnrichOutcomeReportRows,
  CLASSIFY_DONE_REPORT_SAMPLE_CAP,
  formatBatchDigestDoneSummary,
  formatClassifyDoneModalSummary,
  formatClassifyRunSummary,
  formatPipelineReportSummaryFromRows,
  resolveBatchReportAction,
  resolveReportRowsSummaryTone,
  type PipelineReportRow,
} from '../../lib/pipeline/pipelineBatchReport';
import {
  buildPipelineRunExport,
  type PipelineRunExport,
} from '../../lib/pipeline/pipelineRunAnalysis';
import { downloadPipelineRunBundle } from '../../lib/pipeline/pipelineRunStore';
import {
  loadHubQueueSnapshot,
  type HubQueueOutcome,
} from '../../lib/pipeline/queueOutcomeSnapshot';
import { PipelineBatchReportPanel } from './PipelineBatchReportPanel';
import { QueueOutcomePanel } from './QueueOutcomePanel';
import {
  resolveClassifyDoneModalTone,
  resolvePipelineSummaryTone,
} from '../../lib/pipeline/pipelineDictionary';
import type { LibraryRefreshScope } from '../../lib/libraryRefresh';
import {
  createPipelineOwnerId,
  isPipelineRunLockFresh,
  PIPELINE_HARD_CANCEL_REASON,
  type PipelineRunKind,
  type PipelineRunLock,
  releasePipelineRunLock,
  requestCancelPipelineRun,
  startPipelineLockHeartbeat,
  subscribePipelineRunLock,
  tryAcquirePipelineRunLock,
  waitAndAcquirePipelineRunLock,
} from '../../lib/pipeline/pipelineRunLock';

type SummaryTone = 'success' | 'error' | 'info';

type ModalState =
  | { open: false }
  | {
      open: true;
      phase: 'running';
      title: string;
      progressLabel: string;
      current: number;
      total: number;
      cancellable: boolean;
    }
  | {
      open: true;
      phase: 'done';
      title: string;
      summary: string;
      tone: SummaryTone;
      reportRows?: PipelineReportRow[];
      /** How many bookmarks the user selected for this batch (report list scope). */
      reportScopeCount?: number;
      /** Full selection count when reportRows is a capped sample. */
      reportRowsTotal?: number;
      queueOutcome?: HubQueueOutcome;
      analysisExport?: PipelineRunExport;
      analysisSavedTo?: string;
    };

export interface RunBatchWithProgressOptions {
  title?: string;
  enrich?: boolean;
  classify?: boolean;
  maxEnrich?: number;
  maxClassify?: number;
  processAll?: boolean;
  refetchCompare?: boolean;
  /** Show Cancel and wire AbortSignal (enrich phase only). */
  cancellable?: boolean;
  /** Collect per-item enrich outcomes for the results report. */
  collectItemResults?: boolean;
  /** itemId → display title for the results report. */
  itemLabels?: Record<string, string>;
    /** Force network re-fetch even when content hash unchanged. */
    forceEnrich?: boolean;
    /** Fetch only — skip AI extract during enrich phase. */
    skipAi?: boolean;
    /** Re-run classify LLM even when text hash unchanged (Re-digest). */
    forceReclassify?: boolean;
    /** Skip slow taxonomy discover passes (recommended for small Hub selections). */
    skipDiscover?: boolean;
    /** Also classify the global pending_classify backlog, not only itemIds. */
    drainPendingClassifyQueue?: boolean;
  }

export interface RunSingleWithProgressOptions {
  title?: string;
  forceEnrich?: boolean;
  skipClassify?: boolean;
  /** Fetch only — skip AI extract during enrich phase (Hub bulk fetch stage). */
  skipAi?: boolean;
  /** Re-run classify LLM even when text hash unchanged (Full digest / Re-digest). */
  forceReclassify?: boolean;
  tabSessionOnly?: boolean;
  preferTabSession?: boolean;
  tabId?: number;
  /** Display title for the results report. */
  itemLabel?: string;
  /**
   * user (default): may soft-pause a bulk job and jump the local queue.
   * background: auto-digest on save — queues behind bulk, never preempts.
   */
  priority?: 'user' | 'background';
}

export interface RunDiscoverOptions {
  title?: string;
  itemIds?: string[];
  maxBatches?: number;
  stuckOnly?: boolean;
  /** Run classify on discover sample only (not entire classify queue). */
  andClassify?: boolean;
  forceReclassify?: boolean;
  signal?: AbortSignal;
}

export interface RunDiscoverResult {
  discover: Awaited<ReturnType<typeof discoverBatch>>;
  classifySummary?: Awaited<ReturnType<typeof classifyIncremental>>['summary'];
}

export interface RunClassifyOptions {
  title?: string;
  itemIds?: string[];
  forceReclassify?: boolean;
  retryManualReview?: boolean;
  maxItems?: number;
  itemLabels?: Record<string, string>;
  /** Per-bookmark result table when itemIds are set (default true). */
  itemReport?: boolean;
  /** After manual retry, show per-bookmark result rows (default true when retryManualReview). */
  manualRetryReport?: boolean;
}

interface PipelineProgressContextValue {
  isRunning: boolean;
  /** True only while this window owns an active progress-modal run. */
  isLocalRunning: boolean;
  /** Depth of local jobs waiting (singles jump the front; bulks append). */
  queuedCount: number;
  isCancellable: boolean;
  cancel: () => void;
  runBatch: (
    itemIds: string[],
    options?: RunBatchWithProgressOptions
  ) => Promise<BatchDigestResult>;
  runSingle: (
    itemId: string,
    options?: RunSingleWithProgressOptions
  ) => Promise<SingleLinkDigestResult>;
  runReextract: (
    itemId: string,
    options?: { title?: string; itemLabel?: string; force?: boolean }
  ) => Promise<EnrichmentResult>;
  runReextractBatch: (
    itemIds: string[],
    options?: { title?: string; itemLabels?: Record<string, string>; force?: boolean }
  ) => Promise<EnrichmentResult[]>;
  runEmbedBatch: (
    itemIds: string[],
    options?: { title?: string }
  ) => Promise<{ embedded: number; skipped: number; failed: number }>;
  runDiscover: (options?: RunDiscoverOptions) => Promise<RunDiscoverResult>;
  runClassify: (options?: RunClassifyOptions) => Promise<Awaited<ReturnType<typeof classifyIncremental>>>;
  /** Resume paused/failed/interrupted import-pipeline-job.json with progress modal. */
  runResumePipelineJob: (options?: {
    onFinished?: () => void | Promise<void>;
  }) => Promise<void>;
  closeModal: () => void;
}

const PipelineProgressContext = createContext<PipelineProgressContextValue | null>(
  null
);

export function usePipelineProgress(): PipelineProgressContextValue {
  const ctx = useContext(PipelineProgressContext);
  if (!ctx) {
    throw new Error('usePipelineProgress must be used within PipelineProgressProvider');
  }
  return ctx;
}

interface PipelineProgressProviderProps {
  children: React.ReactNode;
  onRefresh?: (scope?: LibraryRefreshScope) => void | Promise<void>;
}

async function refreshAfterPipeline(
  onRefresh: PipelineProgressProviderProps['onRefresh'],
  scope?: LibraryRefreshScope
): Promise<void> {
  // Match main: UI refresh only. Never schedule a full sqlite folder dump here —
  // digests already spike memory; export OOMs Chrome even when "soft"-debounced.
  await onRefresh?.(scope);
}

function applyPipelineProgress(
  setModal: React.Dispatch<React.SetStateAction<ModalState>>,
  update: ItemPipelineProgress
) {
  const bar = pipelineProgressBar(update);
  const ratio = bar.total > 0 ? bar.current / bar.total : 0;
  setRunningProgress(setModal, formatItemPipelineProgress(update), ratio);
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function setRunningProgress(
  setModal: React.Dispatch<React.SetStateAction<ModalState>>,
  progressLabel: string,
  ratio: number
): void {
  const next = Math.round(clampRatio(ratio) * 100);
  setModal((prev) =>
    prev.open && prev.phase === 'running'
      ? {
          ...prev,
          progressLabel,
          current: Math.max(prev.current, next),
          total: 100,
        }
      : prev
  );
}

export const PipelineProgressProvider: React.FC<PipelineProgressProviderProps> = ({
  children,
  onRefresh,
}) => {
  const [modal, setModalState] = useState<ModalState>({ open: false });
  const [isRunning, setIsRunning] = useState(false);
  const [isCancellable, setIsCancellable] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [sharedLock, setSharedLock] = useState<PipelineRunLock | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ownerIdRef = useRef(createPipelineOwnerId());
  const stopHeartbeatRef = useRef<(() => void) | null>(null);
  const currentKindRef = useRef<PipelineRunKind | null>(null);
  const isRunningRef = useRef(false);
  const resumeBulkAfterSingleRef = useRef(false);
  /** User hit Cancel — drop queued jobs and skip auto-resume / pump. */
  const userCancelRef = useRef(false);
  /** After Cancel, ignore progress/done modal updates while work winds down. */
  const suppressPipelineUiRef = useRef(false);
  /** Aborts waitAndAcquire while queued behind another window. */
  const waitAbortRef = useRef<AbortController | null>(null);
  type SlotWaiter = {
    id: string;
    kind: PipelineRunKind;
    title: string;
    resolve: (ok: boolean) => void;
  };
  const slotWaitersRef = useRef<SlotWaiter[]>([]);
  const pumpScheduledRef = useRef(false);
  /** Single digest on offscreen — don't let bulk progress clobber its modal. */
  const parallelSingleRef = useRef(false);

  const setModal: React.Dispatch<React.SetStateAction<ModalState>> = useCallback(
    (update) => {
      if (suppressPipelineUiRef.current) return;
      if (parallelSingleRef.current) return;
      setModalState(update);
    },
    []
  );

  const clearSlotQueue = useCallback(() => {
    const pending = slotWaitersRef.current.splice(0);
    setQueuedCount(0);
    for (const w of pending) w.resolve(false);
  }, []);

  /** Immediate UI + abort for this window (local Cancel or remote cancel signal). */
  const applyLocalCancelUiAndAbort = useCallback(() => {
    suppressPipelineUiRef.current = true;
    userCancelRef.current = true;
    resumeBulkAfterSingleRef.current = false;
    clearSlotQueue();
    setModalState({ open: false });
    setIsRunning(false);
    setIsCancellable(false);
    isRunningRef.current = false;
    waitAbortRef.current?.abort();
    waitAbortRef.current = null;
    const ac = abortRef.current;
    abortRef.current = null;
    ac?.abort(PIPELINE_HARD_CANCEL_REASON);
  }, [clearSlotQueue]);

  useEffect(() => {
    return subscribePipelineRunLock((lock) => {
      setSharedLock(lock);
      // Another window requested cancel — if we own the run, stop it now.
      if (
        lock?.cancelRequested &&
        lock.ownerId === ownerIdRef.current &&
        (isRunningRef.current || abortRef.current)
      ) {
        applyLocalCancelUiAndAbort();
        stopHeartbeatRef.current?.();
        stopHeartbeatRef.current = null;
        currentKindRef.current = null;
        void import('../../lib/pipeline/importPipelineJob')
          .then(({ clearImportPipelineJob, notifyImportPipelineJobChanged }) => {
            notifyImportPipelineJobChanged();
            return clearImportPipelineJob();
          })
          .catch(() => {});
      }
    });
  }, [applyLocalCancelUiAndAbort]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const remoteBulkHeld =
    Boolean(sharedLock) &&
    isPipelineRunLockFresh(sharedLock) &&
    sharedLock!.ownerId !== ownerIdRef.current &&
    sharedLock!.kind === 'bulk';
  const remoteAnyHeld =
    Boolean(sharedLock) &&
    isPipelineRunLockFresh(sharedLock) &&
    sharedLock!.ownerId !== ownerIdRef.current;
  /** Hub/bulk UI: busy while local run, queued local work, or remote bulk lock. */
  const pipelineBusy = isRunning || queuedCount > 0 || remoteBulkHeld;

  const releaseSharedRun = useCallback(async () => {
    stopHeartbeatRef.current?.();
    stopHeartbeatRef.current = null;
    currentKindRef.current = null;
    await releasePipelineRunLock(ownerIdRef.current);
  }, []);

  const takeSlotLock = useCallback(
    async (
      title: string,
      kind: PipelineRunKind,
      itemCount: number,
      importRunId?: string | null,
      opts?: { preemptBulk?: boolean }
    ): Promise<boolean> => {
      if (userCancelRef.current) return false;
      void opts?.preemptBulk; // legacy opt — soft-preempt removed (priority queue only)

      const waitWithCancel = async (
        progressLabel: string,
        delayModalMs = 0,
        maxWaitMs?: number
      ): Promise<boolean> => {
        waitAbortRef.current?.abort();
        const waitAc = new AbortController();
        waitAbortRef.current = waitAc;
        let modalTimer: number | undefined;
        const showWaitModal = () => {
          if (userCancelRef.current || waitAc.signal.aborted) return;
          setModal({
            open: true,
            phase: 'running',
            title,
            progressLabel,
            current: 0,
            total: 100,
            cancellable: true,
          });
        };
        // Brief handoffs (same-window yield) often finish <400ms — avoid flashing a block message.
        if (delayModalMs > 0) {
          modalTimer = window.setTimeout(showWaitModal, delayModalMs);
        } else {
          showWaitModal();
        }
        try {
          const waited = await waitAndAcquirePipelineRunLock(
            {
              ownerId: ownerIdRef.current,
              title,
              kind,
              itemCount,
              importRunId: importRunId ?? null,
            },
            { signal: waitAc.signal, maxWaitMs }
          );
          return waited.ok && !userCancelRef.current;
        } finally {
          if (modalTimer != null) window.clearTimeout(modalTimer);
          if (waitAbortRef.current === waitAc) waitAbortRef.current = null;
        }
      };

      // Never soft-pause/abort bulk for priority — waiters stay in memory and drain in order
      // (singles jump the local slot queue; offscreen digests skip this lock entirely).
      {
        const acq = await tryAcquirePipelineRunLock({
          ownerId: ownerIdRef.current,
          title,
          kind,
          itemCount,
          importRunId: importRunId ?? null,
        });
        if (!acq.ok) {
          const label =
            kind === 'single'
              ? `Queued — will start after “${acq.lock.title}”…`
              : `Queued behind “${acq.lock.title}”…`;
          const ok = await waitWithCancel(
            label,
            kind === 'single' ? 450 : 0,
            kind === 'single' ? 12_000 : undefined
          );
          if (!ok) return false;
        }
      }
      if (userCancelRef.current) {
        await releasePipelineRunLock(ownerIdRef.current);
        return false;
      }
      stopHeartbeatRef.current?.();
      stopHeartbeatRef.current = startPipelineLockHeartbeat(
        ownerIdRef.current,
        () => {
          // Hard cancel from another window
          applyLocalCancelUiAndAbort();
        },
        () => {
          // Ignore yield — priority queue handles singles; do not abort bulk.
        }
      );
      currentKindRef.current = kind;
      return true;
    },
    [applyLocalCancelUiAndAbort, setModal]
  );

  const pumpSlotQueue = useCallback(() => {
    if (userCancelRef.current) return;
    if (pumpScheduledRef.current) return;
    pumpScheduledRef.current = true;
    queueMicrotask(() => {
      pumpScheduledRef.current = false;
      if (userCancelRef.current) return;
      if (isRunningRef.current && abortRef.current) return;
      const next = slotWaitersRef.current.shift();
      setQueuedCount(slotWaitersRef.current.length);
      if (!next) {
        if (resumeBulkAfterSingleRef.current) {
          resumeBulkAfterSingleRef.current = false;
          // Keep Hub busy chrome while auto-resume starts.
          setIsRunning(true);
          void (async () => {
            try {
              const { readImportPipelineJob, IMPORT_WAVE_PIPELINE_ENABLED } = await import(
                '../../lib/pipeline/importPipelineJob'
              );
              if (!IMPORT_WAVE_PIPELINE_ENABLED) {
                setIsRunning(false);
                return;
              }
              const job = await readImportPipelineJob();
              if (!job || job.status === 'completed') {
                setIsRunning(false);
                return;
              }
              autoResumeBulkRef.current?.();
            } catch {
              setIsRunning(false);
            }
          })();
          return;
        }
        setIsRunning(false);
        return;
      }
      // Next queued job is about to take the lock — keep busy chrome continuous.
      setIsRunning(true);
      next.resolve(true);
    });
  }, []);

  const autoResumeBulkRef = useRef<(() => void) | null>(null);

  /**
   * Gate for in-page pipeline entry points that still share the lock.
   * - single: jumps the in-memory waiter queue (no soft-pause / abort of bulk)
   * - bulk: appends when busy
   * Digests prefer offscreen (parallel); this gate is for remaining in-page jobs.
   */
  const acquireSharedRun = useCallback(
    async (
      title: string,
      itemCount = 0,
      importRunId?: string | null,
      kind: PipelineRunKind = itemCount <= 1 ? 'single' : 'bulk',
      _opts?: { preemptBulk?: boolean }
    ): Promise<boolean> => {
      userCancelRef.current = false;
      suppressPipelineUiRef.current = false;
      const jumpQueue = kind === 'single';
      const needsQueue = Boolean(abortRef.current) || slotWaitersRef.current.length > 0;

      if (!needsQueue) {
        return takeSlotLock(title, kind, itemCount, importRunId, {
          preemptBulk: false,
        });
      }

      if (jumpQueue) {
        setModal({
          open: true,
          phase: 'running',
          title,
          progressLabel: 'Queued ahead of bulk…',
          current: 0,
          total: 100,
          cancellable: true,
        });
      }

      const ok = await new Promise<boolean>((resolve) => {
        const waiter: SlotWaiter = {
          id: `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind,
          title,
          resolve,
        };
        if (jumpQueue) {
          slotWaitersRef.current.unshift(waiter);
        } else {
          slotWaitersRef.current.push(waiter);
        }
        setQueuedCount(slotWaitersRef.current.length);
        if (!abortRef.current) pumpSlotQueue();
      });

      if (!ok || userCancelRef.current) {
        if (!abortRef.current && slotWaitersRef.current.length === 0) {
          setIsRunning(false);
        }
        return false;
      }
      const locked = await takeSlotLock(title, kind, itemCount, importRunId, {
        preemptBulk: false,
      });
      if (!locked && !abortRef.current && slotWaitersRef.current.length === 0) {
        setIsRunning(false);
      }
      return locked;
    },
    [pumpSlotQueue, setModal, takeSlotLock]
  );

  const releaseSharedRunAndPump = useCallback(async () => {
    await releaseSharedRun();
    if (userCancelRef.current) {
      // Cancel drops the rest of the queue; don't auto-start the next job.
      clearSlotQueue();
      resumeBulkAfterSingleRef.current = false;
      userCancelRef.current = false;
      setIsRunning(false);
      return;
    }
    pumpSlotQueue();
  }, [clearSlotQueue, pumpSlotQueue, releaseSharedRun]);

  const closeModal = useCallback(() => {
    setModalState((prev) => {
      if (!prev.open) return prev;
      if (prev.phase === 'running' && !suppressPipelineUiRef.current) return prev;
      return { open: false };
    });
  }, []);

  const cancel = useCallback(() => {
    const hadLocalRun = isRunningRef.current || Boolean(abortRef.current);
    userCancelRef.current = true;
    resumeBulkAfterSingleRef.current = false;
    clearSlotQueue();
    waitAbortRef.current?.abort();
    waitAbortRef.current = null;
    abortRef.current?.abort(PIPELINE_HARD_CANCEL_REASON);
    setIsCancellable(false);
    setModalState((current) =>
      current.open && current.phase === 'running'
        ? { ...current, progressLabel: 'Cancelling…', cancellable: false }
        : current
    );

    stopHeartbeatRef.current?.();
    stopHeartbeatRef.current = null;
    currentKindRef.current = null;

    // Signal the owner window and clear the persisted job immediately. The
    // active runner owns lock release after it has observed hard cancellation.
    void (async () => {
      try {
        const { clearImportPipelineJob, notifyImportPipelineJobChanged } = await import(
          '../../lib/pipeline/importPipelineJob'
        );
        // Signal owner window first, then clear local banner/job file.
        await requestCancelPipelineRun();
        notifyImportPipelineJobChanged();
        await clearImportPipelineJob();
      } catch {
        /* ignore */
      } finally {
        if (!hadLocalRun) {
          suppressPipelineUiRef.current = false;
          userCancelRef.current = false;
        }
      }
    })();
  }, [clearSlotQueue]);

  const endPipelineRun = useCallback(() => {
    setIsCancellable(false);
    abortRef.current = null;
    // Do not clear isRunning here — pumpSlotQueue keeps Hub chrome continuous
    // across queued handoffs, and clears it only when the queue is empty.
    void releaseSharedRunAndPump();
    // Re-enable modal updates after cancel wind-down.
    if (suppressPipelineUiRef.current) {
      suppressPipelineUiRef.current = false;
    }
  }, [releaseSharedRunAndPump]);

  const runBatch = useCallback(
    async (
      itemIds: string[],
      options?: RunBatchWithProgressOptions
    ): Promise<BatchDigestResult> => {
      const title = options?.title ?? 'Processing batch';
      // Hub / batch APIs never soft-preempt — even a 1-item batch queues behind a running job.
      if (!(await acquireSharedRun(title, itemIds.length, null, 'bulk'))) {
        return {
          enriched: 0,
          skipped: 0,
          failed: 0,
          classified: 0,
          message: 'Pipeline already running in another window',
        };
      }
      const cancellable = options?.cancellable !== false;
      const controller = new AbortController();
      abortRef.current = controller;

      setIsRunning(true);
      setIsCancellable(cancellable);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Starting…',
        current: 0,
        total: 100,
        cancellable,
      });

      const startedAt = Date.now();
      const classifyOnlyBatch = options?.enrich === false && options?.classify !== false;
      let beforeQueue: HubQueueOutcome['before'] | undefined;
      if (classifyOnlyBatch) {
        beforeQueue = await loadHubQueueSnapshot();
      }
      try {
        const scopedSelection = itemIds.length > 0 && itemIds.length <= 25;
        // Bulk executes offscreen with its own warm cache; SQLite drain is low-priority.
        const { runBatchOnOffscreen } = await import(
          '../../lib/pipeline/offscreenPipelineClient'
        );
        const result = await runBatchOnOffscreen(itemIds, {
          enrich: options?.enrich,
          classify: options?.classify,
          maxEnrich: options?.maxEnrich,
          maxClassify: options?.maxClassify,
          processAll: options?.processAll,
          refetchCompare: options?.refetchCompare,
          forceEnrich: options?.forceEnrich,
          skipAi: options?.skipAi,
          forceReclassify: options?.forceReclassify,
          collectItemResults: options?.collectItemResults,
          skipDiscover:
            options?.skipDiscover ?? (scopedSelection ? true : undefined),
          drainPendingClassifyQueue: options?.drainPendingClassifyQueue,
          useScopedWave: isFullPipelineBatch(options) && itemIds.length > 1,
          signal: controller.signal,
          onProgress: (p) => applyPipelineProgress(setModal, p),
        });

        const yielded = resumeBulkAfterSingleRef.current;
        const cancelled =
          !yielded &&
          (result.enrichCancelled ||
            controller?.signal.aborted ||
            result.classifyError === 'classification cancelled');
        const itemLabels = options?.itemLabels ?? {};
        const batchAction = resolveBatchReportAction(options);
        const reportIds =
          itemIds.length > 0
            ? itemIds
            : (result.itemEnrichResults?.map((r) => r.itemId) ?? []);
        let reportRows: PipelineReportRow[] | undefined;
        let reportRowsTotal: number | undefined;
        if (!cancelled && !yielded && reportIds.length) {
          const enrichRun = options?.enrich !== false;
          if (enrichRun || batchAction === 'batch_full' || batchAction === 'full_digest') {
            // Cap rows — building a report for hundreds of ids walks signal/embed tables hard.
            reportRowsTotal = reportIds.length;
            const sampleIds =
              reportIds.length > CLASSIFY_DONE_REPORT_SAMPLE_CAP
                ? reportIds.slice(0, CLASSIFY_DONE_REPORT_SAMPLE_CAP)
                : reportIds;
            reportRows = await buildEnrichOutcomeReportRows(sampleIds, itemLabels, {
              action: batchAction,
              enrichResults: result.itemEnrichResults?.filter((r) =>
                sampleIds.includes(r.itemId)
              ),
            });
          } else if (batchAction === 'batch_classify' && result.classifySummary) {
            reportRowsTotal = reportIds.length;
            const sampleIds =
              reportIds.length > CLASSIFY_DONE_REPORT_SAMPLE_CAP
                ? reportIds.slice(0, CLASSIFY_DONE_REPORT_SAMPLE_CAP)
                : reportIds;
            reportRows = await buildClassifyOutcomeReportRows(sampleIds, itemLabels);
          }
        }
        const summary = cancelled
          ? 'Cancelled'
          : result.classifySummary && batchAction === 'batch_classify'
            ? formatClassifyDoneModalSummary({
                summary: result.classifySummary,
                selectedCount: itemIds.length > 0 ? itemIds.length : undefined,
                reportRowCount: reportRows?.length,
                reportRowTotal: reportRowsTotal,
              })
            : reportRows?.length
              ? formatBatchDigestDoneSummary({
                  selectedCount: itemIds.length,
                  reportRows,
                  pipelineMessage: result.message,
                  classifySummary: result.classifySummary,
                  reportRowTotal: reportRowsTotal,
                })
              : result.classifySummary
                ? formatClassifyRunSummary(result.classifySummary, itemIds.length || undefined)
                : result.message;
        const tone: SummaryTone = cancelled
          ? 'info'
          : reportRows?.length && result.classifySummary
            ? resolveReportRowsSummaryTone(reportRows, result.classifySummary)
            : resolvePipelineSummaryTone({
                enriched: result.enriched,
                skipped: result.skipped,
                failed: result.failed,
                classified: result.classified,
                classifyError: result.classifyError,
                classifySummary: result.classifySummary,
              });

        const cs = result.classifySummary;
        const afterQueue =
          classifyOnlyBatch && cs && beforeQueue ? await loadHubQueueSnapshot() : undefined;
        const queueOutcome: HubQueueOutcome | undefined =
          classifyOnlyBatch && cs && beforeQueue && afterQueue
            ? {
                action: 'classify_pending',
                before: beforeQueue,
                after: afterQueue,
                itemsRun: itemIds.length > 0 ? itemIds.length : cs.processed,
                batch: {
                  processed: cs.processed,
                  classifiedSpecific: cs.classifiedSpecific,
                  classifiedGeneral: cs.classifiedGeneral,
                  pendingDiscover: cs.pendingDiscover,
                  skippedHash: cs.skippedHash,
                  skippedIneligible: cs.skippedIneligible,
                  skippedManualReview: cs.skippedManualReview,
                  llmErrors: cs.llmErrors,
                  unassigned: cs.unassigned,
                },
              }
            : undefined;

        if (!yielded) {
          setModal({
            open: true,
            phase: 'done',
            title: cancelled ? title : `${title} — complete`,
            summary,
            tone,
            reportRows,
            reportScopeCount: itemIds.length > 0 ? itemIds.length : undefined,
            reportRowsTotal,
            queueOutcome,
          });
        }
        await refreshAfterPipeline(onRefresh, { itemIds });

        if (result.pipelineDebugSavedTo && itemIds.length > 0 && !cancelled && !yielded) {
          setModal((prev) =>
            prev.open && prev.phase === 'done'
              ? { ...prev, analysisSavedTo: result.pipelineDebugSavedTo }
              : prev
          );
          void buildPipelineRunExport({
            itemIds,
            startedAt,
            finishedAt: Date.now(),
            action: batchAction,
            batch: result,
            enrichResults: result.itemEnrichResults,
            reportRows,
            itemLabels: options?.itemLabels,
            includeClassify: options?.classify !== false,
            cancelled,
          })
            .then((analysisExport) => {
              setModal((prev) =>
                prev.open && prev.phase === 'done' ? { ...prev, analysisExport } : prev
              );
            })
            .catch((e) => console.warn('[pipeline] run export for download failed:', e));
        }

        return result;
      } catch (e) {
        if (controller?.signal.aborted) {
          // Soft-yield for a user single — don't flash a Cancelled modal over the digest.
          if (!resumeBulkAfterSingleRef.current) {
            setModal({
              open: true,
              phase: 'done',
              title,
              summary: 'Cancelled',
              tone: 'info',
            });
          }
          return {
            enriched: 0,
            skipped: 0,
            failed: 0,
            classified: 0,
            enrichCancelled: true,
            message: resumeBulkAfterSingleRef.current
              ? 'Paused for single digest'
              : 'Cancelled',
          };
        }
        const summary = e instanceof Error ? e.message : 'Batch processing failed';
        setModal({
          open: true,
          phase: 'done',
          title,
          summary,
          tone: 'error',
        });
        throw e;
      } finally {
        endPipelineRun();
      }
    },
    [acquireSharedRun, endPipelineRun, onRefresh]
  );

  const runSingle = useCallback(
    async (
      itemId: string,
      options?: RunSingleWithProgressOptions
    ): Promise<SingleLinkDigestResult> => {
      const title = options?.title ?? 'Running digest';
      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);
      setIsCancellable(true);
      userCancelRef.current = false;
      suppressPipelineUiRef.current = false;
      // The offscreen coordinator serializes this with every other pipeline job.
      parallelSingleRef.current = true;
      setModalState({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Starting…',
        current: 0,
        total: 100,
        cancellable: true,
      });

      const singleSetModal: React.Dispatch<React.SetStateAction<ModalState>> = (update) => {
        if (suppressPipelineUiRef.current) return;
        setModalState(update);
      };

      try {
        const { runSingleOnOffscreen } = await import(
          '../../lib/pipeline/offscreenPipelineClient'
        );
        const result = await runSingleOnOffscreen(itemId, {
          forceEnrich: options?.forceEnrich,
          skipClassify: options?.skipClassify,
          skipAi: options?.skipAi,
          forceReclassify: options?.forceReclassify,
          tabSessionOnly: options?.tabSessionOnly,
          preferTabSession: options?.preferTabSession,
          tabId: options?.tabId,
          signal: controller.signal,
          onProgress: (p) => applyPipelineProgress(singleSetModal, p),
        });

        const reportAction =
          options?.skipAi || options?.skipClassify ? 'fetch' : 'full_digest';
        const reportRows = await buildEnrichOutcomeReportRows(
          [itemId],
          { [itemId]: options?.itemLabel ?? itemId },
          { action: reportAction, enrichResults: [result.enrich] }
        );
        const tone: SummaryTone = resolveReportRowsSummaryTone(reportRows);
        setModalState({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary: formatPipelineReportSummaryFromRows(reportRows) || result.message,
          tone,
          reportRows,
        });
        await refreshAfterPipeline(onRefresh, { itemIds: [itemId] });
        return result;
      } catch (e) {
        const cancelled = controller.signal.aborted;
        const summary = cancelled ? 'Cancelled' : e instanceof Error ? e.message : 'Digest failed';
        setModalState({
          open: true,
          phase: 'done',
          title,
          summary,
          tone: cancelled ? 'info' : 'error',
        });
        throw e;
      } finally {
        parallelSingleRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        setIsRunning(false);
        setIsCancellable(false);
        userCancelRef.current = false;
        suppressPipelineUiRef.current = false;
      }
    },
    [onRefresh]
  );

  const runReextract = useCallback(
    async (
      itemId: string,
      options?: { title?: string; itemLabel?: string; force?: boolean }
    ) => {
      const title =
        options?.title ?? (options?.force ? 'Run AI anyway' : 'Re-run AI');
      if (!(await acquireSharedRun(title, 1, null, 'single'))) {
        throw new Error('Pipeline already running in another window');
      }

      setIsRunning(true);
      setIsCancellable(false);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Extracting summary…',
        current: 0,
        total: 100,
        cancellable: false,
      });

      try {
        const result = await reextractAI(itemId, { force: options?.force });
        const reportRows = await buildEnrichOutcomeReportRows(
          [itemId],
          { [itemId]: options?.itemLabel ?? itemId },
          { action: 'ai_extract', enrichResults: [result] }
        );
        const tone: SummaryTone = resolveReportRowsSummaryTone(reportRows);
        setModal({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary: formatPipelineReportSummaryFromRows(reportRows),
          tone,
          reportRows,
        });
        await refreshAfterPipeline(onRefresh, { itemIds: [itemId] });
        return result;
      } catch (e) {
        const summary = e instanceof Error ? e.message : 'Re-run AI failed';
        setModal({
          open: true,
          phase: 'done',
          title,
          summary,
          tone: 'error',
        });
        throw e;
      } finally {
        endPipelineRun();
      }
    },
    [acquireSharedRun, endPipelineRun, onRefresh]
  );

  const runReextractBatch = useCallback(
    async (
      itemIds: string[],
      options?: { title?: string; itemLabels?: Record<string, string>; force?: boolean }
    ): Promise<EnrichmentResult[]> => {
      const uniqueIds = [...new Set(itemIds.filter(Boolean))];
      const title =
        options?.title ??
        (options?.force
          ? `Run AI anyway (${uniqueIds.length})`
          : `Re-run AI (${uniqueIds.length})`);
      const itemLabels = options?.itemLabels ?? {};
      if (!(await acquireSharedRun(title, uniqueIds.length, null, 'bulk'))) {
        return [];
      }

      setIsRunning(true);
      setIsCancellable(false);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Starting…',
        current: 0,
        total: 100,
        cancellable: false,
      });

      const results: EnrichmentResult[] = [];
      try {
        for (let i = 0; i < uniqueIds.length; i++) {
          const itemId = uniqueIds[i];
          setRunningProgress(
            setModal,
            `Re-running AI ${i + 1}/${uniqueIds.length}…`,
            uniqueIds.length > 0 ? i / uniqueIds.length : 0
          );
          results.push(await reextractAI(itemId, { force: options?.force }));
        }
        setRunningProgress(setModal, 'Re-running AI complete', 1);

        const reportRows = await buildEnrichOutcomeReportRows(uniqueIds, itemLabels, {
          action: 'ai_extract',
          enrichResults: results,
        });
        const tone: SummaryTone = resolveReportRowsSummaryTone(reportRows);
        setModal({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary: formatPipelineReportSummaryFromRows(reportRows),
          tone,
          reportRows,
        });
        await refreshAfterPipeline(onRefresh, { itemIds: uniqueIds });
        return results;
      } catch (e) {
        const summary = e instanceof Error ? e.message : 'Re-run AI failed';
        setModal({
          open: true,
          phase: 'done',
          title,
          summary,
          tone: 'error',
        });
        throw e;
      } finally {
        endPipelineRun();
      }
    },
    [acquireSharedRun, endPipelineRun, onRefresh]
  );

  const runEmbedBatch = useCallback(
    async (
      itemIds: string[],
      options?: { title?: string }
    ): Promise<{ embedded: number; skipped: number; failed: number }> => {
      const uniqueIds = [...new Set(itemIds.filter(Boolean))];
      const title = options?.title ?? `Re-embed (${uniqueIds.length})`;
      if (!(await acquireSharedRun(title, uniqueIds.length, null, 'bulk'))) {
        return { embedded: 0, skipped: 0, failed: 0 };
      }

      setIsRunning(true);
      setIsCancellable(false);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Embedding search vectors…',
        current: 0,
        total: 100,
        cancellable: false,
      });

      try {
        const summary = await embedIncrementalBatch({
          itemIds: uniqueIds,
          onProgress: (p) => {
            setRunningProgress(
              setModal,
              p.phase === 'prepare'
                ? 'Preparing embed batch…'
                : `Embedding batch ${p.batchIndex}/${p.batchTotal}…`,
              uniqueIds.length > 0 ? p.embeddedSoFar / uniqueIds.length : 0
            );
          },
        });

        const embedded = summary.embedded;
        const skipped =
          summary.skippedHash + summary.skippedIneligible + summary.skippedNoKey;
        const failed = summary.embedFailed;
        const parts: string[] = [];
        if (embedded > 0) parts.push(`${embedded} embedded`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        if (failed > 0) parts.push(`${failed} failed`);
        const summaryText = parts.length ? parts.join(' · ') : 'No changes';

        setModal({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary: summaryText,
          tone: failed > 0 ? 'error' : embedded > 0 ? 'success' : 'info',
        });
        await refreshAfterPipeline(onRefresh, { itemIds: uniqueIds });
        return { embedded, skipped, failed };
      } catch (e) {
        const summary = e instanceof Error ? e.message : 'Re-embed failed';
        setModal({
          open: true,
          phase: 'done',
          title,
          summary,
          tone: 'error',
        });
        throw e;
      } finally {
        endPipelineRun();
      }
    },
    [acquireSharedRun, endPipelineRun, onRefresh]
  );

  const runDiscover = useCallback(
    async (options?: RunDiscoverOptions): Promise<RunDiscoverResult> => {
      const andClassify = options?.andClassify === true;
      const title =
        options?.title ??
        (andClassify ? 'Discover + classify' : 'Discover taxonomy gap-fill');

      if (!(await acquireSharedRun(title, 0, null, 'bulk'))) {
        throw new Error('Pipeline already running in another window');
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setIsRunning(true);
      setIsCancellable(true);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Preparing discover…',
        current: 0,
        total: 100,
        cancellable: true,
      });

      let classifyStarted = false;
      let discoverTick = 0;
      let classifyTick = 0;
      const onProgress = (u: ClassifyProgressUpdate) => {
        const boundedStep = u.total > 0 ? Math.max(0, Math.min(1, u.current / u.total)) : 0;

        if (!classifyStarted) {
          let ratio = 0;
          if (u.phase === 'prepare') ratio = andClassify ? 0.05 : 0.08;
          else if (u.phase === 'discover') {
            discoverTick += 1;
            const discoverStep =
              u.total > 1 ? boundedStep : Math.min(0.98, discoverTick / 8);
            ratio = andClassify
              ? 0.1 + discoverStep * 0.55
              : 0.1 + discoverStep * 0.82;
          } else if (u.phase === 'save') ratio = andClassify ? 0.68 : 0.96;
          else if (u.phase === 'done') ratio = andClassify ? 0.7 : 1;
          setRunningProgress(setModal, u.label, ratio);
          return;
        }

        let ratio = 0.72;
        if (u.phase === 'prepare') ratio = 0.74;
        else if (u.phase === 'classify') {
          classifyTick += 1;
          const classifyStep =
            u.total > 1 ? boundedStep : Math.min(0.98, classifyTick / 8);
          ratio = 0.76 + classifyStep * 0.18;
        } else if (u.phase === 'discover') ratio = 0.95;
        else if (u.phase === 'save') ratio = 0.98;
        else if (u.phase === 'done') ratio = 1;
        setRunningProgress(setModal, u.label, ratio);
      };

      try {
        const beforeQueue = await loadHubQueueSnapshot();

        const discover = await discoverBatch({
          itemIds: options?.itemIds,
          stuckOnly: options?.stuckOnly !== false,
          maxBatches: options?.maxBatches,
          sampleBatchSize: APP_DISCOVER_MAP_BATCH_SIZE,
          enforceBulkRunCap: false,
          onProgress,
          signal: controller.signal,
        });

        const s = discover.summary;
        let classifySummary: RunDiscoverResult['classifySummary'];
        let summaryParts: string[] = [];

        if (discover.newParents || discover.newLeaves) {
          summaryParts.push(
            `+${discover.newParents} parents · +${discover.newLeaves} topics · ${s?.itemsSampled ?? discover.itemsSampled} processed`
          );
        } else {
          summaryParts.push(
            `${discover.itemsSampled} processed`
          );
          if (discover.llmErrors) summaryParts.push(`${discover.llmErrors} LLM error(s)`);
          else if ((s?.stuckPool ?? 0) < 3 && !options?.itemIds?.length) summaryParts.push('need ≥3 items');
          else summaryParts.push('0 new topics proposed');
        }

        const reclassifyIds = discover.reclassifyItemIds ?? [];
        const sampledIds = discover.sampledItemIds ?? [];
        const classifyIds =
          andClassify && sampledIds.length > 0
            ? sampledIds
            : andClassify && reclassifyIds.length > 0
              ? reclassifyIds
              : [];

        if (andClassify && classifyIds.length > 0) {
          classifyStarted = true;
          setRunningProgress(
            setModal,
            `Classifying ${classifyIds.length} queued bookmark(s)…`,
            0.7
          );
          const classifyResult = await classifyIncremental({
            itemIds: classifyIds,
            maxItems: classifyIds.length,
            forceReclassify: options?.forceReclassify,
            autoDiscover: false,
            onProgress,
            signal: controller.signal,
          });
          classifySummary = classifyResult.summary;
          summaryParts.push(formatClassifyRunSummary(classifyResult.summary, classifyIds.length));
        } else if (andClassify) {
          summaryParts.push('Classify skipped — no sampled bookmarks needed reclassify');
        }

        const afterQueue = await loadHubQueueSnapshot();
        let reportRows: PipelineReportRow[] | undefined;
        if (andClassify && classifyIds.length > 0) {
          reportRows = await buildClassifyOutcomeReportRows(classifyIds, {});
        }

        const queueOutcome: HubQueueOutcome = {
          action: andClassify ? 'discover_classify' : 'discover',
          before: beforeQueue,
          after: afterQueue,
          itemsRun: discover.itemsSampled,
          discover: {
            newLeaves: discover.newLeaves,
            newParents: discover.newParents,
            itemsSampled: discover.itemsSampled,
            itemsMarkedForReclassify: s?.itemsMarkedForReclassify ?? 0,
          },
          batch: classifySummary
            ? {
                processed: classifySummary.processed,
                classifiedSpecific: classifySummary.classifiedSpecific,
                classifiedGeneral: classifySummary.classifiedGeneral,
                pendingDiscover: classifySummary.pendingDiscover,
                skippedHash: classifySummary.skippedHash,
                skippedIneligible: classifySummary.skippedIneligible,
                skippedManualReview: classifySummary.skippedManualReview,
                llmErrors: classifySummary.llmErrors,
                unassigned: classifySummary.unassigned,
              }
            : undefined,
        };

        const tone: SummaryTone =
          discover.llmErrors && !discover.newLeaves
            ? 'error'
            : discover.newLeaves > 0 || (classifySummary?.classifiedSpecific ?? 0) > 0
              ? 'success'
              : 'info';

        setModal({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary: summaryParts.join(' · '),
          tone,
          reportRows,
          queueOutcome,
        });
        await refreshAfterPipeline(
          onRefresh,
          options?.itemIds?.length ? { itemIds: options.itemIds } : undefined
        );
        return { discover, classifySummary };
      } catch (e) {
        const cancelled = controller.signal.aborted || (e instanceof Error && e.message === 'Cancelled');
        const summary = cancelled
          ? 'Cancelled — partial progress may have been saved.'
          : e instanceof Error
            ? e.message
            : 'Discover failed';
        setModal({
          open: true,
          phase: 'done',
          title: cancelled ? `${title} — cancelled` : title,
          summary,
          tone: cancelled ? 'info' : 'error',
        });
        if (!cancelled) throw e;
        return {
          discover: {
            newParents: 0,
            newLeaves: 0,
            itemsSampled: 0,
            discoverBatches: 0,
            proposedParents: 0,
            proposedLeaves: 0,
            llmErrors: 0,
            taxonomyLeafCount: 0,
            taxonomyVersion: 0,
            shouldReclassify: false,
            sampledItemIds: [],
            reclassifyItemIds: [],
            summary: {
              totalConsidered: 0,
              eligiblePool: 0,
              stuckPool: 0,
              skippedIneligible: 0,
              skippedNotStuck: 0,
              skippedManualReview: 0,
              skippedTooShort: 0,
              itemsSampled: 0,
              discoverBatches: 0,
              newParents: 0,
              newLeaves: 0,
              proposedParentsRaw: 0,
              proposedLeavesRaw: 0,
              duplicateLeavesSkipped: 0,
              llmErrors: 0,
              itemsMarkedForReclassify: 0,
              failureBuckets: {},
              stuckKindBreakdown: { pending_discover: 0, general: 0, unassigned: 0, manual_review: 0 },
            },
          },
        };
      } finally {
        endPipelineRun();
      }
    },
    [acquireSharedRun, endPipelineRun, onRefresh]
  );

  const runClassify = useCallback(
    async (options?: RunClassifyOptions) => {
      const title = options?.title ?? 'Classify';
      let itemIds = options?.itemIds;
      if (!options?.retryManualReview && !itemIds?.length) {
        itemIds = await loadItemIdsForPipelineQueue('pending_classify');
      }
      const maxItems =
        options?.maxItems ??
        (itemIds?.length ? itemIds.length : 200);

      if (!(await acquireSharedRun(title, itemIds?.length ?? 0, null, 'bulk'))) {
        throw new Error('Pipeline already running in another window');
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setIsRunning(true);
      setIsCancellable(true);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: itemIds?.length
          ? `Preparing classify for ${Math.min(itemIds.length, maxItems)} bookmark(s)…`
          : 'Preparing classify…',
        current: 0,
        total: 100,
        cancellable: true,
      });

      try {
        const beforeQueue = await loadHubQueueSnapshot();
        const itemsRun = options?.itemIds?.length
          ? Math.min(options.itemIds.length, maxItems)
          : maxItems;

        const ids = itemIds ?? [];
        const result = await runItemPipeline({
          itemIds: ids,
          enrich: false,
          classify: true,
          maxClassify: maxItems,
          processAll: Boolean(ids.length),
          forceClassify: options?.forceReclassify !== false,
          retryManualReview: options?.retryManualReview,
          pipelineRunAction: 'batch_classify',
          // v3 post-classify discover for multi-item runs; single bookmark uses classify + link-quality only.
          skipDiscover: ids.length === 1,
          signal: controller.signal,
          onProgress: (p) => applyPipelineProgress(setModal, p),
        });

        if (result.pipelineDebugSavedTo) {
          setModal((prev) =>
            prev.open && prev.phase === 'done'
              ? { ...prev, analysisSavedTo: result.pipelineDebugSavedTo }
              : prev
          );
        }

        const s = result.classifySummary ?? emptyTopicClassifySummary();
        let summary = '';
        let reportRows: PipelineReportRow[] | undefined;
        let reportRowsTotal: number | undefined;

        const reportIds = options?.itemIds?.slice(0, maxItems);
        const wantReport =
          reportIds?.length &&
          (options?.itemReport !== false ||
            (options?.retryManualReview && options?.manualRetryReport !== false));

        if (wantReport && reportIds) {
          reportRowsTotal = reportIds.length;
          const sampleIds =
            reportIds.length > CLASSIFY_DONE_REPORT_SAMPLE_CAP
              ? reportIds.slice(0, CLASSIFY_DONE_REPORT_SAMPLE_CAP)
              : reportIds;
          reportRows = await buildClassifyOutcomeReportRows(
            sampleIds,
            options?.itemLabels ?? {}
          );
          summary = formatClassifyDoneModalSummary({
            summary: s,
            selectedCount: itemsRun,
            reportRowCount: reportRows.length,
            reportRowTotal: reportRowsTotal,
          });
        } else {
          summary = formatClassifyRunSummary(s, itemsRun);
        }

        const afterQueue = await loadHubQueueSnapshot();
        const queueOutcome: HubQueueOutcome = {
          action: options?.retryManualReview ? 'retry_manual' : 'classify_pending',
          before: beforeQueue,
          after: afterQueue,
          itemsRun: reportIds?.length ?? s.processed,
          batch: {
            processed: s.processed,
            classifiedSpecific: s.classifiedSpecific,
            classifiedGeneral: s.classifiedGeneral,
            pendingDiscover: s.pendingDiscover,
            skippedHash: s.skippedHash,
            skippedIneligible: s.skippedIneligible,
            skippedManualReview: s.skippedManualReview,
            llmErrors: s.llmErrors,
            unassigned: s.unassigned,
          },
        };

        const tone: SummaryTone = reportRows?.length
          ? resolveReportRowsSummaryTone(reportRows, s)
          : resolveClassifyDoneModalTone(s);

        setModal({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary,
          tone,
          reportRows,
          reportScopeCount: reportIds?.length,
          reportRowsTotal,
          queueOutcome,
        });
        await refreshAfterPipeline(
          onRefresh,
          options?.itemIds?.length ? { itemIds: options.itemIds.slice(0, maxItems) } : undefined
        );
        return { summary: s, categories: [] as import('../../lib/categorization/types').AiCategory[] };
      } catch (e) {
        const cancelled = controller.signal.aborted || (e instanceof Error && e.message === 'Cancelled');
        const summary = cancelled
          ? 'Cancelled — partial progress may have been saved.'
          : e instanceof Error
            ? e.message
            : 'Classify failed';
        setModal({
          open: true,
          phase: 'done',
          title: cancelled ? `${title} — cancelled` : title,
          summary,
          tone: cancelled ? 'info' : 'error',
        });
        if (!cancelled) throw e;
        return { summary: emptyTopicClassifySummary(), categories: [] };
      } finally {
        endPipelineRun();
      }
    },
    [acquireSharedRun, endPipelineRun, onRefresh]
  );

  const runResumePipelineJob = useCallback(
    async (options?: { onFinished?: () => void | Promise<void> }) => {
      const {
        readImportPipelineJob,
        preflightImportPipelineStart,
        formatPipelineDurationMs,
        IMPORT_WAVE_PIPELINE_ENABLED,
      } = await import('../../lib/pipeline/importPipelineJob');

      if (!IMPORT_WAVE_PIPELINE_ENABLED) {
        setModal({
          open: true,
          phase: 'done',
          title: 'Resume pipeline',
          summary: 'Wave pipeline is not enabled in this build.',
          tone: 'error',
        });
        return;
      }

      const pre = await preflightImportPipelineStart();
      if (!pre.ok) {
        setModal({
          open: true,
          phase: 'done',
          title: 'Resume pipeline',
          summary: pre.reason ?? 'Cannot start import pipeline.',
          tone: 'error',
        });
        return;
      }

      const job = await readImportPipelineJob();
      if (!job) {
        setModal({
          open: true,
          phase: 'done',
          title: 'Resume pipeline',
          summary: 'No pipeline job found. Start a bulk digest from Hub or Import Studio.',
          tone: 'error',
        });
        return;
      }

      if (job.status === 'completed') {
        setModal({
          open: true,
          phase: 'done',
          title: 'Resume pipeline',
          summary: 'This pipeline job is already complete. Dismiss the banner to clear it.',
          tone: 'info',
        });
        await options?.onFinished?.();
        return;
      }

      const remaining = Math.max(0, job.itemIds.length - job.completedItemIds.length);
      const resumeTitle = `Resuming pipeline (${job.itemIds.length.toLocaleString()} links)`;
      if (!(await acquireSharedRun(resumeTitle, job.itemIds.length, job.importRunId, 'bulk'))) {
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);
      setIsCancellable(true);
      setModal({
        open: true,
        phase: 'running',
        title: resumeTitle,
        progressLabel:
          remaining > 0
            ? `Resuming — ${remaining.toLocaleString()} remaining…`
            : 'Resuming pipeline…',
        current: 0,
        total: 100,
        cancellable: true,
      });

      try {
        const { runScopedPipelineJob } = await import(
          '../../lib/pipeline/scopedPipelineJobRunner'
        );
        const { job: result } = await runScopedPipelineJob(job, {
          signal: controller.signal,
          onProgress: (p) =>
            applyPipelineProgress(
              setModal,
              scopedProgressToItemProgress(p, job.itemIds.length)
            ),
        });

        const yielded =
          resumeBulkAfterSingleRef.current ||
          result.lastError === 'Paused for single digest';
        const cancelled =
          !yielded &&
          (result.lastError === 'Cancelled' || controller.signal.aborted);
        const dur = formatPipelineDurationMs(result.durationMs);
        const durSuffix = dur ? ` in ${dur}` : '';
        const doneCount = result.completedItemIds.length;
        const totalCount = result.itemIds.length;
        const fullyDone =
          result.status === 'completed' ||
          (doneCount >= totalCount && totalCount > 0);

        let summary: string;
        let tone: SummaryTone;
        if (fullyDone) {
          summary = `Pipeline complete — ${doneCount.toLocaleString()} of ${totalCount.toLocaleString()} processed${durSuffix}.`;
          tone = 'success';
        } else if (cancelled) {
          summary = `Cancelled — ${doneCount.toLocaleString()} of ${totalCount.toLocaleString()} processed${durSuffix}.`;
          tone = 'info';
        } else if (result.lastError) {
          summary = `Paused: ${result.lastError} — ${doneCount.toLocaleString()} of ${totalCount.toLocaleString()} processed${durSuffix}.`;
          tone = 'error';
        } else {
          summary = `Paused — ${doneCount.toLocaleString()} of ${totalCount.toLocaleString()} processed${durSuffix}.`;
          tone = 'info';
        }

        // Soft-yield for a user single — keep modal for the digest; job file stays paused.
        if (!yielded) {
          setModal({
            open: true,
            phase: 'done',
            title: fullyDone
              ? 'Pipeline complete'
              : cancelled
                ? 'Pipeline cancelled'
                : 'Pipeline paused',
            summary,
            tone,
          });
        }

        if (fullyDone) {
          try {
            const { clearImportPipelineJob } = await import(
              '../../lib/pipeline/importPipelineJob'
            );
            await clearImportPipelineJob();
          } catch {
            /* ignore */
          }
        }

        await refreshAfterPipeline(onRefresh, {
          itemIds: result.completedItemIds.slice(-50),
        });
        await options?.onFinished?.();
      } catch (e) {
        const summary = e instanceof Error ? e.message : 'Resume failed';
        setModal({
          open: true,
          phase: 'done',
          title: 'Resume pipeline',
          summary,
          tone: 'error',
        });
        await options?.onFinished?.();
      } finally {
        endPipelineRun();
      }
    },
    [acquireSharedRun, endPipelineRun, onRefresh]
  );

  // After a priority single soft-preempts a bulk wave job, resume it automatically.
  useEffect(() => {
    autoResumeBulkRef.current = () => {
      void runResumePipelineJob();
    };
  }, [runResumePipelineJob]);

  return (
    <PipelineProgressContext.Provider
      value={{
        isRunning: pipelineBusy,
        isLocalRunning: isRunning,
        queuedCount,
        isCancellable: isCancellable || remoteAnyHeld,
        cancel,
        runBatch,
        runSingle,
        runReextract,
        runReextractBatch,
        runEmbedBatch,
        runDiscover,
        runClassify,
        runResumePipelineJob,
        closeModal,
      }}
    >
      {children}
      {modal.open ? (
        <PipelineProgressModal
          modal={modal}
          onCancel={cancel}
          onClose={closeModal}
        />
      ) : null}
    </PipelineProgressContext.Provider>
  );
};

function PipelineProgressModal({
  modal,
  onCancel,
  onClose,
}: {
  modal: Extract<ModalState, { open: true }>;
  onCancel: () => void;
  onClose: () => void;
}) {
  const running = modal.phase === 'running';
  const pct =
    running && modal.total > 0
      ? Math.min(100, Math.round((modal.current / modal.total) * 100))
      : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pipeline-progress-title"
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
      onClick={running ? undefined : onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth:
            modal.phase === 'done' && (modal.reportRows?.length || modal.queueOutcome)
              ? 580
              : 420,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-panel)',
          color: 'var(--text)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          padding: '20px 22px',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
            flexShrink: 0,
          }}
        >
          <h2
            id="pipeline-progress-title"
            style={{
              margin: 0,
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              lineHeight: 1.35,
            }}
          >
            {modal.title}
          </h2>
          {!running ? (
            <button
              type="button"
              onClick={onClose}
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
          ) : null}
        </div>

        {running ? (
          <>
            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              {modal.progressLabel}
            </div>
            {modal.total > 0 ? (
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--bg-glass)',
                  overflow: 'hidden',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: 'var(--accent)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            ) : null}
            {modal.cancellable ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    padding: '6px 12px',
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
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ overflowY: 'auto', paddingRight: 4 }}>
            {modal.summary ? (
              <p
                style={{
                  margin: modal.queueOutcome || modal.reportRows?.length ? '0 0 14px' : '0 0 16px',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.55,
                  fontWeight: modal.queueOutcome || modal.reportRows?.length ? 600 : 400,
                  color:
                    modal.tone === 'error'
                      ? 'var(--danger)'
                      : modal.tone === 'info'
                        ? 'var(--text-muted)'
                        : 'var(--text)',
                }}
              >
                {modal.summary}
              </p>
            ) : null}
            {modal.queueOutcome ? <QueueOutcomePanel outcome={modal.queueOutcome} /> : null}
            {modal.reportRows?.length ? (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--text-faint)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {modal.reportRowsTotal != null &&
                  modal.reportRowsTotal > modal.reportRows.length
                    ? `Sample — per bookmark (${modal.reportRows.length} of ${modal.reportRowsTotal})`
                    : `This batch — per bookmark${
                        modal.reportScopeCount != null
                          ? ` (${modal.reportScopeCount} selected)`
                          : ''
                      }`}
                </div>
                <PipelineBatchReportPanel
                  rows={modal.reportRows}
                  scopeLabel={
                    modal.reportRowsTotal != null &&
                    modal.reportRowsTotal > modal.reportRows.length
                      ? `Sample of ${modal.reportRows.length} bookmark${modal.reportRows.length === 1 ? '' : 's'} from this run — run totals above reflect the full batch.`
                      : modal.reportScopeCount != null
                        ? `Outcomes for your ${modal.reportScopeCount} selected bookmark${modal.reportScopeCount === 1 ? '' : 's'} (same labels as the hub table).`
                        : undefined
                  }
                />
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {modal.analysisExport ? (
                <button
                  type="button"
                  onClick={() => downloadPipelineRunBundle(modal.analysisExport!)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Download analysis JSON
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
            {modal.analysisSavedTo ? (
              <p
                style={{
                  margin: '10px 0 0',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  lineHeight: 1.45,
                }}
              >
                Analysis saved to{' '}
                <code style={{ fontSize: '0.95em' }}>{modal.analysisSavedTo}/</code> in your backup
                folder (<code>results.jsonl</code>, <code>summary.json</code>, <code>analysis.md</code>).
              </p>
            ) : modal.analysisExport ? (
              <p
                style={{
                  margin: '10px 0 0',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  lineHeight: 1.45,
                }}
              >
                Configure a backup folder to auto-save run artifacts under{' '}
                <code>pipeline-runs/</code>.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
