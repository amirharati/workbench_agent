import {
  APP_DISCOVER_MAP_BATCH_SIZE,
  classifyIncremental,
  discoverBatch,
} from '../categorization';
import { emptyTopicClassifySummary } from '../categorization/classifyPolicy';
import type { TopicClassifySummary } from '../categorization/types';
import { commitPendingDbWrites, installPipelineCacheSeed } from '../db';
import {
  embedIncrementalBatch,
  enrichOne,
  getEnrichment,
  reextractAI,
  type EnrichmentResult,
} from '../enrichment';
import { isDownstreamClassifyEligible } from './downstreamEligible';
import type { BatchDigestProgress, BatchDigestResult } from './batchDigest';
import { dbRpc } from '../storage/dbClient';
import { runWithDataChangeNotificationsSuppressed } from '../dataChangeNotifier';
import { getRemoteStore } from '../storage/dbClient/remoteStore';
import type {
  ClaimedPipelineTask,
  PipelineJobSnapshot,
} from '../storage/dbWorker/pipelineJobStore';
import type { OffscreenPipelineJobOptions } from './offscreenPipelineProtocol';
import { formatPipelineCompletionSummary } from './pipelineDictionary';
import {
  AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE,
  describeAiFailure,
} from '../enrichment/errorMessages';

export const DURABLE_FULL_DIGEST_STAGES = [
  'enrich',
  'embed',
  'classify',
  'finalize',
  // Stored as one terminal, job-scoped task rather than once per link.
  'discover',
] as const;

const LEASE_MS = 45_000;
const HEARTBEAT_MS = 10_000;

type StageOutcome = {
  outcome: 'completed' | 'skipped' | 'failed';
  resultRef?: string;
  error?: string;
};

export type DurablePipelineRunInput = {
  jobId: string;
  itemIds: string[];
  options: OffscreenPipelineJobOptions;
  ownerId: string;
  signal: AbortSignal;
  onAbortRequired?: (reason: string) => void;
  onProgress?: (progress: BatchDigestProgress) => void;
  /** Re-evaluated only after the current item reaches a terminal boundary. */
  shouldYieldAfterItem?: () => boolean;
  /** Cooperative owner-close pause, evaluated after a stage safely commits. */
  shouldPauseAfterStage?: () => boolean;
};

export type DurablePipelineRunResult = {
  snapshot: PipelineJobSnapshot;
  yielded: boolean;
  paused?: boolean;
  result?: BatchDigestResult;
};

