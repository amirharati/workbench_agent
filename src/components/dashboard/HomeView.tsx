import React from 'react';
import type { BackupStatusSnapshot } from '../../lib/backupCoordinator';

interface HomeViewProps {
  backupFolderReady?: boolean;
  backupFolderName?: string | null;
  onChooseBackupFolder?: () => Promise<void>;
  onRestoreBackupFile?: (file: File, mode: 'replace' | 'merge') => Promise<void>;
  onManualBackup?: () => Promise<void>;
  onResolveConflictLoadRemote?: () => Promise<void>;
  onResolveConflictKeepLocal?: () => Promise<void>;
  backupStatus?: BackupStatusSnapshot;
}

const formatRelative = (ts: number | null | undefined): string => {
  if (!ts) return 'never';
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
};

const formatAbsolute = (ts: number | null | undefined): string => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString();
};

/** Truncate a long deviceId for display: dev_8f3a-1c2d-… */
const shortDevice = (id: string | null | undefined): string => {
  if (!id) return '?';
  if (id.length <= 14) return id;
  return `${id.slice(0, 12)}…`;
};

export const HomeView: React.FC<HomeViewProps> = ({
  backupFolderReady,
  backupFolderName,
  onChooseBackupFolder,
  onRestoreBackupFile,
  onManualBackup,
  onResolveConflictLoadRemote,
  onResolveConflictKeepLocal,
  backupStatus,
}) => {
  const [restoreMode, setRestoreMode] = React.useState<'replace' | 'merge'>('replace');
  const [, forceTick] = React.useState(0);
  const [resolving, setResolving] = React.useState<null | 'remote' | 'local'>(null);

  // Re-render every 30s so the relative timestamps stay current without a
  // websocket / fancy state machine.
  React.useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleRestoreInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onRestoreBackupFile) return;
    await onRestoreBackupFile(file, restoreMode);
    e.target.value = '';
  };

  const liveOk = backupStatus?.lastLiveOkAt ?? null;
  const manualOk = backupStatus?.lastManualOkAt ?? null;
  const errorAt = backupStatus?.lastErrorAt ?? null;
  const errorMsg = backupStatus?.lastError ?? null;
  const livePending = backupStatus?.livePending ?? false;
  const inFlight = backupStatus?.inFlight ?? false;
  const conflict = backupStatus?.conflict ?? null;
  const conflictBlocking = !!conflict?.blocking;
  const manualDisabled = !backupFolderReady || inFlight || conflictBlocking;

  const handleLoadRemote = async () => {
    if (!onResolveConflictLoadRemote) return;
    setResolving('remote');
    try {
      await onResolveConflictLoadRemote();
    } finally {
      setResolving(null);
    }
  };

  const handleKeepLocal = async () => {
    if (!onResolveConflictKeepLocal) return;
    setResolving('local');
    try {
      await onResolveConflictKeepLocal();
    } finally {
      setResolving(null);
    }
  };

  return (
    <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#111827' }}>Home</h1>
      <p style={{ marginTop: '0.5rem', color: '#6b7280' }}>
        Backup is required for safe usage. Configure your folder below, then you can restore from a backup file any time.
      </p>

      <div
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 10,
          padding: '1rem',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>Backup Settings</div>
        <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
          Status:{' '}
          {backupFolderReady
            ? `Configured${backupFolderName ? ` (${backupFolderName})` : ''}`
            : 'Not configured'}
        </div>

        {/* Conflict banner — shown when coordinator paused due to remote/different-device write */}
        {conflictBlocking && conflict && (
          <div
            style={{
              border: '1px solid #fca5a5',
              background: '#fef2f2',
              borderRadius: 8,
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.9rem' }}>
              Backup paused — sync conflict detected
            </div>
            <div style={{ fontSize: '0.82rem', color: '#7f1d1d', lineHeight: 1.5 }}>
              {conflict.message}
            </div>
            <div
              style={{
                fontSize: '0.78rem',
                color: '#374151',
                background: '#ffffff',
                border: '1px solid #fecaca',
                borderRadius: 6,
                padding: '0.5rem 0.6rem',
                lineHeight: 1.5,
              }}
            >
              <div>
                <strong>This device:</strong> revision <code>{conflict.localRevision}</code>{' '}
                · {shortDevice(conflict.localDeviceId)}
              </div>
              {conflict.remote && (
                <div>
                  <strong>Folder latest.json:</strong> revision <code>{conflict.remote.revision}</code>{' '}
                  · {shortDevice(conflict.remote.deviceId)} · written{' '}
                  {formatRelative(conflict.remote.exportedAt)}{' '}
                  <span style={{ color: '#9ca3af' }}>({formatAbsolute(conflict.remote.exportedAt)})</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleLoadRemote}
                disabled={!!resolving}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 8,
                  border: 'none',
                  background: resolving === 'remote' ? '#93c5fd' : '#2563eb',
                  color: '#fff',
                  cursor: resolving ? 'progress' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
                title="Adopt the folder's latest.json. Your current local data will first be saved as safety-before-import-…json in the same folder."
              >
                {resolving === 'remote' ? 'Loading…' : 'Load remote (saves local first)'}
              </button>
              <button
                type="button"
                onClick={handleKeepLocal}
                disabled={!!resolving}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 8,
                  border: '1px solid #b91c1c',
                  background: resolving === 'local' ? '#fecaca' : '#fff',
                  color: '#991b1b',
                  cursor: resolving ? 'progress' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
                title="Overwrite the folder's latest.json with this device's data. The previous remote file is replaced."
              >
                {resolving === 'local' ? 'Overwriting…' : 'Keep local (overwrite remote)'}
              </button>
            </div>
          </div>
        )}

        {/* Live + manual activity panel */}
        {backupFolderReady && (
          <div
            style={{
              fontSize: '0.82rem',
              color: '#374151',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '0.65rem',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
            }}
          >
            <div>
              <strong>Auto backup (live):</strong>{' '}
              {liveOk ? (
                <>
                  last write {formatRelative(liveOk)}{' '}
                  <span style={{ color: '#6b7280' }}>({formatAbsolute(liveOk)})</span>
                </>
              ) : (
                <span style={{ color: '#6b7280' }}>none yet</span>
              )}
              {livePending && (
                <span style={{ marginLeft: '0.5rem', color: '#2563eb', fontWeight: 600 }}>
                  · saving soon…
                </span>
              )}
              {inFlight && (
                <span style={{ marginLeft: '0.5rem', color: '#2563eb', fontWeight: 600 }}>
                  · writing…
                </span>
              )}
              {conflictBlocking && (
                <span style={{ marginLeft: '0.5rem', color: '#b91c1c', fontWeight: 600 }}>
                  · paused (conflict)
                </span>
              )}
            </div>
            <div>
              <strong>Manual backup:</strong>{' '}
              {manualOk ? (
                <>
                  last write {formatRelative(manualOk)}{' '}
                  <span style={{ color: '#6b7280' }}>({formatAbsolute(manualOk)})</span>
                </>
              ) : (
                <span style={{ color: '#6b7280' }}>none yet</span>
              )}
            </div>
            {errorAt && errorMsg && (
              <div style={{ color: '#b91c1c' }}>
                <strong>Last error:</strong> {errorMsg}{' '}
                <span style={{ color: '#9ca3af' }}>({formatRelative(errorAt)})</span>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            fontSize: '0.82rem',
            color: '#374151',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '0.65rem',
            lineHeight: 1.45,
          }}
        >
          <div><strong>What happens when you choose a folder:</strong></div>
          <div>1) If <code>latest.json</code> already exists there, the app loads it and replaces current DB data.</div>
          <div>2) If no <code>latest.json</code> exists, the app creates it from your current DB data.</div>
          <div>3) The app never auto-overwrites another backup filename in that folder.</div>
          <div style={{ marginTop: '0.4rem' }}>
            <strong>How backups are written:</strong>
          </div>
          <div>· <strong>Auto:</strong> after any change, <code>latest.json</code> is refreshed (debounced, ~1.5s).</div>
          <div>· <strong>Manual:</strong> click "Backup now" to also write <code>manual-YYYY-MM-DD_HHMMSS.json</code>.</div>
          <div>· <strong>Sync safety:</strong> if the folder's <code>latest.json</code> was written by another device, the app pauses writes and asks you to decide; on "Load remote" your current local data is first saved as <code>safety-before-import-…json</code>.</div>
          <div>· <strong>Scheduled rotations</strong> (e.g. daily snapshots) are coming next.</div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => onChooseBackupFolder?.()}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {backupFolderReady ? 'Change backup folder' : 'Choose backup folder'}
          </button>

          <button
            type="button"
            onClick={() => onManualBackup?.()}
            disabled={manualDisabled}
            title={
              !backupFolderReady
                ? 'Configure a backup folder first'
                : conflictBlocking
                ? 'Resolve the sync conflict above first'
                : inFlight
                ? 'A backup is already running'
                : 'Write manual-YYYY-MM-DD_HHMMSS.json (and refresh latest.json)'
            }
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: '1px solid #16a34a',
              background: manualDisabled ? '#86efac' : '#16a34a',
              color: '#fff',
              cursor: manualDisabled ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              opacity: manualDisabled ? 0.7 : 1,
            }}
          >
            {inFlight ? 'Backing up…' : 'Backup now'}
          </button>

          <select
            value={restoreMode}
            onChange={(e) => setRestoreMode(e.target.value as 'replace' | 'merge')}
            style={{
              padding: '0.5rem 0.6rem',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              fontSize: '0.85rem',
            }}
          >
            <option value="replace">Load mode: Replace</option>
            <option value="merge" disabled>
              Load mode: Merge (coming soon)
            </option>
          </select>
          <label
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
            title={restoreMode === 'merge' ? 'Merge mode is not implemented yet' : 'Load backup file'}
          >
            Restore from backup file
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleRestoreInput}
              disabled={restoreMode === 'merge'}
            />
          </label>
        </div>
      </div>
    </div>
  );
};
