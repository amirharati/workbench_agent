import React, { useEffect, useMemo, useState } from 'react';
import { Eye, FileText, Grid2X2, GripVertical, List, Search, X } from 'lucide-react';
import { uiPatterns } from '../../styles/uiPatterns';
import { buildQuickFilterText, matchesQuickFilter } from '../../lib/itemQuickFilter';
import { useItemDragDrop } from './ItemDragDropProvider';
import type { ItemDragSource, ItemDropTarget, ProjectCollectionDropTarget } from './itemDragDrop';
import { useItemPeek } from './ItemPeekProvider';
import { ItemResultRow } from './ItemResultRow';
import { LinkVisual } from './LinkVisual';

export type ContentBrowseMode = 'list' | 'gallery';

export interface ContentBrowseEntry {
  id: string;
  title: string;
  icon: React.ReactNode;
  /** Rendered only in Gallery view; e.g. a fetched social-card image. */
  preview?: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Hidden searchable data such as notes, tags, organization names, and metadata. */
  searchText?: string;
  onContextMenu?: (event: React.MouseEvent) => void;
  /** Omit for non-item rows. Result lists use `reference`; containers identify the exact membership. */
  dragSource?: ItemDragSource;
  dragItem?: {
    id: string;
    title?: string;
    url?: string;
    favicon?: string;
    metadata?: Record<string, unknown>;
  };
  /** Raw browser/snapshot URL; it becomes a library item only when dropped. */
  dragUrl?: string;
  reorderTarget?: ItemDropTarget;
}

interface ContentBrowserProps {
  title: string;
  entries: ContentBrowseEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  mode: ContentBrowseMode;
  onModeChange: (mode: ContentBrowseMode) => void;
  emptyMessage: string;
  ariaLabel?: string;
  headerActions?: React.ReactNode;
  /** Disable only when the surrounding page already provides an equivalent list filter. */
  quickFilter?: boolean;
  /** Makes the visible browser itself a destination in addition to the global tray. */
  dropTarget?: ItemDropTarget;
  /** Resolves a project aggregate drop to one of the project's real collections. */
  projectCollectionDropTarget?: ProjectCollectionDropTarget;
  /** Shared batch selection and transfer. Disable only for administrative/non-item lists. */
  multiSelect?: boolean;
}

function readableNodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(readableNodeText).join(' ');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return readableNodeText(node.props.children);
  }
  return '';
}

function isUrlText(value: string): boolean {
  return /^(?:https?|file|chrome|chrome-extension):\/\//i.test(value.trim());
}

function dragSourceKey(source: ItemDragSource): string {
  return source.kind === 'reference'
    ? `reference:${source.label ?? ''}`
    : `${source.kind}:${source.containerId}:${source.projectId ?? ''}`;
}

