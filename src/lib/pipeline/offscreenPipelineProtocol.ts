/**
 * Dashboard ↔ offscreen pipeline messages.
 * Singles run on offscreen (parallel with in-page bulk). Bulk stays in-page for now.
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
