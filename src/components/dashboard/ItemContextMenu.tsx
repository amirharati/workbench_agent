import React, { useEffect, useRef, useState } from 'react';
import type { Item } from '../../lib/db';
import {
  favoriteItem,
  moveItemToTrash,
  pinItem,
  restoreItemFromTrash,
  unfavoriteItem,
  unpinItem,
  permanentlyDeleteItem,
} from '../../lib/itemQuickAccess';
import { HubActionConfirmModal } from './HubActionConfirmModal';

interface ItemContextMenuProps {
  item: Item;
  x: number;
  y: number;
  onClose: () => void;
  onEdit?: (item: Item) => void;
  onDelete?: (item: Item) => void;
  onOpenInNewTab?: (item: Item) => void;
  onDuplicate?: (item: Item) => void;
  onOpenInSpace?: (item: Item, space: 'primary' | 'secondary' | 'rightPrimary' | 'rightSecondary') => void;
  availableSpaces?: {
    primary?: boolean;
    secondary?: boolean;
    rightPrimary?: boolean;
    rightSecondary?: boolean;
  };
  onQuickAccessChanged?: () => void;
}

export const ItemContextMenu: React.FC<ItemContextMenuProps> = ({
  item,
  x,
  y,
  onClose,
  onEdit,
  onDelete,
  onOpenInNewTab,
  onDuplicate,
  onOpenInSpace,
  availableSpaces = { primary: true },
  onQuickAccessChanged,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const isTrashed = item.deletedAt != null;
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<'trash' | 'permanent' | null>(null);

  useEffect(() => {
    if (pendingDestructiveAction) return;
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
  }, [onClose, pendingDestructiveAction]);

  useEffect(() => {
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

  const runQuickAccess = async (fn: () => Promise<void>) => {
    await fn();
    onQuickAccessChanged?.();
    onClose();
  };

  const spaceLabels: Record<string, string> = {
    primary: 'Main (top)',
    secondary: 'Main (bottom)',
    rightPrimary: 'Right (top)',
    rightSecondary: 'Right (bottom)',
  };

  const spaceMenuItems = onOpenInSpace
    ? [
        availableSpaces.primary && {
          label: `Open in ${spaceLabels.primary}`,
          action: () => onOpenInSpace(item, 'primary'),
          icon: '📑',
        },
        availableSpaces.secondary && {
          label: `Open in ${spaceLabels.secondary}`,
          action: () => onOpenInSpace(item, 'secondary'),
          icon: '📑',
        },
        availableSpaces.rightPrimary && {
          label: `Open in ${spaceLabels.rightPrimary}`,
          action: () => onOpenInSpace(item, 'rightPrimary'),
          icon: '📑',
        },
        availableSpaces.rightSecondary && {
          label: `Open in ${spaceLabels.rightSecondary}`,
          action: () => onOpenInSpace(item, 'rightSecondary'),
          icon: '📑',
        },
      ].filter(Boolean)
    : [];

  type MenuItem = {
    label: string;
    action?: () => void;
    icon: string;
    danger?: boolean;
    separator?: boolean;
  };

  const quickAccessItems: MenuItem[] = isTrashed
    ? [
        {
          label: 'Restore',
          action: () => void runQuickAccess(() => restoreItemFromTrash(item.id)),
          icon: '↩️',
        },
        {
          label: 'Delete permanently',
          action: () => setPendingDestructiveAction('permanent'),
          icon: '🗑️',
          danger: true,
        },
      ]
    : [
        {
          label: item.pinnedAt ? 'Unpin' : 'Pin',
          action: () =>
            void runQuickAccess(() => (item.pinnedAt ? unpinItem(item.id) : pinItem(item.id))),
          icon: item.pinnedAt ? '📌' : '📍',
        },
        {
          label: item.favoriteAt ? 'Remove from favorites' : 'Add to favorites',
          action: () =>
            void runQuickAccess(() =>
              item.favoriteAt ? unfavoriteItem(item.id) : favoriteItem(item.id)
            ),
          icon: item.favoriteAt ? '💔' : '⭐',
        },
      ];

  const menuItems: MenuItem[] = [
    ...spaceMenuItems,
    ...(spaceMenuItems.length > 0 ? [{ label: '', action: undefined, icon: '', separator: true }] : []),
    ...quickAccessItems,
    ...(quickAccessItems.length > 0 && (onEdit || onOpenInNewTab || onDuplicate || onDelete)
      ? [{ label: '', action: undefined, icon: '', separator: true }]
      : []),
    onEdit && !isTrashed && { label: 'Edit', action: () => onEdit(item), icon: '✏️' },
    onOpenInNewTab &&
      item.url &&
      !isTrashed && {
        label: 'Open in new tab',
        action: () => onOpenInNewTab(item),
        icon: '🔗',
      },
    onDuplicate && !isTrashed && { label: 'Duplicate', action: () => onDuplicate(item), icon: '📋' },
    !isTrashed && {
        label: 'Move to trash',
        action: () => setPendingDestructiveAction('trash'),
        icon: '🗑️',
        danger: true,
      },
  ].filter(Boolean) as MenuItem[];

  const confirmDestructiveAction = () => {
    const action = pendingDestructiveAction;
    setPendingDestructiveAction(null);
    if (action === 'permanent') {
      void runQuickAccess(() => permanentlyDeleteItem(item.id));
      return;
    }
    if (action === 'trash') {
      if (onDelete) {
        onDelete(item);
        onClose();
        return;
      }
      void runQuickAccess(() =>
        moveItemToTrash(item.id, { reason: 'Moved to trash', reasonCode: 'context_menu' })
      );
    }
  };

  return (
    <>
    <div
      ref={menuRef}
      className="ui-context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 'var(--layer-modal)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-panel)',
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
              }
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              color: menuItem.danger ? 'var(--danger)' : 'var(--text)',
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
                ? 'var(--danger-weak)'
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
    {pendingDestructiveAction ? (
      <HubActionConfirmModal
        title={pendingDestructiveAction === 'permanent' ? 'Delete item permanently?' : 'Move item to trash?'}
        description={`“${item.title || 'Untitled'}” ${pendingDestructiveAction === 'permanent' ? 'will be permanently deleted.' : 'will be moved out of its current views.'}`}
        warning={pendingDestructiveAction === 'permanent' ? 'Bookmark data cannot be restored. Its URL remains blocked from automatic re-import.' : 'You can restore this item later from Trash.'}
        confirmLabel={pendingDestructiveAction === 'permanent' ? 'Delete permanently' : 'Move to trash'}
        confirmVariant="danger"
        onCancel={() => setPendingDestructiveAction(null)}
        onConfirm={confirmDestructiveAction}
      />
    ) : null}
    </>
  );
};
