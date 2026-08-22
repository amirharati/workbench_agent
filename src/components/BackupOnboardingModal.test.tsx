// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupFolderCandidate } from '../lib/backupFolder';
import {
  BackupOnboardingModal,
  BackupSetupResultModal,
} from './BackupOnboardingModal';

describe('BackupOnboardingModal', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => document.body.replaceChildren());

  function mount(props: Partial<React.ComponentProps<typeof BackupOnboardingModal>> = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onConfirmFolder = vi.fn(async () => ({ ok: true }));
    act(() => {
      root.render(
        <BackupOnboardingModal
          open
          onChooseFolder={async () => ({ ok: false, error: 'cancelled' })}
          onConfirmFolder={onConfirmFolder}
          {...props}
        />
      );
    });
    return { root, onConfirmFolder };
  }

  it('keeps mandatory setup open and makes an interrupted picker explicit', async () => {
    const { root, onConfirmFolder } = mount();
    const choose = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Choose folder'))!;
    await act(async () => choose.click());

    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Nothing changed; setup is still waiting.');
    expect(onConfirmFolder).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('inspects first and requires a separate confirmation before linking', async () => {
    const candidate: BackupFolderCandidate = {
      handle: { name: 'Homebase Data' } as FileSystemDirectoryHandle,
      folderName: 'Homebase Data',
      source: 'existing-workbench',
      files: [
        { name: 'workbench.sqlite', size: 2 * 1024 * 1024 },
        { name: 'workbench-content.sqlite', size: 512 * 1024 },
      ],
    };
    const { root, onConfirmFolder } = mount({
      onChooseFolder: async () => ({ ok: true, candidate }),
    });
    const choose = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Choose folder'))!;
    await act(async () => choose.click());

    expect(document.body.textContent).toContain('Confirm your data folder');
    expect(document.body.textContent).toContain('Existing Homebase library found');
    expect(document.body.textContent).toContain('workbench-content.sqlite');
    expect(onConfirmFolder).not.toHaveBeenCalled();

    const confirm = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Use this folder'))!;
    await act(async () => confirm.click());
    expect(onConfirmFolder).toHaveBeenCalledWith(candidate);
    act(() => root.unmount());
  });

  it('reports the selected folder, item count, and file actions after setup', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <BackupSetupResultModal
          receipt={{
            folderName: 'Homebase Data',
            mode: 'fresh',
            itemCount: 0,
            details: [
              'Created a new workbench.sqlite for the library.',
              'Created a new workbench-content.sqlite for fetched page content.',
            ],
          }}
          onContinue={vi.fn()}
        />
      );
    });
    expect(document.body.textContent).toContain('New Homebase library created');
    expect(document.body.textContent).toContain('Homebase Data');
    expect(document.body.textContent).toContain('0 library items ready');
    expect(document.body.textContent).toContain('workbench-content.sqlite');
    act(() => root.unmount());
  });
});
