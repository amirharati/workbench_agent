// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogShell } from './DialogShell';

describe('DialogShell', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('labels the dialog, contains initial focus, handles Escape, and restores focus', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <DialogShell
          title="New project"
          description="Create a durable home."
          onClose={onClose}
          footer={<button type="button">Create</button>}
        >
          <input id="project-name" autoFocus />
        </DialogShell>
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog?.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement?.id).toBe('project-name');

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    expect(document.activeElement).toBe(opener);
  });
});
