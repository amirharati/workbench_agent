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
    <div style={{ height: '100%', minHeight: 520 }}>
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
  );
};


