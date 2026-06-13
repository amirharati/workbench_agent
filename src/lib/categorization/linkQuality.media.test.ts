import { detectLinkQualityIssue, LINK_QUALITY_LEAF_IDS } from './linkQuality';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const imageOnlyBody = [
  '# @HangukQuant',
  '',
  'Image: https://pbs.twimg.com/media/chart.jpg',
  '(1 photo(s) attached)',
].join('\n');

assert(
  detectLinkQualityIssue({
    title: 'HangukQuant chart',
    url: 'https://x.com/HangukQuant/status/1',
    enrichmentStatus: 'ok',
    snippet: imageOnlyBody,
  }) === null,
  'image-only X post should not use media-not-transcribed bucket'
);

const videoOnlyBody = [
  '# @someone',
  '',
  'Video: https://x.com/someone/status/1/video/1',
  '(1:30 — not transcribed)',
].join('\n');

const lq = detectLinkQualityIssue({
  title: 'demo clip',
  url: 'https://x.com/someone/status/1',
  enrichmentStatus: 'ok',
  snippet: videoOnlyBody,
});
assert(
  lq?.leafId === LINK_QUALITY_LEAF_IDS.MEDIA_NOT_TRANSCRIBED,
  'video-only link quality bucket'
);

const philfungBody = [
  '# @philfung',
  '',
  'With @Cline 3.4, install MCP servers with one click via MCP Marketplace. MCP is super cool - it lets you read SQLite databases, browse local files, automate with Playwright.',
  '',
  '> Quote from @sdrzn:',
  '> Cline v3.4 is out with MCP Marketplace and mermaid diagrams in Plan mode.',
  '',
  'Video: https://x.com/sdrzn/status/1/video/1',
  '(2:05 — not transcribed)',
].join('\n');

assert(
  detectLinkQualityIssue({
    title: 'philfung on Cline',
    url: 'https://x.com/philfung/status/1',
    enrichmentStatus: 'ok',
    snippet: philfungBody,
  }) === null,
  'substantive X post with video annotation is not media-not-transcribed bucket'
);

console.log('linkQuality.media.test.ts: all tests passed');
