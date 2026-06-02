/**
 * Single pipeline path for fetch → AI → embed → classify → discover.
 * All UI entry points (Import, Hub re-digest, Inspector, Classify) use this.
 */
import {
  classifyIncremental,
  discoverBatch,
  listItemIdsWithoutCategory,
  listItemIdsWithGeneralCategory,
  reconcileStaleIneligibleSignals,
} from '../categorization';
import { loadItemIdsForPipelineQueue } from './itemPipelineContext';
import type { TopicClassifySummary } from '../categorization/types';
import { notifyDataChanged } from '../dataChangeNotifier';
import { commitPendingDbWrites, refreshPipelineCacheFromWorker } from '../db';
import {
  enrichBatch,
  enrichOne,
  type EnrichmentResult,
} from '../enrichment';
import {
  formatEmbedBatchMessage,
  prepBatchPipelineItems,
  runEnrichmentBatchPostProcess,
} from './batchPostProcess';
import type { PipelineReportAction } from './pipelineBatchReport';
import { buildPipelineRunExport } from './pipelineRunAnalysis';
import {
  markPipelineRunStarted,
  persistPipelineRunExportIfEnabled,
} from './pipelineRunStore';
import { isPipelineDebugEnabled } from '../enrichment/pipelineDebug';

export const PIPELINE_DEFAULTS = {
  maxEnrich: 50,
} as const;

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
  await reconcileStaleIneligibleSignals();
  await commitPendingDbWrites();
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

  // Always drain the full pending_classify queue — not just the current batch.
  // If a previous run was interrupted, those items stay in pending_classify but
  // are not in the current batch's itemIds. Merging the queue here ensures every
  // classify run finishes the job regardless of how many batches were imported.
  const queuedIds = await loadItemIdsForPipelineQueue('pending_classify');
  const mergedIds = queuedIds.length > 0
    ? [...new Set([...itemIds, ...queuedIds])]
    : itemIds;

  const classifyDebugStart = Date.now();
  const classifyDebugMeta = {
    batchIds: itemIds.length,
    queuedIds: queuedIds.length,
    mergedIds: mergedIds.length,
  };

  report(opts, 'classify', 'Classifying…', 0, Math.max(1, mergedIds.length));
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

  // One discover + reclassify shot per pipeline run for items with no category.
  // Skip for single-item / interactive classify — discover is a slow LLM taxonomy-expansion
  // call (30–60 s) and is only useful for bulk batches, not quick Hub classify.
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
          sampleBatchSize: 24,
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
          sampleBatchSize: 24,
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
  // Classify-only path (Hub "Classify pending" button).
  if (input.classifyOnly && input.classifySummary) {
    const s = input.classifySummary;
    const categorized = s.classifiedSpecific + s.classifiedGeneral;
    const parts: string[] = [];
    if (categorized > 0) parts.push(`${categorized} categorized`);
    if (s.llmErrors > 0) parts.push(`${s.llmErrors} AI errors`);
    if (input.classifyError) parts.push(input.classifyError);
    return parts.length ? parts.join(' · ') : `${input.total} checked — already up to date`;
  }

  // Full pipeline path (import / batch run).
  const parts: string[] = [];

  // Primary: what got done.
  if (input.classified > 0) {
    parts.push(`${input.classified} categorized`);
  }
  if (input.enriched > 0) {
    parts.push(input.fetchOnly ? `${input.enriched} fetched` : `${input.enriched} fetched`);
  }

  // Warnings: only surface failures and classify errors.
  if (input.classifyError) parts.push(input.classifyError);
  if (input.failed > 0) parts.push(`${input.failed} failed`);
  if (input.remaining && input.remaining > 0) {
    parts.push(`${input.remaining} remaining`);
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
  const processAll = options.processAll === true;

  const maxEnrich = processAll
    ? uniqueIds.length
    : (options.maxEnrich ?? PIPELINE_DEFAULTS.maxEnrich);
  const remaining = processAll
    ? 0
    : doEnrich && doClassify
      ? Math.max(0, uniqueIds.length - maxEnrich)
      : doEnrich
        ? Math.max(0, uniqueIds.length - maxEnrich)
        : 0;

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
        else enriched = 1;
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
        embedMessage = e instanceof Error ? e.message : 'Embed backfill failed';
        console.warn('[itemPipeline] embed post-process failed:', e);
      }
    }
  } else if (doClassify && !options.skipAi) {
    report(options, 'embed', 'Building search embeddings…', 0, 1);
    await yieldToUi();
    try {
      const post = await runEnrichmentBatchPostProcess(uniqueIds, {
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

    const classifyOutcome = await runClassifyWithDiscover(uniqueIds, {
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
