import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, FileText, Layers3, MonitorUp, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react';
import type { Collection, Item, Project, Workspace } from '../../lib/db';
import { deleteWorkspace, normalizeBookmarkUrl, updateWorkspace } from '../../lib/db';
import type { GlobalTab, GlobalTabState, SavedWorkspaceSession } from './GlobalTabSystem';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import { HubActionConfirmModal } from './HubActionConfirmModal';
import { TextPromptDialog } from './TextPromptDialog';
import { uiPatterns } from '../../styles/uiPatterns';
import { ContentBrowser, useContentBrowseMode, type ContentBrowseEntry } from './ContentBrowser';
import {
  activateProjectWorkspace,
  activateSavedProjectWorkspace,
  activateWorkspace as activateWorkspaceByKey,
  addItemsToProjectWorkspace,
  createProjectWorkspace as createNamedProjectWorkspace,
  deleteSavedProjectWorkspace,
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionWorkspaceKey,
  getProjectWorkspaceTabs,
  mergeSavedProjectWorkspace,
  removeEntryFromProjectWorkspace,
  renameSavedProjectWorkspace,
} from './workspaceSession';
import { formatGeneralWorkspaceName, formatProjectWorkspaceName } from './workspaceLabels';
import {
  ProjectWorkspaceManagerDialog,
  type ProjectWorkspaceManagerEntry,
} from './ProjectWorkspaceManagerDialog';
import { LinkVisual } from './LinkVisual';

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
  collections?: Collection[];
  workspaces: Workspace[];
  homeState: GlobalTabState;
  scopeProjectId?: string | 'all';
  onHomeStateChange: (next: GlobalTabState) => void;
  onOpenHome?: () => void;
  onOpenTabCommander?: () => void;
  onSelectProjectScope?: (projectId: string | 'all') => void;
  onWorkspacesChanged?: () => Promise<void>;
  onAddBookmark?: (url: string, title?: string, collectionId?: string, options?: { silent?: boolean; successMessage?: string }) => Promise<string | undefined>;
}

