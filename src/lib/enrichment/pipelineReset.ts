import { notifyDataChanged } from '../dataChangeNotifier';
import { getDB } from '../db';
import type { AiCategory, AiItemSignal } from '../categorization/types';
import { linkCountsForCategories } from '../categorization/counts';
import { isGeneralLeafId } from '../categorization/taxonomyCatalog';
import { deleteEnrichmentForItem, getEnrichment } from './fetchService';
import { putEnrichment } from './storage';
import { deleteRawBody, reviewRawRefForItem } from './rawBodyStore';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);

export type PipelineStageClear = 'fetch' | 'ai' | 'embed' | 'classify' | 'all';

export type ClearItemPipelineStageResult = {
  stage: PipelineStageClear;
  itemIds: string[];
};

async function deleteReviewRawBody(itemId: string): Promise<void> {
  const dir = await (async () => {
    try {
      const { getBackupDirectoryHandle, hasWritableBackupFolder } = await import('../backupFolder');
      if (!(await hasWritableBackupFolder())) return null;
      const root = await getBackupDirectoryHandle();
      if (!root) return null;
      return root.getDirectoryHandle('enrichment-cache');
    } catch {
      return null;
    }
  })();
  if (!dir) return;
  try {
    await dir.removeEntry(reviewRawRefForItem(itemId));
  } catch {
    /* may not exist */
  }
}

async function removeCategoryLinksForItems(idSet: Set<string>): Promise<number> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) return 0;
  const all = await db.getAll('ai_item_category_links');
  const tx = db.transaction(['ai_item_category_links'], 'readwrite');
  let removed = 0;
  for (const row of all) {
    if (!idSet.has(row.itemId)) continue;
    await tx.objectStore('ai_item_category_links').delete(row.id);
    removed++;
  }
  await tx.done;
  return removed;
}

async function resetCategoryCountsFromLinks(): Promise<void> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_categories')) return;
  const categories = await db.getAll('ai_categories');
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const counts = linkCountsForCategories(categories, links);
  const tx = db.transaction(['ai_categories'], 'readwrite');
  for (const cat of categories) {
    const c = counts.get(cat.id);
    const next: AiCategory = {
      ...cat,
      itemCount: c?.itemCount ?? 0,
      primaryItemCount: c?.primaryItemCount ?? 0,
      secondaryItemCount: c?.secondaryItemCount ?? 0,
      updated_at: Date.now(),
    };
    await tx.objectStore('ai_categories').put(next);
  }
  await tx.done;
}

async function clearClassifyForItems(idSet: Set<string>): Promise<void> {
  const db = await getDB();
  await removeCategoryLinksForItems(idSet);
  await resetCategoryCountsFromLinks();

  if (!db.objectStoreNames.contains('ai_item_signals')) return;
  const now = Date.now();
  for (const itemId of idSet) {
    const prev = await db.get('ai_item_signals', itemId);
    if (!prev) continue;
    await db.put('ai_item_signals', {
      ...prev,
      itemId,
      classifyState: 'pending_classify',
      classifyTextHash: '',
      discoverState: 'none',
      isNovelty: false,
      classifyRetryCount: 0,
      lastClassifySkipReason: undefined,
      lastClassifiedAt: undefined,
      llmReview: undefined,
      lastProcessedAt: now,
    });
  }
}

async function clearEmbedForItems(idSet: Set<string>): Promise<void> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return;
  const now = Date.now();
  for (const itemId of idSet) {
    const prev = await db.get('ai_item_signals', itemId);
    if (!prev) continue;
    await db.put('ai_item_signals', {
      ...prev,
      itemId,
      embedding: [],
      textHash: '',
      signalStatus: 'insufficient_enrichment',
      lastProcessedAt: now,
    });
  }
}

async function clearAiForItems(idSet: Set<string>): Promise<void> {
  const now = Date.now();
  for (const itemId of idSet) {
    const existing = await getEnrichment(itemId);
    if (!existing) continue;
    await putEnrichment({
      ...existing,
      summary: undefined,
      aiTags: undefined,
      aiKeyPoints: undefined,
      aiStatus: undefined,
      aiError: undefined,
      aiAt: undefined,
      failureStage: undefined,
      failureCategory: undefined,
      updated_at: now,
    });
  }
  await clearEmbedForItems(idSet);
}

