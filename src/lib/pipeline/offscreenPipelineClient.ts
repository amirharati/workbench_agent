/**
 * Pipeline execution boundary.
 *
 * All enrichment work runs in the offscreen document. UI pages only submit,
 * cancel, and observe jobs.
 */
import { loadAISettings } from '../ai/settings';
import type { BatchDigestProgress, BatchDigestResult } from './batchDigest';
import type { SingleLinkDigestResult } from './singleLinkDigest';
import {
  PIPELINE_OFFSCREEN_TARGET,
  type OffscreenBatchJobOptions,
  type OffscreenSingleJobOptions,
  type PipelineOffscreenCancel,
  type PipelineOffscreenDoneEvent,
  type PipelineOffscreenProgressEvent,
  type PipelineOffscreenStartBatch,
  type PipelineOffscreenStartSingle,
  type PipelineOffscreenStartResponse,
} from './offscreenPipelineProtocol';

const START_TIMEOUT_MS = 30_000;
const CANCEL_TIMEOUT_MS = 15_000;
const MAX_CACHE_SEED_BYTES = 48 * 1024 * 1024;

function createRequestId(kind: 'batch' | 'single'): string {
  return `${kind}_${Date.now().toString(36)}_${crypto.randomUUID()}`;
}

function cancelledError(): Error {
  const error = new Error('Cancelled');
  error.name = 'AbortError';
  return error;
}

async function cancelOffscreenRequest(requestId: string, reason?: unknown): Promise<void> {
  const message: PipelineOffscreenCancel = {
    target: PIPELINE_OFFSCREEN_TARGET,
    action: 'cancel',
    requestId,
    reason: typeof reason === 'string' ? reason : undefined,
  };
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    /* The host may already have completed. */
  }
}

