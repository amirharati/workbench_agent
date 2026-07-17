// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalTabSystem, loadGlobalTabState } from './GlobalTabSystem';

const STORAGE_KEY = 'workbench-global-tabs';

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

    expect(markup).toMatch(/^<div style="height:100%;width:100%;flex:1;/);
    expect(markup).toContain('min-height:0;min-width:0');
  });
});
