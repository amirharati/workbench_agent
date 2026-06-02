import { getItem } from '../db';
import { checkEligibility, getEnrichment } from '../enrichment';
import { findTabForUrl } from '../enrichment/tabSessionExtract';
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
      return 'Nothing changed — skipping fetch and AI';
    }
    if (elig.reason === 'backoff') {
      return 'Waiting before retry…';
    }
    return formatDigestProgressLabel('prep');
  }

  if (elig.skipFetch && !options?.force) {
    return 'Using saved notes — extracting with AI…';
  }

  if (item.url && (await findTabForUrl(item.url, 'any'))) {
    return 'Reading open browser tab…';
  }

  if (existing?.contentHash || existing?.fetchedAt) {
    return 'Fetching page to compare with saved content…';
  }

  return 'Fetching page…';
}
