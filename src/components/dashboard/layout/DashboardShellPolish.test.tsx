// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LeftSidebar } from './LeftSidebar';
import { RightPanel } from './RightPanel';
import { ScopeChipsBar } from '../ScopeChipsBar';

describe('dashboard shell polish contracts', () => {
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
});
