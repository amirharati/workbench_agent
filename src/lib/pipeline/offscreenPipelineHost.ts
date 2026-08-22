/**
 * The extension-wide pipeline coordinator.
 *
 * It owns one serialized execution lane. Pages submit/cancel/observe only;
 * durable job/task state remains owned by the core DB worker.
 */
import { dbRpc } from '../storage/dbClient';
import { loadAISettings, setAISettingsOverride } from '../ai/settings';
import { notifyDataChanged } from '../dataChangeNotifier';
import { runWithDbPriority } from '../storage/dbRpcPriority';
import type {
  PipelineJobSnapshot,
  SubmitPipelineJobInput,
} from '../storage/dbWorker/pipelineJobStore';
import {
  DURABLE_FULL_DIGEST_STAGES,
  runDurablePipelineJob,
} from './durablePipelineEngine';
import type { BatchDigestResult } from './batchDigest';
import type { SingleLinkDigestResult } from './singleLinkDigest';
import {
  PIPELINE_OFFSCREEN_OWNER,
  type OffscreenPipelineJobOptions,
  type PipelineOffscreenCancel,
  type PipelineOffscreenPause,
  type PipelineOffscreenResume,
  type PipelineOffscreenDoneEvent,
  type PipelineOffscreenProgressEvent,
  type PipelineOffscreenStartJob,
  type PipelineOffscreenStartResponse,
  type PipelineJobOperation,
} from './offscreenPipelineProtocol';

const controllers = new Map<string, AbortController>();
type QueuedPipelineJob = {
  jobId: string;
  itemIds: string[];
  options: OffscreenPipelineJobOptions;
  operation: PipelineJobOperation;
  priority: number;
  createdAt: number;
  controller: AbortController;
};
const queuedJobs = new Map<string, QueuedPipelineJob>();
const pauseRequestedJobs = new Set<string>();
let queuePumpRunning = false;
let activeJobId: string | null = null;
const ownerId = `pipeline-coordinator:${crypto.randomUUID()}`;
const LEASE_LOST_REASON = 'pipeline-lease-lost';

function broadcastProgress(
  requestId: string,
  progress: PipelineOffscreenProgressEvent['progress']
): void {
  chrome.runtime.sendMessage({
    type: 'pipeline-offscreen-progress',
    requestId,
    progress,
  } satisfies PipelineOffscreenProgressEvent).catch(() => {});
}

function broadcastDone(event: PipelineOffscreenDoneEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {});
}

function armRecoveryWake(): void {
  chrome.runtime.sendMessage({ type: 'pipeline-recovery-arm' }).catch(() => {});
}

function singleResult(
  itemId: string,
  result: BatchDigestResult,
  options: OffscreenPipelineJobOptions
): SingleLinkDigestResult {
  return {
    itemId,
    enrich: result.itemEnrichResults?.find((row) => row.itemId === itemId) ?? {
      itemId,
      status: result.failed > 0 ? 'failed' : 'none',
    },
    classifyAttempted: options.skipClassify !== true && options.classify !== false && !options.skipAi,
    classifyProcessed: result.classified,
    classifyError: result.classifyError,
    aiError: result.aiError,
    message: result.message,
  };
}

function durablePayload(options: OffscreenPipelineJobOptions): Record<string, unknown> {
  return {
    forceEnrich: options.forceEnrich,
    forceReextract: options.forceReextract,
    skipClassify: options.skipClassify,
    skipAi: options.skipAi,
    forceReclassify: options.forceReclassify,
    retryManualReview: options.retryManualReview,
    discoverItemIds: options.discoverItemIds,
    discoverStuckOnly: options.discoverStuckOnly,
    discoverMaxBatches: options.discoverMaxBatches,
    skipDiscover: options.skipDiscover,
    classify: options.classify,
    preferTabSession: options.preferTabSession,
    tabId: options.tabId,
    tabSessionOnly: options.tabSessionOnly,
    browserOwnerTabId: options.browserOwnerTabId,
    browserWindowId: options.browserWindowId,
  };
}

function parseOptions(snapshot: PipelineJobSnapshot): OffscreenPipelineJobOptions {
  try {
    return JSON.parse(snapshot.job.payload_json) as OffscreenPipelineJobOptions;
  } catch {
    return {};
  }
}

function itemIdsFromSnapshot(snapshot: PipelineJobSnapshot): string[] {
  const seen = new Set<string>();
  return snapshot.tasks
    .sort((a, b) => a.ordinal - b.ordinal)
    .flatMap((task) => {
      if (task.item_id === '__taxonomy__') return [];
      if (seen.has(task.item_id)) return [];
      seen.add(task.item_id);
      return [task.item_id];
    });
}

