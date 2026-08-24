import { describe, expect, it, vi } from 'vitest';
import {
  buildDashboardOpenItemUrl,
  clearDashboardOpenItemIntent,
  readDashboardOpenActionIntent,
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

  it('carries a category-manager action with the saved item', () => {
    const url = buildDashboardOpenItemUrl(
      'chrome-extension://homebase/index.html',
      'item-7',
      'manage-categories'
    );
    const search = new URL(url).search;
    expect(readDashboardOpenItemIntent({ search })).toBe('item-7');
    expect(readDashboardOpenActionIntent({ search })).toBe('manage-categories');
  });

  it('removes only the consumed item intent', () => {
    const replaceState = vi.fn();
    clearDashboardOpenItemIntent(
      { href: 'chrome-extension://homebase/index.html?openItem=item-7&openAction=manage-categories&keep=yes' },
      { replaceState }
    );
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      'chrome-extension://homebase/index.html?keep=yes'
    );
  });
});
