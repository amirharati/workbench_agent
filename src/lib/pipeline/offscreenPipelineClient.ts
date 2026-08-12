/** Dashboard-side client for the extension-wide durable pipeline coordinator. */
import type { BatchDigestProgress, BatchDigestResult } from './batchDigest';
import { loadAISettings } from '../ai/settings';
import {
  setPipelineClientJobActive,
  type SingleLinkDigestResult,
} from './singleLinkDigest';
import {
  PIPELINE_OFFSCREEN_TARGET,
  type OffscreenBatchJobOptions,
  type OffscreenPipelineJobOptions,
  type OffscreenSingleJobOptions,
  type PipelineOffscreenCancel,
  type PipelineOffscreenResume,
  type PipelineOffscreenDoneEvent,
  type PipelineOffscreenProgressEvent,
  type PipelineOffscreenStartJob,
  type PipelineOffscreenStartResponse,
  type PipelineJobOperation,
} from './offscreenPipelineProtocol';

const START_TIMEOUT_MS = 30_000;
const CANCEL_TIMEOUT_MS = 15_000;

function createRequestId(): string {
  return `pipeline_${Date.now().toString(36)}_${crypto.randomUUID()}`;
}

function cancelledError(message = 'Cancelled'): Error {
  const error = new Error(message);
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
  const response = await chrome.runtime.sendMessage(message) as { ok?: boolean; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error ?? 'Pipeline coordinator rejected cancellation');
}

/** Request durable cancellation of a job observed from any dashboard tab. */
export async function requestPipelineJobCancellation(
  requestId: string,
  reason = 'user-cancelled'
): Promise<void> {
  await cancelOffscreenRequest(requestId, reason);
}

/**
 * Resume a durable job and observe it through the same progress/completion
 * channel used by a newly submitted job. The listener is installed before the
 * Resume message so a fast first progress event cannot be missed.
 */
export async function resumePipelineJobOnOffscreen(
  requestId: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: BatchDigestProgress) => void;
  } = {}
): Promise<PipelineOffscreenDoneEvent> {
  if (options.signal?.aborted) throw cancelledError();
  const aiSettings = await loadAISettings();
  if (options.signal?.aborted) throw cancelledError();

  return new Promise((resolve, reject) => {
    let settled = false;
    let cancelTimer: number | undefined;
    const cleanup = () => {
      if (cancelTimer != null) window.clearTimeout(cancelTimer);
      chrome.runtime.onMessage.removeListener(onMessage);
      options.signal?.removeEventListener('abort', onAbort);
      setPipelineClientJobActive(false);
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
        options.onProgress?.(event.progress);
        return;
      }
      if (event.type !== 'pipeline-offscreen-done') return;
      if (!event.ok) {
        finish(() => reject(
          options.signal?.aborted ? cancelledError(event.error) : new Error(event.error ?? 'Pipeline failed')
        ));
        return;
      }
      finish(() => resolve(event));
    };
    const onAbort = () => {
      void cancelOffscreenRequest(requestId, options.signal?.reason).catch(() => {});
      cancelTimer = window.setTimeout(() => {
        finish(() => reject(new Error('Cancellation could not be confirmed by the coordinator')));
      }, CANCEL_TIMEOUT_MS);
    };

    setPipelineClientJobActive(true);
    chrome.runtime.onMessage.addListener(onMessage);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const message: PipelineOffscreenResume = {
      target: PIPELINE_OFFSCREEN_TARGET,
      action: 'resume',
      requestId,
      aiSettings,
    };
    void chrome.runtime.sendMessage(message)
      .then((response: { ok?: boolean; error?: string } | undefined) => {
        if (!response?.ok) {
          finish(() => reject(new Error(response?.error ?? 'Pipeline coordinator rejected Resume')));
          return;
        }
        if (options.signal?.aborted) {
          void cancelOffscreenRequest(requestId, options.signal.reason).catch(() => {});
        }
      })
      .catch((error) => finish(() => reject(
        error instanceof Error ? error : new Error(String(error))
      )));
  });
}

