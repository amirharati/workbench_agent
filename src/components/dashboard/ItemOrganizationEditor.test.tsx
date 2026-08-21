// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Collection, Item, Project } from '../../lib/db';
import { ItemOrganizationEditor } from './ItemOrganizationEditor';

const project: Project = {
  id: 'project-1',
  name: 'Research',
  isDefault: false,
  created_at: 1,
  updated_at: 1,
};

const collections: Collection[] = [
  {
    id: 'collection-1',
    name: 'Inbox',
    primaryProjectId: project.id,
    projectIds: [project.id],
    isDefault: false,
    created_at: 1,
    updated_at: 1,
  },
  {
    id: 'collection-2',
    name: 'Reading',
    primaryProjectId: project.id,
    projectIds: [project.id],
    isDefault: false,
    created_at: 1,
    updated_at: 1,
  },
];

const item: Item = {
  id: 'item-1',
  url: 'https://example.com',
  title: 'Example',
  collectionIds: ['collection-1'],
  tags: [],
  created_at: 1,
  updated_at: 1,
  source: 'bookmark',
};

describe('ItemOrganizationEditor', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('shows an honest durable-save state while applying organization', async () => {
    let resolveUpdate: (() => void) | undefined;
    const onUpdate = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      })
    );
    const onBusyChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <ItemOrganizationEditor
          item={item}
          projects={[project]}
          collections={collections}
          defaultProjectId={project.id}
          defaultCollectionId="collection-2"
          onUpdate={onUpdate}
          onBusyChange={onBusyChange}
        />
      );
    });

    const add = [...host.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Add'
    );
    expect(add).toBeTruthy();

    await act(async () => {
      add!.click();
      await Promise.resolve();
    });

    expect(onUpdate).toHaveBeenCalledWith({
      collectionIds: ['collection-1', 'collection-2'],
    });
    expect(host.textContent).toContain('Saving organization…');
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(onBusyChange).toHaveBeenCalledWith(true);

    await act(async () => {
      resolveUpdate?.();
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Organization saved');
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    act(() => root.unmount());
  });

  it('shows a removed location and restores its original membership', async () => {
    const onUpdate = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <ItemOrganizationEditor
          item={{
            ...item,
            removedPlacements: {
              'collection-2': {
                collectionId: 'collection-2',
                addedAt: 2,
                removedAt: 3,
                source: 'manual',
              },
            },
          }}
          projects={[project]}
          collections={collections}
          onUpdate={onUpdate}
        />
      );
    });

    expect(host.textContent).toContain('Removed locations');
    const restore = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Restore');
    expect(restore).toBeTruthy();
    await act(async () => { restore!.click(); });
    expect(onUpdate).toHaveBeenCalledWith({ collectionIds: ['collection-1', 'collection-2'] });
    act(() => root.unmount());
  });
});
