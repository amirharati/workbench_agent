import {
  collectTweetIds,
  quotedThreadOverlapsParent,
  shouldSkipSameAuthorQuoteThreadExpand,
} from './xQuoteExpand';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const parent = [
  { id: '100' },
  { id: '101' },
];

assert(quotedThreadOverlapsParent(parent, parent), 'same thread overlaps');
assert(quotedThreadOverlapsParent(parent, [{ id: '101' }]), 'subset overlaps');
assert(!quotedThreadOverlapsParent(parent, [{ id: '999' }]), 'unrelated quote does not overlap');

assert(
  shouldSkipSameAuthorQuoteThreadExpand(5, 'EastlondonDev', 'EastlondonDev'),
  'same-author multi-part quote expand skipped (B1)'
);
assert(
  !shouldSkipSameAuthorQuoteThreadExpand(3, 'alice', 'bob'),
  'different-author quote expand allowed'
);
assert(
  !shouldSkipSameAuthorQuoteThreadExpand(1, 'alice', 'alice'),
  'same-author single-tweet quote still allowed'
);

const ids = collectTweetIds(parent);
assert(ids.has('100') && ids.has('101') && ids.size === 2, 'collectTweetIds');

console.log('xThread.quote.test.ts: ok');
