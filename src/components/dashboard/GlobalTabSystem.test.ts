// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GlobalTabSystem,
  isGlobalTabVisible,
  loadGlobalTabState,
  type GlobalTab,
} from './GlobalTabSystem';

const STORAGE_KEY = 'workbench-workspace-state-v1';

describe('loadGlobalTabState Home workspace state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults the fixed Home workspace to Overview', () => {
    expect(loadGlobalTabState().homeSection).toBe('overview');
  });

  it('restores Search without requiring a working search tab', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [],
        activeTabId: null,
        bottomLayout: 'tabs',
        isSidebarCollapsed: false,
        homeSection: 'search',
        searchQuery: 'local-first AI',
      })
    );

    const state = loadGlobalTabState();
    expect(state.activeTabId).toBeNull();
    expect(state.homeSection).toBe('search');
    expect(state.searchQuery).toBe('local-first AI');
  });

  it('keeps Browse mode active when persisted workspaces contain tabs', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [{ kind: 'item', id: 'project-item', itemId: 'item-1', scopeProjectId: 'project-a' }],
        activeTabId: null,
        bottomLayout: 'tabs',
        isSidebarCollapsed: false,
      })
    );

    expect(loadGlobalTabState().activeTabId).toBeNull();
  });

  it('normalizes unknown Home sections back to Overview', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [],
        activeTabId: null,
        homeSection: 'unknown',
      })
    );

    expect(loadGlobalTabState().homeSection).toBe('overview');
  });

  it('restores a promoted search tab with its own query, filters, and mode', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [
          {
            kind: 'search',
            id: 'product-search',
            query: 'python',
            filters: { domain: 'docs.python.org' },
            mode: 'lexical-only',
          },
        ],
        activeTabId: 'product-search',
        homeSection: 'search',
        searchQuery: 'rust',
      })
    );

    const state = loadGlobalTabState();
    const searchTab = state.tabs.find((tab) => tab.kind === 'search');
    expect(state.searchQuery).toBe('rust');
    expect(searchTab).toMatchObject({
      kind: 'search',
      query: 'python',
      filters: { domain: 'docs.python.org' },
      mode: 'lexical-only',
    });
  });

  it('restores temporary project context separately from permanent search filters', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [
          {
            kind: 'search',
            id: 'search-python',
            query: 'python',
            filters: { projectId: 'project-a' },
            scopeProjectId: 'project-a',
            scopeCollectionId: 'collection-a',
            pinnedGlobally: true,
          },
        ],
        activeTabId: 'search-python',
        showAllTabs: true,
      })
    );

    const state = loadGlobalTabState();
    expect(state.showAllTabs).toBe(false);
    expect(state.tabs[0]).toMatchObject({
      scopeProjectId: 'project-a',
      scopeCollectionId: 'collection-a',
      pinnedGlobally: true,
      filters: { projectId: 'project-a' },
    });
  });

  it('drops obsolete per-project visibility preferences during migration', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [],
        activeTabId: null,
        includeGlobalWorkByProject: { 'project-a': true },
      })
    );

    expect('includeGlobalWorkByProject' in loadGlobalTabState()).toBe(false);
  });

  it('restores named Homebase workspaces independently of browser workspaces', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [],
        activeTabId: null,
        savedWorkspaceSessions: [
          { id: 'session-a', name: 'Writing', projectId: 'project-a', createdAt: 10, updatedAt: 20 },
        ],
      })
    );

    expect(loadGlobalTabState().savedWorkspaceSessions).toEqual([
      { id: 'session-a', name: 'Writing', projectId: 'project-a', createdAt: 10, updatedAt: 20 },
    ]);
  });

  it('does not copy an active named workspace into project General when reloading current state', () => {
    const namedKey = 'workspace:named:session-a';
    const generalKey = 'workspace:project:project-a:general';
    const entry = { kind: 'item', id: 'item-1@project:project-a', itemId: 'item-1', scopeProjectId: 'project-a' };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [entry],
        activeTabId: entry.id,
        activeWorkspaceKey: namedKey,
        workspaceSessionSnapshots: { [namedKey]: [entry], [generalKey]: [] },
        savedWorkspaceSessions: [
          { id: 'session-a', name: 'Writing', projectId: 'project-a', createdAt: 10, updatedAt: 20 },
        ],
      })
    );

    const state = loadGlobalTabState();
    expect(state.activeWorkspaceKey).toBe(namedKey);
    expect(state.tabs).toEqual([entry]);
    expect(state.workspaceSessionSnapshots?.[generalKey]).toEqual([]);
  });

  it('keeps multiple promoted searches as independent working tabs', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [
          { kind: 'search', id: 'search-python', query: 'python', filters: {}, mode: 'hybrid' },
          { kind: 'search', id: 'search-rust', query: 'rust', filters: {}, mode: 'hybrid' },
        ],
        activeTabId: 'search-python',
        homeSection: 'search',
        searchQuery: 'typescript',
      })
    );

    const state = loadGlobalTabState();
    expect(state.activeTabId).toBe('search-python');
    expect(state.tabs.filter((tab) => tab.kind === 'search')).toMatchObject([
      { id: 'search-python', query: 'python' },
      { id: 'search-rust', query: 'rust' },
    ]);
    expect(state.searchQuery).toBe('typescript');
  });

  it('bounds the shared tab workspace so tab bodies can own vertical scrolling', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlobalTabSystem, {
        items: [],
        collections: [],
        projects: [],
        tabState: {
          tabs: [{ kind: 'search', id: 'search-python', query: 'python' }],
          activeTabId: 'search-python',
          bottomLayout: 'tabs',
          isSidebarCollapsed: false,
        },
        onTabStateChange: vi.fn(),
      })
    );

    expect(markup).toMatch(/^<div class="ui-workspace-tabs" style="height:100%;width:100%;flex:1;/);
    expect(markup).toContain('min-height:0;min-width:0');
  });

  it('keeps active workspace entries visible independently of project navigation', () => {
    const tabs: GlobalTab[] = [
      { kind: 'search', id: 'global', query: 'global' },
      { kind: 'search', id: 'project-a-one', query: 'a one', scopeProjectId: 'project-a', scopeCollectionId: 'collection-a' },
      { kind: 'search', id: 'project-a-two', query: 'a two', scopeProjectId: 'project-a', scopeCollectionId: 'collection-b' },
      { kind: 'search', id: 'project-b', query: 'b', scopeProjectId: 'project-b' },
      { kind: 'search', id: 'project-b-pinned', query: 'b pinned', scopeProjectId: 'project-b', pinnedGlobally: true },
    ];

    expect(tabs.filter((tab) => isGlobalTabVisible(tab, 'project-a')).map((tab) => tab.id)).toEqual(tabs.map((tab) => tab.id));
    expect(tabs.every((tab) => isGlobalTabVisible(tab, 'project-a', true))).toBe(true);
  });

  it('renders Home navigation above the active workspace strip without project filtering', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlobalTabSystem, {
        items: [],
        collections: [],
        projects: [],
        scopeProjectId: 'project-a',
        workspaceHeader: React.createElement('div', null, 'Workspace navigation'),
        homeContent: React.createElement('div', null, 'Home overview'),
        tabState: {
          tabs: [
            { kind: 'search', id: 'project-a', query: 'visible search', scopeProjectId: 'project-a' },
            { kind: 'search', id: 'project-b', query: 'hidden search', scopeProjectId: 'project-b' },
          ],
          activeTabId: null,
          bottomLayout: 'tabs',
          isSidebarCollapsed: false,
          showAllTabs: false,
        },
        onTabStateChange: vi.fn(),
      })
    );

    expect(markup.indexOf('Workspace navigation')).toBeLessThan(markup.indexOf('Global workspace'));
    expect(markup).toContain('visible search');
    expect(markup).toContain('hidden search');
    expect(markup).not.toContain('tabs from other projects');
    expect(markup).toContain('All entries · 2');
    expect(markup).toContain('Show all 2 workspace entries');
  });

  it('exposes workspace entries as keyboard-focusable controls with explicit remove actions', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlobalTabSystem, {
        items: [],
        collections: [],
        projects: [],
        tabState: {
          tabs: [{ kind: 'search', id: 'search-python', query: 'python' }],
          activeTabId: 'search-python',
          bottomLayout: 'tabs',
          isSidebarCollapsed: false,
        },
        onTabStateChange: vi.fn(),
      })
    );

    expect(markup).toContain('role="group" aria-label="Active workspace entries"');
    expect(markup).toContain('role="button" tabindex="0" aria-pressed="true"');
    expect(markup).toContain('aria-label="Remove Search: python from Global workspace"');
  });

  it('does not hide active workspace entries in project Focus', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlobalTabSystem, {
        items: [],
        collections: [],
        projects: [],
        scopeProjectId: 'project-a',
        strictProjectScope: true,
        includeGlobalWork: true,
        tabState: {
          tabs: [
            { kind: 'search', id: 'global', query: 'global query' },
            { kind: 'search', id: 'project-a', query: 'project query', scopeProjectId: 'project-a' },
            { kind: 'search', id: 'project-b', query: 'other project query', scopeProjectId: 'project-b' },
          ],
          activeTabId: null,
          bottomLayout: 'tabs',
          isSidebarCollapsed: false,
        },
        onTabStateChange: vi.fn(),
      })
    );

    expect(markup).toContain('global query');
    expect(markup).toContain('project query');
    expect(markup).toContain('other project query');
  });
});