function stagesForOperation(
  operation: PipelineJobOperation,
  options: OffscreenPipelineJobOptions
): string[] {
  switch (operation) {
    case 'reextract': return ['reextract', 'embed', 'classify', 'finalize'];
    case 'reembed': return ['embed', 'finalize'];
    case 'classify': return ['classify', 'finalize'];
    case 'discover': return ['discover', 'finalize'];
    default:
      return options.skipDiscover
        ? DURABLE_FULL_DIGEST_STAGES.filter((stage) => stage !== 'discover')
        : [...DURABLE_FULL_DIGEST_STAGES];
  }
}

async function submitJob(start: PipelineOffscreenStartJob): Promise<{
  accepted: boolean;
  snapshot: PipelineJobSnapshot;
}> {
  const operation = start.operation ?? 'full_digest';
  const discoverItemIds = operation === 'discover'
    ? start.itemIds
    : operation === 'full_digest' && start.options.skipDiscover !== true
      ? start.itemIds
      : undefined;
  const input: SubmitPipelineJobInput = {
    id: start.requestId,
    dedupeKey: operation === 'discover'
      ? 'taxonomy-discover'
      : `pipeline:${[...new Set(start.itemIds)].sort().join(',')}`,
    action: `${operation}_v2`,
    source: 'pipeline_client',
    priority: start.itemIds.length === 1 ? 10 : 50,
    payload: {
      ...durablePayload(start.options),
      // Persist the exact scope so resume stays scoped and uses the user's
      // current stored taxonomy rather than rebuilding code defaults.
      discoverItemIds,
      operation,
    },
    itemIds: operation === 'discover' ? ['__taxonomy__'] : start.itemIds,
    stages: stagesForOperation(operation, start.options),
  };
  return dbRpc('pipelineSubmitJob', [input], { priority: 'high' });
}

function enqueueAcceptedJob(
  jobId: string,
  itemIds: string[],
  options: OffscreenPipelineJobOptions,
  operation: PipelineJobOperation,
  priority: number,
  createdAt: number
): void {
  if (queuedJobs.has(jobId) || controllers.has(jobId)) return;
  const controller = new AbortController();
  controllers.set(jobId, controller);
  const position = queuedJobs.size;
  queuedJobs.set(jobId, {
    jobId,
    itemIds,
    options,
    operation,
    priority,
    createdAt,
    controller,
  });
  if (position > 0) {
    broadcastProgress(jobId, {
      phase: 'prep',
      label: priority < 50
        ? 'Queued for priority processing after the current item…'
        : `Queued behind ${position.toLocaleString()} pipeline job${position === 1 ? '' : 's'}…`,
      current: 0,
      total: Math.max(itemIds.length, 1),
    });
  }
  armRecoveryWake();
  void pumpPipelineQueue();
}

function hasHigherPriorityWaiting(current: QueuedPipelineJob): boolean {
  for (const candidate of queuedJobs.values()) {
    if (
      candidate.jobId !== current.jobId &&
      !candidate.controller.signal.aborted &&
      candidate.priority < current.priority
    ) return true;
  }
  return false;
}

function nextQueuedJob(): QueuedPipelineJob | null {
  return [...queuedJobs.values()].sort((a, b) =>
    a.priority - b.priority || a.createdAt - b.createdAt
  )[0] ?? null;
}

