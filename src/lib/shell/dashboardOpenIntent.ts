export const DASHBOARD_OPEN_ITEM_PARAM = 'openItem';

type SearchLocation = Pick<Location, 'search'>;

export function readDashboardOpenItemIntent(
  location: SearchLocation = window.location
): string | null {
  const value = new URLSearchParams(location.search).get(DASHBOARD_OPEN_ITEM_PARAM)?.trim();
  return value || null;
}

export function buildDashboardOpenItemUrl(baseUrl: string, itemId?: string): string {
  const url = new URL(baseUrl);
  const normalizedItemId = itemId?.trim();
  if (normalizedItemId) url.searchParams.set(DASHBOARD_OPEN_ITEM_PARAM, normalizedItemId);
  return url.href;
}

export function clearDashboardOpenItemIntent(
  location: Pick<Location, 'href'> = window.location,
  history: Pick<History, 'replaceState'> = window.history
): void {
  const url = new URL(location.href);
  if (!url.searchParams.has(DASHBOARD_OPEN_ITEM_PARAM)) return;
  url.searchParams.delete(DASHBOARD_OPEN_ITEM_PARAM);
  history.replaceState(null, '', url.href);
}
