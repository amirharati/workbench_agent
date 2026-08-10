import { describe, expect, it } from 'vitest';
import {
  DATA_CHANGE_SOURCE_ID,
  notifyDataChanged,
  runWithDataChangeNotificationsSuppressed,
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

  it('suppresses intermediate coordinator writes and emits one scoped completion', async () => {
    const received: string[] = [];
    const unsubscribe = subscribeToDataChanges((event) => received.push(event.reason));

    await runWithDataChangeNotificationsSuppressed(async () => {
      notifyDataChanged('enrichment.update');
      notifyDataChanged('categorization.update');
    });
    notifyDataChanged('pipeline.complete', { entityIds: ['item-1', 'item-2'] });
    unsubscribe();

    expect(received).toEqual(['pipeline.complete']);
  });
});
