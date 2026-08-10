/**
 * Single pipeline path for fetch → AI → embed → classify → discover.
 * All UI entry points (Import, Hub re-digest, Inspector, Classify) use this.
 */
import {
  classifyIncremental,
  discoverBatch,
  APP_DISCOVER_MAP_BATCH_SIZE,
  listItemIdsWithoutCategory,
  listItemIdsWithGeneralCategory,
} from '../categorization';
import { loadItemIdsForPipelineQueue } from './itemPipelineContext';
import type { TopicClassifySummary } from '../categorization/types';
import { notifyDataChanged } from '../dataChangeNotifier';
import { commitPendingDbWrites, refreshPipelineCacheFromWorker } from '../db';
import {
  enrichBatch,
  enrichOne,
  getEnrichment,
  type EnrichmentResult,
} from '../enrichment';
import { isEnrichmentFailure } from '../enrichment/failureLabels';
import {
  formatEmbedBatchMessage,
  prepBatchPipelineItems,
  runEnrichmentBatchPostProcess,
} from './batchPostProcess';
import { filterDownstreamClassifyEligible } from './downstreamEligible';
import type { PipelineReportAction } from './pipelineBatchReport';
import { buildPipelineRunExport } from './pipelineRunAnalysis';
import {
  markPipelineRunStarted,
  persistPipelineRunExportIfEnabled,
} from './pipelineRunStore';
import { isPipelineDebugEnabled } from '../enrichment/pipelineDebug';
import {
  classifySkipTotal,
  formatClassifySkipBreakdown,
  isPipelineSkipMessage,
} from './pipelineDictionary';

/** @deprecated Batch pipeline processes the full `itemIds` scope; pass `maxEnrich` only to limit intentionally. */
export const PIPELINE_DEFAULTS = {} as const;

export type ItemPipelinePhase = 'prep' | 'enrich' | 'embed' | 'classify' | 'discover' | 'save' | 'done';

export interface ItemPipelineProgress {
  phase: ItemPipelinePhase;
  label: string;
  current: number;
  total: number;
}

export interface ItemPipelineResult {
  enriched: number;
  skipped: number;
  failed: number;
  classified: number;
  classifySummary?: TopicClassifySummary;
  enrichCancelled?: boolean;
  classifyError?: string;
  embedMessage?: string;
  discoverMessage?: string;
  embedded?: number;
  embedFailed?: number;
  remaining?: number;
  message: string;
  itemEnrichResults?: EnrichmentResult[];
  /** Set when Settings → pipeline debug is on and run artifacts were written. */
  pipelineDebugSavedTo?: string;
}

