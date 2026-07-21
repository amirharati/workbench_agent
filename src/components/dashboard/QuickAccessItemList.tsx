import React, { useState } from 'react';
import type { Item } from '../../lib/db';
import { getDomain, isValidBookmarkUrl, formatDateTime } from '../../lib/utils';
import { ExternalLink } from 'lucide-react';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import { ItemContextMenu } from './ItemContextMenu';
import { TabScrollShell } from './TabScrollShell';
import { uiPatterns } from '../../styles/uiPatterns';

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
}) => {
  const [contextMenu, setContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);

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
      </div>

      <TabScrollShell className="scrollbar ui-quick-access-list__body" style={{ padding: 10 }}>
        {items.length === 0 ? (
          <div
            className="ui-quick-access-list__empty"
            style={{
              ...uiPatterns.emptyState,
              minHeight: 220,
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {emptyIcon}
            <p style={{ margin: '0 0 0.5rem 0', fontSize: 'var(--text-lg)', fontWeight: 650, color: 'var(--text)' }}>
              {emptyTitle}
            </p>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)' }}>{emptyHint}</p>
          </div>
        ) : (
          <div className="ui-quick-access-list__items">
            {items.map((item) => {
              const dateTs = dateField ? dateField(item) : (item.updated_at ?? item.created_at);
              const interactive = Boolean(onItemClick);
              return (
                <div
                  key={item.id}
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