const ContentBrowserEntryRow = React.memo(function ContentBrowserEntryRow({
  entry,
  selected,
  onSelect,
  selectedEntryRef,
  previewItemIds,
  showPreview,
  selectionEnabled,
  checked,
  onToggle,
  selectedDragItems,
  selectedDragSource,
}: {
  entry: ContentBrowseEntry;
  selected: boolean;
  onSelect: (id: string) => void;
  selectedEntryRef?: React.RefObject<HTMLDivElement>;
  previewItemIds: readonly string[];
  showPreview: boolean;
  selectionEnabled: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  selectedDragItems: readonly { id: string; title?: string; url?: string }[];
  selectedDragSource?: ItemDragSource;
}) {
  const { getDragProps, getUrlDragProps, getReorderTargetProps } = useItemDragDrop();
  const { openPeek } = useItemPeek();
  const dragItem = entry.dragItem ?? { id: entry.id, title: entry.title };
  const effectiveDragSource = checked && selectedDragItems.length > 1
    ? selectedDragSource ?? entry.dragSource
    : entry.dragSource;
  const dragProps = effectiveDragSource
    ? entry.dragUrl
      ? getUrlDragProps({ url: entry.dragUrl, title: entry.title }, effectiveDragSource)
      : getDragProps(dragItem, effectiveDragSource, checked ? selectedDragItems : undefined)
    : null;
  const reorderProps = entry.reorderTarget
    ? getReorderTargetProps(dragItem.id, entry.reorderTarget)
    : {};
  const subtitleText = readableNodeText(entry.subtitle).trim();
  const subtitleIsUrl = isUrlText(subtitleText);
  const previewUrl = dragItem.url || entry.dragUrl || (subtitleIsUrl ? subtitleText : undefined);
  const previewImage = typeof dragItem.metadata?.previewImage === 'string'
    ? dragItem.metadata.previewImage
    : undefined;
  const galleryPreview = entry.preview ?? (previewUrl ? (
    <LinkVisual
      url={previewUrl}
      title={entry.title}
      favicon={dragItem.favicon}
      previewImage={previewImage}
      variant="thumbnail"
    />
  ) : (
    <span className="ui-content-browser__preview-note"><FileText size={24} /></span>
  ));
  return (
    <ItemResultRow
      ref={selectedEntryRef}
      item={dragItem}
      dragSource={effectiveDragSource}
      dragItems={checked ? selectedDragItems : undefined}
      dragUrl={entry.dragUrl}
      selected={selected}
      onSelectItem={() => onSelect(entry.id)}
      aria-current={selected ? 'true' : undefined}
      data-content-entry
      data-selection-mode={selectionEnabled && entry.dragSource && !entry.dragUrl ? 'true' : undefined}
      data-bulk-selected={checked ? 'true' : undefined}
      {...reorderProps}
      onDoubleClick={(event) => {
        if (!entry.dragSource || entry.dragUrl || (event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        openPeek(dragItem.id, {
          itemIds: previewItemIds,
          sourceLabel: entry.dragSource.kind === 'reference'
            ? entry.dragSource.label
            : entry.dragSource.containerLabel,
        });
      }}
      onContextMenu={entry.onContextMenu}
      className="ui-content-browser__entry"
      data-has-preview={showPreview ? 'true' : undefined}
    >
      {selectionEnabled && entry.dragSource && !entry.dragUrl ? (
        <input
          className="ui-content-browser__selection-checkbox"
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(entry.id)}
          aria-label={`Select ${entry.title || 'item'}`}
        />
      ) : null}
      {showPreview ? <span className="ui-content-browser__preview">{galleryPreview}</span> : null}
      <span className="ui-content-browser__leading" data-content-leading="true">{entry.icon}</span>
      <span className="ui-content-browser__copy">
        <span className="ui-content-browser__entry-title" title={entry.title || 'Untitled'}>{entry.title || 'Untitled'}</span>
        {entry.subtitle && (
          <span
            className="ui-content-browser__subtitle"
            data-url={subtitleIsUrl ? 'true' : undefined}
            title={subtitleIsUrl ? subtitleText : undefined}
          >
            {entry.subtitle}
          </span>
        )}
      </span>
      {entry.meta && (
        <span className="ui-content-browser__footer">
          <span className="ui-content-browser__meta">{entry.meta}</span>
        </span>
      )}
      {(entry.dragSource || entry.actions) && (
        <span
          className="ui-content-browser__controls"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {entry.dragSource ? (
            <span
              className="ui-content-browser__drag-grip"
              draggable={dragProps?.draggable}
              onDragStart={(event) => {
                if (!dragProps) return;
                event.stopPropagation();
                dragProps.onDragStart?.(event);
              }}
              onDragEnd={(event) => {
                if (!dragProps) return;
                event.stopPropagation();
                dragProps.onDragEnd?.(event);
              }}
              title="Drag to a workspace or collection"
              aria-label={`Drag ${entry.title || 'item'} to a workspace or collection`}
            >
              <GripVertical size={14} aria-hidden="true" />
            </span>
          ) : null}
          {entry.dragSource && !entry.dragUrl ? (
            <button
              type="button"
              className="ui-content-browser__peek"
              onClick={() => {
                openPeek(dragItem.id, {
                  itemIds: previewItemIds,
                  sourceLabel: entry.dragSource?.kind === 'reference'
                    ? entry.dragSource.label
                    : entry.dragSource?.containerLabel,
                });
              }}
              title="Preview without leaving this view"
              aria-label={`Preview ${entry.title || 'item'}`}
            >
              <Eye size={12} />
            </button>
          ) : null}
          {entry.actions ? (
            <span
              className="ui-content-browser__actions"
            >
              {entry.actions}
            </span>
          ) : null}
        </span>
      )}
    </ItemResultRow>
  );
});

export function useContentBrowseMode(storageKey: string): [ContentBrowseMode, (mode: ContentBrowseMode) => void] {
  const [mode, setMode] = useState<ContentBrowseMode>(() => {
    if (typeof window === 'undefined') return 'list';
    return window.localStorage.getItem(storageKey) === 'gallery' ? 'gallery' : 'list';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, mode);
  }, [mode, storageKey]);

  return [mode, setMode];
}

