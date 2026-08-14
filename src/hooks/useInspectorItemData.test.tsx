// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadContext: vi.fn(),
  findSimilar: vi.fn(),
}));

vi.mock('../lib/pipeline/itemPipelineContext', () => ({
  loadItemPipelineContext: mocks.loadContext,
}));

vi.mock('../lib/search', () => ({
  runAppFindSimilar: mocks.findSimilar,
}));

vi.mock('../lib/dataChangeNotifier', () => ({
  subscribeToDataChanges: () => () => undefined,
}));

import { useInspectorItemData } from './useInspectorItemData';

function Harness({ itemId }: { itemId: string }) {
  const data = useInspectorItemData(itemId);
  return <span>{data.contextLoading || data.similarLoading ? 'loading' : 'ready'}</span>;
}

describe('useInspectorItemData', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('deduplicates observers and always enqueues context before Similar', async () => {
    mocks.loadContext.mockResolvedValue({ item: { id: 'shared-item' } });
    mocks.findSimilar.mockResolvedValue({
      itemId: 'shared-item',
      anchorTitle: 'Shared',
      anchorHasEmbedding: true,
      results: [],
      totalCandidates: 0,
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<><Harness itemId="shared-item" /><Harness itemId="shared-item" /></>);
    });

    expect(mocks.loadContext).toHaveBeenCalledTimes(1);
    expect(mocks.findSimilar).toHaveBeenCalledTimes(1);
    expect(mocks.loadContext.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findSimilar.mock.invocationCallOrder[0]
    );
    expect(host.textContent).toBe('readyready');

    await act(async () => root.unmount());
  });
});
