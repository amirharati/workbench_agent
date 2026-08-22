import { dbRpc } from '../storage/dbClient';
import type { AiCategory, AiItemCategoryLink } from './types';

export interface CategoryBrowseSnapshot {
  categories: AiCategory[];
  links: AiItemCategoryLink[];
}

export interface CategoryBrowseLeaf {
  category: AiCategory;
  itemIds: string[];
}

export interface CategoryBrowseGroup {
  id: string;
  name: string;
  leaves: CategoryBrowseLeaf[];
}

export async function loadCategoryBrowseSnapshot(
  itemIds: string[]
): Promise<CategoryBrowseSnapshot> {
  return dbRpc('getCategoryBrowseSnapshot', [itemIds], { priority: 'low' });
}

export function buildCategoryBrowseGroups(
  snapshot: CategoryBrowseSnapshot
): CategoryBrowseGroup[] {
  const categoryById = new Map(snapshot.categories.map((category) => [category.id, category]));
  const itemIdsByCategory = new Map<string, Set<string>>();
  for (const link of snapshot.links) {
    if (link.status !== 'suggested' && link.status !== 'accepted') continue;
    const itemIds = itemIdsByCategory.get(link.categoryId) ?? new Set<string>();
    itemIds.add(link.itemId);
    itemIdsByCategory.set(link.categoryId, itemIds);
  }

  const groups = new Map<string, CategoryBrowseGroup>();
  for (const category of snapshot.categories) {
    if (category.kind !== 'leaf') continue;
    const parent = category.parentId ? categoryById.get(category.parentId) : undefined;
    const groupId = parent?.id ?? 'other';
    const group = groups.get(groupId) ?? {
      id: groupId,
      name: parent?.name ?? category.parentName ?? 'Other topics',
      leaves: [],
    };
    group.leaves.push({
      category,
      itemIds: [...(itemIdsByCategory.get(category.id) ?? [])],
    });
    groups.set(groupId, group);
  }

  for (const group of groups.values()) {
    group.leaves.sort(
      (left, right) =>
        right.itemIds.length - left.itemIds.length ||
        left.category.name.localeCompare(right.category.name)
    );
  }

  return [...groups.values()].sort((left, right) => {
    const leftCount = new Set(left.leaves.flatMap((leaf) => leaf.itemIds)).size;
    const rightCount = new Set(right.leaves.flatMap((leaf) => leaf.itemIds)).size;
    return rightCount - leftCount || left.name.localeCompare(right.name);
  });
}

