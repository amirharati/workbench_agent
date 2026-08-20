import type { Item, Workspace } from '../../lib/db';
import { normalizeBookmarkUrl } from '../../lib/db';
import type {
  GlobalTab,
  GlobalTabState,
  GlobalTabUrl,
  SavedWorkspaceSession,
} from './GlobalTabSystem';
import { GLOBAL_WORKSPACE_KEY, getGlobalTabProjectId } from './GlobalTabSystem';

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
  return projectId === 'all' ? GLOBAL_WORKSPACE_KEY : `workspace:project:${projectId}:general`;
}

export function getSavedWorkspaceSessionKey(workspaceId: string): string {
  return `browser-snapshot:${workspaceId}`;
}

export function getHomebaseWorkspaceSessionKey(sessionId: string): string {
  return `workspace:named:${sessionId}`;
}

/** Resolve the owner used to scope entries in a Homebase workspace. */
export function getWorkspaceProjectId(
  state: GlobalTabState,
  workspaceKey: string
): string | 'all' {
  if (workspaceKey === GLOBAL_WORKSPACE_KEY) return 'all';
  const projectPrefix = 'workspace:project:';
  const generalSuffix = ':general';
  if (workspaceKey.startsWith(projectPrefix) && workspaceKey.endsWith(generalSuffix)) {
    return workspaceKey.slice(projectPrefix.length, -generalSuffix.length) || 'all';
  }
  const namedPrefix = 'workspace:named:';
  if (workspaceKey.startsWith(namedPrefix)) {
    const sessionId = workspaceKey.slice(namedPrefix.length);
    return state.savedWorkspaceSessions?.find((session) => session.id === sessionId)?.projectId ?? 'all';
  }
  return 'all';
}

export function getActiveWorkspaceKey(state: GlobalTabState): string {
  return state.activeWorkspaceKey?.trim() || GLOBAL_WORKSPACE_KEY;
}

function workspaceKeyExists(state: GlobalTabState, workspaceKey: string): boolean {
  if (workspaceKey === GLOBAL_WORKSPACE_KEY) return true;
  if (workspaceKey.startsWith('workspace:project:') && workspaceKey.endsWith(':general')) return true;
  if (workspaceKey.startsWith('workspace:named:')) {
    const sessionId = workspaceKey.slice('workspace:named:'.length);
    return Boolean(state.savedWorkspaceSessions?.some((session) => session.id === sessionId));
  }
  return false;
}

export function getPreferredWorkspaceKey(
  state: GlobalTabState,
  projectId: string | 'all'
): string {
  const preferred = state.preferredWorkspaceKeyByProject?.[projectId];
  if (preferred && workspaceKeyExists(state, preferred)) return preferred;
  return getProjectSessionWorkspaceKey(projectId);
}

export function getActiveProjectWorkspaceKey(state: GlobalTabState, _projectId: string): string {
  return getActiveWorkspaceKey(state);
}

export function getProjectSessionResumeTabId(
  state: GlobalTabState,
  projectId: string | 'all'
): string | null {
  const workspaceKey = getProjectSessionWorkspaceKey(projectId);
  const sessionTabs = getProjectWorkspaceTabs(state, projectId, workspaceKey);
  const remembered = state.lastActiveEntryByWorkspace?.[workspaceKey];
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
  projectId: _projectId,
  targetKey,
  initialTabs,
}: {
  state: GlobalTabState;
  projectId: string;
  targetKey: string;
  initialTabs: readonly GlobalTab[];
}): GlobalTabState {
  const currentKey = getActiveWorkspaceKey(state);
  if (currentKey === targetKey) return { ...state, activeTabId: null };

  const currentTabs = state.tabs;
  const snapshots = {
    ...(state.workspaceSessionSnapshots ?? {}),
    [currentKey]: currentTabs,
  };
  const targetTabs = snapshots[targetKey] ?? [...initialTabs];

  const lastActiveEntryByWorkspace = { ...(state.lastActiveEntryByWorkspace ?? {}) };
  const resumedEntryId = lastActiveEntryByWorkspace[targetKey];
  const activeTabId = resumedEntryId && targetTabs.some((entry) => entry.id === resumedEntryId)
    ? resumedEntryId
    : null;

  return {
    ...state,
    tabs: [...targetTabs],
    activeTabId,
    activeWorkspaceKey: targetKey,
    lastActiveEntryByWorkspace,
    workspaceSessionSnapshots: { ...snapshots, [targetKey]: [...targetTabs] },
    savedWorkspaceSessions: (state.savedWorkspaceSessions ?? []).map((session) =>
      getHomebaseWorkspaceSessionKey(session.id) === currentKey
        ? { ...session, updatedAt: Date.now() }
        : session
    ),
  };
}

