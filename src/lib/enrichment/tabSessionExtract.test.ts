import { sharedAuthSessionPathPrefix, urlsMatchForTabSession } from './tabSessionMatch';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function runTests(): void {
  assert(
    urlsMatchForTabSession(
      'https://www.udemy.com/course/my-course/learn/lecture/12345',
      'https://udemy.com/course/my-course/learn/lecture/12345/'
    ),
    'identical Udemy lecture URLs should match'
  );

  assert(
    sharedAuthSessionPathPrefix(
      'https://www.udemy.com/course/python-bootcamp/learn/lecture/111111',
      'https://www.udemy.com/course/python-bootcamp/'
    ),
    'Udemy course landing and lecture should Tier-B match'
  );

  assert(
    !sharedAuthSessionPathPrefix(
      'https://github.com/org/repo',
      'https://github.com/settings/profile'
    ),
    'unrelated GitHub paths must not Tier-B match'
  );

  assert(
    urlsMatchForTabSession(
      'https://www.reddit.com/r/machinelearning/comments/abc123/post/',
      'https://reddit.com/r/machinelearning/comments/abc123/post'
    ),
    'Reddit thread path should keep existing match behavior'
  );

  assert(
    urlsMatchForTabSession(
      'https://docs.google.com/document/d/ABC123/edit',
      'https://docs.google.com/document/d/ABC123/'
    ),
    'Google docs with same id should match'
  );

  console.log('tabSessionExtract.test.ts: all tests passed');
}

runTests();
