import type { Project, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import {
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionWorkspaceKey,
} from './workspaceSession';
import { formatGeneralWorkspaceName, formatProjectWorkspaceName } from './workspaceLabels';

export type WorkspaceDestinationKind = 'global' | 'live' | 'saved' | 'browser';

export interface WorkspaceDestination {
  key: string;
  projectId: string | 'all';
  projectName: string;
  workspaceName: string;
  path: string;
  kind: WorkspaceDestinationKind;
  sourceWorkspaceId?: string;
  isCurrent: boolean;
}

export function buildWorkspaceDestinations({
  projects,
  browserWorkspaces: _browserWorkspaces,
  state,
  contextProjectId: _contextProjectId,
}: {
  projects: readonly Project[];
  browserWorkspaces: readonly Workspace[];
  state: GlobalTabState;
  contextProjectId: string | 'all';
}): WorkspaceDestination[] {
  const destinations: WorkspaceDestination[] = [{
    key: getProjectSessionWorkspaceKey('all'),
    projectId: 'all',
    projectName: 'Global',
    workspaceName: 'Global workspace',
    path: 'Global workspace',
    kind: 'global',
    isCurrent: getActiveProjectWorkspaceKey(state, 'all') === getProjectSessionWorkspaceKey('all'),
  }];

  for (const project of projects) {
    const activeKey = getActiveProjectWorkspaceKey(state, project.id);
    const liveKey = getProjectSessionWorkspaceKey(project.id);
    destinations.push({
      key: liveKey,
      projectId: project.id,
      projectName: project.name,
      workspaceName: 'General',
      path: formatGeneralWorkspaceName(project.name),
      kind: 'live',
      isCurrent: activeKey === liveKey,
    });

    const savedSessions = (state.savedWorkspaceSessions ?? [])
      .filter((session) => session.projectId === project.id)
      .sort((left, right) => right.updatedAt - left.updatedAt);
    for (const session of savedSessions) {
      const key = getHomebaseWorkspaceSessionKey(session.id);
      destinations.push({
        key,
        projectId: project.id,
        projectName: project.name,
        workspaceName: session.name,
        path: formatProjectWorkspaceName(project.name, session.name),
        kind: 'saved',
        isCurrent: activeKey === key,
      });
    }
  }

  return destinations;
}

/**
 * Keep passive workspace switchers contextual and short. Explicit filing
 * pickers still use the complete destination list.
 */
export function filterWorkspaceSwitcherDestinations({
  destinations,
  openProjectIds,
  contextProjectId,
  activeWorkspaceKey,
}: {
  destinations: readonly WorkspaceDestination[];
  openProjectIds: readonly string[];
  contextProjectId: string | 'all';
  activeWorkspaceKey?: string;
}): WorkspaceDestination[] {
  const visibleProjectIds = new Set(openProjectIds);
  if (contextProjectId !== 'all') visibleProjectIds.add(contextProjectId);

  return destinations.filter(
    (destination) =>
      destination.projectId === 'all' ||
      visibleProjectIds.has(destination.projectId) ||
      destination.key === activeWorkspaceKey
  );
}

export function rememberWorkspaceDestination(
  recentKeys: readonly string[] | undefined,
  destinationKey: string,
  limit = 5
): string[] {
  return [destinationKey, ...(recentKeys ?? []).filter((key) => key !== destinationKey)].slice(0, limit);
}
