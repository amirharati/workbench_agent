import { describe, expect, it } from 'vitest';
import type { Item } from '../../lib/db';
import { getProjectPinTimestamp, sortProjectItemsByRecency, updateProjectPinMetadata } from './projectPins';

const item = (id: string, updated_at: number, metadata?: Item['metadata']): Item => ({
  id,
  title: id,
  url: `https://${id}.test`,
  collectionIds: ['c1'],
  tags: [],
  created_at: 1,
  updated_at,
  source: 'manual',
  metadata,
});

describe('project-specific pins', () => {
  it('preserves unrelated metadata and pins independently by project', () => {
    const metadata = updateProjectPinMetadata({ sourceLabel: 'imported' }, 'p1', 10);
    const withTwoPins = updateProjectPinMetadata(metadata, 'p2', 20);
    expect(withTwoPins).toEqual({ sourceLabel: 'imported', projectPins: { p1: 10, p2: 20 } });
    expect(getProjectPinTimestamp({ metadata: withTwoPins }, 'p1')).toBe(10);
    expect(updateProjectPinMetadata(withTwoPins, 'p1')).toEqual({
      sourceLabel: 'imported',
      projectPins: { p2: 20 },
    });
  });

  it('keeps normal project list order independent of pin markers', () => {
    const items = [
      item('new', 30),
      item('p2-pin', 20, { projectPins: { p2: 50 } }),
      item('p1-pin', 10, { projectPins: { p1: 40 } }),
    ];
    expect(sortProjectItemsByRecency(items).map((entry) => entry.id)).toEqual(['new', 'p2-pin', 'p1-pin']);
  });
});
