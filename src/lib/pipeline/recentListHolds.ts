/** Row shape for list hold helpers (bookmark id only). */
export type RecentHoldRow = { item: { id: string } };

/**
 * Keep rows visible after an action even when they no longer match filters,
 * until the user changes filters (filterSessionKey reset).
 */
export function buildDisplayListWithRecentHolds<T extends RecentHoldRow>(
  filteredRows: T[],
  displayOrderIds: string[] | null,
  recentUpdateIds: ReadonlySet<string>,
  ...rowSources: T[][]
): T[] {
  if (recentUpdateIds.size === 0) return filteredRows;

  const freshById = new Map<string, T>();
  for (const source of rowSources) {
    for (const row of source) freshById.set(row.item.id, row);
  }

  const filteredIds = new Set(filteredRows.map((r) => r.item.id));
  let order = displayOrderIds ?? filteredRows.map((r) => r.item.id);
  for (const row of filteredRows) {
    if (!order.includes(row.item.id)) order = [...order, row.item.id];
  }

  return order
    .map((id) => freshById.get(id))
    .filter((row): row is T => {
      if (!row) return false;
      return filteredIds.has(row.item.id) || recentUpdateIds.has(row.item.id);
    });
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
