import React, { useState, useRef, useEffect } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { MainContent } from './MainContent';
import { BottomPanel } from './BottomPanel';
import { WindowGroup } from '../../../App';
import { Workspace, Collection, Item } from '../../../lib/db';

export type DashboardView = 'projects' | 'bookmarks' | 'notes' | 'collections' | 'workspaces';

interface DashboardLayoutProps {
  windows: WindowGroup[];
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
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>('projects');
  const [bottomPanelHeight, setBottomPanelHeight] = useState(300);
  const bottomPanelRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !bottomPanelRef.current) return;
      const newHeight = window.innerHeight - e.clientY;
      const minHeight = 150;
      const maxHeight = window.innerHeight - 200;
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setBottomPanelHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      overflow: 'hidden', 
      background: '#f9fafb', 
      fontFamily: 'system-ui, sans-serif' 
    }}>
      {/* Left Sidebar */}
      <div style={{ 
        width: isSidebarCollapsed ? '64px' : '256px',
        flexShrink: 0,
        borderRight: '1px solid #e5e7eb',
        background: 'white',
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
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        position: 'relative'
      }}>
        
        {/* Main Content Area */}
        <div style={{ 
          flex: 1, 
          overflow: 'auto', 
          padding: '1.5rem' 
        }}>
          <MainContent 
            activeView={activeView} 
            workspaces={workspaces} 
            items={items}
            collections={collections}
            onAddBookmark={onAddBookmark}
            onUpdateBookmark={onUpdateBookmark}
            onDeleteBookmark={onDeleteBookmark}
          />
        </div>

        {/* Resize Handle */}
        {!isBottomPanelCollapsed && (
          <div
            onMouseDown={(e) => {
              setIsResizing(true);
              e.preventDefault();
            }}
            style={{
              height: '4px',
              background: '#e5e7eb',
              cursor: 'ns-resize',
              flexShrink: 0,
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#3b82f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#e5e7eb'}
          />
        )}

        {/* Bottom Panel (Tabs/Workbench) */}
        {!isBottomPanelCollapsed && (
          <div 
            ref={bottomPanelRef}
            style={{ 
              height: `${bottomPanelHeight}px`,
              flexShrink: 0,
              borderTop: '1px solid #e5e7eb',
              background: 'white',
              transition: isResizing ? 'none' : 'height 0.3s ease-in-out'
            }}
          >
            <BottomPanel 
              isCollapsed={isBottomPanelCollapsed} 
              onToggle={() => setIsBottomPanelCollapsed(!isBottomPanelCollapsed)} 
              windows={windows}
              workspaces={workspaces}
              onWorkspacesChanged={onWorkspacesChanged}
              onCloseTab={onCloseTab}
              onCloseWindow={onCloseWindow}
              onRefresh={onRefresh}
            />
          </div>
        )}
      </div>
    </div>
  );
};
