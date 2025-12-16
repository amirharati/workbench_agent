import React, { useState, useRef, useEffect } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { MainContent } from './MainContent';
import { BottomPanel } from './BottomPanel';
import { WindowGroup } from '../../../App';
import { Workspace } from '../../../lib/db';

export type DashboardView = 'projects' | 'bookmarks' | 'notes' | 'collections' | 'workspaces';

interface DashboardLayoutProps {
  windows: WindowGroup[];
  workspaces: Workspace[];
  onWorkspacesChanged?: () => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  windows,
  workspaces,
  onWorkspacesChanged,
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
      const minHeight = 44; // allow dragging down to just the header height
      const maxHeight = window.innerHeight - 200;
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setBottomPanelHeight(newHeight);
      } else if (newHeight < minHeight) {
        setBottomPanelHeight(minHeight);
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
          <MainContent activeView={activeView} workspaces={workspaces} />
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

        {/* Floating reopen control when collapsed */}
        {isBottomPanelCollapsed && (
          <button
            onClick={() => setIsBottomPanelCollapsed(false)}
            style={{
              position: 'absolute',
              right: '12px',
              bottom: '12px',
              padding: '0.45rem 0.65rem',
              borderRadius: '9999px',
              border: '1px solid #e5e7eb',
              background: '#ffffff',
              boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
              cursor: 'pointer',
              fontWeight: 800,
              color: '#111827',
              zIndex: 10
            }}
            title="Show Tab Commander"
          >
            Show Tab Commander
          </button>
        )}
      </div>
    </div>
  );
};
