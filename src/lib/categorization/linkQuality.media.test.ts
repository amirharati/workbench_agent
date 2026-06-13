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

const lq = detectLinkQualityIssue({
  title: 'HangukQuant chart',
  url: 'https://x.com/HangukQuant/status/1',
  enrichmentStatus: 'ok',
  snippet: imageOnlyBody,
});
assert(
  lq?.leafId === LINK_QUALITY_LEAF_IDS.MEDIA_NOT_TRANSCRIBED,
  'media-primary link quality bucket'
);

const philfungBody = [
  '# @philfung',
  '',
  'With @Cline 3.4, install MCP servers with one click via MCP Marketplace.',
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
