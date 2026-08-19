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
  type ProjectCollectionDropTarget,
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
  getProjectCollectionDropTargetProps: (target: ProjectCollectionDropTarget) => ItemDropTargetProps;
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
      getProjectCollectionDropTargetProps: () => ({}),
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
  /** Projects currently open in the Home project switcher. Closed projects are not drag destinations. */
  openProjectIds?: readonly string[];
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

interface PendingCollectionChoice {
  payload: ItemDragPayload;
  target: ProjectCollectionDropTarget;
}

function itemDropTargetKey(target: ItemDropTarget): string {
  return `${target.kind}:${target.containerId}`;
}

function includesItemPayload(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types ?? []).includes(ITEM_DRAG_MIME);
}

export const ItemDragDropProvider: React.FC<ItemDragDropProviderProps> = ({
  children,
  projects,
  collections,
  workspaceDestinations,
  openProjectIds = [],
  isInTarget,
  onTransfer,
  onReorderWorkspaceItem,
}) => {
  const { addToast } = useToast();
  const [activePayload, setActivePayload] = useState<ItemDragPayload | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [reorderOverItemId, setReorderOverItemId] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [pendingCollectionChoice, setPendingCollectionChoice] = useState<PendingCollectionChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [recentTargets, setRecentTargets] = useState<ItemDropTarget[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

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
      setRecentTargets((previous) => [
        target,
        ...previous.filter((candidate) => itemDropTargetKey(candidate) !== itemDropTargetKey(target)),
      ].slice(0, 5));
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

  const resolveDrop = useCallback((payload: ItemDragPayload, target: ItemDropTarget) => {
    const decision = decideItemDrop(payload.source, target);
    if (decision.kind === 'same-container') return;
    if (decision.kind === 'choose') {
      setPendingChoice({ payload, target });
      return;
    }
    void runTransfer(payload, target, 'copy');
  }, [runTransfer]);

  const handleDrop = useCallback((event: React.DragEvent, target: ItemDropTarget) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readItemDragPayload(event.dataTransfer) ?? activePayload;
    clearDrag();
    if (payload) resolveDrop(payload, target);
  }, [activePayload, clearDrag, resolveDrop]);

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

  const getProjectCollectionDropTargetProps = useCallback((
    target: ProjectCollectionDropTarget
  ): ItemDropTargetProps => {
    const targetKey = `project-collections:${target.projectId}`;
    return {
      onDragEnter: (event) => {
        if (target.collections.length === 0 || (!activePayload && !includesItemPayload(event))) return;
        event.preventDefault();
        setDragOverTargetId(targetKey);
      },
      onDragOver: (event) => {
        if (target.collections.length === 0 || (!activePayload && !includesItemPayload(event))) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: (event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragOverTargetId((current) => current === targetKey ? null : current);
      },
      onDrop: (event) => {
        if (target.collections.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const payload = readItemDragPayload(event.dataTransfer) ?? activePayload;
        clearDrag();
        if (!payload) return;
        if (target.collections.length === 1) {
          resolveDrop(payload, target.collections[0]);
          return;
        }
        setPendingCollectionChoice({ payload, target });
      },
      'data-drag-over': dragOverTargetId === targetKey ? 'true' : 'false',
    };
  }, [activePayload, clearDrag, dragOverTargetId, resolveDrop]);

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
  const openProjects = useMemo(
    () => openProjectIds
      .map((projectId) => projectById.get(projectId))
      .filter((project): project is Project => project != null),
    [openProjectIds, projectById]
  );
  const projectTargets = useMemo(() => openProjects.map((project) => {
    const workspaces = workspaceDestinations
      .filter((destination) => destination.projectId === project.id)
      .map((destination): ItemDropTarget => ({
        kind: 'workspace',
        containerId: destination.key,
        containerLabel: destination.path,
        projectId: project.id,
      }));
    const projectCollections = collections
      .filter((collection) =>
        !collection.id.startsWith('__') &&
        (collection.primaryProjectId === project.id || collection.projectIds?.includes(project.id))
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((collection): ItemDropTarget => ({
        kind: 'collection',
        containerId: collection.id,
        containerLabel: `${project.name} · ${collection.name}`,
        projectId: project.id,
      }));
    return { project, workspaces, collections: projectCollections };
  }), [collections, openProjects, workspaceDestinations]);
  const visibleTargets = useMemo(() => {
    const targets = new Map<string, ItemDropTarget>();
    const globalWorkspace = workspaceDestinations.find((destination) => destination.projectId === 'all');
    if (globalWorkspace) {
      const target: ItemDropTarget = {
        kind: 'workspace',
        containerId: globalWorkspace.key,
        containerLabel: globalWorkspace.path,
        projectId: 'all',
      };
      targets.set(itemDropTargetKey(target), target);
    }
    for (const projectTarget of projectTargets) {
      for (const target of [...projectTarget.workspaces, ...projectTarget.collections]) {
        targets.set(itemDropTargetKey(target), target);
      }
    }
    return targets;
  }, [projectTargets, workspaceDestinations]);
  const quickTargets = useMemo(() => {
    const globalTarget = [...visibleTargets.values()].find((target) => target.kind === 'workspace' && target.projectId === 'all');
    const recent = recentTargets
      .map((target) => visibleTargets.get(itemDropTargetKey(target)))
      .filter((target): target is ItemDropTarget => target != null && target !== globalTarget);
    return globalTarget ? [globalTarget, ...recent] : recent;
  }, [recentTargets, visibleTargets]);
  useEffect(() => {
    if (!activePayload) setExpandedProjectId(null);
  }, [activePayload]);
  const displayTargetName = (target: ItemDropTarget, compact = false) => {
    if (!compact) return target.containerLabel;
    const labelParts = target.containerLabel.split(' · ');
    return (labelParts[labelParts.length - 1] ?? target.containerLabel).replace(/^.* — /, '');
  };
  const renderTarget = (target: ItemDropTarget, compact = false) => {
    const present = activePayload ? isInTarget(activePayload.itemId, target) : false;
    const Icon = target.kind === 'workspace' ? Layers3 : Folder;
    return (
      <div key={itemDropTargetKey(target)} className="ui-item-drop-target" {...getDropTargetProps(target)} data-present={present ? 'true' : 'false'}>
        <Icon size={12} />
        <span>{displayTargetName(target, compact)}</span>
        {present ? <small>Already in</small> : null}
      </div>
    );
  };
  const contextValue = useMemo(
    () => ({ activePayload, getDragProps, getDropTargetProps, getProjectCollectionDropTargetProps, getReorderTargetProps }),
    [activePayload, getDragProps, getDropTargetProps, getProjectCollectionDropTargetProps, getReorderTargetProps]
  );
  useEffect(() => {
    if (!pendingChoice && !pendingCollectionChoice) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setPendingChoice(null);
        setPendingCollectionChoice(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, pendingChoice, pendingCollectionChoice]);

  return (
    <ItemDragDropContext.Provider value={contextValue}>
      {children}
      {activePayload ? (
        <aside className="ui-item-drop-tray" aria-label={`Destinations for ${activePayload.itemLabel}`}>
          <div className="ui-item-drop-tray__header">
            <span className="ui-item-drop-tray__drag-icon"><GripVertical size={14} /></span>
            <span>
              <strong>Place “{activePayload.itemLabel}”</strong>
              <small>Drop onto a destination. Move over an open project to reveal its destinations.</small>
            </span>
          </div>
          <div className="ui-item-drop-tray__groups scrollbar">
            {quickTargets.length > 0 ? (
              <section>
                <h3><Layers3 size={12} /> Quick destinations</h3>
                <div className="ui-item-drop-tray__targets">
                  {quickTargets.map((target) => renderTarget(target))}
                </div>
              </section>
            ) : null}
            <section>
              <h3><Folder size={12} /> Open projects</h3>
              <div className="ui-item-drop-tray__projects">
                {projectTargets.map(({ project, workspaces, collections: projectCollections }) => {
                  const expanded = expandedProjectId === project.id;
                  return (
                    <div
                      key={project.id}
                      className="ui-item-drop-project"
                      data-expanded={expanded ? 'true' : 'false'}
                      data-project-id={project.id}
                      onDragEnter={(event) => {
                        if (!activePayload && !includesItemPayload(event)) return;
                        event.preventDefault();
                        setExpandedProjectId(project.id);
                      }}
                      onDragOver={(event) => {
                        if (!activePayload && !includesItemPayload(event)) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <div className="ui-item-drop-project__header">
                        <Folder size={13} />
                        <strong>{project.name}</strong>
                        <small>{workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} · {projectCollections.length} collection{projectCollections.length === 1 ? '' : 's'}</small>
                      </div>
                      {expanded ? (
                        <div className="ui-item-drop-project__destinations scrollbar">
                          {workspaces.length > 0 ? (
                            <section>
                              <h4><Layers3 size={11} /> Workspaces</h4>
                              <div className="ui-item-drop-tray__targets">
                                {workspaces.map((target) => renderTarget(target, true))}
                              </div>
                            </section>
                          ) : null}
                          {projectCollections.length > 0 ? (
                            <section>
                              <h4><Folder size={11} /> Collections</h4>
                              <div className="ui-item-drop-tray__targets">
                                {projectCollections.map((target) => renderTarget(target, true))}
                              </div>
                            </section>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {projectTargets.length === 0 ? (
                  <div className="ui-item-drop-tray__empty">Open a project from Home to file into its collections or workspaces.</div>
                ) : null}
              </div>
            </section>
          </div>
        </aside>
      ) : null}

      {pendingCollectionChoice ? (
        <div className="ui-item-transfer-dialog-backdrop" role="presentation" onMouseDown={() => setPendingCollectionChoice(null)}>
          <section className="ui-item-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="item-collection-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="ui-item-transfer-dialog__close" type="button" onClick={() => setPendingCollectionChoice(null)} aria-label="Cancel collection choice"><X size={14} /></button>
            <h2 id="item-collection-title">Choose a collection</h2>
            <p>
              Add “{pendingCollectionChoice.payload.itemLabel}” to a collection in <strong>{pendingCollectionChoice.target.projectLabel}</strong>.
            </p>
            <div className="ui-item-transfer-dialog__actions ui-item-transfer-dialog__actions--collections">
              {pendingCollectionChoice.target.collections.map((collection, index) => {
                const present = isInTarget(pendingCollectionChoice.payload.itemId, collection);
                return (
                  <button
                    type="button"
                    key={collection.containerId}
                    autoFocus={index === 0}
                    onClick={() => {
                      const payload = pendingCollectionChoice.payload;
                      setPendingCollectionChoice(null);
                      resolveDrop(payload, collection);
                    }}
                  >
                    <Folder size={14} />
                    <span>
                      <strong>{collection.containerLabel}</strong>
                      <small>{present ? 'Already in this collection' : 'Add to this collection'}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
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
