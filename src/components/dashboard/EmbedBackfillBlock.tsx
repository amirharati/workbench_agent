import { useCallback, useEffect, useRef, useState } from 'react';
import {
  embedIncrementalBatch,
  getEmbedBackfillStats,
  type EmbedBackfillProgress,
  type EmbedBackfillStats,
} from '../../lib/enrichment/embedItemSignal';
import { getPendingEmbeddingItemIds } from '../../lib/storage/dbClient';

type Props = {
  onComplete?: () => void;
  batchSize?: number;
  compact?: boolean;
};

export function EmbedBackfillBlock({ onComplete, batchSize = 48, compact = false }: Props) {
  const [stats, setStats] = useState<EmbedBackfillStats | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<EmbedBackfillProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const refreshStats = useCallback(async () => {
    const s = await getEmbedBackfillStats();
    setStats(s);
    return s;
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const runBackfill = useCallback(async () => {
    cancelRef.current = false;
    setRunning(true);
    setMessage(null);
    setProgress(null);

    try {
      let totalEmbedded = 0;
      let rounds = 0;
      const maxRounds = 200;

      while (!cancelRef.current && rounds < maxRounds) {
        rounds++;
        const itemIds = await getPendingEmbeddingItemIds(batchSize);
        if (itemIds.length === 0) {
          setMessage(
            totalEmbedded > 0
              ? `Done — embedded ${totalEmbedded} this run.`
              : 'All enriched items already have embeddings.'
          );
          break;
        }
        const summary = await embedIncrementalBatch({
          itemIds,
          max: itemIds.length,
          onProgress: setProgress,
        });
        totalEmbedded += summary.embedded;

        if (summary.embedded === 0 || summary.pendingAfter === 0) {
          setMessage(
            totalEmbedded > 0
              ? `Done — embedded ${totalEmbedded} this run (${summary.pendingAfter} still pending).`
              : summary.pendingAfter === 0
                ? 'All enriched items already have embeddings.'
                : `Stopped — ${summary.embedFailed} failed · ${summary.skippedNoKey ? 'check API key' : ''}`
          );
          break;
        }

        await refreshStats();
      }

      if (rounds >= maxRounds && !cancelRef.current) {
        setMessage(`Paused after ${totalEmbedded} embeddings — click again to continue.`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setProgress(null);
      const s = await refreshStats();
      onComplete?.();
      if (s.pendingEmbed > 0 && s.withEmbedding > 0) {
        /* hybrid partially ready */
      }
    }
  }, [batchSize, onComplete, refreshStats]);

  const cancel = () => {
    cancelRef.current = true;
  };

  const pct =
    stats && stats.aiSummaryOk > 0
      ? Math.round((stats.withEmbedding / stats.aiSummaryOk) * 100)
      : 0;

  return (
    <div
      style={{
        padding: compact ? '8px 0' : '10px 12px',
        borderRadius: 8,
        border: compact ? 'none' : '1px solid var(--border)',
        background: compact ? 'transparent' : 'var(--bg)',
        marginBottom: compact ? 0 : 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
          {stats ? (
            <>
              Search vectors: <strong>{stats.withEmbedding}</strong> / {stats.aiSummaryOk} enriched
              {stats.pendingEmbed > 0 ? ` · ${stats.pendingEmbed} pending` : ''}
              {stats.embedFailed > 0 ? ` · ${stats.embedFailed} failed` : ''}
            </>
          ) : (
            'Loading embed stats…'
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {running ? (
            <button
              type="button"
              onClick={cancel}
              style={{
                padding: '5px 10px',
                fontSize: 'var(--dev-fs-caption)',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void runBackfill()}
            disabled={running || !stats || stats.pendingEmbed === 0}
            style={{
              padding: '5px 12px',
              fontSize: 'var(--dev-fs-caption)',
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: running || !stats?.pendingEmbed ? 'not-allowed' : 'pointer',
              opacity: running || !stats?.pendingEmbed ? 0.55 : 1,
            }}
          >
            {running ? 'Embedding…' : stats?.pendingEmbed ? 'Backfill embeddings' : 'Embeddings up to date'}
          </button>
        </div>
      </div>

      {stats && stats.aiSummaryOk > 0 ? (
        <div
          style={{
            marginTop: 8,
            height: 4,
            borderRadius: 2,
            background: 'var(--border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--accent)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      ) : null}

      {progress ? (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)' }}>
          Batch {progress.batchIndex}/{progress.batchTotal} · {progress.embeddedSoFar} embedded
        </p>
      ) : null}

      {message ? (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
          {message}
        </p>
      ) : null}

      {!compact && stats && stats.pendingEmbed > 0 ? (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)' }}>
          Writes to IndexedDB only (auto-syncs to backup folder). Input: title + AI summary per item.
        </p>
      ) : null}
    </div>
  );
}
