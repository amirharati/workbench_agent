import type { Item } from '../db';
import type { ItemEnrichment } from './types';

/** Minimum chars (title + summary) before calling the embed API. */
export const MIN_SEARCH_EMBED_TEXT_LENGTH = 24;

/**
 * Lean embed input for search (and future categorize shortlist): title + AI summary only.
 */
export function buildSearchEmbedText(
  item: Item,
  enrichment?: ItemEnrichment | null
): string {
  const title = (item.title || '').trim();
  const summary =
    enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() ?? '' : '';
  const parts: string[] = [];
  if (title) parts.push(title);
  if (summary) parts.push(summary);
  return parts.join('\n\n');
}

export function searchEmbedTextLength(
  item: Item,
  enrichment?: ItemEnrichment | null
): number {
  return buildSearchEmbedText(item, enrichment).length;
}
