import { fetchAttemptedForLinkQuality } from '../categorization/linkQuality';
import type { ItemEnrichment } from '../enrichment/types';

/** Fetch produced page content or an HTTP/detail signal (e.g. 404 body). */
export function enrichmentHasFetchContentSignal(enrichment: ItemEnrichment): boolean {
  if (enrichment.status === 'ok') return true;
  return Boolean(
    enrichment.lastErrorDetail?.trim() ||
      enrichment.snippet?.trim() ||
      (enrichment.aiStatus === 'ok' && enrichment.summary?.trim()) ||
      enrichment.hasRawBody
  );
}

/**
 * Whether an item should run classify downstream after enrich (embed only when aiStatus=ok).
 * Shared downstream eligibility rule used by the durable coordinator.
 */
export function isDownstreamClassifyEligible(enrichment?: ItemEnrichment | null): boolean {
  if (!fetchAttemptedForLinkQuality(enrichment) || !enrichment) return false;
  if (enrichment.status === 'skipped' || enrichment.status === 'pending') return false;
  if (enrichment.aiStatus === 'ok') return true;
  if (enrichment.status === 'ok') return true;
  if (enrichment.status === 'failed') return enrichmentHasFetchContentSignal(enrichment);
  if (enrichment.status === 'stale') return enrichmentHasFetchContentSignal(enrichment);
  return false;
}

export function filterDownstreamClassifyEligible(
  itemIds: string[],
  enrichById: Map<string, ItemEnrichment>
): string[] {
  return itemIds.filter((id) => isDownstreamClassifyEligible(enrichById.get(id)));
}
