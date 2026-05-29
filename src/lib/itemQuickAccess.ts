import {
  deleteItem,
  getAllItems,
  getBookmarkOpenUrl,
  updateItem,
  type Item,
} from './db';

export { getBookmarkOpenUrl };

export function isActiveItem(item: Item): boolean {
  return item.deletedAt == null;
}

/**
 * Collection/browse list order: pinned first (newest pin wins), then recency.
 * Apply after project/collection/search filters so scope stays upstream.
 */
export function sortItemsWithPinsFirst(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const aPin = a.pinnedAt ?? 0;
    const bPin = b.pinnedAt ?? 0;
    if (aPin !== bPin) {
      if (aPin && bPin) return bPin - aPin;
      return aPin ? -1 : 1;
    }
    return (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at);
  });
}

export async function getActiveItems(): Promise<Item[]> {
  const all = await getAllItems();
  return all.filter(isActiveItem);
}

export async function getPinnedItems(): Promise<Item[]> {
  const active = await getActiveItems();
  return active
    .filter((i) => i.pinnedAt != null)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
}

export async function getFavoriteItems(): Promise<Item[]> {
  const active = await getActiveItems();
  return active
    .filter((i) => i.favoriteAt != null)
    .sort((a, b) => (b.favoriteAt ?? 0) - (a.favoriteAt ?? 0));
}

export async function getTrashedItems(): Promise<Item[]> {
  const all = await getAllItems();
  return all
    .filter((i) => i.deletedAt != null)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export async function pinItem(id: string): Promise<void> {
  await updateItem(id, { pinnedAt: Date.now() });
}

export async function unpinItem(id: string): Promise<void> {
  await updateItem(id, { pinnedAt: undefined });
}

export async function favoriteItem(id: string): Promise<void> {
  await updateItem(id, { favoriteAt: Date.now() });
}

export async function unfavoriteItem(id: string): Promise<void> {
  await updateItem(id, { favoriteAt: undefined });
}

export async function moveItemToTrash(id: string): Promise<void> {
  await updateItem(id, { deletedAt: Date.now() });
}

export async function restoreItemFromTrash(id: string): Promise<void> {
  await updateItem(id, { deletedAt: undefined });
}

export async function permanentlyDeleteItem(id: string): Promise<void> {
  await deleteItem(id);
}

export async function emptyTrash(): Promise<number> {
  const trashed = await getTrashedItems();
  for (const item of trashed) {
    await deleteItem(item.id);
  }
  return trashed.length;
}

/** Favorites first, then pinned-only (deduped), newest first within each group. */
export function getQuickAccessItemsFromList(items: Item[], limit?: number): Item[] {
  const favorites = items
    .filter((i) => i.favoriteAt != null)
    .sort((a, b) => (b.favoriteAt ?? 0) - (a.favoriteAt ?? 0));
  const pinnedOnly = items
    .filter((i) => i.pinnedAt != null && i.favoriteAt == null)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));

  const seen = new Set<string>();
  const out: Item[] = [];
  for (const item of [...favorites, ...pinnedOnly]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (limit != null && out.length >= limit) break;
  }
  return out;
}

/** Home card preview (up to 8). */
export function getHomeQuickAccessItems(items: Item[], limit = 8): Item[] {
  return getQuickAccessItemsFromList(items, limit);
}

export async function getQuickAccessItems(): Promise<Item[]> {
  return getQuickAccessItemsFromList(await getActiveItems());
}
