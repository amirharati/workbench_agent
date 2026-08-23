import { describe, expect, it } from 'vitest';
import { normalizePipelineExecutionOptions } from './offscreenPipelineProtocol';

describe('normalizePipelineExecutionOptions', () => {
  it('pins full digest discovery to the exact submitted scope and includes fresh items', () => {
    expect(normalizePipelineExecutionOptions(
      'full_digest',
      ['item-2', 'item-1', 'item-3', 'item-2', ''],
      {}
    )).toMatchObject({
      discoverItemIds: ['item-2', 'item-1', 'item-3'],
      discoverStuckOnly: false,
    });
  });

  it('does not manufacture taxonomy from a two-link scope', () => {
    expect(normalizePipelineExecutionOptions(
      'full_digest',
      ['item-1', 'item-2'],
      {}
    )).toMatchObject({
      discoverItemIds: [],
      discoverStuckOnly: true,
    });
  });

  it('uses the global minimum-sized pending pool for a single-link digest', () => {
    expect(normalizePipelineExecutionOptions(
      'full_digest',
      ['item-1'],
      { discoverStuckOnly: false }
    )).toMatchObject({
      discoverItemIds: [],
      discoverStuckOnly: true,
    });
  });

  it('keeps standalone discover on its existing stuck-only default', () => {
    const options = normalizePipelineExecutionOptions('discover', ['item-1'], {});
    expect(options.discoverItemIds).toEqual(['item-1']);
    expect(options.discoverStuckOnly).toBeUndefined();
  });

  it('does not add discovery scope when full digest explicitly skips discovery', () => {
    expect(normalizePipelineExecutionOptions(
      'full_digest',
      ['item-1'],
      { skipDiscover: true }
    )).toEqual({ skipDiscover: true });
  });
});
