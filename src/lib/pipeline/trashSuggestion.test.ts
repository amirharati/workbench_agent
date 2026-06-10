import { resolveTrashSuggestionFromInput, type TrashSuggestionRowInput } from './trashSuggestion';
import type { PipelineBadge } from './pipelineBadge';

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function baseInput(overrides: Partial<TrashSuggestionRowInput> = {}): TrashSuggestionRowInput {
  const badge: PipelineBadge = overrides.meta?.pipelineBadge ?? {
    kind: 'ready',
    variant: 'success',
    label: 'Enriched',
  };
  return {
    item: { url: 'https://example.com/article' },
    embedFailed: false,
    meta: {
      pipelineBadge: badge,
      ...overrides.meta,
    },
    ...overrides,
  };
}

function runTests(): void {
  assertEqual(
    resolveTrashSuggestionFromInput(
      baseInput({
        enrichment: {
          status: 'failed',
          lastErrorCode: 'network',
          lastErrorDetail: 'HTTP 404 page not found',
        } as TrashSuggestionRowInput['enrichment'],
      })
    ),
    'Page not found (404)',
    '404 enrich detail'
  );

  assertEqual(
    resolveTrashSuggestionFromInput(
      baseInput({
        primaryCategoryId: 'seed_page-not-found',
        classifyState: 'classified_removal',
        meta: {
          pipelineBadge: { kind: 'failed', variant: 'error', label: 'Removal candidate' },
        },
      })
    ),
    'Page not found (404)',
    'link-quality removal leaf'
  );

  assertEqual(
    resolveTrashSuggestionFromInput(
      baseInput({
        primaryCategoryId: 'seed_login-auth-required',
        classifyState: 'classified_attention',
        meta: {
          pipelineBadge: { kind: 'needs_review', variant: 'warning', label: 'Needs attention' },
        },
      })
    ),
    null,
    'login-auth-required excluded'
  );

  assertEqual(
    resolveTrashSuggestionFromInput(
      baseInput({
        primaryCategoryId: 'technology-general',
        classifyState: 'classified_general',
        meta: {
          pipelineBadge: { kind: 'partial', variant: 'warning', label: 'General / Other' },
        },
      })
    ),
    null,
    'classified_general only'
  );

  assertEqual(
    resolveTrashSuggestionFromInput(
      baseInput({
        primaryCategoryId: 'technology-general',
        classifyState: 'classified_general',
        enrichment: { status: 'failed', lastErrorCode: 'network' } as TrashSuggestionRowInput['enrichment'],
        meta: {
          pipelineBadge: { kind: 'failed', variant: 'error', label: 'Fetch · network' },
          failed: true,
          failureCategory: 'network',
        },
      })
    ),
    'Network / timeout',
    'classified_general with fetch failed'
  );

  assertEqual(
    resolveTrashSuggestionFromInput(baseInput({ item: { url: 'not-a-url' } })),
    'Invalid URL',
    'invalid URL'
  );

  assertEqual(
    resolveTrashSuggestionFromInput(
      baseInput({
        meta: {
          pipelineBadge: {
            kind: 'failed',
            variant: 'error',
            label: 'Removal candidate',
            failureCategory: 'parse',
          },
          failureCategory: 'parse',
          failureReason: 'No content extracted',
        },
      })
    ),
    'Removal candidate — No content extracted',
    'removal candidate badge with detail'
  );

  console.log('trashSuggestion.test.ts: all tests passed');
}

runTests();
