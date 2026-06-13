import {
  detectLinkQualityFromItem,
  detectLinkQualityIssue,
  LINK_QUALITY_LEAF_IDS,
} from './linkQuality';
import type { ItemEnrichment } from '../enrichment/types';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function runTests(): void {
  const deletedTweet = detectLinkQualityIssue({
    title: 'Introducing General Reasoning: open model family for math, code, and ML reasoning',
    url: 'https://x.com/GenReasoning/status/1892983129528222111',
    enrichmentStatus: 'failed',
    lastErrorDetail: 'tweet_unavailable',
  });
  assert(
    deletedTweet?.leafId === LINK_QUALITY_LEAF_IDS.PAGE_NOT_FOUND,
    'tweet_unavailable should bucket as page-not-found'
  );

  const genericFail = detectLinkQualityIssue({
    title: 'Some bookmark title that is long enough to look substantive on its own',
    url: 'https://blog.example.org/post',
    enrichmentStatus: 'failed',
    lastErrorDetail: 'network_timeout',
  });
  assert(
    genericFail?.leafId === LINK_QUALITY_LEAF_IDS.ENRICH_FETCH_FAILED,
    'failed fetch without body should bucket as enrich-fetch-failed'
  );

  const fromItem = detectLinkQualityFromItem(
    {
      title: 'Introducing General Reasoning: open model family for math, code, and ML reasoning',
      url: 'https://x.com/GenReasoning/status/1892983129528222111',
    },
    {
      itemId: 'e9b28d73',
      normalizedUrl: 'https://x.com/GenReasoning/status/1892983129528222111',
      status: 'failed',
      providerId: 'test',
      attempts: 1,
      lastErrorDetail: 'tweet_unavailable',
    } as ItemEnrichment,
    { eligibilityReason: 'tweet_unavailable' }
  );
  assert(
    fromItem?.leafId === LINK_QUALITY_LEAF_IDS.PAGE_NOT_FOUND,
    'detectLinkQualityFromItem should bucket deleted tweet'
  );
}

runTests();
console.log('linkQuality.fetchFailed.test.ts: all tests passed');
