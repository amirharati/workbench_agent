import { assessCategorizationEligibility } from './categorizationEligibility';
import type { Item } from '../db';
import type { ItemEnrichment } from './types';

const GENREASONING_PLACEMENT_NOTES =
  '🎉 Introducing General Reasoning! A new open-source resource for building large reasoning models. We’ve indexed over 1.5 million questions, 270k chain-of-thought traces, and made 100s of benchmarks to track progress. Contribute questions, verifications, benchmarks, and more 🧵';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function item(partial: Partial<Item> & Pick<Item, 'id'>): Item {
  return {
    title: '',
    url: 'https://x.com/GenReasoning/status/1892983129528222111',
    ...partial,
  } as Item;
}

function enrich(partial: Partial<ItemEnrichment> & Pick<ItemEnrichment, 'itemId'>): ItemEnrichment {
  return {
    normalizedUrl: 'https://x.com/GenReasoning/status/1892983129528222111',
    status: 'failed',
    providerId: 'test',
    attempts: 1,
    lastErrorDetail: 'tweet_unavailable',
    ...partial,
  } as ItemEnrichment;
}

function runTests(): void {
  const longTitle =
    'Introducing General Reasoning: a new open model family for math, code, and ML reasoning benchmarks with long-context support';

  const deletedTweet = assessCategorizationEligibility(
    item({ id: 'e9b28d73', title: longTitle }),
    enrich({ itemId: 'e9b28d73' })
  );
  assert(!deletedTweet.eligible, 'deleted tweet with long title must not be topic-eligible');
  assert(
    deletedTweet.reason === 'tweet_unavailable',
    'eligibility reason should surface fetch error detail'
  );

  const deletedWithImportNotes = assessCategorizationEligibility(
    item({
      id: 'e9b28d73',
      title: 'GenReasoning: 🎉 Introducing General Reasoning! A new open-source resource for building…',
      notes: GENREASONING_PLACEMENT_NOTES,
      placements: {
        collection_project_default_unsorted: {
          collectionId: 'collection_project_default_unsorted',
          notes: GENREASONING_PLACEMENT_NOTES,
          tags: [],
          addedAt: 1781314416975,
          source: 'x-bookmarks-export-v1',
        },
      },
    }),
    enrich({ itemId: 'e9b28d73' })
  );
  assert(
    !deletedWithImportNotes.eligible,
    'deleted tweet with X-export placement notes must not be topic-eligible'
  );

  const withAi = assessCategorizationEligibility(
    item({ id: '2', title: longTitle }),
    enrich({
      itemId: '2',
      aiStatus: 'ok',
      summary:
        'A detailed summary of the model release covering benchmarks, training data, and evaluation results across reasoning tasks.',
    })
  );
  assert(withAi.eligible, 'failed fetch with usable AI summary should remain eligible');

  const okFetch = assessCategorizationEligibility(
    item({ id: '3', title: longTitle }),
    enrich({ itemId: '3', status: 'ok', lastErrorDetail: undefined })
  );
  assert(okFetch.eligible, 'ok fetch with substantive title should remain eligible');

  const imageOnlyBody = [
    '# @HangukQuant',
    '',
    'Image: https://pbs.twimg.com/media/chart.jpg',
    '(1 photo(s) attached)',
  ].join('\n');
  const imageOnly = assessCategorizationEligibility(
    item({
      id: '4',
      title: 'HangukQuant chart',
      url: 'https://x.com/HangukQuant/status/1',
    }),
    enrich({ itemId: '4', status: 'ok', snippet: imageOnlyBody, hasRawBody: true })
  );
  assert(imageOnly.eligible, 'image-only X post remains topic-eligible (vision path)');

  const videoOnlyBody = [
    '# @someone',
    '',
    'Video: https://x.com/someone/status/1/video/1',
    '(1:30 — not transcribed)',
  ].join('\n');
  const videoOnly = assessCategorizationEligibility(
    item({
      id: '5',
      title: 'demo clip',
      url: 'https://x.com/someone/status/1',
    }),
    enrich({ itemId: '5', status: 'ok', snippet: videoOnlyBody, hasRawBody: true })
  );
  assert(!videoOnly.eligible, 'video-only thin post should not be topic-eligible');
  assert(
    videoOnly.reason === 'embedded video without substantive text',
    'video-only eligibility reason'
  );
}

runTests();
console.log('categorizationEligibility.test.ts: all tests passed');
