// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AllLibraryWorkspaceOverview, type WorkspaceViewGroup } from './AllLibraryWorkspaceOverview';
import type { GlobalTab } from './GlobalTabSystem';

const globalSearch: GlobalTab = { kind: 'search', id: 'search-global', query: 'local first', filters: {} };
const projectUrl: GlobalTab = { kind: 'url', id: 'url-project', url: 'https://example.com', title: 'Example', scopeProjectId: 'project-a' };
const groups: WorkspaceViewGroup[] = [
  { key: 'global', title: 'Global workspace', contextLabel: 'All Library', projectId: 'all', tabs: [globalSearch] },
  { key: 'project:project-a', title: 'Research session', contextLabel: 'Project Alpha', projectId: 'project-a', tabs: [projectUrl] },
];

function render(selectedView: string, selectedTab: GlobalTab | null = null) {
  return renderToStaticMarkup(
    <AllLibraryWorkspaceOverview
      groups={groups}
      selectedView={selectedView}
      onSelectedViewChange={vi.fn()}
      selectedTab={selectedTab}
      selectedItem={null}
      items={[]}
      projects={[{ id: 'project-a', name: 'Project Alpha', created_at: 1, updated_at: 1, isDefault: false }]}
      collections={[]}
      onSelectTab={vi.fn()}
      onRemoveGlobalTab={vi.fn()}
      onFocusTab={vi.fn()}
      onFocusGlobal={vi.fn()}
      onAddItemToGlobal={vi.fn()}
      onViewSearch={vi.fn()}
    />
  );
}

describe('AllLibraryWorkspaceOverview', () => {
  it('groups global and project work without exposing destructive controls in the combined lens', () => {
    const markup = render('all-active');

    expect(markup).toContain('Global workspace');
    expect(markup).toContain('Research session');
    expect(markup).toContain('Project Alpha');
    expect(markup).not.toContain('Remove local first from workspace');
    expect(markup).not.toContain('Remove Example from workspace');
  });

  it('previews a saved search before opening its results', () => {
    const markup = render('global', globalSearch);

    expect(markup).toContain('Saved search · All Library');
    expect(markup).toContain('View results');
    expect(markup).toContain('Focus');
    expect(markup).toContain('width:100%;min-width:0;min-height:40px');
    expect(markup).not.toContain('overflow-x:auto');
    expect(markup).toContain('height:390px;min-height:250px;max-height:390px');
    expect(markup).toContain('overflow-y:auto');
  });
});
