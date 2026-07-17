import { describe, expect, it } from 'vitest';
import type { Item, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import {
  activateProjectWorkspace,
  getActiveProjectWorkspaceKey,
  getProjectSessionResumeTabId,
  getProjectSessionWorkspaceKey,
  getSavedWorkspaceSessionKey,
  getProjectSessionTabs,
  getVisibleWorkspaceTabs,
  loadWorkspaceIntoProjectSession,
} from './workspaceSession';

const item = (id: string, url: string): Item => ({
  id,
  title: id,
  url,
  collectionIds: [],
  tags: [],
  created_at: 1,
  updated_at: 1,
});

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Research',
  projectId: 'project-a',
  created_at: 1,
  updated_at: 1,
  windows: [
    {
      id: 'window-1',
      tabs: [
        { url: 'https://example.com/docs', title: 'Saved docs' },
        { url: 'https://outside.example/page', title: 'External page' },
        { url: 'https://example.com/docs?utm_source=test', title: 'Duplicate docs' },
      ],
    },
  ],
};

describe('project workspace sessions', () => {
  it('keeps project sessions separate', () => {
    const tabs = [
      { kind: 'item' as const, id: 'a', itemId: 'one', scopeProjectId: 'project-a' },
      { kind: 'item' as const, id: 'b', itemId: 'two', scopeProjectId: 'project-b' },
      { kind: 'search' as const, id: 'global', query: '' },
    ];

    expect(getProjectSessionTabs(tabs, 'project-a').map((tab) => tab.id)).toEqual(['a']);
    expect(getProjectSessionTabs(tabs, 'all').map((tab) => tab.id)).toEqual(['global']);
    expect(getVisibleWorkspaceTabs(tabs, 'project-a').map((tab) => tab.id)).toEqual(['a']);
    expect(getVisibleWorkspaceTabs(tabs, 'project-a', true).map((tab) => tab.id)).toEqual(['a', 'global']);
  });

  it('resumes the remembered project tab and falls back safely', () => {
    const state: GlobalTabState = {
      tabs: [
        { kind: 'item', id: 'first', itemId: 'one', scopeProjectId: 'project-a' },
        { kind: 'item', id: 'last', itemId: 'two', scopeProjectId: 'project-a' },
      ],
      activeTabId: null,
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
      lastActiveTabByProject: { 'project-a': 'first' },
    };

    expect(getProjectSessionResumeTabId(state, 'project-a')).toBe('first');
    expect(getProjectSessionResumeTabId({ ...state, lastActiveTabByProject: {} }, 'project-a')).toBe('last');
  });

  it('loads a workspace additively, maps saved URLs to items, and skips duplicates', () => {
    const result = loadWorkspaceIntoProjectSession({
      workspace,
      existingTabs: [
        { kind: 'item', id: 'other-project', itemId: 'docs', scopeProjectId: 'project-b' },
      ],
      items: [item('docs', 'https://example.com/docs')],
      projectId: 'project-a',
    });

    const projectTabs = getProjectSessionTabs(result.tabs, 'project-a');
    expect(projectTabs).toHaveLength(2);
    expect(projectTabs[0]).toMatchObject({ kind: 'item', itemId: 'docs' });
    expect(projectTabs[1]).toMatchObject({ kind: 'url', url: 'https://outside.example/page' });
    expect(result.addedTabIds).toHaveLength(2);
  });

  it('does not add a URL already open in the same project session', () => {
    const result = loadWorkspaceIntoProjectSession({
      workspace,
      existingTabs: [
        { kind: 'item', id: 'already-open', itemId: 'docs', scopeProjectId: 'project-a' },
      ],
      items: [item('docs', 'https://example.com/docs')],
      projectId: 'project-a',
    });

    expect(result.addedTabIds).toHaveLength(1);
    expect(result.activeTabId).toBe('already-open');
  });

  it('activates a saved workspace without entering focus and preserves the workspace being left', () => {
    const state: GlobalTabState = {
      tabs: [
        { kind: 'item', id: 'project-tab', itemId: 'draft', scopeProjectId: 'project-a' },
        { kind: 'search', id: 'global-tab', query: '' },
      ],
      activeTabId: 'project-tab',
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
    };

    const activated = activateProjectWorkspace({
      state,
      projectId: 'project-a',
      workspace,
      items: [item('docs', 'https://example.com/docs')],
    });

    expect(activated.activeTabId).toBeNull();
    expect(getActiveProjectWorkspaceKey(activated, 'project-a')).toBe(getSavedWorkspaceSessionKey(workspace.id));
    expect(activated.workspaceSessionSnapshots?.[getProjectSessionWorkspaceKey('project-a')]).toEqual([
      state.tabs[0],
    ]);
    expect(getProjectSessionTabs(activated.tabs, 'project-a')).toHaveLength(2);
    expect(getProjectSessionTabs(activated.tabs, 'all').map((tab) => tab.id)).toEqual(['global-tab']);
  });

  it('restores the automatically saved live version when switching back to a workspace', () => {
    const savedKey = getSavedWorkspaceSessionKey(workspace.id);
    const projectKey = getProjectSessionWorkspaceKey('project-a');
    const liveSavedTab = { kind: 'url' as const, id: 'live-saved', url: 'https://live.example', scopeProjectId: 'project-a' };
    const state: GlobalTabState = {
      tabs: [{ kind: 'item', id: 'project-tab', itemId: 'draft', scopeProjectId: 'project-a' }],
      activeTabId: null,
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
      activeWorkspaceKeyByProject: { 'project-a': projectKey },
      workspaceSessionSnapshots: { [savedKey]: [liveSavedTab] },
    };

    const activated = activateProjectWorkspace({ state, projectId: 'project-a', workspace, items: [] });

    expect(getProjectSessionTabs(activated.tabs, 'project-a')).toEqual([liveSavedTab]);
    expect(activated.workspaceSessionSnapshots?.[projectKey]).toEqual(state.tabs);
  });
});
