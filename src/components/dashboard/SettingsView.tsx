import React, { useState } from 'react';
import type { BackupStatusSnapshot } from '../../lib/backupCoordinator';
import type { AISettings } from '../../lib/ai/types';
import { EnrichmentPanel } from './EnrichmentPanel';
import { CategorizationSetupSection } from './CategorizationPanel';

type FontScalePreset = 'small' | 'normal' | 'large';
const FONT_SCALE_VALUES: Record<FontScalePreset, string> = {
  small: '0.9',
  normal: '1',
  large: '1.15',
};

interface SettingsViewProps {
  backupFolderReady?: boolean;
  backupFolderName?: string | null;
  onSetAsBrowserHome?: () => Promise<void>;
  onChooseBackupFolder?: () => Promise<void>;
  onRestoreBackupFile?: (file: File, mode: 'replace' | 'merge') => Promise<void>;
  onManualBackup?: () => Promise<void>;
  onResolveConflictLoadRemote?: () => Promise<void>;
  onResolveConflictKeepLocal?: () => Promise<void>;
  backupStatus?: BackupStatusSnapshot;
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
  backupFolderReady,
  backupFolderName,
  onSetAsBrowserHome,
  onChooseBackupFolder,
  onRestoreBackupFile,
  onManualBackup,
  onResolveConflictLoadRemote,
  onResolveConflictKeepLocal,
  backupStatus,
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

  const handleFontScaleChange = (preset: FontScalePreset) => {
    const value = FONT_SCALE_VALUES[preset];
    setFontScale(preset);
    localStorage.setItem('workbench-font-scale', value);
    document.documentElement.style.setProperty('--font-scale', value);
  };

  const [restoreMode, setRestoreMode] = React.useState<'replace' | 'merge'>('replace');
  const [, forceTick] = React.useState(0);
  const [resolving, setResolving] = React.useState<null | 'remote' | 'local'>(null);
  const [aiForm, setAiForm] = React.useState<AISettings | null>(aiSettings ?? null);
  const [isSavingAI, setIsSavingAI] = React.useState(false);
  const [isTestingAI, setIsTestingAI] = React.useState(false);
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [aiTestPrompt, setAiTestPrompt] = React.useState(
    'Reply with exactly: Workbench AI ready.'
  );
  const [aiTestOutput, setAiTestOutput] = React.useState('');
  const [aiTestModel, setAiTestModel] = React.useState('');
  const [aiRequestedModel, setAiRequestedModel] = React.useState('');
  const [aiModelMismatch, setAiModelMismatch] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (aiSettings) setAiForm(aiSettings);
  }, [aiSettings]);

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
  const aiDisabled = !aiForm || isSavingAI || isTestingAI;

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
    <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#111827' }}>Settings</h1>
      <p style={{ marginTop: '0.5rem', color: '#6b7280' }}>
        Backup is required for safe usage. Configure your folder below, then you can restore from a backup file any time.
      </p>

      {/* Appearance section */}
      <div
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 10,
          padding: '1rem',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>Appearance</div>
        <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>Font size</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['small', 'normal', 'large'] as FontScalePreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleFontScaleChange(preset)}
              style={{
                padding: '5px 14px',
                borderRadius: 6,
                border: fontScale === preset ? '2px solid #6366f1' : '1px solid #d1d5db',
                background: fontScale === preset ? 'rgba(99,102,241,0.1)' : '#ffffff',
                color: fontScale === preset ? '#4f46e5' : '#374151',
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
          border: '1px solid #d1d5db',
          borderRadius: 10,
          padding: '1rem',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>Home Page Setup</div>
        <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
          Use Workbench as your browser home/startup page. This opens Chrome settings and copies the Workbench URL.
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
            Set Workbench as Home
          </button>
        </div>
      </div>

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
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>AI Settings</div>
        <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
          Configure one default AI provider/model for now. This keeps v1 simple and can fan out by task later.
        </div>
        {aiForm ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: '0.65rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
              Provider
              <select
                value={aiForm.provider}
                onChange={(e) => updateAiField('provider', e.target.value as AISettings['provider'])}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
              >
                <option value="openrouter">OpenRouter (OpenAI-compatible)</option>
                <option value="chrome-native">Chrome native (on-device)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
              Model ID
              <input
                value={aiForm.model}
                onChange={(e) => updateAiField('model', e.target.value)}
                placeholder="openai/gpt-4o-mini"
                disabled={aiForm.provider === 'chrome-native'}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151', gridColumn: '1 / span 2' }}>
              Base URL
              <input
                value={aiForm.baseUrl}
                onChange={(e) => updateAiField('baseUrl', e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                disabled={aiForm.provider === 'chrome-native'}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151', gridColumn: '1 / span 2' }}>
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
                    border: '1px solid #d1d5db',
                    flex: 1,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  style={{
                    padding: '0.42rem 0.6rem',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#374151',
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
              Model routing
              <select
                value={aiForm.routingMode}
                onChange={(e) =>
                  updateAiField('routingMode', e.target.value as AISettings['routingMode'])
                }
                disabled={aiForm.provider === 'chrome-native'}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
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
                color: '#374151',
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
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
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
                    style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
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
                    style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db' }}
                  />
                </label>
              </>
            ) : null}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
              Timeout (ms)
              <input
                value={String(aiForm.timeoutMs)}
                onChange={(e) => updateAiField('timeoutMs', Number(e.target.value) || 0)}
                type="number"
                min={3000}
                max={120000}
                step={1000}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
              Temperature
              <input
                value={String(aiForm.temperature)}
                onChange={(e) => updateAiField('temperature', Number(e.target.value) || 0)}
                type="number"
                min={0}
                max={2}
                step={0.1}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151' }}>
              Max output tokens
              <input
                value={String(aiForm.maxOutputTokens)}
                onChange={(e) => updateAiField('maxOutputTokens', Number(e.target.value) || 0)}
                type="number"
                min={64}
                max={8192}
                step={32}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#374151', gridColumn: '1 / span 2' }}>
              Test prompt
              <textarea
                value={aiTestPrompt}
                onChange={(e) => setAiTestPrompt(e.target.value)}
                rows={3}
                style={{ padding: '0.45rem 0.55rem', borderRadius: 8, border: '1px solid #d1d5db', resize: 'vertical' }}
              />
            </label>
          </div>
        ) : (
          <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>Loading AI settings...</div>
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
          <div style={{ fontSize: '0.82rem', color: '#b91c1c' }}>
            <strong>AI error:</strong> {aiError}
          </div>
        )}
        <div
          style={{
            fontSize: '0.82rem',
            color: '#4b5563',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
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
          <div style={{ fontSize: '0.82rem', color: '#92400e' }}>
            <strong>Model mismatch:</strong> requested <code>{aiRequestedModel || '-'}</code>, provider returned{' '}
            <code>{aiTestModel || '-'}</code>. Enable strict matching to fail these responses.
          </div>
        )}
        {aiTestOutput && (
          <div
            style={{
              fontSize: '0.82rem',
              color: '#374151',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
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
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>Fetch enrichment</div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5 }}>
          Opens a full-page picker: all bookmark URLs, checkboxes, then run fetch (r.jina.ai). Configure backup
          folder below for <code>enrichment-cache/</code> on disk.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <EnrichmentPanel />
        </div>
        <CategorizationSetupSection />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!backupFolderReady && (
            <span style={{ fontSize: '0.8rem', color: '#b45309' }}>
              Configure backup folder below for disk cache.
            </span>
          )}
        </div>
      </div>

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
