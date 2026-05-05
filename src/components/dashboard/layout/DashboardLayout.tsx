import React, { useState, useEffect } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { MainContent } from './MainContent';
import { WindowGroup } from '../../../App';
import { Workspace, Collection, Item, Project } from '../../../lib/db';
import type { BackupStatusSnapshot } from '../../../lib/backupCoordinator';

export type DashboardView =
  | 'home'
  | 'settings'
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
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onCreateItem?: (data: {
    title: string;
    url?: string;
    notes?: string;
    collectionIds: string[];
  }) => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onChooseBackupFolder?: () => Promise<void>;
  onSetAsBrowserHome?: () => Promise<void>;
  onRestoreBackupFile?: (file: File, mode: 'replace' | 'merge') => Promise<void>;
  onManualBackup?: () => Promise<void>;
  onResolveConflictLoadRemote?: () => Promise<void>;
  onResolveConflictKeepLocal?: () => Promise<void>;
  backupFolderReady?: boolean;
  backupFolderName?: string | null;
  backupStatus?: BackupStatusSnapshot;
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
  onCreateProject,
  onCreateCollection,
  onCreateItem,
  onCloseTab,
  onCloseWindow,
  onRefresh,
  onChooseBackupFolder,
  onSetAsBrowserHome,
  onRestoreBackupFile,
  onManualBackup,
  onResolveConflictLoadRemote,
  onResolveConflictKeepLocal,
  backupFolderReady,
  backupFolderName,
  backupStatus,
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
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-base)',
    }}>
      {/* Left Sidebar (compact) */}
      <div style={{ 
        width: isSidebarCollapsed ? '48px' : '200px',
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        transition: 'width 0.2s ease',
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
        
        {/* Main Content Area (full height, compact padding) */}
        <div style={{ height: '100%', overflow: 'auto', padding: '8px' }} className="scrollbar">
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
            onCreateProject={onCreateProject}
            onCreateCollection={onCreateCollection}
            onCreateItem={onCreateItem}
            onRefresh={onRefresh}
            onChooseBackupFolder={onChooseBackupFolder}
            onSetAsBrowserHome={onSetAsBrowserHome}
            onRestoreBackupFile={onRestoreBackupFile}
            onManualBackup={onManualBackup}
            onResolveConflictLoadRemote={onResolveConflictLoadRemote}
            onResolveConflictKeepLocal={onResolveConflictKeepLocal}
            backupFolderReady={backupFolderReady}
            backupFolderName={backupFolderName}
            backupStatus={backupStatus}
          />
        </div>
      </div>
    </div>
  );
};
