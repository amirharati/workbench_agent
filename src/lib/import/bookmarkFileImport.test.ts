import { parseBookmarkCsv, parseBookmarkJson } from './bookmarkFileImport';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const B11_JSON = JSON.stringify([
  {
    tweet_url: 'https://x.com/tom_doerr/status/1892318062075854982',
    screen_name: 'tom_doerr',
    full_text: 'Self-hostable bookmark and content organizer https://t.co/p1Pn6sJokT',
    extended_media: [
      {
        url: 'https://t.co/p1Pn6sJokT',
        expanded_url: 'https://twitter.com/tom_doerr/status/1892318062075854982/photo/1',
      },
    ],
  },
]);

const B11_CSV = `tweet_url,full_text,screen_name
https://x.com/tom_doerr/status/1892318062075854982,"Self-hostable bookmark and content organizer https://t.co/p1Pn6sJokT",tom_doerr`;

async function run() {
  const jsonRows = await parseBookmarkJson(B11_JSON);
  assert(jsonRows.length === 1, `json row count: ${jsonRows.length}`);
  const json = jsonRows[0];
  assert(
    json.title === 'tom_doerr: Self-hostable bookmark and content organizer',
    `json title: ${json.title}`
  );
  assert(!json.title.includes('t.co'), 'json title must not include media t.co');
  assert(
    json.description === 'Self-hostable bookmark and content organizer',
    `json description: ${json.description}`
  );
  assert(json.importSource === 'x-bookmarks-export-v1', 'x adapter');

  const csvRows = await parseBookmarkCsv(B11_CSV);
  assert(csvRows.length === 1, `csv row count: ${csvRows.length}`);
  const csv = csvRows[0];
  assert(csv.url.includes('tom_doerr/status'), `csv url: ${csv.url}`);
  assert(
    csv.title === 'tom_doerr: Self-hostable bookmark and content organizer',
    `csv title: ${csv.title}`
  );
  assert(!csv.title.includes('t.co'), 'csv title must not include media t.co');
  assert(csv.importSource === 'x-bookmarks-export-v1', 'csv x adapter');

  console.log('bookmarkFileImport.test.ts: all assertions passed');
}

run().catch((e) => {
  console.error(e);
  throw e;
});