export const ContentBrowser: React.FC<ContentBrowserProps> = ({
  title,
  entries,
  selectedId,
  onSelect,
  mode,
  onModeChange,
  emptyMessage,
  ariaLabel,
  headerActions,
  quickFilter = true,
  dropTarget,
  projectCollectionDropTarget,
  multiSelect = true,
}) => {
  const { activePayload, beginItemTransfer, getDropTargetProps, getProjectCollectionDropTargetProps, getReorderTargetProps } = useItemDragDrop();
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [renderLimit, setRenderLimit] = useState(60);
  const selectedEntryRef = React.useRef<HTMLDivElement>(null);
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectEntry = React.useCallback((id: string) => onSelectRef.current(id), []);
  const searchableEntries = useMemo(
    () => entries.map((entry) => ({
      entry,
      searchText: buildQuickFilterText(
        entry.title,
        readableNodeText(entry.subtitle),
        readableNodeText(entry.meta),
        entry.searchText
      ),
    })),
    [entries]
  );
  const filteredEntries = useMemo(
    () => quickFilter && filterQuery.trim()
      ? searchableEntries
          .filter(({ searchText }) => matchesQuickFilter(searchText, filterQuery))
          .map(({ entry }) => entry)
      : entries,
    [entries, filterQuery, quickFilter, searchableEntries]
  );
  const selectableEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.dragSource && !entry.dragUrl),
    [filteredEntries]
  );
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedEntryIds.has(entry.id) && entry.dragSource && !entry.dragUrl),
    [entries, selectedEntryIds]
  );
  const selectedDragItems = useMemo(
    () => [...new Map(selectedEntries.map((entry) => {
      const item = entry.dragItem ?? { id: entry.id, title: entry.title };
      return [item.id, item] as const;
    })).values()],
    [selectedEntries]
  );
  const selectedDragSource = useMemo<ItemDragSource | undefined>(() => {
    const sources = selectedEntries
      .map((entry) => entry.dragSource)
      .filter((source): source is ItemDragSource => source != null);
    if (!sources.length) return undefined;
    const first = sources[0];
    return sources.every((source) => dragSourceKey(source) === dragSourceKey(first))
      ? first
      : { kind: 'reference', label: title };
  }, [selectedEntries, title]);
  const allFilteredSelected = selectableEntries.length > 0 &&
    selectableEntries.every((entry) => selectedEntryIds.has(entry.id));
  const firstEntryId = filteredEntries[0]?.id;
  const lastEntryId = filteredEntries[filteredEntries.length - 1]?.id;

  useEffect(() => {
    setRenderLimit(60);
  }, [mode, filteredEntries.length, firstEntryId, lastEntryId, filterQuery]);

  useEffect(() => {
    const available = new Set(entries.map((entry) => entry.id));
    setSelectedEntryIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [entries]);

  const toggleSelection = React.useCallback((entryId: string) => {
    setSelectedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }, []);

  const selectAllFiltered = () => {
    setSelectedEntryIds((current) => {
      const next = new Set(current);
      selectableEntries.forEach((entry) => next.add(entry.id));
      return next;
    });
  };

  useEffect(() => {
    if (renderLimit >= filteredEntries.length || typeof window === 'undefined') return;
    const revealMore = () => setRenderLimit((current) => Math.min(filteredEntries.length, current + 100));
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(revealMore, { timeout: 120 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(revealMore, 16);
    return () => window.clearTimeout(id);
  }, [filteredEntries.length, renderLimit]);

  const renderedEntries = filteredEntries.slice(0, renderLimit);
  const endReorderTarget = [...renderedEntries].reverse().find((entry) => entry.reorderTarget)?.reorderTarget;
  const showEndReorderTarget = !!endReorderTarget &&
    activePayload?.entity === 'item' &&
    (activePayload.itemIds?.length ?? 1) === 1 &&
    activePayload.source.kind === 'workspace' &&
    activePayload.source.containerId === endReorderTarget.containerId;
  const previewItemIds = useMemo(
    () => filteredEntries.filter((entry) => entry.dragSource && !entry.dragUrl).map((entry) => (entry.dragItem ?? { id: entry.id }).id),
    [filteredEntries]
  );

  useEffect(() => {
    if (!selectedId || !selectedEntryRef.current) return;
    selectedEntryRef.current.scrollIntoView?.({ block: 'nearest' });
  }, [filterQuery, renderedEntries.length, selectedId]);

  return (
  <section
    className={`ui-panel ui-content-browser${dropTarget || projectCollectionDropTarget ? ' ui-item-inline-drop-target' : ''}`}
    style={panelStyle}
    aria-label={ariaLabel ?? title}
    {...(dropTarget
      ? getDropTargetProps(dropTarget)
      : projectCollectionDropTarget
        ? getProjectCollectionDropTargetProps(projectCollectionDropTarget)
        : {})}
  >
    <div className="ui-content-browser__header" style={headerStyle}>
      <div className="ui-content-browser__heading">
        <strong className="ui-content-browser__title">{title}</strong>
        <span className="ui-content-browser__count">
          {filterQuery.trim() && quickFilter
            ? `${filteredEntries.length.toLocaleString()} of ${entries.length.toLocaleString()}`
            : `${entries.length.toLocaleString()} item${entries.length !== 1 ? 's' : ''}`}
        </span>
      </div>
      {quickFilter ? (
        <label className="ui-list-quick-filter ui-content-browser__quick-filter">
          <Search size={12} aria-hidden="true" />
          <input
            type="search"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
            placeholder="Filter this list…"
            aria-label={`Filter ${title}`}
            title="Matches title, URL, notes, tags, organization, and metadata"
          />
          {filterQuery ? (
            <button type="button" onClick={() => setFilterQuery('')} aria-label={`Clear ${title} filter`} title="Clear filter">
              <X size={11} />
            </button>
          ) : null}
        </label>
      ) : null}
      <div className="ui-content-browser__header-actions">
        {headerActions}
        <div className="ui-content-browser__view-toggle" role="group" aria-label={`${title} view`}>
          <button className="ui-content-browser__view-button" type="button" aria-label="List view" aria-pressed={mode === 'list'} title="List view" onClick={() => onModeChange('list')}><List size={13} /></button>
          <button className="ui-content-browser__view-button" type="button" aria-label="Gallery view" aria-pressed={mode === 'gallery'} title="Gallery view" onClick={() => onModeChange('gallery')}><Grid2X2 size={13} /></button>
        </div>
      </div>
    </div>
    {multiSelect && entries.some((entry) => entry.dragSource && !entry.dragUrl) ? (
      <div className="ui-content-browser__selection-bar" role="toolbar" aria-label={`${title} selection`}>
        <strong>{selectedDragItems.length} selected</strong>
        <span>{filterQuery.trim() ? `${selectableEntries.length} filtered items` : `${selectableEntries.length} available`}</span>
        <button className="ui-button ui-button--secondary ui-button--compact" type="button" disabled={!selectableEntries.length || allFilteredSelected} onClick={selectAllFiltered}>
          {filterQuery.trim() ? 'Select all filtered' : 'Select all'}
        </button>
        <button className="ui-button ui-button--secondary ui-button--compact" type="button" disabled={!selectedDragItems.length} onClick={() => setSelectedEntryIds(new Set())}>Clear</button>
        <button
          className="ui-button ui-button--primary ui-button--compact"
          type="button"
          disabled={!selectedDragItems.length || !selectedDragSource}
          onClick={() => selectedDragSource && beginItemTransfer(selectedDragItems, selectedDragSource)}
        >
          Organize selected…
        </button>
      </div>
    ) : null}
    <div className="scrollbar ui-content-browser__body" data-content-view={mode}>
      {filteredEntries.length === 0 ? (
        <div className="ui-content-browser__empty">{entries.length === 0 ? emptyMessage : `No items match “${filterQuery.trim()}”.`}</div>
      ) : renderedEntries.map((entry) => (
        <ContentBrowserEntryRow
          key={entry.id}
          entry={entry}
          selected={entry.id === selectedId}
          onSelect={selectEntry}
          selectedEntryRef={entry.id === selectedId ? selectedEntryRef : undefined}
          previewItemIds={previewItemIds}
          showPreview={mode === 'gallery'}
          selectionEnabled={multiSelect}
          checked={selectedEntryIds.has(entry.id)}
          onToggle={toggleSelection}
          selectedDragItems={selectedDragItems}
          selectedDragSource={selectedDragSource}
        />
      ))}
      {renderedEntries.length < filteredEntries.length ? (
        <div className="ui-content-browser__loading" role="status">
          Loading more… {renderedEntries.length} of {filteredEntries.length}
        </div>
      ) : null}
      {showEndReorderTarget && endReorderTarget ? (
        <div
          className="ui-content-browser__reorder-end"
          aria-label="Move to end of list"
          {...getReorderTargetProps(null, endReorderTarget)}
        >
          Drop at end
        </div>
      ) : null}
    </div>
  </section>
  );
};

const panelStyle = uiPatterns.panel;
const headerStyle: React.CSSProperties = uiPatterns.panelHeader;
