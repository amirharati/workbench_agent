import React, { useState } from 'react';
import type { BackupStatusSnapshot, RestoreBackupResult } from '../../lib/backupCoordinator';
import type { DbWorkerStatus } from '../../lib/storage/dbClient';
import type { AISettings } from '../../lib/ai/types';
import { clearAllLibraryData } from '../../lib/db';
import {
  listFolderSqliteBackups,
  restoreFolderBackupIntoApp,
  type FolderSqliteBackupInfo,
} from '../../lib/backupSnapshots';
import { formatRestoreSummary } from '../../lib/itemQuickAccess';
import { PipelineDebugSection } from './PipelineDebugSection';
import { CategorizationSetupSection } from './CategorizationPanel';
import { useToast } from '../ToastContainer';
import { ThemeSelector } from '../ThemeToggle';
import { uiPatterns } from '../../styles/uiPatterns';

type FontScalePreset = 'small' | 'normal' | 'large';
export type SettingsSection = 'general' | 'ai' | 'backup' | 'advanced';

export const resolveInitialSettingsSection = (
  backupFolderLinked: boolean,
  backupFolderReady?: boolean
): SettingsSection => (backupFolderLinked && backupFolderReady ? 'general' : 'backup');

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'AI & processing' },
  { id: 'backup', label: 'Backup & restore' },
  { id: 'advanced', label: 'Advanced' },
];
const FONT_SCALE_VALUES: Record<FontScalePreset, string> = {
  small: '0.9',
  normal: '1',
  large: '1.15',
};

