import { describe, expect, it } from 'vitest';
import { resolveEffectiveClassifyState } from './counts';

describe('resolveEffectiveClassifyState', () => {
  it('does not present an orphan classified signal as complete', () => {
    expect(
      resolveEffectiveClassifyState({ signalState: 'classified', primaryCategoryId: null })
    ).toBe('pending_classify');
    expect(
      resolveEffectiveClassifyState({ signalState: 'classified_general', primaryCategoryId: null })
    ).toBe('pending_classify');
  });

  it('keeps a classified state when durable primary-link evidence exists', () => {
    expect(
      resolveEffectiveClassifyState({ signalState: 'classified', primaryCategoryId: 'topic-1' })
    ).toBe('classified');
  });
});
