import React, { useState } from 'react';

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

  return (
    <div
      style={{
        height: 28,
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '0 4px',
        borderBottom: '1px solid var(--border)',
        background: isDragOver ? 'var(--accent-weak)' : 'transparent',
        transition: 'background 0.12s ease',
        fontSize: 'var(--text-sm)',
      }}
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
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => onTabSelect(tab.id)}
            style={{
              padding: '3px 8px',
              borderRadius: 4,
              cursor: isDragging ? 'grabbing' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: 22,
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
              transition: 'all 0.1s ease',
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
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
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
                fontSize: '12px',
                padding: '0 2px',
                lineHeight: 1,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
