import {
  collectTweetIds,
  quotedThreadOverlapsParent,
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

const ids = collectTweetIds(parent);
assert(ids.has('100') && ids.has('101') && ids.size === 2, 'collectTweetIds');

console.log('xThread.quote.test.ts: ok');
