/**
 * Offscreen pipeline host — serialized bulk work runs here, outside dashboard UI.
 * Uses local DB transport (set in offscreen.ts) so db-rpc does not deadlock.
 *
 * Bulk DB RPCs are low priority. Singles run in their invoking page's separate
 * high-priority realm, so they never wait in this queue.
 */
import { setAISettingsOverride } from '../ai/settings';
import type { AISettings } from '../ai/types';
import { runWithDbPriority } from '../storage/dbRpcPriority';
import { runBatchDigest, type BatchDigestResult } from './batchDigest';
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
  type PipelineOffscreenStartResponse,
} from './offscreenPipelineProtocol';

const controllers = new Map<string, AbortController>();
const queuedBatchKeys = new Set<string>();
let batchTail: Promise<void> = Promise.resolve();
let queuedBatchCount = 0;

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

export function installOffscreenPipelineHost(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== PIPELINE_OFFSCREEN_OWNER) return false;

    if (message.action === 'cancel') {
      const cancel = message as PipelineOffscreenCancel;
      controllers.get(cancel.requestId)?.abort(cancel.reason);
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'start-single') {
      sendResponse({
        ok: false,
        error: 'Single digests run in the invoking page lane',
      } satisfies PipelineOffscreenStartResponse);
      return false;
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
    const position = queuedBatchCount;
    queuedBatchCount += 1;
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
        queuedBatchCount = Math.max(0, queuedBatchCount - 1);
      }
    };

    batchTail = batchTail.then(run, run);

    return false;
  });

  console.log('[pipeline] Offscreen host ready (serialized bulk, low-priority DB drain)');
}
