import type { Item, Workspace } from '../../lib/db';
import { normalizeBookmarkUrl } from '../../lib/db';
import type { GlobalTab, GlobalTabState, GlobalTabUrl } from './GlobalTabSystem';
import { getGlobalTabProjectId } from './GlobalTabSystem';

export function getProjectSessionTabs(
  tabs: readonly GlobalTab[],
  projectId: string | 'all'
): GlobalTab[] {
  return tabs.filter((tab) => getGlobalTabProjectId(tab) === projectId);
}

export function getProjectSessionWorkspaceKey(projectId: string): string {
  return `project-session:${projectId}`;
}

export function getSavedWorkspaceSessionKey(workspaceId: string): string {
  return `saved-workspace:${workspaceId}`;
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
  const currentKey = getActiveProjectWorkspaceKey(state, projectId);
  const targetKey = workspace
    ? getSavedWorkspaceSessionKey(workspace.id)
    : getProjectSessionWorkspaceKey(projectId);

  if (currentKey === targetKey) return { ...state, activeTabId: null };

  const currentTabs = getProjectSessionTabs(state.tabs, projectId);
  const otherTabs = state.tabs.filter((tab) => getGlobalTabProjectId(tab) !== projectId);
  const snapshots = {
    ...(state.workspaceSessionSnapshots ?? {}),
    [currentKey]: currentTabs,
  };

  const targetTabs = snapshots[targetKey]
    ? snapshots[targetKey]
    : workspace
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
  };
}