/** Bulk digest in the offscreen execution realm. There is intentionally no local fallback. */
export async function runBatchOnOffscreen(
  itemIds: string[],
  options: OffscreenBatchJobOptions & {
    signal?: AbortSignal;
    onProgress?: (p: BatchDigestProgress) => void;
  }
): Promise<BatchDigestResult> {
  if (options.signal?.aborted) throw cancelledError();

  const requestId = createRequestId('batch');
  const aiSettings = options.aiSettings ?? (await loadAISettings());
  const { signal, onProgress, ...wireOptions } = options;
  onProgress?.({
    phase: 'prep',
    label: 'Preparing pipeline memory…',
    current: 0,
    total: Math.max(itemIds.length, 1),
  });
  const { getRemoteStore } = await import('../storage/dbClient/remoteStore');
  const sourceStore = getRemoteStore();
  if (signal?.aborted) throw cancelledError();
  const cacheSeed = await sourceStore.createPipelineCacheSeed(itemIds);
  const cacheSeedBytes = new Blob([JSON.stringify(cacheSeed)]).size;
  if (cacheSeedBytes > MAX_CACHE_SEED_BYTES) {
    throw new Error(
      `Pipeline scope is too large to start (${Math.ceil(cacheSeedBytes / 1024 / 1024)} MiB). Run a smaller batch.`
    );
  }

  return new Promise<BatchDigestResult>((resolve, reject) => {
    let settled = false;
    let cancelRequested = false;
    let cancelTimer: number | undefined;
    const startTimer = window.setTimeout(() => {
      void cancelOffscreenRequest(requestId);
      finish(() => reject(new Error('Offscreen pipeline did not start within 30 seconds')));
    }, START_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(startTimer);
      if (cancelTimer != null) window.clearTimeout(cancelTimer);
      chrome.runtime.onMessage.removeListener(onMessage);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const onMessage = (message: unknown) => {
      const event = message as PipelineOffscreenProgressEvent | PipelineOffscreenDoneEvent;
      if (!event || event.requestId !== requestId) return;
      if (event.type === 'pipeline-offscreen-progress') {
        onProgress?.(event.progress);
        return;
      }
      if (event.type !== 'pipeline-offscreen-done') return;
      if (!event.ok || !event.result) {
        finish(() => reject(new Error(event.error ?? 'Offscreen pipeline failed')));
        return;
      }
      finish(() => resolve(event.result!));
    };
    const onAbort = () => {
      cancelRequested = true;
      void cancelOffscreenRequest(requestId, signal?.reason);
      // Let the host checkpoint and return its cancelled result. Bound the wait
      // so a dead host cannot leave the caller hanging forever.
      cancelTimer = window.setTimeout(() => {
        finish(() => reject(cancelledError()));
      }, CANCEL_TIMEOUT_MS);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });

    const message: PipelineOffscreenStartBatch = {
      target: PIPELINE_OFFSCREEN_TARGET,
      action: 'start-batch',
      requestId,
      itemIds,
      options: { ...wireOptions, aiSettings },
      cacheSeed,
    };
    void chrome.runtime
      .sendMessage(message)
      .then((response: PipelineOffscreenStartResponse | undefined) => {
        if (settled) return;
        if (!response?.ok) {
          finish(() => reject(new Error(response?.error ?? 'Offscreen pipeline unavailable')));
          return;
        }
        window.clearTimeout(startTimer);
        // The first cancel can race ahead of host registration. Resend after
        // acknowledgement without creating a second cancellation timer.
        if (cancelRequested || signal?.aborted) {
          void cancelOffscreenRequest(requestId, signal?.reason);
        }
      })
      .catch((error) => {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
  });
}

/** Durable single digest in the shared offscreen execution lane. */
export async function runSingleOnOffscreen(
  itemId: string,
  options: OffscreenSingleJobOptions & {
    signal?: AbortSignal;
    onProgress?: (p: BatchDigestProgress) => void;
  } = {}
): Promise<SingleLinkDigestResult> {
  if (options.signal?.aborted) throw cancelledError();

  const requestId = createRequestId('single');
  const aiSettings = options.aiSettings ?? (await loadAISettings());
  const { signal, onProgress, ...wireOptions } = options;
  onProgress?.({
    phase: 'prep',
    label: 'Submitting durable pipeline…',
    current: 0,
    total: 1,
  });

  return new Promise<SingleLinkDigestResult>((resolve, reject) => {
    let settled = false;
    let cancelRequested = false;
    let cancelTimer: number | undefined;
    const startTimer = window.setTimeout(() => {
      void cancelOffscreenRequest(requestId);
      finish(() => reject(new Error('Offscreen pipeline did not start within 30 seconds')));
    }, START_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(startTimer);
      if (cancelTimer != null) window.clearTimeout(cancelTimer);
      chrome.runtime.onMessage.removeListener(onMessage);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const onMessage = (message: unknown) => {
      const event = message as PipelineOffscreenProgressEvent | PipelineOffscreenDoneEvent;
      if (!event || event.requestId !== requestId) return;
      if (event.type === 'pipeline-offscreen-progress') {
        onProgress?.(event.progress);
        return;
      }
      if (event.type !== 'pipeline-offscreen-done') return;
      if (!event.ok || !event.singleResult) {
        const error = new Error(event.error ?? 'Offscreen pipeline failed');
        if (signal?.aborted) error.name = 'AbortError';
        finish(() => reject(error));
        return;
      }
      finish(() => resolve(event.singleResult!));
    };
    const onAbort = () => {
      cancelRequested = true;
      void cancelOffscreenRequest(requestId, signal?.reason);
      cancelTimer = window.setTimeout(() => {
        finish(() => reject(cancelledError()));
      }, CANCEL_TIMEOUT_MS);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });

    const message: PipelineOffscreenStartSingle = {
      target: PIPELINE_OFFSCREEN_TARGET,
      action: 'start-single',
      requestId,
      itemId,
      options: { ...wireOptions, aiSettings },
    };
    void chrome.runtime
      .sendMessage(message)
      .then((response: PipelineOffscreenStartResponse | undefined) => {
        if (settled) return;
        if (!response?.ok) {
          finish(() => reject(new Error(response?.error ?? 'Offscreen pipeline unavailable')));
          return;
        }
        window.clearTimeout(startTimer);
        if (cancelRequested || signal?.aborted) {
          void cancelOffscreenRequest(requestId, signal?.reason);
        }
      })
      .catch((error) => {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
  });
}
