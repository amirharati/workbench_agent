import { getItem } from '../db';
import { checkEligibility, getEnrichment } from '../enrichment';
import { findTabForUrl } from '../enrichment/tabSessionExtract';
import { PIPELINE_STAGE_LABELS } from './pipelineDictionary';
import { formatDigestProgressLabel } from './singleLinkDigest';

/** User-facing label before enrichOne runs (fetch vs local-only vs unchanged). */
export async function resolveEnrichProgressLabel(
  itemId: string,
  options?: { force?: boolean }
): Promise<string> {
  const item = await getItem(itemId);
  if (!item?.url) return formatDigestProgressLabel('prep');

  const existing = await getEnrichment(itemId);
  const elig = checkEligibility(item, existing, { force: options?.force });

  if (!elig.eligible) {
    if (elig.reason === 'unchanged') {
      return `Skipped — already ${PIPELINE_STAGE_LABELS.enrich.toLowerCase()}ed (unchanged)`;
    }
    if (elig.reason === 'backoff') {
      return 'Skipped — waiting before retry';
    }
    return formatDigestProgressLabel('prep');
  }

  if (elig.skipFetch && !options?.force) {
    return `${PIPELINE_STAGE_LABELS.enrich} — using saved page, running AI…`;
  }

  if (item.url && (await findTabForUrl(item.url, 'any'))) {
    return `${PIPELINE_STAGE_LABELS.fetch} — reading open browser tab…`;
  }

  if (existing?.contentHash || existing?.fetchedAt) {
    return `${PIPELINE_STAGE_LABELS.fetch} — comparing with saved content…`;
  }

  return `${PIPELINE_STAGE_LABELS.fetch} — downloading page…`;
}
