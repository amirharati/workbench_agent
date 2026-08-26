import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Folder, GripVertical, Layers3, MoveRight, Search, X } from 'lucide-react';
import type { Collection, Project } from '../../lib/db';
import { useToast } from '../ToastContainer';
import type { WorkspaceDestination } from './workspaceDestinations';
import {
  ITEM_DRAG_MIME,
  createItemDragPayload,
  createUrlDragPayload,
  decideItemDrop,
  itemIdsFromDragPayload,
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
  beginItemTransfer: ItemDragSourceContextValue['beginItemTransfer'];
  getDragProps: ItemDragSourceContextValue['getDragProps'];
  getUrlDragProps: ItemDragSourceContextValue['getUrlDragProps'];
  getDropTargetProps: (target: ItemDropTarget) => ItemDropTargetProps;
  getProjectCollectionDropTargetProps: (target: ProjectCollectionDropTarget) => ItemDropTargetProps;
  getReorderTargetProps: (
    beforeItemId: string | null,
    target: ItemDropTarget
  ) => ItemDropTargetProps;
}

interface ItemDragSourceContextValue {
  getDragProps: (
    item: { id: string; title?: string; url?: string },
    source: ItemDragSource,
    selectedItems?: readonly { id: string; title?: string; url?: string }[]
  ) => ReturnType<typeof itemDragSourceProps>;
  getUrlDragProps: (
    link: { url: string; title?: string },
    source: ItemDragSource
  ) => ReturnType<typeof itemDragSourceProps>;
  beginItemTransfer: (
    items: readonly { id: string; title?: string; url?: string }[],
    source: ItemDragSource
  ) => void;
}

type ItemDropTargetProps = React.HTMLAttributes<HTMLElement> & {
  'data-drag-over'?: string;
  'data-same-source'?: string;
  'data-reorder-over'?: string;
};

const ItemDragDropContext = createContext<ItemDragDropContextValue | null>(null);
const ItemDragSourceContext = createContext<ItemDragSourceContextValue | null>(null);

const emptyDragProps: ItemDragSourceContextValue['getDragProps'] = () => ({
  draggable: true,
  onDragStart: () => {},
  onDragEnd: () => {},
});
const emptyUrlDragProps: ItemDragSourceContextValue['getUrlDragProps'] = () => ({
  draggable: true,
  onDragStart: () => {},
  onDragEnd: () => {},
});
const emptyBeginItemTransfer: ItemDragSourceContextValue['beginItemTransfer'] = () => {};

export function useItemDragSource(): ItemDragSourceContextValue {
  return useContext(ItemDragSourceContext) ?? {
    getDragProps: emptyDragProps,
    getUrlDragProps: emptyUrlDragProps,
    beginItemTransfer: emptyBeginItemTransfer,
  };
}

