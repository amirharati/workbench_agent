import { describe, expect, it } from 'vitest';
import type { AiCategory } from '../categorization/types';
import {
  blendCategorySearchVectors,
  buildCategorySearchText,
  categoryMemberRevision,
  categoryMemberWeight,
  isManageableTopicCategory,
  isSearchableTopicCategory,
  scoreCategoryProfileVector,
} from './categorySearchProfiles';

const category: AiCategory = {
  id: 'speech-asr',
  name: 'Automatic Speech Recognition',
  parentName: 'Machine Learning',
  description: 'Speech-to-text models and acoustic transcription systems.',
  canonicalTags: ['ASR', 'speech recognition'],
  kind: 'leaf',
  status: 'approved',
  assignable: true,
  created_at: 1,
  updated_at: 1,
};

describe('category search profiles', () => {
  it('builds stable semantic text from taxonomy metadata', () => {
    expect(buildCategorySearchText(
      category,
      'Models, training, evaluation, and machine-learning research.'
    )).toBe(
      [
        'Machine Learning',
        'Models, training, evaluation, and machine-learning research.',
        'Automatic Speech Recognition',
        'Speech-to-text models and acoustic transcription systems.',
        'ASR',
        'speech recognition',
      ].join('\n')
    );
  });

  it('uses metadata first and gradually caps member evidence at 80 percent', () => {
    expect(categoryMemberWeight(0)).toBe(0);
    expect(categoryMemberWeight(5)).toBe(0.5);
    expect(categoryMemberWeight(100)).toBe(0.8);

    const metadataOnly = blendCategorySearchVectors([1, 0], [], 0);
    expect(metadataOnly).toEqual([1, 0]);

    const blended = blendCategorySearchVectors([1, 0], [0, 1], 5);
    expect(blended[0]).toBeCloseTo(Math.SQRT1_2);
    expect(blended[1]).toBeCloseTo(Math.SQRT1_2);
    expect(scoreCategoryProfileVector(blended, blended)).toBeCloseTo(1);
  });

  it('changes member revision when evidence changes', () => {
    const initial = categoryMemberRevision({
      memberCount: 2,
      linkUpdatedAt: 10,
      signalUpdatedAt: 20,
      scoreSum: 1.5,
    });
    const changed = categoryMemberRevision({
      memberCount: 3,
      linkUpdatedAt: 10,
      signalUpdatedAt: 20,
      scoreSum: 2.2,
    });
    expect(changed).not.toBe(initial);
  });

  it('keeps pipeline quality and attention leaves out of topic search', () => {
    expect(isSearchableTopicCategory(category)).toBe(true);
    expect(isSearchableTopicCategory({
      ...category,
      id: 'seed_url-redirect-mismatch',
      parentId: 'link-quality',
      parentName: 'Link quality & attention',
      name: 'URL redirect mismatch',
    })).toBe(false);
    expect(isSearchableTopicCategory({
      ...category,
      id: 'seed_login-auth-required',
      parentId: 'link-quality',
      parentName: 'Link quality & attention',
      name: 'Login or auth required',
    })).toBe(false);
  });

  it('keeps parent profiles available for category management but out of item search', () => {
    const parent: AiCategory = {
      ...category,
      id: 'machine-learning',
      name: 'Machine Learning',
      kind: 'parent',
      assignable: false,
      parentId: null,
      parentName: null,
    };
    expect(isManageableTopicCategory(parent)).toBe(true);
    expect(isSearchableTopicCategory(parent)).toBe(false);
  });
});
