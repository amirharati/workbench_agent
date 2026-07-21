import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderKanban, Layers3, MonitorUp, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import type { Item, Project, Workspace } from '../../lib/db';
import { deleteWorkspace, updateWorkspace } from '../../lib/db';
import type { GlobalTab, GlobalTabState, SavedWorkspaceSession } from './GlobalTabSystem';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import { HubActionConfirmModal } from './HubActionConfirmModal';
import { TextPromptDialog } from './TextPromptDialog';
import { uiPatterns } from '../../styles/uiPatterns';
import {
  activateProjectWorkspace,
  activateSavedProjectWorkspace,
  addBrowserSnapshotToProjectWorkspace,
  createProjectWorkspaceFromBrowserSnapshot,
  deleteSavedProjectWorkspace,
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionWorkspaceKey,
  getProjectWorkspaceTabs,
} from './workspaceSession';

type WorkspaceFilter = 'all' | 'project' | 'browser';

type ProjectWorkspaceRow = {
  key: string;
  kind: 'project';
  name: string;
  projectId: string;
  tabs: GlobalTab[];
  active: boolean;
  live: boolean;
  session?: SavedWorkspaceSession;
  updatedAt: number;
};

type BrowserWorkspaceRow = {
  key: string;
  kind: 'browser';
  name: string;
  projectId?: string;
  workspace: Workspace;
  updatedAt: number;
};

type ManagedWorkspaceRow = ProjectWorkspaceRow | BrowserWorkspaceRow;

type WorkspacePrompt =
  | { kind: 'create-project'; workspace: Workspace; projectId: string }
  | { kind: 'rename-project'; row: ProjectWorkspaceRow }
  | { kind: 'rename-browser'; workspace: Workspace };

type WorkspaceDelete =
  | { kind: 'project'; row: ProjectWorkspaceRow }
  | { kind: 'browser'; workspace: Workspace };

interface WorkspacesViewProps {
  projects: Project[];
  items: Item[];
  workspaces: Workspace[];
  homeState: GlobalTabState;
  scopeProjectId?: string | 'all';
  onHomeStateChange: (next: GlobalTabState) => void;
  onOpenHome?: () => void;
  onOpenTabCommander?: () => void;
  onSelectProjectScope?: (projectId: string | 'all') => void;
  onWorkspacesChanged?: () => Promise<void>;
}

function projectWorkspaceRows(
  projects: readonly Project[],
  state: GlobalTabState
): ProjectWorkspaceRow[] {
  return projects.flatMap((project) => {
    const liveKey = getProjectSessionWorkspaceKey(project.id);
    const activeKey = getActiveProjectWorkspaceKey(state, project.id);
    const liveTabs = getProjectWorkspaceTabs(state, project.id, liveKey);
    const live = liveTabs.length > 0
      ? [{
          key: `project:${project.id}:live`,
          kind: 'project' as const,
          name: 'Live session',
          projectId: project.id,
          tabs: liveTabs,
          active: activeKey === liveKey,
          live: true,
          updatedAt: project.updated_at,
        }]
      : [];
    const saved = (state.savedWorkspaceSessions ?? [])
      .filter((session) => session.projectId === project.id)
      .map((session) => {
        const workspaceKey = getHomebaseWorkspaceSessionKey(session.id);
        return {
          key: `project:${project.id}:saved:${session.id}`,
          kind: 'project' as const,
          name: session.name,
          projectId: project.id,
          tabs: getProjectWorkspaceTabs(state, project.id, workspaceKey),
          active: activeKey === workspaceKey,
          live: false,
          session,
          updatedAt: session.updatedAt,
        };
      });
    return [...live, ...saved];
  });
}

export function getWorkspaceTabUrl(
  tab: GlobalTab,
  itemById: ReadonlyMap<string, Item>
): string | null {
  if (tab.kind === 'url') return tab.url.trim() || null;
  if (tab.kind !== 'item') return null;
  const item = itemById.get(tab.itemId);
  return item?.url?.trim() || item?.urlRaw?.trim() || null;
}

