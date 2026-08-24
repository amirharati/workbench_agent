import {
  hasXExtractSignal,
  isTrulyEmptyExtractInput,
  minExtractRawChars,
  prepareExtractInput,
} from './extractFilters';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

const HANGUK_LOCAL_SNIPPET = `# @HangukQuant
https://t.co/gS6bgRzbux
(1 media item(s) attached)`;

const SYNDICATION_IMAGE_ONLY = `# @HangukQuant

Image: https://pbs.twimg.com/media/Gjc3McubsAAMBhb.jpg?name=orig

(1 photo(s) attached)`;

assert(minExtractRawChars('x') === 20, 'X min raw chars');
assert(minExtractRawChars('article') === 80, 'article min raw chars');

assert(hasXExtractSignal(HANGUK_LOCAL_SNIPPET), 'local X snippet has signal');
assert(
  !isTrulyEmptyExtractInput(HANGUK_LOCAL_SNIPPET, 'HangukQuant: https://t.co/gS6bgRzbux', 'x'),
  'HangukQuant not truly empty'
);

const hangukPrepared = prepareExtractInput(
  'HangukQuant: https://t.co/gS6bgRzbux',
  HANGUK_LOCAL_SNIPPET,
  'x'
);
assert(!hangukPrepared.shouldSkip, 'HangukQuant should not skip LLM');

const acceptedBodyWithChromeWords = `# Account access research

This article studies how sign in systems affect authenticated research workflows.
Sign in to reproduce the experiment with account-specific material.`;
const acceptedPrepared = prepareExtractInput(
  'Account access research',
  acceptedBodyWithChromeWords,
  'article'
);
assert(!acceptedPrepared.shouldSkip, 'substantive account-access article should be accepted');
assert(
  acceptedPrepared.body === acceptedBodyWithChromeWords,
  'accepted AI body must preserve lines that chrome heuristics inspect'
);

assert(hasXExtractSignal(SYNDICATION_IMAGE_ONLY), 'syndication image-only has signal');
assert(isTrulyEmptyExtractInput('', undefined, 'x'), 'blank X is empty');
assert(isTrulyEmptyExtractInput('   ', 'Welcome', 'article'), 'chrome-only article empty');

console.log('extractFilters.test.ts: all assertions passed');
