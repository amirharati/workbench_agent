/** Row shape for list hold helpers (bookmark id only). */
export type RecentHoldRow = { item: { id: string } };

/**
 * Preserve the pre-action ordering for rows that still match the active
 * filters. Recently updated rows may remain highlighted, but a hold must never
 * make a non-matching row visible: filter counts and rendered rows share the
 * same membership invariant.
 */
export function buildDisplayListWithRecentHolds<T extends RecentHoldRow>(
  filteredRows: T[],
  displayOrderIds: string[] | null,
  _recentUpdateIds: ReadonlySet<string>,
  ..._rowSources: T[][]
): T[] {
  if (!displayOrderIds) return filteredRows;

  const filteredById = new Map(filteredRows.map((row) => [row.item.id, row]));
  const ordered: T[] = [];
  const included = new Set<string>();
  for (const id of displayOrderIds) {
    const row = filteredById.get(id);
    if (!row) continue;
    ordered.push(row);
    included.add(id);
  }
  for (const row of filteredRows) {
    if (!included.has(row.item.id)) ordered.push(row);
  }
  return ordered;
}

export function computeRecentUpdateIds<T extends RecentHoldRow>(input: {
  targets: string[];
  order: string[];
  freshRows: T[];
  rowMatchesFilters: (row: T) => boolean;
}): string[] {
  const freshById = new Map(input.freshRows.map((r) => [r.item.id, r]));
  const next = new Set<string>();
  for (const id of input.targets) {
    if (!input.order.includes(id)) continue;
    const row = freshById.get(id);
    if (!row) continue;
    if (!input.rowMatchesFilters(row)) next.add(id);
  }
  return [...next];
}