interface SettingsViewProps {
  /** Handle is persisted — folder was linked (permission may still be paused). */
  backupFolderLinked?: boolean;
  /** Chrome currently grants read/write on the linked folder. */
  backupFolderReady?: boolean;
  backupFolderName?: string | null;
  onSetAsBrowserHome?: () => Promise<void>;
  onChooseBackupFolder?: () => Promise<void>;
  onRestoreBackupFile?: (file: File, mode: 'replace' | 'merge') => Promise<RestoreBackupResult>;
  onManualBackup?: () => Promise<void>;
  onExportJsonSnapshot?: () => Promise<void>;
  onExportPipelineAnalysis?: () => Promise<void>;
  onResolveConflictLoadRemote?: () => Promise<void>;
  onResolveConflictKeepLocal?: () => Promise<void>;
  backupStatus?: BackupStatusSnapshot;
  folderMirrorStatus?: DbWorkerStatus | null;
  aiSettings?: AISettings;
  onSaveAISettings?: (settings: AISettings) => Promise<void>;
  onTestAI?: (
    settings: AISettings,
    prompt: string
  ) => Promise<{ text: string; model: string; requestedModel?: string; modelMismatch?: boolean }>;
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

export const SettingsView: React.FC<SettingsViewProps> = ({
  backupFolderLinked = false,
  backupFolderReady,
  backupFolderName,
  onSetAsBrowserHome,
  onChooseBackupFolder,
  onRestoreBackupFile,
  onManualBackup,
  onExportJsonSnapshot,
  onExportPipelineAnalysis,
  onResolveConflictLoadRemote,
  onResolveConflictKeepLocal,
  backupStatus,
  folderMirrorStatus,
  aiSettings,
  onSaveAISettings,
  onTestAI,
}) => {
  const [fontScale, setFontScale] = useState<FontScalePreset>(() => {
    const stored = localStorage.getItem('workbench-font-scale');
    if (stored === '0.9') return 'small';
    if (stored === '1.15') return 'large';
    return 'normal';
  });
  const [activeSection, setActiveSection] = useState<SettingsSection>(() =>
    resolveInitialSettingsSection(backupFolderLinked, backupFolderReady)
  );

  const handleFontScaleChange = (preset: FontScalePreset) => {
    const value = FONT_SCALE_VALUES[preset];
    setFontScale(preset);
    localStorage.setItem('workbench-font-scale', value);
    document.documentElement.style.setProperty('--font-scale', value);
  };

  const [restoreMode, setRestoreMode] = React.useState<'replace' | 'merge'>('replace');
  const [restoringBackup, setRestoringBackup] = React.useState(false);
  const [exportingJson, setExportingJson] = React.useState(false);
  const [exportingPipeline, setExportingPipeline] = React.useState(false);
  const { addToast } = useToast();
  const [, forceTick] = React.useState(0);
  const [resolving, setResolving] = React.useState<null | 'remote' | 'local'>(null);
  const [aiForm, setAiForm] = React.useState<AISettings | null>(aiSettings ?? null);
  const [isSavingAI, setIsSavingAI] = React.useState(false);
  const [isTestingAI, setIsTestingAI] = React.useState(false);
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [aiTestPrompt, setAiTestPrompt] = React.useState(
    'Reply with exactly: Homebase AI ready.'
  );
  const [aiTestOutput, setAiTestOutput] = React.useState('');
  const [aiTestModel, setAiTestModel] = React.useState('');
  const [aiRequestedModel, setAiRequestedModel] = React.useState('');
  const [aiModelMismatch, setAiModelMismatch] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [clearLibraryConfirm, setClearLibraryConfirm] = React.useState('');
  const [clearingLibrary, setClearingLibrary] = React.useState(false);
  const [folderBackups, setFolderBackups] = React.useState<FolderSqliteBackupInfo[]>([]);
  const [folderBackupsLoading, setFolderBackupsLoading] = React.useState(false);
  const [restoringFolderBackup, setRestoringFolderBackup] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (aiSettings) setAiForm(aiSettings);
  }, [aiSettings]);

  const refreshFolderBackups = React.useCallback(async () => {
    if (!backupFolderReady) {
      setFolderBackups([]);
      return;
    }
    setFolderBackupsLoading(true);
    try {
      const res = await listFolderSqliteBackups();
      setFolderBackups(res.ok && res.backups ? res.backups : []);
    } catch {
      setFolderBackups([]);
    } finally {
      setFolderBackupsLoading(false);
    }
  }, [backupFolderReady]);

  React.useEffect(() => {
    void refreshFolderBackups();
  }, [refreshFolderBackups, folderMirrorStatus?.lastMirrorAt]);
  // Re-render every 30s so the relative timestamps stay current without a
  // websocket / fancy state machine.
  React.useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleRestoreInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onRestoreBackupFile) return;
    if (restoreMode === 'merge') {
      addToast({ type: 'info', message: 'Merge import is coming soon. Please use Replace for now.' });
      return;
    }
    setRestoringBackup(true);
    try {
      const result = await onRestoreBackupFile(file, restoreMode);
      if (result.cancelled) return;
      if (result.ok && result.unchanged) {
        addToast({
          type: 'info',
          message: 'That backup matches your live database — nothing was changed.',
        });
      } else if (result.ok && result.stats) {
        const s = result.stats;
        const safetyNote = result.safetyRef ? ` Saved ${result.safetyRef} first.` : '';
        const label = result.format === 'sqlite' ? 'Database' : 'Backup';
        addToast({
          type: 'success',
          message: `${label} restored: ${formatRestoreSummary(s)}.${safetyNote}`,
        });
        if (result.warnings?.length) {
          addToast({
            type: 'info',
            message: `Backup notes: ${result.warnings[0]}${result.warnings.length > 1 ? ` (+${result.warnings.length - 1} more in console)` : ''}`,
          });
        }
      } else {
        addToast({ type: 'error', message: result.error ?? 'Restore failed' });
      }
    } finally {
      setRestoringBackup(false);
    }
  };

  const manualOk = backupStatus?.lastManualOkAt ?? null;
  const errorAt = backupStatus?.lastErrorAt ?? null;
  const errorMsg = backupStatus?.lastError ?? null;
  const inFlight = backupStatus?.inFlight ?? false;
  const mirrorAt = folderMirrorStatus?.lastMirrorAt ?? 0;
  const mirrorPending = folderMirrorStatus?.mirrorPending ?? false;
  const mirrorError = folderMirrorStatus?.lastMirrorError ?? null;
  const conflict = backupStatus?.conflict ?? null;
  const conflictBlocking = !!conflict?.blocking;
  const manualDisabled = !backupFolderReady || inFlight || conflictBlocking;
  const jsonExportDisabled = manualDisabled || exportingJson;
  const aiDisabled = !aiForm || isSavingAI || isTestingAI;

  const handleExportJson = async () => {
    if (!onExportJsonSnapshot) return;
    setExportingJson(true);
    try {
      await onExportJsonSnapshot();
    } finally {
      setExportingJson(false);
    }
  };

  const handleExportPipelineAnalysis = async () => {
    if (!onExportPipelineAnalysis) return;
    setExportingPipeline(true);
    try {
      await onExportPipelineAnalysis();
    } finally {
      setExportingPipeline(false);
    }
  };

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

  const updateAiField = <K extends keyof AISettings>(field: K, value: AISettings[K]) => {
    setAiForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSaveAI = async () => {
    if (!aiForm || !onSaveAISettings) return;
    setIsSavingAI(true);
    setAiError(null);
    try {
      await onSaveAISettings(aiForm);
      setAiTestOutput('AI settings saved.');
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Could not save AI settings.');
    } finally {
      setIsSavingAI(false);
    }
  };

  const handleTestAI = async () => {
    if (!aiForm || !onTestAI) return;
    setIsTestingAI(true);
    setAiError(null);
    setAiTestOutput('');
    setAiTestModel('');
    setAiRequestedModel('');
    setAiModelMismatch(false);
    try {
      const result = await onTestAI(aiForm, aiTestPrompt);
      setAiTestOutput(result.text);
      setAiTestModel(result.model);
      setAiRequestedModel(result.requestedModel ?? '');
      setAiModelMismatch(Boolean(result.modelMismatch));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI test failed.');
    } finally {
      setIsTestingAI(false);
    }
  };

  return (
    <div
      className="settings-view"
      style={{
        width: '100%',
        maxWidth: 1080,
        paddingBottom: 'max(5rem, env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div>
        <h1 style={uiPatterns.pageTitle}>
          Settings
        </h1>
        <p style={uiPatterns.pageDescription}>
          Configure Homebase, AI processing, and how your library is protected.
        </p>
      </div>

      <nav
        aria-label="Settings sections"
        style={{
          ...uiPatterns.tabBar,
          overflowX: 'auto',
        }}
      >
        {SETTINGS_SECTIONS.map((section) => {
          const selected = activeSection === section.id;
          const needsAttention = section.id === 'backup' && (!backupFolderReady || conflictBlocking);
          return (
            <button
              key={section.id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => setActiveSection(section.id)}
              style={{
                ...uiPatterns.viewTab(selected),
                whiteSpace: 'nowrap',
              }}
            >
              {section.label}{needsAttention ? ' ·' : ''}
            </button>
          );
        })}
      </nav>

      {activeSection === 'general' ? (
        <>

      {/* Appearance section */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1rem',
          background: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>Appearance</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Color theme</div>
        <ThemeSelector />
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Font size</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['small', 'normal', 'large'] as FontScalePreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleFontScaleChange(preset)}
              style={{
                padding: '5px 14px',
                borderRadius: 6,
                border: fontScale === preset ? '2px solid #6366f1' : '1px solid var(--border)',
                background: fontScale === preset ? 'rgba(99,102,241,0.1)' : 'var(--bg-panel)',
                color: fontScale === preset ? 'var(--accent-hover)' : 'var(--text)',
                fontWeight: fontScale === preset ? 600 : 400,
                fontSize: '0.85rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1rem',
          background: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>Home Page Setup</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Use Homebase as your browser home/startup page. This opens Chrome settings and copies the Homebase URL.
        </div>
        <div>
          <button
            type="button"
            onClick={() => onSetAsBrowserHome?.()}
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
            Set Homebase as Home
          </button>
        </div>
      </div>

        </>
      ) : null}

      {activeSection === 'ai' ? (
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1rem',
          background: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>AI Settings</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Configure one default AI provider/model for now. This keeps v1 simple and can fan out by task later.
        </div>
        {aiForm ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: '0.65rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)' }}>
              Provider
              <select
                value={aiForm.provider}
                onChange={(e) => updateAiField('provider', e.target.value as AISettings['provider'])}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)' }}
              >
                <option value="openrouter">OpenRouter (OpenAI-compatible)</option>
                <option value="chrome-native">Chrome native (on-device)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)' }}>
              Model ID
              <input
                value={aiForm.model}
                onChange={(e) => updateAiField('model', e.target.value)}
                placeholder="openai/gpt-4o-mini"
                disabled={aiForm.provider === 'chrome-native'}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)', gridColumn: '1 / span 2' }}>
              Base URL
              <input
                value={aiForm.baseUrl}
                onChange={(e) => updateAiField('baseUrl', e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                disabled={aiForm.provider === 'chrome-native'}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)', gridColumn: '1 / span 2' }}>
              API Key
              <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                <input
                  value={aiForm.apiKey}
                  onChange={(e) => updateAiField('apiKey', e.target.value)}
                  placeholder="sk-or-..."
                  type={showApiKey ? 'text' : 'password'}
                  autoComplete="off"
                  disabled={aiForm.provider === 'chrome-native'}
                  style={{
                    padding: '0.45rem 0.55rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    flex: 1,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  style={{
                    padding: '0.42rem 0.6rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-panel)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                  title={showApiKey ? 'Hide API key' : 'Show API key'}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? 'Hide' : 'Show'} key
                </button>
              </div>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)' }}>
              Model routing
              <select
                value={aiForm.routingMode}
                onChange={(e) =>
                  updateAiField('routingMode', e.target.value as AISettings['routingMode'])
                }
                disabled={aiForm.provider === 'chrome-native'}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)' }}
              >
                <option value="single">Single model for all tasks</option>
                <option value="by-task">Route by task type</option>
              </select>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.82rem',
                color: 'var(--text)',
                marginTop: '1.35rem',
                opacity: aiForm.provider === 'chrome-native' ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={aiForm.strictModelMatch}
                onChange={(e) => updateAiField('strictModelMatch', e.target.checked)}
                disabled={aiForm.provider === 'chrome-native'}
              />
              Fail if provider returns a different model id
            </label>
            {aiForm.routingMode === 'by-task' && aiForm.provider !== 'chrome-native' ? (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)' }}>
                  Task model: summarize
                  <input
                    value={aiForm.taskModels?.summarize ?? ''}
                    onChange={(e) =>
                      updateAiField('taskModels', {
                        ...(aiForm.taskModels ?? {}),
                        summarize: e.target.value,
                      })
                    }
                    placeholder="optional override model id"
                    style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)' }}>
                  Task model: tag
                  <input
                    value={aiForm.taskModels?.tag ?? ''}
                    onChange={(e) =>
                      updateAiField('taskModels', {
                        ...(aiForm.taskModels ?? {}),
                        tag: e.target.value,
                      })
                    }
                    placeholder="optional override model id"
                    style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </label>
              </>
            ) : null}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)' }}>
              Timeout (ms)
              <input
                value={String(aiForm.timeoutMs)}
                onChange={(e) => updateAiField('timeoutMs', Number(e.target.value) || 0)}
                type="number"
                min={3000}
                max={120000}
                step={1000}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)' }}>
              Temperature
              <input
                value={String(aiForm.temperature)}
                onChange={(e) => updateAiField('temperature', Number(e.target.value) || 0)}
                type="number"
                min={0}
                max={2}
                step={0.1}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)' }}>
              Max output tokens
              <input
                value={String(aiForm.maxOutputTokens)}
                onChange={(e) => updateAiField('maxOutputTokens', Number(e.target.value) || 0)}
                type="number"
                min={64}
                max={8192}
                step={32}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text)', gridColumn: '1 / span 2' }}>
              Test prompt
              <textarea
                value={aiTestPrompt}
                onChange={(e) => setAiTestPrompt(e.target.value)}
                rows={3}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical' }}
              />
            </label>
          </div>
        ) : (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading AI settings...</div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={aiDisabled}
            onClick={handleSaveAI}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: 'none',
              background: aiDisabled ? '#93c5fd' : '#2563eb',
              color: '#fff',
              cursor: aiDisabled ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {isSavingAI ? 'Saving...' : 'Save AI settings'}
          </button>
          <button
            type="button"
            disabled={aiDisabled}
            onClick={handleTestAI}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: '1px solid #16a34a',
              background: aiDisabled ? '#86efac' : '#16a34a',
              color: '#fff',
              cursor: aiDisabled ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {isTestingAI ? 'Running test...' : 'Run test prompt'}
          </button>
        </div>
        {aiError && (
          <div style={{ fontSize: '0.82rem', color: 'var(--error)' }}>
            <strong>AI error:</strong> {aiError}
          </div>
        )}
        <div
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.65rem',
            lineHeight: 1.45,
          }}
        >
          <strong>Security note:</strong> API key is stored in this extension&apos;s local browser storage
          (`chrome.storage.local`) for convenience. Other websites cannot read it directly, but anyone with
          deep local/profile access to your machine may still extract it. Use provider-side spend limits and
          a dedicated key.
        </div>
        {aiModelMismatch && !aiForm?.strictModelMatch && (
          <div style={{ fontSize: '0.82rem', color: 'var(--er-warn, #d29922)' }}>
            <strong>Model mismatch:</strong> requested <code>{aiRequestedModel || '-'}</code>, provider returned{' '}
            <code>{aiTestModel || '-'}</code>. Enable strict matching to fail these responses.
          </div>
        )}
        {aiTestOutput && (
          <div
            style={{
              fontSize: '0.82rem',
              color: 'var(--text)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.65rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {aiTestModel ? (
              <div style={{ marginBottom: '0.35rem' }}>
                <strong>Provider model:</strong> <code>{aiTestModel}</code>
              </div>
            ) : null}
            {aiRequestedModel ? (
              <div style={{ marginBottom: '0.35rem' }}>
                <strong>Requested model:</strong> <code>{aiRequestedModel}</code>
              </div>
            ) : null}
            <strong>AI response:</strong> {aiTestOutput}
          </div>
        )}
      </div>

      ) : null}

      {activeSection === 'advanced' ? (
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1rem',
          background: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>Taxonomy & diagnostics</div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Maintenance and diagnostic tools. Run normal enrichment and categorization work from the
          Enrichment Hub.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportPipelineAnalysis}
            disabled={!onExportPipelineAnalysis || exportingPipeline}
            title="Dump current enrich + classify state for all bookmarks (CLI-comparable JSONL)"
            style={{
              padding: '2px 10px',
              height: 24,
              borderRadius: 4,
              border: '1px solid #6366f1',
              background: exportingPipeline ? 'var(--bg-active)' : 'var(--accent-weak)',
              color: 'var(--accent-hover)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: !onExportPipelineAnalysis || exportingPipeline ? 'not-allowed' : 'pointer',
              opacity: !onExportPipelineAnalysis ? 0.6 : 1,
            }}
          >
            {exportingPipeline ? 'Exporting…' : 'Export pipeline analysis'}
          </button>
        </div>
        <CategorizationSetupSection />
        <PipelineDebugSection />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!backupFolderLinked && (
            <span style={{ fontSize: '0.8rem', color: 'var(--er-warn, #d29922)' }}>
              Choose a backup folder below for disk cache.
            </span>
          )}
        </div>
      </div>

      ) : null}

      {activeSection === 'backup' ? (
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1rem',
          background: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>Backup & restore</div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
          Automatic protection
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Homebase keeps the live database in your chosen folder up to date after changes and rotates
          two previous copies before overwriting it. This runs automatically once the folder is connected.
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Status:{' '}
          {!backupFolderLinked
            ? 'Not linked'
            : backupFolderReady
              ? `Linked${backupFolderName ? ` (${backupFolderName})` : ''} — syncing`
              : `Linked${backupFolderName ? ` (${backupFolderName})` : ''} — sync paused until you click the page once`}
        </div>

        {/* Conflict banner — shown when coordinator paused due to remote/different-device write */}
        {conflictBlocking && conflict && (
          <div
            style={{
              border: '1px solid var(--error)',
              background: 'var(--error-weak)',
              borderRadius: 8,
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--error)', fontSize: '0.9rem' }}>
              Backup paused — sync conflict detected
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--error)', lineHeight: 1.5 }}>
              {conflict.message}
            </div>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text)',
                background: 'var(--bg-panel)',
                border: '1px solid var(--error)',
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
                  <strong>Folder meta (<code>workbench.meta.json</code>):</strong> revision{' '}
                  <code>{conflict.remote.revision}</code> · {shortDevice(conflict.remote.deviceId)} · written{' '}
                  {formatRelative(conflict.remote.exportedAt)}{' '}
                  <span style={{ color: 'var(--text-faint)' }}>({formatAbsolute(conflict.remote.exportedAt)})</span>
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
                title="Load workbench.sqlite from the folder. Your current local data is first saved as safety-before-import-… in the same folder."
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
                  border: '1px solid var(--error)',
                  background: resolving === 'local' ? 'var(--error)' : '#fff',
                  color: 'var(--error)',
                  cursor: resolving ? 'progress' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
                title="Overwrite the folder's workbench.sqlite with this device's OPFS database."
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
              color: 'var(--text)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.65rem',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
            }}
          >
            <div>
              <strong>Live mirror (<code>workbench.sqlite</code>):</strong>{' '}
              {mirrorAt > 0 ? (
                <>
                  last write {formatRelative(mirrorAt)}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>({formatAbsolute(mirrorAt)})</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>none yet</span>
              )}
              {mirrorPending && (
                <span style={{ marginLeft: '0.5rem', color: '#2563eb', fontWeight: 600 }}>
                  · mirroring soon…
                </span>
              )}
              {inFlight && (
                <span style={{ marginLeft: '0.5rem', color: '#2563eb', fontWeight: 600 }}>
                  · writing…
                </span>
              )}
              {conflictBlocking && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--error)', fontWeight: 600 }}>
                  · paused (conflict)
                </span>
              )}
            </div>
            {mirrorError && (
              <div style={{ color: 'var(--error)' }}>
                <strong>Last mirror error:</strong> {mirrorError}
              </div>
            )}
            <div>
              <strong>Manual snapshot:</strong>{' '}
              {manualOk ? (
                <>
                  last write {formatRelative(manualOk)}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>({formatAbsolute(manualOk)})</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>none yet</span>
              )}
            </div>
            {errorAt && errorMsg && (
              <div style={{ color: 'var(--error)' }}>
                <strong>Last backup error:</strong> {errorMsg}{' '}
                <span style={{ color: 'var(--text-faint)' }}>({formatRelative(errorAt)})</span>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            fontSize: '0.82rem',
            color: 'var(--text)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.65rem',
            lineHeight: 1.45,
          }}
        >
          <div><strong>How folder protection works</strong></div>
          <div>
            1) If <code>workbench.sqlite</code> already exists there, the app loads it into browser storage (OPFS).
          </div>
          <div>
            2) If the folder is empty, the app creates <code>workbench.sqlite</code> from your current data on first save.
          </div>
          <div>3) Legacy <code>latest.json</code> in the folder can still be restored via Settings.</div>
          <div style={{ marginTop: '0.4rem' }}><strong>Automatic and manual files</strong></div>
          <div>
            · <strong>Live mirror:</strong> after edits, <code>workbench.sqlite</code> +{' '}
            <code>workbench.meta.json</code> refresh in the folder (debounced ~3s, min interval 60s).
          </div>
          <div>
            · <strong>Backup now:</strong> writes <code>manual-YYYY-MM-DD_HHMMSS.sqlite</code> (after refreshing the live mirror).
          </div>
          <div>
            · <strong>Export JSON:</strong> optional portable snapshot as <code>manual-…json</code> (human-readable; restore via Settings).
          </div>
          <div>
            · <strong>Sync safety:</strong> if folder meta was written by another device, writes pause until you choose Load remote or Keep local; Load remote saves local first as <code>safety-before-import-…</code>.
          </div>
          <div>
            · <strong>Auto snapshots:</strong> before each live overwrite, the app rotates{' '}
            <code>workbench.prev.sqlite</code> / <code>workbench.prev2.sqlite</code> so you can roll back.
          </div>
        </div>

        <div
          style={{
            marginTop: 4,
            paddingTop: '0.85rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>
            Snapshots & restore
          </div>
          <div style={{ marginTop: 3, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Create named point-in-time copies when you want one, or restore an earlier automatic,
            manual, or safety copy.
          </div>
        </div>

        {backupFolderReady && (
          <div
            style={{
              fontSize: '0.82rem',
              color: 'var(--text)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.65rem',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
              <div>
                <strong>Backups in your folder</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  Live, automatic <code>prev</code> copies, and <code>manual-</code> /{' '}
                  <code>safety-</code> files. <strong>Restore replaces</strong> the browser library
                  with that file (not a merge). Current live is snapshotted into rotation first.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshFolderBackups()}
                disabled={folderBackupsLoading || !!restoringFolderBackup}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-panel)',
                  cursor: folderBackupsLoading ? 'progress' : 'pointer',
                  fontSize: '0.78rem',
                }}
              >
                {folderBackupsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {folderBackups.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>
                No sqlite files found yet — add bookmarks so <code>workbench.sqlite</code> is created,
                then use <strong>Backup now</strong> or wait for auto <code>prev</code> copies after edits.
              </div>
            ) : (
              folderBackups.map((snap) => {
                const sizeKb = Math.max(1, Math.round(snap.byteLength / 1024));
                const kindLabel =
                  snap.kind === 'live'
                    ? 'Live'
                    : snap.kind === 'undo'
                      ? 'Undo last restore'
                      : snap.kind === 'auto'
                      ? snap.slot === 1
                        ? 'Auto prev (−1)'
                        : `Auto prev${snap.slot} (−${snap.slot})`
                      : snap.kind === 'manual'
                        ? 'Manual'
                        : snap.kind === 'safety'
                          ? 'Safety'
                          : 'Other';
                const isLive = snap.kind === 'live';
                return (
                  <div
                    key={snap.filename}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '0.45rem 0.55rem',
                      background: 'var(--bg-panel)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {kindLabel} · <code>{snap.filename}</code>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {sizeKb} KB
                        {snap.mtime
                          ? ` · ${formatRelative(snap.mtime)} (${formatAbsolute(snap.mtime)})`
                          : ''}
                      </div>
                    </div>
                    {isLive ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Current live file</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!!restoringFolderBackup || conflictBlocking}
                        title={
                          conflictBlocking
                            ? 'Resolve the sync conflict above first'
                            : 'Snapshot current live, then restore this copy into workbench.sqlite'
                        }
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Replace your current library with ${snap.filename}?\n\n` +
                                `This is a full restore (not a merge). Items only in the browser that are not in this file will disappear.\n\n` +
                                `Your current live database will be saved into the snapshot rotation first so you can undo.`
                            )
                          ) {
                            return;
                          }
                          setRestoringFolderBackup(snap.filename);
                          try {
                            const res = await restoreFolderBackupIntoApp(snap.filename);
                            if (!res.ok) {
                              addToast({ type: 'error', message: res.error ?? 'Restore failed' });
                              return;
                            }
                            await refreshFolderBackups();
                            addToast({
                              type: 'success',
                              message: `Restored ${snap.filename} (full replace). Current live was snapshotted first.`,
                            });
                          } catch (e) {
                            addToast({ type: 'error', message: String(e) });
                          } finally {
                            setRestoringFolderBackup(null);
                          }
                        }}
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: 6,
                          border: '1px solid var(--er-warn, #d29922)',
                          background:
                            restoringFolderBackup === snap.filename
                              ? 'color-mix(in srgb, var(--er-warn, #d29922) 20%, var(--bg-panel))'
                              : 'color-mix(in srgb, var(--er-warn, #d29922) 8%, var(--bg-panel))',
                          color: 'var(--er-warn, #d29922)',
                          cursor: restoringFolderBackup || conflictBlocking ? 'not-allowed' : 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                        }}
                      >
                        {restoringFolderBackup === snap.filename ? 'Restoring…' : 'Restore'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

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
            {backupFolderLinked ? 'Change backup folder' : 'Choose backup folder'}
          </button>

          <button
            type="button"
            onClick={() => onManualBackup?.()}
            disabled={manualDisabled}
            title={
              !backupFolderLinked
                ? 'Link a backup folder first'
                : !backupFolderReady
                ? 'Click the page once to resume folder access, then try again'
                : conflictBlocking
                ? 'Resolve the sync conflict above first'
                : inFlight
                ? 'A backup is already running'
                : 'Refresh live mirror, then write manual-YYYY-MM-DD_HHMMSS.sqlite'
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

          <button
            type="button"
            onClick={handleExportJson}
            disabled={jsonExportDisabled || !onExportJsonSnapshot}
            title={
              !backupFolderLinked
                ? 'Link a backup folder first'
                : !backupFolderReady
                ? 'Click the page once to resume folder access, then try again'
                : conflictBlocking
                ? 'Resolve the sync conflict above first'
                : 'Write a portable manual-YYYY-MM-DD_HHMMSS.json snapshot'
            }
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: '1px solid #6366f1',
              background: jsonExportDisabled ? '#c7d2fe' : '#6366f1',
              color: '#fff',
              cursor: jsonExportDisabled ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              opacity: jsonExportDisabled ? 0.7 : 1,
            }}
          >
            {exportingJson ? 'Exporting…' : 'Export JSON snapshot'}
          </button>

          <select
            value={restoreMode}
            onChange={(e) => setRestoreMode(e.target.value as 'replace' | 'merge')}
            style={{
              padding: '0.5rem 0.6rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--text)',
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
              border: '1px solid var(--border)',
              background: restoringBackup ? 'var(--bg-hover)' : 'var(--bg-panel)',
              color: restoringBackup ? 'var(--text-faint)' : 'var(--text)',
              cursor: restoringBackup || !backupFolderLinked || !backupFolderReady ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              opacity: !backupFolderLinked || !backupFolderReady ? 0.7 : 1,
            }}
            title={
              !backupFolderLinked
                ? 'Link a backup folder first (needed for safety snapshot)'
                : !backupFolderReady
                ? 'Click the page once to resume folder access, then try again'
                : 'Pick a .sqlite/.json from disk (e.g. outside this folder). Folder copies are listed above.'
            }
          >
            {restoringBackup ? 'Restoring…' : 'Restore from other file…'}
            <input
              type="file"
              accept=".sqlite,.json,application/json,application/x-sqlite3,application/vnd.sqlite3"
              style={{ display: 'none' }}
              onChange={handleRestoreInput}
              disabled={restoringBackup || !backupFolderLinked || !backupFolderReady || !onRestoreBackupFile || restoreMode === 'merge'}
            />
          </label>
        </div>

        <div
          style={{
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--error)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--error)' }}>
            Testing — clear library
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--error)', lineHeight: 1.45 }}>
            Deletes all bookmarks, notes, enrichment, categories, and pipeline state from browser
            storage and overwrites <code>workbench.sqlite</code> in your backup folder with an empty
            library (Inbox + Incoming only). Use this instead of uninstalling the
            extension when re-testing imports.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={clearLibraryConfirm}
              onChange={(e) => setClearLibraryConfirm(e.target.value)}
              placeholder="Type DELETE to confirm"
              autoComplete="off"
              disabled={clearingLibrary || !backupFolderReady}
              style={{
                padding: '0.45rem 0.6rem',
                borderRadius: 8,
                border: '1px solid var(--error)',
                fontSize: '0.85rem',
                minWidth: 180,
              }}
            />
            <button
              type="button"
              disabled={
                clearingLibrary ||
                !backupFolderReady ||
                clearLibraryConfirm.trim() !== 'DELETE'
              }
              onClick={async () => {
                if (
                  !window.confirm(
                    'Delete the entire library?\n\nAll bookmarks, enrichment, and categories will be removed. The backup folder sqlite file will be replaced.\n\nThis cannot be undone.'
                  )
                ) {
                  return;
                }
                setClearingLibrary(true);
                try {
                  const result = await clearAllLibraryData();
                  if (!result.ok) {
                    throw new Error(result.error ?? 'Clear failed');
                  }
                  // Re-import seed taxonomy immediately so classify is ready on next run.
                  try {
                    const { importSeedTaxonomy } = await import('../../lib/categorization/classifyTopicExtract');
                    await importSeedTaxonomy(false);
                  } catch {
                    // non-fatal
                  }
                  setClearLibraryConfirm('');
                  const bits: string[] = ['Library cleared — import from scratch.'];
                  if (result.enrichmentCacheFilesRemoved) {
                    bits.push(`${result.enrichmentCacheFilesRemoved} cache file(s) removed`);
                  }
                  if (result.pipelineArtifactEntriesRemoved) {
                    bits.push(`${result.pipelineArtifactEntriesRemoved} pipeline debug file(s) removed`);
                  }
                  addToast({ type: 'success', message: bits.join(' · ') });
                } catch (e) {
                  addToast({
                    type: 'error',
                    message: e instanceof Error ? e.message : 'Failed to clear library',
                  });
                } finally {
                  setClearingLibrary(false);
                }
              }}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                border: '1px solid var(--error)',
                background: clearingLibrary ? 'var(--error)' : '#dc2626',
                color: '#fff',
                cursor:
                  clearingLibrary || !backupFolderReady || clearLibraryConfirm.trim() !== 'DELETE'
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                opacity:
                  clearingLibrary || !backupFolderReady || clearLibraryConfirm.trim() !== 'DELETE'
                    ? 0.65
                    : 1,
              }}
            >
              {clearingLibrary ? 'Clearing…' : 'Clear all library data'}
            </button>
          </div>
          {!backupFolderLinked ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--er-warn, #d29922)' }}>
              Link a backup folder first so the empty database can be mirrored to disk.
            </span>
          ) : !backupFolderReady ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--er-warn, #d29922)' }}>
              Click the page once to resume folder access before clearing.
            </span>
          ) : null}
        </div>
      </div>
      ) : null}
    </div>
  );
};
