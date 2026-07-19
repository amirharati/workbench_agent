import type { Item, Workspace } from '../../lib/db';
import { normalizeBookmarkUrl } from '../../lib/db';
import type {
  GlobalTab,
  GlobalTabState,
  GlobalTabUrl,
  SavedWorkspaceSession,
} from './GlobalTabSystem';
import { getGlobalTabProjectId } from './GlobalTabSystem';

export function getProjectSessionTabs(
  tabs: readonly GlobalTab[],
  projectId: string | 'all'
): GlobalTab[] {
  return tabs.filter((tab) => getGlobalTabProjectId(tab) === projectId);
}

export function getVisibleWorkspaceTabs(
  tabs: readonly GlobalTab[],
  projectId: string | 'all',
  includeGlobalWork = false
): GlobalTab[] {
  if (projectId === 'all') return getProjectSessionTabs(tabs, 'all');
  return tabs.filter((tab) => {
    const tabProjectId = getGlobalTabProjectId(tab);
    return tabProjectId === projectId || (includeGlobalWork && tabProjectId === 'all');
  });
}

export function getProjectSessionWorkspaceKey(projectId: string): string {
  return `project-session:${projectId}`;
}

export function getSavedWorkspaceSessionKey(workspaceId: string): string {
  return `saved-workspace:${workspaceId}`;
}

export function getHomebaseWorkspaceSessionKey(sessionId: string): string {
  return `homebase-workspace:${sessionId}`;
}

export function getActiveProjectWorkspaceKey(state: GlobalTabState, projectId: string): string {
  return state.activeWorkspaceKeyByProject?.[projectId] ?? getProjectSessionWorkspaceKey(projectId);
}

export function getProjectSessionResumeTabId(
  state: GlobalTabState,
  projectId: string | 'all'
): string | null {
  const sessionTabs = getProjectSessionTabs(state.tabs, projectId);
  const remembered = state.lastActiveTabByProject?.[projectId];
  if (remembered && sessionTabs.some((tab) => tab.id === remembered)) return remembered;
  return sessionTabs[sessionTabs.length - 1]?.id ?? null;
}

function tabUrl(tab: GlobalTab, itemById: ReadonlyMap<string, Item>): string | undefined {
  if (tab.kind === 'url') return tab.url;
  if (tab.kind === 'item') return itemById.get(tab.itemId)?.url;
  return undefined;
}

