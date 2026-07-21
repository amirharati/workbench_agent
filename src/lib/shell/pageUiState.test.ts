import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  homePageUiKey,
  libraryPageUiKey,
  loadPageUiState,
  projectPageUiKey,
  savePageUiState,
} from './pageUiState';

describe('page UI state', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores saved selection state over current defaults', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const key = projectPageUiKey('project-1', 'collection-1');

    savePageUiState(key, { selectedItemId: 'item-7', browseSource: 'collection' });

    expect(loadPageUiState(key, { selectedItemId: null as string | null, browseSource: 'all' })).toEqual({
      selectedItemId: 'item-7',
      browseSource: 'collection',
    });
  });

  it('uses defaults when storage is unavailable or malformed', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{broken',
      setItem: () => undefined,
    });

    expect(loadPageUiState('broken', { selectedItemId: null })).toEqual({ selectedItemId: null });
  });

  it('keeps home and library state isolated by view and scope', () => {
    expect(homePageUiKey('all', 'all')).not.toBe(homePageUiKey('project-1', 'all'));
    expect(libraryPageUiKey('library', 'all', 'all')).not.toBe(
      libraryPageUiKey('notes', 'all', 'all')
    );
    expect(libraryPageUiKey('library', 'project-1', 'all')).not.toBe(
      libraryPageUiKey('library', 'project-2', 'all')
    );
  });

  it('does not rewrite unchanged state during page startup', () => {
    const state = JSON.stringify({ selectedItemId: 'item-1', browseSource: 'all' });
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: () => state,
      setItem,
    });

    savePageUiState('page', { selectedItemId: 'item-1', browseSource: 'all' });

    expect(setItem).not.toHaveBeenCalled();
  });
});
