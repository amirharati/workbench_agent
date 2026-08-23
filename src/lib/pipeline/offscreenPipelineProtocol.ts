/**
 * Dashboard <-> offscreen pipeline messages.
 * Pipeline jobs run in one serialized offscreen execution lane. Dashboard tabs
 * submit, cancel, and observe; they never execute enrichment work themselves.
 */

import type { AISettings } from '../ai/types';
import type { FetchEngine } from '../acquisition/types';
import { MIN_DISCOVER_POOL } from '../categorization/discoverPolicy';
import type { BatchDigestProgress, BatchDigestResult } from './batchDigest';
import type { SingleLinkDigestResult } from './singleLinkDigest';

export const PIPELINE_OFFSCREEN_TARGET = 'pipeline-offscreen';
export const PIPELINE_OFFSCREEN_OWNER = 'pipeline-offscreen-owner';

export type OffscreenBatchJobOptions = {
  /** Pinned when the durable job is submitted; resumes never re-read Settings. */
  fetchEngine?: FetchEngine;
  enrich?: boolean;
  classify?: boolean;
  maxEnrich?: number;
  maxClassify?: number;
  processAll?: boolean;
  collectItemResults?: boolean;
  refetchCompare?: boolean;
  forceEnrich?: boolean;
  forceReextract?: boolean;
  skipAi?: boolean;
  forceReclassify?: boolean;
  retryManualReview?: boolean;
  discoverItemIds?: string[];
  discoverStuckOnly?: boolean;
  discoverMaxBatches?: number;
  skipDiscover?: boolean;
  drainPendingClassifyQueue?: boolean;
  useScopedWave?: boolean;
  /** Ephemeral submission-only settings; the host never persists this in the job payload. */
  aiSettings?: AISettings;
};

export type OffscreenSingleJobOptions = {
  forceEnrich?: boolean;
  skipClassify?: boolean;
  skipAi?: boolean;
  forceReclassify?: boolean;
  preferTabSession?: boolean;
  tabId?: number;
  tabSessionOnly?: boolean;
  /** Runtime placement for temporary browser-fetch tabs. */
  browserOwnerTabId?: number;
  browserWindowId?: number;
  /** Ephemeral submission-only settings; the host never persists this in the job payload. */
  aiSettings?: AISettings;
};

export type OffscreenPipelineJobOptions = OffscreenBatchJobOptions & OffscreenSingleJobOptions;
export type PipelineJobOperation =
  | 'full_digest'
  | 'reextract'
  | 'reembed'
  | 'classify'
  | 'discover';

/**
 * Pin the execution scope and discovery policy that must survive coordinator
 * reloads. Batches large enough to support discovery use their exact submitted
 * scope. Smaller jobs consult the global stuck pool and preserve its minimum,
 * so one link cannot manufacture a one-item taxonomy leaf.
 */
export function normalizePipelineExecutionOptions(
  operation: PipelineJobOperation,
  itemIds: string[],
  options: OffscreenPipelineJobOptions
): OffscreenPipelineJobOptions {
  const scopedItemIds = [...new Set(itemIds.filter(Boolean))];
  if (operation === 'discover') {
    return {
      ...options,
      discoverItemIds: scopedItemIds,
    };
  }
  if (operation === 'full_digest' && options.skipDiscover !== true) {
    if (scopedItemIds.length < MIN_DISCOVER_POOL) {
      return {
        ...options,
        // An empty explicit list tells the runner to use the global pending
        // pool. discoverBatch then enforces MIN_DISCOVER_POOL before any AI call.
        discoverItemIds: [],
        discoverStuckOnly: true,
      };
    }
    return {
      ...options,
      discoverItemIds: scopedItemIds,
      discoverStuckOnly: options.discoverStuckOnly ?? false,
    };
  }
  return { ...options };
}

export type PipelineOffscreenStartJob = {
  target: typeof PIPELINE_OFFSCREEN_TARGET | typeof PIPELINE_OFFSCREEN_OWNER;
  action: 'start-job';
  requestId: string;
  itemIds: string[];
  options: OffscreenPipelineJobOptions;
  operation?: PipelineJobOperation;
};

export type PipelineOffscreenCancel = {
  target: typeof PIPELINE_OFFSCREEN_TARGET | typeof PIPELINE_OFFSCREEN_OWNER;
  action: 'cancel';
  requestId: string;
  reason?: string;
};

export type PipelineOffscreenPause = {
  target: typeof PIPELINE_OFFSCREEN_TARGET | typeof PIPELINE_OFFSCREEN_OWNER;
  action: 'pause';
  requestId: string;
  reason?: string;
};

export type PipelineOffscreenResume = {
  target: typeof PIPELINE_OFFSCREEN_TARGET | typeof PIPELINE_OFFSCREEN_OWNER;
  action: 'resume';
  requestId: string;
  /** Filled by the service worker from the dashboard that requested Resume. */
  browserOwnerTabId?: number;
  browserWindowId?: number;
  /** Ephemeral Resume handoff; never merged into the durable payload. */
  aiSettings?: AISettings;
};

export type PipelineOffscreenProgressEvent = {
  type: 'pipeline-offscreen-progress';
  requestId: string;
  progress: BatchDigestProgress;
};

export type PipelineOffscreenDoneEvent = {
  type: 'pipeline-offscreen-done';
  requestId: string;
  ok: boolean;
  result?: BatchDigestResult;
  singleResult?: SingleLinkDigestResult;
  error?: string;
};

export type PipelineOffscreenStartResponse =
  | { ok: true; requestId: string }
  | { ok: false; error: string };
