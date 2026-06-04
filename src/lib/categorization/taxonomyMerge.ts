/**
 * Post-batch taxonomy merge with DB link rewrite.
 */
import { getDB } from '../db';
import { aiLinkId } from './service';
import {
  applyTaxonomyMergeInMemory,
  planTaxonomyMerge,
  type TaxonomyMergeAuditEntry,
  type TaxonomyMergePlan,
} from './taxonomyMergeCore';
import type { AiCategory, AiItemCategoryLink } from './types';

export type { TaxonomyMergeAuditEntry, TaxonomyMergePlan };
export { applyTaxonomyMergeInMemory, planTaxonomyMerge };

export interface TaxonomyMergeResult {
  mergedParents: number;
  mergedLeaves: number;
  linksRewritten: number;
}

export async function runTaxonomyMerge(
  opts: { signal?: AbortSignal; dryRun?: boolean } = {}
): Promise<TaxonomyMergeResult> {
  const db = await getDB();
  const result: TaxonomyMergeResult = { mergedParents: 0, mergedLeaves: 0, linksRewritten: 0 };

  if (!db.objectStoreNames.contains('ai_categories')) return result;

  const categories: AiCategory[] = await db.getAll('ai_categories');
  const plan = planTaxonomyMerge(categories);
  const { canonicalFor, categories: mergedCategories } = plan;
  result.mergedParents = plan.mergedParents;
  result.mergedLeaves = plan.mergedLeaves;

  const mergedIds = new Set(mergedCategories.map((c) => c.id));
  const toDelete = new Set(categories.filter((c) => !mergedIds.has(c.id)).map((c) => c.id));
  const toUpdate = mergedCategories.filter((c) => {
    const orig = categories.find((o) => o.id === c.id);
    if (!orig) return true;
    return orig.parentId !== c.parentId || orig.parentName !== c.parentName;
  });

  if (opts.dryRun) {
    console.info('[taxonomyMerge] dry-run — merged parents:', result.mergedParents, 'leaves:', result.mergedLeaves);
    return result;
  }

  if (!canonicalFor.size && !toUpdate.length && !toDelete.size) return result;

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
      if (toDelete.has(link.categoryId)) {
        await linkStore.delete(link.id);
        result.linksRewritten++;
      }
    }
    await tx.done;
  }

  const catTx = db.transaction(['ai_categories'], 'readwrite');
  const catStore = catTx.objectStore('ai_categories');

  for (const updated of toUpdate) {
    await catStore.put(updated);
  }
  for (const id of toDelete) {
    await catStore.delete(id);
  }
  await catTx.done;

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
