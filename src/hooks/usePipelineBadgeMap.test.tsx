// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadBadges: vi.fn(),
}));

vi.mock('../lib/pipeline', () => ({
  loadPipelineBadgeMap: mocks.loadBadges,
}));

vi.mock('../lib/dataChangeNotifier', () => ({
  subscribeToDataChanges: () => () => undefined,
}));

import { usePipelineBadgeMap } from './usePipelineBadgeMap';

function Harness({ itemIds }: { itemIds: string[] }) {
  const badges = usePipelineBadgeMap(itemIds);
  return <span>{badges.size}</span>;
}

describe('usePipelineBadgeMap', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('loads large scopes as bounded low-priority worker turns', async () => {
    mocks.loadBadges.mockImplementation(async (itemIds: string[]) =>
      new Map(itemIds.map((itemId) => [itemId, { itemId }]))
    );
    const itemIds = Array.from({ length: 170 }, (_, index) => `item-${index}`);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<Harness itemIds={itemIds} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(mocks.loadBadges).toHaveBeenCalledTimes(3);
    expect(mocks.loadBadges.mock.calls.map(([ids]) => ids.length)).toEqual([80, 80, 10]);
    expect(mocks.loadBadges.mock.calls.every(([, options]) => options.priority === 'low')).toBe(true);
    expect(host.textContent).toBe('170');

    await act(async () => root.unmount());
  });
});