export interface RunItemPipelineOptions {
  itemIds: string[];
  /** Fetch + AI extract (default true). */
  enrich?: boolean;
  /** Embed + classify + discover when needed (default true). */
  classify?: boolean;
  skipAi?: boolean;
  /** Re-fetch even when page hash unchanged. */
  forceEnrich?: boolean;
  /**
   * Re-run classify LLM from any stuck state (pending_discover, orphan classified, etc.).
   * Default true — user actions should always finish the job.
   */
  forceClassify?: boolean;
  /** @deprecated Full scope is always processed; use `maxEnrich` only to limit intentionally. */
  processAll?: boolean;
  maxEnrich?: number;
  maxClassify?: number;
  refetchCompare?: boolean;
  collectItemResults?: boolean;
  retryManualReview?: boolean;
  /**
   * Skip discover taxonomy expansion pass entirely (default false).
   * Set true for single-item / interactive classify — discover is slow and adds no value
   * when the user just wants a quick category assignment.
   */
  skipDiscover?: boolean;
  /**
   * When true, classify also runs every bookmark in the global `pending_classify` queue,
   * not only `itemIds`. Default false — Hub/Inspector selections must stay scoped.
   * Use for explicit “drain classify backlog” maintenance (not re-digest N selected).
   */
  drainPendingClassifyQueue?: boolean;
  /** Label stored in pipeline-run-latest.json (default batch_full). */
  pipelineRunAction?: PipelineReportAction;
  signal?: AbortSignal;
  onProgress?: (update: ItemPipelineProgress) => void;
  /** Single-item enrich overrides (tab session, etc.). */
  enrichOneOptions?: {
    preferTabSession?: boolean;
    tabId?: number;
    tabSessionOnly?: boolean;
  };
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function report(
  opts: RunItemPipelineOptions,
  phase: ItemPipelinePhase,
  label: string,
  current = 0,
  total = 1
) {
  opts.onProgress?.({ phase, label, current, total });
}

async function flushWrites(
  opts: RunItemPipelineOptions,
  label: string
): Promise<void> {
  report(opts, 'save', label, 0, 1);
  await yieldToUi();
  await commitPendingDbWrites();
}

async function syncBeforeClassify(opts: RunItemPipelineOptions): Promise<void> {
  report(opts, 'save', 'Syncing enrichment & classify queue…', 0, 1);
  await yieldToUi();
  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();
}

async function runClassifyWithDiscover(
  itemIds: string[],
  opts: RunItemPipelineOptions & {
    forceClassify: boolean;
  }
): Promise<{
  classified: number;
  classifySummary?: TopicClassifySummary;
  classifyError?: string;
  discoverMessage?: string;
}> {
  let classified = 0;
  let classifySummary: TopicClassifySummary | undefined;
  let classifyError: string | undefined;
  let discoverMessage: string | undefined;

  await syncBeforeClassify(opts);

  const drainQueue = opts.drainPendingClassifyQueue === true;
  const queuedIds = drainQueue ? await loadItemIdsForPipelineQueue('pending_classify') : [];
  const mergedIds =
    drainQueue && queuedIds.length > 0
      ? [...new Set([...itemIds, ...queuedIds])]
      : itemIds;

  const classifyDebugStart = Date.now();
  const classifyDebugMeta = {
    batchIds: itemIds.length,
    queuedIds: queuedIds.length,
    mergedIds: mergedIds.length,
  };

  const classifyLabel =
    drainQueue && queuedIds.length > 0
      ? `Classifying ${itemIds.length} selected + ${queuedIds.length} queued…`
      : `Classifying ${mergedIds.length} bookmark${mergedIds.length === 1 ? '' : 's'}…`;
  report(opts, 'classify', classifyLabel, 0, Math.max(1, mergedIds.length));
  await yieldToUi();

  try {
    const classifyResult = await classifyIncremental({
      itemIds: mergedIds,
      maxItems: mergedIds.length,
      autoDiscover: false,
      forceReclassify: opts.forceClassify,
      retryManualReview: opts.retryManualReview,
      signal: opts.signal,
      onProgress: (p) => {
        const phase =
          p.phase === 'discover' ? 'discover' : p.phase === 'save' ? 'save' : 'classify';
        report(
          opts,
          phase,
          p.label || 'Classifying…',
          Math.max(p.current, 0),
          Math.max(p.total, 1)
        );
      },
    });
    classifySummary = classifyResult.summary;
    classified =
      classifyResult.summary.classifiedSpecific +
      classifyResult.summary.classifiedGeneral;
    await flushWrites(opts, 'Saving categories…');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Classification failed';
    if (msg === 'Cancelled') {
      classifyError = 'classification cancelled';
    } else if (/missing api key/i.test(msg)) {
      classifyError = 'classification skipped (no AI key)';
    } else if (/no taxonomy loaded/i.test(msg)) {
      classifyError = 'classification skipped (import taxonomy in Settings)';
    } else {
      classifyError = msg;
    }
    return { classified, classifySummary, classifyError, discoverMessage };
  }

  notifyDataChanged('categorization.update');

  // Post-classify discover (v3 map→reduce): gap-fill unassigned / pending. Skip for a single
  // bookmark — classify + link-quality heuristics handle 404/junk without taxonomy expansion.
  const skipDiscover = opts.skipDiscover === true || mergedIds.length === 1;

  if (!skipDiscover && !classifyError && !opts.signal?.aborted) {
    await refreshPipelineCacheFromWorker();
    const unassignedIds = await listItemIdsWithoutCategory(mergedIds);

    if (unassignedIds.length > 0) {
      const discoverBits: string[] = [];
      report(
        opts,
        'discover',
        `Discovering topics for ${unassignedIds.length} unassigned link${unassignedIds.length === 1 ? '' : 's'}…`,
        0,
        1
      );
      try {
        const discoverResult = await discoverBatch({
          itemIds: unassignedIds,
          singleBatch: false,
          enforceBulkRunCap: false,
          stuckOnly: true,
          onlyWithoutCategory: true,
          sampleBatchSize: APP_DISCOVER_MAP_BATCH_SIZE,
          signal: opts.signal,
          onProgress: (p) => {
            report(
              opts,
              'discover',
              p.label || 'Discovering topics…',
              p.current,
              Math.max(p.total, 1)
            );
          },
        });
        await flushWrites(opts, 'Saving discover results…');

        if (discoverResult.newLeaves > 0) {
          discoverBits.push(`${discoverResult.newLeaves} new topics`);
        }
        if (discoverResult.itemsSampled > 0) {
          discoverBits.push(`${discoverResult.itemsSampled} sampled`);
        }

        if (discoverResult.shouldReclassify && discoverResult.reclassifyItemIds?.length) {
          const reclassifyIds = discoverResult.reclassifyItemIds;
          report(opts, 'classify', 'Re-classifying after discover…', 0, reclassifyIds.length);
          await refreshPipelineCacheFromWorker();
          const retry = await classifyIncremental({
            itemIds: reclassifyIds,
            maxItems: reclassifyIds.length,
            autoDiscover: false,
            forceReclassify: true,
            signal: opts.signal,
            onProgress: (p) => {
              report(
                opts,
                'classify',
                p.label || 'Re-classifying…',
                Math.max(p.current, 0),
                Math.max(p.total, 1)
              );
            },
          });
          classified +=
            retry.summary.classifiedSpecific + retry.summary.classifiedGeneral;
          if (classifySummary) {
            classifySummary = {
              ...classifySummary,
              classifiedSpecific:
                classifySummary.classifiedSpecific + retry.summary.classifiedSpecific,
              classifiedGeneral:
                classifySummary.classifiedGeneral + retry.summary.classifiedGeneral,
            };
          }
          await flushWrites(opts, 'Saving categories…');
        }

        if (discoverBits.length) discoverMessage = discoverBits.join(' · ');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Discover failed';
        discoverMessage = msg.includes('Missing API key')
          ? 'discover skipped (no AI key)'
          : msg;
        console.warn('[itemPipeline] discover failed:', e);
      }
    }
  }

  if (classifySummary && !skipDiscover) {
    await refreshPipelineCacheFromWorker();
    const stillUnassigned = await listItemIdsWithoutCategory(mergedIds);

    // Task D: End-of-pipeline discover pass for items that only got a *-general leaf.
    // After classify → discover → reclassify, run one more gapFillMode discover on
    // items that have a general category only — they might get a specific one.
    const generalOnlyIds = await listItemIdsWithGeneralCategory(mergedIds);
    if (generalOnlyIds.length > 0 && !opts.signal?.aborted) {
      report(opts, 'discover', `Refining ${generalOnlyIds.length} general-only item${generalOnlyIds.length === 1 ? '' : 's'}…`, 0, 1);
      try {
        const refineResult = await discoverBatch({
          itemIds: generalOnlyIds,
          singleBatch: true,
          enforceBulkRunCap: false,
          stuckOnly: false,
          onlyWithoutCategory: false,
          sampleBatchSize: APP_DISCOVER_MAP_BATCH_SIZE,
          maxBatches: 1,
          maxNewParentsOverride: 1,
          maxNewLeavesOverride: 6,
          signal: opts.signal,
          onProgress: (p) => {
            report(opts, 'discover', p.label || 'Refining general topics…', p.current, Math.max(p.total, 1));
          },
        });
        await flushWrites(opts, 'Saving refined topics…');
        if (refineResult.shouldReclassify && refineResult.reclassifyItemIds?.length) {
          report(opts, 'classify', 'Re-classifying refined topics…', 0, refineResult.reclassifyItemIds.length);
          await refreshPipelineCacheFromWorker();
          const refineRetry = await classifyIncremental({
            itemIds: refineResult.reclassifyItemIds,
            maxItems: refineResult.reclassifyItemIds.length,
            autoDiscover: false,
            forceReclassify: true,
            signal: opts.signal,
            onProgress: (p) => {
              report(opts, 'classify', p.label || 'Re-classifying…', Math.max(p.current, 0), Math.max(p.total, 1));
            },
          });
          const refineClassified =
            refineRetry.summary.classifiedSpecific + refineRetry.summary.classifiedGeneral;
          if (refineClassified > 0) {
            classified += refineClassified;
            classifySummary = {
              ...classifySummary,
              classifiedSpecific: classifySummary.classifiedSpecific + refineRetry.summary.classifiedSpecific,
              classifiedGeneral: classifySummary.classifiedGeneral + refineRetry.summary.classifiedGeneral,
            };
          }
          await flushWrites(opts, 'Saving refined categories…');
        }
      } catch (e) {
        if (e instanceof Error && e.message === 'Cancelled') throw e;
        console.warn('[itemPipeline] general-only refine discover failed (non-fatal):', e);
      }
    }

    if (stillUnassigned.length > 0) {
      // Final fallback: keyword-based general-leaf assignment for items that went
      // through classify → discover → reclassify but still have no category.
      // This guarantees all successfully fetched items get at least a general topic.
      report(opts, 'classify', `Assigning fallback categories for ${stillUnassigned.length} unmatched item${stillUnassigned.length === 1 ? '' : 's'}…`, 0, 1);
      try {
        // Ensure ai_categories is fresh so generalLeafByParent is populated from latest state
        const { getRemoteStore } = await import('../storage/dbClient/remoteStore');
        await getRemoteStore().refreshTablesFromWorker(['ai_categories']);
        const { assignGeneralLeafFallback } = await import('../categorization/classifyTopicExtract');
        const fallbackCount = await assignGeneralLeafFallback(stillUnassigned);
        if (fallbackCount > 0) {
          classified += fallbackCount;
          classifySummary = {
            ...classifySummary,
            classifiedGeneral: classifySummary.classifiedGeneral + fallbackCount,
            pendingDiscover: 0,
          };
          discoverMessage = discoverMessage
            ? `${discoverMessage} · ${fallbackCount} keyword-matched`
            : `${fallbackCount} keyword-matched`;
          await flushWrites(opts, 'Saving fallback categories…');
        } else {
          classifySummary = { ...classifySummary, pendingDiscover: stillUnassigned.length };
          discoverMessage = discoverMessage
            ? `${discoverMessage} · ${stillUnassigned.length} still unassigned`
            : `${stillUnassigned.length} still unassigned`;
        }
      } catch (e) {
        console.warn('[itemPipeline] general-leaf fallback failed:', e);
        classifySummary = { ...classifySummary, pendingDiscover: stillUnassigned.length };
      }
    } else {
      classifySummary = { ...classifySummary, pendingDiscover: 0 };
    }
  }

  await saveClassifyDebug({
    batchIds: classifyDebugMeta.batchIds,
    queuedIds: classifyDebugMeta.queuedIds,
    mergedIds: classifyDebugMeta.mergedIds,
    startedAt: classifyDebugStart,
    toProcess: classifySummary ? classifySummary.processed : undefined,
    ineligible: classifySummary ? classifySummary.skippedIneligible : undefined,
    hashSkip: classifySummary ? classifySummary.skippedHash : undefined,
    manualReview: classifySummary ? classifySummary.skippedManualReview : undefined,
    classified,
    classifyError,
  });

  return { classified, classifySummary, classifyError, discoverMessage };
}

async function saveClassifyDebug(meta: {
  batchIds: number;
  queuedIds: number;
  mergedIds: number;
  startedAt: number;
  toProcess?: number;
  ineligible?: number;
  hashSkip?: number;
  manualReview?: number;
  classified: number;
  classifyError?: string;
}): Promise<void> {
  if (!isPipelineDebugEnabled()) return;
  try {
    const { putPipelineDebugRecord } = await import('../enrichment/pipelineDebug');
    await putPipelineDebugRecord({
      itemId: `__classify_run__`,
      capturedAt: meta.startedAt,
      payload: {
        capturedAt: meta.startedAt,
        url: `classify-run:${new Date(meta.startedAt).toISOString()}`,
        fetchMs: 0,
        totalMs: Date.now() - meta.startedAt,
        enrichStatus: meta.classifyError ? 'error' : 'ok',
        errorCode: meta.classifyError,
        phases: [
          { name: 'batch_ids', ms: meta.batchIds },
          { name: 'queued_ids', ms: meta.queuedIds },
          { name: 'merged_ids', ms: meta.mergedIds },
          { name: 'to_process', ms: meta.toProcess ?? -1 },
          { name: 'ineligible', ms: meta.ineligible ?? -1 },
          { name: 'hash_skip', ms: meta.hashSkip ?? -1 },
          { name: 'manual_review', ms: meta.manualReview ?? -1 },
          { name: 'classified', ms: meta.classified },
        ],
      },
    });
    await commitPendingDbWrites();
  } catch (e) {
    console.warn('[itemPipeline] classify debug row failed:', e);
  }
}

function buildPipelineMessage(input: {
  enriched: number;
  skipped: number;
  failed: number;
  classified: number;
  classifyError?: string;
  embedMessage?: string;
  discoverMessage?: string;
  remaining?: number;
  total: number;
  fetchOnly?: boolean;
  classifyOnly?: boolean;
  classifySummary?: TopicClassifySummary;
}): string {
  const parts: string[] = [];

  const appendClassifySummary = (s: TopicClassifySummary) => {
    const categorized = s.classifiedSpecific + s.classifiedGeneral;
    const classifySkipped = classifySkipTotal(s);
    if (categorized > 0) parts.push(`${categorized} classified`);
    if (classifySkipped > 0) {
      const detail = formatClassifySkipBreakdown(s);
      parts.push(
        detail
          ? `${classifySkipped} skipped (classify: ${detail})`
          : `${classifySkipped} skipped (classify)`
      );
    }
    if (s.llmErrors > 0) parts.push(`${s.llmErrors} failed (classify)`);
    if (s.pendingDiscover > 0) parts.push(`${s.pendingDiscover} pending discover`);
  };

  // Classify-only path (Hub "Classify pending" button).
  if (input.classifyOnly && input.classifySummary) {
    appendClassifySummary(input.classifySummary);
    if (input.classifyError) {
      parts.push(
        isPipelineSkipMessage(input.classifyError)
          ? input.classifyError
          : `Classify failed — ${input.classifyError}`
      );
    }
    return parts.length ? parts.join(' · ') : `${input.total} checked — already up to date`;
  }

  // Fetch / enrich stage (never lump skipped into failed).
  if (input.enriched > 0) {
    parts.push(
      input.fetchOnly ? `${input.enriched} fetched` : `${input.enriched} enriched`
    );
  }
  if (input.skipped > 0) parts.push(`${input.skipped} skipped (fetch)`);
  if (input.failed > 0) parts.push(`${input.failed} failed (fetch)`);

  // Classify stage
  if (input.classifyError) {
    parts.push(
      isPipelineSkipMessage(input.classifyError)
        ? input.classifyError
        : `Classify failed — ${input.classifyError}`
    );
  } else if (input.classifySummary) {
    appendClassifySummary(input.classifySummary);
  } else if (input.classified > 0) {
    parts.push(`${input.classified} classified`);
  }

  if (input.embedMessage) parts.push(input.embedMessage);

  if (input.discoverMessage) parts.push(input.discoverMessage);

  if (input.remaining && input.remaining > 0) {
    parts.push(`${input.remaining} remaining (not in this batch)`);
  }

  if (parts.length === 0) return `${input.total} checked — already up to date`;
  return parts.join(' · ');
}

/** Unified pipeline — one path from any state. */
export async function runItemPipeline(
  options: RunItemPipelineOptions
): Promise<ItemPipelineResult> {
  const uniqueIds = [...new Set(options.itemIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return {
      enriched: 0,
      skipped: 0,
      failed: 0,
      classified: 0,
      message: 'No items to process',
    };
  }

  // Digest must never trigger full sqlite folder dumps (updateItem used to schedule them).
  try {
    const { pauseAutoMirrorForDigest } = await import('../storage/dbClient');
    await pauseAutoMirrorForDigest();
  } catch {
    /* worker may not be up yet */
  }

  try {
    return await runItemPipelineBody(options, uniqueIds);
  } finally {
    try {
      const { resumeAutoMirrorAfterDigest } = await import('../storage/dbClient');
      await resumeAutoMirrorAfterDigest();
    } catch {
      /* ignore */
    }
  }
}

async function runItemPipelineBody(
  options: RunItemPipelineOptions,
  uniqueIds: string[]
): Promise<ItemPipelineResult> {
  report(options, 'prep', 'Starting pipeline…', 0, 1);
  await yieldToUi();

  const pipelineStartedAt = Date.now();
  if (isPipelineDebugEnabled()) {
    try {
      await markPipelineRunStarted(uniqueIds.length, pipelineStartedAt);
    } catch (e) {
      console.error('[itemPipeline] pipeline debug start write failed:', e);
    }
  }

  const doEnrich = options.enrich !== false;
  const doClassify = options.classify !== false;
  const forceClassify = options.forceClassify !== false;
  const maxEnrich = options.maxEnrich ?? uniqueIds.length;
  const remaining = Math.max(0, uniqueIds.length - maxEnrich);

  try {
    if (doEnrich) {
      report(options, 'prep', 'Queuing items for classify…', 0, 1);
      await yieldToUi();
      await prepBatchPipelineItems(uniqueIds, { queueClassify: doClassify });
    } else if (doClassify) {
      report(options, 'prep', 'Preparing classify…', 0, 1);
      await yieldToUi();
      await prepBatchPipelineItems(uniqueIds, { queueClassify: false });
    }
  } catch (e) {
    console.warn('[itemPipeline] prep failed:', e);
  }

  let enriched = 0;
  let skipped = 0;
  let failed = 0;
  let enrichCancelled = false;
  let itemEnrichResults: EnrichmentResult[] | undefined;
  let embedMessage: string | undefined;
  let embedded = 0;
  let embedFailed = 0;

  if (doEnrich) {
    if (uniqueIds.length === 1 && options.enrichOneOptions) {
      const itemId = uniqueIds[0];
      report(options, 'enrich', 'Fetching page & extracting with AI…', 0, 1);
      await yieldToUi();
      try {
        const one = await enrichOne(itemId, {
          force: options.forceEnrich === true,
          skipAi: options.skipAi,
          signal: options.signal,
          preferTabSession: options.enrichOneOptions.preferTabSession,
          tabId: options.enrichOneOptions.tabId,
          tabSessionOnly: options.enrichOneOptions.tabSessionOnly,
        });
        itemEnrichResults = [one];
        if (one.skipped) skipped = 1;
        else if (one.status === 'failed') failed = 1;
        else {
          const stored = await getEnrichment(itemId);
          if (stored && isEnrichmentFailure(stored)) failed = 1;
          else enriched = 1;
        }
      } catch {
        failed = 1;
        itemEnrichResults = [{ itemId, status: 'failed', message: 'enrich_failed' }];
      }
    } else {
      const enrichResult = await enrichBatch({
        mode: 'full',
        itemIds: uniqueIds,
        maxItems: maxEnrich,
        force: options.forceEnrich === true,
        skipAi: options.skipAi,
        deferPostProcess: true,
        signal: options.signal,
        collectItemResults: options.collectItemResults,
        refetchCompare: options.refetchCompare,
        onProgress: (p) => {
          const current = p.processed + p.skipped + p.failed;
          report(
            options,
            'enrich',
            `Fetching & extracting… ${current}/${p.total}`,
            current,
            p.total
          );
        },
      });
      enriched = enrichResult.processed;
      skipped = enrichResult.skipped;
      failed = enrichResult.failed;
      enrichCancelled = !!enrichResult.cancelled;
      itemEnrichResults = enrichResult.itemResults;
    }
    notifyDataChanged('enrichment.update');

    if (!options.skipAi) {
      report(options, 'embed', 'Building search embeddings…', 0, 1);
      await yieldToUi();
      try {
        const post = await runEnrichmentBatchPostProcess(uniqueIds, {
          forceEmbed: options.forceEnrich === true,
          signal: options.signal,
          onEmbedProgress: (p) => {
            if (p.phase === 'embed' && p.batchTotal > 0) {
              report(
                options,
                'embed',
                `Building embeddings… batch ${p.batchIndex}/${p.batchTotal}`,
                p.batchIndex,
                p.batchTotal
              );
            } else if (p.phase === 'write') {
              report(options, 'embed', 'Saving embeddings…', p.batchIndex, Math.max(p.batchTotal, 1));
            }
          },
        });
        embedded = post.embed.embedded;
        embedFailed = post.embed.embedFailed;
        embedMessage = formatEmbedBatchMessage(post.embed);
        if (post.embed.skippedNoKey > 0 && post.embed.embedded === 0) {
          embedMessage = embedMessage ?? 'embed skipped (no AI key)';
        }
      } catch (e) {
        if (options.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw e;
        embedMessage = e instanceof Error ? e.message : 'Embed backfill failed';
        console.warn('[itemPipeline] embed post-process failed:', e);
      }
    }
  } else if (doClassify && !options.skipAi) {
    report(options, 'embed', 'Building search embeddings…', 0, 1);
    await yieldToUi();
    try {
      const post = await runEnrichmentBatchPostProcess(uniqueIds, {
        signal: options.signal,
        onEmbedProgress: (p) => {
          if (p.phase === 'embed' && p.batchTotal > 0) {
            report(
              options,
              'embed',
              `Building embeddings… batch ${p.batchIndex}/${p.batchTotal}`,
              p.batchIndex,
              p.batchTotal
            );
          }
        },
      });
      embedded = post.embed.embedded;
      embedFailed = post.embed.embedFailed;
      embedMessage = formatEmbedBatchMessage(post.embed);
    } catch (e) {
      if (options.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw e;
      console.warn('[itemPipeline] embed before classify failed:', e);
    }
  }

  let classified = 0;
  let classifySummary: TopicClassifySummary | undefined;
  let classifyError: string | undefined;
  let discoverMessage: string | undefined;

  if (doClassify && !options.signal?.aborted && !enrichCancelled) {
    // Always run discover before classify — discover is independent of seed taxonomy
    // and ensures there are categories to classify against, even on a fresh DB.
    if (options.skipDiscover !== true && uniqueIds.length > 1 && !options.signal?.aborted) {
      report(options, 'discover', 'Discovering categories…', 0, 1);
      await yieldToUi();
      try {
        await discoverBatch({
          itemIds: uniqueIds,
          enforceBulkRunCap: false,
          stuckOnly: false,
          onlyWithoutCategory: false,
          sampleBatchSize: APP_DISCOVER_MAP_BATCH_SIZE,
          signal: options.signal,
          onProgress: (p) => {
            report(options, 'discover', p.label || 'Discovering categories…', p.current, Math.max(p.total, 1));
          },
        });
        await flushWrites(options, 'Saving discovered categories…');
      } catch (e) {
        if (e instanceof Error && e.message === 'Cancelled') throw e;
        console.warn('[itemPipeline] pre-classify discover failed (non-fatal):', e);
      }
    }

    const enrichById = new Map<string, NonNullable<Awaited<ReturnType<typeof getEnrichment>>>>();
    await Promise.all(
      uniqueIds.map(async (id) => {
        const row = await getEnrichment(id);
        if (row) enrichById.set(id, row);
      })
    );
    const classifyIds = filterDownstreamClassifyEligible(uniqueIds, enrichById);
    const classifyOutcome = await runClassifyWithDiscover(classifyIds, {
      ...options,
      forceClassify,
    });
    classified = classifyOutcome.classified;
    classifySummary = classifyOutcome.classifySummary;
    classifyError = classifyOutcome.classifyError;
    discoverMessage = classifyOutcome.discoverMessage;
  }

  report(options, 'save', 'Finishing up…', 1, 1);
  await yieldToUi();
  await commitPendingDbWrites();
  await refreshPipelineCacheFromWorker();

  // Task E: Post-batch taxonomy merge — consolidate redundant discovered parents/leaves.
  if (uniqueIds.length >= 10 && doClassify && !options.signal?.aborted) {
    try {
      const { runTaxonomyMerge } = await import('../categorization/taxonomyMerge');
      await runTaxonomyMerge({ signal: options.signal });
      await commitPendingDbWrites();
      await refreshPipelineCacheFromWorker();
    } catch (e) {
      console.warn('[itemPipeline] taxonomy merge failed (non-fatal):', e);
    }
  }

  const { invalidatePipelineCatalog } = await import('./pipelineCatalog');
  invalidatePipelineCatalog();

  report(options, 'done', 'Complete', 1, 1);

  const pipelineResult: ItemPipelineResult = {
    enriched,
    skipped,
    failed,
    classified,
    classifySummary,
    enrichCancelled,
    classifyError,
    embedMessage,
    discoverMessage,
    embedded,
    embedFailed,
    remaining: remaining > 0 ? remaining : undefined,
    message: '',
    itemEnrichResults,
  };

  const classifyOnly = !doEnrich && doClassify;
  pipelineResult.message = buildPipelineMessage({
    enriched,
    skipped,
    failed,
    classified,
    classifyError,
    embedMessage,
    discoverMessage,
    remaining,
    total: uniqueIds.length,
    fetchOnly: doEnrich && !doClassify && options.skipAi === true,
    classifyOnly,
    classifySummary,
  });

  if (isPipelineDebugEnabled() && !options.signal?.aborted) {
    try {
      await commitPendingDbWrites();
      const analysisExport = await buildPipelineRunExport({
        itemIds: uniqueIds,
        startedAt: pipelineStartedAt,
        finishedAt: Date.now(),
        action: options.pipelineRunAction ?? 'batch_full',
        batch: pipelineResult,
        enrichResults: itemEnrichResults,
        includeClassify: doClassify,
      });
      const saved = await persistPipelineRunExportIfEnabled(analysisExport);
      if (saved.ok && saved.folder) {
        pipelineResult.pipelineDebugSavedTo = saved.folder;
      } else if (!saved.ok) {
        const err = saved.error ?? 'unknown';
        console.error('[itemPipeline] pipeline debug save failed:', err);
        pipelineResult.message = `${pipelineResult.message} · debug write failed: ${err}`;
      }
    } catch (e) {
      console.error('[itemPipeline] pipeline debug export failed:', e);
    }
  }

  return pipelineResult;
}

export function formatItemPipelineProgress(update: ItemPipelineProgress): string {
  if (update.label?.trim()) return update.label;
  switch (update.phase) {
    case 'prep':
      return 'Preparing…';
    case 'enrich':
      return update.total > 1
        ? `Fetch & AI: ${update.current}/${update.total}`
        : 'Fetching & extracting…';
    case 'embed':
      return 'Building search embeddings…';
    case 'classify':
      return update.total > 1
        ? `Classify: ${update.current}/${update.total}`
        : 'Classifying…';
    case 'discover':
      return 'Discovering topics…';
    case 'save':
      return update.label || 'Saving…';
    case 'done':
      return 'Complete';
    default:
      return 'Processing…';
  }
}

/** Map pipeline progress → modal current/total for the progress bar. */
export function pipelineProgressBar(update: ItemPipelineProgress): {
  current: number;
  total: number;
} {
  switch (update.phase) {
    case 'prep':
      return { current: 0, total: 4 };
    case 'enrich':
      return {
        current: update.total > 0 ? update.current : 0,
        total: Math.max(update.total, 1),
      };
    case 'embed':
      return { current: 2, total: 4 };
    case 'classify':
      return {
        current: update.total > 1 ? update.current : 3,
        total: Math.max(update.total, 4),
      };
    case 'discover':
      return { current: 3, total: 4 };
    case 'save':
      return { current: 4, total: 4 };
    case 'done':
      return { current: 4, total: 4 };
    default:
      return { current: update.current, total: Math.max(update.total, 1) };
  }
}