function abortError(): DOMException {
  return new DOMException('Cancelled', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function stageLabel(stage: string, itemIndex: number, total: number): string {
  const suffix = `${itemIndex + 1}/${Math.max(total, 1)}`;
  switch (stage) {
    case 'enrich': return `Fetching & extracting… ${suffix}`;
    case 'embed': return `Building search embedding… ${suffix}`;
    case 'classify': return `Classifying… ${suffix}`;
    case 'discover': return 'Discovering taxonomy gaps…';
    case 'finalize': return `Finalizing… ${suffix}`;
    default: return `Processing… ${suffix}`;
  }
}

function progressPhase(stage: string): BatchDigestProgress['phase'] {
  if (stage === 'enrich') return 'enrich';
  if (stage === 'embed') return 'embed';
  if (stage === 'classify') return 'classify';
  if (stage === 'discover') return 'classify';
  return 'save';
}

function overallItemProgress(
  input: DurablePipelineRunInput,
  itemId: string
): Pick<BatchDigestProgress, 'overallCurrent' | 'overallTotal'> {
  const itemIndex = input.itemIds.indexOf(itemId);
  return itemIndex >= 0 && input.itemIds.length > 0
    ? { overallCurrent: itemIndex, overallTotal: input.itemIds.length }
    : {};
}

function withOverallItemLabel(
  label: string,
  input: DurablePipelineRunInput,
  itemId: string
): string {
  const itemIndex = input.itemIds.indexOf(itemId);
  return itemIndex >= 0 && input.itemIds.length > 0
    ? `${label} · Link ${itemIndex + 1}/${input.itemIds.length}`
    : label;
}

async function runStage(
  claim: ClaimedPipelineTask,
  input: DurablePipelineRunInput
): Promise<StageOutcome> {
  const itemId = claim.task.item_id;
  const { options, signal } = input;
  throwIfAborted(signal);

  switch (claim.task.stage) {
    case 'enrich': {
      const result = await enrichOne(itemId, {
        fetchEngine: options.fetchEngine,
        force: options.forceEnrich === true,
        skipAi: options.skipAi,
        deferPostProcess: true,
        signal,
        preferTabSession: options.preferTabSession,
        tabId: options.tabId,
        tabSessionOnly: options.tabSessionOnly,
        browserWindowId: options.browserWindowId,
      });
      throwIfAborted(signal);
      await commitPendingDbWrites();
      return {
        outcome: result.status === 'failed' ? 'failed' : result.skipped ? 'skipped' : 'completed',
        resultRef: `enrich:${result.status}:${result.skipped ? 'skipped' : 'processed'}`,
        error: result.status === 'failed' ? result.message ?? 'Enrichment failed' : undefined,
      };
    }

    case 'reextract': {
      const result = await reextractAI(itemId, {
        force: options.forceReextract === true,
        signal,
      });
      throwIfAborted(signal);
      await commitPendingDbWrites();
      return {
        outcome: result.status === 'failed' ? 'failed' : result.skipped ? 'skipped' : 'completed',
        resultRef: `reextract:${result.status}:${result.skipped ? 'skipped' : 'processed'}`,
        error: result.status === 'failed' ? result.message ?? 'AI extraction failed' : undefined,
      };
    }

    case 'embed': {
      if (options.skipAi) return { outcome: 'skipped', resultRef: 'embed:skip-ai' };
      const enrichment = await getEnrichment(itemId);
      if (enrichment?.aiStatus !== 'ok') {
        return { outcome: 'skipped', resultRef: 'embed:not-ai-ready' };
      }
      const summary = await embedIncrementalBatch({
        itemIds: [itemId],
        max: 1,
        force: options.forceEnrich === true || options.forceReclassify === true,
        signal,
        onProgress: (progress) => input.onProgress?.({
          phase: 'embed',
          label: withOverallItemLabel(
            progress.phase === 'write' ? 'Saving search embedding…' : 'Building search embedding…',
            input,
            itemId
          ),
          current: progress.batchIndex,
          total: Math.max(progress.batchTotal, 1),
          ...overallItemProgress(input, itemId),
        }),
      });
      throwIfAborted(signal);
      await commitPendingDbWrites();
      return {
        outcome: summary.embedFailed > 0 && summary.embedded === 0 ? 'failed' : 'completed',
        resultRef: `embed:${summary.embedded}:${summary.embedFailed}`,
        error: summary.embedFailed > 0 && summary.embedded === 0
          ? summary.aiError ?? 'Search embedding failed'
          : undefined,
      };
    }

    case 'classify': {
      if (options.skipClassify || options.classify === false || options.skipAi) {
        return { outcome: 'skipped', resultRef: 'classify:disabled' };
      }
      const enrichment = await getEnrichment(itemId);
      if (enrichment?.aiStatus === 'not_configured' || enrichment?.aiStatus === 'api_error') {
        return {
          outcome: 'skipped',
          resultRef: enrichment.aiStatus === 'not_configured'
            ? 'classify:ai-not-configured'
            : 'classify:ai-backend-unavailable',
        };
      }
      if (!isDownstreamClassifyEligible(enrichment)) {
        return { outcome: 'skipped', resultRef: 'classify:ineligible' };
      }
      const classified = await classifyIncremental({
        itemIds: [itemId],
        maxItems: 1,
        autoDiscover: false,
        forceReclassify: options.forceReclassify === true,
        retryManualReview: options.retryManualReview,
        signal,
        onProgress: (progress) => input.onProgress?.({
          phase: progress.phase === 'save' ? 'save' : 'classify',
          label: withOverallItemLabel(progress.label || 'Classifying…', input, itemId),
          current: progress.current,
          total: Math.max(progress.total, 1),
          ...overallItemProgress(input, itemId),
        }),
      });
      throwIfAborted(signal);
      await commitPendingDbWrites();
      const classifiedCount =
        classified.summary.classifiedSpecific +
        classified.summary.classifiedGeneral +
        classified.summary.classifiedRemoval;
      const aiFailed = classified.summary.llmErrors > 0 && classifiedCount === 0;
      return {
        outcome: aiFailed ? 'failed' : 'completed',
        resultRef: `classify-json:${JSON.stringify(classified.summary)}`,
        error: aiFailed
          ? classified.summary.aiError ?? 'Classification AI call failed'
          : undefined,
      };
    }

    case 'discover': {
      const aiSettings = await import('../ai/settings').then(({ loadAISettings }) => loadAISettings());
      if (!aiSettings.apiKey.trim()) {
        return { outcome: 'skipped', resultRef: 'discover:ai-not-configured' };
      }
      const discoverScope = options.discoverItemIds ?? input.itemIds;
      for (const scopedItemId of discoverScope) {
        const enrichment = await getEnrichment(scopedItemId);
        if (enrichment?.aiStatus === 'api_error') {
          return { outcome: 'skipped', resultRef: 'discover:ai-backend-unavailable' };
        }
      }
      const result = await discoverBatch({
        itemIds: options.discoverItemIds,
        stuckOnly: options.discoverStuckOnly !== false,
        maxBatches: options.discoverMaxBatches,
        sampleBatchSize: APP_DISCOVER_MAP_BATCH_SIZE,
        enforceBulkRunCap: false,
        signal,
        onProgress: (progress) => input.onProgress?.({
          phase: 'classify',
          label: progress.label || 'Discovering taxonomy gaps…',
          current: progress.current,
          total: Math.max(progress.total, 1),
        }),
      });
      throwIfAborted(signal);
      await commitPendingDbWrites();
      const aiFailed = result.llmErrors > 0 && result.newParents === 0 && result.newLeaves === 0;
      return {
        outcome: aiFailed ? 'failed' : 'completed',
        resultRef: `discover-json:${JSON.stringify(result)}`,
        error: aiFailed ? result.aiError ?? 'Taxonomy discovery AI call failed' : undefined,
      };
    }

    case 'finalize':
      throwIfAborted(signal);
      await commitPendingDbWrites();
      return { outcome: 'completed', resultRef: `item:${itemId}` };

    default:
      throw new Error(`Unknown durable pipeline stage: ${claim.task.stage}`);
  }
}

async function buildResult(snapshot: PipelineJobSnapshot): Promise<BatchDigestResult> {
  const enrichTasks = snapshot.tasks.filter(
    (task) => task.stage === 'enrich' || task.stage === 'reextract'
  );
  const classifyTasks = snapshot.tasks.filter((task) => task.stage === 'classify');
  const embedTasks = snapshot.tasks.filter((task) => task.stage === 'embed');
  const discoverTask = snapshot.tasks.find((task) => task.stage === 'discover');
  const itemEnrichResults: EnrichmentResult[] = [];
  let enriched = 0;
  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  let aiError: string | undefined;

  for (const task of enrichTasks) {
    const enrichment = await getEnrichment(task.item_id);
    const wasSkipped = task.result_ref?.endsWith(':skipped') === true;
    if (task.status === 'failed' || task.status === 'uncertain' || enrichment?.status === 'failed') {
      failed += 1;
    } else if (wasSkipped || task.status === 'skipped') {
      skipped += 1;
    } else if (enrichment?.status === 'ok' && enrichment.aiStatus !== 'ok') {
      fetched += 1;
      aiError ??= enrichment.aiStatus === 'not_configured'
        ? AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE
        : describeAiFailure(enrichment.aiStatus, enrichment.aiError);
    } else {
      enriched += 1;
    }
    itemEnrichResults.push({
      itemId: task.item_id,
      status: enrichment?.status ?? (task.status === 'failed' ? 'failed' : 'none'),
      skipped: wasSkipped,
      message: task.last_error ?? undefined,
    });
  }

  const classifySummary = emptyTopicClassifySummary();
  const mergeSummary = (next: TopicClassifySummary) => {
    for (const key of [
      'totalConsidered', 'processed', 'skippedIneligible', 'skippedHash', 'skippedLlm',
      'skippedManualReview', 'assignedPrimary', 'classifiedSpecific', 'classifiedGeneral',
      'classifiedRemoval', 'assignedSecondary', 'multiLabel', 'unassigned',
      'pendingDiscover', 'llmErrors', 'batches',
    ] as const) classifySummary[key] += next[key];
    for (const [key, value] of Object.entries(next.failureBuckets)) {
      classifySummary.failureBuckets[key] = (classifySummary.failureBuckets[key] ?? 0) + value;
    }
    classifySummary.inputQuality.high += next.inputQuality.high;
    classifySummary.inputQuality.medium += next.inputQuality.medium;
    classifySummary.inputQuality.low += next.inputQuality.low;
    classifySummary.aiError ??= next.aiError;
  };
  for (const task of classifyTasks) {
    const raw = task.result_ref?.startsWith('classify-json:')
      ? task.result_ref.slice('classify-json:'.length)
      : '';
    if (!raw) continue;
    try { mergeSummary(JSON.parse(raw) as TopicClassifySummary); } catch { /* ignore corrupt diagnostics */ }
  }
  const classified =
    classifySummary.classifiedSpecific +
    classifySummary.classifiedGeneral +
    classifySummary.classifiedRemoval;
  const classifyError = classifyTasks.find((task) => task.last_error?.trim())?.last_error?.trim()
    ?? classifySummary.aiError;
  let embedded = 0;
  let embedFailed = 0;
  let embedError: string | undefined;
  for (const task of embedTasks) {
    const match = /^embed:(\d+):(\d+)$/.exec(task.result_ref ?? '');
    if (match) {
      embedded += Number(match[1]);
      embedFailed += Number(match[2]);
    }
    if (!embedError && task.last_error?.trim()) embedError = task.last_error.trim();
  }
  const completionSummary = formatPipelineCompletionSummary({
    enriched,
    fetched,
    skipped,
    failed,
    classified,
    classifySummary,
    classifyError,
    aiError,
    compactAiNotice: snapshot.job.total_items > 1,
  });
  let discoverResult: BatchDigestResult['discoverResult'];
  const discoverJson = discoverTask?.result_ref?.startsWith('discover-json:')
    ? discoverTask.result_ref.slice('discover-json:'.length)
    : '';
  if (discoverJson) {
    try { discoverResult = JSON.parse(discoverJson) as NonNullable<BatchDigestResult['discoverResult']>; }
    catch { /* ignore corrupt diagnostics */ }
  }

  return {
    enriched,
    fetched,
    skipped,
    failed,
    classified,
    classifySummary,
    discoverResult,
    embedded,
    embedFailed,
    embedError,
    aiError,
    message: completionSummary !== 'No changes' ? completionSummary : (discoverResult
      ? `${discoverResult.itemsSampled} processed · +${discoverResult.newLeaves} topics`
      : `${snapshot.job.total_items} processed`),
    itemEnrichResults,
  };
}

export async function runDurablePipelineJob(
  input: DurablePipelineRunInput
): Promise<DurablePipelineRunResult> {
  let seededItemId: string | null = null;
  let seededDiscoverScopeKey: string | null = null;
  let finalSnapshot: PipelineJobSnapshot | null = null;
  let yieldRequested = false;

  while (true) {
    throwIfAborted(input.signal);
    const claim = await dbRpc<ClaimedPipelineTask | null>(
      'pipelineClaimNextTask',
      [input.ownerId, LEASE_MS, Date.now(), input.jobId],
      { priority: 'high' }
    );
    if (!claim) break;

    const itemIndex = Math.max(0, input.itemIds.indexOf(claim.task.item_id));
    input.onProgress?.({
      phase: progressPhase(claim.task.stage),
      label: stageLabel(claim.task.stage, itemIndex, input.itemIds.length),
      current: itemIndex,
      total: Math.max(input.itemIds.length, 1),
      overallCurrent: itemIndex,
      overallTotal: Math.max(input.itemIds.length, 1),
    });

    const leaseInput = {
      jobId: input.jobId,
      itemId: claim.task.item_id,
      stage: claim.task.stage,
      ownerId: input.ownerId,
      jobLeaseEpoch: claim.jobLeaseEpoch,
      taskLeaseEpoch: claim.taskLeaseEpoch,
    };
    const heartbeat = window.setInterval(() => {
      void dbRpc<{ accepted: boolean; cancelRequested: boolean }>(
        'pipelineHeartbeatTask',
        [{ ...leaseInput, leaseMs: LEASE_MS }],
        { priority: 'high' }
      ).then((result) => {
        if (!result.accepted || result.cancelRequested) {
          input.onAbortRequired?.(
            result.cancelRequested ? 'Durable cancellation requested' : 'Pipeline stage lost its lease'
          );
        }
      }).catch(() => {});
    }, HEARTBEAT_MS);

    try {
      if (claim.task.stage === 'discover') {
        // Discover is a synthetic terminal task. Seed its exact submitted
        // scope from the DB worker so it sees current enrichment, signals,
        // category links, and the user's current taxonomy.
        const discoverItemIds = [...new Set(
          (input.options.discoverItemIds ?? input.itemIds).filter(
            (itemId): itemId is string => Boolean(itemId)
          )
        )];
        const scopeKey = discoverItemIds.join(',');
        if (discoverItemIds.length && seededDiscoverScopeKey !== scopeKey) {
          const seed = await getRemoteStore().createPipelineCacheSeed(discoverItemIds);
          throwIfAborted(input.signal);
          installPipelineCacheSeed(seed);
          seededDiscoverScopeKey = scopeKey;
        }
      } else if (seededItemId !== claim.task.item_id) {
        const seed = await getRemoteStore().createPipelineCacheSeed([claim.task.item_id]);
        throwIfAborted(input.signal);
        installPipelineCacheSeed(seed);
        seededItemId = claim.task.item_id;
      }
      const outcome = await runWithDataChangeNotificationsSuppressed(() => runStage(claim, input));
      throwIfAborted(input.signal);
      const finished = await dbRpc<{ accepted: boolean; snapshot: PipelineJobSnapshot | null }>(
        'pipelineFinishTask',
        [{ ...leaseInput, ...outcome }],
        { priority: 'high' }
      );
      if (!finished.accepted) {
        throwIfAborted(input.signal);
        throw new Error('Durable pipeline stage lost its lease before commit');
      }
      finalSnapshot = finished.snapshot;
    } catch (error) {
      if (input.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw abortError();
      }
      const failedStage = await dbRpc<{ accepted: boolean; snapshot: PipelineJobSnapshot | null }>(
        'pipelineFinishTask',
        [{
          ...leaseInput,
          outcome: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }],
        { priority: 'high' }
      );
      finalSnapshot = failedStage.snapshot;
    } finally {
      window.clearInterval(heartbeat);
    }

    if (finalSnapshot && input.shouldPauseAfterStage?.()) {
      const hasMoreWork = finalSnapshot.tasks.some(
        (task) => task.status === 'pending' || task.status === 'running'
      );
      if (hasMoreWork) {
        const paused = await dbRpc<PipelineJobSnapshot | null>(
          'pipelineAcknowledgePause',
          [input.jobId],
          { priority: 'high' }
        );
        if (paused?.job.status === 'paused') {
          return { snapshot: paused, yielded: false, paused: true };
        }
      }
    }

    if (finalSnapshot && input.shouldYieldAfterItem?.()) {
      const itemIsTerminal = finalSnapshot.tasks
        .filter((task) => task.item_id === claim.task.item_id)
        .every((task) => !['pending', 'running'].includes(task.status));
      const jobHasMoreWork = finalSnapshot.tasks
        .some((task) => ['pending', 'running'].includes(task.status));
      if (itemIsTerminal && jobHasMoreWork) {
        yieldRequested = true;
        break;
      }
    }
  }

  let snapshot = finalSnapshot ?? await dbRpc<PipelineJobSnapshot | null>(
    'pipelineGetJob',
    [input.jobId],
    { priority: 'high' }
  );
  if (!snapshot) throw new Error('Durable pipeline job disappeared');
  if (snapshot.job.status === 'pause_requested' || input.shouldPauseAfterStage?.()) {
    const paused = await dbRpc<PipelineJobSnapshot | null>(
      'pipelineAcknowledgePause',
      [input.jobId],
      { priority: 'high' }
    );
    if (paused?.job.status === 'paused') {
      return { snapshot: paused, yielded: false, paused: true };
    }
    if (paused) snapshot = paused;
  }
  if (yieldRequested) {
    const yielded = await dbRpc<{ accepted: boolean; snapshot: PipelineJobSnapshot | null }>(
      'pipelineYieldJob',
      [{
        jobId: input.jobId,
        ownerId: input.ownerId,
        jobLeaseEpoch: snapshot.job.lease_epoch,
      }],
      { priority: 'high' }
    );
    throwIfAborted(input.signal);
    if (!yielded.accepted || !yielded.snapshot) {
      throw new Error('Durable pipeline job could not yield its lease safely');
    }
    snapshot = yielded.snapshot;
    return { snapshot, yielded: true };
  }
  return { snapshot, yielded: false, result: await buildResult(snapshot) };
}
