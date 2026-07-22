import type { Project, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import {
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionWorkspaceKey,
  getSavedWorkspaceSessionKey,
} from './workspaceSession';

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
  browserWorkspaces,
  state,
  contextProjectId,
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
    workspaceName: 'Workspace',
    path: 'Global / Workspace',
    kind: 'global',
    isCurrent: contextProjectId === 'all',
  }];

  for (const project of projects) {
    const activeKey = getActiveProjectWorkspaceKey(state, project.id);
    const liveKey = getProjectSessionWorkspaceKey(project.id);
    destinations.push({
      key: liveKey,
      projectId: project.id,
      projectName: project.name,
      workspaceName: 'Live session',
      path: `${project.name} / Live session`,
      kind: 'live',
      isCurrent: contextProjectId === project.id && activeKey === liveKey,
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
        path: `${project.name} / ${session.name}`,
        kind: 'saved',
        isCurrent: contextProjectId === project.id && activeKey === key,
      });
    }

    const snapshots = browserWorkspaces
      .filter((workspace) => workspace.projectId === project.id)
      .sort((left, right) => right.updated_at - left.updated_at);
    for (const workspace of snapshots) {
      const key = getSavedWorkspaceSessionKey(workspace.id);
      destinations.push({
        key,
        projectId: project.id,
        projectName: project.name,
        workspaceName: `${workspace.name} · browser`,
        path: `${project.name} / ${workspace.name} · browser`,
        kind: 'browser',
        sourceWorkspaceId: workspace.id,
        isCurrent: contextProjectId === project.id && activeKey === key,
      });
    }
  }

  return destinations;
}

export function rememberWorkspaceDestination(
  recentKeys: readonly string[] | undefined,
  destinationKey: string,
  limit = 5
): string[] {
  return [destinationKey, ...(recentKeys ?? []).filter((key) => key !== destinationKey)].slice(0, limit);
}