export const WorkspacesView: React.FC<WorkspacesViewProps> = ({
  projects,
  items,
  workspaces,
  homeState,
  scopeProjectId = 'all',
  onHomeStateChange,
  onOpenHome,
  onOpenTabCommander,
  onSelectProjectScope,
  onWorkspacesChanged,
}) => {
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id ?? '');
  const [targetWorkspaceKey, setTargetWorkspaceKey] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [workspacePrompt, setWorkspacePrompt] = useState<WorkspacePrompt | null>(null);
  const [workspaceDelete, setWorkspaceDelete] = useState<WorkspaceDelete | null>(null);

  const rows = useMemo<ManagedWorkspaceRow[]>(() => {
    const projectRows = projectWorkspaceRows(projects, homeState);
    const browserRows: BrowserWorkspaceRow[] = workspaces.map((workspace) => ({
      key: `browser:${workspace.id}`,
      kind: 'browser',
      name: workspace.name,
      projectId: workspace.projectId,
      workspace,
      updatedAt: workspace.updated_at,
    }));
    const normalizedQuery = query.trim().toLowerCase();
    return [...projectRows, ...browserRows]
      .filter((row) => filter === 'all' || row.kind === filter)
      .filter((row) => scopeProjectId === 'all' || row.projectId === scopeProjectId)
      .filter((row) => {
        if (!normalizedQuery) return true;
        const projectName = projects.find((project) => project.id === row.projectId)?.name ?? '';
        return `${row.name} ${projectName}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => Number(right.kind === 'project' && right.active) - Number(left.kind === 'project' && left.active) || right.updatedAt - left.updatedAt);
  }, [filter, homeState, projects, query, scopeProjectId, workspaces]);
  const selected = rows.find((row) => row.key === selectedKey) ?? null;
  const selectedBrowser = selected?.kind === 'browser' ? selected.workspace : null;
  const targetSessions = (homeState.savedWorkspaceSessions ?? [])
    .filter((session) => session.projectId === targetProjectId)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const workspaceTargets = targetProjectId
    ? [
        { key: getProjectSessionWorkspaceKey(targetProjectId), label: 'Live session' },
        ...targetSessions.map((session) => ({ key: getHomebaseWorkspaceSessionKey(session.id), label: session.name })),
      ]
    : [];

  useEffect(() => {
    if (selectedKey && rows.some((row) => row.key === selectedKey)) return;
    setSelectedKey(rows[0]?.key ?? null);
  }, [rows, selectedKey]);

  useEffect(() => {
    if (targetProjectId && projects.some((project) => project.id === targetProjectId)) return;
    setTargetProjectId(projects[0]?.id ?? '');
  }, [projects, targetProjectId]);

  useEffect(() => {
    if (workspaceTargets.some((target) => target.key === targetWorkspaceKey)) return;
    setTargetWorkspaceKey(workspaceTargets[0]?.key ?? '');
  }, [targetWorkspaceKey, workspaceTargets]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const tabLabel = (tab: GlobalTab) => {
    if (tab.kind === 'item') return itemById.get(tab.itemId)?.title || 'Missing library item';
    if (tab.kind === 'url') return tab.title || tab.url;
    if (tab.kind === 'search') return tab.query ? `Search: ${tab.query}` : 'Search';
    return tab.title;
  };

  const tabDetail = (tab: GlobalTab) => {
    if (tab.kind === 'item') return itemById.get(tab.itemId)?.url || 'Note';
    if (tab.kind === 'url') return tab.url;
    if (tab.kind === 'search') return 'Saved search context';
    return `${tab.itemIds?.length ?? 0} items`;
  };

  const tabDetailContent = (tab: GlobalTab) => {
    const url = getWorkspaceTabUrl(tab, itemById);
    if (!url) return <span style={entryDetailStyle}>{tabDetail(tab)}</span>;
    return (
      <ExtensionPageUrlLink
        url={url}
        className="ui-url-link"
        style={entryDetailStyle}
        title={`Open ${url}`}
      >
        {url}
      </ExtensionPageUrlLink>
    );
  };

  const projectTabUrls = (tabs: readonly GlobalTab[]) => [
    ...new Set(tabs.flatMap((tab) => {
      if (tab.kind === 'url') return [tab.url];
      if (tab.kind === 'item') {
        const url = itemById.get(tab.itemId)?.url;
        return url ? [url] : [];
      }
      return [];
    }).filter((url) => /^(https?:\/\/|file:\/\/)/i.test(url))),
  ];

  const activateProjectRow = (row: ProjectWorkspaceRow) => {
    const next = row.live
      ? activateProjectWorkspace({ state: homeState, projectId: row.projectId, workspace: null, items })
      : activateSavedProjectWorkspace({ state: homeState, session: row.session! });
    onHomeStateChange(next);
    onSelectProjectScope?.(row.projectId);
    onOpenHome?.();
  };

  const openProjectWorkspaceLinks = (row: ProjectWorkspaceRow) => {
    const urls = projectTabUrls(row.tabs);
    if (urls.length > 0) void chrome.windows.create({ url: urls });
  };

  const restoreBrowserSnapshot = async (workspace: Workspace) => {
    for (const windowGroup of workspace.windows) {
      const urls = windowGroup.tabs.map((tab) => tab.url).filter(Boolean);
      if (urls.length > 0) await chrome.windows.create({ url: urls });
    }
  };

  const createProjectWorkspace = () => {
    if (!selectedBrowser || !targetProjectId) return;
    setWorkspacePrompt({ kind: 'create-project', workspace: selectedBrowser, projectId: targetProjectId });
  };

  const addToProjectWorkspace = () => {
    if (!selectedBrowser || !targetProjectId || !targetWorkspaceKey) return;
    onHomeStateChange(addBrowserSnapshotToProjectWorkspace({
      state: homeState,
      workspace: selectedBrowser,
      items,
      projectId: targetProjectId,
      targetWorkspaceKey,
    }));
    const target = workspaceTargets.find((candidate) => candidate.key === targetWorkspaceKey);
    setNotice(`Added browser tabs to ${target?.label ?? 'project workspace'}.`);
  };

  const renameProjectWorkspace = (row: ProjectWorkspaceRow) => {
    if (!row.session) return;
    setWorkspacePrompt({ kind: 'rename-project', row });
  };

  const removeProjectWorkspace = (row: ProjectWorkspaceRow) => {
    if (!row.session) return;
    setWorkspaceDelete({ kind: 'project', row });
  };

  const renameBrowserWorkspace = (workspace: Workspace) => {
    setWorkspacePrompt({ kind: 'rename-browser', workspace });
  };

  const removeBrowserWorkspace = (workspace: Workspace) => {
    setWorkspaceDelete({ kind: 'browser', workspace });
  };

  const submitWorkspacePrompt = async (name: string) => {
    if (!workspacePrompt) return;
    if (workspacePrompt.kind === 'create-project') {
      onHomeStateChange(createProjectWorkspaceFromBrowserSnapshot({
        state: homeState,
        workspace: workspacePrompt.workspace,
        items,
        projectId: workspacePrompt.projectId,
        name,
      }));
      setNotice(`Created project workspace “${name}”.`);
    } else if (workspacePrompt.kind === 'rename-project') {
      const sessionId = workspacePrompt.row.session?.id;
      if (!sessionId) return;
      onHomeStateChange({
        ...homeState,
        savedWorkspaceSessions: (homeState.savedWorkspaceSessions ?? []).map((session) =>
          session.id === sessionId ? { ...session, name, updatedAt: Date.now() } : session
        ),
      });
    } else {
      await updateWorkspace(workspacePrompt.workspace.id, { name });
      await onWorkspacesChanged?.();
    }
    setWorkspacePrompt(null);
  };

  const confirmWorkspaceDelete = async () => {
    if (!workspaceDelete) return;
    if (workspaceDelete.kind === 'project') {
      const sessionId = workspaceDelete.row.session?.id;
      if (!sessionId) return;
      onHomeStateChange(deleteSavedProjectWorkspace({ state: homeState, sessionId }));
    } else {
      await deleteWorkspace(workspaceDelete.workspace.id);
      await onWorkspacesChanged?.();
    }
    setSelectedKey(null);
    setWorkspaceDelete(null);
  };

  const assignBrowserWorkspaceProject = async (workspace: Workspace, projectId: string) => {
    await updateWorkspace(workspace.id, { projectId: projectId || undefined });
    await onWorkspacesChanged?.();
  };

  return (
    <div className="ui-page-frame" style={uiPatterns.pageFrame}>
      <header className="ui-page-header" style={uiPatterns.pageHeader}>
        <div>
          <h1 style={uiPatterns.pageTitle}>Workspaces</h1>
          <p style={uiPatterns.pageDescription}>Manage Homebase working sets and saved browser snapshots. Live browser tabs stay in Tab Commander.</p>
        </div>
        {onOpenTabCommander && <button className="ui-button ui-button--primary" type="button" onClick={onOpenTabCommander} style={primaryButtonStyle}><MonitorUp size={13} /> Capture browser tabs</button>}
      </header>

      <div className="ui-toolbar" style={uiPatterns.toolbar}>
        <label style={{ ...uiPatterns.searchField, width: 'min(460px, 100%)' }}>
          <Search size={13} color="var(--text-faint)" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter workspaces…" aria-label="Filter workspaces" style={{ minWidth: 0, flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sm)' }} />
        </label>
        <div role="group" aria-label="Workspace type" style={{ display: 'inline-flex', padding: 2, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)' }}>
          {(['all', 'project', 'browser'] as const).map((value) => (
            <button className="ui-view-tab" key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} style={{ height: 28, padding: '0 10px', border: 'none', borderRadius: 'var(--radius-sm)', background: filter === value ? 'var(--accent-weak)' : 'transparent', color: filter === value ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 650, cursor: 'pointer' }}>{value === 'all' ? 'All' : value === 'project' ? 'Project workspaces' : 'Browser snapshots'}</button>
          ))}
        </div>
        <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{rows.length} workspace{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="ui-split-canvas" style={uiPatterns.splitCanvas}>
        <section className="ui-panel" style={panelStyle} aria-label="Saved workspaces">
          <div style={panelHeaderStyle}><strong style={{ fontSize: 'var(--text-sm)' }}>Saved work</strong></div>
          <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {rows.length === 0 ? <div style={emptyStyle}>No workspaces match this view.</div> : rows.map((row) => {
              const project = projects.find((candidate) => candidate.id === row.projectId);
              const selectedRow = selectedKey === row.key;
              const count = row.kind === 'project' ? row.tabs.length : row.workspace.windows.reduce((sum, windowGroup) => sum + windowGroup.tabs.length, 0);
              return (
                <button key={row.key} type="button" onClick={() => { setSelectedKey(row.key); setNotice(null); if (row.projectId) setTargetProjectId(row.projectId); }} style={{ width: '100%', minHeight: 62, display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border)', borderLeft: selectedRow ? '3px solid var(--accent)' : '3px solid transparent', background: selectedRow ? 'var(--accent-weak)' : 'transparent', color: 'var(--text)', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ width: 28, height: 28, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: row.kind === 'project' ? 'var(--accent-weak)' : 'var(--bg-hover)', color: row.kind === 'project' ? 'var(--accent)' : 'var(--text-faint)' }}>{row.kind === 'project' ? <Layers3 size={13} /> : <MonitorUp size={13} />}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-sm)' }}>{row.name}</strong>{row.kind === 'project' && row.active && <span style={activeBadgeStyle}>Active</span>}</span>
                    <span style={{ display: 'block', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{row.kind === 'project' ? row.live ? 'Active now' : 'Project workspace' : 'Browser snapshot'} · {project?.name ?? 'Unassigned'} · {count} {row.kind === 'project' ? 'items' : 'tabs'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ui-panel" style={panelStyle} aria-label="Workspace details">
          {!selected ? <div style={emptyStyle}>Select a workspace to inspect it.</div> : selected.kind === 'project' ? (
            <>
              <div style={panelHeaderStyle}>
                <div><strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{selected.name}</strong><span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{projects.find((project) => project.id === selected.projectId)?.name} · {selected.live ? 'Active now' : 'Project workspace'}</span></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!selected.live && <button type="button" onClick={() => renameProjectWorkspace(selected)} style={iconButtonStyle} title="Rename workspace"><Pencil size={12} /></button>}
                  {!selected.live && <button className="ui-button ui-button--icon ui-button--danger" type="button" onClick={() => removeProjectWorkspace(selected)} style={{ ...iconButtonStyle, color: 'var(--danger)' }} title="Delete workspace"><Trash2 size={12} /></button>}
                  <button type="button" disabled={projectTabUrls(selected.tabs).length === 0} onClick={() => openProjectWorkspaceLinks(selected)} style={secondaryButtonStyle}><ExternalLink size={12} /> Open links</button>
                  <button type="button" onClick={() => activateProjectRow(selected)} style={primaryButtonStyle}><Play size={12} /> Activate in Home</button>
                </div>
              </div>
              <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {selected.tabs.length === 0 ? <div style={emptyStyle}>This workspace is empty.</div> : selected.tabs.map((tab) => <div key={tab.id} style={entryRowStyle}><span style={{ width: 27, height: 27, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>{tab.kind === 'item' && !getWorkspaceTabUrl(tab, itemById) ? <FolderKanban size={12} /> : <ExternalLink size={12} />}</span><span style={{ minWidth: 0, flex: 1 }}><strong style={entryTitleStyle}>{tabLabel(tab)}</strong>{tabDetailContent(tab)}</span></div>)}
              </div>
            </>
          ) : (
            <>
              <div style={panelHeaderStyle}>
                <div><strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{selected.name}</strong><span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Browser snapshot · {selected.workspace.windows.length} window{selected.workspace.windows.length !== 1 ? 's' : ''}</span></div>
                  <div style={{ display: 'flex', gap: 6 }}><button className="ui-button ui-button--icon" type="button" onClick={() => renameBrowserWorkspace(selected.workspace)} style={iconButtonStyle} title="Rename snapshot"><Pencil size={12} /></button><button className="ui-button ui-button--icon ui-button--danger" type="button" onClick={() => removeBrowserWorkspace(selected.workspace)} style={{ ...iconButtonStyle, color: 'var(--danger)' }} title="Delete snapshot"><Trash2 size={12} /></button><button className="ui-button ui-button--primary" type="button" onClick={() => void restoreBrowserSnapshot(selected.workspace)} style={primaryButtonStyle}><MonitorUp size={12} /> Restore windows</button></div>
              </div>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 650 }}>Snapshot project</span>
                  <select value={selected.workspace.projectId ?? ''} onChange={(event) => void assignBrowserWorkspaceProject(selected.workspace, event.target.value)} aria-label="Browser snapshot project" style={selectStyle}><option value="">Unassigned</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                  <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Organizes the snapshot only; it does not convert its tabs.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <select value={targetProjectId} onChange={(event) => setTargetProjectId(event.target.value)} aria-label="Target project" style={selectStyle}><option value="">Choose project…</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                  <button type="button" disabled={!targetProjectId} onClick={createProjectWorkspace} style={secondaryButtonStyle}><Plus size={12} /> Create project workspace</button>
                  <select value={targetWorkspaceKey} onChange={(event) => setTargetWorkspaceKey(event.target.value)} aria-label="Target project workspace" disabled={!targetProjectId} style={selectStyle}>{workspaceTargets.map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}</select>
                  <button type="button" disabled={!targetWorkspaceKey} onClick={addToProjectWorkspace} style={secondaryButtonStyle}><Plus size={12} /> Add tabs</button>
                </div>
                {notice && <div role="status" style={{ marginTop: 6, color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>{notice}</div>}
              </div>
              <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
                {selected.workspace.windows.map((windowGroup, index) => <div key={windowGroup.id} style={{ marginBottom: 12 }}><div style={{ marginBottom: 5, color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase' }}>{windowGroup.name || `Window ${index + 1}`} · {windowGroup.tabs.length} tabs</div>{windowGroup.tabs.map((tab, tabIndex) => <div key={`${windowGroup.id}:${tabIndex}`} style={entryRowStyle}><ExternalLink size={12} color="var(--text-faint)" /><span style={{ minWidth: 0, flex: 1 }}><strong style={entryTitleStyle}>{tab.title || 'Untitled'}</strong><ExtensionPageUrlLink url={tab.url} className="ui-url-link" style={entryDetailStyle} title={`Open ${tab.url}`}>{tab.url}</ExtensionPageUrlLink></span></div>)}</div>)}
              </div>
            </>
          )}
        </section>
      </div>
      {workspacePrompt ? (
        <TextPromptDialog
          title={workspacePrompt.kind === 'create-project' ? 'Create project workspace' : workspacePrompt.kind === 'rename-project' ? 'Rename workspace' : 'Rename browser snapshot'}
          description={workspacePrompt.kind === 'create-project' ? 'Turn this saved browser snapshot into a reusable project working set.' : 'Use a short name that makes this saved context easy to recognize.'}
          label={workspacePrompt.kind === 'rename-browser' ? 'Snapshot name' : 'Workspace name'}
          initialValue={workspacePrompt.kind === 'create-project' ? workspacePrompt.workspace.name : workspacePrompt.kind === 'rename-project' ? workspacePrompt.row.name : workspacePrompt.workspace.name}
          confirmLabel={workspacePrompt.kind === 'create-project' ? 'Create workspace' : 'Save name'}
          onConfirm={submitWorkspacePrompt}
          onCancel={() => setWorkspacePrompt(null)}
        />
      ) : null}
      {workspaceDelete ? (
        <HubActionConfirmModal
          title={workspaceDelete.kind === 'project' ? 'Delete project workspace?' : 'Delete browser snapshot?'}
          description={`“${workspaceDelete.kind === 'project' ? workspaceDelete.row.name : workspaceDelete.workspace.name}” will be removed from saved work.`}
          warning={workspaceDelete.kind === 'project' ? 'This removes the saved working set. It does not delete any library items.' : 'This removes the saved snapshot. It does not close or delete the original browser tabs.'}
          confirmLabel="Delete"
          confirmVariant="danger"
          onConfirm={() => void confirmWorkspaceDelete()}
          onCancel={() => setWorkspaceDelete(null)}
        />
      ) : null}
    </div>
  );
};

const panelStyle = uiPatterns.panel;
const panelHeaderStyle = uiPatterns.panelHeader;
const emptyStyle = uiPatterns.emptyState;
const secondaryButtonStyle = uiPatterns.secondaryButton;
const primaryButtonStyle = uiPatterns.primaryButton;
const iconButtonStyle = uiPatterns.iconButton;
const selectStyle: React.CSSProperties = { ...uiPatterns.select, minWidth: 145, maxWidth: 220 };
const entryRowStyle: React.CSSProperties = { minHeight: 43, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderBottom: '1px solid var(--border)' };
const entryTitleStyle: React.CSSProperties = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', fontSize: 'var(--text-sm)' };
const entryDetailStyle: React.CSSProperties = { display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' };
const activeBadgeStyle: React.CSSProperties = { padding: '1px 5px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' };