export function useItemDragDrop(): ItemDragDropContextValue {
  const context = useContext(ItemDragDropContext);
  if (!context) {
    return {
      activePayload: null,
      beginItemTransfer: emptyBeginItemTransfer,
      getDragProps: emptyDragProps,
      getUrlDragProps: emptyUrlDragProps,
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
  /** The project currently being worked in; it is the primary drag destination context. */
  currentProjectId?: string | 'all';
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
    beforeItemId: string | null,
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

interface DragSourceRegion {
  left: number;
  right: number;
  viewportWidth: number;
}

export function chooseItemDropTraySide(
  source: DragSourceRegion,
  trayWidth = 480,
  viewportGutter = 18
): 'left' | 'right' {
  const width = Math.min(trayWidth, Math.max(0, source.viewportWidth - (viewportGutter * 2)));
  const overlap = (start: number, end: number) => Math.max(0, Math.min(source.right, end) - Math.max(source.left, start));
  const leftOverlap = overlap(viewportGutter, viewportGutter + width);
  const rightOverlap = overlap(source.viewportWidth - viewportGutter - width, source.viewportWidth - viewportGutter);
  return leftOverlap < rightOverlap ? 'left' : 'right';
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
  currentProjectId = 'all',
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
  const [pendingDestination, setPendingDestination] = useState<ItemDragPayload | null>(null);
  const [destinationProjectId, setDestinationProjectId] = useState<string | 'all' | null>(null);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [recentTargets, setRecentTargets] = useState<ItemDropTarget[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [dropTraySide, setDropTraySide] = useState<'left' | 'right'>('right');

  const clearDrag = useCallback(() => {
    setActivePayload(null);
    setDragOverTargetId(null);
    setReorderOverItemId(null);
  }, []);

  const openDestinationChooser = useCallback((payload: ItemDragPayload, projectId?: string | 'all' | null) => {
    setDestinationQuery('');
    setDestinationProjectId(projectId ?? (currentProjectId !== 'all' ? currentProjectId : 'all'));
    setPendingDestination(payload);
  }, [currentProjectId]);

  const closeDestinationChooser = useCallback(() => {
    setPendingDestination(null);
    setDestinationQuery('');
    setDestinationProjectId(null);
  }, []);

  const getDragProps = useCallback<ItemDragSourceContextValue['getDragProps']>((item, source, selectedItems) => {
    const payload = createItemDragPayload(item, source, selectedItems);
    return itemDragSourceProps(payload, {
      onStart: (nextPayload, sourceElement) => {
        const rect = sourceElement.getBoundingClientRect();
        setDropTraySide(chooseItemDropTraySide({
          left: rect.left,
          right: rect.right,
          viewportWidth: window.innerWidth,
        }));
        setActivePayload(nextPayload);
      },
      onEnd: clearDrag,
    });
  }, [clearDrag]);

  const beginItemTransfer = useCallback<ItemDragSourceContextValue['beginItemTransfer']>((selectedItems, source) => {
    const items = [...new Map(
      selectedItems.filter((item) => item.id).map((item) => [item.id, item] as const)
    ).values()];
    if (!items.length) return;
    openDestinationChooser(createItemDragPayload(items[0], source, items));
  }, [openDestinationChooser]);

  const getUrlDragProps = useCallback<ItemDragSourceContextValue['getUrlDragProps']>((link, source) => {
    const payload = createUrlDragPayload(link, source);
    return itemDragSourceProps(payload, {
      onStart: (nextPayload, sourceElement) => {
        const rect = sourceElement.getBoundingClientRect();
        setDropTraySide(chooseItemDropTraySide({
          left: rect.left,
          right: rect.right,
          viewportWidth: window.innerWidth,
        }));
        setActivePayload(nextPayload);
      },
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
      closeDestinationChooser();
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not transfer item',
      });
    } finally {
      setBusy(false);
    }
  }, [addToast, closeDestinationChooser, onTransfer]);

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
    beforeItemId: string | null,
    target: ItemDropTarget
  ): ItemDropTargetProps => {
    const reorderTargetKey = beforeItemId ?? `end:${target.containerId}`;
    return {
      onDragOver: (event) => {
        const payload = activePayload ?? readItemDragPayload(event.dataTransfer);
        if (
          !payload ||
          payload.entity !== 'item' ||
          itemIdsFromDragPayload(payload).length !== 1 ||
          (beforeItemId != null && payload.itemId === beforeItemId) ||
          payload.source.kind !== 'workspace' ||
          target.kind !== 'workspace' ||
          payload.source.containerId !== target.containerId
        ) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setReorderOverItemId(reorderTargetKey);
      },
      onDragLeave: (event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setReorderOverItemId((current) => current === reorderTargetKey ? null : current);
      },
      onDrop: (event) => {
        const payload = readItemDragPayload(event.dataTransfer) ?? activePayload;
        if (
          !payload ||
          payload.entity !== 'item' ||
          itemIdsFromDragPayload(payload).length !== 1 ||
          (beforeItemId != null && payload.itemId === beforeItemId) ||
          payload.source.kind !== 'workspace' ||
          target.kind !== 'workspace' ||
          payload.source.containerId !== target.containerId
        ) return;
        event.preventDefault();
        event.stopPropagation();
        onReorderWorkspaceItem(payload.itemId, beforeItemId, target);
        clearDrag();
      },
      'data-reorder-over': reorderOverItemId === reorderTargetKey ? 'true' : 'false',
    };
  }, [activePayload, clearDrag, onReorderWorkspaceItem, reorderOverItemId]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );
  const openProjects = useMemo(
    () => [...new Set([
      ...(currentProjectId !== 'all' ? [currentProjectId] : []),
      ...openProjectIds,
    ])]
      .map((projectId) => projectById.get(projectId))
      .filter((project): project is Project => project != null),
    [currentProjectId, openProjectIds, projectById]
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
  const globalTarget = useMemo(
    () => [...visibleTargets.values()].find((target) => target.kind === 'workspace' && target.projectId === 'all'),
    [visibleTargets]
  );
  const quickTargets = useMemo(() => {
    const recent = recentTargets
      .map((target) => visibleTargets.get(itemDropTargetKey(target)))
      .filter((target): target is ItemDropTarget => target != null && target !== globalTarget);
    return globalTarget ? [globalTarget, ...recent] : recent;
  }, [globalTarget, recentTargets, visibleTargets]);
  const currentProjectTarget = currentProjectId === 'all'
    ? undefined
    : projectTargets.find(({ project }) => project.id === currentProjectId);
  const recentProjectTargets = currentProjectTarget
    ? projectTargets.filter(({ project }) => project.id !== currentProjectTarget.project.id)
    : projectTargets;
  const selectedDestinationProject = destinationProjectId === 'all'
    ? null
    : projectTargets.find(({ project }) => project.id === destinationProjectId);
  const destinationSearchResults = useMemo(() => {
    const query = destinationQuery.trim().toLocaleLowerCase();
    if (!query) return [];
    return [...visibleTargets.values()].filter((target) => {
      const projectName = target.projectId === 'all'
        ? 'global'
        : projectById.get(target.projectId ?? '')?.name ?? '';
      return [target.containerLabel, projectName, target.kind]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [destinationQuery, projectById, visibleTargets]);
  useEffect(() => {
    if (!activePayload) setExpandedProjectId(null);
  }, [activePayload]);
  const displayTargetName = (target: ItemDropTarget, compact = false) => {
    if (!compact) return target.containerLabel;
    const labelParts = target.containerLabel.split(' · ');
    return (labelParts[labelParts.length - 1] ?? target.containerLabel).replace(/^.* — /, '');
  };
  const renderTarget = (target: ItemDropTarget, compact = false) => {
    const present = activePayload?.entity === 'item'
      ? isInTarget(activePayload.itemId, target)
      : false;
    const Icon = target.kind === 'workspace' ? Layers3 : Folder;
    return (
      <div key={itemDropTargetKey(target)} className="ui-item-drop-target" {...getDropTargetProps(target)} data-present={present ? 'true' : 'false'}>
        <Icon size={12} />
        <span>{displayTargetName(target, compact)}</span>
        {present ? <small>Already in</small> : null}
      </div>
    );
  };
  const renderProjectTarget = (
    { project, workspaces, collections: projectCollections }: typeof projectTargets[number],
    current = false
  ) => {
    const expanded = current || expandedProjectId === project.id;
    return (
      <div
        key={project.id}
        className="ui-item-drop-project"
        data-current={current ? 'true' : 'false'}
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
          const payload = readItemDragPayload(event.dataTransfer) ?? activePayload;
          clearDrag();
          if (payload) openDestinationChooser(payload, project.id);
        }}
      >
        <div className="ui-item-drop-project__header">
          <Folder size={13} />
          <strong>{project.name}</strong>
          <span className="ui-item-drop-project__meta">
            <small>{workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} · {projectCollections.length} collection{projectCollections.length === 1 ? '' : 's'}</small>
            <small className="ui-item-drop-project__browse-hint">Release to browse</small>
          </span>
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
  };
  const contextValue = useMemo(
    () => ({ activePayload, beginItemTransfer, getDragProps, getUrlDragProps, getDropTargetProps, getProjectCollectionDropTargetProps, getReorderTargetProps }),
    [activePayload, beginItemTransfer, getDragProps, getUrlDragProps, getDropTargetProps, getProjectCollectionDropTargetProps, getReorderTargetProps]
  );
  const sourceContextValue = useMemo(
    () => ({ beginItemTransfer, getDragProps, getUrlDragProps }),
    [beginItemTransfer, getDragProps, getUrlDragProps]
  );
  useEffect(() => {
    if (!pendingChoice && !pendingCollectionChoice && !pendingDestination) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setPendingChoice(null);
        setPendingCollectionChoice(null);
        closeDestinationChooser();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, closeDestinationChooser, pendingChoice, pendingCollectionChoice, pendingDestination]);

  const choosePendingDestination = (target: ItemDropTarget) => {
    if (!pendingDestination) return;
    const payload = pendingDestination;
    const decision = decideItemDrop(payload.source, target);
    if (decision.kind === 'same-container') return;
    closeDestinationChooser();
    if (decision.kind === 'choose') {
      setPendingChoice({ payload, target });
      return;
    }
    void runTransfer(payload, target, 'copy');
  };

  const renderDestinationButton = (target: ItemDropTarget, index?: number, compact = false) => {
    const payloadIds = pendingDestination ? itemIdsFromDragPayload(pendingDestination) : [];
    const presentCount = payloadIds.filter((itemId) => isInTarget(itemId, target)).length;
    const sameSource = pendingDestination?.source.kind === target.kind &&
      pendingDestination.source.containerId === target.containerId;
    const Icon = target.kind === 'workspace' ? Layers3 : Folder;
    return (
      <button
        type="button"
        key={itemDropTargetKey(target)}
        autoFocus={index === 0}
        disabled={busy || sameSource}
        onClick={() => choosePendingDestination(target)}
      >
        <Icon size={14} />
        <span>
          <strong>{displayTargetName(target, compact)}</strong>
          <small>{sameSource
            ? 'Current source'
            : presentCount > 0
              ? `${presentCount} of ${payloadIds.length} already here`
              : target.kind === pendingDestination?.source.kind
                ? 'Choose Copy or Move next'
                : `Copy ${payloadIds.length === 1 ? 'item' : `${payloadIds.length} items`} here`}</small>
        </span>
      </button>
    );
  };

  return (
    <ItemDragSourceContext.Provider value={sourceContextValue}>
    <ItemDragDropContext.Provider value={contextValue}>
      {children}
      {activePayload ? (
        <aside
          className="ui-item-drop-tray"
          data-side={dropTraySide}
          aria-label={`Destinations for ${activePayload.itemLabel}`}
        >
          <div className="ui-item-drop-tray__header">
            <span className="ui-item-drop-tray__drag-icon"><GripVertical size={14} /></span>
            <span>
              <strong>Place “{activePayload.itemLabel}”</strong>
              <small>Drop directly, or release over a project to keep choosing without holding the mouse.</small>
            </span>
          </div>
          <div className="ui-item-drop-tray__groups scrollbar">
            {currentProjectTarget ? (
              <section>
                <h3><Folder size={12} /> Current project</h3>
                <div className="ui-item-drop-tray__projects">
                  {renderProjectTarget(currentProjectTarget, true)}
                </div>
              </section>
            ) : null}
            {quickTargets.length > 0 ? (
              <section>
                <h3><Layers3 size={12} /> Quick destinations</h3>
                <div className="ui-item-drop-tray__targets">
                  {quickTargets.map((target) => renderTarget(target))}
                </div>
              </section>
            ) : null}
            <section>
              <h3><Folder size={12} /> {currentProjectTarget ? 'Recent open projects' : 'Open projects'}</h3>
              <div className="ui-item-drop-tray__projects">
                {recentProjectTargets.map((projectTarget) => renderProjectTarget(projectTarget))}
                {recentProjectTargets.length === 0 ? (
                  <div className="ui-item-drop-tray__empty">Open a project from Home to file into its collections or workspaces.</div>
                ) : null}
              </div>
            </section>
          </div>
        </aside>
      ) : null}

      {pendingDestination ? (
        <div className="ui-item-transfer-dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy) closeDestinationChooser(); }}>
          <section className="ui-item-transfer-dialog ui-item-transfer-dialog--destinations" role="dialog" aria-modal="true" aria-labelledby="item-destination-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="ui-item-transfer-dialog__close" type="button" onClick={closeDestinationChooser} disabled={busy} aria-label="Cancel destination choice"><X size={14} /></button>
            <h2 id="item-destination-title">Organize {itemIdsFromDragPayload(pendingDestination).length} {itemIdsFromDragPayload(pendingDestination).length === 1 ? 'item' : 'items'}</h2>
            <p>Choose a workspace or collection. Selecting a project only browses its destinations and never changes the page behind this window.</p>
            <label className="ui-bulk-transfer-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={destinationQuery}
                onChange={(event) => setDestinationQuery(event.target.value)}
                placeholder="Find a project, workspace, or collection…"
                aria-label="Find a transfer destination"
              />
              {destinationQuery ? (
                <button type="button" onClick={() => setDestinationQuery('')} aria-label="Clear destination search"><X size={13} /></button>
              ) : null}
            </label>
            <div
              className="ui-bulk-transfer-browser"
              data-project-open={destinationProjectId != null ? 'true' : 'false'}
              data-searching={destinationQuery.trim() ? 'true' : 'false'}
            >
              <aside className="ui-bulk-transfer-browser__rail scrollbar" aria-label="Destination projects">
                {quickTargets.length > 0 ? (
                  <section className="ui-bulk-transfer-browser__quick">
                    <h3>Quick access</h3>
                    <div className="ui-item-transfer-dialog__actions">
                      {quickTargets.map((target, index) => renderDestinationButton(target, index))}
                    </div>
                  </section>
                ) : null}
                <section>
                  <h3>Available locations</h3>
                  <div className="ui-bulk-transfer-project-list">
                    {globalTarget ? (
                      <button
                        type="button"
                        data-selected={destinationProjectId === 'all' ? 'true' : 'false'}
                        aria-pressed={destinationProjectId === 'all'}
                        onClick={() => { setDestinationProjectId('all'); setDestinationQuery(''); }}
                      >
                        <Layers3 size={14} />
                        <span><strong>Global</strong><small>Global workspace</small></span>
                      </button>
                    ) : null}
                    {projectTargets.map(({ project, workspaces, collections: projectCollections }) => (
                      <button
                        type="button"
                        key={project.id}
                        data-project-select-id={project.id}
                        data-current={project.id === currentProjectId ? 'true' : 'false'}
                        data-selected={destinationProjectId === project.id ? 'true' : 'false'}
                        aria-pressed={destinationProjectId === project.id}
                        onClick={() => { setDestinationProjectId(project.id); setDestinationQuery(''); }}
                      >
                        <Folder size={14} />
                        <span>
                          <strong>{project.name}</strong>
                          <small>{workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} · {projectCollections.length} collection{projectCollections.length === 1 ? '' : 's'}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </aside>

              <main className="ui-bulk-transfer-browser__panel scrollbar" aria-label="Available workspaces and collections">
                <button
                  className="ui-bulk-transfer-browser__back"
                  type="button"
                  onClick={() => { setDestinationProjectId(null); setDestinationQuery(''); }}
                >
                  <ArrowLeft size={14} /> Projects and quick access
                </button>
                {destinationQuery.trim() ? (
                  <section className="ui-bulk-transfer-results">
                    <div className="ui-bulk-transfer-panel-heading">
                      <span><Search size={13} /> Matching destinations</span>
                      <small>{destinationSearchResults.length} result{destinationSearchResults.length === 1 ? '' : 's'}</small>
                    </div>
                    {destinationSearchResults.length > 0 ? (
                      <div className="ui-item-transfer-dialog__actions">
                        {destinationSearchResults.map((target) => renderDestinationButton(target))}
                      </div>
                    ) : (
                      <div className="ui-item-drop-tray__empty">No open-project destination matches “{destinationQuery.trim()}”.</div>
                    )}
                  </section>
                ) : destinationProjectId === 'all' && globalTarget ? (
                  <section data-project-id="all">
                    <div className="ui-bulk-transfer-panel-heading">
                      <span><Layers3 size={13} /> Global</span>
                      <small>Available from every project</small>
                    </div>
                    <div className="ui-item-transfer-dialog__actions">
                      {renderDestinationButton(globalTarget, undefined, true)}
                    </div>
                  </section>
                ) : selectedDestinationProject ? (
                  <section data-project-id={selectedDestinationProject.project.id}>
                    <div className="ui-bulk-transfer-panel-heading">
                      <span><Folder size={13} /> {selectedDestinationProject.project.name}</span>
                      <small>{selectedDestinationProject.project.id === currentProjectId ? 'Current project' : 'Open project'}</small>
                    </div>
                    {selectedDestinationProject.workspaces.length > 0 ? (
                      <div className="ui-bulk-transfer-project__group">
                        <h4><Layers3 size={11} /> Workspaces</h4>
                        <div className="ui-item-transfer-dialog__actions">
                          {selectedDestinationProject.workspaces.map((target) => renderDestinationButton(target, undefined, true))}
                        </div>
                      </div>
                    ) : null}
                    {selectedDestinationProject.collections.length > 0 ? (
                      <div className="ui-bulk-transfer-project__group">
                        <h4><Folder size={11} /> Collections</h4>
                        <div className="ui-item-transfer-dialog__actions">
                          {selectedDestinationProject.collections.map((target) => renderDestinationButton(target, undefined, true))}
                        </div>
                      </div>
                    ) : null}
                    {selectedDestinationProject.workspaces.length === 0 && selectedDestinationProject.collections.length === 0 ? (
                      <div className="ui-item-drop-tray__empty">No available destinations in this project.</div>
                    ) : null}
                  </section>
                ) : (
                  <div className="ui-bulk-transfer-browser__empty">
                    <Folder size={22} />
                    <strong>Choose an open project</strong>
                    <small>Its workspaces and collections will appear here.</small>
                  </div>
                )}
              </main>
            </div>
          </section>
        </div>
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
                const present = pendingCollectionChoice.payload.entity === 'item' &&
                  isInTarget(pendingCollectionChoice.payload.itemId, collection);
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
            <h2 id="item-transfer-title">Copy or move {itemIdsFromDragPayload(pendingChoice.payload).length === 1 ? 'this item' : `${itemIdsFromDragPayload(pendingChoice.payload).length} items`}?</h2>
            <p>
              “{pendingChoice.payload.itemLabel}” is currently in <strong>{pendingChoice.payload.source.kind === 'reference' ? 'this result list' : pendingChoice.payload.source.containerLabel}</strong>.
            </p>
            <div className="ui-item-transfer-dialog__actions">
              <button type="button" autoFocus disabled={busy} onClick={() => void runTransfer(pendingChoice.payload, pendingChoice.target, 'copy')}>
                <Copy size={14} />
                <span><strong>Copy to {pendingChoice.target.containerLabel}</strong><small>Keep {itemIdsFromDragPayload(pendingChoice.payload).length === 1 ? 'it' : 'them'} in the source too</small></span>
              </button>
              <button type="button" disabled={busy} onClick={() => void runTransfer(pendingChoice.payload, pendingChoice.target, 'move')}>
                <MoveRight size={14} />
                <span><strong>Move to {pendingChoice.target.containerLabel}</strong><small>Add {itemIdsFromDragPayload(pendingChoice.payload).length === 1 ? 'it' : 'them'} here, then remove {itemIdsFromDragPayload(pendingChoice.payload).length === 1 ? 'it' : 'them'} from the source</small></span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </ItemDragDropContext.Provider>
    </ItemDragSourceContext.Provider>
  );
};
