import { embedTexts } from '../ai/openrouterEmbeddings';
import { loadAISettings } from '../ai/settings';
import { DEFAULT_EMBEDDING_MODEL } from '../categorization/service';
import { ensurePipelineHydrated, getDB } from '../db';
import { dbRpc, getRemoteStore, isDbWorkerProcess } from '../storage/dbClient';
import { isActiveItem } from '../itemQuickAccess';
import type { AiCategory, AiItemCategoryLink, AiItemSignal } from '../categorization/types';
import type { ItemEnrichment } from '../enrichment/types';
import type { Collection, Item } from '../db';
import { buildSearchIndex } from './buildIndex';
import { withSearchCategoryCentroids } from './categoryCentroids';
import { findSimilarItems, type FindSimilarOptions, type FindSimilarResult } from './findSimilar';
import { WorkerSimilarityFallbackIndex } from './similarityFallbackIndex';
import { hybridSearch } from './hybridSearch';
import { extractSearchRelated } from './searchRelated';
import { applySearchFilters } from './filters';
import {
  matchesParsedSearchGuards,
  parseSearchQuery,
  type ParsedSearchQuery,
} from './queryLanguage';
import type {
  HybridSearchOptions,
  HybridSearchResult,
  SearchIndex,
  SearchFilters,
} from './types';
import type { HybridSearchResultWithRelated } from './searchRelated';

let searchIndexCache: {
  revision: number;
  pipelineHydrated: boolean;
  index: SearchIndex;
} | null = null;
let similarFallbackCache: {
  index: SearchIndex;
  fallback: WorkerSimilarityFallbackIndex;
} | null = null;

