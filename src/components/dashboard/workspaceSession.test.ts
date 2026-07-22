import { describe, expect, it } from 'vitest';
import type { Item, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import {
  activateProjectWorkspace,
  activateSavedProjectWorkspace,
  addItemToWorkspaceTarget,
  addEntryToProjectWorkspace,
  deleteSavedProjectWorkspace,
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionResumeTabId,
  getProjectSessionWorkspaceKey,
  getSavedWorkspaceSessionKey,
  getProjectSessionTabs,
  getVisibleWorkspaceTabs,
  addBrowserSnapshotToProjectWorkspace,
  createProjectWorkspaceFromBrowserSnapshot,
  loadWorkspaceIntoProjectSession,
  saveCurrentProjectWorkspace,
  transferProjectWorkspaceEntry,
  workspaceTargetContainsItem,
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

  it('saves a generic project working set and restores it after using the live session', () => {
    const state: GlobalTabState = {
      tabs: [
        { kind: 'item', id: 'note-tab', itemId: 'note-1', scopeProjectId: 'project-a' },
        { kind: 'search', id: 'search-tab', query: 'research', scopeProjectId: 'project-a' },
      ],
      activeTabId: null,
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
    };

    const saved = saveCurrentProjectWorkspace({
      state,
      projectId: 'project-a',
      name: 'Deep research',
      sessionId: 'session-1',
      now: 42,
    });
    const session = saved.savedWorkspaceSessions?.[0];

    expect(session).toMatchObject({ id: 'session-1', name: 'Deep research', projectId: 'project-a' });
    expect(getActiveProjectWorkspaceKey(saved, 'project-a')).toBe(
      getHomebaseWorkspaceSessionKey('session-1')
    );
    expect(saved.workspaceSessionSnapshots?.[getHomebaseWorkspaceSessionKey('session-1')]).toEqual(
      state.tabs
    );

    const live = activateProjectWorkspace({ state: saved, projectId: 'project-a', workspace: null, items: [] });
    expect(getProjectSessionTabs(live.tabs, 'project-a')).toEqual(state.tabs);

    const restored = activateSavedProjectWorkspace({ state: live, session: session! });
    expect(getProjectSessionTabs(restored.tabs, 'project-a')).toEqual(state.tabs);
  });

  it('deletes an active saved workspace and returns to the live project session', () => {
    const base: GlobalTabState = {
      tabs: [{ kind: 'item', id: 'live-tab', itemId: 'live', scopeProjectId: 'project-a' }],
      activeTabId: null,
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
    };
    const saved = saveCurrentProjectWorkspace({
      state: base,
      projectId: 'project-a',
      name: 'Temporary',
      sessionId: 'temporary',
    });
    const deleted = deleteSavedProjectWorkspace({ state: saved, sessionId: 'temporary' });

    expect(deleted.savedWorkspaceSessions).toEqual([]);
    expect(getActiveProjectWorkspaceKey(deleted, 'project-a')).toBe(
      getProjectSessionWorkspaceKey('project-a')
    );
    expect(getProjectSessionTabs(deleted.tabs, 'project-a')).toEqual(base.tabs);
    expect(deleted.workspaceSessionSnapshots?.[getHomebaseWorkspaceSessionKey('temporary')]).toBeUndefined();
  });

  it('copies an item into another workspace without removing it from the current one', () => {
    const liveKey = getProjectSessionWorkspaceKey('project-a');
    const savedKey = getHomebaseWorkspaceSessionKey('saved-a');
    const entry = { kind: 'item' as const, id: 'item-one', itemId: 'one', scopeProjectId: 'project-a' };
    const state: GlobalTabState = {
      tabs: [entry],
      activeTabId: null,
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
      activeWorkspaceKeyByProject: { 'project-a': liveKey },
      workspaceSessionSnapshots: { [savedKey]: [] },
      savedWorkspaceSessions: [
        { id: 'saved-a', name: 'Saved A', projectId: 'project-a', createdAt: 1, updatedAt: 1 },
      ],
    };

    const copied = transferProjectWorkspaceEntry({
      state,
      projectId: 'project-a',
      sourceWorkspaceKey: liveKey,
      targetWorkspaceKey: savedKey,
      entry,
      mode: 'copy',
    });

    expect(getProjectSessionTabs(copied.tabs, 'project-a')).toEqual([entry]);
    expect(copied.workspaceSessionSnapshots?.[savedKey]).toEqual([entry]);
    const copiedAgain = addEntryToProjectWorkspace({
      state: copied,
      projectId: 'project-a',
      targetWorkspaceKey: savedKey,
      entry,
    });
    expect(copiedAgain.workspaceSessionSnapshots?.[savedKey]).toHaveLength(1);
  });

  it('adds an item to an inactive browser working copy without losing its captured tabs', () => {
    const targetKey = getSavedWorkspaceSessionKey(workspace.id);
    const state: GlobalTabState = {
      tabs: [{ kind: 'item', id: 'other', itemId: 'other', scopeProjectId: 'project-b' }],
      activeTabId: null,
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
    };
    const addedItem = item('new-note', '');
    const next = addItemToWorkspaceTarget({
      state,
      projectId: 'project-a',
      targetWorkspaceKey: targetKey,
      item: addedItem,
      browserWorkspace: workspace,
      items: [item('docs', 'https://example.com/docs'), addedItem],
    });
    const targetTabs = next.workspaceSessionSnapshots?.[targetKey] ?? [];

    expect(targetTabs.some((tab) => tab.kind === 'item' && tab.itemId === 'docs')).toBe(true);
    expect(targetTabs.some((tab) => tab.kind === 'url' && tab.url === 'https://outside.example/page')).toBe(true);
    expect(targetTabs.some((tab) => tab.kind === 'item' && tab.itemId === addedItem.id)).toBe(true);
    expect(getActiveProjectWorkspaceKey(next, 'project-a')).toBe(getProjectSessionWorkspaceKey('project-a'));
    expect(workspaceTargetContainsItem({
      state: next,
      projectId: 'project-a',
      targetWorkspaceKey: targetKey,
      itemId: addedItem.id,
      browserWorkspace: workspace,
      items: [addedItem],
    })).toBe(true);
  });

  it('moves an entry to a workspace that already contains it', () => {
    const liveKey = getProjectSessionWorkspaceKey('project-a');
    const savedKey = getHomebaseWorkspaceSessionKey('saved-a');
    const entry = { kind: 'item' as const, id: 'item-one', itemId: 'one', scopeProjectId: 'project-a' };
    const state: GlobalTabState = {
      tabs: [entry],
      activeTabId: null,
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
      activeWorkspaceKeyByProject: { 'project-a': liveKey },
      workspaceSessionSnapshots: { [savedKey]: [entry] },
    };

    const moved = transferProjectWorkspaceEntry({
      state,
      projectId: 'project-a',
      sourceWorkspaceKey: liveKey,
      targetWorkspaceKey: savedKey,
      entry,
      mode: 'move',
    });

    expect(getProjectSessionTabs(moved.tabs, 'project-a')).toEqual([]);
    expect(moved.workspaceSessionSnapshots?.[savedKey]).toEqual([entry]);
  });

  it('adds a browser snapshot to a chosen inactive project workspace', () => {
    const targetKey = getHomebaseWorkspaceSessionKey('saved-a');
    const state: GlobalTabState = {
      tabs: [],
      activeTabId: null,
      bottomLayout: 'tabs',
      isSidebarCollapsed: false,
      workspaceSessionSnapshots: { [targetKey]: [] },
    };
    const next = addBrowserSnapshotToProjectWorkspace({
      state,
      workspace,
      items: [item('docs', 'https://example.com/docs')],
      projectId: 'project-a',
      targetWorkspaceKey: targetKey,
    });

    expect(next.workspaceSessionSnapshots?.[targetKey]).toEqual([
      expect.objectContaining({ kind: 'item', itemId: 'docs' }),
      expect.objectContaining({ kind: 'url', url: 'https://outside.example/page' }),
    ]);
    expect(next.tabs).toEqual([]);
  });

  it('creates and activates a named project workspace from a browser snapshot', () => {
    const next = createProjectWorkspaceFromBrowserSnapshot({
      state: {
        tabs: [],
        activeTabId: null,
        bottomLayout: 'tabs',
        isSidebarCollapsed: false,
      },
      workspace,
      items: [item('docs', 'https://example.com/docs')],
      projectId: 'project-a',
      name: 'Captured window',
      sessionId: 'captured-a',
      now: 10,
    });

    expect(next.savedWorkspaceSessions).toContainEqual({
      id: 'captured-a',
      name: 'Captured window',
      projectId: 'project-a',
      createdAt: 10,
      updatedAt: 10,
    });
    expect(getActiveProjectWorkspaceKey(next, 'project-a')).toBe(
      getHomebaseWorkspaceSessionKey('captured-a')
    );
    expect(getProjectSessionTabs(next.tabs, 'project-a')).toHaveLength(2);
  });
});
