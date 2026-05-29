import { getDB, getItem, normalizeBookmarkUrl, type Item } from './db';
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

function bookmarkNormalizedUrl(item: Pick<Item, 'url'>): string | null {
  const url = item.url?.trim();
  if (!url || !isHttpUrl(url)) return null;
  return normalizeBookmarkUrl(url);
}

/** Persist why a bookmark was trashed — survives permanent delete and empty trash. */
export async function recordTrashHistory(
  item: Pick<Item, 'id' | 'url' | 'title'>,
  input: TrashRecordInput
): Promise<void> {
  const normalizedUrl = bookmarkNormalizedUrl(item);
  if (!normalizedUrl) return;

  const db = await getDB();
  const now = Date.now();
  await db.put('trash_history', {
    normalizedUrl,
    url: item.url.trim(),
    title: item.title || item.url.trim(),
    reason: input.reason.trim() || 'Moved to trash',
    reasonCode: input.reasonCode ?? 'manual',
    itemId: item.id,
    trashedAt: now,
    purgedAt: undefined,
  });
  notifyDataChanged('item.update');
}

/** Drop discard record when user restores from trash. */
export async function clearTrashHistoryForItem(
  item: Pick<Item, 'url'>
): Promise<void> {
  const normalizedUrl = bookmarkNormalizedUrl(item);
  if (!normalizedUrl) return;
  const db = await getDB();
  await db.delete('trash_history', normalizedUrl);
  notifyDataChanged('item.update');
}

/** Keep discard record after permanent delete — mark purge time for audit. */
export async function markTrashHistoryPurged(
  item: Pick<Item, 'id' | 'url' | 'title'>,
  input?: Partial<TrashRecordInput>
): Promise<void> {
  const normalizedUrl = bookmarkNormalizedUrl(item);
  if (!normalizedUrl) return;

  const db = await getDB();
  const now = Date.now();
  const existing = await db.get('trash_history', normalizedUrl);
  if (existing) {
    await db.put('trash_history', {
      ...existing,
      url: item.url.trim(),
      title: item.title || item.url.trim(),
      itemId: item.id,
      purgedAt: now,
    });
  } else {
    await db.put('trash_history', {
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
  const db = await getDB();
  if (!db.objectStoreNames.contains('trash_history')) return [];
  const rows = await db.getAll('trash_history');
  return rows.sort((a, b) => b.trashedAt - a.trashedAt);
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