async function clearFetchForItems(idSet: Set<string>): Promise<void> {
  for (const itemId of idSet) {
    await deleteReviewRawBody(itemId);
    await deleteEnrichmentForItem(itemId);
  }
  await clearClassifyForItems(idSet);
  const db = await getDB();
  if (db.objectStoreNames.contains('ai_item_signals')) {
    for (const itemId of idSet) {
      try {
        await db.delete('ai_item_signals', itemId);
      } catch {
        /* ok */
      }
    }
  }
}

/**
 * Delete stored pipeline data for one stage (not undo — clears so you can re-run from scratch).
 * Inspector / debug use only.
 */
export async function clearItemPipelineStage(
  itemIds: string[],
  stage: PipelineStageClear
): Promise<ClearItemPipelineStageResult> {
  const ids = [...new Set(itemIds.filter(Boolean))];
  if (!ids.length) return { stage, itemIds: [] };
  const idSet = new Set(ids);

  switch (stage) {
    case 'all':
      await clearPipelineData({ itemIds: ids });
      break;
    case 'classify':
      await clearClassifyForItems(idSet);
      notifyDataChanged('categorization.update');
      break;
    case 'embed':
      await clearEmbedForItems(idSet);
      notifyDataChanged('enrichment.update');
      break;
    case 'ai':
      await clearAiForItems(idSet);
      notifyDataChanged('enrichment.update');
      break;
    case 'fetch':
      await clearFetchForItems(idSet);
      notifyDataChanged('pipeline.clear');
      break;
  }

  return { stage, itemIds: ids };
}

export type ClearPipelineDataOptions = {
  /** If set, only these bookmarks; otherwise entire library. */
  itemIds?: string[];
  /** Keep taxonomy rows (seed); clear links/signals and zero counts. Default true. */
  keepTaxonomy?: boolean;
  /** Also remove seed/discovered taxonomy. Default false. */
  clearTaxonomy?: boolean;
};

export type ClearPipelineDataResult = {
  enrichmentsRemoved: number;
  signalsRemoved: number;
  linksRemoved: number;
  categoriesReset: boolean;
  taxonomyCleared: boolean;
};

/**
 * Remove enrichment + per-item categorization data so you can re-run fetch → classify on a clean slice.
 * Bookmarks (items) are kept.
 */
