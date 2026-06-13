import {
  buildReferenceIndex,
  extractFollowedReferenceUrls,
  formatReferencesBlock,
  referencesForMeta,
} from './referenceIndex';
import type { EnrichmentReference } from './types';

const JAFAR_STYLE = `# @JafarNajafov — thread (3 parts)

## 1/3

Resources for hiring:

1. Toptal https://www.toptal.com/
2. Lemon.io https://lemon.io/
3. Arc.dev https://arc.dev/

---

## 2/3

More links https://arxiv.org/abs/2301.00001 and https://github.com/org/repo

Image: https://pbs.twimg.com/media/abc.jpg

---

## Linked: Toptal — hire developers

Source: https://www.toptal.com/

Toptal landing page copy here.

---

## Linked: arxiv.org

Source: https://arxiv.org/abs/2301.00001

Paper abstract here.`;

const bookmark = 'https://x.com/JafarNajafov/status/1893182618679869943';

const followed = extractFollowedReferenceUrls(JAFAR_STYLE);
console.assert(followed.has('https://www.toptal.com/'), 'toptal followed');
console.assert(followed.has('https://arxiv.org/abs/2301.00001'), 'arxiv followed');
console.assert(followed.size === 2, `followed count ${followed.size}`);

const refs = buildReferenceIndex(JAFAR_STYLE, bookmark);
console.assert(refs.length >= 6, `expected >=6 refs, got ${refs.length}`);

const toptal = refs.find((r) => r.url === 'https://www.toptal.com/');
console.assert(toptal?.followed === true, 'toptal marked followed');
console.assert(toptal?.label === 'Toptal — hire developers', `toptal label: ${toptal?.label}`);

const lemon = refs.find((r) => r.url.includes('lemon.io'));
console.assert(lemon && !lemon.followed, 'lemon not followed');
console.assert(lemon?.label === 'Lemon.io', `lemon label: ${lemon?.label}`);

const arxiv = refs.find((r) => r.url.includes('arxiv.org'));
console.assert(arxiv?.kind === 'article', 'arxiv article kind');
console.assert(arxiv?.followed === true, 'arxiv followed');

const gh = refs.find((r) => r.url.includes('github.com'));
console.assert(gh?.kind === 'repo', 'github repo kind');

const img = refs.find((r) => r.url.includes('pbs.twimg.com'));
console.assert(img?.kind === 'image', 'twimg image kind');

const externals = refs.filter((r) => r.scope === 'external');
console.assert(externals.length >= 5, 'mostly external refs');

const sample: EnrichmentReference[] = [
  { url: 'https://www.toptal.com/', label: 'Toptal', scope: 'external', kind: 'article', followed: true },
  { url: 'https://lemon.io/', label: 'Lemon.io', scope: 'external', kind: 'article' },
];
console.assert(formatReferencesBlock(sample).includes('link only'), 'link-only tag');
console.assert(referencesForMeta(sample).length === 2, 'meta rows');
console.assert(referencesForMeta(sample)[0].followed === true, 'meta followed flag');

console.log('referenceIndex.test.ts: all assertions passed');
