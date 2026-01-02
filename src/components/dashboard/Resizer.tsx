import React, { useCallback } from 'react';

interface ResizerProps {
  direction: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
  thickness?: number;
  min?: number;
  max?: number;
}

/**
 * Simple resizer component.
 * - vertical: left/right columns
 * - horizontal: top/bottom rows
 * Emits delta in pixels via onResize.
 */
export const Resizer: React.FC<ResizerProps> = ({
  direction,
  onResize,
  thickness = 4,
}) => {
  const isVertical = direction === 'vertical';

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      let last = isVertical ? e.clientX : e.clientY;

      const onMove = (moveEvent: MouseEvent) => {
        const current = isVertical ? moveEvent.clientX : moveEvent.clientY;
        const delta = current - last; // incremental delta for smooth dragging
        if (delta !== 0) {
          onResize(delta);
          last = current;
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [isVertical, onResize],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: isVertical ? thickness : '100%',
        height: isVertical ? '100%' : thickness,
        cursor: isVertical ? 'col-resize' : 'row-resize',
        background: isVertical
          ? 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)'
          : 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)',
        transition: 'background 0.2s',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isVertical
          ? 'linear-gradient(to right, transparent, rgba(99,102,241,0.5), transparent)'
          : 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.5), transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isVertical
          ? 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)'
          : 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)';
      }}
    />
  );
};


