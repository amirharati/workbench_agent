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
  { key: 'global', projectId: 'all', projectName: 'Global', workspaceName: 'Workspace', path: 'Global / Workspace', kind: 'global', isCurrent: true },
  { key: 'research-live', projectId: 'research', projectName: 'Research', workspaceName: 'Live session', path: 'Research / Live session', kind: 'live', isCurrent: false },
  { key: 'writing-plan', projectId: 'writing', projectName: 'Writing', workspaceName: 'Draft plan', path: 'Writing / Draft plan', kind: 'saved', isCurrent: false },
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

    await act(async () => {
      root.render(
        <WorkspaceDestinationPicker
          item={item}
          destinations={destinations}
          recentDestinationKeys={['writing-plan']}
          isAdded={(destination) => destination.key === 'global'}
          onAdd={onAdd}
        />
      );
    });

    expect(host.textContent).toContain('Add to workspace…');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.ui-workspace-picker-trigger')?.click());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Current context');
    expect(dialog?.textContent).toContain('Global / Workspace');
    expect(dialog?.textContent).toContain('Recent');
    expect(dialog?.textContent).toContain('Writing / Draft plan');
    expect(dialog?.querySelector('[aria-label="Already added to Global / Workspace"]')).not.toBeNull();

    const search = dialog?.querySelector<HTMLInputElement>('[aria-label="Search project or workspace"]');
    await act(async () => {
      if (!search) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(search, 'Research');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(dialog?.textContent).toContain('Search results');
    expect(dialog?.textContent).toContain('Research / Live session');
    expect(dialog?.textContent).not.toContain('Writing / Draft plan');

    await act(async () => dialog?.querySelector<HTMLButtonElement>('[aria-label="Add to Research / Live session"]')?.click());
    expect(onAdd).toHaveBeenCalledWith(destinations[1]);
    expect(dialog?.textContent).toContain('Added to Research / Live session');

    await act(async () => root.unmount());
  });
});
