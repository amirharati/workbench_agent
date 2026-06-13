import {
  isSyndicationFetchSourceId,
  isXTabChromeDominant,
  looksLikeSyndicationXMarkdown,
} from './xFetchHeuristics';

const TOM_DOERR_TAB_CHROME = `PostSee new postsConversationTom Dörr@tom_doerrSubscribeClick to Subscribe to tom_doerrSelf-hostable bookmark and content organizer3:59 PM · Feb 19, 2025·18.4K Views220207290RelevantPost your replyReplyEveryone can reply`;

const SYNDICATION_THREAD = `# @tom_doerr — thread (2 parts)

## 1/2

Directory for promoting side projects

---

## 2/2

https://github.com/soGeneri/awesome-launch`;

const xStatus = 'https://x.com/tom_doerr/status/1892318062075854982';

console.assert(isSyndicationFetchSourceId('syndication-expanded'), 'syndication-expanded');
console.assert(!isSyndicationFetchSourceId('tab-session'), 'not tab-session');
console.assert(looksLikeSyndicationXMarkdown(SYNDICATION_THREAD), 'syndication shape');
console.assert(!looksLikeSyndicationXMarkdown(TOM_DOERR_TAB_CHROME), 'not syndication shape');
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

console.log('xFetchRouting.test.ts: all assertions passed');
