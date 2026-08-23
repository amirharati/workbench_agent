import seedDoc from './data/categories.seed.json';
import {
  isLinkQualityLeafId,
  LINK_QUALITY_PARENT_ID,
  LINK_QUALITY_SEED_LEAVES,
  LINK_QUALITY_SEED_PARENT,
} from './linkQuality';
import { ensureGeneralFallbackLeaves } from './taxonomyCatalog';
import { DEFAULT_TAXONOMY_STATE, type AiCategory } from './types';

export interface SeedDocument {
  taxonomyVersion: number;
  description?: string;
  parents: Array<{ id: string; name: string; description?: string }>;
  leaves: Array<{
    id: string;
    parentId: string;
    name: string;
    description?: string;
    canonicalTags?: string[];
    isGeneralFallback?: boolean;
    isRemovalCandidate?: boolean;
  }>;
}

export function getBundledSeedDocument(): SeedDocument {
  const raw = seedDoc as SeedDocument;
  const parents = [...(raw.parents ?? [])];
  if (!parents.some((p) => p.id === LINK_QUALITY_SEED_PARENT.id)) {
    parents.push(LINK_QUALITY_SEED_PARENT);
  }
  const leaves = [...(raw.leaves ?? [])].map((l) => ({
    ...l,
    description: l.description ?? '',
    canonicalTags: l.canonicalTags ?? [],
  }));
  for (const lq of LINK_QUALITY_SEED_LEAVES) {
    if (!leaves.some((l) => l.id === lq.id)) leaves.push(lq);
  }
  ensureGeneralFallbackLeaves(parents, leaves);
  return {
    taxonomyVersion: raw.taxonomyVersion ?? 1,
    description: raw.description,
    parents,
    leaves,
  };
}

/** Map seed JSON → ai_categories rows (seed_* prefix on leaf ids). */
export function seedDocumentToCategories(doc: SeedDocument, now = Date.now()): AiCategory[] {
  const parentById = new Map(doc.parents.map((p) => [p.id, p]));
  const rows: AiCategory[] = [];

  for (const p of doc.parents) {
    rows.push({
      id: p.id,
      name: p.name,
      kind: 'parent',
      status: 'approved',
      assignable: false,
      description: p.description,
      source: 'seed',
      childLeafCount: doc.leaves.filter((l) => l.parentId === p.id).length,
      itemCount: 0,
      primaryItemCount: 0,
      secondaryItemCount: 0,
      created_at: now,
      updated_at: now,
    });
  }

  for (const leaf of doc.leaves) {
    const parent = parentById.get(leaf.parentId);
    const leafId = leaf.id.startsWith('seed_') ? leaf.id : `seed_${leaf.id}`;
    rows.push({
      id: leafId,
      name: leaf.name,
      kind: 'leaf',
      status: 'approved',
      assignable: true,
      parentId: leaf.parentId,
      parentName: parent?.name ?? leaf.parentId,
      description: leaf.description,
      source: 'seed',
      canonicalTags: leaf.canonicalTags,
      isGeneralFallback: leaf.isGeneralFallback ?? leafId.endsWith('-general'),
      isRemovalCandidate: leaf.isRemovalCandidate === true,
      centroid: [],
      itemCount: 0,
      primaryItemCount: 0,
      secondaryItemCount: 0,
      created_at: now,
      updated_at: now,
    });
  }

  return rows;
}

/**
 * Validate the taxonomy invariant required by Discover and Classify.
 *
 * This deliberately reports problems without repairing them. A taxonomy is
 * created in full when the store is empty; an already populated but invalid
 * store must be reset explicitly instead of being silently migrated.
 */
export function validateTaxonomyInvariant(
  existing: AiCategory[],
  bundledRows: AiCategory[]
): string[] {
  const existingById = new Map(existing.map((category) => [category.id, category]));
  const errors: string[] = [];

  for (const bundled of bundledRows) {
    const current = existingById.get(bundled.id);
    if (!current) {
      errors.push(`missing bundled ${bundled.kind} "${bundled.id}"`);
      continue;
    }
    if (current.kind !== bundled.kind) {
      errors.push(`bundled category "${bundled.id}" has kind ${current.kind}, expected ${bundled.kind}`);
    }
    if (current.status === 'deprecated') {
      errors.push(`bundled category "${bundled.id}" is deprecated`);
    }
    if (current.assignable !== bundled.assignable) {
      errors.push(`bundled category "${bundled.id}" has invalid assignable state`);
    }
    if ((current.parentId ?? null) !== (bundled.parentId ?? null)) {
      errors.push(
        `bundled category "${bundled.id}" has parent "${current.parentId ?? 'none'}", ` +
          `expected "${bundled.parentId ?? 'none'}"`
      );
    }
  }

  for (const category of existing) {
    if (
      category.kind !== 'leaf' ||
      category.status === 'deprecated' ||
      category.assignable === false
    ) {
      continue;
    }
    const parent = category.parentId ? existingById.get(category.parentId) : undefined;
    if (!parent || parent.kind !== 'parent' || parent.status === 'deprecated') {
      errors.push(`active leaf "${category.id}" has no active parent`);
      continue;
    }
    if (
      category.parentId === LINK_QUALITY_PARENT_ID &&
      !isLinkQualityLeafId(category.id)
    ) {
      errors.push(`topic leaf "${category.id}" cannot be under Link quality`);
    }
  }

  return [...new Set(errors)];
}