function hashUrl(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export interface LoadWorkspaceSessionResult {
  tabs: GlobalTab[];
  addedTabIds: string[];
  activeTabId: string | null;
}

function activateProjectWorkspaceTarget({
  state,
  projectId,
  targetKey,
  initialTabs,
}: {
  state: GlobalTabState;
  projectId: string;
  targetKey: string;
  initialTabs: readonly GlobalTab[];
}): GlobalTabState {
  const currentKey = getActiveProjectWorkspaceKey(state, projectId);
  if (currentKey === targetKey) return { ...state, activeTabId: null };

  const currentTabs = getProjectSessionTabs(state.tabs, projectId);
  const otherTabs = state.tabs.filter((tab) => getGlobalTabProjectId(tab) !== projectId);
  const snapshots = {
    ...(state.workspaceSessionSnapshots ?? {}),
    [currentKey]: currentTabs,
  };
  const targetTabs = snapshots[targetKey] ?? [...initialTabs];

  const lastActiveTabByProject = { ...(state.lastActiveTabByProject ?? {}) };
  if (targetTabs.length > 0) lastActiveTabByProject[projectId] = targetTabs[targetTabs.length - 1].id;
  else delete lastActiveTabByProject[projectId];

  return {
    ...state,
    tabs: [...otherTabs, ...targetTabs],
    activeTabId: null,
    lastActiveTabByProject,
    activeWorkspaceKeyByProject: {
      ...(state.activeWorkspaceKeyByProject ?? {}),
      [projectId]: targetKey,
    },
    workspaceSessionSnapshots: snapshots,
    savedWorkspaceSessions: (state.savedWorkspaceSessions ?? []).map((session) =>
      getHomebaseWorkspaceSessionKey(session.id) === currentKey
        ? { ...session, updatedAt: Date.now() }
        : session
    ),
  };
}

export function saveCurrentProjectWorkspace({
  state,
  projectId,
  name,
  sessionId = crypto.randomUUID(),
  now = Date.now(),
}: {
  state: GlobalTabState;
  projectId: string;
  name: string;
  sessionId?: string;
  now?: number;
}): GlobalTabState {
  const currentKey = getActiveProjectWorkspaceKey(state, projectId);
  const targetKey = getHomebaseWorkspaceSessionKey(sessionId);
  const currentTabs = getProjectSessionTabs(state.tabs, projectId);
  const session: SavedWorkspaceSession = {
    id: sessionId,
    name: name.trim(),
    projectId,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...state,
    activeTabId: null,
    activeWorkspaceKeyByProject: {
      ...(state.activeWorkspaceKeyByProject ?? {}),
      [projectId]: targetKey,
    },
    workspaceSessionSnapshots: {
      ...(state.workspaceSessionSnapshots ?? {}),
      [currentKey]: currentTabs,
      [targetKey]: currentTabs,
    },
    savedWorkspaceSessions: [
      ...(state.savedWorkspaceSessions ?? []).filter((candidate) => candidate.id !== sessionId),
      session,
    ],
  };
}

export function activateSavedProjectWorkspace({
  state,
  session,
}: {
  state: GlobalTabState;
  session: SavedWorkspaceSession;
}): GlobalTabState {
  return activateProjectWorkspaceTarget({
    state,
    projectId: session.projectId,
    targetKey: getHomebaseWorkspaceSessionKey(session.id),
    initialTabs: [],
  });
}

export function deleteSavedProjectWorkspace({
  state,
  sessionId,
}: {
  state: GlobalTabState;
  sessionId: string;
}): GlobalTabState {
  const session = state.savedWorkspaceSessions?.find((candidate) => candidate.id === sessionId);
  if (!session) return state;
  const sessionKey = getHomebaseWorkspaceSessionKey(session.id);
  const activeKey = getActiveProjectWorkspaceKey(state, session.projectId);
  const switched = activeKey === sessionKey
    ? activateProjectWorkspaceTarget({
        state,
        projectId: session.projectId,
        targetKey: getProjectSessionWorkspaceKey(session.projectId),
        initialTabs: [],
      })
    : state;
  const snapshots = { ...(switched.workspaceSessionSnapshots ?? {}) };
  delete snapshots[sessionKey];

  return {
    ...switched,
    workspaceSessionSnapshots: snapshots,
    savedWorkspaceSessions: (switched.savedWorkspaceSessions ?? []).filter(
      (candidate) => candidate.id !== sessionId
    ),
  };
}

function workspaceEntriesMatch(left: GlobalTab, right: GlobalTab): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'item' && right.kind === 'item') return left.itemId === right.itemId;
  if (left.kind === 'url' && right.kind === 'url') {
    return normalizeBookmarkUrl(left.url) === normalizeBookmarkUrl(right.url);
  }
  if (left.kind === 'search' && right.kind === 'search') {
    return (
      left.query.trim().toLowerCase() === right.query.trim().toLowerCase() &&
      (left.mode ?? 'hybrid') === (right.mode ?? 'hybrid') &&
      JSON.stringify(left.filters ?? {}) === JSON.stringify(right.filters ?? {})
    );
  }
  return left.id === right.id;
}

export function getProjectWorkspaceTabs(
  state: GlobalTabState,
  projectId: string,
  workspaceKey: string
): GlobalTab[] {
  return getActiveProjectWorkspaceKey(state, projectId) === workspaceKey
    ? getProjectSessionTabs(state.tabs, projectId)
    : [...(state.workspaceSessionSnapshots?.[workspaceKey] ?? [])];
}

