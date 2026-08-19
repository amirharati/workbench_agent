import React, { useMemo, useState } from 'react';
import { Check, Combine, Layers3, Pencil, Plus, Trash2 } from 'lucide-react';
import { DialogShell } from './DialogShell';
import { uiPatterns } from '../../styles/uiPatterns';

export interface ProjectWorkspaceManagerEntry {
  key: string;
  name: string;
  count: number;
  sessionId?: string;
}

interface ProjectWorkspaceManagerDialogProps {
  projectName: string;
  activeWorkspaceKey: string;
  entries: ProjectWorkspaceManagerEntry[];
  canCopyActiveWorkspace: boolean;
  initialMode?: 'list' | 'create';
  onClose: () => void;
  onActivate: (workspaceKey: string) => void;
  onCreate: (name: string, copyCurrent: boolean) => string | void;
  onRename: (sessionId: string, name: string) => string | void;
  onMerge: (sourceSessionId: string, targetWorkspaceKey: string) => void;
  onDelete: (sessionId: string) => void;
}

type EditorMode =
  | { kind: 'create' }
  | { kind: 'rename'; sessionId: string }
  | { kind: 'merge'; sessionId: string; sourceName: string; targetKey: string }
  | { kind: 'delete'; sessionId: string; sourceName: string }
  | null;

