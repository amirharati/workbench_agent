import {
  explainHardFetchFailure,
  isHttpErrorPageBody,
  isPdfBinaryBody,
  rewriteLinkFollowUrl,
} from './fetchQuality';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const PDF_GARBAGE = '%PDF-1.5\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>';

assert(isPdfBinaryBody(PDF_GARBAGE), 'detect pdf binary');
assert(
  explainHardFetchFailure(PDF_GARBAGE, { url: 'https://arxiv.org/pdf/2012.07149' })?.code ===
    'parse_empty',
  'hard fail pdf'
);

assert(isHttpErrorPageBody('# 404 - Page not found\n\nNothing here', '404'), '404 body');
assert(
  explainHardFetchFailure('# 404 - Page not found\n\nNothing here', {
    url: 'http://www.51x.ai',
    title: '404',
  })?.detail?.includes('error page') === true,
  'hard fail 404'
);

assert(
  rewriteLinkFollowUrl('https://arxiv.org/pdf/2012.07149') ===
    'https://arxiv.org/abs/2012.07149',
  'arxiv pdf→abs'
);

assert(
  !explainHardFetchFailure(
    'A normal article with enough text to pass the minimum length gate for fetch quality checks and continue.',
    { url: 'https://example.com' }
  ),
  'normal article not blocked'
);

console.log('fetchQuality.linkFollow.test.ts: all assertions passed');