async function runJob(
  itemIds: string[],
  options: OffscreenPipelineJobOptions & {
    signal?: AbortSignal;
    onProgress?: (progress: BatchDigestProgress) => void;
  },
  operation: PipelineJobOperation = 'full_digest'
): Promise<PipelineOffscreenDoneEvent> {
  if (options.signal?.aborted) throw cancelledError();
  const requestId = createRequestId();
  const { signal, onProgress, aiSettings: suppliedAISettings, ...durableOptions } = options;
  // AI settings are sent only in the in-extension submission message. The host
  // deliberately omits them from the durable job payload so the API key never
  // lands in pipeline_jobs.
  const aiSettings = suppliedAISettings ?? await loadAISettings();
  const wireOptions = { ...durableOptions, aiSettings };
  onProgress?.({
    phase: 'prep',
    label: 'Submitting durable pipeline…',
    current: 0,
    total: Math.max(itemIds.length, 1),
  });
  setPipelineClientJobActive(true);

  return new Promise((resolve, reject) => {
    let settled = false;
    let cancelRequested = false;
    let cancelTimer: number | undefined;
    const startTimer = window.setTimeout(() => {
      void cancelOffscreenRequest(requestId).catch(() => {});
      finish(() => reject(new Error('Pipeline coordinator did not accept the job within 30 seconds')));
    }, START_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(startTimer);
      if (cancelTimer != null) window.clearTimeout(cancelTimer);
      chrome.runtime.onMessage.removeListener(onMessage);
      signal?.removeEventListener('abort', onAbort);
      setPipelineClientJobActive(false);
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
      if (!event.ok) {
        finish(() => reject(
          signal?.aborted ? cancelledError(event.error) : new Error(event.error ?? 'Pipeline failed')
        ));
        return;
      }
      finish(() => resolve(event));
    };
    const onAbort = () => {
      cancelRequested = true;
      void cancelOffscreenRequest(requestId, signal?.reason).catch(() => {});
      cancelTimer = window.setTimeout(() => {
        finish(() => reject(new Error('Cancellation could not be confirmed by the coordinator')));
      }, CANCEL_TIMEOUT_MS);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });
    const message: PipelineOffscreenStartJob = {
      target: PIPELINE_OFFSCREEN_TARGET,
      action: 'start-job',
      requestId,
      itemIds,
      options: wireOptions,
      operation,
    };
    void chrome.runtime.sendMessage(message)
      .then((response: PipelineOffscreenStartResponse | undefined) => {
        if (settled) return;
        if (!response?.ok) {
          finish(() => reject(new Error(response?.error ?? 'Pipeline coordinator unavailable')));
          return;
        }
        window.clearTimeout(startTimer);
        if (cancelRequested || signal?.aborted) {
          void cancelOffscreenRequest(requestId, signal?.reason).catch(() => {});
        }
      })
      .catch((error) => finish(() => reject(
        error instanceof Error ? error : new Error(String(error))
      )));
  });
}

export async function runPipelineActionOnOffscreen(
  operation: Exclude<PipelineJobOperation, 'full_digest'>,
  itemIds: string[],
  options: OffscreenPipelineJobOptions & {
    signal?: AbortSignal;
    onProgress?: (progress: BatchDigestProgress) => void;
  } = {}
): Promise<BatchDigestResult> {
  const done = await runJob(itemIds, options, operation);
  if (!done.result) throw new Error('Pipeline completed without a result');
  return done.result;
}

export async function runBatchOnOffscreen(
  itemIds: string[],
  options: OffscreenBatchJobOptions & {
    signal?: AbortSignal;
    onProgress?: (progress: BatchDigestProgress) => void;
  }
): Promise<BatchDigestResult> {
  const operation: PipelineJobOperation = options.enrich === false && options.classify !== false
    ? 'classify'
    : 'full_digest';
  const done = await runJob(itemIds, options, operation);
  if (!done.result) throw new Error('Pipeline completed without a batch result');
  return done.result;
}

export async function runSingleOnOffscreen(
  itemId: string,
  options: OffscreenSingleJobOptions & {
    signal?: AbortSignal;
    onProgress?: (progress: BatchDigestProgress) => void;
  } = {}
): Promise<SingleLinkDigestResult> {
  const done = await runJob([itemId], options);
  if (!done.singleResult) throw new Error('Pipeline completed without a single-item result');
  return done.singleResult;
}