function setProjectWorkspaceTabs(
  state: GlobalTabState,
  projectId: string,
  workspaceKey: string,
  nextTabs: GlobalTab[]
): GlobalTabState {
  const active = getActiveProjectWorkspaceKey(state, projectId) === workspaceKey;
  const nextState = active
    ? {
        ...state,
        tabs: [
          ...state.tabs.filter((tab) => getGlobalTabProjectId(tab) !== projectId),
          ...nextTabs,
        ],
      }
    : {
        ...state,
        workspaceSessionSnapshots: {
          ...(state.workspaceSessionSnapshots ?? {}),
          [workspaceKey]: nextTabs,
        },
      };

  return {
    ...nextState,
    savedWorkspaceSessions: (nextState.savedWorkspaceSessions ?? []).map((session) =>
      getHomebaseWorkspaceSessionKey(session.id) === workspaceKey
        ? { ...session, updatedAt: Date.now() }
        : session
    ),
  };
}

export function addEntryToProjectWorkspace({
  state,
  projectId,
  targetWorkspaceKey,
  entry,
}: {
  state: GlobalTabState;
  projectId: string;
  targetWorkspaceKey: string;
  entry: GlobalTab;
}): GlobalTabState {
  const targetTabs = getProjectWorkspaceTabs(state, projectId, targetWorkspaceKey);
  if (targetTabs.some((candidate) => workspaceEntriesMatch(candidate, entry))) return state;
  const scopedEntry = {
    ...entry,
    scopeProjectId: projectId,
    scopeCollectionId: entry.scopeCollectionId,
    pinnedGlobally: undefined,
  } as GlobalTab;
  return setProjectWorkspaceTabs(state, projectId, targetWorkspaceKey, [...targetTabs, scopedEntry]);
}

export function transferProjectWorkspaceEntry({
  state,
  projectId,
  sourceWorkspaceKey,
  targetWorkspaceKey,
  entry,
  mode,
}: {
  state: GlobalTabState;
  projectId: string;
  sourceWorkspaceKey: string;
  targetWorkspaceKey: string;
  entry: GlobalTab;
  mode: 'copy' | 'move';
}): GlobalTabState {
  if (sourceWorkspaceKey === targetWorkspaceKey) return state;
  const copied = addEntryToProjectWorkspace({ state, projectId, targetWorkspaceKey, entry });
  if (mode === 'copy') return copied;
  const sourceTabs = getProjectWorkspaceTabs(copied, projectId, sourceWorkspaceKey);
  return setProjectWorkspaceTabs(
    copied,
    projectId,
    sourceWorkspaceKey,
    sourceTabs.filter((candidate) => !workspaceEntriesMatch(candidate, entry))
  );
}

export function addBrowserSnapshotToProjectWorkspace({
  state,
  workspace,
  items,
  projectId,
  targetWorkspaceKey,
}: {
  state: GlobalTabState;
  workspace: Workspace;
  items: readonly Item[];
  projectId: string;
  targetWorkspaceKey: string;
}): GlobalTabState {
  const converted = loadWorkspaceIntoProjectSession({
    workspace,
    existingTabs: [],
    items,
    projectId,
  }).tabs;
  return converted.reduce(
    (nextState, entry) => addEntryToProjectWorkspace({
      state: nextState,
      projectId,
      targetWorkspaceKey,
      entry,
    }),
    state
  );
}

