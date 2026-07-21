export const SIDE_PANEL_SURFACE = 'side-panel';

type SearchLocation = Pick<Location, 'search'>;

/** Extension pages share index.html; the explicit query keeps layout/theme independent of width. */
export function isSidePanelSurface(
  location: SearchLocation = window.location
): boolean {
  return new URLSearchParams(location.search).get('surface') === SIDE_PANEL_SURFACE;
}
