import React, { useState, useEffect } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { MainContent } from './MainContent';
import { WindowGroup } from '../../../App';
import { Workspace, Collection, Item, Project } from '../../../lib/db';

export type DashboardView =
  | 'home'
  | 'projects'
  | 'tab-commander'
  | 'bookmarks'
  | 'notes'
  | 'collections'
  | 'workspaces';

interface DashboardLayoutProps {
  windows: WindowGroup[];
  projects: Project[];
  collections: Collection[];
  items: Item[];
  workspaces: Workspace[];
  onWorkspacesChanged?: () => Promise<void>;
  onAddBookmark?: (url: string, title?: string, collectionId?: string) => Promise<void>;
  onUpdateBookmark?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => Promise<void>;
  onDeleteBookmark?: (id: string) => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  windows,
  projects,
  collections,
  items,
  workspaces,
  onWorkspacesChanged,
  onAddBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
  onCloseTab,
  onCloseWindow,
  onRefresh
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>('projects');

  useEffect(() => {
    // Ensure the theme dataset is set at least once (fallback to existing or default dark)
    const current = document.documentElement.dataset.theme;
    if (!current) {
      document.documentElement.dataset.theme = 'dark';
    }
  }, []);

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      overflow: 'hidden', 
      background: 'var(--bg)', 
      color: 'var(--text)',
      fontFamily: 'system-ui, sans-serif' 
    }}>
      {/* Left Sidebar */}
      <div style={{ 
        width: isSidebarCollapsed ? '64px' : '256px',
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        transition: 'width 0.3s ease-in-out'
      }}>
        <LeftSidebar 
          isCollapsed={isSidebarCollapsed} 
          onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          activeView={activeView}
          onSelectView={setActiveView}
        />
      </div>

      {/* Right Area (Main + Bottom) */}
      <div style={{ 
        flex: 1, 
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--bg)',
      }}>

        {/* Main Content Area (full height) */}
        <div style={{ height: '100%', overflow: 'auto', padding: '1.5rem' }} className="scrollbar">
          <MainContent
            activeView={activeView}
            projects={projects}
            workspaces={workspaces}
            items={items}
            collections={collections}
            windows={windows}
            onWorkspacesChanged={onWorkspacesChanged}
            onCloseTab={onCloseTab}
            onCloseWindow={onCloseWindow}
            onAddBookmark={onAddBookmark}
            onUpdateBookmark={onUpdateBookmark}
            onDeleteBookmark={onDeleteBookmark}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    </div>
  );
};