export function activateWorkspace({
  state,
  workspaceKey,
  projectId = 'all',
  initialEntries = [],
  preferenceProjectId,
}: {
  state: GlobalTabState;
  workspaceKey: string;
  projectId?: string | 'all';
  initialEntries?: readonly GlobalTab[];
  preferenceProjectId?: string | 'all';
}): GlobalTabState {
  const activated = activateProjectWorkspaceTarget({
    state,
    projectId,
    targetKey: workspaceKey,
    initialTabs: initialEntries,
  });
  if (preferenceProjectId == null) return activated;
  return {
    ...activated,
    preferredWorkspaceKeyByProject: {
      ...(activated.preferredWorkspaceKeyByProject ?? {}),
      [preferenceProjectId]: workspaceKey,
    },
  };
}

export function createProjectWorkspace({
  state,
  projectId,
  name,
  copyCurrent = false,
  sessionId = crypto.randomUUID(),
  now = Date.now(),
}: {
  state: GlobalTabState;
  projectId: string;
  name: string;
  copyCurrent?: boolean;
  sessionId?: string;
  now?: number;
}): GlobalTabState {
  const currentKey = getActiveWorkspaceKey(state);
  const targetKey = getHomebaseWorkspaceSessionKey(sessionId);
  const currentTabs = [...state.tabs];
  const targetTabs = copyCurrent ? currentTabs : [];
  const lastActiveEntryByWorkspace = { ...(state.lastActiveEntryByWorkspace ?? {}) };
  delete lastActiveEntryByWorkspace[targetKey];

  return {
    ...state,
    tabs: [...targetTabs],
    activeTabId: null,
    activeWorkspaceKey: targetKey,
    preferredWorkspaceKeyByProject: {
      ...(state.preferredWorkspaceKeyByProject ?? {}),
      [projectId]: targetKey,
    },
    lastActiveEntryByWorkspace,
    workspaceSessionSnapshots: {
      ...(state.workspaceSessionSnapshots ?? {}),
      [currentKey]: currentTabs,
      [targetKey]: [...targetTabs],
    },
    savedWorkspaceSessions: [
      ...(state.savedWorkspaceSessions ?? []).filter((candidate) => candidate.id !== sessionId),
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

export function renameSavedProjectWorkspace({
  state,
  sessionId,
  name,
  now = Date.now(),
}: {
  state: GlobalTabState;
  sessionId: string;
  name: string;
  now?: number;
}): GlobalTabState {
  return {
    ...state,
    savedWorkspaceSessions: (state.savedWorkspaceSessions ?? []).map((session) =>
      session.id === sessionId
        ? { ...session, name: name.trim(), updatedAt: now }
        : session
    ),
  };
}

export function activateSavedProjectWorkspace({
  state,
  session,
}: {
  state: GlobalTabState;
  session: SavedWorkspaceSession;
}): GlobalTabState {
  return activateWorkspace({
    state,
    projectId: session.projectId,
    workspaceKey: getHomebaseWorkspaceSessionKey(session.id),
    initialEntries: [],
    preferenceProjectId: session.projectId,
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
  const activeKey = getActiveWorkspaceKey(state);
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
  const preferredWorkspaceKeyByProject = Object.fromEntries(
    Object.entries(switched.preferredWorkspaceKeyByProject ?? {}).map(([contextProjectId, workspaceKey]) => [
      contextProjectId,
      workspaceKey === sessionKey ? getProjectSessionWorkspaceKey(contextProjectId) : workspaceKey,
    ])
  );

  return {
    ...switched,
    workspaceSessionSnapshots: snapshots,
    preferredWorkspaceKeyByProject,
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
  _projectId: string,
  workspaceKey: string
): GlobalTab[] {
  return getActiveWorkspaceKey(state) === workspaceKey
    ? [...state.tabs]
    : [...(state.workspaceSessionSnapshots?.[workspaceKey] ?? [])];
}

function setProjectWorkspaceTabs(
  state: GlobalTabState,
  _projectId: string,
  workspaceKey: string,
  nextTabs: GlobalTab[]
): GlobalTabState {
  const active = getActiveWorkspaceKey(state) === workspaceKey;
  const nextState = active
    ? {
        ...state,
        tabs: [...nextTabs],
        workspaceSessionSnapshots: {
          ...(state.workspaceSessionSnapshots ?? {}),
          [workspaceKey]: [...nextTabs],
        },
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

/** Remove one workspace entry without deleting the underlying library item. */
export function removeEntryFromProjectWorkspace({
  state,
  projectId,
  workspaceKey,
  entryId,
}: {
  state: GlobalTabState;
  projectId: string | 'all';
  workspaceKey: string;
  entryId: string;
}): GlobalTabState {
  const currentTabs = getProjectWorkspaceTabs(state, projectId, workspaceKey);
  const nextTabs = currentTabs.filter((entry) => entry.id !== entryId);
  if (nextTabs.length === currentTabs.length) return state;

  const next = setProjectWorkspaceTabs(state, projectId, workspaceKey, nextTabs);
  const lastActiveEntryByWorkspace = { ...(next.lastActiveEntryByWorkspace ?? {}) };
  if (lastActiveEntryByWorkspace[workspaceKey] === entryId) {
    delete lastActiveEntryByWorkspace[workspaceKey];
  }
  return {
    ...next,
    activeTabId: getActiveWorkspaceKey(next) === workspaceKey && next.activeTabId === entryId
      ? null
      : next.activeTabId,
    lastActiveEntryByWorkspace,
  };
}

/**
 * Move every entry from one named workspace into another workspace in the same
 * project, deduplicating before the source workspace is removed. Library items
 * are references here, so this never deletes or modifies underlying records.
 */
export function mergeSavedProjectWorkspace({
  state,
  sourceSessionId,
  targetWorkspaceKey,
}: {
  state: GlobalTabState;
  sourceSessionId: string;
  targetWorkspaceKey: string;
}): GlobalTabState {
  const source = state.savedWorkspaceSessions?.find(
    (session) => session.id === sourceSessionId
  );
  if (!source) return state;

  const sourceKey = getHomebaseWorkspaceSessionKey(source.id);
  if (
    sourceKey === targetWorkspaceKey ||
    getWorkspaceProjectId(state, targetWorkspaceKey) !== source.projectId
  ) return state;

  const sourceTabs = getProjectWorkspaceTabs(state, source.projectId, sourceKey);
  const targetTabs = getProjectWorkspaceTabs(state, source.projectId, targetWorkspaceKey);
  const mergedTabs = [...targetTabs];
  for (const entry of sourceTabs) {
    if (!mergedTabs.some((candidate) => workspaceEntriesMatch(candidate, entry))) {
      mergedTabs.push(entry);
    }
  }

  let next = setProjectWorkspaceTabs(
    state,
    source.projectId,
    targetWorkspaceKey,
    mergedTabs
  );
  if (getActiveWorkspaceKey(next) === sourceKey) {
    next = activateProjectWorkspaceTarget({
      state: next,
      projectId: source.projectId,
      targetKey: targetWorkspaceKey,
      initialTabs: mergedTabs,
    });
  }

  const snapshots = { ...(next.workspaceSessionSnapshots ?? {}) };
  delete snapshots[sourceKey];
  const lastActiveEntryByWorkspace = { ...(next.lastActiveEntryByWorkspace ?? {}) };
  delete lastActiveEntryByWorkspace[sourceKey];
  const preferredWorkspaceKeyByProject = Object.fromEntries(
    Object.entries(next.preferredWorkspaceKeyByProject ?? {}).map(([contextProjectId, workspaceKey]) => [
      contextProjectId,
      workspaceKey === sourceKey ? targetWorkspaceKey : workspaceKey,
    ])
  );

  return {
    ...next,
    workspaceSessionSnapshots: snapshots,
    lastActiveEntryByWorkspace,
    preferredWorkspaceKeyByProject,
    savedWorkspaceSessions: (next.savedWorkspaceSessions ?? []).filter(
      (session) => session.id !== sourceSessionId
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
    scopeProjectId: projectId === 'all' ? undefined : projectId,
    scopeCollectionId: entry.scopeCollectionId,
    pinnedGlobally: undefined,
  } as GlobalTab;
  return setProjectWorkspaceTabs(state, projectId, targetWorkspaceKey, [...targetTabs, scopedEntry]);
}

export function getWorkspaceTargetTabs({
  state,
  projectId,
  targetWorkspaceKey,
  browserWorkspace,
  items,
}: {
  state: GlobalTabState;
  projectId: string | 'all';
  targetWorkspaceKey: string;
  browserWorkspace?: Workspace;
  items: readonly Item[];
}): GlobalTab[] {
  const active = getActiveWorkspaceKey(state) === targetWorkspaceKey;
  const hasSnapshot = Object.prototype.hasOwnProperty.call(
    state.workspaceSessionSnapshots ?? {},
    targetWorkspaceKey
  );
  if (browserWorkspace && !active && !hasSnapshot) {
    return loadWorkspaceIntoProjectSession({
      workspace: browserWorkspace,
      existingTabs: [],
      items,
      projectId,
    }).tabs;
  }
  return getProjectWorkspaceTabs(state, projectId, targetWorkspaceKey);
}

export function workspaceTargetContainsItem({
  state,
  projectId,
  targetWorkspaceKey,
  itemId,
  browserWorkspace,
  items,
}: {
  state: GlobalTabState;
  projectId: string | 'all';
  targetWorkspaceKey: string;
  itemId: string;
  browserWorkspace?: Workspace;
  items: readonly Item[];
}): boolean {
  return getWorkspaceTargetTabs({
    state,
    projectId,
    targetWorkspaceKey,
    browserWorkspace,
    items,
  }).some((tab) => tab.kind === 'item' && tab.itemId === itemId);
}

export function addItemToWorkspaceTarget({
  state,
  projectId,
  targetWorkspaceKey,
  item,
  browserWorkspace,
  items,
}: {
  state: GlobalTabState;
  projectId: string | 'all';
  targetWorkspaceKey: string;
  item: Item;
  browserWorkspace?: Workspace;
  items: readonly Item[];
}): GlobalTabState {
  const active = getActiveWorkspaceKey(state) === targetWorkspaceKey;
  const hasSnapshot = Object.prototype.hasOwnProperty.call(
    state.workspaceSessionSnapshots ?? {},
    targetWorkspaceKey
  );
  const seededState = browserWorkspace && !active && !hasSnapshot
    ? {
        ...state,
        workspaceSessionSnapshots: {
          ...(state.workspaceSessionSnapshots ?? {}),
          [targetWorkspaceKey]: getWorkspaceTargetTabs({
            state,
            projectId,
            targetWorkspaceKey,
            browserWorkspace,
            items,
          }),
        },
      }
    : state;
  const suffix = projectId === 'all' ? '' : `@project:${projectId}`;
  return addEntryToProjectWorkspace({
    state: seededState,
    projectId,
    targetWorkspaceKey,
    entry: {
      kind: 'item',
      id: `item-${item.id}${suffix}`,
      itemId: item.id,
      ...(projectId === 'all' ? {} : { scopeProjectId: projectId }),
    },
  });
}

export function removeItemFromWorkspaceTarget({
  state,
  projectId,
  targetWorkspaceKey,
  itemId,
}: {
  state: GlobalTabState;
  projectId: string | 'all';
  targetWorkspaceKey: string;
  itemId: string;
}): GlobalTabState {
  const targetTabs = getProjectWorkspaceTabs(state, projectId, targetWorkspaceKey);
  const nextTabs = targetTabs.filter(
    (entry) => entry.kind !== 'item' || entry.itemId !== itemId
  );
  if (nextTabs.length === targetTabs.length) return state;
  return setProjectWorkspaceTabs(state, projectId, targetWorkspaceKey, nextTabs);
}

export function transferItemBetweenWorkspaceTargets({
  state,
  item,
  items,
  sourceProjectId,
  sourceWorkspaceKey,
  targetProjectId,
  targetWorkspaceKey,
  mode,
}: {
  state: GlobalTabState;
  item: Item;
  items: readonly Item[];
  sourceProjectId: string | 'all';
  sourceWorkspaceKey: string;
  targetProjectId: string | 'all';
  targetWorkspaceKey: string;
  mode: 'copy' | 'move';
}): GlobalTabState {
  if (sourceWorkspaceKey === targetWorkspaceKey) return state;
  const added = addItemToWorkspaceTarget({
    state,
    projectId: targetProjectId,
    targetWorkspaceKey,
    item,
    items,
  });
  if (mode === 'copy') return added;
  return removeItemFromWorkspaceTarget({
    state: added,
    projectId: sourceProjectId,
    targetWorkspaceKey: sourceWorkspaceKey,
    itemId: item.id,
  });
}

export function reorderItemInWorkspaceTarget({
  state,
  projectId,
  workspaceKey,
  itemId,
  beforeItemId,
}: {
  state: GlobalTabState;
  projectId: string | 'all';
  workspaceKey: string;
  itemId: string;
  beforeItemId: string;
}): GlobalTabState {
  if (itemId === beforeItemId) return state;
  const tabs = getProjectWorkspaceTabs(state, projectId, workspaceKey);
  const sourceIndex = tabs.findIndex((entry) => entry.kind === 'item' && entry.itemId === itemId);
  const initialTargetIndex = tabs.findIndex(
    (entry) => entry.kind === 'item' && entry.itemId === beforeItemId
  );
  if (sourceIndex < 0 || initialTargetIndex < 0) return state;
  const nextTabs = [...tabs];
  const [entry] = nextTabs.splice(sourceIndex, 1);
  const targetIndex = sourceIndex < initialTargetIndex
    ? initialTargetIndex - 1
    : initialTargetIndex;
  nextTabs.splice(targetIndex, 0, entry);
  return setProjectWorkspaceTabs(state, projectId, workspaceKey, nextTabs);
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
  const currentKey = getActiveWorkspaceKey(state);
  const targetKey = getHomebaseWorkspaceSessionKey(sessionId);
  const currentTabs = [...state.tabs];
  const convertedTabs = loadWorkspaceIntoProjectSession({
    workspace,
    existingTabs: [],
    items,
    projectId,
  }).tabs;
  const lastActiveEntryByWorkspace = { ...(state.lastActiveEntryByWorkspace ?? {}) };
  if (convertedTabs.length > 0) {
    lastActiveEntryByWorkspace[targetKey] = convertedTabs[convertedTabs.length - 1].id;
  } else {
    delete lastActiveEntryByWorkspace[targetKey];
  }

  return {
    ...state,
    tabs: [...convertedTabs],
    activeTabId: null,
    lastActiveEntryByWorkspace,
    activeWorkspaceKey: targetKey,
    preferredWorkspaceKeyByProject: {
      ...(state.preferredWorkspaceKeyByProject ?? {}),
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

  return activateWorkspace({
    state,
    projectId,
    workspaceKey: targetKey,
    initialEntries: initialTabs,
    preferenceProjectId: projectId,
  });
}
