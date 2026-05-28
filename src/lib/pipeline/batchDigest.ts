import { classifyIncremental } from '../categorization';
import type { TopicClassifySummary } from '../categorization/types';
import { notifyDataChanged } from '../dataChangeNotifier';
import { enrichBatch, type EnrichmentResult } from '../enrichment';

export const BATCH_DIGEST_DEFAULTS = {
  maxEnrich: 50,
  maxClassify: 25,
} as const;

export type BatchDigestPhase = 'enrich' | 'classify' | 'done';

export interface BatchDigestProgress {
  phase: BatchDigestPhase;
  label: string;
  current: number;
  total: number;
}

export interface BatchDigestResult {
  enriched: number;
  skipped: number;
  failed: number;
  classified: number;
  classifySummary?: TopicClassifySummary;
  enrichCancelled?: boolean;
  classifyError?: string;
  remaining?: number;
  message: string;
  itemEnrichResults?: EnrichmentResult[];
}

export function formatClassifyBatchMessage(
  selected: number,
  summary: TopicClassifySummary
): string {
  const parts: string[] = [`${selected} selected`];
  const skipTotal =
    summary.skippedIneligible + summary.skippedHash + summary.skippedManualReview;

  if (skipTotal > 0) {
    const bits: string[] = [];
    if (summary.skippedIneligible > 0) bits.push(`${summary.skippedIneligible} ineligible`);
    if (summary.skippedHash > 0) bits.push(`${summary.skippedHash} unchanged`);
    if (summary.skippedManualReview > 0) bits.push(`${summary.skippedManualReview} in manual review`);
    parts.push(`${skipTotal} skipped (${bits.join(', ')})`);
  }

  if (summary.processed > 0) {
    parts.push(`${summary.processed} sent to AI`);
  }

  const categorized = summary.classifiedSpecific + summary.classifiedGeneral;
  if (categorized > 0) {
    const catBits: string[] = [];
    if (summary.classifiedSpecific > 0) catBits.push(`${summary.classifiedSpecific} specific`);
    if (summary.classifiedGeneral > 0) catBits.push(`${summary.classifiedGeneral} general/Other`);
    parts.push(`${categorized} got a category (${catBits.join(', ')})`);
  }

  if (summary.pendingDiscover > 0) {
    parts.push(
      `${summary.pendingDiscover} still need discover — stay in classify queue until discover runs`
    );
  }

  if (summary.llmErrors > 0) {
    parts.push(`${summary.llmErrors} AI errors — check Inspector or retry`);
  }

  if (summary.processed === 0 && skipTotal === 0 && categorized === 0) {
    return `${selected} selected — nothing to run (queue may have updated)`;
  }

  return parts.join(' · ');
}

function buildBatchMessage(input: {
  enriched: number;
  skipped: number;
  failed: number;
  classified: number;
  classifyError?: string;
  remaining?: number;
  total: number;
}): string {
  const parts: string[] = [];
  if (input.enriched > 0) parts.push(`${input.enriched} fetched & summarized`);
  if (input.skipped > 0) {
    parts.push(
      input.skipped === input.total && input.enriched === 0 && input.failed === 0
        ? `${input.skipped} unchanged (no re-fetch needed)`
        : `${input.skipped} unchanged`
    );
  }
  if (input.failed > 0) parts.push(`${input.failed} failed`);
  if (input.classified > 0) parts.push(`${input.classified} classified`);
  if (input.classifyError) parts.push(input.classifyError);
  if (input.remaining && input.remaining > 0) {
    parts.push(`${input.remaining} more remain`);
  }
  if (parts.length === 0) return `Checked ${input.total} — already up to date`;
  return parts.join(' · ');
}

export function formatBatchDigestProgress(update: BatchDigestProgress): string {
  switch (update.phase) {
    case 'enrich':
      return `Step 1/2 — Fetch & AI extract: ${update.current}/${update.total}`;
    case 'classify':
      return `Step 2/2 — Classify: ${update.current}/${update.total}`;
    case 'done':
      return 'Pipeline complete';
    default:
      return update.label;
  }
}

/**
 * Run enrich → classify for a scoped set of bookmark ids.
 * Reuses enrichBatch + classifyIncremental (hash-aware skip, no force by default).
 */
