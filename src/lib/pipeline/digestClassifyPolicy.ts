import { getDB } from '../db';
import type { EnrichmentResult } from '../enrichment';
import { getEnrichment } from '../enrichment';
import { hasSpecificPrimaryTopic } from '../categorization/categorizationFairGame';
import { primaryLeafIdFromLinks } from '../categorization/counts';
import type { ClassifyState } from '../categorization/types';

function enrichIndicatesNoPageChange(enrich: EnrichmentResult): boolean {
  if (!enrich.skipped) return false;
  const msg = enrich.message?.trim();
  return msg === 'unchanged' || msg === 'content_unchanged';
}

/**
 * Whether single-link digest should invoke classify after enrich.
 * Skips re-classify when the page body did not change and categories are already settled.
 */
export async function needsClassifyForDigest(
  itemId: string,
  enrich: EnrichmentResult
): Promise<boolean> {
  if (enrich.status === 'failed') return false;

  const enrichment = await getEnrichment(itemId);
  if (enrichment?.aiStatus !== 'ok') return false;

  const db = await getDB();
  const links = db.objectStoreNames.contains('ai_item_category_links')
    ? (await db.getAll('ai_item_category_links')).filter(
        (l) => l.itemId === itemId && l.source === 'ai'
      )
    : [];

  const primaryId = primaryLeafIdFromLinks(links);
  const signal = db.objectStoreNames.contains('ai_item_signals')
    ? await db.get('ai_item_signals', itemId)
    : undefined;
  const classifyState = (signal?.classifyState ?? 'unclassified') as ClassifyState;

  const hasAccepted = links.some((l) => l.status === 'accepted');
  const hasSuggested = links.some((l) => l.status === 'suggested');

  if (!enrichIndicatesNoPageChange(enrich)) {
    return true;
  }

  if (classifyState === 'pending_reclassify') return false;

  if (hasAccepted) return false;
  if (hasSuggested) return false;
  if (classifyState === 'manual_review') return false;
  if (hasSpecificPrimaryTopic(primaryId, classifyState)) return false;
  if (classifyState === 'classified') return false;

  return true;
}
