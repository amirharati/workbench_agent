import { describe, expect, it } from 'vitest';
import type { Project, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import {
  getHomebaseWorkspaceSessionKey,
  getSavedWorkspaceSessionKey,
} from './workspaceSession';
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
  activeWorkspaceKeyByProject: {
    'project-a': getHomebaseWorkspaceSessionKey('saved-a'),
    'project-b': getSavedWorkspaceSessionKey(browserWorkspace.id),
  },
  savedWorkspaceSessions: [
    { id: 'saved-a', name: 'Reading plan', projectId: 'project-a', createdAt: 1, updatedAt: 3 },
  ],
};

describe('workspace destinations', () => {
  it('addresses global, live, named, and browser workspaces by full project path', () => {
    const destinations = buildWorkspaceDestinations({
      projects,
      browserWorkspaces: [browserWorkspace],
      state,
      contextProjectId: 'project-b',
    });

    expect(destinations.map((destination) => destination.path)).toEqual([
      'Global / Workspace',
      'Research / Live session',
      'Research / Reading plan',
      'Writing / Live session',
      'Writing / Reference tabs · browser',
    ]);
    expect(destinations.find((destination) => destination.isCurrent)?.key).toBe(
      getSavedWorkspaceSessionKey(browserWorkspace.id)
    );
  });

  it('keeps recent destinations unique and newest first', () => {
    expect(rememberWorkspaceDestination(['b', 'a', 'c'], 'a')).toEqual(['a', 'b', 'c']);
    expect(rememberWorkspaceDestination(['b', 'c'], 'a', 2)).toEqual(['a', 'b']);
  });
});
