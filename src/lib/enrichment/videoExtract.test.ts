import {
  extractVideoStructured,
  isVideoListingTabScrape,
  normalizeVideoMarkdown,
} from './videoExtract';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(isVideoListingTabScrape(`# Title\n\nItems on this page (12):\n\n## Foo`), 'listing');

const jinaSample = `# Data Analysis for Traders - YouTube

## Data Analysis for Traders
Robot Wealth 23,757 views Streamed 3 years ago

## Description
This is an interactive research session. Many struggle to know how to start researching market inefficiencies.

## Transcript
Hello everyone welcome to the stream`;

const normalized = normalizeVideoMarkdown(jinaSample);
assert(!!normalized, 'normalized');
assert(normalized!.includes('interactive research session'), 'description');
assert(normalized!.includes('Channel: Robot Wealth'), 'channel');

const vimeoSample = `# Cool talk - Vimeo

## About
A deep dive into market microstructure for systematic traders.`;

assert(
  !!extractVideoStructured(vimeoSample)?.description?.includes('microstructure'),
  'vimeo About section'
);

console.log('videoExtract.test.ts: ok');
