import React from 'react';
import type { Item } from '../../lib/db';
import { getDomain } from '../../lib/utils';
import type { TabBarTab } from './TabBar';

interface TabContentProps {
  tab: (TabBarTab & { itemId?: string; content?: string }) | null;
  item?: Item | null;
}

export const TabContent: React.FC<TabContentProps> = ({ tab, item }) => {
  if (!tab && !item) {
    return (
      <div
        style={{
          padding: '1.5rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--bg-panel)',
          borderRadius: 10,
          border: '1px solid var(--border)',
        }}
      >
        No tab selected
      </div>
    );
  }

  // System tab with content
  if (tab && !item) {
    return (
      <div
        style={{
          padding: '1.25rem',
          overflowY: 'auto',
          height: '100%',
          color: 'var(--text)',
          background: 'var(--bg-panel)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>{tab.title || 'Untitled'}</h2>
        <div style={{ marginTop: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
          {tab.content || 'No content available.'}
        </div>
      </div>
    );
  }

  // Item tab
  const effectiveItem = item!;
  return (
    <div
      style={{
        padding: '1.25rem',
        overflowY: 'auto',
        height: '100%',
        background: 'var(--bg-panel)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
      }}
    >
      <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>
        {effectiveItem.title || 'Untitled'}
      </h2>
      <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {getDomain(effectiveItem.url || '') || effectiveItem.source}
      </div>
      <div style={{ marginTop: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
        {effectiveItem.notes || effectiveItem.url || 'No details available.'}
      </div>
    </div>
  );
};



