import { describe, expect, it } from 'vitest';
import { mergeDiscoveryLeaves } from './discoverTaxonomy';
import {
  getBundledSeedDocument,
  planMissingBundledHierarchyRepair,
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

  it('repairs only seed-owned flat leaves while preserving their data', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const target = bundled.find((category) => category.id === 'seed_ml-inference-infra');
    expect(target?.parentId).toBe('ai-productivity');
    const flat = bundled.map((category) => category.id === target?.id
      ? {
          ...category,
          parentId: undefined,
          parentName: undefined,
          itemCount: 19,
          description: 'Preserve this existing description',
          updated_at: 11,
        }
      : category);

    const repairs = planMissingBundledHierarchyRepair(flat, bundled, 20);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({
      id: 'seed_ml-inference-infra',
      parentId: 'ai-productivity',
      itemCount: 19,
      description: 'Preserve this existing description',
      updated_at: 20,
    });
    const repaired = flat.map((category) => repairs.find((row) => row.id === category.id) ?? category);
    expect(validateTaxonomyInvariant(repaired, bundled)).toEqual([]);
  });

  it('does not silently reparent wrong or discovered rows', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const target = bundled.find((category) => category.id === 'seed_ml-inference-infra')!;
    const wrongParent = { ...target, parentId: 'product-gtm' };
    const discoveredFlat = { ...target, parentId: undefined, source: 'discovered' as const };

    expect(planMissingBundledHierarchyRepair([wrongParent], bundled)).toEqual([]);
    expect(planMissingBundledHierarchyRepair([discoveredFlat], bundled)).toEqual([]);
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
