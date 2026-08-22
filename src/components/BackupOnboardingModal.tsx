import React, { useState } from 'react';
import { CheckCircle2, FolderOpen, HardDrive, X } from 'lucide-react';
import type {
  BackupFolderCandidate,
  PickBackupFolderCandidateResult,
  PickBackupFolderResult,
} from '../lib/backupFolder';

interface BackupOnboardingModalProps {
  open: boolean;
  /** Side panel: tighter layout */
  compact?: boolean;
  /** If false, onboarding cannot be skipped/dismissed. */
  allowSkip?: boolean;
  /**
   * `choose` = first-time folder pick.
   * `recover` = sticky link flag says we had a folder, but the handle is missing — must re-pick.
   * `reconnect` = handle already saved; Chrome needs permission again (one click, no re-pick).
   */
  mode?: 'choose' | 'recover' | 'reconnect';
  /** Shown in reconnect / recover mode. */
  folderName?: string | null;
  /**
   * Some Chrome extension surfaces are unstable for showDirectoryPicker.
   * If provided, primary action opens full-page setup instead of invoking picker here.
   */
  onChooseInFullPage?: () => void;
  /** Picker + read-only inspection. The handle is not persisted yet. */
  onChooseFolder: () => Promise<PickBackupFolderCandidateResult>;
  /** Persist and initialize only after the candidate is explicitly confirmed. */
  onConfirmFolder: (candidate: BackupFolderCandidate) => Promise<PickBackupFolderResult>;
  /** Re-grant permission on the persisted handle (no directory picker). */
  onReconnectFolder?: () => Promise<PickBackupFolderResult>;
  onSkip?: () => void;
}

