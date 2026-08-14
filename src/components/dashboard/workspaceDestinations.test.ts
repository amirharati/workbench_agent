import { describe, expect, it } from 'vitest';
import type { Project, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import { getHomebaseWorkspaceSessionKey } from './workspaceSession';
import { buildWorkspaceDestinations, rememberWorkspaceDestination } from './workspaceDestinations';

const projects: Project[] = [
  { id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 },
  { id: 'project-b', name: 'Writing', isDefault: false, created_at: 1, updated_at: 1 },
];
const browserWorkspace: Workspace = {
  id: 'browser-b',
  name: 'Reference tabs',
  projectId: 'project-b',
  windows: [],
  created_at: 1,
  updated_at: 2,
};
const state: GlobalTabState = {
  tabs: [],
  activeTabId: null,
  bottomLayout: 'tabs',
  isSidebarCollapsed: false,
  activeWorkspaceKey: getHomebaseWorkspaceSessionKey('saved-a'),
  savedWorkspaceSessions: [
    { id: 'saved-a', name: 'Reading plan', projectId: 'project-a', createdAt: 1, updatedAt: 3 },
  ],
};

describe('workspace destinations', () => {
  it('addresses Global, project General, and named workspaces while excluding browser snapshots', () => {
    const destinations = buildWorkspaceDestinations({
      projects,
      browserWorkspaces: [browserWorkspace],
      state,
      contextProjectId: 'project-b',
    });

    expect(destinations.map((destination) => destination.path)).toEqual([
      'Global workspace',
      'Research — General',
      'Research — Reading plan',
      'Writing — General',
    ]);
    expect(destinations.find((destination) => destination.isCurrent)?.key).toBe(
      getHomebaseWorkspaceSessionKey('saved-a')
    );
  });

  it('keeps recent destinations unique and newest first', () => {
    expect(rememberWorkspaceDestination(['b', 'a', 'c'], 'a')).toEqual(['a', 'b', 'c']);
    expect(rememberWorkspaceDestination(['b', 'c'], 'a', 2)).toEqual(['a', 'b']);
  });
});
