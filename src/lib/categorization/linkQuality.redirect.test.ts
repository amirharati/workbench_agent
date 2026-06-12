import {
  detectUrlRedirectMismatchAttention,
  LINK_QUALITY_LEAF_IDS,
} from './linkQuality';
import type { ItemEnrichment } from '../enrichment/types';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function enrich(partial: Partial<ItemEnrichment> & Pick<ItemEnrichment, 'itemId'>): ItemEnrichment {
  return {
    normalizedUrl: 'https://a',
    status: 'ok',
    providerId: 'test',
    attempts: 1,
    ...partial,
  } as ItemEnrichment;
}

function runTests(): void {
  assert(
    detectUrlRedirectMismatchAttention(
      enrich({
        itemId: '1',
        pendingFetchReview: true,
        pendingFetchReviewReason: 'url_redirect',
        lastErrorDetail: 'Article removed — landed on hub',
      })
    )?.leafId === LINK_QUALITY_LEAF_IDS.URL_REDIRECT_MISMATCH,
    'AI-confirmed url_redirect review should assign attention leaf'
  );

  assert(
    detectUrlRedirectMismatchAttention(
      enrich({
        itemId: '2',
        lastErrorDetail: 'Redirect: saved https://a/article → https://a/hub',
      })
    ) === null,
    'annotate-only mechanical redirect must not assign bucket'
  );

  assert(
    detectUrlRedirectMismatchAttention(
      enrich({
        itemId: '3',
        pendingFetchReview: true,
        pendingFetchReviewReason: 'auth_required',
      })
    ) === null,
    'other fetch review reasons must not assign redirect bucket'
  );
}

runTests();
console.log('linkQuality.redirect.test.ts: all tests passed');
