import React, { useCallback } from 'react';

interface ResizerProps {
  direction: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
  thickness?: number;
  min?: number;
  max?: number;
  ariaLabel?: string;
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
  ariaLabel,
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
      onKeyDown={(event) => {
        if (!ariaLabel) return;
        const step = event.shiftKey ? 40 : 10;
        if (isVertical && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          onResize(event.key === 'ArrowLeft' ? -step : step);
        } else if (!isVertical && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
          onResize(event.key === 'ArrowUp' ? -step : step);
        }
      }}
      role={ariaLabel ? 'separator' : undefined}
      aria-label={ariaLabel}
      aria-orientation={ariaLabel ? (isVertical ? 'vertical' : 'horizontal') : undefined}
      tabIndex={ariaLabel ? 0 : undefined}
      title={ariaLabel}
      style={{
        width: isVertical ? thickness : '100%',
        height: isVertical ? '100%' : thickness,
        cursor: isVertical ? 'col-resize' : 'row-resize',
        background: isVertical
          ? 'linear-gradient(to right, transparent, var(--border), transparent)'
          : 'linear-gradient(to bottom, transparent, var(--border), transparent)',
        transition: 'background 0.2s',
        userSelect: 'none',
        touchAction: 'none',
        position: 'relative',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isVertical
          ? 'linear-gradient(to right, transparent, rgba(99,102,241,0.5), transparent)'
          : 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.35), transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isVertical
          ? 'linear-gradient(to right, transparent, var(--border), transparent)'
          : 'linear-gradient(to bottom, transparent, var(--border), transparent)';
      }}
    >
      {!isVertical && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 36,
            height: 3,
            borderRadius: 999,
            background: 'var(--border)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};
