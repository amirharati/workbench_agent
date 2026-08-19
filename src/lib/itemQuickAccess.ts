import type { DbMutation } from './storage/dbMutations';
import {
  applyBatchMutations,
  commitPendingDbWrites,
  getAllItems,
  getBookmarkOpenUrl,
  getDB,
  getItem,
  updateItem,
  type Item,
} from './db';
import {
  buildTrashHistoryEntry,
  clearTrashHistoryForItem,
  markTrashHistoryPurged,
  recordTrashHistory,
  type TrashReasonCode,
  type TrashRecordInput,
} from './trashHistory';
import { notifyDataChanged } from './dataChangeNotifier';

export { getBookmarkOpenUrl };
export type { TrashReasonCode, TrashRecordInput };

export function isActiveItem(item: Item): boolean {
  return item.deletedAt == null;
}

/** URL-backed rows — Bookmarks view (annotation text on items stays here, not Notes tab). */
export function countBookmarkItems(items: Item[]): number {
  return items.filter((item) => isActiveItem(item) && !!item.url?.trim()).length;
}

/** URL-less note items (Notes tab) plus optional standalone `notes` table rows. */
export function countNoteItems(items: Item[], standaloneNotesCount = 0): number {
  const noteItems = items.filter(
    (item) => isActiveItem(item) && !item.url?.trim()
  ).length;
  return noteItems + standaloneNotesCount;
}

export function countRestoreSummaryStats(
  items: Item[],
  standaloneNotesCount = 0
): { bookmarks: number; notes: number; items: number } {
  const active = items.filter(isActiveItem);
  const bookmarks = active.filter((item) => !!item.url?.trim()).length;
  const notes = active.filter((item) => !item.url?.trim()).length + standaloneNotesCount;
  return { bookmarks, notes, items: active.length };
}

/** User-facing restore summary, e.g. "412 bookmarks/notes" or "408 bookmarks/notes (4 notes)". */
export function formatBookmarksNotesSummary(stats: {
  bookmarks: number;
  notes: number;
}): string {
  const total = stats.bookmarks + stats.notes;
  if (stats.notes === 0) return `${total} bookmarks/notes`;
  return `${total} bookmarks/notes (${stats.notes} notes)`;
}

/** Full restore line: bookmarks/notes, projects, collections, workspaces. */
export function formatRestoreSummary(stats: {
  bookmarks: number;
  notes: number;
  projects: number;
  collections: number;
  workspaces: number;
}): string {
  return [
    formatBookmarksNotesSummary(stats),
    `${stats.projects} projects`,
    `${stats.collections} collections`,
    `${stats.workspaces} workspaces`,
  ].join(', ');
}

/** Stable normal-list order. Pin/favorite markers must never move a row under the pointer. */
export function sortItemsByRecency(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) => (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at)
  );
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
  await updateItem(id, { pinnedAt: Date.now() }, { preserveUpdatedAt: true });
}

export async function unpinItem(id: string): Promise<void> {
  await updateItem(id, {}, { preserveUpdatedAt: true, clearItemMarkers: ['pinnedAt'] });
}

export async function favoriteItem(id: string): Promise<void> {
  await updateItem(id, { favoriteAt: Date.now() }, { preserveUpdatedAt: true });
}

export async function unfavoriteItem(id: string): Promise<void> {
  await updateItem(id, {}, { preserveUpdatedAt: true, clearItemMarkers: ['favoriteAt'] });
}

const defaultTrashRecord = (): TrashRecordInput => ({
  reason: 'Moved to trash',
  reasonCode: 'manual',
});

export type MoveToTrashOptions = Partial<TrashRecordInput> & {
  reasonsById?: Record<string, TrashRecordInput>;
  /** When caller already has rows in memory (hub bulk trash), skip scanning the full library. */
  knownItems?: Item[];
};

export async function moveItemToTrash(
  id: string,
  options?: TrashRecordInput
): Promise<void> {
  const item = await getItem(id);
  const now = Date.now();
  await updateItem(id, { deletedAt: now });
  if (item) {
    await recordTrashHistory(item, options ?? defaultTrashRecord());
  }
}

