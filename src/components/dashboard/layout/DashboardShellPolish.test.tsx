// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LeftSidebar } from './LeftSidebar';
import { RightPanel } from './RightPanel';
import { ScopeChipsBar } from '../ScopeChipsBar';

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
  });

  it('exposes Inspector and Ask as one accessible tab set', () => {
    const markup = renderToStaticMarkup(
      <RightPanel
        activeItem={null}
        scopeProjectId="all"
        scopeCollectionId="all"
        isCollapsed={false}
        activeTab="inspector"
        onCollapsedChange={vi.fn()}
        onActiveTabChange={vi.fn()}
      />
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Inspector tools"');
    expect(markup).toContain('class="right-panel__tab" data-active="true" role="tab" aria-selected="true"');
    expect(markup).toContain('aria-label="Collapse Inspector panel"');
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

    const collectionSection = host.querySelector('#sidebar-collections-heading')?.closest('section');
    const scopeButtons = collectionSection?.querySelectorAll<HTMLButtonElement>('.ui-sidebar__nav-item');
    expect(scopeButtons).toHaveLength(1);
    expect(scopeButtons?.[0]?.textContent).toContain('Incoming');
    expect(scopeButtons?.[0]?.textContent).not.toContain('All');
    await act(async () => scopeButtons?.[0]?.click());
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
          scopeProjectId="project-a"
          scopeCollectionId="all"
          onSelectProjectScope={vi.fn()}
          onSelectCollectionScope={onSelectCollectionScope}
        />
      );
    });

    const collectionSection = host.querySelector('#sidebar-collections-heading')?.closest('section');
    const scopeButtons = collectionSection?.querySelectorAll<HTMLButtonElement>('.ui-sidebar__nav-item');
    expect([...scopeButtons ?? []].map((button) => button.textContent?.trim())).toEqual(['All', 'Sources0']);
    await act(async () => scopeButtons?.[0]?.click());
    await act(async () => scopeButtons?.[1]?.click());
    expect(onSelectCollectionScope).toHaveBeenNthCalledWith(1, 'all', 'project-a');
    expect(onSelectCollectionScope).toHaveBeenNthCalledWith(2, 'sources', 'project-a');

    await act(async () => root.unmount());
    host.remove();
  });
});
