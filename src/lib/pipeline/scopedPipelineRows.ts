/**
 * Scoped pipeline row loads — never pull the full embedding table for a few itemIds.
 * Classify/discover/stats only need metadata; keep embeddings when writing signals back.
 */
import { getDB, type Item } from '../db';
import type { AiItemCategoryLink, AiItemSignal } from '../categorization/types';
import type { ItemEnrichment } from '../enrichment/types';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);

/** Drop embedding vectors for read-only classify/catalog maps (preserves other fields). */
export function signalMetaOnly(s: AiItemSignal): AiItemSignal {
  if (!s.embedding?.length) return s;
  return { ...s, embedding: [] };
}

export type ScopedPipelineRows = {
  items: Item[];
  enrichByItem: Map<string, ItemEnrichment>;
  /** Full signals (with embeddings) — safe for small scopes only. */
  signalByItem: Map<string, AiItemSignal>;
  primaryCategoryByItem: Map<string, string>;
  links: AiItemCategoryLink[];
};

/** Load only the given item ids (and their pipeline rows). */
export async function loadScopedPipelineRows(itemIds: string[]): Promise<ScopedPipelineRows> {
  const unique = [...new Set(itemIds.filter(Boolean))];
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
          if (l.source === 'ai' && l.isPrimary && COUNTABLE_STATUSES.has(l.status)) {
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
