import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import {
  runBatchDigest,
  runSingleLinkDigest,
  formatBatchDigestProgress,
  type BatchDigestResult,
  type SingleLinkDigestResult,
} from '../../lib/pipeline';
import { reextractAI, embedIncrementalBatch, type EnrichmentResult } from '../../lib/enrichment';
import {
  buildClassifyReportRows,
  buildPipelineReportRows,
  formatPipelineReportSummary,
  pipelineReportStats,
  resolveBatchReportAction,
  type PipelineReportRow,
} from '../../lib/pipeline/pipelineBatchReport';
import { PipelineBatchReportPanel } from './PipelineBatchReportPanel';

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
  }

export interface RunSingleWithProgressOptions {
  title?: string;
  forceEnrich?: boolean;
  skipClassify?: boolean;
  /** Fetch only — skip AI extract (Re-fetch in inspector). */
  skipAi?: boolean;
  tabSessionOnly?: boolean;
  /** Display title for the results report. */
  itemLabel?: string;
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
  onRefresh?: () => void | Promise<void>;
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
        total: itemIds.length,
        cancellable,
      });

      try {
        const result = await runBatchDigest(itemIds, {
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
          signal: controller?.signal,
          onProgress: (p) => {
            setModal((prev) =>
              prev.open && prev.phase === 'running'
                ? {
                    ...prev,
                    progressLabel: formatBatchDigestProgress(p),
                    current: p.current,
                    total: p.total,
                  }
                : prev
            );
          },
        });

        const cancelled = result.enrichCancelled || controller?.signal.aborted;
        const itemLabels = options?.itemLabels ?? {};
        const batchAction = resolveBatchReportAction(options);
        let reportRows: PipelineReportRow[] | undefined;
        if (!cancelled) {
          if (result.itemEnrichResults?.length) {
            reportRows = buildPipelineReportRows(result.itemEnrichResults, itemLabels, {
              action: batchAction,
            });
          } else if (
            batchAction === 'batch_classify' &&
            result.classifySummary &&
            itemIds.length > 0
          ) {
            reportRows = buildClassifyReportRows(itemIds, itemLabels, result.classifySummary);
          }
        }
        const summary = cancelled
          ? 'Cancelled'
          : reportRows?.length
            ? formatPipelineReportSummary(pipelineReportStats(reportRows))
            : result.message;
        const tone: SummaryTone =
          cancelled
            ? 'info'
            : result.classifyError || result.failed > 0 || (result.classifySummary?.llmErrors ?? 0) > 0
              ? 'error'
              : result.classified > 0 ||
                  (result.classifySummary?.processed ?? 0) > 0 ||
                  result.enriched > 0
                ? 'success'
                : 'info';

        setModal({
          open: true,
          phase: 'done',
          title: cancelled ? title : `${title} — complete`,
          summary,
          tone,
          reportRows,
        });
        await onRefresh?.();
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
        total: 1,
        cancellable: false,
      });

      try {
        const result = await runSingleLinkDigest(itemId, {
          forceEnrich: options?.forceEnrich,
          skipClassify: options?.skipClassify,
          skipAi: options?.skipAi,
          tabSessionOnly: options?.tabSessionOnly,
          onProgress: (p) => {
            setModal((prev) =>
              prev.open && prev.phase === 'running'
                ? { ...prev, progressLabel: p.label }
                : prev
            );
          },
        });

        const reportAction =
          options?.skipAi || options?.skipClassify ? 'fetch' : 'full_digest';
        const reportRows = buildPipelineReportRows([result.enrich], {
          [itemId]: options?.itemLabel ?? itemId,
        }, { action: reportAction });
        const stats = pipelineReportStats(reportRows);
        const tone: SummaryTone =
          result.enrich.status === 'failed' ? 'error' : 'success';
        setModal({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary: result.message || formatPipelineReportSummary(stats),
          tone,
          reportRows,
        });
        await onRefresh?.();
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
        total: 1,
        cancellable: false,
      });

      try {
        const result = await reextractAI(itemId, { force: options?.force });
        const reportRows = buildPipelineReportRows([result], {
          [itemId]: options?.itemLabel ?? itemId,
        }, { action: 'ai_extract' });
        const stats = pipelineReportStats(reportRows);
        const tone: SummaryTone = result.status === 'failed' ? 'error' : 'success';
        setModal({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary: formatPipelineReportSummary(stats),
          tone,
          reportRows,
        });
        await onRefresh?.();
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
        total: uniqueIds.length,
        cancellable: false,
      });

      const results: EnrichmentResult[] = [];
      try {
        for (let i = 0; i < uniqueIds.length; i++) {
          const itemId = uniqueIds[i];
          setModal((prev) =>
            prev.open && prev.phase === 'running'
              ? {
                  ...prev,
                  progressLabel: `Re-running AI ${i + 1}/${uniqueIds.length}…`,
                  current: i,
                  total: uniqueIds.length,
                }
              : prev
          );
          results.push(await reextractAI(itemId, { force: options?.force }));
        }

        const reportRows = buildPipelineReportRows(results, itemLabels, { action: 'ai_extract' });
        const stats = pipelineReportStats(reportRows);
        const tone: SummaryTone = stats.failed > 0 ? 'error' : 'success';
        setModal({
          open: true,
          phase: 'done',
          title: `${title} — complete`,
          summary: formatPipelineReportSummary(stats),
          tone,
          reportRows,
        });
        await onRefresh?.();
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
        total: uniqueIds.length,
        cancellable: false,
      });

      try {
        const summary = await embedIncrementalBatch({
          itemIds: uniqueIds,
          onProgress: (p) => {
            setModal((prev) =>
              prev.open && prev.phase === 'running'
                ? {
                    ...prev,
                    progressLabel:
                      p.phase === 'prepare'
                        ? 'Preparing embed batch…'
                        : `Embedding batch ${p.batchIndex}/${p.batchTotal}…`,
                    current: p.embeddedSoFar,
                    total: uniqueIds.length,
                  }
                : prev
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
        await onRefresh?.();
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
          maxWidth: modal.phase === 'done' && modal.reportRows?.length ? 640 : 420,
          background: 'var(--bg-panel)',
          color: 'var(--text)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          padding: '20px 22px',
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
          <>
            {modal.reportRows?.length ? (
              <PipelineBatchReportPanel rows={modal.reportRows} summary={modal.summary} />
            ) : (
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.55,
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
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
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
          </>
        )}
      </div>
    </div>
  );
}
