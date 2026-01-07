import React, { useState, useRef, useEffect, useMemo } from 'react';

export type TabBarTab = {
  id: string;
  title: string;
};

interface TabBarProps {
  tabs: TabBarTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabMove?: (tabId: string, targetSpace: string) => void;
  spaceId: string;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

const DRAG_MIME = 'application/x-dashboard-tab';

const TAB_SIZING = {
  MAX_WIDTH: 160,        // Comfortable size (few tabs)
  MIN_WIDTH: 80,         // Minimum size (many tabs)
  HEIGHT: 22,            // Tab height
  PADDING_X: 8,          // Horizontal padding
  PADDING_Y: 3,          // Vertical padding
  GAP: 2,                // Gap between tabs
  CLOSE_BUTTON_WIDTH: 20, // Close button space
  CONTAINER_PADDING: 8,   // Container horizontal padding
};

const calculateTabWidth = (tabCount: number, containerWidth: number): number => {
  if (tabCount === 0 || containerWidth === 0) return TAB_SIZING.MAX_WIDTH;
  
  // Account for: gaps, padding, close buttons
  const totalGaps = Math.max(0, (tabCount - 1) * TAB_SIZING.GAP);
  const totalPadding = TAB_SIZING.CONTAINER_PADDING * 2;
  const totalCloseButtons = tabCount * TAB_SIZING.CLOSE_BUTTON_WIDTH;
  
  const availableWidth = containerWidth - totalGaps - totalPadding - totalCloseButtons;
  const idealWidth = availableWidth / tabCount;
  
  // Clamp between min and max
  return Math.max(
    TAB_SIZING.MIN_WIDTH,
    Math.min(TAB_SIZING.MAX_WIDTH, idealWidth)
  );
};

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabMove,
  spaceId,
  isDragOver = false,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ tabId, spaceId }));
    setDraggedTabId(tabId);
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    e.dataTransfer.setDragImage(target, rect.width / 2, rect.height / 2);
  };

  const handleDragEnd = () => {
    setDraggedTabId(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
    if (onDragOver) onDragOver(e);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    setDraggedTabId(null);

    try {
      const data = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
      if (!data.tabId || !data.spaceId) return;

      const sourceTabId = data.tabId;
      const sourceSpaceId = data.spaceId;

      if (sourceSpaceId === spaceId && onTabMove) {
        const sourceIndex = tabs.findIndex((t) => t.id === sourceTabId);
        if (sourceIndex === -1 || sourceIndex === targetIndex) return;
        onTabMove(sourceTabId, `${spaceId}:${targetIndex}`);
      } else if (sourceSpaceId !== spaceId && onTabMove) {
        onTabMove(sourceTabId, spaceId);
      }
    } catch {
      // ignore
    }

    if (onDrop) onDrop(e);
  };

  // Measure container width and watch for changes (divider moved, window resize)
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    // Initial measurement
    updateWidth();
    
    // Watch for resize (divider moved, window resize)
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerRef.current);
    
    return () => resizeObserver.disconnect();
  }, []);

  // Calculate optimal tab width based on container width and tab count
  const tabWidth = useMemo(() => {
    return calculateTabWidth(tabs.length, containerWidth);
  }, [tabs.length, containerWidth]);

  // Check if scrolling is needed
  const needsScrolling = useMemo(() => {
    if (containerWidth === 0 || tabs.length === 0) return false;
    const totalTabsWidth = tabs.length * tabWidth + 
                           Math.max(0, (tabs.length - 1) * TAB_SIZING.GAP) +
                           TAB_SIZING.CONTAINER_PADDING * 2;
    return totalTabsWidth > containerWidth;
  }, [tabs.length, tabWidth, containerWidth]);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && containerRef.current && needsScrolling) {
      const tab = activeTabRef.current;
      const container = containerRef.current;
      const tabLeft = tab.offsetLeft;
      const tabWidth = tab.offsetWidth;
      const containerWidth = container.offsetWidth;
      const scrollLeft = container.scrollLeft;
      
      // If tab is before visible area
      if (tabLeft < scrollLeft) {
        container.scrollTo({ left: tabLeft - 8, behavior: 'smooth' });
      }
      // If tab is after visible area
      else if (tabLeft + tabWidth > scrollLeft + containerWidth) {
        container.scrollTo({ left: tabLeft + tabWidth - containerWidth + 8, behavior: 'smooth' });
      }
    }
  }, [activeTabId, needsScrolling]);

  return (
    <div
      ref={containerRef}
      style={{
        height: 28,
        display: 'flex',
        alignItems: 'center',
        gap: `${TAB_SIZING.GAP}px`,
        padding: `0 ${TAB_SIZING.CONTAINER_PADDING / 2}px`,
        borderBottom: '1px solid var(--border)',
        background: isDragOver ? 'var(--accent-weak)' : 'transparent',
        transition: 'background 0.12s ease',
        fontSize: 'var(--text-sm)',
        overflowX: needsScrolling ? 'auto' : 'hidden',
        overflowY: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}
      className="scrollbar"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (onDragOver) onDragOver(e);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverIndex(null);
          if (onDragLeave) onDragLeave();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const data = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
          if (data.tabId && data.spaceId && data.spaceId !== spaceId && onTabMove) {
            onTabMove(data.tabId, spaceId);
          }
        } catch {
          // ignore
        }
        setDragOverIndex(null);
        if (onDrop) onDrop(e);
      }}
    >
      {tabs.length === 0 && (
        <div
          style={{
            color: 'var(--text-faint)',
            fontSize: 'var(--text-xs)',
            flex: 1,
            textAlign: 'center',
            padding: '4px',
            border: isDragOver ? '1px dashed var(--accent)' : '1px dashed transparent',
            borderRadius: 4,
            transition: 'border-color 0.12s ease',
          }}
        >
          {isDragOver ? 'Drop here' : 'No tabs'}
        </div>
      )}
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        const isDragging = draggedTabId === tab.id;
        const isDropTarget = dragOverIndex === index && draggedTabId !== tab.id;

        return (
          <div
            key={tab.id}
            ref={isActive ? activeTabRef : null}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => onTabSelect(tab.id)}
            style={{
              padding: `${TAB_SIZING.PADDING_Y}px ${TAB_SIZING.PADDING_X}px`,
              borderRadius: 4,
              cursor: isDragging ? 'grabbing' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: TAB_SIZING.HEIGHT,
              width: `${tabWidth}px`,
              minWidth: `${tabWidth}px`,
              maxWidth: `${tabWidth}px`,
              flexShrink: 0,
              background: isActive
                ? 'var(--bg-panel)'
                : isDropTarget
                  ? 'var(--accent-weak)'
                  : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              border: isDropTarget
                ? '1px solid var(--accent)'
                : isActive
                  ? '1px solid var(--border)'
                  : '1px solid transparent',
              opacity: isDragging ? 0.5 : 1,
              transition: 'width 0.2s ease, all 0.1s ease',
              fontSize: 'var(--text-xs)',
            }}
            onMouseEnter={(e) => {
              if (!isActive && !isDragging) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive && !isDragging) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span
              style={{
                maxWidth: tabWidth - TAB_SIZING.CLOSE_BUTTON_WIDTH - TAB_SIZING.PADDING_X * 2 - 4, // Account for close button and padding
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}
            >
              {tab.title || 'Untitled'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-faint)',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '0 2px',
                lineHeight: 1,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                width: `${TAB_SIZING.CLOSE_BUTTON_WIDTH}px`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text)';
                e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-faint)';
                e.currentTarget.style.background = 'transparent';
              }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
