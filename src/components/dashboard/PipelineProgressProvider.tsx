import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import {
  formatItemPipelineProgress,
  pipelineProgressBar,
  loadItemIdsForPipelineQueue,
  type BatchDigestResult,
  type SingleLinkDigestResult,
  type ItemPipelineProgress,
} from '../../lib/pipeline';
import type { EnrichmentResult } from '../../lib/enrichment';
import type { DiscoverBatchResult, TopicClassifySummary } from '../../lib/categorization';
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
  discover: DiscoverBatchResult;
  classifySummary?: TopicClassifySummary;
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
  runClassify: (options?: RunClassifyOptions) => Promise<{
    summary: TopicClassifySummary;
    categories: import('../../lib/categorization/types').AiCategory[];
  }>;
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
  const abortRef = useRef<AbortController | null>(null);
  const setModal = setModalState;
  const beginLocalRun = useCallback(() => {
    if (abortRef.current) {
      throw new Error('This dashboard is already observing a pipeline job');
    }
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }, []);

  const closeModal = useCallback(() => {
    setModalState((prev) => {
      if (!prev.open) return prev;
      if (prev.phase === 'running') return prev;
      return { open: false };
    });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort('user-cancelled');
    setIsCancellable(false);
    setModalState((current) =>
      current.open && current.phase === 'running'
        ? { ...current, progressLabel: 'Cancelling…', cancellable: false }
        : current
    );
  }, []);

  const runBatch = useCallback(
    async (
      itemIds: string[],
      options?: RunBatchWithProgressOptions
    ): Promise<BatchDigestResult> => {
      const title = options?.title ?? 'Processing batch';
      const cancellable = options?.cancellable !== false;
      const controller = beginLocalRun();

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
          signal: controller.signal,
          onProgress: (p) => applyPipelineProgress(setModal, p),
        });

        const yielded = false;
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

        return result;
      } catch (e) {
        if (controller?.signal.aborted) {
          // Soft-yield for a user single — don't flash a Cancelled modal over the digest.
          setModal({
            open: true,
            phase: 'done',
            title,
            summary: 'Cancelled',
            tone: 'info',
          });
          return {
            enriched: 0,
            skipped: 0,
            failed: 0,
            classified: 0,
            enrichCancelled: true,
            message: 'Cancelled',
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
        if (abortRef.current === controller) abortRef.current = null;
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [beginLocalRun, onRefresh]
  );

  const runSingle = useCallback(
    async (
      itemId: string,
      options?: RunSingleWithProgressOptions
    ): Promise<SingleLinkDigestResult> => {
      const title = options?.title ?? 'Running digest';
      const controller = beginLocalRun();
      setIsRunning(true);
      setIsCancellable(true);
      setModalState({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Starting…',
        current: 0,
        total: 100,
        cancellable: true,
      });

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
          onProgress: (p) => applyPipelineProgress(setModal, p),
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
        if (abortRef.current === controller) abortRef.current = null;
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [beginLocalRun, onRefresh]
  );

  const runReextract = useCallback(
    async (
      itemId: string,
      options?: { title?: string; itemLabel?: string; force?: boolean }
    ) => {
      const title =
        options?.title ?? (options?.force ? 'Run AI anyway' : 'Re-run AI');
      const controller = beginLocalRun();
      setIsRunning(true);
      setIsCancellable(true);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Extracting summary…',
        current: 0,
        total: 100,
        cancellable: true,
      });

      try {
        const { runPipelineActionOnOffscreen } = await import('../../lib/pipeline/offscreenPipelineClient');
        const batch = await runPipelineActionOnOffscreen('reextract', [itemId], {
          forceReextract: options?.force,
          forceReclassify: true,
          signal: controller.signal,
          onProgress: (progress) => applyPipelineProgress(setModal, progress),
        });
        const result = batch.itemEnrichResults?.[0] ?? {
          itemId,
          status: batch.failed > 0 ? 'failed' as const : 'none' as const,
        };
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
        if (abortRef.current === controller) abortRef.current = null;
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [beginLocalRun, onRefresh]
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
      const controller = beginLocalRun();
      setIsRunning(true);
      setIsCancellable(true);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Starting…',
        current: 0,
        total: 100,
        cancellable: true,
      });

      try {
        const { runPipelineActionOnOffscreen } = await import('../../lib/pipeline/offscreenPipelineClient');
        const batch = await runPipelineActionOnOffscreen('reextract', uniqueIds, {
          forceReextract: options?.force,
          forceReclassify: true,
          signal: controller.signal,
          onProgress: (progress) => applyPipelineProgress(setModal, progress),
        });
        const results = batch.itemEnrichResults ?? [];

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
        if (abortRef.current === controller) abortRef.current = null;
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [beginLocalRun, onRefresh]
  );

  const runEmbedBatch = useCallback(
    async (
      itemIds: string[],
      options?: { title?: string }
    ): Promise<{ embedded: number; skipped: number; failed: number }> => {
      const uniqueIds = [...new Set(itemIds.filter(Boolean))];
      const title = options?.title ?? `Re-embed (${uniqueIds.length})`;
      const controller = beginLocalRun();
      setIsRunning(true);
      setIsCancellable(true);
      setModal({
        open: true,
        phase: 'running',
        title,
        progressLabel: 'Embedding search vectors…',
        current: 0,
        total: 100,
        cancellable: true,
      });

      try {
        const { runPipelineActionOnOffscreen } = await import('../../lib/pipeline/offscreenPipelineClient');
        const batch = await runPipelineActionOnOffscreen('reembed', uniqueIds, {
          signal: controller.signal,
          onProgress: (progress) => applyPipelineProgress(setModal, progress),
        });

        const embedded = batch.embedded ?? 0;
        const failed = batch.embedFailed ?? 0;
        const skipped = Math.max(0, uniqueIds.length - embedded - failed);
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
        if (abortRef.current === controller) abortRef.current = null;
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [beginLocalRun, onRefresh]
  );

  const runDiscover = useCallback(
    async (options?: RunDiscoverOptions): Promise<RunDiscoverResult> => {
      const andClassify = options?.andClassify === true;
      const title =
        options?.title ??
        (andClassify ? 'Discover + classify' : 'Discover taxonomy gap-fill');
      const controller = beginLocalRun();
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

      try {
        const beforeQueue = await loadHubQueueSnapshot();
        const { runPipelineActionOnOffscreen } = await import('../../lib/pipeline/offscreenPipelineClient');
        const discovered = await runPipelineActionOnOffscreen('discover', options?.itemIds ?? [], {
          discoverStuckOnly: options?.stuckOnly !== false,
          discoverMaxBatches: options?.maxBatches,
          signal: controller.signal,
          onProgress: (progress) => applyPipelineProgress(setModal, progress),
        });
        const discover = discovered.discoverResult;
        if (!discover) throw new Error('Taxonomy discovery completed without a result');

        const s = discover.summary;
        let classifySummary: RunDiscoverResult['classifySummary'];
        const summaryParts: string[] = [];

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
          setRunningProgress(
            setModal,
            `Classifying ${classifyIds.length} queued bookmark(s)…`,
            0.7
          );
          const classifyResult = await runPipelineActionOnOffscreen('classify', classifyIds, {
            classify: true,
            forceReclassify: options?.forceReclassify,
            signal: controller.signal,
            onProgress: (progress) => applyPipelineProgress(setModal, progress),
          });
          classifySummary = classifyResult.classifySummary;
          if (classifySummary) {
            summaryParts.push(formatClassifyRunSummary(classifySummary, classifyIds.length));
          }
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
        if (abortRef.current === controller) abortRef.current = null;
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [beginLocalRun, onRefresh]
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

      const controller = beginLocalRun();

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
        const { runPipelineActionOnOffscreen } = await import('../../lib/pipeline/offscreenPipelineClient');
        const result = await runPipelineActionOnOffscreen('classify', ids.slice(0, maxItems), {
          classify: true,
          forceReclassify: options?.forceReclassify !== false,
          retryManualReview: options?.retryManualReview,
          signal: controller.signal,
          onProgress: (progress) => applyPipelineProgress(setModal, progress),
        });

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
        if (abortRef.current === controller) abortRef.current = null;
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [beginLocalRun, onRefresh]
  );

  return (
    <PipelineProgressContext.Provider
      value={{
        isRunning,
        isLocalRunning: isRunning,
        isCancellable,
        cancel,
        runBatch,
        runSingle,
        runReextract,
        runReextractBatch,
        runEmbedBatch,
        runDiscover,
        runClassify,
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
          </div>
        )}
      </div>
    </div>
  );
}
