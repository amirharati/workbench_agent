import React, { useEffect, useMemo, useState } from 'react';
import { Grid2X2, GripVertical, List, Search, X } from 'lucide-react';
import { uiPatterns } from '../../styles/uiPatterns';
import { buildQuickFilterText, matchesQuickFilter } from '../../lib/itemQuickFilter';
import { useItemDragDrop } from './ItemDragDropProvider';
import type { ItemDragSource, ItemDropTarget, ProjectCollectionDropTarget } from './itemDragDrop';

export type ContentBrowseMode = 'list' | 'gallery';

export interface ContentBrowseEntry {
  id: string;
  title: string;
  icon: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Hidden searchable data such as notes, tags, organization names, and metadata. */
  searchText?: string;
  onContextMenu?: (event: React.MouseEvent) => void;
  /** Omit for non-item rows. Result lists use `reference`; containers identify the exact membership. */
  dragSource?: ItemDragSource;
  dragItem?: { id: string; title?: string; url?: string };
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
}

function readableNodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(readableNodeText).join(' ');
  return '';
}

const ContentBrowserEntryRow = React.memo(function ContentBrowserEntryRow({
  entry,
  selected,
  onSelect,
  selectedEntryRef,
}: {
  entry: ContentBrowseEntry;
  selected: boolean;
  onSelect: (id: string) => void;
  selectedEntryRef?: React.RefObject<HTMLDivElement>;
}) {
  const { getDragProps, getReorderTargetProps } = useItemDragDrop();
  const dragItem = entry.dragItem ?? { id: entry.id, title: entry.title };
  const dragProps = entry.dragSource
    ? getDragProps(dragItem, entry.dragSource)
    : {};
  const reorderProps = entry.reorderTarget
    ? getReorderTargetProps(dragItem.id, entry.reorderTarget)
    : {};
  return (
    <div
      ref={selectedEntryRef}
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      data-content-entry
      data-selected={selected ? 'true' : 'false'}
      data-item-drag-source={entry.dragSource ? 'true' : undefined}
      {...dragProps}
      {...reorderProps}
      onClick={() => onSelect(entry.id)}
      onContextMenu={entry.onContextMenu}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(entry.id);
        }
      }}
      className="ui-content-browser__entry"
    >
      {entry.dragSource ? <span className="ui-content-browser__drag-handle" aria-hidden="true"><GripVertical size={12} /></span> : null}
      <span className="ui-content-browser__leading" data-content-leading="true">{entry.icon}</span>
      <span className="ui-content-browser__copy">
        <span className="ui-content-browser__entry-title" title={entry.title || 'Untitled'}>{entry.title || 'Untitled'}</span>
        {entry.subtitle && <span className="ui-content-browser__subtitle">{entry.subtitle}</span>}
      </span>
      {(entry.meta || entry.actions) && (
        <span className="ui-content-browser__footer">
          {entry.meta && <span className="ui-content-browser__meta">{entry.meta}</span>}
          {entry.actions && (
            <span
              className="ui-content-browser__actions"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {entry.actions}
            </span>
          )}
        </span>
      )}
    </div>
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
}) => {
  const { getDropTargetProps, getProjectCollectionDropTargetProps } = useItemDragDrop();
  const [filterQuery, setFilterQuery] = useState('');
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
  const firstEntryId = filteredEntries[0]?.id;
  const lastEntryId = filteredEntries[filteredEntries.length - 1]?.id;

  useEffect(() => {
    setRenderLimit(60);
  }, [mode, filteredEntries.length, firstEntryId, lastEntryId, filterQuery]);

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

  useEffect(() => {
    if (!selectedId || !selectedEntryRef.current) return;
    selectedEntryRef.current.scrollIntoView({ block: 'nearest' });
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
        />
      ))}
      {renderedEntries.length < filteredEntries.length ? (
        <div className="ui-content-browser__loading" role="status">
          Loading more… {renderedEntries.length} of {filteredEntries.length}
        </div>
      ) : null}
    </div>
  </section>
  );
};

const panelStyle = uiPatterns.panel;
const headerStyle: React.CSSProperties = uiPatterns.panelHeader;
