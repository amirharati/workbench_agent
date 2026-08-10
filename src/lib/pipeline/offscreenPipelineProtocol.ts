/**
 * Dashboard <-> offscreen pipeline messages.
 * Pipeline jobs run in one serialized offscreen execution lane. Dashboard tabs
 * submit, cancel, and observe; they never execute enrichment work themselves.
 */

import type { AISettings } from '../ai/types';
import type { BatchDigestProgress, BatchDigestResult } from './batchDigest';
import type { SingleLinkDigestResult } from './singleLinkDigest';
import type { PipelineCacheSeed } from '../storage/dbClient/remoteStore';

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
  skipAi?: boolean;
  forceReclassify?: boolean;
  skipDiscover?: boolean;
  drainPendingClassifyQueue?: boolean;
  useScopedWave?: boolean;
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
  aiSettings?: AISettings;
};

export type PipelineOffscreenStartBatch = {
  target: typeof PIPELINE_OFFSCREEN_TARGET | typeof PIPELINE_OFFSCREEN_OWNER;
  action: 'start-batch';
  requestId: string;
  itemIds: string[];
  options: OffscreenBatchJobOptions;
  cacheSeed: PipelineCacheSeed;
};

export type PipelineOffscreenStartSingle = {
  target: typeof PIPELINE_OFFSCREEN_TARGET | typeof PIPELINE_OFFSCREEN_OWNER;
  action: 'start-single';
  requestId: string;
  itemId: string;
  options: OffscreenSingleJobOptions;
};

export type PipelineOffscreenCancel = {
  target: typeof PIPELINE_OFFSCREEN_TARGET | typeof PIPELINE_OFFSCREEN_OWNER;
  action: 'cancel';
  requestId: string;
  reason?: string;
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
