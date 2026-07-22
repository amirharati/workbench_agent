import type { Collection, Item, Project } from './db';

const MAX_SEARCH_TEXT_LENGTH = 48_000;
const MAX_OBJECT_DEPTH = 6;
const itemBaseSearchCache = new WeakMap<Item, string>();

function addSearchValue(
  value: unknown,
  parts: string[],
  state: { length: number },
  seen: WeakSet<object>,
  depth: number
): void {
  if (value == null || state.length >= MAX_SEARCH_TEXT_LENGTH || depth > MAX_OBJECT_DEPTH) return;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    if (!text) return;
    const remaining = MAX_SEARCH_TEXT_LENGTH - state.length;
    const bounded = text.slice(0, remaining);
    parts.push(bounded);
    state.length += bounded.length + 1;
    return;
  }

  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) addSearchValue(entry, parts, state, seen, depth + 1);
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    addSearchValue(key, parts, state, seen, depth + 1);
    addSearchValue(entry, parts, state, seen, depth + 1);
    if (state.length >= MAX_SEARCH_TEXT_LENGTH) break;
  }
}

/** Build a bounded text index from visible and hidden record fields. */
export function buildQuickFilterText(...values: unknown[]): string {
  const parts: string[] = [];
  const state = { length: 0 };
  const seen = new WeakSet<object>();
  for (const value of values) addSearchValue(value, parts, state, seen, 0);
  return normalizeQuickFilterText(parts.join(' '));
}

/** Include organization names alongside every persisted Item field and nested metadata value. */
export function buildItemQuickFilterText(
  item: Item,
  projects: readonly Project[] = [],
  collections: readonly Collection[] = []
): string {
  const collectionIds = new Set([
    ...(item.collectionIds ?? []),
    ...Object.keys(item.placements ?? {}),
  ]);
  const itemCollections = collections.filter((collection) => collectionIds.has(collection.id));
  const projectIds = new Set(
    itemCollections.flatMap((collection) => [
      collection.primaryProjectId,
      ...(collection.projectIds ?? []),
    ])
  );
  const itemProjects = projects.filter((project) => projectIds.has(project.id));

  let itemSearchText = itemBaseSearchCache.get(item);
  if (itemSearchText == null) {
    let decodedUrl = '';
    try {
      decodedUrl = decodeURIComponent(item.url || item.urlRaw || '');
    } catch {
      decodedUrl = item.url || item.urlRaw || '';
    }
    itemSearchText = buildQuickFilterText(item, decodedUrl);
    itemBaseSearchCache.set(item, itemSearchText);
  }

  // Put human organization context first so unusually large metadata cannot crowd it out.
  return buildQuickFilterText(itemProjects, itemCollections, itemSearchText);
}

export function normalizeQuickFilterText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Space-separated terms are ANDed against text returned by a build*QuickFilterText helper. */
export function matchesQuickFilter(indexedSearchText: string, query: string): boolean {
  const terms = normalizeQuickFilterText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((term) => indexedSearchText.includes(term));
}
