import React from 'react';
import { 
  Home,
  Layout, 
  BookMarked, 
  Layers,
  FileText, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  FolderOpen,
  Terminal
} from 'lucide-react';
import { DashboardView } from './DashboardLayout';
import { ThemeToggle } from '../../ThemeToggle';

interface LeftSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  activeView: DashboardView;
  onSelectView: (view: DashboardView) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ 
  isCollapsed, 
  onToggle,
  activeView,
  onSelectView
}) => {
  const navItems: { icon: any; label: string; id: DashboardView }[] = [
    { icon: Home, label: 'Home', id: 'home' },
    { icon: Layout, label: 'Projects', id: 'projects' },
    { icon: Terminal, label: 'Tab Commander', id: 'tab-commander' },
    { icon: BookMarked, label: 'Bookmarks', id: 'bookmarks' },
    { icon: Layers, label: 'Workspaces', id: 'workspaces' },
    { icon: FileText, label: 'Notes', id: 'notes' },
    { icon: FolderOpen, label: 'Collections', id: 'collections' },
  ];

  return (
    <div style={{ 
      display: 'flex', 
      height: '100%', 
      flexDirection: 'column',
      color: 'var(--text)',
      fontSize: 'var(--text-sm)',
    }}>
      {/* Header - compact */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        height: 36,
      }}>
        {!isCollapsed && (
          <span style={{ 
            fontWeight: 600, 
            fontSize: 'var(--text-sm)',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            Workbench
          </span>
        )}
        <button 
          onClick={onToggle}
          style={{
            padding: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
          }}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation - compact items */}
      <nav style={{ 
        flex: 1, 
        padding: '6px',
        overflowY: 'auto',
      }}>
        <ul style={{ 
          listStyle: 'none', 
          margin: 0, 
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}>
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <li key={item.id}>
                <button 
                  onClick={() => onSelectView(item.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    padding: isCollapsed ? '6px' : '5px 8px',
                    height: 28,
                    borderRadius: 4,
                    background: isActive ? 'var(--accent-weak)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? 'var(--text)' : 'var(--text-muted)',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.color = 'var(--text)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }
                  }}
                  title={item.label}
                >
                  <item.icon 
                    size={16} 
                    strokeWidth={isActive ? 2 : 1.5} 
                    style={{ flexShrink: 0 }}
                  />
                  {!isCollapsed && (
                    <span style={{ 
                      marginLeft: '8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {item.label}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer - compact */}
      <div style={{ 
        padding: '6px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        <button 
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: isCollapsed ? '6px' : '5px 8px',
            height: 28,
            color: 'var(--text-muted)',
            border: 'none',
            background: 'transparent',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <Settings size={16} />
          {!isCollapsed && <span style={{ marginLeft: '8px' }}>Settings</span>}
        </button>
        {!isCollapsed && <ThemeToggle />}
      </div>
    </div>
  );
};
