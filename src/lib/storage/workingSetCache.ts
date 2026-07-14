/**
 * Working-set read buffer — fast lookups for open tabs + recent saves.
 *
 * Admission: open browser tabs, recently saved items, explicitly pinned URLs.
 * Eviction: durable + not an open tab + over size cap (LRU among evictable).
 * Writes always write-through here when side panel / save pins an item.
 */
import type { Item } from '../db';

export type WorkingSetEntry = {
  normalizedUrl: string;
  itemIds: string[];
  items: Item[];
  /** Keep until DB ack if still pending. */
  durable: boolean;
  lastAccessAt: number;
  pinnedUntil?: number;
};

const MAX_ENTRIES = 200;
const PIN_RECENT_SAVE_MS = 15 * 60_000;

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'zanpid',
  '_ga', '_gl', 'yclid', 'dclid',
];

function normalizeUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return raw;
  }
}

const byUrl = new Map<string, WorkingSetEntry>();
/** Normalized URLs currently open in the browser. */
const openTabUrls = new Set<string>();

function now(): number {
  return Date.now();
}

function touch(entry: WorkingSetEntry): void {
  entry.lastAccessAt = now();
}

export function syncOpenTabUrls(urls: string[]): void {
  openTabUrls.clear();
  for (const url of urls) {
    const n = normalizeUrl(url);
    if (n) openTabUrls.add(n);
  }
  evictWorkingSetIfNeeded();
}

export function markOpenTabUrl(url: string): void {
  const n = normalizeUrl(url);
  if (!n) return;
  openTabUrls.add(n);
}

export function pinItemsForUrl(url: string, items: Item[], opts?: { durable?: boolean }): void {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return;
  const active = items.filter((i) => i.deletedAt == null);
  const prev = byUrl.get(normalizedUrl);
  const durable = opts?.durable ?? prev?.durable ?? true;
  byUrl.set(normalizedUrl, {
    normalizedUrl,
    itemIds: active.map((i) => i.id),
    items: active,
    durable,
    lastAccessAt: now(),
    pinnedUntil: durable ? prev?.pinnedUntil : now() + PIN_RECENT_SAVE_MS,
  });
  evictWorkingSetIfNeeded();
}

/** After a save — keep in working set even if tab closes until durable (or pin window). */
export function pinSavedItem(url: string, item: Item, opts?: { durable?: boolean }): void {
  const durable = opts?.durable === true;
  pinItemsForUrl(url, [item], { durable });
  const entry = byUrl.get(normalizeUrl(url));
  if (entry && !durable) {
    entry.pinnedUntil = now() + PIN_RECENT_SAVE_MS;
    entry.durable = false;
  }
}

export function markUrlDurable(url: string): void {
  const entry = byUrl.get(normalizeUrl(url));
  if (!entry) return;
  entry.durable = true;
  touch(entry);
  evictWorkingSetIfNeeded();
}

export function lookupWorkingSetByUrl(url: string): Item[] | null {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return null;
  const entry = byUrl.get(normalizedUrl);
  if (!entry) return null;
  touch(entry);
  return entry.items.filter((i) => i.deletedAt == null);
}

export function getWorkingSetStats(): { size: number; openTabs: number } {
  return { size: byUrl.size, openTabs: openTabUrls.size };
}

export function evictWorkingSetIfNeeded(): void {
  if (byUrl.size <= MAX_ENTRIES) return;
  const t = now();
  const candidates = [...byUrl.values()]
    .filter((e) => {
      if (!e.durable) return false;
      if (openTabUrls.has(e.normalizedUrl)) return false;
      if (e.pinnedUntil != null && e.pinnedUntil > t) return false;
      return true;
    })
    .sort((a, b) => a.lastAccessAt - b.lastAccessAt);

  let over = byUrl.size - MAX_ENTRIES;
  for (const entry of candidates) {
    if (over <= 0) break;
    byUrl.delete(entry.normalizedUrl);
    over -= 1;
  }
}

/** Test helper */
export function clearWorkingSetForTests(): void {
  byUrl.clear();
  openTabUrls.clear();
}
