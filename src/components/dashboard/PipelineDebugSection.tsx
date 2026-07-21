import { useCallback, useEffect, useState } from 'react';
import {
  getPipelineDebugCount,
  isPipelineDebugEnabled,
  purgeAllPipelineDebug,
  setPipelineDebugEnabled,
} from '../../lib/enrichment/pipelineDebug';
import { HubActionConfirmModal } from './HubActionConfirmModal';

/** Settings toggle + purge for debug-only pipeline timing rows. */
export function PipelineDebugSection() {
  const [enabled, setEnabled] = useState(() => isPipelineDebugEnabled());
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [purging, setPurging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [purgeConfirmCount, setPurgeConfirmCount] = useState<number | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      setRowCount(await getPipelineDebugCount());
    } catch {
      setRowCount(null);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount, enabled, purging]);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    setPipelineDebugEnabled(next);
    setMessage(next ? 'Debug timing will be recorded on the next enrich run.' : null);
    if (!next) setRowCount(null);
    else void refreshCount();
  };

  const requestPurge = async () => {
    if (purging) return;
    const count = rowCount ?? (await getPipelineDebugCount());
    if (count === 0) {
      setMessage('No debug rows to purge.');
      return;
    }
    setPurgeConfirmCount(count);
  };

  const handlePurge = async () => {
    if (!purgeConfirmCount || purging) return;
    setPurgeConfirmCount(null);
    setPurging(true);
    setMessage(null);
    try {
      const removed = await purgeAllPipelineDebug();
      setRowCount(0);
      setMessage(`Purged ${removed} debug row(s).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Purge failed');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        paddingTop: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
        Pipeline debug timing
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        When enabled, every Import Studio or Hub pipeline run writes{' '}
        <code>pipeline-run-in-progress.json</code>, <code>pipeline-run-latest.json</code>, and a{' '}
        <code>pipeline-runs/</code> folder in your backup folder (next to{' '}
        Per-item fetch timings and <strong>AI call audit</strong> (model, tokens, raw
        response text) go in <code>pipeline_debug</code> (sqlite). Uncheck to stop file dumps.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          <input type="checkbox" checked={enabled} onChange={handleToggle} />
          Record debug timings
        </label>
        {rowCount !== null && rowCount > 0 ? (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rowCount} row(s)</span>
        ) : null}
        <button
          type="button"
          onClick={() => void requestPurge()}
          disabled={purging || rowCount === 0}
          style={{
            padding: '2px 10px',
            height: 24,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: purging ? 'wait' : 'pointer',
          }}
        >
          {purging ? 'Purging…' : 'Purge debug data'}
        </button>
      </div>
      {message ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{message}</div>
      ) : null}
      {purgeConfirmCount ? (
        <HubActionConfirmModal
          title="Purge pipeline debug data?"
          description={`${purgeConfirmCount} debug timing row${purgeConfirmCount === 1 ? '' : 's'} will be deleted.`}
          warning="Enrichment and classification results are not affected."
          confirmLabel="Purge debug data"
          confirmVariant="danger"
          onCancel={() => setPurgeConfirmCount(null)}
          onConfirm={() => void handlePurge()}
        />
      ) : null}
    </div>
  );
}
