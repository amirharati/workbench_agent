export const SIDE_PANEL_SURFACE = 'side-panel';

type SearchLocation = Pick<Location, 'search'>;

/** Extension pages share index.html; the explicit query keeps layout/theme independent of width. */
export function isSidePanelSurface(
  location: SearchLocation = window.location
): boolean {
  return new URLSearchParams(location.search).get('surface') === SIDE_PANEL_SURFACE;
}

/** Contextual panel paths carry the immutable browser tab that owns the instance. */
export function readSidePanelHostTabId(
  location: SearchLocation = window.location
): number | null {
  const raw = new URLSearchParams(location.search).get('hostTabId');
  if (!raw || !/^\d+$/.test(raw)) return null;
  const tabId = Number(raw);
  return Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
}
