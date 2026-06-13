import {
  collectTweetIds,
  filterThreadToBookmarkAuthor,
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

const mixed = [
  { id: '100', author: { screen_name: 'higgsfield' }, text: 'OP' },
  { id: '200', author: { screen_name: 'sebuzdugan' }, text: 'reply' },
];
const replyOnly = filterThreadToBookmarkAuthor(mixed, 'sebuzdugan', '200');
assert(replyOnly.length === 1 && replyOnly[0].id === '200', 'reply bookmark filters to author');

const opOnly = filterThreadToBookmarkAuthor(mixed, 'sebuzdugan', '999');
assert(opOnly.length === 0, 'missing anchor does not return wrong-author OP');

console.log('xThread.quote.test.ts: ok');