async function executeQueuedJob(entry: QueuedPipelineJob): Promise<'yielded' | 'finished'> {
  const { jobId, itemIds, options, operation, controller } = entry;
  let leaseLost = false;
  try {
    if (controller.signal.aborted) {
      await dbRpc('pipelineAcknowledgeCancel', [jobId], { priority: 'high' });
      throw new DOMException('Cancelled', 'AbortError');
    }
    // Pipeline domain functions load settings internally. Install the
    // submission-time settings in this serialized offscreen realm so they do
    // not silently fall back to an empty worker configuration. Recovered jobs
    // omit secrets from SQLite and reload the saved settings here instead.
    setAISettingsOverride(null);
    const aiSettings = options.aiSettings?.apiKey.trim()
      ? options.aiSettings
      : await loadAISettings();
    setAISettingsOverride(aiSettings);
    const execution = await runWithDbPriority('high', () => runDurablePipelineJob({
      jobId,
      itemIds,
      options,
      ownerId,
      signal: controller.signal,
      onAbortRequired: (reason) => controller.abort(
        reason.includes('lost its lease') ? LEASE_LOST_REASON : reason
      ),
      onProgress: (progress) => broadcastProgress(jobId, progress),
      shouldYieldAfterItem: () => hasHigherPriorityWaiting(entry),
      shouldPauseAfterStage: () => pauseRequestedJobs.has(jobId),
    }));
    if (execution.paused) {
      pauseRequestedJobs.delete(jobId);
      broadcastProgress(jobId, {
        phase: 'prep',
        label: 'Paused because the processing dashboard closed…',
        current: execution.snapshot.job.completed_items,
        total: Math.max(execution.snapshot.job.total_items, 1),
      });
      return 'finished';
    }
    if (execution.yielded) {
      broadcastProgress(jobId, {
        phase: 'prep',
        label: 'Paused safely for an urgent link; bulk will resume automatically…',
        current: execution.snapshot.job.completed_items,
        total: Math.max(execution.snapshot.job.total_items, 1),
      });
      return 'yielded';
    }
    if (!execution.result) throw new Error('Pipeline completed without a durable result');
    const result = execution.result;
    notifyDataChanged('pipeline.complete', { entityIds: itemIds });
    broadcastDone({
      type: 'pipeline-offscreen-done',
      requestId: jobId,
      ok: true,
      result,
      singleResult: operation === 'full_digest' && itemIds.length === 1
        ? singleResult(itemIds[0], result, options)
        : undefined,
    });
    return 'finished';
  } catch (error) {
    leaseLost = controller.signal.reason === LEASE_LOST_REASON;
    const cancelled =
      !leaseLost && (
        controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
      );
    if (leaseLost) return 'finished';
    if (cancelled) {
      await dbRpc('pipelineAcknowledgeCancel', [jobId], { priority: 'high' }).catch(() => {});
    }
    notifyDataChanged('pipeline.complete', { entityIds: itemIds });
    broadcastDone({
      type: 'pipeline-offscreen-done',
      requestId: jobId,
      ok: false,
      error: cancelled ? 'Cancelled' : error instanceof Error ? error.message : String(error),
    });
    return 'finished';
  } finally {
    setAISettingsOverride(null);
    if (leaseLost) {
      void recoverDurableJobs().catch((error) => {
        console.error('[pipeline] lease-loss recovery failed:', error);
      });
    }
  }
}

async function pumpPipelineQueue(): Promise<void> {
  if (queuePumpRunning) return;
  queuePumpRunning = true;
  try {
    while (queuedJobs.size > 0) {
      const entry = nextQueuedJob();
      if (!entry) break;
      activeJobId = entry.jobId;
      const outcome = await executeQueuedJob(entry);
      activeJobId = null;
      if (outcome === 'finished') {
        queuedJobs.delete(entry.jobId);
        controllers.delete(entry.jobId);
      }
    }
  } finally {
    activeJobId = null;
    queuePumpRunning = false;
    if (queuedJobs.size > 0) void pumpPipelineQueue();
  }
}

async function recoverDurableJobs(hostedJobIds?: Set<string>): Promise<boolean> {
  await dbRpc('pipelineRecoverExpired', [Date.now()], { priority: 'high' });
  const snapshots = await dbRpc<PipelineJobSnapshot[]>(
    'pipelineListRecoverable',
    [],
    { priority: 'high' }
  );
  for (const snapshot of snapshots) {
    const { job } = snapshot;
    if (job.status === 'cancel_requested' || job.status === 'cancelling') {
      await dbRpc('pipelineAcknowledgeCancel', [job.id], { priority: 'high' });
      continue;
    }
    // Retire the failed compatibility slice instead of attempting to execute
    // its monolithic task in the clean stage engine.
    if (snapshot.tasks.some((task) => task.stage === 'full_digest')) {
      await dbRpc('pipelineRequestCancel', [job.id], { priority: 'high' });
      await dbRpc('pipelineAcknowledgeCancel', [job.id], { priority: 'high' });
      continue;
    }
    if (job.action.endsWith('_v2') && job.status === 'queued') {
      const options = parseOptions(snapshot);
      const requiresDashboardHost =
        typeof options.browserOwnerTabId === 'number' &&
        typeof options.browserWindowId === 'number';
      if (requiresDashboardHost && hostedJobIds && !hostedJobIds.has(job.id)) {
        await dbRpc('pipelineRequestPause', [job.id], { priority: 'high' });
        continue;
      }
      const operation = (options as OffscreenPipelineJobOptions & { operation?: PipelineJobOperation }).operation
        ?? job.action.replace(/_v2$/, '') as PipelineJobOperation;
      const itemIds = operation === 'discover'
        ? options.discoverItemIds ?? []
        : itemIdsFromSnapshot(snapshot);
      enqueueAcceptedJob(job.id, itemIds, options, operation, job.priority, job.created_at);
    }
  }
  if (snapshots.length > 0) armRecoveryWake();
  return snapshots.length > 0;
}

