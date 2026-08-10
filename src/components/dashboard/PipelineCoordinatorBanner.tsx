import { useCallback, useEffect, useState } from 'react';
import { dbRpc } from '../../lib/storage/dbClient';
import type { PipelineJobSnapshot } from '../../lib/storage/dbWorker/pipelineJobStore';
import {
  requestPipelineJobCancellation,
  requestPipelineJobResume,
} from '../../lib/pipeline/offscreenPipelineClient';

const POLL_MS = 2_000;

function actionLabel(action: string): string {
  if (action.startsWith('reextract')) return 'Re-extracting AI summary';
  if (action.startsWith('reembed')) return 'Building search embeddings';
  if (action.startsWith('classify')) return 'Classifying';
  if (action.startsWith('discover')) return 'Discovering taxonomy gaps';
  return 'Processing links';
}

function stageLabel(stage?: string): string {
  switch (stage) {
    case 'enrich': return 'fetching and extracting';
    case 'reextract': return 'extracting AI summary';
    case 'embed': return 'building search embedding';
    case 'classify': return 'classifying';
    case 'discover': return 'discovering taxonomy gaps';
    case 'finalize': return 'finalizing';
    default: return 'queued';
  }
}

export function PipelineCoordinatorBanner() {
  const [jobs, setJobs] = useState<PipelineJobSnapshot[]>([]);
  const [cancelError, setCancelError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setJobs(await dbRpc<PipelineJobSnapshot[]>('pipelineListVisible', [], { priority: 'high' }));
    } catch {
      // The owner may be recreating after an extension reload; the next poll retries.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const active = jobs[0];
  if (!active) return null;
  const runningTask = active.tasks.find((task) => task.status === 'running');
  const cancelling = active.job.status === 'cancel_requested' || active.job.status === 'cancelling';
  const paused = active.job.status === 'paused';
  const pausing = active.job.status === 'pause_requested';
  const completed = Math.min(
    active.job.total_items,
    active.job.completed_items + active.job.failed_items
  );

  const cancel = async () => {
    setCancelError('');
    try {
      await requestPipelineJobCancellation(active.job.id);
      await refresh();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Cancellation request failed');
    }
  };

  const resume = async () => {
    setCancelError('');
    try {
      await requestPipelineJobResume(active.job.id);
      await refresh();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Resume request failed');
    }
  };

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--accent-weak)',
        color: 'var(--text)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{cancelling
          ? 'Cancelling pipeline'
          : paused
            ? 'Pipeline paused'
            : pausing
              ? 'Pausing pipeline'
              : actionLabel(active.job.action)}</strong>
        <span style={{ color: 'var(--text-muted)' }}>
          {' '}· {completed}/{active.job.total_items} · {paused
            ? 'choose Resume to use this dashboard window'
            : pausing
              ? 'finishing the current stage safely'
              : stageLabel(runningTask?.stage)}
          {jobs.length > 1 ? ` · ${jobs.length - 1} queued` : ''}
        </span>
        {cancelError ? <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{cancelError}</span> : null}
      </div>
      {paused ? (
        <button
          type="button"
          onClick={() => void resume()}
          className="ui-button ui-button--primary"
          style={{ minHeight: 28, padding: '4px 10px' }}
        >
          Resume
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void cancel()}
        disabled={cancelling}
        className="ui-button ui-button--secondary"
        style={{ minHeight: 28, padding: '4px 10px' }}
      >
        {cancelling ? 'Cancelling…' : 'Cancel'}
      </button>
    </div>
  );
}
