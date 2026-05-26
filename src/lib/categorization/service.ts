import { embedTexts } from '../ai/openrouterEmbeddings';
import { loadAISettings } from '../ai/settings';
import { assessCategorizationEligibility } from '../enrichment/categorizationEligibility';
import { buildCategorizationEmbedText } from '../enrichment/categorizationText';
import { getDB } from '../db';
import { clusterNoveltyIntoCategories } from './bootstrap';
import { runCategorizationPipeline } from './pipeline';
import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  CategorizationRunResult,
  PipelineItemInput,
} from './types';

export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

export function aiLinkId(itemId: string, categoryId: string): string {
  return `link_${itemId}_${categoryId}`;
}

export async function getAiCategories(): Promise<AiCategory[]> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_categories')) return [];
  return db.getAll('ai_categories');
}

export async function getAiLinksForItem(itemId: string): Promise<AiItemCategoryLink[]> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) return [];
  return db.getAllFromIndex('ai_item_category_links', 'by-item', itemId);
}

export async function getAiSignal(itemId: string): Promise<AiItemSignal | undefined> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return undefined;
  return db.get('ai_item_signals', itemId);
}

export interface CategoryReviewRow {
  category: AiCategory;
  itemCount: number;
  noveltyInCategory: number;
  samples: Array<{ itemId: string; title: string; score: number; isPrimary: boolean }>;
}

export async function getCategorizationReview(samplePerCategory = 4): Promise<{
  categories: CategoryReviewRow[];
  noveltyCount: number;
  signalCount: number;
}> {
  const db = await getDB();
  const categories = await getAiCategories();
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? await db.getAll('ai_item_category_links')
    : [];
  const signals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const items = await db.getAll('items');
  const titleById = new Map(items.map((i) => [i.id, i.title || i.id]));

  const noveltyCount = signals.filter((s) => s.isNovelty).length;
  const aiLinks = links.filter((l) => l.source === 'ai' && l.status === 'suggested');

  const rows: CategoryReviewRow[] = categories.map((category) => {
    const catLinks = aiLinks.filter((l) => l.categoryId === category.id);
    const primary = catLinks.filter((l) => l.isPrimary);
    const samples = [...catLinks]
      .sort((a, b) => b.score - a.score)
      .slice(0, samplePerCategory)
      .map((l) => ({
        itemId: l.itemId,
        title: titleById.get(l.itemId) ?? l.itemId,
        score: l.score,
        isPrimary: l.isPrimary,
      }));

    return {
      category,
      itemCount: category.itemCount ?? primary.length,
      noveltyInCategory: 0,
      samples,
    };
  });

  rows.sort((a, b) => b.itemCount - a.itemCount);

  return {
    categories: rows,
    noveltyCount,
    signalCount: signals.length,
  };
}

export interface RunCategorizationOptions {
  itemIds?: string[];
  maxItems?: number;
  bootstrapIfEmpty?: boolean;
  embeddingModel?: string;
  /** Force full snippet in embed text (default: lean + auto fallback). */
  includeSnippet?: boolean;
  /** LLM category display names after bootstrap (uses Settings → AI). */
  llmRenameCategories?: boolean;
}

