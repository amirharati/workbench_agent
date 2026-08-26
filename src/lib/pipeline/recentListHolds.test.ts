import { describe, expect, it } from 'vitest';
import { buildDisplayListWithRecentHolds } from './recentListHolds';

type Row = { item: { id: string }; value: string };

describe('buildDisplayListWithRecentHolds', () => {
  it('preserves stable order without restoring rows excluded by the filter', () => {
    const matching: Row[] = [
      { item: { id: 'b' }, value: 'fresh b' },
      { item: { id: 'c' }, value: 'fresh c' },
    ];
    const allRows: Row[] = [
      { item: { id: 'a' }, value: 'fresh a' },
      ...matching,
    ];

    const result = buildDisplayListWithRecentHolds(
      matching,
      ['a', 'b'],
      new Set(['a']),
      allRows
    );

    expect(result.map((row) => row.item.id)).toEqual(['b', 'c']);
    expect(result[0]?.value).toBe('fresh b');
  });

  it('returns the filtered order when there is no held display order', () => {
    const matching: Row[] = [
      { item: { id: 'c' }, value: 'c' },
      { item: { id: 'b' }, value: 'b' },
    ];
    expect(buildDisplayListWithRecentHolds(matching, null, new Set())).toEqual(matching);
  });
});
