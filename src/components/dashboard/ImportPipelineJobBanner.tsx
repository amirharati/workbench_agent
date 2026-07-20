import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Play, Square, X } from 'lucide-react';
import type { ImportPipelineJob } from '../../lib/pipeline/importPipelineJob';
import {
  isPipelineRunLockFresh,
  type PipelineRunLock,
  subscribePipelineRunLock,
} from '../../lib/pipeline/pipelineRunLock';
import { useToast } from '../ToastContainer';
import { usePipelineProgress } from './PipelineProgressProvider';

export type ImportPipelineJobBannerProps = {
  job: ImportPipelineJob | null;
  loading?: boolean;
  isResumable: boolean;
  onDismiss: () => Promise<void>;
  /** Refresh banner job state after resume / dismiss. */
  onJobChanged?: () => void | Promise<void>;
};

function formatJobSummary(job: ImportPipelineJob): string {
  const count = job.itemIds.length.toLocaleString();
  const done = job.completedItemIds.length;
  const remaining = Math.max(0, job.itemIds.length - done);
  const wavePart = job.waveIndex > 0 ? ` · wave ${job.waveIndex}` : '';
  const progressPart =
    done > 0 ? ` · ${done.toLocaleString()} processed` : '';
  const remainingPart = remaining > 0 ? ` · ${remaining.toLocaleString()} remaining` : '';
  const statusPart = job.status === 'paused' && !job.lastError
    ? 'saved checkpoint'
    : job.lastError
    ? `${job.status}: ${job.lastError}`
    : job.status;
  return `Large batch pipeline — ${count} link${job.itemIds.length === 1 ? '' : 's'}${progressPart}${remainingPart}${wavePart} · ${statusPart}`;
}

const ACTIVE_STATUSES = new Set<ImportPipelineJob['status']>(['paused', 'running', 'failed']);