export async function runCategorizationOnItems(
  opts: RunCategorizationOptions = {}
): Promise<CategorizationRunResult> {
  const db = await getDB();
  const aiSettings = await loadAISettings();
  const embeddingModel = opts.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;

  let items = await db.getAll('items');
  if (opts.itemIds?.length) {
    const idSet = new Set(opts.itemIds);
    items = items.filter((i) => idSet.has(i.id));
  }
  if (opts.maxItems && items.length > opts.maxItems) {
    items = items.slice(0, opts.maxItems);
  }

  const enrichments = db.objectStoreNames.contains('item_enrichment')
    ? await db.getAll('item_enrichment')
    : [];
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));

  const existingSignals = db.objectStoreNames.contains('ai_item_signals')
    ? await db.getAll('ai_item_signals')
    : [];
  const existingHashes = new Map(existingSignals.map((s) => [s.itemId, s.textHash]));
  const existingEmbeddings = new Map(
    existingSignals.filter((s) => s.embedding?.length).map((s) => [s.itemId, s.embedding])
  );

  const pipelineItems: PipelineItemInput[] = items.map((item) => {
    const enrichment = enrichByItem.get(item.id);
    const hints = { aiTags: enrichment?.aiTags };
    const eligibility = assessCategorizationEligibility(item, enrichment, hints);
    const { text } = buildCategorizationEmbedText(
      item,
      enrichment,
      {
        includeSnippet: opts.includeSnippet ?? false,
        ...hints,
      },
      { allowSnippetFallback: eligibility.allowSnippetFallback }
    );
    return {
      itemId: item.id,
      title: item.title,
      url: item.url,
      text,
      enrichmentAiTags: enrichment?.aiTags,
      substantiveLength: eligibility.semanticLength,
      semanticLength: eligibility.semanticLength,
      categorizationEligible: eligibility.eligible,
      eligibilityReason: eligibility.reason,
    };
  });

  let categories = await getAiCategories();

  const result = await runCategorizationPipeline({
    items: pipelineItems,
    categories,
    embeddingModel,
    bootstrapIfEmpty: opts.bootstrapIfEmpty ?? categories.length === 0,
    mergeAfterBootstrap: true,
    llmRenameCategories: opts.llmRenameCategories ?? false,
    aiSettings: opts.llmRenameCategories ? aiSettings : undefined,
    existingHashes,
    existingEmbeddings,
    embed: (texts) =>
      embedTexts(
        {
          apiKey: aiSettings.apiKey,
          baseUrl: aiSettings.baseUrl,
          model: embeddingModel,
          timeoutMs: 60_000,
        },
        texts
      ),
  });

  categories = result.categories;
  const now = Date.now();

  const tx = db.transaction(
    ['ai_categories', 'ai_item_category_links', 'ai_item_signals'],
    'readwrite'
  );

  for (const cat of categories) {
    await tx.objectStore('ai_categories').put(cat);
  }

  const itemIdsRun = new Set(result.itemResults.map((r) => r.itemId));

  for (const itemId of itemIdsRun) {
    const existing = await tx
      .objectStore('ai_item_category_links')
      .index('by-item')
      .getAll(itemId);
    for (const link of existing) {
      if (link.source === 'ai' && link.status === 'suggested') {
        await tx.objectStore('ai_item_category_links').delete(link.id);
      }
    }
  }

  for (const row of result.itemResults) {
    const signal: AiItemSignal = {
      itemId: row.itemId,
      textHash: row.textHash,
      embeddingModel,
      embedding: row.embedding,
      derivedTags: row.derivedTags,
      signalStatus: row.signalStatus,
      isNovelty: row.isNovelty,
      lastProcessedAt: now,
    };
    await tx.objectStore('ai_item_signals').put(signal);

    for (const a of row.assignments) {
      const link: AiItemCategoryLink = {
        id: aiLinkId(row.itemId, a.categoryId),
        itemId: row.itemId,
        categoryId: a.categoryId,
        score: a.score,
        isPrimary: a.isPrimary,
        source: 'ai',
        status: 'suggested',
        created_at: now,
        updated_at: now,
      };
      await tx.objectStore('ai_item_category_links').put(link);
    }
  }

  await tx.done;

  return result;
}

/** Batch-cluster current novelty items into new proposed categories. */
export async function clusterNoveltyPool(_opts: { embeddingModel?: string } = {}): Promise<{
  created: AiCategory[];
  itemCount: number;
}> {
  const db = await getDB();
  const signals = await db.getAll('ai_item_signals');
  const novelty = signals.filter((s) => s.isNovelty && s.embedding?.length && s.signalStatus === 'ok');
  if (novelty.length < 5) return { created: [], itemCount: novelty.length };

  const items = await db.getAll('items');
  const itemById = new Map(items.map((i) => [i.id, i]));
  const enrichments = await db.getAll('item_enrichment');
  const enrichByItem = new Map(enrichments.map((e) => [e.itemId, e]));

  const inputs = novelty.map((s) => {
    const item = itemById.get(s.itemId);
    const enrichment = enrichByItem.get(s.itemId);
    const { text } = item
      ? buildCategorizationEmbedText(item, enrichment, { aiTags: enrichment?.aiTags })
      : { text: '' };
    return {
      itemId: s.itemId,
      embedding: s.embedding,
      text,
      title: item?.title,
      aiTags: enrichment?.aiTags,
    };
  });

  const created = clusterNoveltyIntoCategories(inputs);
  const now = Date.now();
  const tx = db.transaction(['ai_categories'], 'readwrite');
  for (const cat of created) {
    await tx.objectStore('ai_categories').put({ ...cat, created_at: now, updated_at: now });
  }
  await tx.done;

  return { created, itemCount: novelty.length };
}
