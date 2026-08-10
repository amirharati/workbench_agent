/**
 * The extension-wide pipeline coordinator.
 *
 * It owns one serialized execution lane. Pages submit/cancel/observe only;
 * durable job/task state remains owned by the core DB worker.
 */
import { dbRpc } from '../storage/dbClient';
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
  type PipelineOffscreenDoneEvent,
  type PipelineOffscreenProgressEvent,
  type PipelineOffscreenStartJob,
  type PipelineOffscreenStartResponse,
  type PipelineJobOperation,
} from './offscreenPipelineProtocol';

const controllers = new Map<string, AbortController>();
const queuedJobIds = new Set<string>();
let executionTail: Promise<void> = Promise.resolve();
let queuedCount = 0;
let recoveryTimer: number | undefined;
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
    classify: options.classify,
    preferTabSession: options.preferTabSession,
    tabId: options.tabId,
    tabSessionOnly: options.tabSessionOnly,
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
      if (seen.has(task.item_id)) return [];
      seen.add(task.item_id);
      return [task.item_id];
    });
}

function stagesForOperation(operation: PipelineJobOperation): string[] {
  switch (operation) {
    case 'reextract': return ['reextract', 'embed', 'classify', 'finalize'];
    case 'reembed': return ['embed', 'finalize'];
    case 'classify': return ['classify', 'finalize'];
    case 'discover': return ['discover', 'finalize'];
    default: return [...DURABLE_FULL_DIGEST_STAGES];
  }
}

async function submitJob(start: PipelineOffscreenStartJob): Promise<{
  accepted: boolean;
  snapshot: PipelineJobSnapshot;
}> {
  const input: SubmitPipelineJobInput = {
    id: start.requestId,
    dedupeKey: start.operation === 'discover'
      ? 'taxonomy-discover'
      : `pipeline:${[...new Set(start.itemIds)].sort().join(',')}`,
    action: `${start.operation ?? 'full_digest'}_v2`,
    source: 'pipeline_client',
    priority: start.itemIds.length === 1 ? 10 : 50,
    payload: {
      ...durablePayload(start.options),
      discoverItemIds: start.operation === 'discover' ? start.itemIds : undefined,
      operation: start.operation ?? 'full_digest',
    },
    itemIds: start.operation === 'discover' ? ['__taxonomy__'] : start.itemIds,
    stages: stagesForOperation(start.operation ?? 'full_digest'),
  };
  return dbRpc('pipelineSubmitJob', [input], { priority: 'high' });
}

function enqueueAcceptedJob(
  jobId: string,
  itemIds: string[],
  options: OffscreenPipelineJobOptions,
  operation: PipelineJobOperation
): void {
  if (queuedJobIds.has(jobId) || controllers.has(jobId)) return;
  queuedJobIds.add(jobId);
  const controller = new AbortController();
  controllers.set(jobId, controller);
  const position = queuedCount;
  queuedCount += 1;
  if (position > 0) {
    broadcastProgress(jobId, {
      phase: 'prep',
      label: `Queued behind ${position.toLocaleString()} pipeline job${position === 1 ? '' : 's'}…`,
      current: 0,
      total: Math.max(itemIds.length, 1),
    });
  }

  const run = async () => {
    try {
      if (controller.signal.aborted) {
        await dbRpc('pipelineAcknowledgeCancel', [jobId], { priority: 'high' });
        throw new DOMException('Cancelled', 'AbortError');
      }
      const result = await runWithDbPriority('high', () => runDurablePipelineJob({
        jobId,
        itemIds,
        options,
        ownerId,
        signal: controller.signal,
        onAbortRequired: (reason) => controller.abort(
          reason.includes('lost its lease') ? LEASE_LOST_REASON : reason
        ),
        onProgress: (progress) => broadcastProgress(jobId, progress),
      }));
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
    } catch (error) {
      const leaseLost = controller.signal.reason === LEASE_LOST_REASON;
      const cancelled =
        !leaseLost && (
          controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
        );
      if (leaseLost) return;
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
    } finally {
      const leaseLost = controller.signal.reason === LEASE_LOST_REASON;
      controllers.delete(jobId);
      queuedJobIds.delete(jobId);
      queuedCount = Math.max(0, queuedCount - 1);
      if (leaseLost) {
        void recoverDurableJobs().catch((error) => {
          console.error('[pipeline] lease-loss recovery failed:', error);
        });
      }
    }
  };
  executionTail = executionTail.then(run, run);
  armRecoveryWake();
}

async function recoverDurableJobs(): Promise<boolean> {
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
      const operation = (options as OffscreenPipelineJobOptions & { operation?: PipelineJobOperation }).operation
        ?? job.action.replace(/_v2$/, '') as PipelineJobOperation;
      const itemIds = operation === 'discover'
        ? options.discoverItemIds ?? []
        : itemIdsFromSnapshot(snapshot);
      enqueueAcceptedJob(job.id, itemIds, options, operation);
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
        .then(() => {
          controllers.get(cancel.requestId)?.abort(cancel.reason);
          sendResponse({ ok: true });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.action === 'recover') {
      void recoverDurableJobs()
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
        }, start.operation ?? 'full_digest');
        sendResponse({ ok: true, requestId: start.requestId } satisfies PipelineOffscreenStartResponse);
      })
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies PipelineOffscreenStartResponse));
    return true;
  });

  void recoverDurableJobs().catch((error) => {
    console.error('[pipeline] startup recovery failed:', error);
  });
  recoveryTimer = window.setInterval(() => {
    void recoverDurableJobs().catch((error) => {
      console.error('[pipeline] periodic recovery failed:', error);
    });
  }, 15_000);
  void recoveryTimer;
  console.log('[pipeline] Durable coordinator ready (one serialized lane)');
}
