import { explainHubQueueOutcome, type HubQueueOutcome } from './queueOutcomeSnapshot';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function assertIncludes(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected text to include "${needle}"`);
  }
}

function assertExcludes(haystack: string, needle: string, label: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: expected text to exclude "${needle}"`);
  }
}

const emptySnapshot = {
  pendingClassify: 10,
  pendingDiscover: 5,
  manualReview: 2,
  classifiedGeneral: 20,
  stuckPool: 30,
};

function runTests(): void {
  const discoverClassify: HubQueueOutcome = {
    action: 'discover_classify',
    before: emptySnapshot,
    after: { ...emptySnapshot, stuckPool: 30 },
    itemsRun: 101,
    discover: {
      itemsSampled: 101,
      itemsMarkedForReclassify: 101,
      newLeaves: 0,
      newParents: 0,
    },
    batch: {
      processed: 3,
      classifiedSpecific: 2,
      classifiedGeneral: 1,
      pendingDiscover: 0,
      skippedHash: 0,
      skippedIneligible: 98,
      skippedManualReview: 0,
      llmErrors: 0,
      unassigned: 0,
    },
  };

  const discoverResult = explainHubQueueOutcome(discoverClassify);
  const discoverText = discoverResult.lines.join('\n');

  assertIncludes(discoverText, 'Discover sampled 101 stuck bookmark', 'discover_classify sampled');
  assertIncludes(
    discoverText,
    '101 bookmarks were queued for classify after discover',
    'discover_classify requeued'
  );
  assertIncludes(
    discoverText,
    'Classify made 3 LLM calls on queued items',
    'discover_classify classify processed'
  );
  assertIncludes(
    discoverText,
    '98 skipped as ineligible (insufficient semantic text)',
    'discover_classify skipped ineligible'
  );
  assertIncludes(
    discoverText,
    'Table below is library-wide queue totals (not only this run selection)',
    'discover_classify scope note'
  );
  assertExcludes(
    discoverText,
    '3 LLM calls on 101 selected bookmark',
    'discover_classify no misleading LLM-on-selected'
  );
  assertExcludes(discoverText, 'This run:', 'discover_classify no this-run phrasing');

  const classifyPending: HubQueueOutcome = {
    action: 'classify_pending',
    before: emptySnapshot,
    after: { ...emptySnapshot, pendingClassify: 7 },
    itemsRun: 50,
    batch: {
      processed: 12,
      classifiedSpecific: 10,
      classifiedGeneral: 2,
      pendingDiscover: 0,
      skippedHash: 3,
      skippedIneligible: 0,
      skippedManualReview: 0,
      llmErrors: 0,
      unassigned: 0,
    },
  };

  const classifyResult = explainHubQueueOutcome(classifyPending);
  const classifyText = classifyResult.lines.join('\n');

  assertIncludes(
    classifyText,
    'This run: 12 LLM calls on 50 selected bookmarks',
    'classify_pending run summary'
  );
  assertIncludes(
    classifyText,
    '10 assigned a specific topic',
    'classify_pending specific count'
  );
  assertIncludes(classifyText, '3 skipped unchanged (no LLM)', 'classify_pending skipped hash');
  assert(classifyResult.headline === 'Classify complete', 'classify_pending headline');

  console.log('queueOutcomeSnapshot.test.ts: all tests passed');
}

runTests();
