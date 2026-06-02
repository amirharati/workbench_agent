/**
 * Post-batch taxonomy merge: consolidate redundant discovered parents/leaves
 * into seed parents, rewrites all category links to canonical ids.
 *
 * Run once at the end of a batch pipeline run to undo fragmentation created
 * when discover invented new parent domains that overlap with seed parents.
 */
import { getDB } from '../db';
import { aiLinkId } from './service';
import { isGeneralLeafId } from './taxonomyCatalog';
import type { AiCategory, AiItemCategoryLink } from './types';

// ---------------------------------------------------------------------------
// Keyword map: discovered parent ids/names that should be absorbed into a
// seed parent. Keys are seed parent ids; values are substrings to look for
// in discovered parent names (case-insensitive).
// ---------------------------------------------------------------------------
const SEED_PARENT_ABSORBS: Record<string, string[]> = {
  'machine-learning': [
    'deep learning', 'neural network', 'data science', 'nlp',
    'natural language', 'tensorflow', 'pytorch', 'computer vision',
    'speech recognition', 'reinforcement learning', 'data analytics',
    'data structures', 'data analysis', 'machine learning', 'ml ',
    'statistical', 'statistics', 'mathematics', 'math resource',
    'big data', 'pandas', 'numpy', 'academic integrity', 'stem education',
    'mathematics resource',
  ],
  'infra-hosting': [
    'cloud computing', 'cloud training', 'cloud pricing', 'gpu cloud',
    'server hosting', 'cloud resources', 'operating system',
    'linux ', 'linux backup', 'backup restoration',
  ],
  'software-dev': [
    'software engineering', 'open source', 'developer tools', 'ide ',
    'programming', 'algorithm', 'data structure',
  ],
  'ai-productivity': [
    'ai tools', 'llm tools', 'ai assistant',
  ],
  'personal-finance': [
    'tax ', 'tax resource', 'personal finance', 'investing',
  ],
  'health-lifestyle': [
    'mental health', 'health resource', 'wellness',
  ],
};

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Returns the seed parentId that should absorb `discoveredParent`, or null. */
function findAbsorbingSeedParent(
  discoveredParent: AiCategory,
  seedParentIds: Set<string>
): string | null {
  const nameKey = normalizeKey(discoveredParent.name);
  for (const [seedId, keywords] of Object.entries(SEED_PARENT_ABSORBS)) {
    if (!seedParentIds.has(seedId)) continue;
    for (const kw of keywords) {
      if (nameKey.includes(kw)) return seedId;
    }
  }
  return null;
}

export interface TaxonomyMergeResult {
  mergedParents: number;
  mergedLeaves: number;
  linksRewritten: number;
}

/**
 * Run the full taxonomy merge:
 * 1. Identify discovered parents that overlap with seed parents.
 * 2. Move their leaves under the seed parent (update parentId/parentName).
 * 3. Deduplicate leaves with the same normalised name within the same parent.
 * 4. Rewrite ai_item_category_links for merged/deleted leaves to canonical ids.
 * 5. Delete absorbed discovered parents and duplicate leaves.
 * 6. Update item_count / primary_item_count on affected categories.
 */
