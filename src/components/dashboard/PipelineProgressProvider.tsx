import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import {
  runItemPipeline,
  runBatchDigest,
  runSingleLinkDigest,
  formatItemPipelineProgress,
  pipelineProgressBar,
  loadItemIdsForPipelineQueue,
  isFullPipelineBatch,
  runPipelineScopeBatch,
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
  await onRefresh?.(scope);
  // Checkpoint: end of AI pipeline → durable folder flush.
  try {
    const { flushDurableBackup } = await import('../../lib/storage/flushDurableBackup');
    await flushDurableBackup();
  } catch (e) {
    console.warn('[pipeline] folder flush after digest failed:', e);
  }
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
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [isRunning, setIsRunning] = useState(false);
  const [isCancellable, setIsCancellable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const closeModal = useCallback(() => {
    if (isRunning) return;
    setModal({ open: false });
  }, [isRunning]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setModal((prev) =>
      prev.open && prev.phase === 'running'
        ? {
            open: true,
            phase: 'done',
            title: `${prev.title} — cancelled`,
            summary: 'Cancelled — partial progress may have been saved.',
            tone: 'info',
          }
        : prev
    );
  }, []);

  const runBatch = useCallback(
    async (
      itemIds: string[],
      options?: RunBatchWithProgressOptions
    ): Promise<BatchDigestResult> => {
      const title = options?.title ?? 'Processing batch';
      const cancellable = options?.cancellable === true;
      const controller = cancellable ? new AbortController() : null;
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
        const result = isFullPipelineBatch(options)
          ? await runPipelineScopeBatch(itemIds, {
              signal: controller?.signal,
              forceEnrich: options?.forceEnrich,
              forceReclassify: options?.forceReclassify,
              refetchCompare: options?.refetchCompare,
              collectItemResults: options?.collectItemResults,
              writeJobFile: true,
              onProgress: (p) =>
                applyPipelineProgress(
                  setModal,
                  scopedProgressToItemProgress(p, itemIds.length)
                ),
            })
          : await runBatchDigest(itemIds, {
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
              signal: controller?.signal,
              onProgress: (p) => applyPipelineProgress(setModal, p),
            });

        const cancelled = result.enrichCancelled || controller?.signal.aborted || result.classifyError === 'classification cancelled';
        const itemLabels = options?.itemLabels ?? {};
        const batchAction = resolveBatchReportAction(options);
        const reportIds =
          itemIds.length > 0
            ? itemIds
            : (result.itemEnrichResults?.map((r) => r.itemId) ?? []);
        let reportRows: PipelineReportRow[] | undefined;
        let reportRowsTotal: number | undefined;
        if (!cancelled && reportIds.length) {
          const enrichRun = options?.enrich !== false;
          if (enrichRun || batchAction === 'batch_full' || batchAction === 'full_digest') {
            reportRows = await buildEnrichOutcomeReportRows(reportIds, itemLabels, {
              action: batchAction,
              enrichResults: result.itemEnrichResults,
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
        await refreshAfterPipeline(onRefresh, { itemIds });

        if (result.pipelineDebugSavedTo && itemIds.length > 0 && !cancelled) {
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
        setIsRunning(false);
        setIsCancellable(false);
        abortRef.current = null;
      }
    },
    [onRefresh]
  );

  const runSingle = useCallback(
    async (
      itemId: string,
      options?: RunSingleWithProgressOptions
    ): Promise<SingleLinkDigestResult> => {
      const title = options?.title ?? 'Running digest';

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

      try {
        const result = await runSingleLinkDigest(itemId, {
          forceEnrich: options?.forceEnrich,
          skipClassify: options?.skipClassify,
          skipAi: options?.skipAi,
          forceReclassify: options?.forceReclassify,
          tabSessionOnly: options?.tabSessionOnly,
          preferTabSession: options?.preferTabSession,
          tabId: options?.tabId,
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
        setModal({
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
        const summary = e instanceof Error ? e.message : 'Digest failed';
        setModal({
          open: true,
          phase: 'done',
          title,
          summary,
          tone: 'error',
        });
        throw e;
      } finally {
        setIsRunning(false);
        setIsCancellable(false);
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
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [onRefresh]
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
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [onRefresh]
  );

  const runEmbedBatch = useCallback(
    async (
      itemIds: string[],
      options?: { title?: string }
    ): Promise<{ embedded: number; skipped: number; failed: number }> => {
      const uniqueIds = [...new Set(itemIds.filter(Boolean))];
      const title = options?.title ?? `Re-embed (${uniqueIds.length})`;

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
        setIsRunning(false);
        setIsCancellable(false);
      }
    },
    [onRefresh]
  );

  const runDiscover = useCallback(
    async (options?: RunDiscoverOptions): Promise<RunDiscoverResult> => {
      const andClassify = options?.andClassify === true;
      const title =
        options?.title ??
        (andClassify ? 'Discover + classify' : 'Discover taxonomy gap-fill');

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
        setIsRunning(false);
        setIsCancellable(false);
        abortRef.current = null;
      }
    },
    [onRefresh]
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
        setIsRunning(false);
        setIsCancellable(false);
        abortRef.current = null;
      }
    },
    [onRefresh]
  );

  return (
    <PipelineProgressContext.Provider
      value={{
        isRunning,
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
        zIndex: 10001,
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
                      ? '#ef4444'
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
