import React from 'react';

export type TabBarTab = {
  id: string;
  title: string;
};

interface TabBarProps {
  tabs: TabBarTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onTabSelect, onTabClose }) => {
  return (
    <div
      style={{
        height: 34,
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0 0.35rem',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {tabs.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No tabs</div>
      )}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onTabSelect(tab.id)}
            style={{
              padding: '0.25rem 0.55rem',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: isActive ? 'var(--bg-glass)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              border: `1px solid ${isActive ? 'var(--border)' : 'rgba(255,255,255,0.06)'}`,
              boxShadow: isActive ? '0 6px 18px rgba(0,0,0,0.18)' : 'none',
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
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.85rem',
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


