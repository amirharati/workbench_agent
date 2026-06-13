import {
  isSyndicationFetchSourceId,
  isXStatusUrl,
  isXTabFetchAcceptable,
  isXTweetUnavailableBody,
  isXTabChromeDominant,
  looksLikeSyndicationXMarkdown,
  preferTabSessionForDigest,
} from './xFetchHeuristics';

const TOM_DOERR_TAB_CHROME = `PostSee new postsConversationTom Dörr@tom_doerrSubscribeClick to Subscribe to tom_doerrSelf-hostable bookmark and content organizer3:59 PM · Feb 19, 2025·18.4K Views220207290RelevantPost your replyReplyEveryone can reply`;

const SYNDICATION_THREAD = `# @tom_doerr — thread (2 parts)

## 1/2

Directory for promoting side projects

---

## 2/2

https://github.com/soGeneri/awesome-launch`;

const TAB_FAKE_SYNDICATION = `# @unknown

cursor-tools 0.6.0-alpha.0 publishing now.`;

const DELETED_TAB = `See new postsHmm...this page doesn't exist. Try searching for something else.Search`;

const xStatus = 'https://x.com/tom_doerr/status/1892318062075854982';

console.assert(isSyndicationFetchSourceId('syndication-expanded'), 'syndication-expanded');
console.assert(!isSyndicationFetchSourceId('tab-session'), 'not tab-session');
console.assert(looksLikeSyndicationXMarkdown(SYNDICATION_THREAD), 'syndication shape');
console.assert(!looksLikeSyndicationXMarkdown(TOM_DOERR_TAB_CHROME), 'not syndication shape');
console.assert(!looksLikeSyndicationXMarkdown(TAB_FAKE_SYNDICATION), 'tab @unknown not syndication');
console.assert(
  isXTabChromeDominant(TOM_DOERR_TAB_CHROME, xStatus),
  'tom_doerr tab chrome detected'
);
console.assert(
  !isXTabChromeDominant(SYNDICATION_THREAD, xStatus),
  'syndication thread not chrome'
);
console.assert(
  !isXTabChromeDominant(TOM_DOERR_TAB_CHROME, 'https://example.com/article'),
  'chrome gate only for X'
);
console.assert(isXTweetUnavailableBody(DELETED_TAB), 'deleted tweet tab shell');

const JAFAR_TAB_OPENER = `# @unknown

Don't use Fiverr and Linkedin. Here are 10 best sites to get a remote job that pays in USD:`;

const jafarUrl = 'https://x.com/JafarNajafov/status/1893182618679869943';
console.assert(!isXTabFetchAcceptable(JAFAR_TAB_OPENER, jafarUrl), 'jafar tab opener rejected');
console.assert(
  isXTabFetchAcceptable(SYNDICATION_THREAD, xStatus),
  'syndication thread acceptable'
);

console.assert(isXStatusUrl('https://x.com/philfung/status/1892291566737260629'), 'x status url');
console.assert(!isXStatusUrl('https://x.com/philfung'), 'not status url');
console.assert(
  !preferTabSessionForDigest('https://x.com/philfung/status/1892291566737260629'),
  'side panel skips tab for x status'
);
console.assert(
  preferTabSessionForDigest('https://seekingalpha.com/article/123'),
  'side panel keeps tab for articles'
);

console.log('xFetchRouting.test.ts: all assertions passed');
