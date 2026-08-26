import { describe, expect, it } from 'vitest';
import type { AiItemCategoryLink } from './types';
import { primaryLeafIdFromLinks, resolveEffectiveClassifyState } from './counts';

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

describe('primaryLeafIdFromLinks', () => {
  it('treats redirect mismatch as secondary even when stale data marks it primary', () => {
    const links: AiItemCategoryLink[] = [
      {
        id: 'redirect', itemId: 'item-1', categoryId: 'seed_url-redirect-mismatch',
        score: 0.94, isPrimary: true, source: 'ai', status: 'suggested',
        created_at: 1, updated_at: 2,
      },
      {
        id: 'asr', itemId: 'item-1', categoryId: 'seed_asr',
        score: 0.9, isPrimary: false, source: 'ai', status: 'suggested',
        created_at: 1, updated_at: 2,
      },
    ];

    expect(primaryLeafIdFromLinks(links)).toBe('seed_asr');
    expect(primaryLeafIdFromLinks([links[0]])).toBeNull();
  });
});