function projectWorkspaceRows(
  projects: readonly Project[],
  state: GlobalTabState
): ProjectWorkspaceRow[] {
  const globalKey = getProjectSessionWorkspaceKey('all');
  const globalRow: ProjectWorkspaceRow = {
    key: 'global:workspace',
    kind: 'project',
    name: 'Global workspace',
    projectId: 'all',
    tabs: getProjectWorkspaceTabs(state, 'all', globalKey),
    active: getActiveProjectWorkspaceKey(state, 'all') === globalKey,
    live: true,
    updatedAt: 0,
  };
  return [globalRow, ...projects.flatMap((project) => {
    const liveKey = getProjectSessionWorkspaceKey(project.id);
    const activeKey = getActiveProjectWorkspaceKey(state, project.id);
    const liveTabs = getProjectWorkspaceTabs(state, project.id, liveKey);
    const live = [{
          key: `project:${project.id}:live`,
          kind: 'project' as const,
          name: formatGeneralWorkspaceName(project.name),
          projectId: project.id,
          tabs: liveTabs,
          active: activeKey === liveKey,
          live: true,
          updatedAt: project.updated_at,
        }];
    const saved = (state.savedWorkspaceSessions ?? [])
      .filter((session) => session.projectId === project.id)
      .map((session) => {
        const workspaceKey = getHomebaseWorkspaceSessionKey(session.id);
        return {
          key: `project:${project.id}:saved:${session.id}`,
          kind: 'project' as const,
          name: formatProjectWorkspaceName(project.name, session.name),
          projectId: project.id,
          tabs: getProjectWorkspaceTabs(state, project.id, workspaceKey),
          active: activeKey === workspaceKey,
          live: false,
          session,
          updatedAt: session.updatedAt,
        };
      });
    return [...live, ...saved];
  })];
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
  collections = [],
  workspaces,
  homeState,
  scopeProjectId = 'all',
  onHomeStateChange,
  onOpenHome,
  onOpenTabCommander,
  onSelectProjectScope,
  onWorkspacesChanged,
  onAddBookmark,
}) => {
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [targetProjectId, setTargetProjectId] = useState(
    scopeProjectId !== 'all' ? scopeProjectId : projects[0]?.id ?? ''
  );
  const [targetCollectionId, setTargetCollectionId] = useState('');
  const [targetWorkspaceKey, setTargetWorkspaceKey] = useState('');
  const [snapshotSaveProgress, setSnapshotSaveProgress] = useState<{ saved: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workspacePrompt, setWorkspacePrompt] = useState<WorkspacePrompt | null>(null);
  const [workspaceDelete, setWorkspaceDelete] = useState<WorkspaceDelete | null>(null);
  const [managerProjectId, setManagerProjectId] = useState(
    scopeProjectId !== 'all' ? scopeProjectId : projects[0]?.id ?? ''
  );
  const [workspaceManagerMode, setWorkspaceManagerMode] = useState<'list' | 'create' | null>(null);
  const [workspaceEntrySelection, setWorkspaceEntrySelection] = useState<Record<string, string | null>>({});
  const [workspaceEntryBrowseMode, setWorkspaceEntryBrowseMode] = useContentBrowseMode(
    'workbench:workspaces-page-entry-view:v1'
  );
  const didInitializeSelectionRef = useRef(false);

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
        { key: getProjectSessionWorkspaceKey(targetProjectId), label: 'General' },
        ...targetSessions.map((session) => ({ key: getHomebaseWorkspaceSessionKey(session.id), label: session.name })),
      ]
    : [];
  const targetCollections = useMemo(() => collections
    .filter((collection) => collection.primaryProjectId === targetProjectId || collection.projectIds?.includes(targetProjectId))
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name)), [collections, targetProjectId]);
  const managerProject = projects.find((project) => project.id === managerProjectId);
  const managerSessions = (homeState.savedWorkspaceSessions ?? [])
    .filter((session) => session.projectId === managerProjectId)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const managerEntries: ProjectWorkspaceManagerEntry[] = managerProject
    ? [
        {
          key: getProjectSessionWorkspaceKey(managerProject.id),
          name: 'General',
          count: getProjectWorkspaceTabs(homeState, managerProject.id, getProjectSessionWorkspaceKey(managerProject.id)).length,
        },
        ...managerSessions.map((session) => ({
          key: getHomebaseWorkspaceSessionKey(session.id),
          name: session.name,
          count: getProjectWorkspaceTabs(homeState, managerProject.id, getHomebaseWorkspaceSessionKey(session.id)).length,
          sessionId: session.id,
        })),
      ]
    : [];

  useEffect(() => {
    if (selectedKey && rows.some((row) => row.key === selectedKey)) return;
    if (!didInitializeSelectionRef.current) {
      didInitializeSelectionRef.current = true;
      setSelectedKey(rows[0]?.key ?? null);
      return;
    }
    if (selectedKey) setSelectedKey(rows[0]?.key ?? null);
  }, [rows, selectedKey]);

  useEffect(() => {
    if (targetProjectId && projects.some((project) => project.id === targetProjectId)) return;
    setTargetProjectId(projects[0]?.id ?? '');
  }, [projects, targetProjectId]);

  useEffect(() => {
    if (targetCollections.some((collection) => collection.id === targetCollectionId)) return;
    setTargetCollectionId(targetCollections[0]?.id ?? '');
  }, [targetCollectionId, targetCollections]);

  useEffect(() => {
    if (managerProjectId && projects.some((project) => project.id === managerProjectId)) return;
    setManagerProjectId(scopeProjectId !== 'all' ? scopeProjectId : projects[0]?.id ?? '');
  }, [managerProjectId, projects, scopeProjectId]);

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

  const selectedProjectWorkspaceKey = selected?.kind === 'project'
    ? selected.projectId === 'all'
      ? getProjectSessionWorkspaceKey('all')
      : selected.live
        ? getProjectSessionWorkspaceKey(selected.projectId)
        : getHomebaseWorkspaceSessionKey(selected.session!.id)
    : null;
  const selectedProjectWorkspaceTarget = selected?.kind === 'project' && selectedProjectWorkspaceKey
    ? {
        kind: 'workspace' as const,
        containerId: selectedProjectWorkspaceKey,
        containerLabel: selected.name,
        projectId: selected.projectId,
      }
    : null;
  const removeSelectedWorkspaceEntry = (entryId: string) => {
    if (!selected || selected.kind !== 'project' || !selectedProjectWorkspaceKey) return;
    onHomeStateChange(removeEntryFromProjectWorkspace({
      state: homeState,
      projectId: selected.projectId,
      workspaceKey: selectedProjectWorkspaceKey,
      entryId,
    }));
    setWorkspaceEntrySelection((previous) =>
      previous[selected.key] === entryId ? { ...previous, [selected.key]: null } : previous
    );
  };
  const selectedWorkspaceEntries: ContentBrowseEntry[] = selected?.kind === 'project'
    ? selected.tabs.map((tab) => {
        const item = tab.kind === 'item' ? itemById.get(tab.itemId) : undefined;
        return {
          id: tab.id,
          title: tabLabel(tab),
          icon: item
            ? item.url ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} /> : <FileText size={12} />
            : tab.kind === 'search' ? <Search size={12} /> : tab.kind === 'url' ? <LinkVisual url={tab.url} title={tab.title} favicon={tab.favIconUrl} /> : <ExternalLink size={12} />,
          subtitle: tabDetailContent(tab),
          meta: tab.kind === 'item'
            ? item?.url ? 'Saved link' : 'Saved note'
            : tab.kind === 'url' ? 'Direct URL' : tab.kind === 'search' ? 'Search' : 'Saved list',
          searchText: item ? `${item.tags.join(' ')} ${item.notes ?? ''}` : tabDetail(tab),
          actions: (
            <button
              type="button"
              className="ui-button ui-button--ghost ui-button--compact"
              onClick={() => removeSelectedWorkspaceEntry(tab.id)}
              title={`Remove ${tabLabel(tab)} from workspace`}
              aria-label={`Remove ${tabLabel(tab)} from workspace`}
            >
              <X size={11} />
            </button>
          ),
          dragSource: item && selectedProjectWorkspaceTarget ? selectedProjectWorkspaceTarget : undefined,
          dragItem: item,
          reorderTarget: item && selectedProjectWorkspaceTarget ? selectedProjectWorkspaceTarget : undefined,
        };
      })
    : selected?.kind === 'browser'
      ? selected.workspace.windows.flatMap((windowGroup, windowIndex) =>
          windowGroup.tabs.map((tab, tabIndex) => ({
            id: `${windowGroup.id}:${tabIndex}`,
            title: tab.title || 'Untitled',
            icon: <LinkVisual url={tab.url} title={tab.title} favicon={tab.favIconUrl} />,
            subtitle: (
              <ExtensionPageUrlLink
                url={tab.url}
                className="ui-url-link"
                style={entryDetailStyle}
                title={`Open ${tab.url}`}
              >
                {tab.url}
              </ExtensionPageUrlLink>
            ),
            meta: windowGroup.name || `Window ${windowIndex + 1}`,
            searchText: `${windowGroup.name ?? ''} ${tab.url}`,
            dragSource: { kind: 'reference' as const, label: 'Browser snapshot' },
            dragUrl: /^https?:\/\//i.test(tab.url) ? tab.url : undefined,
          }))
        )
      : [];
  const selectedWorkspaceEntryId = selected
    ? workspaceEntrySelection[selected.key] ?? null
    : null;

  const selectWorkspaceEntry = (entryId: string) => {
    if (!selected) return;
    setWorkspaceEntrySelection((previous) => ({ ...previous, [selected.key]: entryId }));
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
    const activated = row.live
      ? activateProjectWorkspace({ state: homeState, projectId: row.projectId, workspace: null, items })
      : activateSavedProjectWorkspace({ state: homeState, session: row.session! });
    const rememberedEntryId = activated.lastActiveEntryByWorkspace?.[
      row.projectId === 'all' ? getProjectSessionWorkspaceKey('all') : row.live
        ? getProjectSessionWorkspaceKey(row.projectId)
        : getHomebaseWorkspaceSessionKey(row.session!.id)
    ];
    const selectedEntryId = rememberedEntryId && activated.tabs.some((entry) => entry.id === rememberedEntryId)
      ? rememberedEntryId
      : activated.tabs[0]?.id ?? null;
    onHomeStateChange({ ...activated, homeSection: 'overview', activeTabId: selectedEntryId });
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

  const saveSnapshotItems = async (workspace: Workspace, collectionId: string) => {
    if (!onAddBookmark) throw new Error('Saving links is unavailable.');
    const linksByUrl = new Map<string, { url: string; title?: string }>();
    for (const tab of workspace.windows.flatMap((window) => window.tabs)) {
      const url = tab.url?.trim();
      if (!url || !/^https?:\/\//i.test(url)) continue;
      linksByUrl.set(normalizeBookmarkUrl(url), { url, title: tab.title });
    }
    const links = [...linksByUrl.values()];
    if (links.length === 0) throw new Error('This snapshot has no saveable http(s) links.');

    setSnapshotSaveProgress({ saved: 0, total: links.length });
    try {
      const itemIds: string[] = [];
      for (const [index, link] of links.entries()) {
        const itemId = await onAddBookmark(link.url, link.title, collectionId, { silent: true });
        if (!itemId) throw new Error(`Could not save ${link.url}.`);
        itemIds.push(itemId);
        setSnapshotSaveProgress({ saved: index + 1, total: links.length });
      }
      return itemIds;
    } finally {
      setSnapshotSaveProgress(null);
    }
  };

  const addToProjectWorkspace = async () => {
    if (!selectedBrowser || !targetProjectId || !targetCollectionId || !targetWorkspaceKey) return;
    const itemIds = await saveSnapshotItems(selectedBrowser, targetCollectionId);
    onHomeStateChange(addItemsToProjectWorkspace({
      state: homeState,
      projectId: targetProjectId,
      targetWorkspaceKey,
      itemIds,
    }));
    const target = workspaceTargets.find((candidate) => candidate.key === targetWorkspaceKey);
    setNotice(`Saved ${itemIds.length} link${itemIds.length === 1 ? '' : 's'} to the library and added them to ${target?.label ?? 'the workspace'}.`);
  };

  const renameProjectWorkspace = (row: ProjectWorkspaceRow) => {
    if (!row.session) return;
    setWorkspacePrompt({ kind: 'rename-project', row });
  };

  const validateManagerName = (name: string, excludeSessionId?: string): string | void => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return 'Workspace name is required.';
    if (managerSessions.some((session) => session.id !== excludeSessionId && session.name.trim().toLowerCase() === normalized)) {
      return 'A workspace with this name already exists in this project.';
    }
  };

  const createManagedWorkspace = (name: string, copyCurrent: boolean): string | void => {
    if (!managerProject) return 'Choose a project first.';
    const error = validateManagerName(name);
    if (error) return error;
    onHomeStateChange(createNamedProjectWorkspace({
      state: homeState,
      projectId: managerProject.id,
      name,
      copyCurrent,
    }));
  };

  const renameManagedWorkspace = (sessionId: string, name: string): string | void => {
    const error = validateManagerName(name, sessionId);
    if (error) return error;
    onHomeStateChange(renameSavedProjectWorkspace({ state: homeState, sessionId, name }));
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
      if (!targetCollectionId) throw new Error('Choose a target collection first.');
      const itemIds = await saveSnapshotItems(workspacePrompt.workspace, targetCollectionId);
      const sessionId = crypto.randomUUID();
      const next = createNamedProjectWorkspace({
        state: homeState,
        projectId: workspacePrompt.projectId,
        name,
        sessionId,
      });
      onHomeStateChange(addItemsToProjectWorkspace({
        state: next,
        projectId: workspacePrompt.projectId,
        targetWorkspaceKey: getHomebaseWorkspaceSessionKey(sessionId),
        itemIds,
      }));
      setNotice(`Saved ${itemIds.length} link${itemIds.length === 1 ? '' : 's'} and created workspace “${name}”.`);
    } else if (workspacePrompt.kind === 'rename-project') {
      const sessionId = workspacePrompt.row.session?.id;
      if (!sessionId) return;
      onHomeStateChange(renameSavedProjectWorkspace({ state: homeState, sessionId, name }));
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {projects.length > 0 ? (
            <>
              <select value={managerProjectId} onChange={(event) => setManagerProjectId(event.target.value)} aria-label="Project for workspace management" style={selectStyle}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <button className="ui-button ui-button--primary" type="button" onClick={() => setWorkspaceManagerMode('create')}><Plus size={13} /> New workspace</button>
              <button className="ui-button ui-button--secondary" type="button" onClick={() => setWorkspaceManagerMode('list')}><Layers3 size={13} /> Manage</button>
            </>
          ) : null}
          {onOpenTabCommander && <button className="ui-button ui-button--secondary" type="button" onClick={onOpenTabCommander} style={secondaryButtonStyle}><MonitorUp size={13} /> Capture browser tabs</button>}
        </div>
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

      <div className="ui-split-canvas ui-adaptive-browser" data-detail-open={selected ? 'true' : 'false'} style={uiPatterns.splitCanvas}>
        <section className="ui-panel" style={panelStyle} aria-label="Saved workspaces">
          <div style={panelHeaderStyle}><strong style={{ fontSize: 'var(--text-sm)' }}>Saved work</strong></div>
          <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {rows.length === 0 ? <div style={emptyStyle}>No workspaces match this view.</div> : rows.map((row) => {
              const selectedRow = selectedKey === row.key;
              const count = row.kind === 'project' ? row.tabs.length : row.workspace.windows.reduce((sum, windowGroup) => sum + windowGroup.tabs.length, 0);
              return (
                <button key={row.key} type="button" onClick={() => { setSelectedKey(row.key); setNotice(null); if (row.projectId) setTargetProjectId(row.projectId); }} style={{ width: '100%', minHeight: 62, display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border)', borderLeft: selectedRow ? '3px solid var(--accent)' : '3px solid transparent', background: selectedRow ? 'var(--accent-weak)' : 'transparent', color: 'var(--text)', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ width: 28, height: 28, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: row.kind === 'project' ? 'var(--accent-weak)' : 'var(--bg-hover)', color: row.kind === 'project' ? 'var(--accent)' : 'var(--text-faint)' }}>{row.kind === 'project' ? <Layers3 size={13} /> : <MonitorUp size={13} />}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-sm)' }}>{row.name}</strong>{row.kind === 'project' && row.active && <span style={activeBadgeStyle}>Active</span>}</span>
                    <span style={{ display: 'block', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{row.kind === 'project' ? row.live ? 'Automatic workspace' : 'Named workspace' : 'Browser snapshot'} · {row.projectId === 'all' ? 'Shared' : 'Project workspace'} · {count} {row.kind === 'project' ? 'entries' : 'browser tabs'}</span>
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
                <div><strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{selected.name}</strong><span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{selected.projectId === 'all' ? 'Shared workspace' : 'Project workspace'} · {selected.live ? 'Automatic' : 'Named'}</span></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="ui-button ui-button--secondary ui-adaptive-detail-back" type="button" onClick={() => setSelectedKey(null)} style={secondaryButtonStyle}><ArrowLeft size={12} /> Browse</button>
                  {!selected.live && <button type="button" onClick={() => renameProjectWorkspace(selected)} style={iconButtonStyle} title="Rename workspace"><Pencil size={12} /></button>}
                  {!selected.live && <button className="ui-button ui-button--icon ui-button--danger" type="button" onClick={() => removeProjectWorkspace(selected)} style={{ ...iconButtonStyle, color: 'var(--danger)' }} title="Delete workspace"><Trash2 size={12} /></button>}
                  <button type="button" disabled={projectTabUrls(selected.tabs).length === 0} onClick={() => openProjectWorkspaceLinks(selected)} style={secondaryButtonStyle}><ExternalLink size={12} /> Open links</button>
                  <button type="button" onClick={() => activateProjectRow(selected)} style={primaryButtonStyle}><Play size={12} /> Open workspace</button>
                </div>
              </div>
              <div className="ui-workspaces-detail-browser">
                <ContentBrowser
                  title="Workspace entries"
                  entries={selectedWorkspaceEntries}
                  selectedId={selectedWorkspaceEntryId}
                  onSelect={selectWorkspaceEntry}
                  mode={workspaceEntryBrowseMode}
                  onModeChange={setWorkspaceEntryBrowseMode}
                  emptyMessage="This workspace is empty."
                  ariaLabel={`${selected.name} entries`}
                  dropTarget={selectedProjectWorkspaceTarget ?? undefined}
                />
              </div>
            </>
          ) : (
            <>
              <div style={panelHeaderStyle}>
                <div><strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{selected.name}</strong><span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Browser snapshot · {selected.workspace.windows.length} window{selected.workspace.windows.length !== 1 ? 's' : ''}</span></div>
                  <div style={{ display: 'flex', gap: 6 }}><button className="ui-button ui-button--secondary ui-adaptive-detail-back" type="button" onClick={() => setSelectedKey(null)} style={secondaryButtonStyle}><ArrowLeft size={12} /> Browse</button><button className="ui-button ui-button--icon" type="button" onClick={() => renameBrowserWorkspace(selected.workspace)} style={iconButtonStyle} title="Rename snapshot"><Pencil size={12} /></button><button className="ui-button ui-button--icon ui-button--danger" type="button" onClick={() => removeBrowserWorkspace(selected.workspace)} style={{ ...iconButtonStyle, color: 'var(--danger)' }} title="Delete snapshot"><Trash2 size={12} /></button><button className="ui-button ui-button--primary" type="button" onClick={() => void restoreBrowserSnapshot(selected.workspace)} style={primaryButtonStyle}><MonitorUp size={12} /> Restore windows</button></div>
              </div>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 650 }}>Snapshot project</span>
                  <select value={selected.workspace.projectId ?? ''} onChange={(event) => void assignBrowserWorkspaceProject(selected.workspace, event.target.value)} aria-label="Browser snapshot project" style={selectStyle}><option value="">Unassigned</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                  <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Organizes the snapshot only; it does not convert its tabs.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <select value={targetProjectId} onChange={(event) => setTargetProjectId(event.target.value)} aria-label="Target project" style={selectStyle}><option value="">Choose project…</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                  <select value={targetCollectionId} onChange={(event) => setTargetCollectionId(event.target.value)} aria-label="Library collection" disabled={!targetProjectId || targetCollections.length === 0} style={selectStyle}><option value="">Choose collection…</option>{targetCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select>
                  <button type="button" disabled={!targetProjectId || !targetCollectionId || snapshotSaveProgress !== null} onClick={createProjectWorkspace} style={secondaryButtonStyle}><Plus size={12} /> Save as project workspace</button>
                  <select value={targetWorkspaceKey} onChange={(event) => setTargetWorkspaceKey(event.target.value)} aria-label="Target project workspace" disabled={!targetProjectId} style={selectStyle}>{workspaceTargets.map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}</select>
                  <button type="button" disabled={!targetWorkspaceKey || !targetCollectionId || snapshotSaveProgress !== null} onClick={() => void addToProjectWorkspace()} style={secondaryButtonStyle}><Plus size={12} /> Save links and add</button>
                </div>
                {snapshotSaveProgress ? <div role="status" style={{ marginTop: 6, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Saving {snapshotSaveProgress.saved}/{snapshotSaveProgress.total} links…</div> : null}
                {notice && <div role="status" style={{ marginTop: 6, color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>{notice}</div>}
              </div>
              <div className="ui-workspaces-detail-browser">
                <ContentBrowser
                  title="Snapshot tabs"
                  entries={selectedWorkspaceEntries}
                  selectedId={selectedWorkspaceEntryId}
                  onSelect={selectWorkspaceEntry}
                  mode={workspaceEntryBrowseMode}
                  onModeChange={setWorkspaceEntryBrowseMode}
                  emptyMessage="This browser snapshot is empty."
                  ariaLabel={`${selected.name} browser tabs`}
                />
              </div>
            </>
          )}
        </section>
      </div>
      {workspacePrompt ? (
        <TextPromptDialog
          title={workspacePrompt.kind === 'create-project' ? 'Create project workspace' : workspacePrompt.kind === 'rename-project' ? 'Rename workspace' : 'Rename browser snapshot'}
          description={workspacePrompt.kind === 'create-project' ? 'Save the snapshot links to the selected library collection, then create a reusable project working set from those items.' : 'Use a short name that makes this saved context easy to recognize.'}
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
      {workspaceManagerMode && managerProject ? (
        <ProjectWorkspaceManagerDialog
          projectName={managerProject.name}
          activeWorkspaceKey={getActiveProjectWorkspaceKey(homeState, managerProject.id)}
          entries={managerEntries}
          canCopyActiveWorkspace={managerEntries.some((entry) => entry.key === getActiveProjectWorkspaceKey(homeState, managerProject.id))}
          initialMode={workspaceManagerMode}
          onClose={() => setWorkspaceManagerMode(null)}
          onActivate={(workspaceKey) => onHomeStateChange(activateWorkspaceByKey({ state: homeState, workspaceKey, projectId: managerProject.id, preferenceProjectId: managerProject.id }))}
          onCreate={createManagedWorkspace}
          onRename={renameManagedWorkspace}
          onMerge={(sourceSessionId, targetWorkspaceKey) => onHomeStateChange(mergeSavedProjectWorkspace({ state: homeState, sourceSessionId, targetWorkspaceKey }))}
          onDelete={(sessionId) => onHomeStateChange(deleteSavedProjectWorkspace({ state: homeState, sessionId }))}
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
const entryDetailStyle: React.CSSProperties = { display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' };
const activeBadgeStyle: React.CSSProperties = { padding: '1px 5px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' };
