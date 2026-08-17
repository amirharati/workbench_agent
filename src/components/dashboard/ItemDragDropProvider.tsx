import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Copy, Folder, GripVertical, Layers3, MoveRight, X } from 'lucide-react';
import type { Collection, Project } from '../../lib/db';
import { useToast } from '../ToastContainer';
import type { WorkspaceDestination } from './workspaceDestinations';
import {
  ITEM_DRAG_MIME,
  createItemDragPayload,
  decideItemDrop,
  itemDragSourceProps,
  readItemDragPayload,
  type ItemDragPayload,
  type ItemDragSource,
  type ItemDropTarget,
  type ItemTransferOperation,
} from './itemDragDrop';

export interface ItemTransferResult {
  message: string;
  undo?: () => void | Promise<void>;
}

interface ItemDragDropContextValue {
  activePayload: ItemDragPayload | null;
  getDragProps: (
    item: { id: string; title?: string; url?: string },
    source: ItemDragSource
  ) => ReturnType<typeof itemDragSourceProps>;
  getDropTargetProps: (target: ItemDropTarget) => ItemDropTargetProps;
  getReorderTargetProps: (
    beforeItemId: string,
    target: ItemDropTarget
  ) => ItemDropTargetProps;
}

type ItemDropTargetProps = React.HTMLAttributes<HTMLElement> & {
  'data-drag-over'?: string;
  'data-same-source'?: string;
  'data-reorder-over'?: string;
};

const ItemDragDropContext = createContext<ItemDragDropContextValue | null>(null);

export function useItemDragDrop(): ItemDragDropContextValue {
  const context = useContext(ItemDragDropContext);
  if (!context) {
    return {
      activePayload: null,
      getDragProps: () => ({ draggable: true, onDragStart: () => {}, onDragEnd: () => {} }),
      getDropTargetProps: () => ({}),
      getReorderTargetProps: () => ({}),
    };
  }
  return context;
}

interface ItemDragDropProviderProps {
  children: React.ReactNode;
  projects: readonly Project[];
  collections: readonly Collection[];
  workspaceDestinations: readonly WorkspaceDestination[];
  isInTarget: (itemId: string, target: ItemDropTarget) => boolean;
  onTransfer: (
    payload: ItemDragPayload,
    target: ItemDropTarget,
    operation: ItemTransferOperation
  ) => ItemTransferResult | Promise<ItemTransferResult>;
  onReorderWorkspaceItem: (
    itemId: string,
    beforeItemId: string,
    target: ItemDropTarget
  ) => void;
}

interface PendingChoice {
  payload: ItemDragPayload;
  target: ItemDropTarget;
}

function includesItemPayload(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types ?? []).includes(ITEM_DRAG_MIME);
}

