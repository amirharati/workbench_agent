import { commitPendingDbWrites, getDB, getItem, normalizeBookmarkUrl, type Item } from './db';
import { notifyDataChanged } from './dataChangeNotifier';

export type TrashReasonCode =
  | 'manual'
  | 'trash_suggestion'
  | 'context_menu'
  | 'remove_last_collection'
  | 'hub_bulk'
  | 'app_delete';

export interface TrashHistoryEntry {
  /** Dedupe key — same as bookmark normalization. */
  normalizedUrl: string;
  url: string;
  title?: string;
  reason: string;
  reasonCode: TrashReasonCode;
  itemId?: string;
  trashedAt: number;
  /** Set when the item row is permanently deleted (empty trash). */
  purgedAt?: number;
}

export interface TrashRecordInput {
  reason: string;
  reasonCode?: TrashReasonCode;
}

export interface TrashImportMatch {
  url: string;
  title: string;
  reason: string;
  trashedAt: number;
  reasonCode: TrashReasonCode;
}

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url.trim());

export function buildTrashHistoryEntry(
  item: Pick<Item, 'id' | 'url' | 'title'>,
  record: TrashRecordInput,
  now = Date.now()
): TrashHistoryEntry | null {
  const normalizedUrl = bookmarkNormalizedUrl(item);
  if (!normalizedUrl) return null;
  return {
    normalizedUrl,
    url: item.url.trim(),
    title: item.title || item.url.trim(),
    reason: record.reason.trim() || 'Moved to trash',
    reasonCode: record.reasonCode ?? 'manual',
    itemId: item.id,
    trashedAt: now,
    purgedAt: undefined,
  };
}

function bookmarkNormalizedUrl(item: Pick<Item, 'url'>): string | null {
  const url = item.url?.trim();
  if (!url || !isHttpUrl(url)) return null;
  return normalizeBookmarkUrl(url);
}

/** Persist why a bookmark was trashed — survives permanent delete and empty trash. */
export async function recordTrashHistory(
  item: Pick<Item, 'id' | 'url' | 'title'>,
  input: TrashRecordInput,
  options?: { notify?: boolean }
): Promise<void> {
  const store = await getDB();
  if (recordTrashHistoryEntries(store, [item], { defaultRecord: input }).written > 0) {
    await commitPendingDbWrites();
    if (options?.notify !== false) notifyDataChanged('item.update');
  }
}

function resolveTrashRecord(
  input: TrashRecordInput | undefined,
  fallback: TrashRecordInput
): TrashRecordInput {
  return input ?? fallback;
}

/** In-memory store writes only — caller commits and notifies once. */
export function recordTrashHistoryEntries(
  store: Awaited<ReturnType<typeof getDB>>,
  items: Array<Pick<Item, 'id' | 'url' | 'title'>>,
  options: {
    defaultRecord: TrashRecordInput;
    recordsById?: Record<string, TrashRecordInput>;
  }
): { written: number } {
  const now = Date.now();
  let written = 0;
  for (const item of items) {
    const normalizedUrl = bookmarkNormalizedUrl(item);
    if (!normalizedUrl) continue;
    const record = resolveTrashRecord(options.recordsById?.[item.id], options.defaultRecord);
    const entry = buildTrashHistoryEntry(item, record, now);
    if (!entry) continue;
    store.putTrashEntry(entry);
    written += 1;
  }
  return { written };
}

/** Batch trash history — one commit/notify when used from moveItemsToTrash. */
export async function recordTrashHistoryBatch(
  items: Array<Pick<Item, 'id' | 'url' | 'title'>>,
  options: {
    defaultRecord: TrashRecordInput;
    recordsById?: Record<string, TrashRecordInput>;
    notify?: boolean;
  }
): Promise<number> {
  if (!items.length) return 0;
  const store = await getDB();
  const { written } = recordTrashHistoryEntries(store, items, options);
  if (written > 0) {
    await commitPendingDbWrites();
    if (options.notify !== false) notifyDataChanged('item.update');
  }
  return written;
}

/** Drop discard record when user restores from trash. */
export async function clearTrashHistoryForItem(
  item: Pick<Item, 'url'>
): Promise<void> {
  const normalizedUrl = bookmarkNormalizedUrl(item);
  if (!normalizedUrl) return;
  const store = await getDB();
  store.deleteTrashEntry(normalizedUrl);
  notifyDataChanged('item.update');
}

/** Keep discard record after permanent delete — mark purge time for audit. */
export async function markTrashHistoryPurged(
  item: Pick<Item, 'id' | 'url' | 'title'>,
  input?: Partial<TrashRecordInput>
): Promise<void> {
  const normalizedUrl = bookmarkNormalizedUrl(item);
  if (!normalizedUrl) return;

  const store = await getDB();
  const now = Date.now();
  const existing = store.getTrashEntry(normalizedUrl);
  if (existing) {
    store.putTrashEntry({
      ...existing,
      url: item.url.trim(),
      title: item.title || item.url.trim(),
      itemId: item.id,
      purgedAt: now,
    });
  } else {
    store.putTrashEntry({
      normalizedUrl,
      url: item.url.trim(),
      title: item.title || item.url.trim(),
      reason: input?.reason?.trim() || 'Permanently deleted',
      reasonCode: input?.reasonCode ?? 'manual',
      itemId: item.id,
      trashedAt: now,
      purgedAt: now,
    });
  }
  notifyDataChanged('item.delete');
}

export async function getAllTrashHistory(): Promise<TrashHistoryEntry[]> {
  const store = await getDB();
  return store.getAllTrashHistory();
}

export async function getTrashHistoryMap(): Promise<Map<string, TrashHistoryEntry>> {
  const rows = await getAllTrashHistory();
  return new Map(rows.map((row) => [row.normalizedUrl, row]));
}

export function matchRowsAgainstTrashHistory<T extends { url: string; title?: string }>(
  rows: T[],
  history: Map<string, TrashHistoryEntry>
): TrashImportMatch[] {
  const seen = new Set<string>();
  const matches: TrashImportMatch[] = [];
  for (const row of rows) {
    if (!isHttpUrl(row.url)) continue;
    const key = normalizeBookmarkUrl(row.url);
    if (seen.has(key)) continue;
    const entry = history.get(key);
    if (!entry) continue;
    seen.add(key);
    matches.push({
      url: row.url,
      title: row.title || row.url,
      reason: entry.reason,
      trashedAt: entry.trashedAt,
      reasonCode: entry.reasonCode,
    });
  }
  return matches;
}

export async function recordTrashHistoryById(
  id: string,
  input: TrashRecordInput
): Promise<void> {
  const item = await getItem(id);
  if (!item) return;
  await recordTrashHistory(item, input);
}
