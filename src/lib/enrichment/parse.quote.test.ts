import { parseFetchedContent } from './parse';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) throw new Error(`${msg}: expected ${String(expected)}, got ${String(actual)}`);
}

// B2: quoted_author must not be first @mention in tweet body.
const withMention = parseFetchedContent(
  [
    '# @alice',
    '',
    'Check out @bob for more on this topic',
    '',
    '> Quote from @carol:',
    '> The actual quoted text here',
  ].join('\n'),
  'x'
);
assertEqual(withMention.quotedAuthor, 'carol', 'quotedAuthor from quote marker');
assert(
  !!withMention.quotedText?.includes('actual quoted text'),
  'quotedText from blockquote'
);

// Expanded quoted thread — author from header, not OP @mention.
const expanded = parseFetchedContent(
  [
    '# @alice',
    '',
    'My take on the thread',
    '',
    '### Quoted thread from @dave (2 parts)',
    '',
    '# @dave — thread (2 parts)',
    '',
    '## 1/2',
    '',
    'First part of quoted thread',
    '',
    '## 2/2',
    '',
    'Second part',
  ].join('\n'),
  'x'
);
assertEqual(expanded.quotedAuthor, 'dave', 'expanded quote author');
assert(
  !!expanded.quotedText?.includes('First part') &&
    !!expanded.quotedText?.includes('Second part'),
  'expanded quoted text body'
);

// B1: same-author expanded quoted thread must not populate quoted_text (legacy bodies).
const selfQuote = parseFetchedContent(
  [
    '# @EastlondonDev — thread (3 parts)',
    '',
    '## 3/3',
    '',
    'Model defaults are important.',
    '',
    '### Quoted thread from @EastlondonDev (5 parts)',
    '',
    '# @EastlondonDev — thread (5 parts)',
    '',
    '## 1/5',
    '',
    'Vote for models',
  ].join('\n'),
  'x'
);
assertEqual(selfQuote.quotedAuthor, 'EastlondonDev', 'self-quote author from header');
assert(!selfQuote.quotedText?.includes('Vote for models'), 'B1: no quoted_text for self expanded thread');

console.log('parse.quote.test.ts: ok');
