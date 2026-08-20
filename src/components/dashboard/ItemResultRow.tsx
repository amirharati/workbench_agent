import React from 'react';
import { useItemDragSource } from './ItemDragDropProvider';
import type { ItemDragSource } from './itemDragDrop';

const INTERACTIVE_CHILD_SELECTOR = 'button, a, input, select, textarea, [contenteditable="true"]';

export interface ItemResultRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  item: { id: string; title?: string; url?: string };
  dragSource?: ItemDragSource;
  selected?: boolean;
  onSelectItem?: (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Shared click/keyboard/native-drag contract for item result rows.
 * Result content stays plain; nested action controls remain independent.
 */
export const ItemResultRow = React.forwardRef<HTMLDivElement, ItemResultRowProps>(function ItemResultRow({
  item,
  dragSource,
  selected = false,
  onSelectItem,
  onClick,
  onKeyDown,
  onDragStart: onDomDragStart,
  onDragEnd: onDomDragEnd,
  className,
  children,
  ...domProps
}, ref) {
  const { getDragProps } = useItemDragSource();
  const dragProps = dragSource ? getDragProps(item, dragSource) : null;

  return (
    <div
      {...domProps}
      {...(dragProps ? { draggable: dragProps.draggable } : {})}
      ref={ref}
      className={['ui-item-result-row', className].filter(Boolean).join(' ')}
      role={onSelectItem ? 'button' : domProps.role}
      tabIndex={onSelectItem ? (domProps.tabIndex ?? 0) : domProps.tabIndex}
      data-item-result-row="true"
      data-item-drag-source={dragSource ? 'true' : undefined}
      data-selected={selected ? 'true' : 'false'}
      onDragStart={(event) => {
        onDomDragStart?.(event);
        if (event.defaultPrevented || !dragProps) return;
        if ((event.target as HTMLElement).closest(INTERACTIVE_CHILD_SELECTOR)) {
          event.preventDefault();
          return;
        }
        dragProps.onDragStart?.(event);
      }}
      onDragEnd={(event) => {
        onDomDragEnd?.(event);
        if (!event.defaultPrevented) dragProps?.onDragEnd?.(event);
      }}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          !onSelectItem ||
          (event.target as HTMLElement).closest(INTERACTIVE_CHILD_SELECTOR)
        ) return;
        onSelectItem(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.target !== event.currentTarget || !onSelectItem) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelectItem(event);
      }}
    >
      {children}
    </div>
  );
});
