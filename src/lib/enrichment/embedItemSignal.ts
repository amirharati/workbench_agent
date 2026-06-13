import { embedTexts } from '../ai/openrouterEmbeddings';
import { loadAISettings } from '../ai/settings';
import { DEFAULT_EMBEDDING_MODEL } from '../categorization/service';
import { hashText } from '../categorization/textHash';
import type { AiItemSignal } from '../categorization/types';
import { notifyDataChanged } from '../dataChangeNotifier';
import { getDB } from '../db';
import {
  buildEmbeddedSignal,
  buildEmbedFailedSignal,
  collectPendingEmbedRows,
  EMBED_BATCH_SIZE,
  hasCurrentSearchEmbedding,
} from './embedBackfillPlan';
import { buildSearchEmbedText, MIN_SEARCH_EMBED_TEXT_LENGTH } from './searchEmbedText';
import type { ItemEnrichment } from './types';

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
  onProgress?: (p: EmbedBackfillProgress) => void;
}

/** Count embedding coverage for search (enriched items with title+summary vectors). */
export async function getEmbedBackfillStats(): Promise<EmbedBackfillStats> {
  const db = await getDB();
  const stats: EmbedBackfillStats = {
    itemsTotal: 0,
    aiSummaryOk: 0,
    withEmbedding: 0,
    pendingEmbed: 0,
    embedFailed: 0,
    skippedHash: 0,
  };

  if (!db.objectStoreNames.contains('item_enrichment')) return stats;

  const items = await db.getAll('items');
  stats.itemsTotal = items.length;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const enrichments = await db.getAll('item_enrichment');
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));

  for (const enrichment of enrichments) {
    if (enrichment.aiStatus !== 'ok') continue;
    stats.aiSummaryOk++;
    const item = itemById.get(enrichment.itemId);
    if (!item) continue;

    const text = buildSearchEmbedText(item, enrichment);
    if (text.length < MIN_SEARCH_EMBED_TEXT_LENGTH) continue;

    const textHash = await hashText(text);
    const prev = signalByItem.get(enrichment.itemId);
    if (prev?.signalStatus === 'embed_failed') stats.embedFailed++;

    if (hasCurrentSearchEmbedding(prev, textHash)) {
      stats.withEmbedding++;
    } else {
      stats.pendingEmbed++;
    }
  }

  const { summary } = await collectPendingEmbedRows(items, enrichments, signals);
  stats.skippedHash = summary.skippedHash;

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

  opts.onProgress?.({ phase: 'prepare', batchIndex: 0, batchTotal: 0, embeddedSoFar: 0 });

  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return summary;

  const items = await db.getAll('items');
  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const signals = await db.getAll('ai_item_signals');

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
    return summary;
  }

  const batchTotal = Math.ceil(pending.length / EMBED_BATCH_SIZE);
  let embeddedSoFar = 0;

  for (let b = 0; b < batchTotal; b++) {
    const batch = pending.slice(b * EMBED_BATCH_SIZE, (b + 1) * EMBED_BATCH_SIZE);
    opts.onProgress?.({
      phase: 'embed',
      batchIndex: b + 1,
      batchTotal,
      embeddedSoFar,
    });

    try {
      const vectors = await embedTexts(
        {
          apiKey: aiSettings.apiKey,
          baseUrl: aiSettings.baseUrl,
          model: DEFAULT_EMBEDDING_MODEL,
          timeoutMs: 60_000,
        },
        batch.map((row) => row.text),
        EMBED_BATCH_SIZE
      );

      opts.onProgress?.({
        phase: 'write',
        batchIndex: b + 1,
        batchTotal,
        embeddedSoFar,
      });

      const now = Date.now();
      const tx = db.transaction(['ai_item_signals'], 'readwrite');
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const signal: AiItemSignal = {
          ...buildEmbeddedSignal(row, vectors[i]),
          lastProcessedAt: now,
        };
        await tx.objectStore('ai_item_signals').put(signal);
      }
      await tx.done;

      embeddedSoFar += batch.length;
      summary.embedded += batch.length;
    } catch {
      const now = Date.now();
      const tx = db.transaction(['ai_item_signals'], 'readwrite');
      for (const row of batch) {
        const signal: AiItemSignal = {
          ...buildEmbedFailedSignal(row),
          lastProcessedAt: now,
        };
        await tx.objectStore('ai_item_signals').put(signal);
      }
      await tx.done;
      summary.embedFailed += batch.length;
    }
  }

  if (summary.embedded > 0) {
    notifyDataChanged('enrichment.update');
  }

  const remaining = await collectPendingEmbedRows(items, enrichments, await db.getAll('ai_item_signals'), {
    itemIds: opts.itemIds,
  });
  summary.pendingAfter = remaining.pending.length;

  return summary;
}
