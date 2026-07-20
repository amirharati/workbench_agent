// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GLOBAL_TAB_STATE_DEFAULT } from './GlobalTabSystem';
import { TabCommanderView } from './TabCommanderView';

describe('TabCommanderView', () => {
  it('uses the full-page browser-management shell without bottom-panel controls', () => {
    const markup = renderToStaticMarkup(
      <TabCommanderView
        windows={[{
          windowId: 10,
          tabs: [{ id: 20, windowId: 10, title: 'Example', url: 'https://example.com', active: true, index: 0, pinned: false, highlighted: true, incognito: false, selected: true, discarded: false, autoDiscardable: true, frozen: false, groupId: -1 }],
        }]}
        workspaces={[]}
        projects={[]}
        items={[]}
        homeState={GLOBAL_TAB_STATE_DEFAULT}
        onHomeStateChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(markup).toContain('data-tab-commander-header="true"');
    expect(markup).toContain('Manage 1 live browser window and 1 open tab');
    expect(markup).toContain('aria-label="Filter live browser tabs"');
    expect(markup).toContain('Search and capture apply to the selected windows.');
    expect(markup).toContain('data-tab-commander-canvas="true"');
    expect(markup).toContain('Live windows');
    expect(markup).toContain('Tabs in selection');
    expect(markup).toContain('Current window');
    expect(markup).toContain('aria-label="Activate Example"');
    expect(markup).toContain('aria-label="Locate W1"');
    expect(markup).toContain('Refresh');
    expect(markup).not.toContain('title="Collapse"');
    expect(markup).not.toContain('lucide-grip-horizontal');
    expect(markup.match(/>Capture 1 window</g)).toHaveLength(1);
  });
});
