import { resolveSummaryRedirectPromptMode } from './prompts';
import type { RedirectContext } from './fetchRedirect';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function ctx(partial: Partial<RedirectContext> & Pick<RedirectContext, 'redirectClass'>): RedirectContext {
  return {
    requestedUrl: 'https://example.com/a',
    finalUrl: 'https://example.com/b',
    hops: ['https://example.com/a', 'https://example.com/b'],
    redirectClass: partial.redirectClass,
    resourceMismatch: partial.resourceMismatch ?? false,
  };
}

assert(
  resolveSummaryRedirectPromptMode({
    redirectVerdict: {
      pageMatchesBookmark: false,
      fetchedPageKind: 'homepage',
      redirectNote: 'hub',
      reason: 'drift',
    },
  }) === 'prior_verdict',
  'prior_verdict when pre-step verdict present'
);

assert(
  resolveSummaryRedirectPromptMode({ redirectContext: ctx({ redirectClass: 'suspicious' }) }) ===
    'redirect_fields',
  'redirect_fields for suspicious'
);

assert(
  resolveSummaryRedirectPromptMode({
    redirectContext: ctx({ redirectClass: 'benign', resourceMismatch: true }),
  }) === 'redirect_fields',
  'redirect_fields for resource mismatch'
);

assert(
  resolveSummaryRedirectPromptMode({ redirectContext: ctx({ redirectClass: 'benign' }) }) === 'benign_hint',
  'benign_hint'
);

assert(
  resolveSummaryRedirectPromptMode({ redirectContext: ctx({ redirectClass: 'none' }) }) === 'none',
  'none for no redirect'
);

assert(resolveSummaryRedirectPromptMode({}) === 'none', 'none when empty hints');

console.log('prompts.test.ts: ok');
