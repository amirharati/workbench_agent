import { describe, expect, it } from 'vitest';
import { isSidePanelSurface } from './appSurface';

describe('app surface detection', () => {
  it('detects the explicit side-panel surface', () => {
    expect(isSidePanelSurface({ search: '?surface=side-panel' })).toBe(true);
    expect(isSidePanelSurface({ search: '?foo=1&surface=side-panel' })).toBe(true);
  });

  it('keeps dashboards independent of viewport width', () => {
    expect(isSidePanelSurface({ search: '' })).toBe(false);
    expect(isSidePanelSurface({ search: '?surface=dashboard' })).toBe(false);
  });
});
