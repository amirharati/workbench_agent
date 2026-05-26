import seedDoc from './data/categories.seed.json';
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
  }>;
}

export function getBundledSeedDocument(): SeedDocument {
  const raw = seedDoc as SeedDocument;
  const parents = [...(raw.parents ?? [])];
  const leaves = [...(raw.leaves ?? [])].map((l) => ({
    ...l,
    description: l.description ?? '',
    canonicalTags: l.canonicalTags ?? [],
  }));
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
