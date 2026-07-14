/**
 * Offscreen pipeline host — bulk + singles run here (separate from dashboard UI).
 * Uses local DB transport (set in offscreen.ts) so db-rpc does not deadlock.
 *
 * Priority: bulk DB RPCs are low; singles are high. Work stays queued in memory —
 * we never soft-pause/abort bulk just to run a single.
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
import { runSingleLinkDigest, type SingleLinkDigestResult } from './singleLinkDigest';
import {
  PIPELINE_OFFSCREEN_OWNER,
  type PipelineOffscreenCancel,
  type PipelineOffscreenDoneEvent,
  type PipelineOffscreenProgressEvent,
  type PipelineOffscreenStartBatch,
  type PipelineOffscreenStartResponse,
  type PipelineOffscreenStartSingle,
} from './offscreenPipelineProtocol';

const controllers = new Map<string, AbortController>();
/** Serialize singles relative to each other; bulk may run alongside. */
let singleTail: Promise<void> = Promise.resolve();
/** Keep AI override while any offscreen job is using injected settings. */
let settingsHoldCount = 0;

function holdAiSettings(settings: AISettings | undefined): void {
  if (!settings) return;
  setAISettingsOverride(settings);
  settingsHoldCount += 1;
}

function releaseAiSettings(): void {
  settingsHoldCount = Math.max(0, settingsHoldCount - 1);
  if (settingsHoldCount === 0) setAISettingsOverride(null);
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

async function runBatchJob(message: PipelineOffscreenStartBatch): Promise<BatchDigestResult> {
  const { requestId, itemIds, options } = message;
  const controller = new AbortController();
  controllers.set(requestId, controller);
  holdAiSettings(options.aiSettings);
  try {
    return await runWithDbPriority('low', async () => {
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
    controllers.delete(requestId);
    releaseAiSettings();
  }
}

async function runSingleJob(
  message: PipelineOffscreenStartSingle
): Promise<SingleLinkDigestResult> {
  const { requestId, itemId, options } = message;
  const controller = new AbortController();
  controllers.set(requestId, controller);
  holdAiSettings(options.aiSettings);
  try {
    return await runWithDbPriority('high', async () => {
      broadcastProgress(requestId, {
        phase: 'prep',
        label: 'Starting digest…',
        current: 0,
        total: 100,
      });
      return await runSingleLinkDigest(itemId, {
        forceEnrich: options.forceEnrich,
        skipClassify: options.skipClassify,
        skipAi: options.skipAi,
        forceReclassify: options.forceReclassify,
        preferTabSession: options.preferTabSession,
        tabId: options.tabId,
        tabSessionOnly: options.tabSessionOnly,
        signal: controller.signal,
        onProgress: (p) => broadcastProgress(requestId, p),
      });
    });
  } finally {
    controllers.delete(requestId);
    releaseAiSettings();
  }
}

export function installOffscreenPipelineHost(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== PIPELINE_OFFSCREEN_OWNER) return false;

    if (message.action === 'cancel') {
      const cancel = message as PipelineOffscreenCancel;
      controllers.get(cancel.requestId)?.abort();
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'start-single') {
      const start = message as PipelineOffscreenStartSingle;
      if (!start.requestId || typeof start.itemId !== 'string') {
        sendResponse({
          ok: false,
          error: 'Invalid start-single payload',
        } satisfies PipelineOffscreenStartResponse);
        return false;
      }
      sendResponse({
        ok: true,
        requestId: start.requestId,
      } satisfies PipelineOffscreenStartResponse);

      const run = () =>
        runSingleJob(start)
          .then((singleResult) => {
            broadcastDone({
              type: 'pipeline-offscreen-done',
              requestId: start.requestId,
              ok: true,
              singleResult,
            });
          })
          .catch((e) => {
            broadcastDone({
              type: 'pipeline-offscreen-done',
              requestId: start.requestId,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          });

      singleTail = singleTail.then(run, run);
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
    if (!start.requestId || !Array.isArray(start.itemIds)) {
      sendResponse({
        ok: false,
        error: 'Invalid start-batch payload',
      } satisfies PipelineOffscreenStartResponse);
      return false;
    }

    sendResponse({ ok: true, requestId: start.requestId } satisfies PipelineOffscreenStartResponse);
    broadcastProgress(start.requestId, {
      phase: 'prep',
      label: `Preparing ${start.itemIds.length.toLocaleString()} links…`,
      current: 0,
      total: Math.max(start.itemIds.length, 1),
    });

    void runBatchJob(start)
      .then((result) => {
        broadcastDone({
          type: 'pipeline-offscreen-done',
          requestId: start.requestId,
          ok: true,
          result: lightBatchResult(result),
        });
      })
      .catch((e) => {
        broadcastDone({
          type: 'pipeline-offscreen-done',
          requestId: start.requestId,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      });

    return false;
  });

  console.log('[pipeline] Offscreen host ready (bulk + singles, DB priority)');
}
