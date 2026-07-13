/** Scoped pipeline refresh: always patch touched items — never full `loadData()`. */
export type LibraryRefreshScope = {
  itemIds?: string[];
};

export function shouldUseLightLibraryRefresh(scope?: LibraryRefreshScope): boolean {
  return (scope?.itemIds?.length ?? 0) > 0;
}

/** @deprecated Kept for callers; light refresh is always used when itemIds are present. */
export const LIGHT_LIBRARY_REFRESH_MAX_ITEMS = Number.POSITIVE_INFINITY;
