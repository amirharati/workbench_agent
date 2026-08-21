import React from 'react';
import type { WindowGroup } from '../../App';
import type { Collection, Item, Project, Workspace } from '../../lib/db';
import type { GlobalTabState } from './GlobalTabSystem';
import { BottomPanel } from './layout/BottomPanel';
import { uiPatterns } from '../../styles/uiPatterns';

interface TabCommanderViewProps {
  windows: WindowGroup[];
  workspaces: Workspace[];
  projects: Project[];
  /** Retained for callers during the workspace-capture transition. */
  items?: Item[];
  collections?: Collection[];
  homeState: GlobalTabState;
  onHomeStateChange: (next: GlobalTabState) => void;
  onAddBookmark?: (url: string, title?: string, collectionId?: string, options?: { silent?: boolean; successMessage?: string }) => Promise<string | undefined>;
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
  collections = [],
  homeState,
  onHomeStateChange,
  onAddBookmark,
  onWorkspacesChanged,
  onCloseTab,
  onCloseWindow,
  onRefresh,
}) => {
  return (
    <div
      className="ui-page-frame"
      style={{
        ...uiPatterns.pageFrame,
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
          collections={collections}
          homeState={homeState}
          onHomeStateChange={onHomeStateChange}
          onAddBookmark={onAddBookmark}
          onWorkspacesChanged={onWorkspacesChanged}
          onCloseTab={onCloseTab}
          onCloseWindow={onCloseWindow}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  );
};
