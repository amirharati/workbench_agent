import { describe, expect, it, vi } from 'vitest';
import {
  buildDashboardOpenItemUrl,
  clearDashboardOpenItemIntent,
  readDashboardOpenItemIntent,
} from './dashboardOpenIntent';

describe('dashboard item-open intent', () => {
  it('builds and reads an exact saved-item destination', () => {
    const url = buildDashboardOpenItemUrl(
      'chrome-extension://homebase/index.html',
      'item / with spaces'
    );
    expect(url).toContain('openItem=item+%2F+with+spaces');
    expect(readDashboardOpenItemIntent({ search: new URL(url).search })).toBe(
      'item / with spaces'
    );
  });

  it('removes only the consumed item intent', () => {
    const replaceState = vi.fn();
    clearDashboardOpenItemIntent(
      { href: 'chrome-extension://homebase/index.html?openItem=item-7&keep=yes' },
      { replaceState }
    );
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      'chrome-extension://homebase/index.html?keep=yes'
    );
  });
});
