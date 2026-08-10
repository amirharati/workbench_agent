/**
 * Offscreen pipeline host — all pipeline work shares one serialized lane,
 * outside dashboard UI.
 * Uses local DB transport (set in offscreen.ts) so db-rpc does not deadlock.
 *
 * Bulk DB RPCs are low priority. User-requested singles use high-priority DB
 * calls, but still wait in this same execution lane.
 */
import { setAISettingsOverride } from '../ai/settings';
import type { AISettings } from '../ai/types';
import { dbRpc } from '../storage/dbClient';
import { runWithDbPriority } from '../storage/dbRpcPriority';
import type {
  ClaimedPipelineTask,
  PipelineJobSnapshot,
  SubmitPipelineJobInput,
} from '../storage/dbWorker/pipelineJobStore';
import { runBatchDigest, type BatchDigestResult } from './batchDigest';
import { runSingleLinkDigest, type SingleLinkDigestResult } from './singleLinkDigest';
import {
  isFullPipelineBatch,
  runPipelineScopeBatch,
  scopedProgressToItemProgress,
} from './pipelineScopeRun';
import {
  PIPELINE_OFFSCREEN_OWNER,
  type PipelineOffscreenCancel,
  type PipelineOffscreenDoneEvent,
  type PipelineOffscreenProgressEvent,
  type PipelineOffscreenStartBatch,
  type PipelineOffscreenStartSingle,
  type PipelineOffscreenStartResponse,
} from './offscreenPipelineProtocol';

const controllers = new Map<string, AbortController>();
const queuedBatchKeys = new Set<string>();
let pipelineTail: Promise<void> = Promise.resolve();
let queuedJobCount = 0;
const SINGLE_LEASE_MS = 45_000;
const SINGLE_HEARTBEAT_MS = 10_000;
const singleOwnerId = `offscreen-single:${crypto.randomUUID()}`;

function batchKey(message: PipelineOffscreenStartBatch): string {
  return [...new Set(message.itemIds)].sort().join('\u0000');
}

function holdAiSettings(settings: AISettings | undefined): void {
  if (!settings) return;
  setAISettingsOverride(settings);
}

function releaseAiSettings(): void {
  setAISettingsOverride(null);
}