export async function clearPipelineData(
  opts: ClearPipelineDataOptions = {}
): Promise<ClearPipelineDataResult> {
  const db = await getDB();
  const idFilter = opts.itemIds?.length ? new Set(opts.itemIds) : null;
  const keepTaxonomy = opts.clearTaxonomy ? false : opts.keepTaxonomy !== false;

  let enrichmentsRemoved = 0;
  let signalsRemoved = 0;
  let linksRemoved = 0;

  if (db.objectStoreNames.contains('item_enrichment')) {
    const all = await db.getAll('item_enrichment');
    const tx = db.transaction(['item_enrichment'], 'readwrite');
    for (const row of all) {
      if (idFilter && !idFilter.has(row.itemId)) continue;
      await deleteReviewRawBody(row.itemId);
      await deleteRawBody(row.itemId);
      await tx.objectStore('item_enrichment').delete(row.itemId);
      enrichmentsRemoved++;
    }
    await tx.done;
  }

  if (db.objectStoreNames.contains('ai_item_signals')) {
    const all = await db.getAll('ai_item_signals');
    const tx = db.transaction(['ai_item_signals'], 'readwrite');
    for (const row of all) {
      if (idFilter && !idFilter.has(row.itemId)) continue;
      await tx.objectStore('ai_item_signals').delete(row.itemId);
      signalsRemoved++;
    }
    await tx.done;
  }

  if (db.objectStoreNames.contains('ai_item_category_links')) {
    const all = await db.getAll('ai_item_category_links');
    const tx = db.transaction(['ai_item_category_links'], 'readwrite');
    for (const row of all) {
      if (idFilter && !idFilter.has(row.itemId)) continue;
      await tx.objectStore('ai_item_category_links').delete(row.id);
      linksRemoved++;
    }
    await tx.done;
  }

  let categoriesReset = false;
  let taxonomyCleared = false;

  if (opts.clearTaxonomy && db.objectStoreNames.contains('ai_categories')) {
    const tx = db.transaction(['ai_categories', 'ai_taxonomy_state'], 'readwrite');
    const cats = await tx.objectStore('ai_categories').getAll();
    for (const c of cats) {
      await tx.objectStore('ai_categories').delete(c.id);
    }
    if (db.objectStoreNames.contains('ai_taxonomy_state')) {
      await tx.objectStore('ai_taxonomy_state').delete('default');
    }
    await tx.done;
    taxonomyCleared = true;
  } else if (keepTaxonomy && db.objectStoreNames.contains('ai_categories')) {
    const categories = await db.getAll('ai_categories');
    const links = db.objectStoreNames.contains('ai_item_category_links')
      ? await db.getAll('ai_item_category_links')
      : [];
    const scopedLinks = idFilter
      ? links.filter((l) => idFilter.has(l.itemId))
      : [];
    const counts = linkCountsForCategories(categories, idFilter ? scopedLinks : links);
    const tx = db.transaction(['ai_categories'], 'readwrite');
    for (const cat of categories) {
      const c = counts.get(cat.id);
      const next: AiCategory = {
        ...cat,
        itemCount: c?.itemCount ?? 0,
        primaryItemCount: c?.primaryItemCount ?? 0,
        secondaryItemCount: c?.secondaryItemCount ?? 0,
        updated_at: Date.now(),
      };
      await tx.objectStore('ai_categories').put(next);
    }
    await tx.done;
    categoriesReset = true;
  }

  notifyDataChanged('pipeline.clear');

  return {
    enrichmentsRemoved,
    signalsRemoved,
    linksRemoved,
    categoriesReset,
    taxonomyCleared,
  };
}

/** Align classifyState with existing primary links (fixes stale pending_classify). */
export async function syncClassifySignalsFromLinks(itemIds?: string[]): Promise<number> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals') || !db.objectStoreNames.contains('ai_item_category_links')) {
    return 0;
  }
  const idFilter = itemIds?.length ? new Set(itemIds) : null;
  const links = await db.getAll('ai_item_category_links');
  const primaryByItem = new Map<string, string>();
  for (const l of links) {
    if (idFilter && !idFilter.has(l.itemId)) continue;
    if (l.source !== 'ai' || !l.isPrimary || !COUNTABLE_STATUSES.has(l.status)) continue;
    primaryByItem.set(l.itemId, l.categoryId);
  }

  let updated = 0;
  const now = Date.now();
  const tx = db.transaction(['ai_item_signals'], 'readwrite');
  const store = tx.objectStore('ai_item_signals');

  for (const [itemId, categoryId] of primaryByItem) {
    const prev = (await store.get(itemId)) as AiItemSignal | undefined;
    const isGeneral = isGeneralLeafId(categoryId);
    const classifyState = isGeneral ? 'classified_general' : 'classified';
    if (prev?.classifyState === classifyState) continue;
    await store.put({
      ...prev,
      itemId,
      textHash: prev?.textHash ?? '',
      classifyTextHash: prev?.classifyTextHash ?? '',
      embeddingModel: prev?.embeddingModel ?? '',
      embedding: prev?.embedding ?? [],
      derivedTags: prev?.derivedTags ?? [],
      signalStatus: prev?.signalStatus ?? 'ok',
      classifyState,
      discoverState: prev?.discoverState ?? 'none',
      isNovelty: false,
      lastProcessedAt: now,
      lastClassifiedAt: prev?.lastClassifiedAt ?? now,
    });
    updated++;
  }
  await tx.done;
  if (updated > 0) notifyDataChanged('categorization.update');
  return updated;
}
