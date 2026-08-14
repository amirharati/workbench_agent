import type { ItemEnrichment } from '../enrichment/types';

export type ImportEnrichmentRefreshPolicy =
  | 'missing'
  | 'older-than-7-days'
  | 'older-than-30-days'
  | 'older-than-90-days'
  | 'all';

const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_AGE_MS: Partial<Record<ImportEnrichmentRefreshPolicy, number>> = {
  'older-than-7-days': 7 * DAY_MS,
  'older-than-30-days': 30 * DAY_MS,
  'older-than-90-days': 90 * DAY_MS,
};

export function isCompleteAiEnrichment(enrichment?: ItemEnrichment): boolean {
  return enrichment?.status === 'ok' && enrichment.aiStatus === 'ok';
}
export function enrichmentTimestamp(enrichment?: ItemEnrichment): number | undefined {
  if (!enrichment) return undefined;
  return Math.max(enrichment.aiAt ?? 0, enrichment.fetchedAt ?? 0, enrichment.updated_at ?? 0) || undefined;
}

/** Whether Import Studio should select an affected bookmark for paid processing. */
export function shouldProcessImportedBookmark(
  enrichment: ItemEnrichment | undefined,
  policy: ImportEnrichmentRefreshPolicy,
  now = Date.now()
): boolean {
  if (policy === 'all') return true;
  if (!isCompleteAiEnrichment(enrichment)) return true;
  if (policy === 'missing') return false;

  const timestamp = enrichmentTimestamp(enrichment);
  const maxAge = MAX_AGE_MS[policy];
  return timestamp == null || maxAge == null || now - timestamp >= maxAge;
}
