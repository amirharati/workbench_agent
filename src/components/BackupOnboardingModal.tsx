import React, { useState } from 'react';
import { FolderOpen, HardDrive, X } from 'lucide-react';
import type { PickBackupFolderResult } from '../lib/backupFolder';

interface BackupOnboardingModalProps {
  open: boolean;
  /** Side panel: tighter layout */
  compact?: boolean;
  /** If false, onboarding cannot be skipped/dismissed. */
  allowSkip?: boolean;
  /**
   * Some Chrome extension surfaces are unstable for showDirectoryPicker.
   * If provided, primary action opens full-page setup instead of invoking picker here.
   */
  onChooseInFullPage?: () => void;
  /** Folder picker + worker bootstrap (single code path — do not pick twice). */
  onChooseFolder: () => Promise<PickBackupFolderResult>;
  onSkip?: () => void;
}

export const BackupOnboardingModal: React.FC<BackupOnboardingModalProps> = ({
  open,
  compact,
  allowSkip = false,
  onChooseInFullPage,
  onChooseFolder,
  onSkip,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const chooseFolder = async () => {
    if (onChooseInFullPage) {
      onChooseInFullPage();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await onChooseFolder();
      if (r.ok) return;
      if (r.error === 'cancelled') {
        setError(null);
        return;
      }
      setError(r.error ?? 'Something went wrong');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-onboarding-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '12px' : '24px',
        background: 'rgba(0,0,0,0.45)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: compact ? '100%' : 440,
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--bg-panel, #fff)',
          color: 'var(--text, #111)',
          borderRadius: compact ? 12 : 16,
          border: '1px solid var(--border, #e5e7eb)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          padding: compact ? '16px' : '24px',
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          fontSize: 'var(--text-base, 14px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--bg-muted, #f3f4f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HardDrive size={22} style={{ color: 'var(--accent, #2563eb)' }} aria-hidden />
            </div>
            <div>
              <h2 id="backup-onboarding-title" style={{ margin: 0, fontSize: compact ? '1rem' : '1.125rem', fontWeight: 700 }}>
                Choose your data folder
              </h2>
              <p style={{ margin: '8px 0 0', opacity: 0.85, lineHeight: 1.5 }}>
                Workbench stores your live database as <code style={{ fontSize: '0.9em' }}>workbench.sqlite</code> in a
                folder you pick—ideally inside Dropbox, iCloud Drive, or another sync service. The app cannot run without
                this folder.
              </p>
            </div>
          </div>
          {allowSkip && onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip for now"
              disabled={busy}
              style={{
                flexShrink: 0,
                border: 'none',
                background: 'transparent',
                cursor: busy ? 'default' : 'pointer',
                padding: 4,
                borderRadius: 8,
                opacity: busy ? 0.5 : 1,
                color: 'var(--text-muted, #6b7280)',
              }}
            >
              <X size={20} />
            </button>
          ) : null}
        </div>

        <ol style={{ margin: '0 0 16px', paddingLeft: '1.25rem', lineHeight: 1.6, opacity: 0.9 }}>
          <li>{onChooseInFullPage ? 'Click "Open full page setup" below.' : 'Click "Choose folder" below.'}</li>
          <li>Select or create a folder (e.g. your synced Dropbox folder).</li>
          <li>We create <code style={{ fontSize: '0.9em' }}>workbench.sqlite</code> there as your live database.</li>
        </ol>

        {error ? (
          <p style={{ color: 'var(--danger, #dc2626)', margin: '0 0 12px', fontSize: '0.875rem' }} role="alert">
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
          {allowSkip && onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid var(--border, #e5e7eb)',
                background: 'transparent',
                color: 'var(--text, #111)',
                cursor: busy ? 'default' : 'pointer',
                fontWeight: 500,
                fontSize: '0.875rem',
              }}
            >
              Skip for now
            </button>
          ) : null}
          <button
            type="button"
            onClick={chooseFolder}
            disabled={busy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent, #2563eb)',
              color: '#fff',
              cursor: busy ? 'wait' : 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            <FolderOpen size={18} aria-hidden />
            {onChooseInFullPage ? 'Open full page setup' : busy ? 'Setting up…' : 'Choose folder'}
          </button>
        </div>
      </div>
    </div>
  );
};