export async function moveItemsToTrash(
  ids: string[],
  options?: MoveToTrashOptions
): Promise<number> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return 0;

  const idSet = new Set(unique);
  const store = await getDB();
  const now = Date.now();
  const defaultRecord =
    options?.reason || options?.reasonCode
      ? {
          reason: options.reason ?? 'Moved to trash',
          reasonCode: options.reasonCode,
        }
      : defaultTrashRecord();

  const itemsById = new Map<string, Item>();
  if (options?.knownItems?.length) {
    for (const item of options.knownItems) {
      if (idSet.has(item.id)) itemsById.set(item.id, item);
    }
  }
  if (itemsById.size < unique.length) {
    for (const item of store.getAllItems()) {
      if (idSet.has(item.id) && !itemsById.has(item.id)) {
        itemsById.set(item.id, item);
      }
      if (itemsById.size >= unique.length) break;
    }
  }

  const ops: DbMutation[] = [];
  let trashedCount = 0;
  for (const id of unique) {
    const item = itemsById.get(id);
    if (!item || item.deletedAt != null) continue;
    const record =
      options?.reasonsById?.[id] ??
      (options?.reason
        ? { reason: options.reason, reasonCode: options.reasonCode }
        : defaultRecord);
    trashedCount += 1;
    ops.push({
      kind: 'put',
      storeName: 'items',
      value: { ...item, deletedAt: now, updated_at: now },
    });
    const entry = buildTrashHistoryEntry(item, record, now);
    if (entry) {
      ops.push({ kind: 'put', storeName: 'trash_history', value: entry });
    }
  }

  await applyBatchMutations(ops);
  if (trashedCount > 0) {
    notifyDataChanged(trashedCount >= 10 ? 'item.trash.bulk' : 'item.update');
  }
  return trashedCount;
}

export async function restoreItemFromTrash(id: string): Promise<void> {
  const item = await getItem(id);
  await updateItem(id, {}, { clearItemMarkers: ['deletedAt'] });
  if (item) {
    await clearTrashHistoryForItem(item);
  }
}

export async function permanentlyDeleteItem(id: string): Promise<void> {
  const item = await getItem(id);
  if (item) {
    await markTrashHistoryPurged(item);
    await commitPendingDbWrites();
  }
  const { buildDeletedItemEntry } = await import('./deletedItems');
  const { nowMs } = await import('./time/clock');
  const ops: DbMutation[] = [
    {
      kind: 'put',
      storeName: 'deleted_items',
      value: buildDeletedItemEntry(id, item ? 'permanent_delete' : 'permanent_delete_missing', nowMs()),
    },
  ];
  if (item) {
    ops.push({ kind: 'delete', storeName: 'items', key: id });
  }
  try {
    const { deleteEnrichmentForItem } = await import('./enrichment/fetchService');
    await deleteEnrichmentForItem(id);
  } catch (e) {
    console.warn('Enrichment cleanup on permanent delete failed:', e);
  }
  await applyBatchMutations(ops);
  notifyDataChanged('item.delete');
}

export async function emptyTrash(): Promise<number> {
  const trashed = await getTrashedItems();
  if (!trashed.length) return 0;

  const { buildDeletedItemEntry } = await import('./deletedItems');
  const { nowMs } = await import('./time/clock');
  const purgedAt = nowMs();
  const ops: DbMutation[] = [];

  for (const item of trashed) {
    await markTrashHistoryPurged(item);
    ops.push({
      kind: 'put',
      storeName: 'deleted_items',
      value: buildDeletedItemEntry(item.id, 'empty_trash', purgedAt),
    });
    ops.push({ kind: 'delete', storeName: 'items', key: item.id });
    try {
      const { deleteEnrichmentForItem } = await import('./enrichment/fetchService');
      await deleteEnrichmentForItem(item.id);
    } catch (e) {
      console.warn('Enrichment cleanup on empty trash failed:', e);
    }
  }

  await commitPendingDbWrites();
  await applyBatchMutations(ops);
  notifyDataChanged('item.delete');
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
