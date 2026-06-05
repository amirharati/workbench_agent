import React, { useState } from 'react';
import { AlertTriangle, Loader2, Play, X } from 'lucide-react';
import {
  resumeImportPipelineJobStub,
  type ImportPipelineJob,
} from '../../lib/pipeline/importPipelineJob';
import { useToast } from '../ToastContainer';

export type ImportPipelineJobBannerProps = {
  job: ImportPipelineJob | null;
  loading?: boolean;
  isResumable: boolean;
  onDismiss: () => Promise<void>;
};

function formatJobSummary(job: ImportPipelineJob): string {
  const count = job.itemIds.length.toLocaleString();
  const wavePart =
    job.waveIndex > 0 ? ` · wave ${job.waveIndex}` : '';
  const statusPart = job.lastError
    ? `${job.status}: ${job.lastError}`
    : job.status;
  return `Large batch pipeline — ${count} link${job.itemIds.length === 1 ? '' : 's'}${wavePart} · ${statusPart}`;
}

const ACTIVE_STATUSES = new Set<ImportPipelineJob['status']>(['paused', 'running', 'failed']);

export const ImportPipelineJobBanner: React.FC<ImportPipelineJobBannerProps> = ({
  job,
  loading,
  isResumable,
  onDismiss,
}) => {
  const { addToast } = useToast();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [resuming, setResuming] = useState(false);

  if (loading || !job || !ACTIVE_STATUSES.has(job.status)) {
    return null;
  }

  const handleResume = async () => {
    setResuming(true);
    try {
      await resumeImportPipelineJobStub(addToast);
    } finally {
      setResuming(false);
    }
  };

  const handleDismissConfirm = async () => {
    setDismissing(true);
    try {
      await onDismiss();
      setDismissOpen(false);
      addToast({ type: 'info', message: 'Pipeline job dismissed.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not dismiss pipeline job.';
      addToast({ type: 'error', message: msg });
    } finally {
      setDismissing(false);
    }
  };

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
            }}
          >
            {formatJobSummary(job)}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            disabled={resuming}
            title={
              isResumable
                ? 'Resume wave pipeline'
                : 'Wave processing not enabled yet — click for details'
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
              cursor: resuming ? 'wait' : 'pointer',
              opacity: resuming ? 0.8 : 1,
            }}
          >
            {resuming ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
            Resume
          </button>
          <button
            type="button"
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
              cursor: 'pointer',
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
