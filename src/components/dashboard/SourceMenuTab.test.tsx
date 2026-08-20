// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Layers3 } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceMenuTab } from './SourceMenuTab';

describe('SourceMenuTab', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const roots: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];

  afterEach(async () => {
    for (const { root, host } of roots.splice(0)) {
      await act(async () => root.unmount());
      host.remove();
    }
    document.body.innerHTML = '';
  });

  it('shows the selected source and switches from one unified menu', async () => {
    const onSelect = vi.fn();
    const onActivate = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push({ root, host });
    await act(async () => {
      root.render(
        <SourceMenuTab
          label="Workspace"
          icon={<Layers3 size={12} />}
          active={false}
          selectedValue="global"
          options={[
            { value: 'global', label: 'Global' },
            { value: 'research', label: 'Research' },
          ]}
          onSelect={onSelect}
          onActivate={onActivate}
        />
      );
    });

    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Workspace view: Global"]')!;
    expect(trigger.textContent).toContain('Workspace');
    expect(trigger.textContent).toContain('Global');
    await act(async () => trigger.click());
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();

    const chooser = host.querySelector<HTMLButtonElement>('[aria-label="Choose Workspace"]')!;
    await act(async () => chooser.click());
    const research = [...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((button) => button.textContent?.includes('Research'))!;
    await act(async () => research.click());
    expect(onSelect).toHaveBeenCalledWith('research');
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });
});