export function installOffscreenPipelineHost(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== PIPELINE_OFFSCREEN_OWNER) return false;

    if (message.action === 'cancel') {
      const cancel = message as PipelineOffscreenCancel;
      void dbRpc('pipelineRequestCancel', [cancel.requestId], { priority: 'high' })
        .then(async () => {
          controllers.get(cancel.requestId)?.abort(cancel.reason);
          if (activeJobId !== cancel.requestId) {
            await dbRpc('pipelineAcknowledgeCancel', [cancel.requestId], { priority: 'high' });
            queuedJobs.delete(cancel.requestId);
            controllers.delete(cancel.requestId);
            pauseRequestedJobs.delete(cancel.requestId);
            broadcastDone({
              type: 'pipeline-offscreen-done',
              requestId: cancel.requestId,
              ok: false,
              error: 'Cancelled',
            });
          }
          sendResponse({ ok: true });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.action === 'pause') {
      const pause = message as PipelineOffscreenPause;
      pauseRequestedJobs.add(pause.requestId);
      void dbRpc<PipelineJobSnapshot | null>(
        'pipelineRequestPause',
        [pause.requestId],
        { priority: 'high' }
      )
        .then((snapshot) => {
          if (activeJobId !== pause.requestId && snapshot?.job.status === 'paused') {
            queuedJobs.delete(pause.requestId);
            controllers.delete(pause.requestId);
            pauseRequestedJobs.delete(pause.requestId);
          } else if (snapshot && ['completed', 'failed', 'cancelled'].includes(snapshot.job.status)) {
            pauseRequestedJobs.delete(pause.requestId);
          }
          sendResponse({ ok: true, status: snapshot?.job.status ?? 'missing' });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.action === 'resume') {
      const resume = message as PipelineOffscreenResume;
      void dbRpc<{ accepted: boolean; snapshot: PipelineJobSnapshot | null }>(
        'pipelineResumeJob',
        [resume.requestId, resume.browserOwnerTabId, resume.browserWindowId],
        { priority: 'high' }
      )
        .then((resumed) => {
          if (!resumed.accepted || !resumed.snapshot) {
            sendResponse({ ok: false, error: 'Pipeline is not paused' });
            return;
          }
          const durableOptions = parseOptions(resumed.snapshot);
          const options: OffscreenPipelineJobOptions = {
            ...durableOptions,
            aiSettings: resume.aiSettings?.apiKey.trim() ? resume.aiSettings : undefined,
          };
          const operation = (options as OffscreenPipelineJobOptions & { operation?: PipelineJobOperation }).operation
            ?? resumed.snapshot.job.action.replace(/_v2$/, '') as PipelineJobOperation;
          const itemIds = operation === 'discover'
            ? options.discoverItemIds ?? []
            : itemIdsFromSnapshot(resumed.snapshot);
          enqueueAcceptedJob(
            resumed.snapshot.job.id,
            itemIds,
            options,
            operation,
            resumed.snapshot.job.priority,
            resumed.snapshot.job.created_at
          );
          sendResponse({ ok: true, requestId: resume.requestId });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.action === 'recover') {
      const hostedJobIds = new Set<string>(
        Array.isArray(message.hostedJobIds)
          ? message.hostedJobIds.filter((value: unknown): value is string => typeof value === 'string')
          : []
      );
      void recoverDurableJobs(hostedJobIds)
        .then((active) => sendResponse({ ok: true, active }))
        .catch((error) => sendResponse({ ok: false, active: true, error: String(error) }));
      return true;
    }

    if (message.action !== 'start-job') {
      sendResponse({ ok: false, error: 'Unknown pipeline action' } satisfies PipelineOffscreenStartResponse);
      return false;
    }

    const start = message as PipelineOffscreenStartJob;
    const itemIds = [...new Set(start.itemIds?.filter(Boolean) ?? [])];
    if (!start.requestId || (!itemIds.length && start.operation !== 'discover')) {
      sendResponse({ ok: false, error: 'Invalid pipeline job payload' } satisfies PipelineOffscreenStartResponse);
      return false;
    }

    void submitJob({ ...start, itemIds })
      .then((submitted) => {
        if (!submitted.accepted) {
          sendResponse({
            ok: false,
            error: 'This pipeline scope is already queued or running',
          } satisfies PipelineOffscreenStartResponse);
          return;
        }
        enqueueAcceptedJob(start.requestId, itemIds, {
          ...start.options,
          discoverItemIds: start.operation === 'discover' ? itemIds : start.options.discoverItemIds,
        }, start.operation ?? 'full_digest', submitted.snapshot.job.priority, submitted.snapshot.job.created_at);
        sendResponse({ ok: true, requestId: start.requestId } satisfies PipelineOffscreenStartResponse);
      })
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies PipelineOffscreenStartResponse));
    return true;
  });

  // Recovery is initiated by the service worker, which supplies the dashboard
  // host bindings retained in chrome.storage.session. A Chrome restart can
  // therefore pause stale hosted jobs instead of using an arbitrary window.
  console.log('[pipeline] Durable coordinator ready (one serialized lane)');
}