export async function runTaxonomyMerge(
  opts: { signal?: AbortSignal; dryRun?: boolean } = {}
): Promise<TaxonomyMergeResult> {
  const db = await getDB();
  const result: TaxonomyMergeResult = { mergedParents: 0, mergedLeaves: 0, linksRewritten: 0 };

  if (!db.objectStoreNames.contains('ai_categories')) return result;

  const categories: AiCategory[] = await db.getAll('ai_categories');
  const seedParents = new Set(
    categories
      .filter((c) => c.kind === 'parent' && c.source === 'seed')
      .map((c) => c.id)
  );

  // Build map: old category id → canonical id (for link rewriting)
  const canonicalFor = new Map<string, string>();
  // Categories to delete after link rewrites
  const toDelete = new Set<string>();
  // Categories to update (new parentId / parentName)
  const toUpdate: AiCategory[] = [];

  // -----------------------------------------------------------------------
  // Step 1: Absorb discovered parents into seed parents
  // -----------------------------------------------------------------------
  const discoveredParents = categories.filter(
    (c) => c.kind === 'parent' && c.source === 'discovered'
  );

  for (const dp of discoveredParents) {
    if (opts.signal?.aborted) break;
    const absorbTo = findAbsorbingSeedParent(dp, seedParents);
    if (!absorbTo) continue;

    const seedParent = categories.find((c) => c.id === absorbTo)!;
    const seedParentName = seedParent?.name ?? absorbTo;

    // Find all leaves under this discovered parent
    const dpLeaves = categories.filter(
      (c) => c.kind === 'leaf' && c.parentId === dp.id
    );

    // Find the seed parent's general-fallback leaf as the ultimate fallback target
    const seedGeneralLeaf = categories.find(
      (c) => c.kind === 'leaf' && c.parentId === absorbTo && isGeneralLeafId(c.id)
    );

    for (const leaf of dpLeaves) {
      if (isGeneralLeafId(leaf.id)) {
        // Map the discovered general leaf → seed's general leaf (or just delete if none)
        if (seedGeneralLeaf) {
          canonicalFor.set(leaf.id, seedGeneralLeaf.id);
        }
        toDelete.add(leaf.id);
        continue;
      }

      // Try to find an existing leaf under the seed parent with the same normalised name
      const nameKey = normalizeKey(leaf.name);
      const existingSeedLeaf = categories.find(
        (c) =>
          c.kind === 'leaf' &&
          c.parentId === absorbTo &&
          !isGeneralLeafId(c.id) &&
          normalizeKey(c.name) === nameKey
      );

      if (existingSeedLeaf) {
        // Duplicate — merge into existing
        canonicalFor.set(leaf.id, existingSeedLeaf.id);
        toDelete.add(leaf.id);
        result.mergedLeaves++;
      } else {
        // Move the leaf to the seed parent
        toUpdate.push({
          ...leaf,
          parentId: absorbTo,
          parentName: seedParentName,
          updated_at: Date.now(),
        });
      }
    }

    // Mark the discovered parent for deletion
    toDelete.add(dp.id);
    result.mergedParents++;
  }

  // -----------------------------------------------------------------------
  // Step 2: Deduplicate leaves within the same parent (exact normalised name)
  // -----------------------------------------------------------------------
  const allLeaves = categories.filter(
    (c) =>
      c.kind === 'leaf' &&
      !toDelete.has(c.id) &&
      !isGeneralLeafId(c.id)
  );
  const byParentAndName = new Map<string, AiCategory[]>();
  for (const leaf of allLeaves) {
    const key = `${leaf.parentId ?? '_'}::${normalizeKey(leaf.name)}`;
    if (!byParentAndName.has(key)) byParentAndName.set(key, []);
    byParentAndName.get(key)!.push(leaf);
  }
  for (const group of byParentAndName.values()) {
    if (group.length <= 1) continue;
    // Keep the one with the highest primary_item_count (or first if tied)
    group.sort((a, b) => (b.primaryItemCount ?? 0) - (a.primaryItemCount ?? 0));
    const canonical = group[0]!;
    for (const dup of group.slice(1)) {
      canonicalFor.set(dup.id, canonical.id);
      toDelete.add(dup.id);
      result.mergedLeaves++;
    }
  }

  if (opts.dryRun) {
    console.info('[taxonomyMerge] dry-run — merged parents:', result.mergedParents, 'leaves:', result.mergedLeaves);
    return result;
  }

  if (!canonicalFor.size && !toUpdate.length && !toDelete.size) return result;

  // -----------------------------------------------------------------------
  // Step 3: Rewrite ai_item_category_links
  // -----------------------------------------------------------------------
  if (db.objectStoreNames.contains('ai_item_category_links')) {
    const links = await db.getAll('ai_item_category_links');
    const tx = db.transaction(['ai_item_category_links'], 'readwrite');
    const linkStore = tx.objectStore('ai_item_category_links');
    for (const link of links) {
      const newCategoryId = canonicalFor.get(link.categoryId);
      if (newCategoryId) {
        const rewritten: AiItemCategoryLink = {
          ...link,
          id: aiLinkId(link.itemId, newCategoryId),
          categoryId: newCategoryId,
          updated_at: Date.now(),
        };
        if (link.id !== rewritten.id) {
          await linkStore.delete(link.id);
        }
        await linkStore.put(rewritten);
        result.linksRewritten++;
        continue;
      }
      // Drop links that still point at a category we are about to delete (CASCADE
      // would remove them silently and leave classified signals orphaned).
      if (toDelete.has(link.categoryId)) {
        await linkStore.delete(link.id);
        result.linksRewritten++;
      }
    }
    await tx.done;
  }

  // -----------------------------------------------------------------------
  // Step 4: Apply leaf moves and deletions via db.transaction
  // -----------------------------------------------------------------------
  const catTx = db.transaction(['ai_categories'], 'readwrite');
  const catStore = catTx.objectStore('ai_categories');

  for (const updatedLeaf of toUpdate) {
    await catStore.put(updatedLeaf);
  }
  for (const id of toDelete) {
    await catStore.delete(id);
  }
  await catTx.done;

  // -----------------------------------------------------------------------
  // Step 5: Recalculate item_count / primary_item_count on affected categories
  // -----------------------------------------------------------------------
  if (db.objectStoreNames.contains('ai_item_category_links')) {
    const affectedParents = new Set<string>();
    for (const leaf of toUpdate) {
      if (leaf.parentId) affectedParents.add(leaf.parentId);
    }
    for (const [, canonical] of canonicalFor) {
      const cat = categories.find((c) => c.id === canonical);
      if (cat?.parentId) affectedParents.add(cat.parentId);
    }

    if (affectedParents.size > 0) {
      const links = await db.getAll('ai_item_category_links');
      const countByCategory = new Map<string, { total: number; primary: number }>();
      for (const l of links) {
        const prev = countByCategory.get(l.categoryId) ?? { total: 0, primary: 0 };
        prev.total++;
        if (l.isPrimary) prev.primary++;
        countByCategory.set(l.categoryId, prev);
      }
      const allCats: AiCategory[] = await db.getAll('ai_categories');
      const recalcTx = db.transaction(['ai_categories'], 'readwrite');
      const recalcStore = recalcTx.objectStore('ai_categories');
      for (const cat of allCats) {
        if (!affectedParents.has(cat.parentId ?? '') && !affectedParents.has(cat.id)) continue;
        const counts = countByCategory.get(cat.id) ?? { total: 0, primary: 0 };
        await recalcStore.put({
          ...cat,
          itemCount: counts.total,
          primaryItemCount: counts.primary,
          updated_at: Date.now(),
        });
      }
      await recalcTx.done;
    }
  }

  console.info(
    `[taxonomyMerge] merged ${result.mergedParents} parents, ${result.mergedLeaves} leaves, rewrote ${result.linksRewritten} links`
  );
  return result;
}
