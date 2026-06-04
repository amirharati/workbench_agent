/** Max selection size for pipeline post-run refresh without full `loadData()`. */
export const LIGHT_LIBRARY_REFRESH_MAX_ITEMS = 25;

export type LibraryRefreshScope = {
  itemIds?: string[];
};

export function shouldUseLightLibraryRefresh(scope?: LibraryRefreshScope): boolean {
  const n = scope?.itemIds?.length ?? 0;
  return n > 0 && n <= LIGHT_LIBRARY_REFRESH_MAX_ITEMS;
}
