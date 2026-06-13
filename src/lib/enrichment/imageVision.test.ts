import {
  extractVisionImageUrls,
  isVisionCandidateImageUrl,
  needsImageVisionEnrichment,
} from './imageVision';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

const HANGUK = `# @HangukQuant

Image: https://pbs.twimg.com/media/Gjc3McubsAAMBhb.jpg?name=orig

(1 photo(s) attached)`;

const MARC_THREAD = `# @marcb_xyz — thread (4 parts)

## 1/4

Google white paper on AI agents`;

const ARTICLE_WITH_HERO = `# Product launch

![hero](https://cdn.example.com/assets/launch-hero.png)

Short blurb.`;

assert(isVisionCandidateImageUrl('https://pbs.twimg.com/media/x.jpg'), 'pbs media');
assert(!isVisionCandidateImageUrl('https://x.com/favicon.ico'), 'skip favicon');
assert(extractVisionImageUrls(HANGUK).length === 1, 'x image extract');
assert(
  extractVisionImageUrls(ARTICLE_WITH_HERO).includes('https://cdn.example.com/assets/launch-hero.png'),
  'markdown image'
);
assert(needsImageVisionEnrichment(HANGUK, 'x'), 'image-only x');
assert(!needsImageVisionEnrichment(MARC_THREAD, 'x'), 'text thread skips');
assert(needsImageVisionEnrichment(ARTICLE_WITH_HERO, 'article'), 'thin article + hero');

console.log('imageVision.test.ts: all assertions passed');
