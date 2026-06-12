import {
  buildRedirectContext,
  classifyRedirect,
  isAuthPath,
  isXStatusEquivalent,
  resourcePathMismatch,
  shouldFlagRedirectReview,
  shouldRunRedirectAiVerdict,
  urlsEquivalentForRedirect,
} from './fetchRedirect';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function runTests(): void {
  assert(
    urlsEquivalentForRedirect(
      'https://www.example.com/article/foo/',
      'https://example.com/article/foo'
    ),
    'www + trailing slash should be equivalent'
  );

  assert(
    classifyRedirect(
      'http://example.com/post/1',
      'https://example.com/post/1'
    ) === 'benign',
    'http→https same path is benign'
  );

  assert(
    isXStatusEquivalent(
      'https://twitter.com/user/status/1234567890',
      'https://x.com/user/status/1234567890'
    ),
    'twitter.com and x.com same status are equivalent'
  );

  assert(
    classifyRedirect(
      'https://twitter.com/user/status/123',
      'https://x.com/user/status/123'
    ) === 'benign',
    'twitter→x same status is benign'
  );

  assert(isAuthPath('https://example.com/login'), 'login path detected');
  assert(
    !resourcePathMismatch(
      'https://example.com/article/123',
      'https://example.com/login?next=/article/123'
    ),
    'login redirect is not a resource mismatch'
  );

  const saArticle =
    'https://seekingalpha.com/article/3963244-magic-formula-depth-look-mechanics-potential-improvement';
  const saHome = 'https://seekingalpha.com/';
  assert(resourcePathMismatch(saArticle, saHome), 'SA article → homepage is resource mismatch');
  assert(
    classifyRedirect(saArticle, saHome) === 'suspicious',
    'SA article → homepage is suspicious redirect'
  );

  const ctx = buildRedirectContext(saArticle, saHome, [saArticle, saHome]);
  assert(ctx.resourceMismatch === true, 'buildRedirectContext sets resourceMismatch');
  assert(
    !shouldFlagRedirectReview(ctx).flag,
    'mechanical mismatch alone should not flag review without AI verdict'
  );
  assert(
    Boolean(shouldFlagRedirectReview(ctx).annotate),
    'mechanical mismatch should still annotate'
  );

  assert(
    !shouldFlagRedirectReview(ctx, {
      redirectVerdict: { pageMatchesBookmark: true, redirectNote: 'same article' },
    }).flag,
    'verdict match=true should not flag review'
  );

  assert(
    !shouldFlagRedirectReview(ctx, {
      redirectVerdict: {
        pageMatchesBookmark: false,
        fetchedPageKind: 'login',
        redirectNote: 'Verify your identity to access this thread',
      },
    }).flag,
    'login/auth verdict should not flag url_redirect review'
  );

  assert(
    shouldFlagRedirectReview(ctx, {
      redirectVerdict: { pageMatchesBookmark: false, redirectNote: 'hub not article' },
    }).flag === true,
    'verdict match=false should flag review'
  );

  assert(
    shouldFlagRedirectReview(
      buildRedirectContext(
        'https://example.com/article/a',
        'https://example.com/market-news'
      ),
      { pageMatchesBookmark: false, redirectNote: 'Landed on news hub' }
    ).flag === true,
    'AI false match flags review'
  );

  assert(
    classifyRedirect(
      'https://example.com/article/one',
      'https://other.com/article/one'
    ) === 'suspicious',
    'cross-host is suspicious'
  );

  assert(
    classifyRedirect('https://example.com/same', 'https://example.com/same') === 'none',
    'identical URL is none'
  );

  assert(
    !shouldRunRedirectAiVerdict(
      buildRedirectContext(
        'https://twitter.com/u/status/1',
        'https://x.com/u/status/1'
      )
    ),
    'benign twitter→x should not run redirect AI'
  );

  assert(
    shouldRunRedirectAiVerdict(buildRedirectContext(saArticle, saHome)),
    'suspicious SA should run redirect AI'
  );

  console.log('fetchRedirect.test.ts: all tests passed');
}

runTests();