export function createProjectWorkspaceFromBrowserSnapshot({
  state,
  workspace,
  items,
  projectId,
  name,
  sessionId = crypto.randomUUID(),
  now = Date.now(),
}: {
  state: GlobalTabState;
  workspace: Workspace;
  items: readonly Item[];
  projectId: string;
  name: string;
  sessionId?: string;
  now?: number;
}): GlobalTabState {
  const currentKey = getActiveProjectWorkspaceKey(state, projectId);
  const targetKey = getHomebaseWorkspaceSessionKey(sessionId);
  const currentTabs = getProjectSessionTabs(state.tabs, projectId);
  const otherTabs = state.tabs.filter((tab) => getGlobalTabProjectId(tab) !== projectId);
  const convertedTabs = loadWorkspaceIntoProjectSession({
    workspace,
    existingTabs: [],
    items,
    projectId,
  }).tabs;
  const lastActiveTabByProject = { ...(state.lastActiveTabByProject ?? {}) };
  if (convertedTabs.length > 0) {
    lastActiveTabByProject[projectId] = convertedTabs[convertedTabs.length - 1].id;
  } else {
    delete lastActiveTabByProject[projectId];
  }

  return {
    ...state,
    tabs: [...otherTabs, ...convertedTabs],
    activeTabId: null,
    lastActiveTabByProject,
    activeWorkspaceKeyByProject: {
      ...(state.activeWorkspaceKeyByProject ?? {}),
      [projectId]: targetKey,
    },
    workspaceSessionSnapshots: {
      ...(state.workspaceSessionSnapshots ?? {}),
      [currentKey]: currentTabs,
      [targetKey]: convertedTabs,
    },
    savedWorkspaceSessions: [
      ...(state.savedWorkspaceSessions ?? []).filter((session) => session.id !== sessionId),
      {
        id: sessionId,
        name: name.trim(),
        projectId,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

/**
 * Add a saved browser workspace to a live Homebase session without replacing
 * existing work. Saved URLs become item tabs when possible and lightweight URL
 * tabs otherwise.
 */
export function loadWorkspaceIntoProjectSession({
  workspace,
  existingTabs,
  items,
  projectId,
}: {
  workspace: Workspace;
  existingTabs: readonly GlobalTab[];
  items: readonly Item[];
  projectId: string | 'all';
}): LoadWorkspaceSessionResult {
  const tabs = [...existingTabs];
  const addedTabIds: string[] = [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemByUrl = new Map<string, Item>();
  for (const item of items) {
    if (!item.url) continue;
    itemByUrl.set(normalizeBookmarkUrl(item.url), item);
  }

  const existingByUrl = new Map<string, string>();
  for (const tab of getProjectSessionTabs(tabs, projectId)) {
    const url = tabUrl(tab, itemById);
    if (!url) continue;
    existingByUrl.set(normalizeBookmarkUrl(url), tab.id);
  }

  let activeTabId: string | null = null;
  const scope = projectId === 'all' ? {} : { scopeProjectId: projectId };

  for (const workspaceTab of workspace.windows.flatMap((window) => window.tabs)) {
    if (!workspaceTab.url) continue;
    const normalizedUrl = normalizeBookmarkUrl(workspaceTab.url);
    if (!normalizedUrl) continue;

    const existingId = existingByUrl.get(normalizedUrl);
    if (existingId) {
      activeTabId ??= existingId;
      continue;
    }

    const item = itemByUrl.get(normalizedUrl);
    let nextTab: GlobalTab;
    if (item) {
      nextTab = {
        kind: 'item',
        id: `item-${item.id}${projectId === 'all' ? '' : `@project:${projectId}`}`,
        itemId: item.id,
        ...scope,
      };
    } else {
      const baseId = `url-${hashUrl(normalizedUrl)}${projectId === 'all' ? '' : `@project:${projectId}`}`;
      let id = baseId;
      let collisionIndex = 2;
      while (tabs.some((tab) => tab.id === id)) {
        id = `${baseId}-${collisionIndex}`;
        collisionIndex += 1;
      }
      nextTab = {
        kind: 'url',
        id,
        url: workspaceTab.url,
        title: workspaceTab.title,
        favIconUrl: workspaceTab.favIconUrl,
        ...scope,
      } satisfies GlobalTabUrl;
    }

    tabs.push(nextTab);
    addedTabIds.push(nextTab.id);
    existingByUrl.set(normalizedUrl, nextTab.id);
    activeTabId ??= nextTab.id;
  }

  return { tabs, addedTabIds, activeTabId };
}

/**
 * Switch the project's in-page working set. The workspace being left is
 * snapshotted automatically; the target resumes its latest live snapshot or
 * is initialized from its durable Tab Commander workspace.
 */
export function activateProjectWorkspace({
  state,
  projectId,
  workspace,
  items,
}: {
  state: GlobalTabState;
  projectId: string;
  workspace: Workspace | null;
  items: readonly Item[];
}): GlobalTabState {
  const targetKey = workspace
    ? getSavedWorkspaceSessionKey(workspace.id)
    : getProjectSessionWorkspaceKey(projectId);
  const initialTabs = workspace
    ? getProjectSessionTabs(
        loadWorkspaceIntoProjectSession({
          workspace,
          existingTabs: [],
          items,
          projectId,
        }).tabs,
        projectId
      )
    : [];

  return activateProjectWorkspaceTarget({ state, projectId, targetKey, initialTabs });
}
