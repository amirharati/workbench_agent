import seedDoc from './data/categories.seed.json';
import {
  isLinkQualityLeafId,
  LINK_QUALITY_PARENT_ID,
  LINK_QUALITY_SEED_LEAVES,
  LINK_QUALITY_SEED_PARENT,
} from './linkQuality';
import { ensureGeneralFallbackLeaves } from './taxonomyCatalog';
import type { AiCategory } from './types';

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
 * Merge link-quality parent + leaves into an existing DB (startup / before classify).
 * No-op when any link-quality leaf is already present.
 */
export async function ensureLinkQualityTaxonomy(): Promise<{ added: number }> {
  const { getDB } = await import('../db');
  const { notifyDataChanged } = await import('../dataChangeNotifier');
  const db = await getDB();
  const categories = await db.getAll('ai_categories');
  const hasLqLeaf = categories.some(
    (c) =>
      c.kind === 'leaf' &&
      (isLinkQualityLeafId(c.id) || c.parentId === LINK_QUALITY_PARENT_ID)
  );
  if (hasLqLeaf) return { added: 0 };

  const allRows = seedDocumentToCategories(getBundledSeedDocument());
  const toAdd = allRows.filter(
    (c) => c.id === LINK_QUALITY_PARENT_ID || c.parentId === LINK_QUALITY_PARENT_ID
  );
  if (!toAdd.length) return { added: 0 };

  const now = Date.now();
  const tx = db.transaction(['ai_categories'], 'readwrite');
  for (const row of toAdd) {
    await tx.objectStore('ai_categories').put({ ...row, created_at: row.created_at ?? now, updated_at: now });
  }
  await tx.done;

  const parent = toAdd.find((c) => c.kind === 'parent');
  if (parent) {
    parent.childLeafCount = toAdd.filter((c) => c.kind === 'leaf').length;
    await db.put('ai_categories', parent);
  }

  notifyDataChanged('categorization.update');
  console.info(`[taxonomy] merged link-quality bucket (+${toAdd.length} categories)`);
  return { added: toAdd.length };
}

/** Seed leaves added after v5 — merged into existing DBs on startup/classify. */
const BUNDLED_LEAF_PATCH_IDS = ['movies-tv-streaming', 'login-auth-required'] as const;

export async function ensureBundledSeedLeafPatches(): Promise<{ added: number }> {
  const { getDB } = await import('../db');
  const { notifyDataChanged } = await import('../dataChangeNotifier');
  const db = await getDB();
  const categories = await db.getAll('ai_categories');
  const existing = new Set(categories.map((c) => c.id));

  const allRows = seedDocumentToCategories(getBundledSeedDocument());
  const want = new Set(
    BUNDLED_LEAF_PATCH_IDS.flatMap((id) => [id, `seed_${id}`])
  );

  const toAdd = allRows.filter((c) => want.has(c.id) && !existing.has(c.id));
  if (!toAdd.length) return { added: 0 };

  const now = Date.now();
  const tx = db.transaction(['ai_categories'], 'readwrite');
  for (const row of toAdd) {
    await tx.objectStore('ai_categories').put({
      ...row,
      created_at: row.created_at ?? now,
      updated_at: now,
    });
  }
  await tx.done;

  for (const pid of new Set(toAdd.map((c) => c.parentId).filter(Boolean) as string[])) {
    const parent = await db.get('ai_categories', pid);
    if (parent?.kind === 'parent') {
      const childLeafCount = (await db.getAll('ai_categories')).filter(
        (c) => c.kind === 'leaf' && c.parentId === pid
      ).length;
      await db.put('ai_categories', { ...parent, childLeafCount, updated_at: now });
    }
  }

  notifyDataChanged('categorization.update');
  console.info(`[taxonomy] merged seed leaf patches (+${toAdd.length})`);
  return { added: toAdd.length };
}

export async function ensureTaxonomyPatches(): Promise<void> {
  await ensureLinkQualityTaxonomy();
  await ensureBundledSeedLeafPatches();
}
