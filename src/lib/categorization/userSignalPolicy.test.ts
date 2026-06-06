import { resolveStagedClassifyStateAfterReject } from './userSignalStageResolve';

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function runTests(): void {
  assertEqual(
    resolveStagedClassifyStateAfterReject({ eligible: false }),
    'ineligible',
    'ineligible when not eligible'
  );

  assertEqual(
    resolveStagedClassifyStateAfterReject({ eligible: true, primaryCategoryId: null }),
    'pending_discover',
    'eligible with no primary → pending_discover'
  );

  assertEqual(
    resolveStagedClassifyStateAfterReject({
      eligible: true,
      primaryCategoryId: 'parent-general',
    }),
    'pending_classify',
    'eligible with non-null primary → pending_classify'
  );

  console.log('userSignalPolicy.test.ts: all tests passed');
}

runTests();
