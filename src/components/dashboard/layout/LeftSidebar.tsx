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
      color: 'var(--text)'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '1rem', 
        borderBottom: '1px solid var(--border)' 
      }}>
        {!isCollapsed && (
          <span style={{ 
            fontWeight: 'bold', 
            fontSize: '1.125rem', 
            color: 'var(--text)' 
          }}>
            Workbench Agent
          </span>
        )}
        <button 
          onClick={onToggle}
          style={{
            padding: '0.25rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)'
          }}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ 
        flex: 1, 
        paddingTop: '1rem', 
        paddingBottom: '1rem' 
      }}>
        <ul style={{ 
          listStyle: 'none', 
          margin: 0, 
          padding: '0 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}>
          {navItems.map((item) => (
            <li key={item.id}>
              <button 
                onClick={() => onSelectView(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  background: activeView === item.id ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: activeView === item.id ? 600 : 400,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = 'var(--bg-glass)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
                title={item.label}
              >
                <item.icon 
                  size={20} 
                  color={activeView === item.id ? '#ffffff' : '#9aa0a6'} 
                  strokeWidth={activeView === item.id ? 2.5 : 2} 
                  style={{ flexShrink: 0 }}
                />
                {!isCollapsed && (
                  <span style={{ 
                    marginLeft: '0.75rem', 
                    color: activeView === item.id ? '#ffffff' : '#9aa0a6',
                    fontWeight: activeView === item.id ? 600 : 400,
                    fontSize: '0.875rem'
                  }}>{item.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer / Settings */}
      <div style={{ 
        padding: '1rem', 
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        <button 
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: '0.5rem 0.75rem',
            color: 'var(--text-muted)',
            border: 'none',
            background: 'transparent',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-glass)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <Settings size={20} />
          {!isCollapsed && <span style={{ marginLeft: '0.75rem' }}>Settings</span>}
        </button>
        {!isCollapsed && <ThemeToggle />}
      </div>
    </div>
  );
};
