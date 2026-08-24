// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LeftSidebar } from './LeftSidebar';
import { RightPanel } from './RightPanel';
import { HomeTitleTabs } from './MainContent';
import { ScopeChipsBar } from '../ScopeChipsBar';
import { Resizer } from '../Resizer';
import {
  isFullMiddleDashboardView,
  isFullPageDashboardView,
  loadRestoredBrowseItemId,
  resolveBrowseContextSelectedItemId,
  resolveInspectorItemFromSources,
  resolveRememberedProjectCollection,
  resolveShellInspectorItemId,
} from './DashboardLayout';
import { SHELL_LAYOUT_DEFAULTS } from '../../../lib/shell/shellLayoutState';
import type { Item } from '../../../lib/db';

describe('dashboard shell polish contracts', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  it('renders the sidebar as semantic navigation with a clear active destination', () => {
    const markup = renderToStaticMarkup(
      <LeftSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        activeView="home"
        onSelectView={vi.fn()}
        projects={[]}
        collections={[]}
        items={[]}
        scopeProjectId="all"
        scopeCollectionId="all"
        onSelectProjectScope={vi.fn()}
        onSelectCollectionScope={vi.fn()}
      />
    );

    expect(markup).toContain('class="ui-sidebar"');
    expect(markup).toContain('aria-label="Primary navigation"');
    expect(markup).toContain('aria-label="Collapse navigation"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('Home');
    expect(markup).not.toContain('role="tab"');
    expect(markup).not.toContain('Overview');
  });

  it('keeps Overview, Search, and Categories beside the Home page title instead of in the sidebar', () => {
    const markup = renderToStaticMarkup(<HomeTitleTabs activeSection="search" onSelect={vi.fn()} />);
    expect(markup).toContain('class="ui-home-title-tabs"');
    expect(markup).toContain('aria-label="Home views"');
    expect(markup).toContain('Overview');
    expect(markup).toContain('role="tab" aria-selected="true"');
    expect(markup).toContain('Search');
    expect(markup).toContain('Categories');
  });

  it('exposes Inspector and Ask as one accessible tab set', () => {
    const markup = renderToStaticMarkup(
      <RightPanel
        activeItem={null}
        scopeProjectId="all"
        scopeCollectionId="all"
        isCollapsed={false}
        width={420}
        activeTab="inspector"
        onCollapsedChange={vi.fn()}
        onActiveTabChange={vi.fn()}
      />
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Inspector tools"');
    expect(markup).toContain('--right-panel-user-width:420px');
    expect(markup).toContain('class="right-panel__tab" data-active="true" role="tab" aria-selected="true"');
    expect(markup).toContain('aria-label="Collapse Inspector panel"');
  });

  it('starts the Inspector wider and persists it as shell layout state', () => {
    expect(SHELL_LAYOUT_DEFAULTS.rightPanelWidth).toBe(380);
  });

  it('exposes the Inspector divider to mouse and keyboard resizing', async () => {
    const onResize = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <Resizer
          direction="vertical"
          ariaLabel="Resize Inspector panel"
          onResize={onResize}
        />
      );
    });

    const divider = host.querySelector<HTMLElement>('[aria-label="Resize Inspector panel"]');
    expect(divider?.getAttribute('role')).toBe('separator');
    expect(divider?.tabIndex).toBe(0);

    await act(async () => {
      divider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      divider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    });
    expect(onResize).toHaveBeenNthCalledWith(1, -10);
    expect(onResize).toHaveBeenNthCalledWith(2, 40);

    await act(async () => root.unmount());
    host.remove();
  });

  it('keeps a visible control for reopening a collapsed Inspector', () => {
    const markup = renderToStaticMarkup(
      <RightPanel
        activeItem={null}
        scopeProjectId="all"
        scopeCollectionId="all"
        isCollapsed
        activeTab="inspector"
        onCollapsedChange={vi.fn()}
        onActiveTabChange={vi.fn()}
      />
    );

    expect(markup).toContain('right-panel-collapsed');
    expect(markup).toContain('aria-label="Expand Inspector panel"');
    expect(markup).toContain('<span>Inspector</span>');
  });

  it('feeds the Library selection to the shell Inspector instead of a stale workspace tab', () => {
    expect(resolveShellInspectorItemId({
      activeView: 'bookmarks',
      isSearchSurface: false,
      selectedSearchItemId: null,
      selectedBrowseItemId: 'library-item',
      activeGlobalTab: { kind: 'item', id: 'old-tab', itemId: 'old-item' },
    })).toBe('library-item');

    expect(resolveShellInspectorItemId({
      activeView: 'notes',
      isSearchSurface: false,
      selectedSearchItemId: null,
      selectedBrowseItemId: 'note-item',
      activeGlobalTab: null,
    })).toBe('note-item');
  });

  it('renders Enrichment Hub beside the shared right Inspector', () => {
    expect(isFullPageDashboardView('pipeline')).toBe(false);
    expect(isFullMiddleDashboardView('pipeline')).toBe(true);
    expect(resolveShellInspectorItemId({
      activeView: 'pipeline',
      isSearchSurface: false,
      selectedSearchItemId: null,
      selectedBrowseItemId: 'hub-item',
      activeGlobalTab: { kind: 'item', id: 'old-tab', itemId: 'old-item' },
    })).toBe('hub-item');
  });

  it('restores the Library selection before the child view reports its hydrated item', () => {
    localStorage.setItem(
      'workbench:library-page-state:v1:library:all:all',
      JSON.stringify({ selectedItemId: 'restored-item' })
    );
    expect(loadRestoredBrowseItemId('bookmarks', 'all', 'all')).toBe('restored-item');
    expect(loadRestoredBrowseItemId('pipeline', 'all', 'all')).toBeNull();
    localStorage.clear();
  });

  it('does not clear a locally restored Home selection during shell navigation sync', () => {
    expect(resolveBrowseContextSelectedItemId('home', null, 'visible-home-item'))
      .toBe('visible-home-item');
    expect(resolveBrowseContextSelectedItemId('pipeline', null, 'visible-hub-item'))
      .toBe('visible-hub-item');
    expect(resolveBrowseContextSelectedItemId('bookmarks', null, 'stale-library-item'))
      .toBeNull();
  });

  it('resolves an in-memory selected item synchronously before async lookup effects', () => {
    const selected = {
      id: 'selected-item',
      title: 'Selected',
      url: 'https://example.com/selected',
    } as Item;
    const stale = {
      id: 'stale-item',
      title: 'Stale',
      url: 'https://example.com/stale',
    } as Item;

    expect(resolveInspectorItemFromSources(selected.id, [selected], stale)).toBe(selected);
    expect(resolveInspectorItemFromSources(selected.id, [], stale)).toBeNull();
  });

  it('shows a loading state instead of a false empty Inspector for a restored item', () => {
    const markup = renderToStaticMarkup(
      <RightPanel
        activeItem={null}
        activeItemLoading
        scopeProjectId="all"
        scopeCollectionId="all"
        isCollapsed={false}
        activeTab="inspector"
        onCollapsedChange={vi.fn()}
        onActiveTabChange={vi.fn()}
      />
    );
    expect(markup).toContain('Loading selected item…');
    expect(markup).not.toContain('Select an item or search result');
  });

  it('renders the current scope as a labelled, dismissible trail', () => {
    const markup = renderToStaticMarkup(
      <ScopeChipsBar
        scopeProjectId="project-a"
        scopeCollectionId="collection-a"
        projects={[{ id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 }]}
        collections={[{
          id: 'collection-a',
          name: 'Sources',
          isDefault: false,
          created_at: 1,
          updated_at: 1,
          primaryProjectId: 'project-a',
          projectIds: ['project-a'],
        }]}
        itemCount={12}
        onClearProject={vi.fn()}
        onClearCollection={vi.fn()}
        onResetScope={vi.fn()}
      />
    );

    expect(markup).toContain('aria-label="Current library scope"');
    expect(markup).toContain('Collection: Sources');
    expect(markup).toContain('aria-label="Clear collection scope"');
    expect(markup).toContain('12 items');
  });

  it('treats Inbox Incoming as its single canonical project view', async () => {
    const onSelectCollectionScope = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <LeftSidebar
          isCollapsed={false}
          onToggle={vi.fn()}
          activeView="home"
          onSelectView={vi.fn()}
          projects={[{ id: 'inbox', name: 'Inbox', isDefault: true, created_at: 1, updated_at: 1 }]}
          collections={[{
            id: 'incoming',
            name: 'Incoming',
            isDefault: true,
            created_at: 1,
            updated_at: 1,
            primaryProjectId: 'inbox',
            projectIds: ['inbox'],
          }]}
          items={[{ id: 'item-a', title: 'Captured item', url: '', collectionIds: ['incoming'], tags: [], source: 'manual', created_at: 1, updated_at: 1 }]}
          scopeProjectId="inbox"
          scopeCollectionId="all"
          onSelectProjectScope={vi.fn()}
          onSelectCollectionScope={onSelectCollectionScope}
        />
      );
    });

    const collectionTrigger = host.querySelector<HTMLButtonElement>('.ui-sidebar__collection-trigger');
    expect(collectionTrigger?.textContent).toContain('Incoming');
    expect(collectionTrigger?.textContent).not.toContain('All');
    expect(collectionTrigger?.hasAttribute('aria-haspopup')).toBe(false);
    expect(host.querySelector('[aria-label="Choose collection"]')).toBeNull();
    await act(async () => collectionTrigger?.click());
    expect(onSelectCollectionScope).toHaveBeenCalledWith('all', 'inbox');

    await act(async () => root.unmount());
    host.remove();
  });

  it('maps ordinary project All and collection rows to their matching middle views', async () => {
    const onSelectCollectionScope = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <LeftSidebar
          isCollapsed={false}
          onToggle={vi.fn()}
          activeView="home"
          onSelectView={vi.fn()}
          projects={[{ id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 }]}
          collections={[{
            id: 'sources',
            name: 'Sources',
            isDefault: false,
            created_at: 1,
            updated_at: 1,
            primaryProjectId: 'project-a',
            projectIds: ['project-a'],
          }]}
          items={[]}
          recentCollectionIdsByProject={{ 'project-a': ['sources'] }}
          scopeProjectId="project-a"
          scopeCollectionId="all"
          onSelectProjectScope={vi.fn()}
          onSelectCollectionScope={onSelectCollectionScope}
        />
      );
    });

    const collectionTrigger = host.querySelector<HTMLButtonElement>('.ui-sidebar__collection-trigger');
    expect(collectionTrigger?.textContent).toContain('All project items');
    expect(host.textContent).not.toContain('Sources');

    await act(async () => collectionTrigger?.click());
    expect(host.textContent).toContain('Recent');
    let scopeButtons = host.querySelectorAll<HTMLButtonElement>('.ui-sidebar__collection-option');
    expect([...scopeButtons].map((button) => button.textContent?.trim())).toEqual(['All project itemsResearch', 'Sources0']);
    await act(async () => scopeButtons[0]?.click());

    await act(async () => collectionTrigger?.click());
    scopeButtons = host.querySelectorAll<HTMLButtonElement>('.ui-sidebar__collection-option');
    await act(async () => scopeButtons[1]?.click());
    expect(onSelectCollectionScope).toHaveBeenNthCalledWith(1, 'all', 'project-a');
    expect(onSelectCollectionScope).toHaveBeenNthCalledWith(2, 'sources', 'project-a');

    await act(async () => root.unmount());
    host.remove();
  });

  it('keeps collections available at All Projects', async () => {
    const onSelectCollectionScope = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <LeftSidebar
          isCollapsed={false}
          onToggle={vi.fn()}
          activeView="search"
          onSelectView={vi.fn()}
          projects={[{ id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 }]}
          collections={[{ id: 'sources', name: 'Sources', isDefault: false, created_at: 1, updated_at: 1, primaryProjectId: 'project-a', projectIds: ['project-a'] }]}
          items={[]}
          scopeProjectId="all"
          scopeCollectionId="all"
          onSelectProjectScope={vi.fn()}
          onSelectCollectionScope={onSelectCollectionScope}
        />
      );
    });

    expect(host.textContent).not.toContain('Sources');
    await act(async () => host.querySelector<HTMLButtonElement>('.ui-sidebar__collection-trigger')?.click());
    const sources = [...host.querySelectorAll<HTMLButtonElement>('.ui-sidebar__collection-option')]
      .find((button) => button.textContent?.includes('Sources'));
    await act(async () => sources?.click());
    expect(onSelectCollectionScope).toHaveBeenCalledWith('sources', 'project-a');

    await act(async () => root.unmount());
    host.remove();
  });

  it('keeps a large collection set out of the navigation flow and filters it in the picker', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const project = { id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 };
    const collections = Array.from({ length: 40 }, (_, index) => ({
      id: `collection-${index}`,
      name: `Collection ${String(index).padStart(2, '0')}`,
      isDefault: false,
      created_at: 1,
      updated_at: 1,
      primaryProjectId: project.id,
      projectIds: [project.id],
    }));

    await act(async () => {
      root.render(
        <LeftSidebar
          isCollapsed={false}
          onToggle={vi.fn()}
          activeView="home"
          onSelectView={vi.fn()}
          projects={[project]}
          collections={collections}
          items={[]}
          scopeProjectId={project.id}
          scopeCollectionId="all"
          onSelectProjectScope={vi.fn()}
          onSelectCollectionScope={vi.fn()}
        />
      );
    });

    expect(host.querySelectorAll('.ui-sidebar__collection-option')).toHaveLength(0);
    expect(host.querySelector('.ui-sidebar__nav')?.textContent).not.toContain('Collection 39');
    await act(async () => host.querySelector<HTMLButtonElement>('.ui-sidebar__collection-trigger')?.click());
    expect(host.querySelectorAll('.ui-sidebar__collection-option')).toHaveLength(41);

    const search = host.querySelector<HTMLInputElement>('[aria-label="Find a collection"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, '39');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect([...host.querySelectorAll<HTMLButtonElement>('.ui-sidebar__collection-option')]
      .map((button) => button.textContent)).toEqual(['All project itemsResearch', 'Collection 390']);

    await act(async () => root.unmount());
    host.remove();
  });

  it('restores the latest valid collection when returning to a project', () => {
    const project = { id: 'project-a', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 };
    const collection = {
      id: 'sources', name: 'Sources', isDefault: false, created_at: 1, updated_at: 1,
      primaryProjectId: project.id, projectIds: [project.id],
    };
    expect(resolveRememberedProjectCollection(
      project.id,
      [project],
      [collection],
      { [project.id]: ['missing', collection.id] }
    )).toBe(collection.id);
    expect(resolveRememberedProjectCollection('all', [project], [collection], {
      [project.id]: [collection.id],
    })).toBe('all');
  });
});