export const ProjectWorkspaceManagerDialog: React.FC<ProjectWorkspaceManagerDialogProps> = ({
  projectName,
  activeWorkspaceKey,
  entries,
  canCopyActiveWorkspace,
  initialMode = 'list',
  onClose,
  onActivate,
  onCreate,
  onRename,
  onMerge,
  onDelete,
}) => {
  const [mode, setMode] = useState<EditorMode>(initialMode === 'create' ? { kind: 'create' } : null);
  const [name, setName] = useState('');
  const [copyCurrent, setCopyCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mergeTargets = useMemo(
    () => mode?.kind === 'merge' ? entries.filter((entry) => entry.sessionId !== mode.sessionId) : [],
    [entries, mode]
  );

  const resetEditor = () => {
    setMode(null);
    setName('');
    setCopyCurrent(false);
    setError(null);
  };

  const beginCreate = () => {
    setMode({ kind: 'create' });
    setName('');
    setCopyCurrent(false);
    setError(null);
  };

  const submitName = () => {
    const normalized = name.trim();
    if (!normalized) {
      setError('Workspace name is required.');
      return;
    }
    const nextError = mode?.kind === 'rename'
      ? onRename(mode.sessionId, normalized)
      : onCreate(normalized, copyCurrent);
    if (nextError) {
      setError(nextError);
      return;
    }
    resetEditor();
  };

  return (
    <DialogShell
      title={`${projectName} workspaces`}
      description="Create and manage named working sets for this project. Changes to workspace membership never delete library items."
      onClose={onClose}
      maxWidth={700}
      bodyStyle={{ padding: 0 }}
    >
      <div className="ui-project-workspace-manager__toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          One automatic General workspace plus your named workspaces.
        </div>
        <button className="ui-button ui-button--primary" type="button" onClick={beginCreate}>
          <Plus size={12} /> New workspace
        </button>
      </div>

      {mode?.kind === 'create' || mode?.kind === 'rename' ? (
        <div className="ui-dialog__section" style={{ margin: 14 }}>
          <strong className="ui-dialog__section-title">
            {mode.kind === 'create' ? 'New workspace' : 'Rename workspace'}
          </strong>
          <label style={fieldLabelStyle}>
            Name
            <input
              className="ui-field"
              autoFocus
              value={name}
              onChange={(event) => { setName(event.target.value); setError(null); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitName(); } }}
              placeholder="e.g. Launch research"
              style={inputStyle}
            />
          </label>
          {mode.kind === 'create' ? (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: canCopyActiveWorkspace ? 'var(--text-muted)' : 'var(--text-faint)', fontSize: 'var(--text-xs)', lineHeight: 1.45 }}>
              <input
                type="checkbox"
                checked={copyCurrent}
                disabled={!canCopyActiveWorkspace}
                onChange={(event) => setCopyCurrent(event.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                Copy entries from the active workspace
                {!canCopyActiveWorkspace ? ' (the active workspace belongs to another project)' : ''}
              </span>
            </label>
          ) : null}
          {error ? <div className="ui-status" data-tone="error" role="alert">{error}</div> : null}
          <div style={editorActionsStyle}>
            <button className="ui-button ui-button--secondary" type="button" onClick={resetEditor}>Cancel</button>
            <button className="ui-button ui-button--primary" type="button" onClick={submitName} disabled={!name.trim()}>
              {mode.kind === 'create' ? 'Create workspace' : 'Rename'}
            </button>
          </div>
        </div>
      ) : null}

      <div aria-label="Project workspaces">
        {entries.map((entry) => {
          const active = entry.key === activeWorkspaceKey;
          const named = Boolean(entry.sessionId);
          const editing = mode && 'sessionId' in mode && mode.sessionId === entry.sessionId;
          return (
            <div key={entry.key} style={{ borderBottom: '1px solid var(--border)', background: active ? 'var(--accent-weak)' : 'transparent' }}>
              <div className="ui-project-workspace-manager__row" style={{ minHeight: 58, display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '8px 14px' }}>
                <span style={{ width: 30, height: 30, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: active ? 'var(--bg-panel)' : 'var(--bg-hover)', color: active ? 'var(--accent)' : 'var(--text-faint)' }}>
                  <Layers3 size={13} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ color: 'var(--text)', fontSize: 'var(--text-sm)' }}>{entry.name}</strong>
                    {active ? <span style={activeBadgeStyle}><Check size={9} /> Active</span> : null}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                    {named ? 'Named workspace' : 'Automatic workspace'} · {entry.count} entr{entry.count === 1 ? 'y' : 'ies'}
                  </span>
                </span>
                <div className="ui-project-workspace-manager__actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flexWrap: 'wrap' }}>
                  {!active ? (
                    <button className="ui-button ui-button--secondary" type="button" onClick={() => onActivate(entry.key)}>Make active</button>
                  ) : null}
                  {named ? (
                    <>
                    <button className="ui-button ui-button--icon" type="button" onClick={() => { setMode({ kind: 'rename', sessionId: entry.sessionId! }); setName(entry.name); setError(null); }} title={`Rename ${entry.name}`} aria-label={`Rename ${entry.name}`}><Pencil size={12} /></button>
                    <button className="ui-button ui-button--icon" type="button" onClick={() => { const target = entries.find((candidate) => candidate.key !== entry.key); if (target) setMode({ kind: 'merge', sessionId: entry.sessionId!, sourceName: entry.name, targetKey: target.key }); }} title={`Merge ${entry.name}`} aria-label={`Merge ${entry.name}`}><Combine size={12} /></button>
                    <button className="ui-button ui-button--icon ui-button--danger" type="button" onClick={() => setMode({ kind: 'delete', sessionId: entry.sessionId!, sourceName: entry.name })} title={`Delete ${entry.name}`} aria-label={`Delete ${entry.name}`}><Trash2 size={12} /></button>
                    </>
                  ) : null}
                </div>
              </div>

              {editing && mode?.kind === 'merge' ? (
                <div className="ui-project-workspace-manager__confirm" style={inlineConfirmStyle}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <strong style={{ display: 'block', color: 'var(--text)', fontSize: 'var(--text-xs)' }}>Move all entries from “{mode.sourceName}” into:</strong>
                    <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Duplicates are skipped. The source workspace is removed; library items are untouched.</span>
                  </div>
                  <select value={mode.targetKey} onChange={(event) => setMode({ ...mode, targetKey: event.target.value })} aria-label="Merge destination" style={{ ...uiPatterns.select, minWidth: 170 }}>
                    {mergeTargets.map((target) => <option key={target.key} value={target.key}>{target.name}</option>)}
                  </select>
                  <button className="ui-button ui-button--secondary" type="button" onClick={resetEditor}>Cancel</button>
                  <button className="ui-button ui-button--primary" type="button" onClick={() => { onMerge(mode.sessionId, mode.targetKey); resetEditor(); }} disabled={!mode.targetKey}>Merge workspace</button>
                </div>
              ) : null}

              {editing && mode?.kind === 'delete' ? (
                <div className="ui-project-workspace-manager__confirm" style={inlineConfirmStyle}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>Delete “{mode.sourceName}”?</strong>
                    <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Only this working set is removed. Library items are untouched.</span>
                  </div>
                  <button className="ui-button ui-button--secondary" type="button" onClick={resetEditor}>Cancel</button>
                  <button className="ui-button ui-button--danger" type="button" onClick={() => { onDelete(mode.sessionId); resetEditor(); }}>Delete workspace</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </DialogShell>
  );
};

const fieldLabelStyle: React.CSSProperties = { display: 'grid', gap: 5, marginTop: 9, color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 650 };
const inputStyle: React.CSSProperties = { width: '100%', height: 34, padding: '0 9px', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--text-sm)' };
const editorActionsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 12 };
const inlineConfirmStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px 11px 54px', borderTop: '1px solid var(--border)', background: 'var(--bg)' };
const activeBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 5px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' };
