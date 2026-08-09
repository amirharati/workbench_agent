import { getDomain } from '../utils';
import type { AiCategory, AiItemCategoryLink, AiItemSignal, ClassifyState } from '../categorization/types';
import type { ItemEnrichment } from '../enrichment/types';
import type { Collection, Item } from '../db';
import type { SearchDocument, SearchIndex } from './types';

const COUNTABLE_LINK_STATUSES = new Set(['suggested', 'accepted']);

export interface BuildSearchIndexInput {
  items: Item[];
  enrichments?: ItemEnrichment[];
  signals?: AiItemSignal[];
  links?: AiItemCategoryLink[];
  categories?: AiCategory[];
  collections?: Collection[];
}

export function buildSearchIndex(input: BuildSearchIndexInput): SearchIndex {
  const enrichmentByItem = new Map(
    (input.enrichments ?? []).map((e) => [e.itemId, e])
  );
  const signalByItem = new Map((input.signals ?? []).map((s) => [s.itemId, s]));

  const links = (input.links ?? []).filter(
    (l) => l.source === 'ai' && COUNTABLE_LINK_STATUSES.has(l.status)
  );

  const categoryById = new Map((input.categories ?? []).map((c) => [c.id, c]));
  const itemsByCategory = new Map<string, string[]>();

  const linksByItem = new Map<string, AiItemCategoryLink[]>();
  for (const link of links) {
    const list = linksByItem.get(link.itemId) ?? [];
    list.push(link);
    linksByItem.set(link.itemId, list);

    const catList = itemsByCategory.get(link.categoryId) ?? [];
    if (!catList.includes(link.itemId)) catList.push(link.itemId);
    itemsByCategory.set(link.categoryId, catList);
  }

  const collectionById = new Map((input.collections ?? []).map((c) => [c.id, c]));

  const documents: SearchDocument[] = input.items.map((item) => {
    const enrichment = enrichmentByItem.get(item.id);
    const signal = signalByItem.get(item.id);
    const itemLinks = linksByItem.get(item.id) ?? [];

    const primaryLink = itemLinks.find((l) => l.isPrimary);
    const categoryIds = [...new Set(itemLinks.map((l) => l.categoryId))];
    const categoryScores: Record<string, number> = {};
    for (const l of itemLinks) {
      categoryScores[l.categoryId] = Math.max(categoryScores[l.categoryId] ?? 0, l.score);
    }

    const collectionIds = item.collectionIds ?? [];
    const projectIds = new Set<string>();
    for (const cid of collectionIds) {
      const col = collectionById.get(cid);
      if (col?.primaryProjectId) projectIds.add(col.primaryProjectId);
      for (const pid of col?.projectIds ?? []) projectIds.add(pid);
    }

    const summary =
      enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() ?? '' : '';
    const keyPoints =
      enrichment?.aiStatus === 'ok' ? enrichment.aiKeyPoints ?? [] : [];
    const aiTags =
      enrichment?.aiStatus === 'ok' ? enrichment.aiTags ?? [] : [];

    return {
      itemId: item.id,
      title: item.title ?? '',
      url: item.url ?? '',
      domain: getDomain(item.url ?? ''),
      notes: item.notes ?? '',
      tags: [...(item.tags ?? []), ...aiTags],
      summary,
      keyPoints,
      sourceKind: enrichment?.sourceKind,
      updatedAt: item.updated_at ?? 0,
      createdAt: item.created_at ?? 0,
      collectionIds,
      projectIds: [...projectIds],
      embedding: signal?.embedding?.length ? signal.embedding : undefined,
      hasEmbedding: Boolean(
        signal?.embedding?.length || (signal?.textHash && signal?.embeddingModel)
      ),
      primaryCategoryId: primaryLink?.categoryId,
      categoryIds,
      categoryScores,
      classifyState: signal?.classifyState as ClassifyState | undefined,
      hasQualityEnrichment: Boolean(summary || keyPoints.length),
    };
  });

  return {
    documents,
    categories: input.categories ?? [],
    categoryById,
    itemsByCategory,
  };
}

/** Parse flat backup `data` object into buildSearchIndex input. */
export function buildSearchIndexFromBackupData(data: Record<string, unknown>): SearchIndex {
  return buildSearchIndex({
    items: (data.items as Item[]) ?? [],
    enrichments: (data.item_enrichment as ItemEnrichment[]) ?? [],
    signals: (data.ai_item_signals as AiItemSignal[]) ?? [],
    links: (data.ai_item_category_links as AiItemCategoryLink[]) ?? [],
    categories: (data.ai_categories as AiCategory[]) ?? (data.categories as AiCategory[]) ?? [],
    collections: (data.collections as Collection[]) ?? [],
  });
}

export function unwrapBackupPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  if (obj.format === 'workbench-backup' && obj.data && typeof obj.data === 'object') {
    return obj.data as Record<string, unknown>;
  }
  return obj;
}
