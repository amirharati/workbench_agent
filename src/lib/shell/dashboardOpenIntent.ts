export const DASHBOARD_OPEN_ITEM_PARAM = 'openItem';
export const DASHBOARD_OPEN_ACTION_PARAM = 'openAction';

export type DashboardOpenAction = 'manage-categories';

type SearchLocation = Pick<Location, 'search'>;

export function readDashboardOpenItemIntent(
  location: SearchLocation = window.location
): string | null {
  const value = new URLSearchParams(location.search).get(DASHBOARD_OPEN_ITEM_PARAM)?.trim();
  return value || null;
}

export function readDashboardOpenActionIntent(
  location: SearchLocation = window.location
): DashboardOpenAction | null {
  const value = new URLSearchParams(location.search).get(DASHBOARD_OPEN_ACTION_PARAM)?.trim();
  return value === 'manage-categories' ? value : null;
}

export function buildDashboardOpenItemUrl(
  baseUrl: string,
  itemId?: string,
  action?: DashboardOpenAction
): string {
  const url = new URL(baseUrl);
  const normalizedItemId = itemId?.trim();
  if (normalizedItemId) url.searchParams.set(DASHBOARD_OPEN_ITEM_PARAM, normalizedItemId);
  if (normalizedItemId && action) url.searchParams.set(DASHBOARD_OPEN_ACTION_PARAM, action);
  return url.href;
}

export function clearDashboardOpenItemIntent(
  location: Pick<Location, 'href'> = window.location,
  history: Pick<History, 'replaceState'> = window.history
): void {
  const url = new URL(location.href);
  if (
    !url.searchParams.has(DASHBOARD_OPEN_ITEM_PARAM) &&
    !url.searchParams.has(DASHBOARD_OPEN_ACTION_PARAM)
  ) return;
  url.searchParams.delete(DASHBOARD_OPEN_ITEM_PARAM);
  url.searchParams.delete(DASHBOARD_OPEN_ACTION_PARAM);
  history.replaceState(null, '', url.href);
}