export const ItemDragDropProvider: React.FC<ItemDragDropProviderProps> = ({
  children,
  projects,
  collections,
  workspaceDestinations,
  isInTarget,
  onTransfer,
  onReorderWorkspaceItem,
}) => {
  const { addToast } = useToast();
  const [activePayload, setActivePayload] = useState<ItemDragPayload | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [reorderOverItemId, setReorderOverItemId] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [busy, setBusy] = useState(false);

  const clearDrag = useCallback(() => {
    setActivePayload(null);
    setDragOverTargetId(null);
    setReorderOverItemId(null);
  }, []);

  const getDragProps = useCallback<ItemDragDropContextValue['getDragProps']>((item, source) => {
    const payload = createItemDragPayload(item, source);
    return itemDragSourceProps(payload, {
      onStart: setActivePayload,
      onEnd: clearDrag,
    });
  }, [clearDrag]);

  const runTransfer = useCallback(async (
    payload: ItemDragPayload,
    target: ItemDropTarget,
    operation: ItemTransferOperation
  ) => {
    setBusy(true);
    try {
      const result = await onTransfer(payload, target, operation);
      addToast({
        type: 'success',
        message: result.message,
        action: result.undo ? { label: 'Undo', onClick: () => void result.undo?.() } : undefined,
      });
      setPendingChoice(null);
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not transfer item',
      });
    } finally {
      setBusy(false);
    }
  }, [addToast, onTransfer]);

  const handleDrop = useCallback((event: React.DragEvent, target: ItemDropTarget) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readItemDragPayload(event.dataTransfer) ?? activePayload;
    clearDrag();
    if (!payload) return;
    const decision = decideItemDrop(payload.source, target);
    if (decision.kind === 'same-container') return;
    if (decision.kind === 'choose') {
      setPendingChoice({ payload, target });
      return;
    }
    void runTransfer(payload, target, 'copy');
  }, [activePayload, clearDrag, runTransfer]);

  const getDropTargetProps = useCallback((target: ItemDropTarget): ItemDropTargetProps => {
    const targetKey = `${target.kind}:${target.containerId}`;
    const sameSource = activePayload?.source.kind === target.kind &&
      activePayload.source.containerId === target.containerId;
    return {
      onDragEnter: (event: React.DragEvent) => {
        if (!activePayload && !includesItemPayload(event)) return;
        event.preventDefault();
        if (!sameSource) setDragOverTargetId(targetKey);
      },
      onDragOver: (event: React.DragEvent) => {
        if (!activePayload && !includesItemPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = sameSource
          ? 'none'
          : 'copy';
      },
      onDragLeave: (event: React.DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragOverTargetId((current) => current === targetKey ? null : current);
      },
      onDrop: (event: React.DragEvent) => {
        if (sameSource) {
          event.preventDefault();
          clearDrag();
          return;
        }
        handleDrop(event, target);
      },
      'data-drag-over': dragOverTargetId === targetKey ? 'true' : 'false',
      'data-same-source': sameSource ? 'true' : 'false',
    };
  }, [activePayload, clearDrag, dragOverTargetId, handleDrop]);

  const getReorderTargetProps = useCallback((
    beforeItemId: string,
    target: ItemDropTarget
  ): ItemDropTargetProps => ({
    onDragOver: (event) => {
      const payload = activePayload ?? readItemDragPayload(event.dataTransfer);
      if (
        !payload ||
        payload.itemId === beforeItemId ||
        payload.source.kind !== 'workspace' ||
        target.kind !== 'workspace' ||
        payload.source.containerId !== target.containerId
      ) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setReorderOverItemId(beforeItemId);
    },
    onDragLeave: (event) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setReorderOverItemId((current) => current === beforeItemId ? null : current);
    },
    onDrop: (event) => {
      const payload = readItemDragPayload(event.dataTransfer) ?? activePayload;
      if (
        !payload ||
        payload.itemId === beforeItemId ||
        payload.source.kind !== 'workspace' ||
        target.kind !== 'workspace' ||
        payload.source.containerId !== target.containerId
      ) return;
      event.preventDefault();
      event.stopPropagation();
      onReorderWorkspaceItem(payload.itemId, beforeItemId, target);
      clearDrag();
    },
    'data-reorder-over': reorderOverItemId === beforeItemId ? 'true' : 'false',
  }), [activePayload, clearDrag, onReorderWorkspaceItem, reorderOverItemId]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );
  const orderedCollections = useMemo(
    () => [...collections]
      .filter((collection) => !collection.id.startsWith('__'))
      .sort((left, right) => {
        const leftProject = projectById.get(left.primaryProjectId)?.name ?? '';
        const rightProject = projectById.get(right.primaryProjectId)?.name ?? '';
        return leftProject.localeCompare(rightProject) || left.name.localeCompare(right.name);
      }),
    [collections, projectById]
  );
  const contextValue = useMemo(
    () => ({ activePayload, getDragProps, getDropTargetProps, getReorderTargetProps }),
    [activePayload, getDragProps, getDropTargetProps, getReorderTargetProps]
  );
  useEffect(() => {
    if (!pendingChoice) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setPendingChoice(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, pendingChoice]);

  return (
    <ItemDragDropContext.Provider value={contextValue}>
      {children}
      {activePayload ? (
        <aside className="ui-item-drop-tray" aria-label={`Destinations for ${activePayload.itemLabel}`}>
          <div className="ui-item-drop-tray__header">
            <span className="ui-item-drop-tray__drag-icon"><GripVertical size={14} /></span>
            <span>
              <strong>Place “{activePayload.itemLabel}”</strong>
              <small>Drop onto a destination. Different container types always copy.</small>
            </span>
          </div>
          <div className="ui-item-drop-tray__groups scrollbar">
            <section>
              <h3><Layers3 size={12} /> Workspaces</h3>
              <div className="ui-item-drop-tray__targets">
                {workspaceDestinations.map((destination) => {
                  const target: ItemDropTarget = {
                    kind: 'workspace',
                    containerId: destination.key,
                    containerLabel: destination.path,
                    projectId: destination.projectId,
                  };
                  const present = isInTarget(activePayload.itemId, target);
                  return (
                    <div key={destination.key} className="ui-item-drop-target" {...getDropTargetProps(target)} data-present={present ? 'true' : 'false'}>
                      <Layers3 size={12} />
                      <span>{destination.path}</span>
                      {present ? <small>Already in</small> : null}
                    </div>
                  );
                })}
              </div>
            </section>
            <section>
              <h3><Folder size={12} /> Collections</h3>
              <div className="ui-item-drop-tray__targets">
                {orderedCollections.map((collection) => {
                  const projectName = projectById.get(collection.primaryProjectId)?.name ?? 'Unknown project';
                  const target: ItemDropTarget = {
                    kind: 'collection',
                    containerId: collection.id,
                    containerLabel: `${projectName} · ${collection.name}`,
                    projectId: collection.primaryProjectId,
                  };
                  const present = isInTarget(activePayload.itemId, target);
                  return (
                    <div key={collection.id} className="ui-item-drop-target" {...getDropTargetProps(target)} data-present={present ? 'true' : 'false'}>
                      <Folder size={12} />
                      <span>{projectName} · {collection.name}</span>
                      {present ? <small>Already in</small> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </aside>
      ) : null}

      {pendingChoice ? (
        <div className="ui-item-transfer-dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy) setPendingChoice(null); }}>
          <section className="ui-item-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="item-transfer-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="ui-item-transfer-dialog__close" type="button" onClick={() => setPendingChoice(null)} disabled={busy} aria-label="Cancel transfer"><X size={14} /></button>
            <h2 id="item-transfer-title">Copy or move this item?</h2>
            <p>
              “{pendingChoice.payload.itemLabel}” is currently in <strong>{pendingChoice.payload.source.kind === 'reference' ? 'this result list' : pendingChoice.payload.source.containerLabel}</strong>.
            </p>
            <div className="ui-item-transfer-dialog__actions">
              <button type="button" autoFocus disabled={busy} onClick={() => void runTransfer(pendingChoice.payload, pendingChoice.target, 'copy')}>
                <Copy size={14} />
                <span><strong>Copy to {pendingChoice.target.containerLabel}</strong><small>Keep it in the source too</small></span>
              </button>
              <button type="button" disabled={busy} onClick={() => void runTransfer(pendingChoice.payload, pendingChoice.target, 'move')}>
                <MoveRight size={14} />
                <span><strong>Move to {pendingChoice.target.containerLabel}</strong><small>Add it here, then remove it from the source</small></span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </ItemDragDropContext.Provider>
  );
};
