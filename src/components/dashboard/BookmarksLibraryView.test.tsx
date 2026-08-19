import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item, Project } from '../../lib/db';
import { libraryPageUiKey } from '../../lib/shell/pageUiState';
import { GLOBAL_TAB_STATE_DEFAULT } from './GlobalTabSystem';
import {
  addBookmarkToWorkspace,
  BookmarksLibraryView,
  buildBookmarkWorkspaceDestinations,
} from './BookmarksLibraryView';

const project: Project = { id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 };
const item: Item = { id: 'item-a', title: 'Python', url: 'https://python.org', collectionIds: [], tags: [], source: 'bookmark', created_at: 1, updated_at: 1 };

describe('BookmarksLibraryView', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders links and notes in the combined library surface', () => {
    const markup = renderToStaticMarkup(
      <BookmarksLibraryView
        items={[item, { ...item, id: 'note-a', title: 'Note', url: '', source: 'manual' }]}
        collections={[]}
        projects={[project]}
        scopeProjectId="all"
        scopeCollectionId="all"
        homeState={GLOBAL_TAB_STATE_DEFAULT}
        onHomeStateChange={vi.fn()}
      />
    );

    expect(markup).toContain('Browse and maintain your saved links and notes.');
    expect(markup).toContain('Python');
    expect(markup).toContain('Note');
    expect(markup).toContain('Filter library');
    expect(markup).toContain('data-library-view-tabs="true"');
    expect(markup).toContain('aria-label="Library view"');
    expect(markup).toContain('All items');
    expect(markup.indexOf('Library view')).toBeLessThan(markup.indexOf('Filter library'));
    expect(markup).toContain('aria-label="Gallery view"');
    expect(markup).toContain('data-content-view="list"');
    expect(markup).toContain('ui-adaptive-browser');
    expect(markup).toContain('data-detail-open="false"');
    expect(markup).toContain('Select an item to inspect and edit it.');
  });

  it('does not promote a favorited item ahead of newer library rows', () => {
    const markup = renderToStaticMarkup(
      <BookmarksLibraryView
        items={[
          { ...item, id: 'older-favorite', title: 'Older favorite', updated_at: 10, favoriteAt: 50 },
          { ...item, id: 'newer-item', title: 'Newer item', updated_at: 20 },
        ]}
        collections={[]}
        projects={[project]}
        scopeProjectId="all"
        scopeCollectionId="all"
        homeState={GLOBAL_TAB_STATE_DEFAULT}
        onHomeStateChange={vi.fn()}
      />
    );

    expect(markup.indexOf('Newer item')).toBeLessThan(markup.indexOf('Older favorite'));
  });

  it('can open the combined library filtered to notes', () => {
    const markup = renderToStaticMarkup(
      <BookmarksLibraryView
        items={[item, { ...item, id: 'note-a', title: 'Note', url: '', notes: 'Draft text', source: 'manual' }]}
        collections={[]}
        projects={[project]}
        scopeProjectId="all"
        scopeCollectionId="all"
        homeState={GLOBAL_TAB_STATE_DEFAULT}
        onHomeStateChange={vi.fn()}
        initialTypeFilter="notes"
      />
    );

    expect(markup).toContain('Draft text');
    expect(markup).not.toContain('https://python.org');
    expect(markup).toContain('aria-selected="true"');
  });

  it('restores the selected item for the current library scope', () => {
    const saved = new Map<string, string>([
      [
        libraryPageUiKey('library', 'all', 'all'),
        JSON.stringify({
          query: '',
          typeFilter: 'all',
          selectedItemId: item.id,
          workspaceKey: 'global-session:all',
        }),
      ],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });

    const markup = renderToStaticMarkup(
      <BookmarksLibraryView
        items={[item]}
        collections={[]}
        projects={[project]}
        scopeProjectId="all"
        scopeCollectionId="all"
        homeState={GLOBAL_TAB_STATE_DEFAULT}
        onHomeStateChange={vi.fn()}
      />
    );

    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('Add to workspace…');
    expect(markup).toContain('data-detail-open="true"');
    expect(markup).toContain('ui-adaptive-detail-back');
    expect(markup).not.toContain('Select an item to inspect and edit it.');
  });

  it('offers Global, project General, and named workspace destinations', () => {
    const destinations = buildBookmarkWorkspaceDestinations([project], [{ id: 'saved-a', name: 'Writing', projectId: project.id, createdAt: 1, updatedAt: 2 }]);
    expect(destinations.map((destination) => destination.label)).toEqual([
      'All Library · Global workspace',
      'Research — General',
      'Research — Writing',
    ]);
  });

  it('adds the same bookmark independently to global and project workspaces', () => {
    const destinations = buildBookmarkWorkspaceDestinations([project], []);
    const global = addBookmarkToWorkspace(GLOBAL_TAB_STATE_DEFAULT, item, destinations[0]);
    const projectState = addBookmarkToWorkspace(global, item, destinations[1]);

    expect(projectState.tabs).toEqual([
      expect.objectContaining({ kind: 'item', itemId: item.id, id: 'item-item-a' }),
    ]);
    expect(projectState.workspaceSessionSnapshots?.['workspace:project:project-a:general']).toEqual([
      expect.objectContaining({ kind: 'item', itemId: item.id, id: 'item-item-a@project:project-a', scopeProjectId: project.id }),
    ]);
  });

  it('activates the chosen named workspace when viewing an item', () => {
    const session = { id: 'saved-a', name: 'Writing', projectId: project.id, createdAt: 1, updatedAt: 2 };
    const destination = buildBookmarkWorkspaceDestinations([project], [session])[2];
    const viewed = addBookmarkToWorkspace(GLOBAL_TAB_STATE_DEFAULT, item, destination, { view: true, items: [item] });

    expect(viewed.activeWorkspaceKey).toBe('workspace:named:saved-a');
    expect(viewed.activeTabId).toBe('item-item-a@project:project-a');
  });

  it('keeps the current entry open when only adding to another workspace', () => {
    const destinations = buildBookmarkWorkspaceDestinations([project], []);
    const state = {
      ...GLOBAL_TAB_STATE_DEFAULT,
      tabs: [{ kind: 'search' as const, id: 'current-search', query: 'current' }],
      activeTabId: 'current-search',
    };
    const added = addBookmarkToWorkspace(state, item, destinations[1]);

    expect(added.activeWorkspaceKey).toBe('workspace:global');
    expect(added.activeTabId).toBe('current-search');
  });

  it('opens an item in the Global workspace after adding it', () => {
    const destination = buildBookmarkWorkspaceDestinations([project], [])[0];
    const opened = addBookmarkToWorkspace(GLOBAL_TAB_STATE_DEFAULT, item, destination, { view: true, items: [item] });

    expect(opened.activeWorkspaceKey).toBe('workspace:global');
    expect(opened.activeTabId).toBe('item-item-a');
  });
});
