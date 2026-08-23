import { describe, expect, it } from 'vitest';
import type { AiCategory } from './types';
import {
  findGeneralLeafFallback,
  reconcileGeneralLeafAssignment,
} from './classifyTopicExtract';

function generalLeaf(id: string, parentId: string): AiCategory {
  return {
    id,
    name: `Other (${parentId})`,
    kind: 'leaf',
    status: 'approved',
    assignable: true,
    parentId,
    source: 'seed',
    isGeneralFallback: true,
    created_at: 1,
    updated_at: 1,
  };
}

describe('broad-domain classification fallback', () => {
  const categories = [
    generalLeaf('seed_ai-productivity-general', 'ai-productivity'),
    generalLeaf('seed_machine-learning-general', 'machine-learning'),
    generalLeaf('seed_personal-finance-general', 'personal-finance'),
  ];

  it('uses the matching General leaf after an empty eligible AI decision', () => {
    expect(findGeneralLeafFallback(
      categories,
      'Human flourishing, personal purpose, and career development in the age of artificial intelligence.'
    )?.id).toBe('seed_ai-productivity-general');
  });

  it('still prefers a stronger research-domain signal', () => {
    expect(findGeneralLeafFallback(
      categories,
      'PyTorch transformer model training, inference evaluation, and neural network optimization.'
    )?.id).toBe('seed_machine-learning-general');
  });

  it('leaves genuinely unmatched content for multi-item Discover', () => {
    expect(findGeneralLeafFallback(categories, 'A completely opaque untitled fragment.'))
      .toBeUndefined();
  });

  it('repairs a General leaf whose parent has no evidence in the item', () => {
    expect(reconcileGeneralLeafAssignment(
      categories,
      ['seed_personal-finance-general'],
      'Human flourishing, meaningful work, and personal values in the age of artificial intelligence. Discussion of AI and purpose.',
    )).toMatchObject({
      categoryIds: ['seed_ai-productivity-general'],
      correctedFrom: 'seed_personal-finance-general',
      correctedTo: 'seed_ai-productivity-general',
    });
  });

  it('keeps Personal finance when the item actually contains finance evidence', () => {
    expect(reconcileGeneralLeafAssignment(
      categories,
      ['seed_personal-finance-general'],
      'Personal finance guide to index funds, retirement savings, and budgeting.',
    )).toEqual({ categoryIds: ['seed_personal-finance-general'] });
  });
});
