import { describe, expect, it } from 'vitest';
import {
  DATA_CHANGE_SOURCE_ID,
  notifyDataChanged,
  subscribeToDataChanges,
} from './dataChangeNotifier';

describe('dataChangeNotifier', () => {
  it('preserves scoped entity and worker revision details', () => {
    let received: unknown;
    const unsubscribe = subscribeToDataChanges((event) => {
      received = event;
    });

    notifyDataChanged('item.add', { entityId: 'item-1', revision: 12 });
    unsubscribe();

    expect(received).toEqual(expect.objectContaining({
      reason: 'item.add',
      sourceId: DATA_CHANGE_SOURCE_ID,
      entityId: 'item-1',
      revision: 12,
    }));
  });
});
