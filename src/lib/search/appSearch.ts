import { embedTexts } from '../ai/openrouterEmbeddings';
import { loadAISettings } from '../ai/settings';
import { DEFAULT_EMBEDDING_MODEL } from '../categorization/service';
import { getDB } from '../db';
import { isActiveItem } from '../itemQuickAccess';
import type { AiCategory, AiItemCategoryLink, AiItemSignal } from '../categorization/types';
import { buildSearchEmbedText } from '../enrichment/searchEmbedText';
import type { ItemEnrichment } from '../enrichment/types';
import type { Collection, Item } from '../db';
import { buildSearchIndex } from './buildIndex';
import { withSearchCategoryCentroids } from './categoryCentroids';
import { findSimilarItems, type FindSimilarOptions, type FindSimilarResult } from './findSimilar';
import { hybridSearch } from './hybridSearch';
import { extractSearchRelated } from './searchRelated';
import type {
  HybridSearchOptions,
  HybridSearchResult,
  SearchIndex,
} from './types';
import type { HybridSearchResultWithRelated } from './searchRelated';

export async function loadSearchIndexFromDb(): Promise<SearchIndex> {
  const db = await getDB();

  const items = (await db.getAll('items')).filter(isActiveItem);
  let enrichments: ItemEnrichment[] = [];
  let signals: AiItemSignal[] = [];
  let links: AiItemCategoryLink[] = [];
  let categories: AiCategory[] = [];
  let collections: Collection[] = [];

  if (db.objectStoreNames.contains('item_enrichment')) {
    enrichments = await db.getAll('item_enrichment');
  }
  if (db.objectStoreNames.contains('ai_item_signals')) {
    signals = await db.getAll('ai_item_signals');
  }
  if (db.objectStoreNames.contains('ai_item_category_links')) {
    links = await db.getAll('ai_item_category_links');
  }
  if (db.objectStoreNames.contains('ai_categories')) {
    categories = await db.getAll('ai_categories');
  }
  collections = await db.getAll('collections');

  return withSearchCategoryCentroids(
    buildSearchIndex({ items, enrichments, signals, links, categories, collections })
  );
}

async function embedQueryText(text: string): Promise<number[] | undefined> {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const aiSettings = await loadAISettings();
  if (!aiSettings.apiKey.trim()) return undefined;

  try {
    const [vec] = await embedTexts(
      {
        apiKey: aiSettings.apiKey,
        baseUrl: aiSettings.baseUrl,
        model: DEFAULT_EMBEDDING_MODEL,
        timeoutMs: 60_000,
      },
      [trimmed]
    );
    return vec;
  } catch {
    return undefined;
  }
}

export async function runAppHybridSearch(
  options: HybridSearchOptions
): Promise<HybridSearchResult> {
  const index = await loadSearchIndexFromDb();
  let queryEmbedding = options.queryEmbedding;

  if (
    (options.mode ?? 'hybrid') === 'hybrid' &&
    !queryEmbedding?.length &&
    options.query.trim()
  ) {
    queryEmbedding = await embedQueryText(options.query.trim());
  }

  return hybridSearch(index, { ...options, queryEmbedding });
}

export async function runAppHybridSearchWithRelated(
  options: HybridSearchOptions
): Promise<HybridSearchResultWithRelated> {
  const index = await loadSearchIndexFromDb();
  let queryEmbedding = options.queryEmbedding;

  if (
    (options.mode ?? 'hybrid') === 'hybrid' &&
    !queryEmbedding?.length &&
    options.query.trim()
  ) {
    queryEmbedding = await embedQueryText(options.query.trim());
  }

  const result = hybridSearch(index, { ...options, queryEmbedding });
  const related = extractSearchRelated(index, result, {
    queryEmbedding,
    filters: options.filters,
  });

  return { ...result, related };
}

export async function runAppFindSimilar(
  options: FindSimilarOptions
): Promise<FindSimilarResult> {
  const index = await loadSearchIndexFromDb();
  let result = findSimilarItems(index, options);

  if (result.results.length || result.anchorHasEmbedding) {
    return result;
  }

  const anchor = index.documents.find((d) => d.itemId === options.itemId);
  if (!anchor) return result;

  const db = await getDB();
  const item = await db.get('items', options.itemId);
  let enrichment: ItemEnrichment | undefined;
  if (db.objectStoreNames.contains('item_enrichment')) {
    enrichment = await db.get('item_enrichment', options.itemId);
  }

  const embedText = item ? buildSearchEmbedText(item, enrichment) : anchor.title;
  const queryEmbedding = await embedQueryText(embedText);
  if (!queryEmbedding?.length) return result;

  const anchorWithEmbed: typeof anchor = { ...anchor, embedding: queryEmbedding };
  const patchedDocs = index.documents.map((d) =>
    d.itemId === options.itemId ? anchorWithEmbed : d
  );
  const patchedIndex: SearchIndex = { ...index, documents: patchedDocs };

  result = findSimilarItems(patchedIndex, options);
  return { ...result, anchorHasEmbedding: true };
}

export type { Item, FindSimilarOptions, FindSimilarResult };
