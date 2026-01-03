import React from 'react';
import type { WindowGroup } from '../../App';
import type { Workspace } from '../../lib/db';
import { BottomPanel } from './layout/BottomPanel';

interface TabCommanderViewProps {
  windows: WindowGroup[];
  workspaces: Workspace[];
  onWorkspacesChanged?: () => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

/**
 * Full-page Tab Commander view.
 * Intentionally reuses the existing BottomPanel UI/logic (no redesign yet).
 */
export const TabCommanderView: React.FC<TabCommanderViewProps> = ({
  windows,
  workspaces,
  onWorkspacesChanged,
  onCloseTab,
  onCloseWindow,
  onRefresh,
}) => {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 28,
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)' }}>
          Tab Commander
        </h1>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {windows.length} windows • {windows.reduce((sum, w) => sum + w.tabs.length, 0)} tabs
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--bg-panel)',
        }}
      >
        <BottomPanel
          isCollapsed={false}
          onToggle={() => {
            /* no-op: full page */
          }}
          windows={windows}
          workspaces={workspaces}
          onWorkspacesChanged={onWorkspacesChanged}
          onCloseTab={onCloseTab}
          onCloseWindow={onCloseWindow}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  );
};


