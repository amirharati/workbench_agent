// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';
import { WorkspaceDestinationPicker } from './WorkspaceDestinationPicker';
import type { WorkspaceDestination } from './workspaceDestinations';

const item: Item = {
  id: 'item-a',
  title: 'Architecture notes',
  url: '',
  collectionIds: [],
  tags: [],
  source: 'manual',
  created_at: 1,
  updated_at: 1,
};
const destinations: WorkspaceDestination[] = [
  { key: 'global', projectId: 'all', projectName: 'Global', workspaceName: 'Workspace', path: 'Global workspace', kind: 'global', isCurrent: true },
  { key: 'research-live', projectId: 'research', projectName: 'Research', workspaceName: 'General', path: 'Research — General', kind: 'live', isCurrent: false },
  { key: 'writing-plan', projectId: 'writing', projectName: 'Writing', workspaceName: 'Draft plan', path: 'Writing — Draft plan', kind: 'saved', isCurrent: false },
];

describe('WorkspaceDestinationPicker', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the page control compact and exposes current, recent, and searchable full paths in the dialog', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onAdd = vi.fn();
    const onView = vi.fn();

    await act(async () => {
      root.render(
        <WorkspaceDestinationPicker
          item={item}
          destinations={destinations}
          recentDestinationKeys={['writing-plan']}
          isAdded={(destination) => destination.key === 'global'}
          onAdd={onAdd}
          onView={onView}
        />
      );
    });

    expect(host.textContent).toContain('Add to workspace…');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.ui-workspace-picker-trigger')?.click());
    expect(onAdd).not.toHaveBeenCalled();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Active workspace');
    expect(dialog?.textContent).toContain('Global workspace');
    expect(dialog?.textContent).toContain('Recent');
    expect(dialog?.textContent).toContain('Writing — Draft plan');
    expect(dialog?.textContent).toContain('Selected:');
    expect(dialog?.textContent).toContain('Already added');
    expect(dialog?.querySelector('[data-selected="true"]')?.textContent).toContain('Global workspace');

    const search = dialog?.querySelector<HTMLInputElement>('[aria-label="Search project or workspace"]');
    await act(async () => {
      if (!search) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(search, 'Research');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(dialog?.textContent).toContain('Search results');
    expect(dialog?.textContent).toContain('Research — General');
    expect(dialog?.textContent).not.toContain('Writing — Draft plan');

    const researchRow = [...(dialog?.querySelectorAll<HTMLButtonElement>('.ui-workspace-picker__row') ?? [])]
      .find((button) => button.textContent?.includes('Research — General'));
    await act(async () => researchRow?.click());
    expect(dialog?.querySelector('[data-selected="true"]')?.textContent).toContain('Research — General');

    const addButton = [...(dialog?.querySelectorAll<HTMLButtonElement>('.ui-dialog__footer button') ?? [])]
      .find((button) => button.textContent?.includes('Add to workspace'));
    await act(async () => addButton?.click());
    expect(onAdd).toHaveBeenCalledWith(destinations[1]);
    expect(dialog?.textContent).toContain('Added to Research — General');

    const viewButton = [...(dialog?.querySelectorAll<HTMLButtonElement>('.ui-dialog__footer button') ?? [])]
      .find((button) => button.textContent?.includes('View workspace'));
    await act(async () => viewButton?.click());
    expect(onView).toHaveBeenCalledWith(destinations[1]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => root.unmount());
  });
});
