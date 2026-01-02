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
  spaceId: string; // Identifier for this tab space (e.g., 'primary', 'secondary', 'rightPrimary', 'rightSecondary')
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
    // Create a ghost image
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

      // If dropping in the same space, reorder
      if (sourceSpaceId === spaceId && onTabMove) {
        const sourceIndex = tabs.findIndex((t) => t.id === sourceTabId);
        if (sourceIndex === -1 || sourceIndex === targetIndex) return;

        // Reorder logic would be handled by parent
        onTabMove(sourceTabId, `${spaceId}:${targetIndex}`);
      } else if (sourceSpaceId !== spaceId && onTabMove) {
        // Move to different space
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
        height: 34,
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0 0.35rem',
        borderBottom: '1px solid var(--border)',
        background: isDragOver ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
        transition: 'background 0.15s ease',
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
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            flex: 1,
            textAlign: 'center',
            padding: '0.5rem',
            border: isDragOver ? '2px dashed var(--accent)' : '2px dashed transparent',
            borderRadius: 6,
            transition: 'border-color 0.15s ease',
          }}
        >
          {isDragOver ? 'Drop tab here' : 'No tabs'}
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
              padding: '0.25rem 0.55rem',
              borderRadius: 8,
              cursor: isDragging ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: isActive
                ? 'var(--bg-glass)'
                : isDropTarget
                  ? 'rgba(99, 102, 241, 0.2)'
                  : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              border: isDropTarget
                ? '2px solid var(--accent)'
                : `1px solid ${isActive ? 'var(--border)' : 'rgba(255,255,255,0.06)'}`,
              boxShadow: isActive ? '0 6px 18px rgba(0,0,0,0.18)' : 'none',
              opacity: isDragging ? 0.5 : 1,
              transition: 'opacity 0.15s ease, border-color 0.15s ease, background 0.15s ease',
            }}
          >
            <span
              style={{
                maxWidth: 200,
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
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                padding: '0 0.25rem',
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