function broadcastProgress(
  requestId: string,
  progress: PipelineOffscreenProgressEvent['progress']
): void {
  const msg: PipelineOffscreenProgressEvent = {
    type: 'pipeline-offscreen-progress',
    requestId,
    progress,
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function broadcastDone(event: PipelineOffscreenDoneEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {});
}

/** Avoid Chrome message size limits on large Hub batches. */
function lightBatchResult(result: BatchDigestResult): BatchDigestResult {
  const rows = result.itemEnrichResults;
  if (!rows || rows.length <= 40) return result;
  return {
    ...result,
    itemEnrichResults: rows.slice(0, 40),
  };
}

async function runBatchJob(
  message: PipelineOffscreenStartBatch,
  controller: AbortController
): Promise<BatchDigestResult> {
  const { requestId, itemIds, options } = message;
  holdAiSettings(options.aiSettings);
  try {
    return await runWithDbPriority('low', async () => {
      broadcastProgress(requestId, {
        phase: 'prep',
        label: 'Starting bulk pipeline…',
        current: 0,
        total: Math.max(itemIds.length, 1),
      });
      const { installPipelineCacheSeed } = await import('../db');
      installPipelineCacheSeed(message.cacheSeed);
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const useScoped =
        options.useScopedWave === true ||
        (options.useScopedWave !== false &&
          isFullPipelineBatch(options) &&
          itemIds.length > 1);
      if (useScoped) {
        return await runPipelineScopeBatch(itemIds, {
          signal: controller.signal,
          forceEnrich: options.forceEnrich,
          forceReclassify: options.forceReclassify,
          refetchCompare: options.refetchCompare,
          collectItemResults: options.collectItemResults,
          writeJobFile: true,
          onProgress: (p) =>
            broadcastProgress(requestId, scopedProgressToItemProgress(p, itemIds.length)),
        });
      }
      return await runBatchDigest(itemIds, {
        enrich: options.enrich,
        classify: options.classify,
        maxEnrich: options.maxEnrich,
        maxClassify: options.maxClassify,
        processAll: options.processAll,
        collectItemResults: options.collectItemResults,
        refetchCompare: options.refetchCompare,
        forceEnrich: options.forceEnrich,
        skipAi: options.skipAi,
        forceReclassify: options.forceReclassify,
        skipDiscover: options.skipDiscover,
        drainPendingClassifyQueue: options.drainPendingClassifyQueue,
        signal: controller.signal,
        onProgress: (p) => broadcastProgress(requestId, p),
      });
    });
  } finally {
    releaseAiSettings();
  }
}

async function runSingleJob(
  message: PipelineOffscreenStartSingle,
  controller: AbortController
): Promise<SingleLinkDigestResult> {
  const { requestId, itemId, options } = message;
  const claim = await dbRpc<ClaimedPipelineTask | null>(
    'pipelineClaimNextTask',
    [singleOwnerId, SINGLE_LEASE_MS, Date.now(), requestId],
    { priority: 'high' }
  );
  if (!claim) {
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new Error('Durable pipeline task was not available to claim');
  }

  let heartbeat: number | undefined;
  const leaseInput = {
    jobId: requestId,
    itemId,
    stage: claim.task.stage,
    ownerId: singleOwnerId,
    jobLeaseEpoch: claim.jobLeaseEpoch,
    taskLeaseEpoch: claim.taskLeaseEpoch,
  };
  holdAiSettings(options.aiSettings);
  try {
    heartbeat = window.setInterval(() => {
      void dbRpc<{ accepted: boolean; cancelRequested: boolean }>(
        'pipelineHeartbeatTask',
        [{ ...leaseInput, leaseMs: SINGLE_LEASE_MS }],
        { priority: 'high' }
      ).then((result) => {
        if (result.cancelRequested || !result.accepted) {
          controller.abort('Durable pipeline lease ended');
        }
      }).catch(() => {
        // A transient owner restart remains covered by the current lease.
      });
    }, SINGLE_HEARTBEAT_MS);

    return await runWithDbPriority('high', async () => {
      broadcastProgress(requestId, {
        phase: 'prep',
        label: 'Loading bookmark state…',
        current: 0,
        total: 1,
      });
      const { getRemoteStore } = await import('../storage/dbClient/remoteStore');
      const { installPipelineCacheSeed } = await import('../db');
      const seed = await getRemoteStore().createPipelineCacheSeed([itemId]);
      installPipelineCacheSeed(seed);
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');

      const result = await runSingleLinkDigest(itemId, {
        forceEnrich: options.forceEnrich,
        skipClassify: options.skipClassify,
        skipAi: options.skipAi,
        forceReclassify: options.forceReclassify,
        preferTabSession: options.preferTabSession,
        tabId: options.tabId,
        tabSessionOnly: options.tabSessionOnly,
        signal: controller.signal,
        onProgress: (progress) => broadcastProgress(requestId, progress),
      });

      const finished = await dbRpc<{ accepted: boolean; snapshot: PipelineJobSnapshot | null }>(
        'pipelineFinishTask',
        [{ ...leaseInput, outcome: 'completed', resultRef: `item:${itemId}` }],
        { priority: 'high' }
      );
      if (!finished.accepted) {
        throw new Error('Pipeline result was produced after its durable lease ended');
      }
      return result;
    });
  } catch (error) {
    const cancelled =
      controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    if (cancelled) {
      await dbRpc('pipelineAcknowledgeCancel', [requestId], { priority: 'high' });
      throw new DOMException('Cancelled', 'AbortError');
    }
    await dbRpc(
      'pipelineFinishTask',
      [{
        ...leaseInput,
        outcome: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }],
      { priority: 'high' }
    );
    throw error;
  } finally {
    if (heartbeat != null) window.clearInterval(heartbeat);
    releaseAiSettings();
  }
}

async function acceptSingleJob(
  start: PipelineOffscreenStartSingle
): Promise<{ accepted: true } | { accepted: false; error: string }> {
  const input: SubmitPipelineJobInput = {
    id: start.requestId,
    dedupeKey: `full-digest:${start.itemId}`,
    action: 'full_digest',
    source: 'enrichment_hub',
    priority: 10,
    // AI settings (especially the API key) deliberately remain in memory only.
    payload: {
      forceEnrich: start.options.forceEnrich,
      skipClassify: start.options.skipClassify,
      skipAi: start.options.skipAi,
      forceReclassify: start.options.forceReclassify,
    },
    itemIds: [start.itemId],
    // Transitional vertical slice: the processor is still monolithic. One
    // honest, non-auto-retriable task is safer than false stage checkpoints.
    stages: ['full_digest'],
  };
  const submitted = await dbRpc<{ accepted: boolean; snapshot: PipelineJobSnapshot }>(
    'pipelineSubmitJob',
    [input],
    { priority: 'high' }
  );
  if (!submitted.accepted) {
    return { accepted: false, error: 'This bookmark already has a queued or running digest' };
  }
  return { accepted: true };
}

export function installOffscreenPipelineHost(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== PIPELINE_OFFSCREEN_OWNER) return false;

    if (message.action === 'cancel') {
      const cancel = message as PipelineOffscreenCancel;
      // Acknowledge the UI only after cancellation has reached durable state.
      void dbRpc('pipelineRequestCancel', [cancel.requestId], { priority: 'high' })
        .then(() => {
          controllers.get(cancel.requestId)?.abort(cancel.reason);
          sendResponse({ ok: true });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.action === 'start-single') {
      const start = message as PipelineOffscreenStartSingle;
      if (!start.requestId || !start.itemId) {
        sendResponse({
          ok: false,
          error: 'Invalid start-single payload',
        } satisfies PipelineOffscreenStartResponse);
        return false;
      }
      if (controllers.has(start.requestId)) {
        sendResponse({
          ok: false,
          error: 'This digest is already queued or running',
        } satisfies PipelineOffscreenStartResponse);
        return false;
      }

      void acceptSingleJob(start)
        .then((accepted) => {
          if (!accepted.accepted) {
            sendResponse({
              ok: false,
              error: accepted.error,
            } satisfies PipelineOffscreenStartResponse);
            return;
          }

          const controller = new AbortController();
          controllers.set(start.requestId, controller);
          const position = queuedJobCount;
          queuedJobCount += 1;
          if (position > 0) {
            broadcastProgress(start.requestId, {
              phase: 'prep',
              label: `Queued behind ${position.toLocaleString()} pipeline job${position === 1 ? '' : 's'}…`,
              current: 0,
              total: 1,
            });
          }

          const run = async () => {
            try {
              if (controller.signal.aborted) {
                await dbRpc('pipelineAcknowledgeCancel', [start.requestId], { priority: 'high' });
                throw new DOMException('Cancelled', 'AbortError');
              }
              const result = await runSingleJob(start, controller);
              broadcastDone({
                type: 'pipeline-offscreen-done',
                requestId: start.requestId,
                ok: true,
                singleResult: result,
              });
            } catch (error) {
              broadcastDone({
                type: 'pipeline-offscreen-done',
                requestId: start.requestId,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
            } finally {
              controllers.delete(start.requestId);
              queuedJobCount = Math.max(0, queuedJobCount - 1);
            }
          };
          pipelineTail = pipelineTail.then(run, run);
          sendResponse({
            ok: true,
            requestId: start.requestId,
          } satisfies PipelineOffscreenStartResponse);
        })
        .catch((error) => sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies PipelineOffscreenStartResponse));
      return true;
    }

    if (message.action !== 'start-batch') {
      sendResponse({
        ok: false,
        error: 'Unknown pipeline action',
      } satisfies PipelineOffscreenStartResponse);
      return false;
    }

    const start = message as PipelineOffscreenStartBatch;
    if (!start.requestId || !Array.isArray(start.itemIds) || !start.cacheSeed) {
      sendResponse({
        ok: false,
        error: 'Invalid start-batch payload',
      } satisfies PipelineOffscreenStartResponse);
      return false;
    }

    const key = batchKey(start);
    if (queuedBatchKeys.has(key)) {
      sendResponse({
        ok: false,
        error: 'This bulk scope is already queued or running',
      } satisfies PipelineOffscreenStartResponse);
      return false;
    }

    sendResponse({ ok: true, requestId: start.requestId } satisfies PipelineOffscreenStartResponse);
    queuedBatchKeys.add(key);
    const controller = new AbortController();
    controllers.set(start.requestId, controller);
    const position = queuedJobCount;
    queuedJobCount += 1;
    if (position > 0) {
      broadcastProgress(start.requestId, {
        phase: 'prep',
        label: `Queued behind ${position.toLocaleString()} bulk job${position === 1 ? '' : 's'}…`,
        current: 0,
        total: Math.max(start.itemIds.length, 1),
      });
    }

    const run = async () => {
      try {
        if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const result = await runBatchJob(start, controller);
        broadcastDone({
          type: 'pipeline-offscreen-done',
          requestId: start.requestId,
          ok: true,
          result: lightBatchResult(result),
        });
      } catch (e) {
        broadcastDone({
          type: 'pipeline-offscreen-done',
          requestId: start.requestId,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controllers.delete(start.requestId);
        queuedBatchKeys.delete(key);
        queuedJobCount = Math.max(0, queuedJobCount - 1);
      }
    };

    pipelineTail = pipelineTail.then(run, run);

    return false;
  });

  console.log('[pipeline] Offscreen host ready (one serialized execution lane)');
}
