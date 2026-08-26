import { describe, expect, it } from 'vitest';
import type { Item, Workspace } from '../../lib/db';
import { GLOBAL_TAB_STATE_DEFAULT, GLOBAL_WORKSPACE_KEY, type GlobalTabState } from './GlobalTabSystem';
import {
  activateProjectWorkspace,
  activateSavedProjectWorkspace,
  activateWorkspace,
  addBrowserSnapshotToProjectWorkspace,
  addItemsToProjectWorkspace,
  addEntryToProjectWorkspace,
  addItemToWorkspaceTarget,
  createProjectWorkspaceFromBrowserSnapshot,
  createProjectWorkspace,
  deleteSavedProjectWorkspace,
  getActiveWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionResumeTabId,
  getProjectSessionWorkspaceKey,
  getProjectWorkspaceTabs,
  getPreferredWorkspaceKey,
  getWorkspaceProjectId,
  loadWorkspaceIntoProjectSession,
  mergeSavedProjectWorkspace,
  removeEntryFromProjectWorkspace,
  renameSavedProjectWorkspace,
  transferProjectWorkspaceEntry,
  transferItemBetweenWorkspaceTargets,
  reorderItemInWorkspaceTarget,
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

const browserSnapshot: Workspace = {
  id: 'snapshot-1',
  name: 'Research browser snapshot',
  projectId: 'project-a',
  created_at: 1,
  updated_at: 1,
  windows: [{
    id: 'window-1',
    tabs: [
      { url: 'https://example.com/docs', title: 'Saved docs' },
      { url: 'https://outside.example/page', title: 'External page' },
      { url: 'https://example.com/docs?utm_source=test', title: 'Duplicate docs' },
    ],
  }],
};

describe('workspace sessions', () => {
  it('uses one global identity and one deterministic General identity per project', () => {
    expect(getProjectSessionWorkspaceKey('all')).toBe(GLOBAL_WORKSPACE_KEY);
    expect(getProjectSessionWorkspaceKey('project-a')).toBe('workspace:project:project-a:general');
    expect(getProjectSessionWorkspaceKey('project-b')).toBe('workspace:project:project-b:general');
  });

  it('resolves Global, General, and named workspace ownership', () => {
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      savedWorkspaceSessions: [
        { id: 'writing', name: 'Writing', projectId: 'project-a', createdAt: 1, updatedAt: 1 },
      ],
    };
    expect(getWorkspaceProjectId(state, GLOBAL_WORKSPACE_KEY)).toBe('all');
    expect(getWorkspaceProjectId(state, getProjectSessionWorkspaceKey('project-a'))).toBe('project-a');
    expect(getWorkspaceProjectId(state, getHomebaseWorkspaceSessionKey('writing'))).toBe('project-a');
  });

  it('switches one application-level active workspace and preserves the one being left', () => {
    const globalEntry = { kind: 'search' as const, id: 'global-search', query: 'global' };
    const projectEntry = { kind: 'item' as const, id: 'project-item', itemId: 'one', scopeProjectId: 'project-a' };
    const projectKey = getProjectSessionWorkspaceKey('project-a');
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      tabs: [globalEntry],
      activeWorkspaceKey: GLOBAL_WORKSPACE_KEY,
      workspaceSessionSnapshots: { [projectKey]: [projectEntry] },
    };

    const activated = activateWorkspace({ state, workspaceKey: projectKey, projectId: 'project-a' });
    expect(getActiveWorkspaceKey(activated)).toBe(projectKey);
    expect(activated.tabs).toEqual([projectEntry]);
    expect(activated.workspaceSessionSnapshots?.[GLOBAL_WORKSPACE_KEY]).toEqual([globalEntry]);
  });

  it('defaults each project context to its General workspace and remembers explicit choices independently', () => {
    const projectAKey = getProjectSessionWorkspaceKey('project-a');
    const projectBKey = getProjectSessionWorkspaceKey('project-b');
    const namedAKey = getHomebaseWorkspaceSessionKey('named-a');
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      savedWorkspaceSessions: [{ id: 'named-a', name: 'Reading', projectId: 'project-a', createdAt: 1, updatedAt: 1 }],
    };

    expect(getPreferredWorkspaceKey(state, 'project-a')).toBe(projectAKey);
    expect(getPreferredWorkspaceKey(state, 'project-b')).toBe(projectBKey);
    expect(getPreferredWorkspaceKey(state, 'all')).toBe(GLOBAL_WORKSPACE_KEY);

    const choseNamedA = activateWorkspace({
      state,
      workspaceKey: namedAKey,
      projectId: 'project-a',
      preferenceProjectId: 'project-a',
    });
    const choseGlobalInB = activateWorkspace({
      state: choseNamedA,
      workspaceKey: GLOBAL_WORKSPACE_KEY,
      projectId: 'all',
      preferenceProjectId: 'project-b',
    });

    expect(getPreferredWorkspaceKey(choseGlobalInB, 'project-a')).toBe(namedAKey);
    expect(getPreferredWorkspaceKey(choseGlobalInB, 'project-b')).toBe(GLOBAL_WORKSPACE_KEY);
    expect(getPreferredWorkspaceKey(choseGlobalInB, 'all')).toBe(GLOBAL_WORKSPACE_KEY);
  });

  it('remembers the selected entry per workspace', () => {
    const projectKey = getProjectSessionWorkspaceKey('project-a');
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      activeWorkspaceKey: projectKey,
      tabs: [
        { kind: 'item', id: 'first', itemId: 'one', scopeProjectId: 'project-a' },
        { kind: 'item', id: 'last', itemId: 'two', scopeProjectId: 'project-a' },
      ],
      lastActiveEntryByWorkspace: { [projectKey]: 'first' },
    };
    expect(getProjectSessionResumeTabId(state, 'project-a')).toBe('first');
    expect(getProjectSessionResumeTabId({ ...state, lastActiveEntryByWorkspace: {} }, 'project-a')).toBe('last');
  });

  it('adds the same item independently to Global and project General without switching', () => {
    const projectKey = getProjectSessionWorkspaceKey('project-a');
    const globalAdded = addItemToWorkspaceTarget({
      state: GLOBAL_TAB_STATE_DEFAULT,
      projectId: 'all',
      targetWorkspaceKey: GLOBAL_WORKSPACE_KEY,
      item: item('one', 'https://example.com/one'),
      items: [],
    });
    const both = addItemToWorkspaceTarget({
      state: globalAdded,
      projectId: 'project-a',
      targetWorkspaceKey: projectKey,
      item: item('one', 'https://example.com/one'),
      items: [],
    });

    expect(both.tabs).toEqual([expect.objectContaining({ kind: 'item', itemId: 'one', scopeProjectId: undefined })]);
    expect(getProjectWorkspaceTabs(both, 'project-a', projectKey)).toEqual([
      expect.objectContaining({ kind: 'item', itemId: 'one', scopeProjectId: 'project-a' }),
    ]);
    expect(getActiveWorkspaceKey(both)).toBe(GLOBAL_WORKSPACE_KEY);
  });

  it('deduplicates entries within a workspace', () => {
    const projectKey = getProjectSessionWorkspaceKey('project-a');
    const entry = { kind: 'item' as const, id: 'one', itemId: 'one', scopeProjectId: 'project-a' };
    const once = addEntryToProjectWorkspace({ state: GLOBAL_TAB_STATE_DEFAULT, projectId: 'project-a', targetWorkspaceKey: projectKey, entry });
    const twice = addEntryToProjectWorkspace({ state: once, projectId: 'project-a', targetWorkspaceKey: projectKey, entry });
    expect(getProjectWorkspaceTabs(twice, 'project-a', projectKey)).toHaveLength(1);
  });

  it('copies and moves references without changing the underlying item', () => {
    const generalKey = getProjectSessionWorkspaceKey('project-a');
    const namedKey = getHomebaseWorkspaceSessionKey('named-a');
    const entry = { kind: 'item' as const, id: 'one', itemId: 'one', scopeProjectId: 'project-a' };
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      activeWorkspaceKey: generalKey,
      tabs: [entry],
      workspaceSessionSnapshots: { [namedKey]: [] },
    };

    const copied = transferProjectWorkspaceEntry({ state, projectId: 'project-a', sourceWorkspaceKey: generalKey, targetWorkspaceKey: namedKey, entry, mode: 'copy' });
    expect(copied.tabs).toEqual([entry]);
    expect(copied.workspaceSessionSnapshots?.[namedKey]).toEqual([entry]);

    const moved = transferProjectWorkspaceEntry({ state: copied, projectId: 'project-a', sourceWorkspaceKey: generalKey, targetWorkspaceKey: namedKey, entry, mode: 'move' });
    expect(moved.tabs).toEqual([]);
    expect(moved.workspaceSessionSnapshots?.[namedKey]).toEqual([entry]);
  });

  it('removes only the requested workspace entry and clears its selection state', () => {
    const generalKey = getProjectSessionWorkspaceKey('project-a');
    const namedKey = getHomebaseWorkspaceSessionKey('named-a');
    const activeEntry = { kind: 'item' as const, id: 'active-entry', itemId: 'one', scopeProjectId: 'project-a' };
    const savedEntry = { kind: 'item' as const, id: 'saved-entry', itemId: 'two', scopeProjectId: 'project-a' };
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      activeWorkspaceKey: generalKey,
      activeTabId: activeEntry.id,
      tabs: [activeEntry],
      workspaceSessionSnapshots: { [namedKey]: [savedEntry] },
      lastActiveEntryByWorkspace: {
        [generalKey]: activeEntry.id,
        [namedKey]: savedEntry.id,
      },
    };

    const withoutSaved = removeEntryFromProjectWorkspace({
      state,
      projectId: 'project-a',
      workspaceKey: namedKey,
      entryId: savedEntry.id,
    });
    expect(withoutSaved.tabs).toEqual([activeEntry]);
    expect(withoutSaved.workspaceSessionSnapshots?.[namedKey]).toEqual([]);
    expect(withoutSaved.activeTabId).toBe(activeEntry.id);
    expect(withoutSaved.lastActiveEntryByWorkspace).toEqual({ [generalKey]: activeEntry.id });

    const withoutActive = removeEntryFromProjectWorkspace({
      state: withoutSaved,
      projectId: 'project-a',
      workspaceKey: generalKey,
      entryId: activeEntry.id,
    });
    expect(withoutActive.tabs).toEqual([]);
    expect(withoutActive.activeTabId).toBeNull();
    expect(withoutActive.lastActiveEntryByWorkspace).toEqual({});
  });

  it('creates an empty named workspace by default and only copies entries when requested', () => {
    const entry = { kind: 'search' as const, id: 'search', query: 'research', scopeProjectId: 'project-a' };
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      activeWorkspaceKey: getProjectSessionWorkspaceKey('project-a'),
      tabs: [entry],
    };
    const empty = createProjectWorkspace({ state, projectId: 'project-a', name: 'Empty', sessionId: 'empty', now: 42 });
    expect(empty.activeWorkspaceKey).toBe(getHomebaseWorkspaceSessionKey('empty'));
    expect(empty.tabs).toEqual([]);
    expect(empty.workspaceSessionSnapshots?.[getProjectSessionWorkspaceKey('project-a')]).toEqual([entry]);

    const copied = createProjectWorkspace({ state, projectId: 'project-a', name: 'Copied', copyCurrent: true, sessionId: 'copied', now: 43 });
    expect(copied.tabs).toEqual([entry]);
  });

  it('renames a named workspace without changing its identity or entries', () => {
    const namedKey = getHomebaseWorkspaceSessionKey('named-a');
    const entry = { kind: 'item' as const, id: 'one', itemId: 'one', scopeProjectId: 'project-a' };
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      savedWorkspaceSessions: [{ id: 'named-a', name: 'Old', projectId: 'project-a', createdAt: 1, updatedAt: 1 }],
      workspaceSessionSnapshots: { [namedKey]: [entry] },
    };
    const renamed = renameSavedProjectWorkspace({ state, sessionId: 'named-a', name: 'New', now: 5 });
    expect(renamed.savedWorkspaceSessions).toContainEqual({ id: 'named-a', name: 'New', projectId: 'project-a', createdAt: 1, updatedAt: 5 });
    expect(renamed.workspaceSessionSnapshots?.[namedKey]).toEqual([entry]);
  });

  it('merges a named workspace into another project workspace without duplicate entries', () => {
    const generalKey = getProjectSessionWorkspaceKey('project-a');
    const sourceKey = getHomebaseWorkspaceSessionKey('source');
    const shared = { kind: 'item' as const, id: 'shared-source-id', itemId: 'shared', scopeProjectId: 'project-a' };
    const sourceOnly = { kind: 'item' as const, id: 'source-only', itemId: 'source-only', scopeProjectId: 'project-a' };
    const targetShared = { ...shared, id: 'shared-target-id' };
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      activeWorkspaceKey: sourceKey,
      tabs: [shared, sourceOnly],
      workspaceSessionSnapshots: { [generalKey]: [targetShared] },
      savedWorkspaceSessions: [{ id: 'source', name: 'Source', projectId: 'project-a', createdAt: 1, updatedAt: 1 }],
    };
    const merged = mergeSavedProjectWorkspace({ state, sourceSessionId: 'source', targetWorkspaceKey: generalKey });
    expect(merged.activeWorkspaceKey).toBe(generalKey);
    expect(merged.tabs).toEqual([targetShared, sourceOnly]);
    expect(merged.savedWorkspaceSessions).toEqual([]);
    expect(merged.workspaceSessionSnapshots?.[sourceKey]).toBeUndefined();
  });

  it('refuses to merge a named workspace across projects', () => {
    const sourceKey = getHomebaseWorkspaceSessionKey('source');
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      activeWorkspaceKey: sourceKey,
      tabs: [{ kind: 'item', id: 'one', itemId: 'one', scopeProjectId: 'project-a' }],
      savedWorkspaceSessions: [{ id: 'source', name: 'Source', projectId: 'project-a', createdAt: 1, updatedAt: 1 }],
    };
    expect(mergeSavedProjectWorkspace({ state, sourceSessionId: 'source', targetWorkspaceKey: getProjectSessionWorkspaceKey('project-b') })).toBe(state);
  });

  it('deleting the active named workspace returns to that project General workspace', () => {
    const generalKey = getProjectSessionWorkspaceKey('project-a');
    const generalEntry = { kind: 'item' as const, id: 'general', itemId: 'general', scopeProjectId: 'project-a' };
    const namedKey = getHomebaseWorkspaceSessionKey('named-a');
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      activeWorkspaceKey: namedKey,
      tabs: [{ kind: 'item', id: 'named', itemId: 'named', scopeProjectId: 'project-a' }],
      workspaceSessionSnapshots: { [generalKey]: [generalEntry] },
      savedWorkspaceSessions: [{ id: 'named-a', name: 'Named', projectId: 'project-a', createdAt: 1, updatedAt: 1 }],
    };
    const deleted = deleteSavedProjectWorkspace({ state, sessionId: 'named-a' });
    expect(deleted.activeWorkspaceKey).toBe(generalKey);
    expect(deleted.tabs).toEqual([generalEntry]);
    expect(deleted.savedWorkspaceSessions).toEqual([]);
  });

  it('converts browser snapshot URLs to item/direct-URL entries with deduplication', () => {
    const result = loadWorkspaceIntoProjectSession({
      workspace: browserSnapshot,
      existingTabs: [],
      items: [item('docs', 'https://example.com/docs')],
      projectId: 'project-a',
    });
    expect(result.tabs).toEqual([
      expect.objectContaining({ kind: 'item', itemId: 'docs' }),
      expect.objectContaining({ kind: 'url', url: 'https://outside.example/page' }),
    ]);
  });

  it('adds a browser snapshot to a chosen workspace without making the snapshot a workspace destination', () => {
    const targetKey = getProjectSessionWorkspaceKey('project-a');
    const next = addBrowserSnapshotToProjectWorkspace({
      state: GLOBAL_TAB_STATE_DEFAULT,
      workspace: browserSnapshot,
      items: [item('docs', 'https://example.com/docs')],
      projectId: 'project-a',
      targetWorkspaceKey: targetKey,
    });
    expect(getProjectWorkspaceTabs(next, 'project-a', targetKey)).toHaveLength(2);
    expect(getActiveWorkspaceKey(next)).toBe(GLOBAL_WORKSPACE_KEY);
  });

  it('adds only canonical item references when snapshot URLs have been saved first', () => {
    const targetKey = getProjectSessionWorkspaceKey('project-a');
    const next = addItemsToProjectWorkspace({
      state: GLOBAL_TAB_STATE_DEFAULT,
      projectId: 'project-a',
      targetWorkspaceKey: targetKey,
      itemIds: ['docs', 'outside', 'docs'],
    });

    expect(getProjectWorkspaceTabs(next, 'project-a', targetKey)).toEqual([
      expect.objectContaining({ kind: 'item', itemId: 'docs' }),
      expect.objectContaining({ kind: 'item', itemId: 'outside' }),
    ]);
  });

  it('can create a named Homebase workspace from a browser snapshot', () => {
    const next = createProjectWorkspaceFromBrowserSnapshot({
      state: GLOBAL_TAB_STATE_DEFAULT,
      workspace: browserSnapshot,
      items: [item('docs', 'https://example.com/docs')],
      projectId: 'project-a',
      name: 'Captured research',
      sessionId: 'captured',
      now: 10,
    });
    expect(next.activeWorkspaceKey).toBe(getHomebaseWorkspaceSessionKey('captured'));
    expect(next.tabs).toHaveLength(2);
  });

  it('checks membership in inactive workspaces', () => {
    const targetKey = getProjectSessionWorkspaceKey('project-a');
    const next = addItemToWorkspaceTarget({
      state: GLOBAL_TAB_STATE_DEFAULT,
      projectId: 'project-a',
      targetWorkspaceKey: targetKey,
      item: item('one', 'https://example.com/one'),
      items: [],
    });
    expect(workspaceTargetContainsItem({ state: next, projectId: 'project-a', targetWorkspaceKey: targetKey, itemId: 'one', items: [] })).toBe(true);
  });

  it('copies and moves items between workspace types, including Global', () => {
    const savedItem = item('one', 'https://example.com/one');
    const projectKey = getProjectSessionWorkspaceKey('project-a');
    const source = addItemToWorkspaceTarget({
      state: GLOBAL_TAB_STATE_DEFAULT,
      projectId: 'all',
      targetWorkspaceKey: GLOBAL_WORKSPACE_KEY,
      item: savedItem,
      items: [savedItem],
    });
    const copied = transferItemBetweenWorkspaceTargets({
      state: source,
      item: savedItem,
      items: [savedItem],
      sourceProjectId: 'all',
      sourceWorkspaceKey: GLOBAL_WORKSPACE_KEY,
      targetProjectId: 'project-a',
      targetWorkspaceKey: projectKey,
      mode: 'copy',
    });
    expect(workspaceTargetContainsItem({ state: copied, projectId: 'all', targetWorkspaceKey: GLOBAL_WORKSPACE_KEY, itemId: savedItem.id, items: [savedItem] })).toBe(true);
    expect(workspaceTargetContainsItem({ state: copied, projectId: 'project-a', targetWorkspaceKey: projectKey, itemId: savedItem.id, items: [savedItem] })).toBe(true);

    const moved = transferItemBetweenWorkspaceTargets({
      state: copied,
      item: savedItem,
      items: [savedItem],
      sourceProjectId: 'all',
      sourceWorkspaceKey: GLOBAL_WORKSPACE_KEY,
      targetProjectId: 'project-a',
      targetWorkspaceKey: projectKey,
      mode: 'move',
    });
    expect(workspaceTargetContainsItem({ state: moved, projectId: 'all', targetWorkspaceKey: GLOBAL_WORKSPACE_KEY, itemId: savedItem.id, items: [savedItem] })).toBe(false);
    expect(workspaceTargetContainsItem({ state: moved, projectId: 'project-a', targetWorkspaceKey: projectKey, itemId: savedItem.id, items: [savedItem] })).toBe(true);
  });

  it('reorders saved items inside one workspace without moving other entry types', () => {
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      tabs: [
        { kind: 'item', id: 'one', itemId: 'one' },
        { kind: 'search', id: 'search', query: 'topic', mode: 'hybrid' },
        { kind: 'item', id: 'two', itemId: 'two' },
      ],
    };
    const reordered = reorderItemInWorkspaceTarget({
      state,
      projectId: 'all',
      workspaceKey: GLOBAL_WORKSPACE_KEY,
      itemId: 'two',
      beforeItemId: 'one',
    });
    expect(reordered.tabs.map((entry) => entry.id)).toEqual(['two', 'one', 'search']);
  });

  it('moves a saved item after the final workspace entry', () => {
    const state: GlobalTabState = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      tabs: [
        { kind: 'item', id: 'one', itemId: 'one' },
        { kind: 'search', id: 'search', query: 'topic', mode: 'hybrid' },
        { kind: 'item', id: 'two', itemId: 'two' },
      ],
    };
    const reordered = reorderItemInWorkspaceTarget({
      state,
      projectId: 'all',
      workspaceKey: GLOBAL_WORKSPACE_KEY,
      itemId: 'one',
      beforeItemId: null,
    });
    expect(reordered.tabs.map((entry) => entry.id)).toEqual(['search', 'two', 'one']);
  });

  it('activates project General and named workspaces only through explicit calls', () => {
    const projectKey = getProjectSessionWorkspaceKey('project-a');
    const state: GlobalTabState = { ...GLOBAL_TAB_STATE_DEFAULT, workspaceSessionSnapshots: { [projectKey]: [] } };
    const project = activateProjectWorkspace({ state, projectId: 'project-a', workspace: null, items: [] });
    expect(project.activeWorkspaceKey).toBe(projectKey);
    const session = { id: 'named', name: 'Named', projectId: 'project-a', createdAt: 1, updatedAt: 1 };
    const named = activateSavedProjectWorkspace({ state: { ...project, savedWorkspaceSessions: [session] }, session });
    expect(named.activeWorkspaceKey).toBe(getHomebaseWorkspaceSessionKey('named'));
  });
});
