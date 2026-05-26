import { DEFAULT_EMBEDDING_MODEL } from '../categorization/service';
import { l2Normalize } from '../categorization/math';
import { hashText } from '../categorization/textHash';
import type { AiItemSignal } from '../categorization/types';
import type { Item } from '../db';
import {
  buildSearchEmbedText,
  MIN_SEARCH_EMBED_TEXT_LENGTH,
} from './searchEmbedText';
import type { ItemEnrichment } from './types';

export const EMBED_BATCH_SIZE = 32;

export interface PendingEmbedRow {
  itemId: string;
  text: string;
  textHash: string;
  prev?: AiItemSignal;
}

export interface CollectPendingEmbedOptions {
  max?: number;
  itemIds?: string[];
}

export interface EmbedPlanSummary {
  considered: number;
  toEmbed: number;
  skippedHash: number;
  skippedIneligible: number;
}

function baseSignal(prev: AiItemSignal | undefined, itemId: string): AiItemSignal {
  return {
    itemId,
    textHash: prev?.textHash ?? '',
    classifyTextHash: prev?.classifyTextHash,
    embeddingModel: prev?.embeddingModel ?? '',
    embedding: prev?.embedding ?? [],
    derivedTags: prev?.derivedTags ?? [],
    signalStatus: prev?.signalStatus ?? 'ok',
    classifyState: prev?.classifyState,
    discoverState: prev?.discoverState,
    isNovelty: prev?.isNovelty,
    classifyRetryCount: prev?.classifyRetryCount,
    lastClassifySkipReason: prev?.lastClassifySkipReason,
    eligibilityReason: prev?.eligibilityReason,
    inputQualityTier: prev?.inputQualityTier,
    lastProcessedAt: prev?.lastProcessedAt ?? Date.now(),
    lastClassifiedAt: prev?.lastClassifiedAt,
    llmReview: prev?.llmReview,
  };
}

export function hasCurrentSearchEmbedding(
  prev: AiItemSignal | undefined,
  textHash: string
): boolean {
  return Boolean(
    prev?.embedding?.length &&
      prev.embeddingModel === DEFAULT_EMBEDDING_MODEL &&
      prev.textHash === textHash
  );
}

/** Pure embed queue — shared by app IndexedDB path and CLI backup path. */
export async function collectPendingEmbedRows(
  items: Item[],
  enrichments: ItemEnrichment[],
  signals: AiItemSignal[],
  opts: CollectPendingEmbedOptions = {}
): Promise<{ pending: PendingEmbedRow[]; summary: EmbedPlanSummary }> {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));

  const summary: EmbedPlanSummary = {
    considered: 0,
    toEmbed: 0,
    skippedHash: 0,
    skippedIneligible: 0,
  };

  let candidates = enrichments.filter((e) => e.aiStatus === 'ok');
  if (opts.itemIds?.length) {
    const idSet = new Set(opts.itemIds);
    candidates = candidates.filter((e) => idSet.has(e.itemId));
  }

  const pending: PendingEmbedRow[] = [];

  for (const enrichment of candidates) {
    summary.considered++;
    const item = itemById.get(enrichment.itemId);
    if (!item) {
      summary.skippedIneligible++;
      continue;
    }

    const text = buildSearchEmbedText(item, enrichment);
    if (text.length < MIN_SEARCH_EMBED_TEXT_LENGTH) {
      summary.skippedIneligible++;
      continue;
    }

    const textHash = await hashText(text);
    const prev = signalByItem.get(enrichment.itemId);
    if (hasCurrentSearchEmbedding(prev, textHash)) {
      summary.skippedHash++;
      continue;
    }

    pending.push({ itemId: enrichment.itemId, text, textHash, prev });
  }

  const max = opts.max ?? pending.length;
  summary.toEmbed = Math.min(pending.length, max);

  return { pending: pending.slice(0, max), summary };
}

export function buildEmbeddedSignal(
  row: PendingEmbedRow,
  vector: number[],
  model: string = DEFAULT_EMBEDDING_MODEL
): AiItemSignal {
  return {
    ...baseSignal(row.prev, row.itemId),
    textHash: row.textHash,
    embeddingModel: model,
    embedding: l2Normalize(vector),
    signalStatus: 'ok',
    lastProcessedAt: Date.now(),
  };
}

export function buildEmbedFailedSignal(row: PendingEmbedRow): AiItemSignal {
  return {
    ...baseSignal(row.prev, row.itemId),
    textHash: row.textHash,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    embedding: row.prev?.textHash === row.textHash ? row.prev.embedding ?? [] : [],
    signalStatus: 'embed_failed',
    lastProcessedAt: Date.now(),
  };
}
