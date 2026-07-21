import React, { useState } from 'react';
import type { Item } from '../../lib/db';
import { getDomain, isValidBookmarkUrl, formatDateTime } from '../../lib/utils';
import { ExternalLink } from 'lucide-react';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import { ItemContextMenu } from './ItemContextMenu';
import { TabScrollShell } from './TabScrollShell';

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
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        color: 'var(--text)',
        background: 'var(--bg-panel)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
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
        style={{
          flexShrink: 0,
          padding: '1.25rem 1.25rem 0',
          marginBottom: headerSubtitle ? '0.75rem' : '1rem',
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
            <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>{title}</h2>
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

      <TabScrollShell style={{ padding: '0 1.25rem 1.25rem' }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              background: 'var(--bg-glass)',
              borderRadius: 8,
              border: '1px dashed var(--border)',
            }}
          >
            {emptyIcon}
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
              {emptyTitle}
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>{emptyHint}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map((item) => {
              const dateTs = dateField ? dateField(item) : (item.updated_at ?? item.created_at);
              return (
                <div
                  key={item.id}
                  onClick={() => onItemClick?.(item)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ item, x: e.clientX, y: e.clientY });
                  }}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-glass)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    cursor: onItemClick ? 'pointer' : 'default',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!onItemClick) return;
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    if (!onItemClick) return;
                    e.currentTarget.style.background = 'var(--bg-glass)';
                    e.currentTarget.style.borderColor = 'var(--border)';
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
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title || 'Untitled'}
                        </span>
                      </div>
                      {item.url && isValidBookmarkUrl(item.url) && (
                        <div
                          style={{
                            fontSize: '0.85rem',
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        {dateLabel}: {formatDateTime(dateTs)}
                      </div>
                    </div>
                    {renderRowActions?.(item)}
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
