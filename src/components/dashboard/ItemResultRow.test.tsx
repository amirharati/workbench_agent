// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemResultRow } from './ItemResultRow';

function dispatchDragStart(element: Element, target = element): Event {
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { setData: vi.fn(), effectAllowed: 'uninitialized' },
  });
  target.dispatchEvent(event);
  return event;
}

describe('ItemResultRow', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(async () => {
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    document.body.innerHTML = '';
  });

  it('shares one plain click and native-drag surface while excluding actions', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const onSelectItem = vi.fn();

    await act(async () => {
      root.render(
        <ItemResultRow
          item={{ id: 'item-1', title: 'One' }}
          dragSource={{ kind: 'reference', label: 'Results' }}
          selected
          onSelectItem={onSelectItem}
        >
          <span data-testid="plain">One</span>
          <button type="button">Preview</button>
        </ItemResultRow>
      );
    });

    const row = host.querySelector<HTMLElement>('[data-item-result-row="true"]')!;
    expect(row.getAttribute('draggable')).toBe('true');
    expect(row.getAttribute('data-selected')).toBe('true');

    await act(async () => host.querySelector<HTMLElement>('[data-testid="plain"]')?.click());
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    expect(onSelectItem).toHaveBeenCalledTimes(1);

    await act(async () => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(onSelectItem).toHaveBeenCalledTimes(2);

    const actionDrag = dispatchDragStart(row, host.querySelector<HTMLButtonElement>('button')!);
    expect(actionDrag.defaultPrevented).toBe(true);
    const rowDrag = dispatchDragStart(row);
    expect(rowDrag.defaultPrevented).toBe(false);
  });
});
