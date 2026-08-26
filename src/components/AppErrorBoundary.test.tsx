// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

describe('AppErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    consoleError.mockRestore();
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('contains a failed page and allows a retry without leaving a white screen', async () => {
    let fail = true;
    const Unstable = () => {
      if (fail) throw new Error('chunk unavailable');
      return <div>Recovered page</div>;
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => root.render(
      <AppErrorBoundary context="this page"><Unstable /></AppErrorBoundary>
    ));
    expect(host.textContent).toContain('Could not open this page');
    expect(host.textContent).toContain('chunk unavailable');

    fail = false;
    const retry = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Try again'));
    await act(async () => retry?.click());
    expect(host.textContent).toContain('Recovered page');

    await act(async () => root.unmount());
  });
});
