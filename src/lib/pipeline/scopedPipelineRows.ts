/**
 * Scoped pipeline row loads — never pull the full embedding table for a few itemIds.
 * Classify/discover/stats only need metadata; keep embeddings when writing signals back.
 */
import { getDB, type Item } from '../db';
import { dbRpc, isDbWorkerProcess } from '../storage/dbClient';
import type { PipelineCacheSeed } from '../storage/dbClient/remoteStore';
import type { AiItemCategoryLink, AiItemSignal } from '../categorization/types';
import type { ItemEnrichment } from '../enrichment/types';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);

/** Drop embedding vectors for read-only classify/catalog maps (preserves other fields). */
export function signalMetaOnly(s: AiItemSignal): AiItemSignal {
  if (!s.embedding?.length) return s;
  return { ...s, embedding: [], embeddingDimensions: s.embedding.length };
}

export type ScopedPipelineRows = {
  items: Item[];
  enrichByItem: Map<string, ItemEnrichment>;
  /** Full signals (with embeddings) — safe for small scopes only. */
  signalByItem: Map<string, AiItemSignal>;
  primaryCategoryByItem: Map<string, string>;
  links: AiItemCategoryLink[];
};

export type ScopedPipelineRowsOptions = {
  /**
   * Read the scope directly from the DB worker instead of the tab/offscreen
   * cache. Use this for durable decisions: a partially hydrated cache must
   * never make persisted enrichment look absent.
   */
  authoritative?: boolean;
};

/** Load only the given item ids (and their pipeline rows). */
export async function loadScopedPipelineRows(
  itemIds: string[],
  options: ScopedPipelineRowsOptions = {}
): Promise<ScopedPipelineRows> {
  const unique = [...new Set(itemIds.filter(Boolean))];
  if (!unique.length) {
    return {
      items: [],
      enrichByItem: new Map(),
      signalByItem: new Map(),
      primaryCategoryByItem: new Map(),
      links: [],
    };
  }

  // The offscreen realm intentionally starts with only an essential cache.
  // Discover/classify eligibility is a durable decision, so it must read the
  // selected rows from the database owner rather than treating a cache miss as
  // a missing fetch/AI result. Call the worker RPC directly instead of going
  // through the remote-store singleton: the offscreen realm can otherwise
  // retain a different partial cache instance after extension reload. The
  // scoped response avoids hydrating the whole library (or its embeddings).
  if (options.authoritative && !isDbWorkerProcess()) {
    const seed = await dbRpc<PipelineCacheSeed>(
      'getPipelineSeedRows',
      [unique],
      { priority: 'high' }
    );
    if (seed.items.length === 0) {
      throw new Error(
        `Discover could not read its ${unique.length} selected bookmark${unique.length === 1 ? '' : 's'} from the database`
      );
    }
    const primaryCategoryByItem = new Map<string, string>();
    for (const link of seed.links) {
      if (link.isPrimary && COUNTABLE_STATUSES.has(link.status)) {
        primaryCategoryByItem.set(link.itemId, link.categoryId);
      }
    }
    return {
      items: seed.items,
      enrichByItem: new Map(seed.enrichment.map((row) => [row.itemId, row])),
      signalByItem: new Map(seed.signals.map((row) => [row.itemId, row])),
      primaryCategoryByItem,
      links: seed.links,
    };
  }

  const db = await getDB();
  const items: Item[] = [];
  const enrichByItem = new Map<string, ItemEnrichment>();
  const signalByItem = new Map<string, AiItemSignal>();
  const links: AiItemCategoryLink[] = [];
  const primaryCategoryByItem = new Map<string, string>();

  for (const id of unique) {
    const item = (await db.get('items', id)) as Item | undefined;
    if (item) items.push(item);
    if (db.objectStoreNames.contains('item_enrichment')) {
      const e = (await db.get('item_enrichment', id)) as ItemEnrichment | undefined;
      if (e) enrichByItem.set(id, e);
    }
    if (db.objectStoreNames.contains('ai_item_signals')) {
      const s = (await db.get('ai_item_signals', id)) as AiItemSignal | undefined;
      if (s) signalByItem.set(id, s);
    }
    if (db.objectStoreNames.contains('ai_item_category_links')) {
      try {
        const itemLinks = (await db.getAllFromIndex(
          'ai_item_category_links',
          'by-item',
          id
        )) as AiItemCategoryLink[];
        for (const l of itemLinks) {
          links.push(l);
          if (l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
            primaryCategoryByItem.set(l.itemId, l.categoryId);
          }
        }
      } catch {
        /* index may be missing */
      }
    }
  }

  return { items, enrichByItem, signalByItem, primaryCategoryByItem, links };
}
