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
  Terminal,
  Upload,
  Plus,
  Trash2,
  Home,
  HelpCircle,
  Workflow,
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
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onDeleteProject?: (projectId: string) => Promise<boolean | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onDeleteCollection?: (collectionId: string) => Promise<boolean | void>;
}

type SidebarDialog =
  | { type: 'create-project' }
  | { type: 'create-collection'; projectId: string }
  | { type: 'delete-project'; projectId: string; projectName: string }
  | { type: 'delete-collection'; collectionId: string; collectionName: string };

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
  onCreateProject,
  onDeleteProject,
  onCreateCollection,
  onDeleteCollection,
}) => {
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [dialog, setDialog] = useState<SidebarDialog | null>(null);
  const [dialogName, setDialogName] = useState('');
  const [dialogError, setDialogError] = useState('');
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
        { icon: Workflow, label: 'Enrichment Hub', id: 'pipeline' },
        { icon: Upload, label: 'Import Studio', id: 'import-studio' },
        { icon: Terminal, label: 'Tab Commander', id: 'tab-commander' },
      ],
    },
  ];

  const isBookmarkItem = (item: Item) => !!item.url && item.url.trim().length > 0;

  const trashedCount = items.filter((i) => i.deletedAt != null).length;

  const getCollectionItemCounts = (collectionId: string) => {
    let bookmarks = 0;
    let notes = 0;
    for (const item of items) {
      const rawCollectionIds = (item as unknown as { collectionIds?: unknown }).collectionIds;
      const collectionIds = Array.isArray(rawCollectionIds)
        ? rawCollectionIds.filter((id): id is string => typeof id === 'string')
        : typeof rawCollectionIds === 'string'
          ? [rawCollectionIds]
          : [];
      if (!collectionIds.includes(collectionId)) continue;
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
  const scopeProjectIsInbox = projects.find((project) => project.id === scopeProjectId)?.isDefault === true;

  const handleAddProject = async (name: string) => {
    if (!onCreateProject) return;
    const createdId = await onCreateProject({ name: name.trim() });
    if (typeof createdId === 'string') {
      onSelectProjectScope(createdId);
      onSelectCollectionScope('all', createdId);
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!onDeleteProject) return;
    const project = projects.find((p) => p.id === projectId);
    if (project?.isDefault) {
      setDialogError('Inbox cannot be removed.');
      return;
    }
    const deleted = await onDeleteProject(projectId);
    if (deleted !== false && scopeProjectId === projectId) {
      onSelectProjectScope('all');
      onSelectCollectionScope('all');
    }
  };

  const handleAddCollection = async (name: string, projectId: string) => {
    if (!onCreateCollection) return;
    if (projects.find((project) => project.id === projectId)?.isDefault) {
      setDialogError('Inbox uses its single Incoming collection.');
      return;
    }
    const createdId = await onCreateCollection({ name: name.trim(), projectId });
    if (typeof createdId === 'string') {
      onSelectCollectionScope(createdId, projectId);
    }
  };

  const handleRemoveCollection = async (collectionId: string) => {
    if (!onDeleteCollection) return;
    const collection = collections.find((c) => c.id === collectionId);
    if (collection?.isDefault) {
      setDialogError('System collections cannot be removed.');
      return;
    }
    const deleted = await onDeleteCollection(collectionId);
    if (deleted !== false && scopeCollectionId === collectionId) {
      onSelectCollectionScope('all', scopeProjectId === 'all' ? undefined : scopeProjectId);
    }
  };

  const submitDialog = async () => {
    if (!dialog) return;
    setDialogError('');
    if (dialog.type === 'create-project') {
      const name = dialogName.trim();
      if (!name) {
        setDialogError('Project name is required.');
        return;
      }
      const exists = projects.some((p) => p.name.trim().toLowerCase() === name.toLowerCase());
      if (exists) {
        setDialogError('A project with this name already exists.');
        return;
      }
      await handleAddProject(name);
    } else if (dialog.type === 'create-collection') {
      if (projects.find((project) => project.id === dialog.projectId)?.isDefault) {
        setDialogError('Inbox uses its single Incoming collection.');
        return;
      }
      const name = dialogName.trim();
      if (!name) {
        setDialogError('Collection name is required.');
        return;
      }
      const existingCollectionsForProject = collections.filter(
        (c) =>
          c.primaryProjectId === dialog.projectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(dialog.projectId))
      );
      const exists = existingCollectionsForProject.some(
        (c) => c.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (exists) {
        setDialogError('A collection with this name already exists in this project.');
        return;
      }
      await handleAddCollection(name, dialog.projectId);
    } else if (dialog.type === 'delete-project') {
      const project = projects.find((p) => p.id === dialog.projectId);
      if (project?.isDefault) {
        setDialogError('Inbox cannot be removed.');
        return;
      }
      await handleRemoveProject(dialog.projectId);
    } else if (dialog.type === 'delete-collection') {
      const collection = collections.find((c) => c.id === dialog.collectionId);
      if (collection?.isDefault) {
        setDialogError('System collections cannot be removed.');
        return;
      }
      await handleRemoveCollection(dialog.collectionId);
    }
    setDialog(null);
    setDialogName('');
    setDialogError('');
  };

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
            Homebase
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
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                style={{
                  flex: 1,
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
              {onCreateProject && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDialogName('');
                    setDialogError('');
                    setDialog({ type: 'create-project' });
                  }}
                  style={{
                    width: 30,
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                  title="Add project"
                >
                  <Plus size={14} />
                </button>
              )}
              {onDeleteProject && selectedProject && !selectedProject.isDefault && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDialogError('');
                    setDialog({
                      type: 'delete-project',
                      projectId: selectedProject.id,
                      projectName: selectedProject.name,
                    });
                  }}
                  style={{
                    width: 30,
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: '#ef4444',
                    cursor: 'pointer',
                  }}
                  title="Delete selected project"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

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
                  <div
                    key={project.id}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: 2,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProjectScope(project.id);
                        onSelectCollectionScope('all', project.id);
                        setProjectDropdownOpen(false);
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 10px',
                        background: scopeProjectId === project.id ? 'var(--accent-weak)' : 'transparent',
                        border: 'none',
                        borderRadius: 4,
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
                    {onDeleteProject && !project.isDefault && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDialogError('');
                          setDialog({
                            type: 'delete-project',
                            projectId: project.id,
                            projectName: project.name,
                          });
                        }}
                        style={{
                          width: 24,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 4,
                          border: '1px solid transparent',
                          background: 'transparent',
                          color: '#ef4444',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        title={`Delete ${project.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. COLLECTIONS - Only show when a project is selected */}
        {!isCollapsed && scopeProjectId !== 'all' && (
          <div>
            <div
              style={{
                padding: '4px 4px 6px 4px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-faint)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Collections</span>
              {onCreateCollection && !scopeProjectIsInbox && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (scopeProjectId === 'all') return;
                    setDialogName('');
                    setDialogError('');
                    setDialog({ type: 'create-collection', projectId: scopeProjectId });
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                  title="Add collection"
                >
                  <Plus size={12} />
                </button>
              )}
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
                  <div
                    key={collection.id}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectCollectionScope(collection.id, scopeProjectId)}
                      style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      background: isSelected ? 'var(--accent-weak)' : 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 'var(--text-sm)',
                      color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                      {collection.name}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                      {counts.bookmarks + counts.notes}
                    </span>
                    </button>
                    {onDeleteCollection && !collection.isDefault && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDialogError('');
                          setDialog({
                            type: 'delete-collection',
                            collectionId: collection.id,
                            collectionName: collection.name,
                          });
                        }}
                        style={{
                          width: 18,
                          height: 18,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 3,
                          border: '1px solid transparent',
                          background: 'transparent',
                          color: '#ef4444',
                          opacity: 0.8,
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                        title="Delete collection"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider before nav sections */}
        {!isCollapsed && <div style={{ borderTop: '1px solid var(--border)' }} />}

        {/* Home nav item */}
        {(() => {
          const isActive = activeView === 'home';
          return (
            <button
              onClick={() => onSelectView('home')}
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
                marginBottom: 4,
              }}
              title="Home"
            >
              <Home size={16} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
              {!isCollapsed && (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Home
                </span>
              )}
            </button>
          );
        })()}

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

      {/* Settings, Trash, Help — pinned bottom */}
      <div
        style={{
          flexShrink: 0,
          padding: 8,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {(
          [
            { id: 'settings' as DashboardView, label: 'Settings', Icon: Settings },
            { id: 'trash' as DashboardView, label: 'Trash', Icon: Trash2, badge: trashedCount },
            { id: 'help' as DashboardView, label: 'Help', Icon: HelpCircle },
          ] as Array<{ id: DashboardView; label: string; Icon: NavItem['icon']; badge?: number }>
        ).map(({ id, label, Icon, badge }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectView(id)}
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
              title={label}
            >
              <Icon
                size={16}
                strokeWidth={isActive ? 2 : 1.5}
                style={{
                  flexShrink: 0,
                  color: id === 'trash' && trashedCount > 0 ? '#ef4444' : undefined,
                }}
              />
              {!isCollapsed && (
                <>
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'left',
                    }}
                  >
                    {label}
                  </span>
                  {badge != null && badge > 0 ? (
                    <span
                      style={{
                        flexShrink: 0,
                        minWidth: 18,
                        padding: '0 5px',
                        height: 18,
                        borderRadius: 9,
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        fontSize: 11,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </>
              )}
            </button>
          );
        })}
      </div>

      {dialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => {
            setDialog(null);
            setDialogName('');
            setDialogError('');
          }}
        >
          <div
            style={{
              width: '90%',
              maxWidth: 360,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)' }}>
              {dialog.type === 'create-project' && 'Create project'}
              {dialog.type === 'create-collection' && 'Create collection'}
              {dialog.type === 'delete-project' && 'Delete project'}
              {dialog.type === 'delete-collection' && 'Delete collection'}
            </div>
            {(dialog.type === 'create-project' || dialog.type === 'create-collection') && (
              (() => {
                const existingNames =
                  dialog.type === 'create-project'
                    ? projects.map((p) => p.name)
                    : collections
                        .filter(
                          (c) =>
                            c.primaryProjectId === dialog.projectId ||
                            (Array.isArray(c.projectIds) && c.projectIds.includes(dialog.projectId))
                        )
                        .map((c) => c.name);
                const normalizedInput = dialogName.trim().toLowerCase();
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {dialog.type === 'create-project'
                        ? 'Enter a unique project name.'
                        : 'Enter a unique collection name for this project.'}
                    </div>
                    <input
                      autoFocus
                      type="text"
                      value={dialogName}
                      onChange={(e) => {
                        setDialogName(e.target.value);
                        if (dialogError) setDialogError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitDialog();
                      }}
                      placeholder={dialog.type === 'create-project' ? 'Project name' : 'Collection name'}
                      style={{
                        width: '100%',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-input)',
                        color: 'var(--text)',
                        padding: '8px 10px',
                        fontSize: 'var(--text-sm)',
                      }}
                    />
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                      Existing ({existingNames.length})
                    </div>
                    <div
                      className="scrollbar"
                      style={{
                        maxHeight: 120,
                        overflowY: 'auto',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'var(--bg)',
                        padding: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {existingNames.length === 0 ? (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', padding: '2px 4px' }}>
                          No existing names.
                        </div>
                      ) : (
                        existingNames.map((name) => {
                          const isSame = normalizedInput.length > 0 && name.trim().toLowerCase() === normalizedInput;
                          return (
                            <div
                              key={name}
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: isSame ? '#ef4444' : 'var(--text-muted)',
                                background: isSame ? 'rgba(239,68,68,0.12)' : 'transparent',
                                borderRadius: 4,
                                padding: '3px 6px',
                              }}
                            >
                              {name}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()
            )}
            {(dialog.type === 'delete-project' || dialog.type === 'delete-collection') && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {dialog.type === 'delete-project'
                  ? `Delete project "${dialog.projectName}"?`
                  : `Delete collection "${dialog.collectionName}"?`}
              </div>
            )}
            {dialogError && (
              <div style={{ fontSize: 'var(--text-xs)', color: '#ef4444' }}>
                {dialogError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setDialog(null);
                  setDialogName('');
                  setDialogError('');
                }}
                style={{
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)',
                  padding: '6px 12px',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitDialog()}
                disabled={
                  (dialog.type === 'create-project' || dialog.type === 'create-collection') &&
                  !dialogName.trim()
                }
                style={{
                  borderRadius: 6,
                  border: 'none',
                  background:
                    (dialog.type === 'create-project' || dialog.type === 'create-collection') && !dialogName.trim()
                      ? 'var(--accent-weak)'
                      : dialog.type === 'delete-project' || dialog.type === 'delete-collection'
                        ? '#ef4444'
                        : 'var(--accent)',
                  color: '#fff',
                  padding: '6px 12px',
                  fontSize: 'var(--text-sm)',
                  cursor:
                    (dialog.type === 'create-project' || dialog.type === 'create-collection') && !dialogName.trim()
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {dialog.type === 'delete-project' || dialog.type === 'delete-collection' ? 'Delete' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
