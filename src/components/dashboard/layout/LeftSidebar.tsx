import React, { useState, useRef, useEffect } from 'react';
import { 
  BookMarked, 
  Layers,
  FileText, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Folder,
  Terminal
} from 'lucide-react';
import { DashboardView } from './DashboardLayout';
import type { Collection, Item, Project } from '../../../lib/db';

interface LeftSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  activeView: DashboardView;
  onSelectView: (view: DashboardView) => void;
  projects: Project[];
  collections: Collection[];
  items: Item[];
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
  onSelectProjectScope: (projectId: string | 'all') => void;
  onSelectCollectionScope: (collectionId: string, projectId?: string) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ 
  isCollapsed, 
  onToggle,
  activeView,
  onSelectView,
  projects,
  collections,
  items,
  scopeProjectId,
  scopeCollectionId,
  onSelectProjectScope,
  onSelectCollectionScope,
}) => {
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    if (projectDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [projectDropdownOpen]);

  type NavItem = {
    icon: React.ComponentType<any>;
    label: string;
    id: DashboardView;
  };

  const navSections: { title: string; items: NavItem[] }[] = [
    {
      title: 'Content',
      items: [
        { icon: BookMarked, label: 'Bookmarks', id: 'bookmarks' },
        { icon: FileText, label: 'Notes', id: 'notes' },
        { icon: Layers, label: 'Workspaces', id: 'workspaces' },
      ],
    },
    {
      title: 'Tools',
      items: [
        { icon: Terminal, label: 'Tab Commander', id: 'tab-commander' },
        { icon: Settings, label: 'Settings', id: 'settings' },
      ],
    },
  ];

  const isBookmarkItem = (item: Item) => !!item.url && item.url.trim().length > 0;

  const getCollectionItemCounts = (collectionId: string) => {
    let bookmarks = 0;
    let notes = 0;
    for (const item of items) {
      if (!(item.collectionIds || []).includes(collectionId)) continue;
      if (isBookmarkItem(item)) bookmarks += 1;
      else notes += 1;
    }
    return { bookmarks, notes };
  };

  const selectedProject = scopeProjectId === 'all' 
    ? null 
    : projects.find(p => p.id === scopeProjectId);

  const projectCollections = scopeProjectId === 'all'
    ? []
    : collections.filter(
        (c) =>
          c.primaryProjectId === scopeProjectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(scopeProjectId))
      );

  return (
    <div style={{ 
      display: 'flex', 
      height: '100%', 
      flexDirection: 'column',
      color: 'var(--text)',
      fontSize: 'var(--text-sm)',
    }}>
      {/* Header */}
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

      {/* Main nav area */}
      <nav style={{ 
        flex: 1, 
        padding: '8px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {/* 1. PROJECT SELECTOR - Simple dropdown */}
        {!isCollapsed && (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                color: 'var(--text)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Folder size={14} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedProject ? selectedProject.name : 'All Projects'}
                </span>
              </span>
              <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </button>

            {projectDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 100,
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
                className="scrollbar"
              >
                <button
                  onClick={() => {
                    onSelectProjectScope('all');
                    setProjectDropdownOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: scopeProjectId === 'all' ? 'var(--accent-weak)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                    color: scopeProjectId === 'all' ? 'var(--text)' : 'var(--text-muted)',
                  }}
                >
                  All Projects
                </button>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      onSelectProjectScope(project.id);
                      onSelectCollectionScope('all', project.id);
                      setProjectDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: scopeProjectId === project.id ? 'var(--accent-weak)' : 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 'var(--text-sm)',
                      color: scopeProjectId === project.id ? 'var(--text)' : 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. COLLECTIONS - Only show when a project is selected */}
        {!isCollapsed && scopeProjectId !== 'all' && projectCollections.length > 0 && (
          <div>
            <div
              style={{
                padding: '4px 4px 6px 4px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-faint)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Collections
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button
                onClick={() => onSelectCollectionScope('all', scopeProjectId)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  background: scopeCollectionId === 'all' ? 'var(--accent-weak)' : 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  color: scopeCollectionId === 'all' ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                All
              </button>
              {projectCollections.map((collection) => {
                const counts = getCollectionItemCounts(collection.id);
                const isSelected = scopeCollectionId === collection.id;
                return (
                  <button
                    key={collection.id}
                    onClick={() => onSelectCollectionScope(collection.id, scopeProjectId)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      background: isSelected ? 'var(--accent-weak)' : 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 'var(--text-sm)',
                      color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {collection.name}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                      {counts.bookmarks + counts.notes}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider before nav sections */}
        {!isCollapsed && <div style={{ borderTop: '1px solid var(--border)' }} />}

        {/* 3. CONTENT & TOOLS NAV */}
        {navSections.map((section) => (
          <div key={section.title}>
            {!isCollapsed && (
              <div
                style={{
                  padding: '4px 4px 6px 4px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-faint)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {section.title}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {section.items.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectView(item.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      padding: isCollapsed ? '8px' : '6px 8px',
                      height: 30,
                      borderRadius: 4,
                      background: isActive ? 'var(--accent-weak)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 'var(--text-sm)',
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? 'var(--text)' : 'var(--text-muted)',
                      gap: 8,
                    }}
                    title={item.label}
                  >
                    <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
                    {!isCollapsed && (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
};
