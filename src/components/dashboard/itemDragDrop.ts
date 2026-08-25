import type React from 'react';

export const ITEM_DRAG_MIME = 'application/x-homebase-item+json';
export const ITEM_DRAG_VERSION = 1 as const;

export type ItemContainerKind = 'workspace' | 'collection';
export type ItemTransferOperation = 'copy' | 'move';

export type ItemDragSource =
  | { kind: 'reference'; label?: string }
  | {
      kind: ItemContainerKind;
      containerId: string;
      containerLabel: string;
      projectId?: string | 'all';
    };

export interface ItemDropTarget {
  kind: ItemContainerKind;
  containerId: string;
  containerLabel: string;
  projectId?: string | 'all';
}

/**
 * A project is not itself a membership container. This descriptor lets a
 * project-level aggregate view resolve a drop to one of its real collections.
 */
export interface ProjectCollectionDropTarget {
  kind: 'project-collections';
  projectId: string;
  projectLabel: string;
  collections: Array<ItemDropTarget & { kind: 'collection' }>;
}

export interface ItemDragPayload {
  version: typeof ITEM_DRAG_VERSION;
  entity: 'item' | 'url';
  itemId: string;
  /** Ordered canonical item IDs. `itemId` remains the lead item for v1 compatibility. */
  itemIds?: string[];
  itemLabel: string;
  /** Present only for an unsaved browser or snapshot URL. */
  url?: string;
  source: ItemDragSource;
}

export type ItemDropDecision =
  | { kind: 'copy' }
  | { kind: 'choose' }
  | { kind: 'same-container' };

export function createItemDragPayload(
  item: { id: string; title?: string; url?: string },
  source: ItemDragSource,
  selectedItems?: readonly { id: string; title?: string; url?: string }[]
): ItemDragPayload {
  const items = [...new Map(
    [item, ...(selectedItems ?? [])]
      .filter((candidate) => candidate.id)
      .map((candidate) => [candidate.id, candidate] as const)
  ).values()];
  const itemIds = items.map((candidate) => candidate.id);
  return {
    version: ITEM_DRAG_VERSION,
    entity: 'item',
    itemId: item.id,
    ...(itemIds.length > 1 ? { itemIds } : {}),
    itemLabel: itemIds.length > 1
      ? `${itemIds.length} selected items`
      : item.title?.trim() || item.url?.trim() || 'Untitled',
    source,
  };
}

export function itemIdsFromDragPayload(payload: ItemDragPayload): string[] {
  if (payload.entity !== 'item') return [];
  return [...new Set([payload.itemId, ...(payload.itemIds ?? [])].filter(Boolean))];
}

export function createUrlDragPayload(
  link: { url: string; title?: string },
  source: ItemDragSource
): ItemDragPayload {
  const url = link.url.trim();
  return {
    version: ITEM_DRAG_VERSION,
    entity: 'url',
    // A URL is materialized into a real Item on drop; this id is only used
    // while it is in flight through the shared drag system.
    itemId: `url:${url}`,
    itemLabel: link.title?.trim() || url,
    url,
    source,
  };
}

export function decideItemDrop(
  source: ItemDragSource,
  target: ItemDropTarget
): ItemDropDecision {
  if (source.kind === 'reference') return { kind: 'copy' };
  if (source.kind !== target.kind) return { kind: 'copy' };
  if (source.containerId === target.containerId) return { kind: 'same-container' };
  return { kind: 'choose' };
}

export function writeItemDragPayload(
  dataTransfer: DataTransfer,
  payload: ItemDragPayload
): void {
  dataTransfer.effectAllowed = payload.source.kind === 'reference' ? 'copy' : 'copyMove';
  dataTransfer.setData(ITEM_DRAG_MIME, JSON.stringify(payload));
}

export function readItemDragPayload(dataTransfer: DataTransfer): ItemDragPayload | null {
  const raw = dataTransfer.getData(ITEM_DRAG_MIME);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ItemDragPayload>;
    if (
      value.version !== ITEM_DRAG_VERSION ||
      (value.entity !== 'item' && value.entity !== 'url') ||
      typeof value.itemId !== 'string' ||
      typeof value.itemLabel !== 'string' ||
      !value.source ||
      typeof value.source !== 'object'
    ) return null;
    if (value.itemIds !== undefined && (
      !Array.isArray(value.itemIds) ||
      value.itemIds.some((itemId) => typeof itemId !== 'string' || !itemId)
    )) return null;
    if (value.entity === 'url' && (typeof value.url !== 'string' || !/^https?:\/\//i.test(value.url))) return null;
    const source = value.source as ItemDragSource;
    if (source.kind === 'reference') return value as ItemDragPayload;
    if (
      (source.kind === 'workspace' || source.kind === 'collection') &&
      typeof source.containerId === 'string' &&
      typeof source.containerLabel === 'string'
    ) return value as ItemDragPayload;
    return null;
  } catch {
    return null;
  }
}

export function itemDragSourceProps(
  payload: ItemDragPayload,
  callbacks: {
    onStart: (payload: ItemDragPayload, sourceElement: HTMLElement) => void;
    onEnd: () => void;
  }
): Pick<React.HTMLAttributes<HTMLElement>, 'onDragStart' | 'onDragEnd'> & { draggable: true } {
  return {
    draggable: true,
    onDragStart: (event) => {
      writeItemDragPayload(event.dataTransfer, payload);
      callbacks.onStart(payload, event.currentTarget);
    },
    onDragEnd: callbacks.onEnd,
  };
}
