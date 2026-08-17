import React, { useMemo, useState } from 'react';
import type { Item } from '../../lib/db';
import { getDomain, isValidBookmarkUrl, formatDateTime } from '../../lib/utils';
import { ExternalLink, Search, X } from 'lucide-react';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import { ItemContextMenu } from './ItemContextMenu';
import { TabScrollShell } from './TabScrollShell';
import { uiPatterns } from '../../styles/uiPatterns';
import { buildItemQuickFilterText, matchesQuickFilter } from '../../lib/itemQuickFilter';
import { useItemDragDrop } from './ItemDragDropProvider';

interface QuickAccessItemListProps {
  title: string;
  icon: React.ReactNode;
  items: Item[];
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyHint: string;
  onItemClick?: (item: Item) => void;
  headerExtra?: React.ReactNode;
  /** Shown under the title row (e.g. Trash page guidance). */
  headerSubtitle?: string;
  renderRowActions?: (item: Item) => React.ReactNode;
  dateField?: (item: Item) => number;
  dateLabel?: string;
  showQuickAccessMarkers?: boolean;
  onItemEdit?: (item: Item) => void;
  onItemDelete?: (item: Item) => void;
  onOpenInNewTab?: (item: Item) => void;
  allowItemDrag?: boolean;
}

export const QuickAccessItemList: React.FC<QuickAccessItemListProps> = ({
  title,
  icon,
  items,
  emptyIcon,
  emptyTitle,
  emptyHint,
  onItemClick,
  headerExtra,
  headerSubtitle,
  renderRowActions,
  dateField,
  dateLabel = 'Updated',
  showQuickAccessMarkers = false,
  onItemEdit,
  onItemDelete,
  onOpenInNewTab,
  allowItemDrag = true,
}) => {
  const { getDragProps } = useItemDragDrop();
  const [contextMenu, setContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const itemSearchIndex = useMemo(
    () => items.map((item) => ({ item, searchText: buildItemQuickFilterText(item) })),
    [items]
  );
  const filteredItems = filterQuery.trim()
    ? itemSearchIndex.filter(({ searchText }) => matchesQuickFilter(searchText, filterQuery)).map(({ item }) => item)
    : items;

  return (
    <div
      className="ui-panel ui-quick-access-list"
      style={{
        ...uiPatterns.panel,
        height: '100%',
        color: 'var(--text)',
      }}
    >
      {contextMenu && (
        <ItemContextMenu
          item={contextMenu.item}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={onItemEdit}
          onDelete={onItemDelete}
          onOpenInNewTab={onOpenInNewTab}
        />
      )}

      <div
        className="ui-quick-access-list__header"
        style={{
          ...uiPatterns.panelHeader,
          flexShrink: 0,
          alignItems: 'stretch',
          flexDirection: 'column',
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {icon}
            <h2 style={{ ...uiPatterns.pageTitle, fontSize: 'var(--text-lg)' }}>{title}</h2>
          </div>
          {headerExtra}
        </div>
        {headerSubtitle ? (
          <p
            style={{
              margin: '0.65rem 0 0',
              fontSize: 'var(--text-sm)',
              lineHeight: 1.55,
              color: 'var(--text-muted)',
              maxWidth: 720,
            }}
          >
            {headerSubtitle}
          </p>
        ) : null}
        <label className="ui-list-quick-filter ui-quick-access-list__quick-filter">
          <Search size={12} aria-hidden="true" />
          <input type="search" value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Filter this list…" aria-label={`Filter ${title}`} title="Matches title, URL, notes, tags, organization IDs, and metadata" />
          {filterQuery ? <button type="button" onClick={() => setFilterQuery('')} aria-label={`Clear ${title} filter`} title="Clear filter"><X size={11} /></button> : null}
        </label>
      </div>

      <TabScrollShell className="scrollbar ui-quick-access-list__body" style={{ padding: 10 }}>
        {filteredItems.length === 0 ? (
          <div
            className="ui-quick-access-list__empty"
            style={{
              ...uiPatterns.emptyState,
              minHeight: 220,
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {items.length === 0 ? emptyIcon : <Search size={20} />}
            <p style={{ margin: '0 0 0.5rem 0', fontSize: 'var(--text-lg)', fontWeight: 650, color: 'var(--text)' }}>
              {items.length === 0 ? emptyTitle : 'No matching items'}
            </p>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)' }}>{items.length === 0 ? emptyHint : `Nothing in this list matches “${filterQuery.trim()}”.`}</p>
          </div>
        ) : (
          <div className="ui-quick-access-list__items">
            {filteredItems.map((item) => {
              const dateTs = dateField ? dateField(item) : (item.updated_at ?? item.created_at);
              const interactive = Boolean(onItemClick);
              return (
                <div
                  key={item.id}
                  {...(allowItemDrag ? getDragProps(item, { kind: 'reference', label: title }) : {})}
                  data-item-drag-source={allowItemDrag ? 'true' : undefined}
                  className="ui-quick-access-list__row"
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  data-interactive={interactive ? 'true' : 'false'}
                  onClick={() => onItemClick?.(item)}
                  onKeyDown={(event) => {
                    if (!interactive || event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onItemClick?.(item);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ item, x: e.clientX, y: e.clientY });
                  }}
                  style={{
                    cursor: interactive ? 'pointer' : 'default',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--text)',
                          marginBottom: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {showQuickAccessMarkers && <ItemQuickAccessMarkers item={item} size={12} />}
                        <span className="ui-quick-access-list__title">
                          {item.title || 'Untitled'}
                        </span>
                      </div>
                      {item.url && isValidBookmarkUrl(item.url) && (
                        <div
                          style={{
                            fontSize: 'var(--text-sm)',
                            color: 'var(--text-muted)',
                            marginBottom: '0.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <ExternalLink size={12} />
                          {getDomain(item.url)}
                        </div>
                      )}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: '0.5rem' }}>
                        {dateLabel}: {formatDateTime(dateTs)}
                      </div>
                    </div>
                    {renderRowActions ? (
                      <div
                        className="ui-quick-access-list__actions"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {renderRowActions(item)}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabScrollShell>
    </div>
  );
};
