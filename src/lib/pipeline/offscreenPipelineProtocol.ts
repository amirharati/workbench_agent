/**
 * Dashboard <-> offscreen pipeline messages.
 * Pipeline jobs run in one serialized offscreen execution lane. Dashboard tabs
 * submit, cancel, and observe; they never execute enrichment work themselves.
 */

import type { AISettings } from '../ai/types';
import type { BatchDigestProgress, BatchDigestResult } from './batchDigest';
import type { SingleLinkDigestResult } from './singleLinkDigest';

export const PIPELINE_OFFSCREEN_TARGET = 'pipeline-offscreen';
export const PIPELINE_OFFSCREEN_OWNER = 'pipeline-offscreen-owner';

export type OffscreenBatchJobOptions = {
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
