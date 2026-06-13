import {
  cleanXImportText,
  collectXMediaTcoUrls,
  isXMediaExpandedUrl,
  shouldPreferImportTitle,
  stripTrailingOrSoleMediaTco,
} from './xImportHygiene';

const TOM_DOERR_B11 = {
  tweet_url: 'https://x.com/tom_doerr/status/1892318062075854982',
  screen_name: 'tom_doerr',
  full_text: 'Self-hostable bookmark and content organizer https://t.co/p1Pn6sJokT',
  extended_media: [
    {
      url: 'https://t.co/p1Pn6sJokT',
      expanded_url: 'https://twitter.com/tom_doerr/status/1892318062075854982/photo/1',
      media_url_https: 'https://pbs.twimg.com/media/GkLdOQYWEAADX5z.png',
    },
  ],
};

const HANGUK_IMAGE_ONLY = {
  tweet_url: 'https://x.com/HangukQuant/status/1889039264891224402',
  screen_name: 'HangukQuant',
  full_text: 'https://t.co/gS6bgRzbux',
  extended_media: [
    {
      url: 'https://t.co/gS6bgRzbux',
      expanded_url: 'https://twitter.com/HangukQuant/status/1889039264891224402/photo/1',
    },
  ],
};

const EXTERNAL_TCO = {
  full_text: 'Great repo https://t.co/abc123xyz',
  extended_media: [],
  entities: {
    urls: [
      {
        url: 'https://t.co/abc123xyz',
        expanded_url: 'https://github.com/org/repo',
      },
    ],
  },
};

console.assert(
  isXMediaExpandedUrl('https://twitter.com/user/status/1/photo/1'),
  'photo facet'
);
console.assert(!isXMediaExpandedUrl('https://github.com/org/repo'), 'external');

const b11Tcos = collectXMediaTcoUrls(TOM_DOERR_B11);
console.assert(b11Tcos.length === 1 && b11Tcos[0].includes('p1Pn6sJokT'), 'B11 media t.co');

const b11Clean = cleanXImportText(TOM_DOERR_B11, TOM_DOERR_B11.full_text);
console.assert(
  b11Clean === 'Self-hostable bookmark and content organizer',
  `B11 clean: ${JSON.stringify(b11Clean)}`
);

const hangukClean = cleanXImportText(HANGUK_IMAGE_ONLY, HANGUK_IMAGE_ONLY.full_text);
console.assert(hangukClean === '', `image-only clean: ${JSON.stringify(hangukClean)}`);

const externalClean = cleanXImportText(EXTERNAL_TCO, EXTERNAL_TCO.full_text);
console.assert(
  externalClean === 'Great repo https://t.co/abc123xyz',
  `external t.co kept: ${JSON.stringify(externalClean)}`
);

console.assert(
  stripTrailingOrSoleMediaTco('Hello world https://t.co/foo') === 'Hello world',
  'trailing strip'
);
console.assert(stripTrailingOrSoleMediaTco('https://t.co/foo') === '', 'sole t.co');

console.assert(
  shouldPreferImportTitle(
    'tom_doerr: Self-hostable bookmark and content organizer https://t.co/p1Pn6sJokT',
    'tom_doerr: Self-hostable bookmark and content organizer',
    'https://x.com/tom_doerr/status/1'
  ),
  'merge prefers hygiene title'
);

console.log('xImportHygiene.test.ts: all assertions passed');
