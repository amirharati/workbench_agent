import React from 'react';

interface HomeViewProps {
  backupFolderReady?: boolean;
  backupFolderName?: string | null;
  onChooseBackupFolder?: () => Promise<void>;
  onRestoreBackupFile?: (file: File, mode: 'replace' | 'merge') => Promise<void>;
}

export const HomeView: React.FC<HomeViewProps> = ({
  backupFolderReady,
  backupFolderName,
  onChooseBackupFolder,
  onRestoreBackupFile,
}) => {
  const [restoreMode, setRestoreMode] = React.useState<'replace' | 'merge'>('replace');

  const handleRestoreInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onRestoreBackupFile) return;
    await onRestoreBackupFile(file, restoreMode);
    e.target.value = '';
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


