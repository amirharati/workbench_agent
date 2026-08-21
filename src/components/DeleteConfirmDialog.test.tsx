// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

describe('DeleteConfirmDialog', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => document.body.replaceChildren());

  it('removes only selected placements and reserves Trash for every placement', async () => {
    const onResult = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <DeleteConfirmDialog
          item={{ id: 'i', url: 'https://example.com', title: 'Example', collectionIds: ['a', 'b'], tags: [], created_at: 1, updated_at: 1, source: 'manual' }}
          collections={[
            { id: 'a', name: 'Reading', primaryProjectId: 'p', projectIds: ['p'], isDefault: false, created_at: 1, updated_at: 1 },
            { id: 'b', name: 'Archive', primaryProjectId: 'p', projectIds: ['p'], isDefault: false, created_at: 1, updated_at: 1 },
          ]}
          projects={[{ id: 'p', name: 'Research', isDefault: false, created_at: 1, updated_at: 1 }]}
          onResult={onResult}
        />
      );
    });

    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    await act(async () => { checkboxes[1]!.click(); });
    const submit = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Remove from 1 location'));
    expect(submit).toBeTruthy();
    await act(async () => { submit!.click(); });
    expect(onResult).toHaveBeenCalledWith({ action: 'remove-from-collection', collectionIds: ['a'] });
    act(() => root.unmount());
  });
});
