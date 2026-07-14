/**
 * Pipeline job runner from the UI.
 *
 * Model:
 * - Digests run where the in-memory library cache is already warm (dashboard).
 * - Writes patch memory immediately; SQLite drain is a separate priority queue
 *   (high = save/UI/single, low = bulk). Jobs do not wait on disk.
 *
 * Offscreen was tried for CPU isolation, but it cold-hydrates the whole library
 * first and looks "stuck". Keep protocol/host for later; this path is the live one.
 */
import { loadAISettings } from '../ai/settings';
import { runWithDbPriority } from '../storage/dbRpcPriority';
import { runBatchDigest, type BatchDigestProgress, type BatchDigestResult } from './batchDigest';
import {
  isFullPipelineBatch,
  runPipelineScopeBatch,
  scopedProgressToItemProgress,
} from './pipelineScopeRun';
import type { SingleLinkDigestResult } from './singleLinkDigest';
import { runSingleLinkDigest } from './singleLinkDigest';
import type { OffscreenBatchJobOptions, OffscreenSingleJobOptions } from './offscreenPipelineProtocol';

function runBatchLocally(
  itemIds: string[],
  options: OffscreenBatchJobOptions & {
    signal?: AbortSignal;
    onProgress?: (p: BatchDigestProgress) => void;
  }
): Promise<BatchDigestResult> {
  const useScoped =
    options.useScopedWave === true ||
    (options.useScopedWave !== false && isFullPipelineBatch(options) && itemIds.length > 1);

  if (useScoped) {
    return runPipelineScopeBatch(itemIds, {
      signal: options.signal,
      forceEnrich: options.forceEnrich,
      forceReclassify: options.forceReclassify,
      refetchCompare: options.refetchCompare,
      collectItemResults: options.collectItemResults,
      writeJobFile: true,
      onProgress: (p) =>
        options.onProgress?.(scopedProgressToItemProgress(p, itemIds.length)),
    });
  }

  return runBatchDigest(itemIds, {
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
    signal: options.signal,
    onProgress: options.onProgress,
  });
}

/** Bulk digest — memory-first; DB persistence drains at low priority. */
export async function runBatchOnOffscreen(
  itemIds: string[],
  options: OffscreenBatchJobOptions & {
    signal?: AbortSignal;
    onProgress?: (p: BatchDigestProgress) => void;
  }
): Promise<BatchDigestResult> {
  if (!options.aiSettings) {
    try {
      await loadAISettings();
    } catch {
      /* ignore */
    }
  }
  return runWithDbPriority('low', () => runBatchLocally(itemIds, options));
}

/** Single digest — memory-first; DB persistence drains at high priority. */
export async function runSingleOnOffscreen(
  itemId: string,
  options: OffscreenSingleJobOptions & {
    signal?: AbortSignal;
    onProgress?: (p: BatchDigestProgress) => void;
  } = {}
): Promise<SingleLinkDigestResult> {
  if (!options.aiSettings) {
    try {
      await loadAISettings();
    } catch {
      /* ignore */
    }
  }
  return runWithDbPriority('high', () =>
    runSingleLinkDigest(itemId, {
      forceEnrich: options.forceEnrich,
      skipClassify: options.skipClassify,
      skipAi: options.skipAi,
      forceReclassify: options.forceReclassify,
      preferTabSession: options.preferTabSession,
      tabId: options.tabId,
      tabSessionOnly: options.tabSessionOnly,
      signal: options.signal,
      onProgress: options.onProgress,
    })
  );
}