export async function runBatchDigest(
  itemIds: string[],
  options?: {
    enrich?: boolean;
    classify?: boolean;
    maxEnrich?: number;
    maxClassify?: number;
    /** When true, process all ids in one enrich pass (Import Studio post-commit). */
    processAll?: boolean;
    onProgress?: (update: BatchDigestProgress) => void;
    signal?: AbortSignal;
    collectItemResults?: boolean;
    /** Re-fetch and compare content hash (import pipeline / merged bookmarks). */
    refetchCompare?: boolean;
  }
): Promise<BatchDigestResult> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {
      enriched: 0,
      skipped: 0,
      failed: 0,
      classified: 0,
      message: 'No items to process',
    };
  }

  const doEnrich = options?.enrich !== false;
  const doClassify = options?.classify !== false;
  const maxEnrich =
    options?.processAll === true
      ? uniqueIds.length
      : (options?.maxEnrich ?? BATCH_DIGEST_DEFAULTS.maxEnrich);
  const maxClassify =
    options?.processAll === true
      ? uniqueIds.length
      : (options?.maxClassify ?? BATCH_DIGEST_DEFAULTS.maxClassify);
  const remaining =
    options?.processAll === true
      ? 0
      : doEnrich && doClassify
        ? Math.max(0, uniqueIds.length - maxEnrich)
        : doClassify
          ? Math.max(0, uniqueIds.length - maxClassify)
          : Math.max(0, uniqueIds.length - maxEnrich);

  let enriched = 0;
  let skipped = 0;
  let failed = 0;
  let enrichCancelled = false;
  let itemEnrichResults: EnrichmentResult[] | undefined;

  if (doEnrich) {
    const enrichResult = await enrichBatch({
      mode: 'full',
      itemIds: uniqueIds,
      maxItems: maxEnrich,
      force: false,
      signal: options?.signal,
      collectItemResults: options?.collectItemResults,
      refetchCompare: options?.refetchCompare,
      onProgress: (p) => {
        const current = p.processed + p.skipped + p.failed;
        options?.onProgress?.({
          phase: 'enrich',
          label: 'Fetching and extracting…',
          current,
          total: p.total,
        });
      },
    });
    enriched = enrichResult.processed;
    skipped = enrichResult.skipped;
    failed = enrichResult.failed;
    enrichCancelled = !!enrichResult.cancelled;
    itemEnrichResults = enrichResult.itemResults;
    notifyDataChanged('enrichment.update');
  }

  let classified = 0;
  let classifyError: string | undefined;
  let classifySummary: TopicClassifySummary | undefined;

  if (doClassify && !options?.signal?.aborted && !enrichCancelled) {
    options?.onProgress?.({
      phase: 'classify',
      label: 'Classifying…',
      current: 0,
      total: Math.min(uniqueIds.length, maxClassify),
    });
    try {
      const classifyResult = await classifyIncremental({
        itemIds: uniqueIds,
        maxItems: maxClassify,
        autoDiscover: false,
        onProgress: (p) => {
          options?.onProgress?.({
            phase: 'classify',
            label: p.label || 'Classifying…',
            current: p.current,
            total: p.total,
          });
        },
      });
      classifySummary = classifyResult.summary;
      classified = classifyResult.summary.classifiedSpecific + classifyResult.summary.classifiedGeneral;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Classification failed';
      if (/missing api key/i.test(msg)) {
        classifyError = 'classification skipped (no AI key)';
      } else if (/no taxonomy loaded/i.test(msg)) {
        classifyError = 'classification skipped (import taxonomy in Settings)';
      } else {
        classifyError = msg;
      }
    }
    notifyDataChanged('categorization.update');
  }

  options?.onProgress?.({
    phase: 'done',
    label: 'Batch complete',
    current: 1,
    total: 1,
  });

  const message =
    doClassify && !doEnrich && classifySummary
      ? formatClassifyBatchMessage(uniqueIds.length, classifySummary)
      : doClassify && classifySummary && doEnrich
        ? `${buildBatchMessage({
            enriched,
            skipped,
            failed,
            classified,
            classifyError,
            remaining,
            total: uniqueIds.length,
          })} · ${formatClassifyBatchMessage(uniqueIds.length, classifySummary)}`
        : buildBatchMessage({
            enriched,
            skipped,
            failed,
            classified,
            classifyError,
            remaining,
            total: uniqueIds.length,
          });

  return {
    enriched,
    skipped,
    failed,
    classified,
    classifySummary,
    enrichCancelled,
    classifyError,
    remaining: remaining > 0 ? remaining : undefined,
    message,
    itemEnrichResults,
  };
}
