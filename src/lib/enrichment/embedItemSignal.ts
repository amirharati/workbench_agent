import { embedTexts } from '../ai/openrouterEmbeddings';
import { loadAISettings } from '../ai/settings';
import { DEFAULT_EMBEDDING_MODEL } from '../categorization/service';
import type { AiItemSignal } from '../categorization/types';
import { notifyDataChanged } from '../dataChangeNotifier';
import { getDB, type Item } from '../db';
import {
  buildEmbeddedSignal,
  buildEmbedFailedSignal,
  collectPendingEmbedRows,
  EMBED_BATCH_SIZE,
} from './embedBackfillPlan';
import type { ItemEnrichment } from './types';
import { commitPipelineEmbeddingSignals } from '../pipeline/pipelineStagePersistence';

export interface EnsureItemEmbeddingResult {
  itemId: string;
  embedded: boolean;
  skipped?: string;
}

export interface EmbedBackfillStats {
  itemsTotal: number;
  aiSummaryOk: number;
  withEmbedding: number;
  pendingEmbed: number;
  embedFailed: number;
  skippedHash: number;
}

export interface EmbedBatchSummary {
  considered: number;
  embedded: number;
  skippedHash: number;
  skippedIneligible: number;
  skippedNoKey: number;
  embedFailed: number;
  pendingAfter: number;
  /** First actionable backend error for this run. */
  aiError?: string;
}

export interface EmbedBackfillProgress {
  batchIndex: number;
  batchTotal: number;
  embeddedSoFar: number;
  phase: 'prepare' | 'embed' | 'write';
}

export interface EmbedIncrementalOptions {
  max?: number;
  itemIds?: string[];
  /** Re-embed even when text hash unchanged (full digest / re-digest). */
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: EmbedBackfillProgress) => void;
}

/** Count embedding coverage for search (enriched items with title+summary vectors). */
export async function getEmbedBackfillStats(): Promise<EmbedBackfillStats> {
  // Avoid full-table embedding materialization in the tab — stats are approximate
  // from meta-only cache (embedding length is empty in tab; pendingEmbed will be high).
  const stats: EmbedBackfillStats = {
    itemsTotal: 0,
    aiSummaryOk: 0,
    withEmbedding: 0,
    pendingEmbed: 0,
    embedFailed: 0,
    skippedHash: 0,
  };
  const db = await getDB();
  if (!db.objectStoreNames.contains('item_enrichment')) return stats;
  const items = await db.getAll('items');
  stats.itemsTotal = items.length;
  const enrichments = await db.getAll('item_enrichment');
  for (const e of enrichments) {
    if (e.aiStatus === 'ok') stats.aiSummaryOk++;
  }
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  for (const s of signals) {
    if (s.signalStatus === 'embed_failed') stats.embedFailed++;
    // Tab cache strips vectors but carries an authoritative dimension count.
    else if (s.embedding.length || (s.embeddingDimensions ?? 0) > 0) stats.withEmbedding++;
  }
  stats.pendingEmbed = Math.max(0, stats.aiSummaryOk - stats.withEmbedding - stats.embedFailed);
  return stats;
}

/** Embed one item (title + summary) into ai_item_signals. Idempotent by textHash. */
export async function ensureItemEmbedding(
  itemId: string,
  _enrichmentOverride?: ItemEnrichment | null
): Promise<EnsureItemEmbeddingResult> {
  const summary = await embedIncrementalBatch({
    max: 1,
    itemIds: [itemId],
  });
  if (summary.embedded > 0) return { itemId, embedded: true };
  if (summary.skippedNoKey > 0) return { itemId, embedded: false, skipped: 'no_api_key' };
  if (summary.embedFailed > 0) return { itemId, embedded: false, skipped: 'embed_failed' };
  return { itemId, embedded: false, skipped: 'hash_unchanged' };
}

