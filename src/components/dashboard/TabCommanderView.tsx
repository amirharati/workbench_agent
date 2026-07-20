import React from 'react';
import type { WindowGroup } from '../../App';
import type { Item, Project, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import { BottomPanel } from './layout/BottomPanel';

interface TabCommanderViewProps {
  windows: WindowGroup[];
  workspaces: Workspace[];
  projects: Project[];
  items: Item[];
  homeState: GlobalTabState;
  onHomeStateChange: (next: GlobalTabState) => void;
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
  projects,
  items,
  homeState,
  onHomeStateChange,
  onWorkspacesChanged,
  onCloseTab,
  onCloseWindow,
  onRefresh,
}) => {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 18px 72px',
        boxSizing: 'border-box',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <BottomPanel
          isCollapsed={false}
          displayMode="page"
          onToggle={() => {
            /* no-op: full page */
          }}
          windows={windows}
          workspaces={workspaces}
          projects={projects}
          items={items}
          homeState={homeState}
          onHomeStateChange={onHomeStateChange}
          onWorkspacesChanged={onWorkspacesChanged}
          onCloseTab={onCloseTab}
          onCloseWindow={onCloseWindow}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  );
};
