import React, { useEffect, useRef } from 'react';
import type { Collection } from '../../lib/db';

interface CollectionContextMenuProps {
  collection: Collection;
  x: number;
  y: number;
  onClose: () => void;
  onDelete?: (collection: Collection) => void;
  onDetach?: (collection: Collection) => void;
  onRename?: (collection: Collection) => void;
  onOpenInTab?: (collection: Collection) => void;
}

export const CollectionContextMenu: React.FC<CollectionContextMenuProps> = ({
  collection,
  x,
  y,
  onClose,
  onDelete,
  onDetach,
  onRename,
  onOpenInTab,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    // Position menu within viewport
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 8;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 8;
      }

      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [x, y]);

  const menuItems = [
    onOpenInTab && { label: 'Open in tab', action: () => onOpenInTab(collection), icon: '📑' },
    (onOpenInTab || onRename) && { label: '─', action: undefined, icon: '', separator: true },
    onRename && { label: 'Rename', action: () => onRename(collection), icon: '✏️' },
    onDetach && { label: 'Remove from project', action: () => onDetach(collection), icon: '🔗' },
    (onRename || onDetach || onDelete) && { label: '─', action: undefined, icon: '', separator: true },
    onDelete && { label: 'Delete collection', action: () => {
      if (window.confirm(`Delete "${collection.name}"? Items will be moved to Unsorted.`)) {
        onDelete(collection);
      }
    }, icon: '🗑️', danger: true },
  ].filter(Boolean) as Array<{ label: string; action?: () => void; icon: string; danger?: boolean; separator?: boolean }>;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 10000,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        padding: '0.25rem',
        minWidth: 180,
        backdropFilter: 'blur(12px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((menuItem, idx) => {
        if (menuItem.separator) {
          return (
            <div
              key={idx}
              style={{
                height: '1px',
                background: 'var(--border)',
                margin: '0.25rem 0',
              }}
            />
          );
        }
        return (
          <button
            key={idx}
            onClick={() => {
              if (menuItem.action) {
                menuItem.action();
                onClose();
              }
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              color: menuItem.danger ? '#ef4444' : 'var(--text)',
              cursor: 'pointer',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = menuItem.danger
                ? 'rgba(239, 68, 68, 0.15)'
                : 'var(--bg-glass)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span>{menuItem.icon}</span>
            <span>{menuItem.label}</span>
          </button>
        );
      })}
    </div>
  );
};

