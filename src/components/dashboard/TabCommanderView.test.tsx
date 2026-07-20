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
    expect(markup).toContain('Capture will use all open windows.');
    expect(markup).toContain('Refresh');
    expect(markup).not.toContain('title="Collapse"');
    expect(markup).not.toContain('lucide-grip-horizontal');
    expect(markup.match(/>Capture</g)).toHaveLength(1);
  });
});
