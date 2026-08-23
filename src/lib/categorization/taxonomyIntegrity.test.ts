import { describe, expect, it } from 'vitest';
import { mergeDiscoveryLeaves } from './discoverTaxonomy';
import {
  getBundledSeedDocument,
  seedDocumentToCategories,
  validateTaxonomyInvariant,
} from './seedImport';
import { getAssignableLeaves } from './taxonomyCatalog';
import type { AiCategory } from './types';

describe('taxonomy integrity', () => {
  it('accepts a complete freshly-created bundled taxonomy', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);

    expect(validateTaxonomyInvariant(bundled, bundled)).toEqual([]);
  });

  it('rejects a partially-created database instead of migrating it', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const partial = bundled.filter(
      (category) =>
        category.id === 'link-quality' || category.id === 'seed_movies-tv-streaming'
    );

    const errors = validateTaxonomyInvariant(partial, bundled);
    expect(errors).toContain('missing bundled parent "machine-learning"');
    expect(errors).toContain('active leaf "seed_movies-tv-streaming" has no active parent');
  });

  it('rejects invalid leaf hierarchy and never creates discovered error children', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const movie: AiCategory = {
      id: 'seed_movies-tv-streaming',
      name: 'Movies, TV & streaming',
      kind: 'leaf',
      status: 'approved',
      assignable: true,
      parentId: 'health-lifestyle',
      source: 'seed',
      created_at: 1,
      updated_at: 1,
    };
    expect(getAssignableLeaves([movie])).toEqual([]);
    expect(validateTaxonomyInvariant([movie], bundled)).toContain(
      'active leaf "seed_movies-tv-streaming" has no active parent'
    );

    const linkQuality: AiCategory = {
      id: 'link-quality',
      name: 'Link quality',
      kind: 'parent',
      status: 'approved',
      assignable: false,
      source: 'seed',
      created_at: 1,
      updated_at: 1,
    };
    const merged = mergeDiscoveryLeaves(
      [linkQuality],
      [{ parentId: 'link-quality', name: 'Deep Learning Resources' }],
      new Set(['link-quality']),
      1,
      10
    );
    expect(merged.added).toEqual([]);
  });

  it('rejects normal discovered topics under the Link quality branch', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const discovered: AiCategory = {
      id: 'deep-learning-resources',
      name: 'Deep Learning Resources',
      kind: 'leaf',
      status: 'ai_proposed',
      assignable: true,
      parentId: 'link-quality',
      parentName: 'Link quality & attention',
      source: 'discovered',
      created_at: 1,
      updated_at: 1,
    };

    expect(validateTaxonomyInvariant([...bundled, discovered], bundled)).toContain(
      'topic leaf "deep-learning-resources" cannot be under Link quality'
    );
  });
});