/** Backfill embeddings in API batches; writes IndexedDB (backup auto-sync follows). */
export async function embedIncrementalBatch(
  opts: EmbedIncrementalOptions = {}
): Promise<EmbedBatchSummary> {
  const summary: EmbedBatchSummary = {
    considered: 0,
    embedded: 0,
    skippedHash: 0,
    skippedIneligible: 0,
    skippedNoKey: 0,
    embedFailed: 0,
    pendingAfter: 0,
  };

  if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

  opts.onProgress?.({ phase: 'prepare', batchIndex: 0, batchTotal: 0, embeddedSoFar: 0 });

  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return summary;

  // Scoped digests: load only those rows — never walk the full embedding table.
  let items: Item[];
  let enrichments: ItemEnrichment[];
  let signals: AiItemSignal[];

  if (opts.itemIds?.length) {
    const scopedItems: Item[] = [];
    const scopedEnrich: ItemEnrichment[] = [];
    for (const id of opts.itemIds) {
      const item = (await db.get('items', id)) as Item | undefined;
      if (item) scopedItems.push(item);
      if (db.objectStoreNames.contains('item_enrichment')) {
        const enr = (await db.get('item_enrichment', id)) as ItemEnrichment | undefined;
        if (enr) scopedEnrich.push(enr);
      }
    }
    // Full embeddings live in the worker — tab cache is meta-only.
    const { getSignalsByItemIds } = await import('../storage/dbClient');
    const scopedSignals = (await getSignalsByItemIds<AiItemSignal>(opts.itemIds)) ?? [];
    items = scopedItems;
    enrichments = scopedEnrich;
    signals = scopedSignals;
  } else {
    // Unscoped embed backfill is unsafe on large libraries (full embedding table).
    console.warn('[embedIncrementalBatch] refusing unscoped embed — pass itemIds');
    return summary;
  }

  const { pending, summary: plan } = await collectPendingEmbedRows(items, enrichments, signals, {
    max: opts.max,
    itemIds: opts.itemIds,
    force: opts.force,
  });

  summary.pendingAfter = pending.length;
  summary.skippedIneligible = plan.skippedIneligible;
  summary.skippedHash = plan.skippedHash;

  if (!pending.length) return summary;

  summary.considered = pending.length;

  const aiSettings = await loadAISettings();
  if (!aiSettings.apiKey.trim()) {
    summary.skippedNoKey = pending.length;
    summary.aiError = 'AI configuration error: Missing API key for embeddings. Check Settings > AI.';
    return summary;
  }

  const batchTotal = Math.ceil(pending.length / EMBED_BATCH_SIZE);
  let embeddedSoFar = 0;

  for (let b = 0; b < batchTotal; b++) {
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const batch = pending.slice(b * EMBED_BATCH_SIZE, (b + 1) * EMBED_BATCH_SIZE);
    opts.onProgress?.({
      phase: 'embed',
      batchIndex: b + 1,
      batchTotal,
      embeddedSoFar,
    });

    let vectors: number[][];
    try {
      vectors = await embedTexts(
        {
          apiKey: aiSettings.apiKey,
          baseUrl: aiSettings.baseUrl,
          model: DEFAULT_EMBEDDING_MODEL,
          timeoutMs: 60_000,
        },
        batch.map((row) => row.text),
        EMBED_BATCH_SIZE,
        opts.signal
      );

    } catch (error) {
      if (opts.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }
      const now = Date.now();
      await commitPipelineEmbeddingSignals(
        batch.map((row): AiItemSignal => ({
          ...buildEmbedFailedSignal(row),
          lastProcessedAt: now,
        }))
      );
      summary.embedFailed += batch.length;
      summary.aiError ??= error instanceof Error ? error.message : String(error);
      // A provider/configuration failure applies to the whole run. Do not
      // repeat the same failing request for every remaining batch.
      break;
    }

    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    opts.onProgress?.({
      phase: 'write',
      batchIndex: b + 1,
      batchTotal,
      embeddedSoFar,
    });
    const now = Date.now();
    await commitPipelineEmbeddingSignals(
      batch.map((row, index): AiItemSignal => ({
        ...buildEmbeddedSignal(row, vectors[index]),
        lastProcessedAt: now,
      }))
    );
    embeddedSoFar += batch.length;
    summary.embedded += batch.length;
  }

  if (summary.embedded > 0) {
    notifyDataChanged('enrichment.update');
  }

  let freshSignals: AiItemSignal[];
  if (opts.itemIds?.length) {
    const { getSignalsByItemIds } = await import('../storage/dbClient');
    freshSignals = (await getSignalsByItemIds<AiItemSignal>(opts.itemIds)) ?? [];
  } else {
    freshSignals = [];
  }
  const remaining = await collectPendingEmbedRows(items, enrichments, freshSignals, {
    itemIds: opts.itemIds,
  });
  summary.pendingAfter = remaining.pending.length;

  return summary;
}
