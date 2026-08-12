// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineJobSnapshot } from '../../lib/storage/dbWorker/pipelineJobStore';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const { dbRpc, resumePipelineJobOnOffscreen } = vi.hoisted(() => ({
  dbRpc: vi.fn(),
  resumePipelineJobOnOffscreen: vi.fn(),
}));

vi.mock('../../lib/storage/dbClient', () => ({ dbRpc }));
vi.mock('../../lib/pipeline/offscreenPipelineClient', () => ({
  requestPipelineJobCancellation: vi.fn(),
  resumePipelineJobOnOffscreen,
}));

import { PipelineCoordinatorBanner } from './PipelineCoordinatorBanner';
import { PipelineProgressProvider } from './PipelineProgressProvider';

const snapshot: PipelineJobSnapshot = {
  job: {
    id: 'paused-job',
    dedupe_key: 'scope:paused-job',
    action: 'reembed_v2',
    source: 'hub',
    priority: 100,
    status: 'paused',
    payload_json: '{}',
    total_items: 5,
    completed_items: 2,
    failed_items: 0,
    lease_owner: null,
    lease_epoch: 1,
    lease_expires_at: null,
    heartbeat_at: null,
    cancel_requested_at: null,
    created_at: 1,
    started_at: 2,
    updated_at: 3,
    finished_at: null,
    last_error: null,
  },
  tasks: ['one', 'two', 'three', 'four', 'five'].map((itemId, index) => ({
    job_id: 'paused-job',
    item_id: itemId,
    stage: 'embed',
    ordinal: index,
    status: index < 2 ? 'completed' as const : 'pending' as const,
    attempts: index < 2 ? 1 : 0,
    lease_owner: null,
    lease_epoch: 0,
    lease_expires_at: null,
    input_hash: null,
    result_ref: index < 2 ? 'embed:1:0' : null,
    created_at: 1,
    started_at: index < 2 ? 2 : null,
    updated_at: 3,
    finished_at: index < 2 ? 3 : null,
    last_error: null,
  })),
};

describe('pipeline Resume modal', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    dbRpc.mockReset();
    dbRpc.mockResolvedValue([snapshot]);
    resumePipelineJobOnOffscreen.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllTimers();
  });

  it('shows progress and final results for a resumed job', async () => {
    let finish!: (value: unknown) => void;
    resumePipelineJobOnOffscreen.mockImplementation((_jobId, options) => {
      options.onProgress({
        phase: 'embed',
        label: 'Building search embedding… 3/5',
        current: 2,
        total: 5,
      });
      return new Promise((resolve) => { finish = resolve; });
    });

    await act(async () => {
      root.render(
        <PipelineProgressProvider>
          <PipelineCoordinatorBanner />
        </PipelineProgressProvider>
      );
    });
    await act(async () => {});

    const resume = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Resume');
    expect(resume).toBeTruthy();
    await act(async () => { resume?.click(); });

    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Resuming search embeddings');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Building search embedding… 3/5');

    await act(async () => {
      finish({
        type: 'pipeline-offscreen-done',
        requestId: 'paused-job',
        ok: true,
        result: {
          enriched: 0,
          skipped: 0,
          failed: 0,
          classified: 0,
          embedded: 5,
          embedFailed: 0,
          message: '5 embedded',
        },
      });
    });

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Resuming search embeddings — complete');
    expect(dialog?.textContent).toContain('5 embedded');
    expect(dialog?.textContent).toContain('Close');
  });
});
