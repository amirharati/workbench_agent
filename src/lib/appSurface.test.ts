import { describe, expect, it } from 'vitest';
import { isSidePanelSurface, readSidePanelHostTabId } from './appSurface';

describe('app surface detection', () => {
  it('detects the explicit side-panel surface', () => {
    expect(isSidePanelSurface({ search: '?surface=side-panel' })).toBe(true);
    expect(isSidePanelSurface({ search: '?foo=1&surface=side-panel' })).toBe(true);
  });

  it('keeps dashboards independent of viewport width', () => {
    expect(isSidePanelSurface({ search: '' })).toBe(false);
    expect(isSidePanelSurface({ search: '?surface=dashboard' })).toBe(false);
  });

  it('reads only a valid contextual host tab id', () => {
    expect(readSidePanelHostTabId({ search: '?surface=side-panel&hostTabId=42' })).toBe(42);
    expect(readSidePanelHostTabId({ search: '?surface=side-panel' })).toBeNull();
    expect(readSidePanelHostTabId({ search: '?hostTabId=0' })).toBeNull();
    expect(readSidePanelHostTabId({ search: '?hostTabId=42x' })).toBeNull();
  });
});