/**
 * Older seed imports could persist a bundled leaf as a flat row with no
 * parent. The parent is immutable bundled structure, so restoring this one
 * missing field is safe and preserves assignments, counts, labels, and all
 * user-created/discovered categories.
 *
 * Deliberately do not repair a non-empty/wrong parent, a non-seed row, a
 * missing category, or any other invariant failure. Those cases still require
 * an explicit taxonomy reset.
 */
export function planMissingBundledHierarchyRepair(
  existing: AiCategory[],
  bundledRows: AiCategory[],
  now = Date.now()
): AiCategory[] {
  const existingById = new Map(existing.map((category) => [category.id, category]));
  return bundledRows.flatMap((bundled) => {
    if (bundled.kind !== 'leaf' || !bundled.parentId) return [];
    const current = existingById.get(bundled.id);
    if (
      !current ||
      current.kind !== 'leaf' ||
      current.source !== 'seed' ||
      current.parentId != null
    ) {
      return [];
    }
    return [{
      ...current,
      parentId: bundled.parentId,
      parentName: bundled.parentName ?? bundled.parentId,
      updated_at: now,
    }];
  });
}

/**
 * Create the complete taxonomy once, or validate an existing taxonomy.
 * The only automatic repair is the old seed-owned flat-leaf representation
 * handled above. Custom/discovered structure is never migrated here.
 */
export async function ensureBundledSeedTaxonomy(): Promise<{
  created: number;
  repaired?: number;
}> {
  const { getDB } = await import('../db');
  const { notifyDataChanged } = await import('../dataChangeNotifier');
  const db = await getDB();
  const existing = await db.getAll('ai_categories');
  const doc = getBundledSeedDocument();
  const bundledRows = seedDocumentToCategories(doc);

  if (existing.length) {
    const repairs = planMissingBundledHierarchyRepair(existing, bundledRows);
    let validatedRows = existing;
    if (repairs.length) {
      const tx = db.transaction(['ai_categories'], 'readwrite');
      for (const row of repairs) await tx.objectStore('ai_categories').put(row);
      await tx.done;
      const repairsById = new Map(repairs.map((row) => [row.id, row]));
      validatedRows = existing.map((row) => repairsById.get(row.id) ?? row);
    }
    const errors = validateTaxonomyInvariant(validatedRows, bundledRows);
    if (errors.length) {
      const detail = errors.slice(0, 5).join('; ');
      const remaining = errors.length > 5 ? `; and ${errors.length - 5} more` : '';
      throw new Error(
        `Taxonomy is incomplete or invalid: ${detail}${remaining}. ` +
          'Reset or recreate this test database; Homebase will not migrate it automatically.'
      );
    }
    if (repairs.length) {
      notifyDataChanged('categorization.update');
      const { flushDurableBackupSoon } = await import('../storage/flushDurableBackup');
      flushDurableBackupSoon();
      console.info(`[taxonomy] restored bundled parent hierarchy (${repairs.length} seed leaves)`);
    }
    return { created: 0, repaired: repairs.length };
  }

  const tx = db.transaction(['ai_categories', 'ai_taxonomy_state'], 'readwrite');
  // The single transaction makes the seed visible either completely or not at all.
  // Parents occur before leaves in seedDocumentToCategories.
  for (const row of bundledRows) await tx.objectStore('ai_categories').put(row);
  await tx.objectStore('ai_taxonomy_state').put({
    ...DEFAULT_TAXONOMY_STATE,
    taxonomyVersion: doc.taxonomyVersion,
    updated_at: Date.now(),
  });
  await tx.done;

  notifyDataChanged('categorization.update');
  const { flushDurableBackupSoon } = await import('../storage/flushDurableBackup');
  flushDurableBackupSoon();
  console.info(`[taxonomy] created complete seed taxonomy (${bundledRows.length} categories)`);
  // Category search profiles are derived projections, never part of the seed
  // transaction or pipeline completion path. Warm metadata vectors in the
  // background when credentials are available; member evidence is blended in
  // by the same profile service as classified links accumulate.
  void import('../search/categorySearchProfileService')
    .then(({ warmCategorySearchProfiles }) => warmCategorySearchProfiles())
    .catch((error) => console.warn('[taxonomy] category profile warm deferred:', error));
  return { created: bundledRows.length };
}

export async function ensureTaxonomyReady(): Promise<void> {
  await ensureBundledSeedTaxonomy();
}