export const BackupOnboardingModal: React.FC<BackupOnboardingModalProps> = ({
  open,
  compact,
  allowSkip = false,
  mode = 'choose',
  folderName,
  onChooseInFullPage,
  onChooseFolder,
  onConfirmFolder,
  onReconnectFolder,
  onSkip,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<BackupFolderCandidate | null>(null);
  const reconnect = mode === 'reconnect' && !!onReconnectFolder;
  const recover = mode === 'recover';

  if (!open) return null;

  const chooseFolder = async () => {
    if (onChooseInFullPage) {
      onChooseInFullPage();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onChooseFolder();
      if (result.ok && result.candidate) {
        setCandidate(result.candidate);
        return;
      }
      if (result.error === 'cancelled') {
        setError('Folder selection was cancelled or interrupted. Nothing changed; setup is still waiting.');
        return;
      }
      setError(result.error ?? 'Something went wrong');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const runAction = async () => {
    if (candidate) {
      setBusy(true);
      setError(null);
      try {
        const result = await onConfirmFolder(candidate);
        if (result.ok) return;
        setError(result.error ?? 'Folder setup did not finish. Nothing was marked complete.');
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!reconnect && onChooseInFullPage) {
      onChooseInFullPage();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!reconnect) {
        await chooseFolder();
        return;
      }
      const r = await onReconnectFolder!();
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

  const title = candidate
    ? 'Confirm your data folder'
    : reconnect
    ? 'Reconnect your data folder'
    : recover
      ? 'Re-select your data folder'
      : 'Choose your data folder';
  const body = candidate ? (
    <>
      You selected <code style={{ fontSize: '0.9em' }}>{candidate.folderName}</code>. Review what Homebase
      found before linking it. Chrome prompts or a cancelled picker cannot confirm this step for you.
    </>
  ) : reconnect ? (
    <>
      We’ll use your already-selected folder
      {folderName ? (
        <>
          {' '}
          (<code style={{ fontSize: '0.9em' }}>{folderName}</code>)
        </>
      ) : null}
      . Chrome blocks silent access after reload — one click continues with that
      same folder (no picker). Choose “Allow on every visit” if Chrome offers it
      so this can happen automatically next time.
    </>
  ) : recover ? (
    <>
      Homebase needs your data folder again
      {folderName ? (
        <>
          {' '}
          (previously <code style={{ fontSize: '0.9em' }}>{folderName}</code>)
        </>
      ) : null}
      . The link was lost — pick the same folder that contains{' '}
      <code style={{ fontSize: '0.9em' }}>workbench.sqlite</code>. The app cannot run without it.
    </>
  ) : (
    <>
      Homebase stores your live database as <code style={{ fontSize: '0.9em' }}>workbench.sqlite</code> in a
      folder you pick—ideally inside Dropbox, iCloud Drive, or another sync service. The app cannot run without
      this folder.
    </>
  );

  const primaryLabel = candidate
    ? busy
      ? 'Finishing setup…'
      : 'Use this folder'
    : reconnect
    ? busy
      ? 'Reconnecting…'
      : folderName
        ? `Continue with “${folderName}”`
        : 'Continue with saved folder'
    : onChooseInFullPage
      ? 'Open full page setup'
      : busy
        ? 'Setting up…'
        : recover
          ? folderName
            ? `Choose “${folderName}” again`
            : 'Choose folder again'
          : 'Choose folder';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-onboarding-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--layer-modal-raised)',
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
                {title}
              </h2>
              <p style={{ margin: '8px 0 0', opacity: 0.85, lineHeight: 1.5 }}>{body}</p>
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

        {candidate ? (
          <div
            style={{
              margin: '0 0 16px',
              padding: 12,
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: 10,
              background: 'var(--bg-muted, #f3f4f6)',
            }}
          >
            <div style={{ fontWeight: 650, marginBottom: 8 }}>
              {candidate.source === 'existing-workbench'
                ? 'Existing Homebase library found'
                : candidate.source === 'legacy-json'
                  ? 'Legacy JSON backup found'
                  : candidate.source === 'legacy-sqlite'
                    ? 'Legacy SQLite backup found'
                    : 'No existing Homebase library found'}
            </div>
            {candidate.files.length ? (
              <>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.55 }}>
                  {candidate.files.map((file) => (
                    <li key={file.name}>
                      <code style={{ fontSize: '0.88em' }}>{file.name}</code>{' '}
                      <span style={{ opacity: 0.7 }}>({formatFileSize(file.size)})</span>
                    </li>
                  ))}
                </ul>
                {candidate.source === 'fresh' ? (
                  <p style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
                    No usable core library was found, so Homebase will create{' '}
                    <code style={{ fontSize: '0.88em' }}>workbench.sqlite</code>.
                    {candidate.files.some((file) => file.name === 'workbench-content.sqlite')
                      ? ' The existing content database will be loaded separately.'
                      : ' A new workbench-content.sqlite will also be created.'}
                  </p>
                ) : null}
              </>
            ) : (
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                Homebase will create <code style={{ fontSize: '0.88em' }}>workbench.sqlite</code> and{' '}
                <code style={{ fontSize: '0.88em' }}>workbench-content.sqlite</code> here.
              </p>
            )}
          </div>
        ) : !reconnect ? (
          <ol style={{ margin: '0 0 16px', paddingLeft: '1.25rem', lineHeight: 1.6, opacity: 0.9 }}>
            {recover ? (
              <>
                <li>{onChooseInFullPage ? 'Click "Open full page setup" below.' : 'Click the button below.'}</li>
                <li>Select the same folder that already has your data.</li>
                <li>
                  We load <code style={{ fontSize: '0.9em' }}>workbench.sqlite</code> from that folder.
                </li>
              </>
            ) : (
              <>
                <li>If Chrome shows an extension or New Tab prompt, finish that browser prompt and return here.</li>
                <li>{onChooseInFullPage ? 'Click "Open full page setup" below.' : 'Click "Choose folder" below.'}</li>
                <li>Select or create a folder (e.g. your synced Dropbox folder).</li>
                <li>
                  We create <code style={{ fontSize: '0.9em' }}>workbench.sqlite</code> there as your live
                  database.
                </li>
              </>
            )}
          </ol>
        ) : (
          <p style={{ margin: '0 0 16px', lineHeight: 1.6, opacity: 0.9 }}>
            Prefer a different location? Use “Choose a new folder” below (same picker as first setup).
          </p>
        )}

        {error ? (
          <p style={{ color: 'var(--danger)', margin: '0 0 12px', fontSize: '0.875rem' }} role="alert">
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
          {candidate ? (
            <button
              type="button"
              onClick={() => {
                setCandidate(null);
                setError(null);
                void chooseFolder();
              }}
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
              Choose a different folder
            </button>
          ) : reconnect ? (
            <button
              type="button"
              onClick={() => {
                if (onChooseInFullPage) {
                  onChooseInFullPage();
                  return;
                }
                void chooseFolder();
              }}
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
              Choose a new folder
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void runAction()}
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
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export type BackupSetupReceipt = {
  folderName: string;
  mode: 'fresh' | 'existing-workbench' | 'legacy-json' | 'legacy-sqlite';
  itemCount: number;
  details: string[];
};

export const BackupSetupResultModal: React.FC<{
  receipt: BackupSetupReceipt;
  onContinue: () => void;
}> = ({ receipt, onContinue }) => {
  const title =
    receipt.mode === 'fresh'
      ? 'New Homebase library created'
      : receipt.mode === 'existing-workbench'
        ? 'Existing Homebase library loaded'
        : 'Existing Homebase backup migrated';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-setup-result-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--layer-modal-raised)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
          borderRadius: 16,
          border: '1px solid var(--border, #e5e7eb)',
          background: 'var(--bg-panel, #fff)',
          color: 'var(--text, #111)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <CheckCircle2 size={28} style={{ color: 'var(--success, #15803d)', flexShrink: 0 }} aria-hidden />
          <div>
            <h2 id="backup-setup-result-title" style={{ margin: 0, fontSize: '1.125rem' }}>
              {title}
            </h2>
            <p style={{ margin: '7px 0 0', lineHeight: 1.5, opacity: 0.85 }}>
              Folder: <code style={{ fontSize: '0.9em' }}>{receipt.folderName}</code>
            </p>
          </div>
        </div>
        <div
          style={{
            margin: '18px 0',
            padding: 14,
            borderRadius: 10,
            background: 'var(--bg-muted, #f3f4f6)',
            border: '1px solid var(--border, #e5e7eb)',
          }}
        >
          <div style={{ fontWeight: 650, marginBottom: 8 }}>
            {receipt.itemCount.toLocaleString()} library item{receipt.itemCount === 1 ? '' : 's'} ready
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
            {receipt.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={onContinue}
            autoFocus
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent, #2563eb)',
              color: '#fff',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            Continue to Homebase
          </button>
        </div>
      </div>
    </div>
  );
};