export const ImportPipelineJobBanner: React.FC<ImportPipelineJobBannerProps> = ({
  job,
  loading,
  isResumable,
  onDismiss,
  onJobChanged,
}) => {
  const { addToast } = useToast();
  const pipeline = usePipelineProgress();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [lock, setLock] = useState<PipelineRunLock | null>(null);

  useEffect(() => subscribePipelineRunLock(setLock), []);

  if (loading || !job || !ACTIVE_STATUSES.has(job.status)) {
    return null;
  }

  const lockFresh = isPipelineRunLockFresh(lock);
  const lockForThisJob =
    lockFresh &&
    Boolean(lock) &&
    (lock!.importRunId === job.importRunId ||
      (job.status === 'running' && lock!.importRunId == null));
  const thisJobInProgress = lockForThisJob || (pipeline.isLocalRunning && job.status === 'running');
  const otherPipelineBusy = pipeline.isRunning && !thisJobInProgress;
  const showResume = !thisJobInProgress && !otherPipelineBusy && isResumable;
  const showInProgressChrome = thisJobInProgress;

  const handleResume = async () => {
    if (thisJobInProgress || otherPipelineBusy) {
      addToast({
        type: 'info',
        message: thisJobInProgress
          ? 'This pipeline is already running — use Cancel if you need to stop it.'
          : 'Another pipeline is already running — wait for it to finish, then resume.',
      });
      return;
    }
    if (!isResumable) {
      addToast({
        type: 'info',
        message: 'This job cannot be resumed yet. Dismiss it and start a new bulk digest from Hub.',
      });
      return;
    }
    setResuming(true);
    try {
      await pipeline.runResumePipelineJob({
        onFinished: async () => {
          await onJobChanged?.();
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not resume pipeline job.';
      addToast({ type: 'error', message: msg });
      await onJobChanged?.();
    } finally {
      setResuming(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      // Immediate UI + background abort/clear (handled inside cancel).
      pipeline.cancel();
      await onJobChanged?.();
    } finally {
      setCancelling(false);
    }
  };

  const handleDismissConfirm = async () => {
    setDismissing(true);
    try {
      await onDismiss();
      setDismissOpen(false);
      addToast({ type: 'info', message: 'Pipeline job dismissed.' });
      await onJobChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not dismiss pipeline job.';
      addToast({ type: 'error', message: msg });
    } finally {
      setDismissing(false);
    }
  };

  const helperText = showInProgressChrome
    ? pipeline.isLocalRunning
      ? 'Job in progress in this window. Cancel stops the run; saved progress can be resumed later if needed.'
      : 'Running in another Homebase window. You can request Cancel from here — Resume stays hidden while it’s active.'
    : otherPipelineBusy
      ? 'Another enrichment job is running — Resume unlocks when it finishes.'
      : `${Math.max(0, job.itemIds.length - job.completedItemIds.length).toLocaleString()} link${job.itemIds.length - job.completedItemIds.length === 1 ? '' : 's'} did not reach a final state. Resume retries the remaining work; Dismiss accepts the current result and removes this checkpoint.`;

  return (
    <>
      {dismissOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10002,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(0,0,0,0.45)',
            boxSizing: 'border-box',
          }}
          onClick={() => !dismissing && setDismissOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--bg-panel)',
              color: 'var(--text)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                margin: '0 0 12px',
                fontSize: 'var(--text-base)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={18} color="var(--er-warn, #d29922)" />
              Dismiss pipeline job?
            </h3>
            <p
              style={{
                margin: '0 0 20px',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              This removes <code>import-pipeline-job.json</code> from your backup folder. You can
              still run fetch + AI from Import Studio or Enrichment Hub; wave resume will not be
              available until you start another large batch pipeline run.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                disabled={dismissing}
                onClick={() => setDismissOpen(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 'var(--text-sm)',
                  cursor: dismissing ? 'wait' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dismissing}
                onClick={() => void handleDismissConfirm()}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--er-warn, #d29922)',
                  color: '#fff',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  cursor: dismissing ? 'wait' : 'pointer',
                }}
              >
                {dismissing ? 'Dismissing…' : 'Dismiss job'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          flexShrink: 0,
          margin: '8px 12px 0',
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid color-mix(in srgb, var(--er-warn, #d29922) 35%, var(--border))',
          borderLeft: '3px solid var(--accent)',
          background: 'color-mix(in srgb, var(--er-warn, #d29922) 8%, var(--bg-panel))',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--text)',
              lineHeight: 1.45,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {showInProgressChrome ? <Loader2 size={14} className="spin" /> : null}
            {showInProgressChrome
              ? `Job in progress — ${formatJobSummary(job)}`
              : formatJobSummary(job)}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}
          >
            {helperText}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {showInProgressChrome ? (
            <button
              type="button"
              disabled={cancelling}
              title="Cancel the in-progress pipeline"
              onClick={() => void handleCancel()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-glass)',
                color: 'var(--text)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: cancelling ? 'wait' : 'pointer',
              }}
            >
              {cancelling ? <Loader2 size={13} className="spin" /> : <Square size={13} />}
              Cancel
            </button>
          ) : (
            <button
              type="button"
              disabled={resuming || !showResume}
              title={
                otherPipelineBusy
                  ? 'Wait for the current pipeline to finish'
                  : showResume
                    ? 'Resume wave pipeline with progress'
                    : 'This job cannot be resumed'
              }
              onClick={() => void handleResume()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: resuming || !showResume ? 'not-allowed' : 'pointer',
                opacity: resuming || !showResume ? 0.8 : 1,
              }}
            >
              {resuming ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
              Resume
            </button>
          )}
          <button
            type="button"
            disabled={showInProgressChrome}
            title={
              showInProgressChrome
                ? 'Dismiss is disabled while the job is running — cancel first'
                : 'Dismiss saved job file'
            }
            onClick={() => setDismissOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-glass)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: showInProgressChrome ? 'not-allowed' : 'pointer',
              opacity: showInProgressChrome ? 0.55 : 1,
            }}
          >
            <X size={13} />
            Dismiss
          </button>
        </div>
      </div>
    </>
  );
};