export async function loadSearchIndexFromDb(options?: {
  /** Inspector Similar may use the already-present cache instead of blocking first paint on hydration. */
  allowPartialPipeline?: boolean;
}): Promise<SearchIndex> {
  let digestInFlight = false;
  try {
    const { isAnyDigestInFlight } = await import('../pipeline/singleLinkDigest');
    digestInFlight = isAnyDigestInFlight();
  } catch {
    /* ignore */
  }
  // Search must remain usable during a digest. In that case, use the essential
  // item/collection index and visibly fall back to text instead of returning an
  // empty library or cloning the hot embedding heap.
  if (!digestInFlight && !options?.allowPartialPipeline) await ensurePipelineHydrated();
  const db = await getDB();

  const remoteStore = !isDbWorkerProcess() ? getRemoteStore() : null;
  const revision = remoteStore?.getRevision() ?? -1;
  const pipelineHydrated = remoteStore?.isPipelineHydrated() ?? true;
  if (
    remoteStore &&
    !remoteStore.hasWritesInFlight() &&
    searchIndexCache?.revision === revision &&
    searchIndexCache.pipelineHydrated === pipelineHydrated
  ) {
    return searchIndexCache.index;
  }

  const items = (await db.getAll('items')).filter(isActiveItem);
  let enrichments: ItemEnrichment[] = [];
  let signals: AiItemSignal[] = [];
  let links: AiItemCategoryLink[] = [];
  let categories: AiCategory[] = [];
  let collections: Collection[] = [];

  if (!digestInFlight && db.objectStoreNames.contains('item_enrichment')) {
    enrichments = await db.getAll('item_enrichment');
  }
  if (!digestInFlight && db.objectStoreNames.contains('ai_item_signals')) {
    signals = await db.getAll('ai_item_signals');
  }
  if (!digestInFlight && db.objectStoreNames.contains('ai_item_category_links')) {
    links = await db.getAll('ai_item_category_links');
  }
  if (!digestInFlight && db.objectStoreNames.contains('ai_categories')) {
    categories = await db.getAll('ai_categories');
  }
  collections = await db.getAll('collections');

  const index = withSearchCategoryCentroids(
    buildSearchIndex({ items, enrichments, signals, links, categories, collections })
  );
  if (remoteStore && !remoteStore.hasWritesInFlight()) {
    searchIndexCache = { revision, pipelineHydrated, index };
  }
  return index;
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

async function rankQueryAgainstWorkerEmbeddings(
  index: SearchIndex,
  queryEmbedding: number[],
  filters: SearchFilters | undefined,
  parsedQuery: ParsedSearchQuery
): Promise<{ scores: Record<string, number>; withEmbeddings: number }> {
  const eligibleItemIds = applySearchFilters(index.documents, filters)
    .filter((document) => matchesParsedSearchGuards(document, parsedQuery, index))
    .map((document) => document.itemId);
  if (!eligibleItemIds.length) return { scores: {}, withEmbeddings: 0 };
  return dbRpc('rankSearchEmbeddings', [queryEmbedding, eligibleItemIds, 500]);
}

async function resolveSemanticQuery(
  index: SearchIndex,
  options: HybridSearchOptions,
  parsedQuery: ParsedSearchQuery
): Promise<{ queryEmbedding?: number[]; embeddingScores?: Record<string, number> }> {
  if ((options.mode ?? 'hybrid') !== 'hybrid' || !parsedQuery.semanticText) return {};
  const hasSemanticDocuments = index.documents.some((document) => document.hasEmbedding);
  if (!hasSemanticDocuments && !options.queryEmbedding?.length) return {};

  const queryEmbedding = options.queryEmbedding?.length
    ? options.queryEmbedding
    : await embedQueryText(parsedQuery.semanticText);
  if (!queryEmbedding?.length) return {};

  try {
    const ranked = await rankQueryAgainstWorkerEmbeddings(
      index,
      queryEmbedding,
      options.filters,
      parsedQuery
    );
    if (ranked.withEmbeddings === 0) return {};
    return { queryEmbedding, embeddingScores: ranked.scores };
  } catch {
    // Semantic ranking is optional. Exact text rules remain fully usable and
    // the result metadata will truthfully report text fallback.
    return {};
  }
}

export async function runAppHybridSearch(
  options: HybridSearchOptions
): Promise<HybridSearchResult> {
  const index = await loadSearchIndexFromDb();
  const parsedQuery = parseSearchQuery(options.query);
  const semantic = await resolveSemanticQuery(index, options, parsedQuery);
  return hybridSearch(index, { ...options, ...semantic });
}

export async function runAppHybridSearchWithRelated(
  options: HybridSearchOptions
): Promise<HybridSearchResultWithRelated> {
  const index = await loadSearchIndexFromDb();
  const parsedQuery = parseSearchQuery(options.query);
  const semantic = await resolveSemanticQuery(index, options, parsedQuery);
  const result = hybridSearch(index, { ...options, ...semantic });
  const related = extractSearchRelated(index, result, {
    queryEmbedding: semantic.queryEmbedding,
    embeddingScores: semantic.embeddingScores,
    filters: options.filters,
    parsedQuery,
  });

  return { ...result, related };
}

export async function runAppFindSimilar(
  options: FindSimilarOptions
): Promise<FindSimilarResult> {
  const startedAt = performance.now();
  const index = await loadSearchIndexFromDb({ allowPartialPipeline: true });
  const metadataReadyAt = performance.now();
  const candidateLimit = options.candidateLimit ?? Math.max(48, (options.limit ?? 12) * 4);
  const allowedItemIds = options.filters
    ? applySearchFilters(index.documents, options.filters).map((document) => document.itemId)
    : undefined;
  const vector = await dbRpc<{
    anchorHasEmbedding: boolean;
    scores: Record<string, number>;
    indexSize: number;
    prepareMs: number;
    queryMs: number;
  }>('findSimilarVectorScores', [options.itemId, candidateLimit, allowedItemIds], {
    // Inspector content is primary; Similar begins after it and must not jump
    // ahead of an already-queued keyed context read.
    priority: 'low',
  });
  const vectorReadyAt = performance.now();

  let fallbackScores: Record<string, number> | undefined;
  if (!vector.anchorHasEmbedding) {
    if (similarFallbackCache?.index !== index) {
      const fallback = new WorkerSimilarityFallbackIndex();
      fallback.load(index.documents);
      similarFallbackCache = { index, fallback };
    }
    fallbackScores = Object.fromEntries(
      similarFallbackCache.fallback
        .query(options.itemId, {
          limit: candidateLimit,
          excludeSelf: options.excludeSelf,
          allowedItemIds: allowedItemIds ? new Set(allowedItemIds) : undefined,
        })
        .map((hit) => [hit.itemId, hit.score])
    );
  }

  const result = findSimilarItems(index, { ...options, candidateLimit }, {
    anchorHasEmbedding: vector.anchorHasEmbedding,
    embeddingScores: vector.scores,
    fallbackScores,
  });
  const completedAt = performance.now();
  if (completedAt - startedAt >= 40) {
    console.info('[Similar perf]', {
      itemId: options.itemId,
      documents: index.documents.length,
      anchorHasEmbedding: vector.anchorHasEmbedding,
      vectorIndexSize: vector.indexSize,
      metadataMs: Math.round(metadataReadyAt - startedAt),
      vectorMs: Math.round(vectorReadyAt - metadataReadyAt),
      workerPrepareMs: vector.prepareMs,
      workerQueryMs: vector.queryMs,
      composeMs: Math.round(completedAt - vectorReadyAt),
      totalMs: Math.round(completedAt - startedAt),
    });
  }
  return result;
}

export type { Item, FindSimilarOptions, FindSimilarResult };
