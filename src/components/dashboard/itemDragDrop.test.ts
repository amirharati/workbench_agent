import { describe, expect, it } from 'vitest';
import {
  ITEM_DRAG_MIME,
  createItemDragPayload,
  createUrlDragPayload,
  decideItemDrop,
  itemIdsFromDragPayload,
  readItemDragPayload,
  writeItemDragPayload,
} from './itemDragDrop';

function transfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'uninitialized',
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? '',
  } as DataTransfer;
}

describe('item drag/drop contract', () => {
  const workspace = { kind: 'workspace' as const, containerId: 'workspace-a', containerLabel: 'A' };
  const otherWorkspace = { kind: 'workspace' as const, containerId: 'workspace-b', containerLabel: 'B' };
  const collection = { kind: 'collection' as const, containerId: 'collection-a', containerLabel: 'Sources' };

  it('only copies from a reference source', () => {
    expect(decideItemDrop({ kind: 'reference', label: 'Search' }, workspace)).toEqual({ kind: 'copy' });
  });

  it('only copies between different container types', () => {
    expect(decideItemDrop(collection, workspace)).toEqual({ kind: 'copy' });
    expect(decideItemDrop(workspace, collection)).toEqual({ kind: 'copy' });
  });

  it('asks for copy or move between containers of the same type', () => {
    expect(decideItemDrop(workspace, otherWorkspace)).toEqual({ kind: 'choose' });
  });

  it('recognizes a same-container drop separately', () => {
    expect(decideItemDrop(workspace, workspace)).toEqual({ kind: 'same-container' });
  });

  it('round-trips only the versioned custom payload', () => {
    const dataTransfer = transfer();
    const payload = createItemDragPayload({ id: 'item-1', title: 'One' }, workspace);
    writeItemDragPayload(dataTransfer, payload);
    expect(dataTransfer.effectAllowed).toBe('copyMove');
    expect(dataTransfer.getData('text/plain')).toBe('');
    expect(dataTransfer.getData(ITEM_DRAG_MIME)).toContain('item-1');
    expect(readItemDragPayload(dataTransfer)).toEqual(payload);
  });

  it('round-trips an unsaved browser URL as a copy-only source', () => {
    const dataTransfer = transfer();
    const payload = createUrlDragPayload(
      { url: 'https://example.com/browser-tab', title: 'Browser tab' },
      { kind: 'reference', label: 'Browser snapshot' }
    );
    writeItemDragPayload(dataTransfer, payload);

    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(readItemDragPayload(dataTransfer)).toEqual(payload);
  });

  it('round-trips a canonical multi-item selection without changing source semantics', () => {
    const dataTransfer = transfer();
    const payload = createItemDragPayload(
      { id: 'item-1', title: 'One' },
      collection,
      [{ id: 'item-1', title: 'One' }, { id: 'item-2', title: 'Two' }, { id: 'item-2', title: 'Duplicate' }]
    );
    writeItemDragPayload(dataTransfer, payload);

    expect(payload.itemLabel).toBe('2 selected items');
    expect(itemIdsFromDragPayload(payload)).toEqual(['item-1', 'item-2']);
    expect(readItemDragPayload(dataTransfer)).toEqual(payload);
    expect(decideItemDrop(payload.source, { ...collection, containerId: 'collection-b' })).toEqual({ kind: 'choose' });
  });
});
