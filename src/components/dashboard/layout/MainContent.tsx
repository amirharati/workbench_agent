import React, { useMemo, useState, useEffect } from 'react';
import { Workspace, Item, Collection, Project, addProject, deleteProject, ALL_PROJECTS_ID } from '../../../lib/db';
import { formatDateTime } from '../../../lib/utils';
import { DashboardView } from './DashboardLayout';
import type { WindowGroup } from '../../../App';
import { HomeView } from '../HomeView';
import { TabCommanderView } from '../TabCommanderView';
import { ProjectDashboard } from '../ProjectDashboard';
import { CollectionsView } from '../CollectionsView';
import { SearchBar } from '../SearchBar';
import { Resizer } from '../Resizer';
import { Panel } from '../../../styles/primitives';
import { ItemContextMenu } from '../ItemContextMenu';
import { List, Grid, ExternalLink, Eye, Pencil, Trash2, Calendar } from 'lucide-react';

interface MainContentProps {
  activeView: DashboardView;
  projects: Project[];
  items: Item[];
  collections: Collection[];
  workspaces: Workspace[];
  windows: WindowGroup[];
  onWorkspacesChanged?: () => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onAddBookmark?: (url: string, title?: string, collectionId?: string) => Promise<void>;
  onUpdateBookmark?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => Promise<void>;
  onDeleteBookmark?: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export const MainContent: React.FC<MainContentProps> = ({ 
  activeView, 
  projects,
  items, 
  collections, 
  workspaces,
  windows,
  onWorkspacesChanged,
  onCloseTab,
  onCloseWindow,
  onAddBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
  onRefresh,
}) => {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedWindowIds, setSelectedWindowIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCollectionId, setNewCollectionId] = useState<string | undefined>(undefined);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCollectionId, setEditCollectionId] = useState<string | undefined>(undefined);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [bookmarkListWidth, setBookmarkListWidth] = useState(240);
  const [selectedBookmarkProjectId, setSelectedBookmarkProjectId] = useState<string | 'all'>('all');
  const [bookmarkContextMenu, setBookmarkContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [bookmarkViewMode, setBookmarkViewMode] = useState<'list' | 'grid'>('grid');
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  // Notes view state
  const [notesListWidth, setNotesListWidth] = useState(240);
  const [notesDetailWidth, setNotesDetailWidth] = useState(400);
  const [selectedNotesProjectId, setSelectedNotesProjectId] = useState<string | 'all'>('all');
  const [notesContextMenu, setNotesContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [notesViewMode, setNotesViewMode] = useState<'list' | 'grid'>('grid');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNoteContent, setEditNoteContent] = useState('');
  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) || null,
    [workspaces, selectedWorkspaceId]
  );

  // Filter bookmarks by selected project (must be at top level for hooks)
  const filteredBookmarkItems = useMemo(() => {
    if (activeView !== 'bookmarks') return [];
    
    let filtered = items;
    
    // Filter by project
    if (selectedBookmarkProjectId && selectedBookmarkProjectId !== 'all') {
      const projectCollectionIds = new Set(
        collections
          .filter(c => c.primaryProjectId === selectedBookmarkProjectId || 
                      (Array.isArray(c.projectIds) && c.projectIds.includes(selectedBookmarkProjectId)))
          .map(c => c.id)
      );
      filtered = filtered.filter(item => 
        (item.collectionIds || []).some(cid => projectCollectionIds.has(cid))
      );
    }
    
    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((item) => {
        const haystack = [
          item.title,
          item.url,
          item.notes,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    
    return filtered.sort((a, b) => b.updated_at - a.updated_at);
  }, [activeView, items, collections, selectedBookmarkProjectId, searchQuery]);

  // Get all items that are notes (items with notes content OR items without URL)
  const notesItems = useMemo(() => {
    return items.filter((item) => {
      const hasNotesContent = item.notes && item.notes.trim().length > 0;
      const isNoteItem = !item.url || item.url.trim().length === 0;
      return hasNotesContent || isNoteItem;
    });
  }, [items]);

  // Filter notes by selected project (must be at top level for hooks)
  const filteredNotesItems = useMemo(() => {
    if (activeView !== 'notes') return [];
    
    let filtered = notesItems;
    
    // Filter by project
    if (selectedNotesProjectId && selectedNotesProjectId !== 'all') {
      const projectCollectionIds = new Set(
        collections
          .filter(c => c.primaryProjectId === selectedNotesProjectId || 
                      (Array.isArray(c.projectIds) && c.projectIds.includes(selectedNotesProjectId)))
          .map(c => c.id)
      );
      filtered = filtered.filter(item => 
        (item.collectionIds || []).some(cid => projectCollectionIds.has(cid))
      );
    }
    
    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((item) => {
        const haystack = [
          item.title,
          item.notes || '',
          item.url || '',
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    
    return filtered.sort((a, b) => b.updated_at - a.updated_at);
  }, [activeView, notesItems, collections, selectedNotesProjectId, searchQuery]);

  // Get selected note for notes view
  const selectedNote = useMemo(() => {
    if (activeView !== 'notes') return null;
    return filteredNotesItems.find(item => item.id === selectedNoteId) || null;
  }, [activeView, filteredNotesItems, selectedNoteId]);

  // Initialize edit content when note is selected
  useEffect(() => {
    if (selectedNote && !isEditingNote) {
      setEditNoteContent(selectedNote.notes || '');
    }
  }, [selectedNote, isEditingNote]);

  const toggleWindowSelection = (id: string) => {
    setSelectedWindowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllWindows = () => {
    if (!selectedWorkspace) return;
    const allIds = selectedWorkspace.windows.map((w) => w.id);
    setSelectedWindowIds(new Set(allIds));
  };

  const clearWindowSelection = () => setSelectedWindowIds(new Set());

  const getSelectedWindows = () => {
    if (!selectedWorkspace) return [];
    if (selectedWindowIds.size === 0) return selectedWorkspace.windows;
    return selectedWorkspace.windows.filter((w) => selectedWindowIds.has(w.id));
  };

  const restoreWindows = async (windowsToRestore: Workspace['windows']) => {
    for (const w of windowsToRestore) {
      const urls = (w.tabs || [])
        .map((t) => t.url)
        .filter((u): u is string => Boolean(u) && u.startsWith('http'));
      if (urls.length === 0) continue;
      try {
        await chrome.windows.create({ url: urls });
      } catch (e) {
        console.error('Restore window failed', e);
      }
    }
  };

  const handleRestoreAll = async () => {
    if (!selectedWorkspace) return;
    await restoreWindows(selectedWorkspace.windows);
  };

  const handleRestoreSelected = async () => {
    if (!selectedWorkspace) return;
    await restoreWindows(getSelectedWindows());
  };

  const handleRestoreSingle = async (windowId: string) => {
    if (!selectedWorkspace) return;
    const w = selectedWorkspace.windows.find((x) => x.id === windowId);
    if (!w) return;
    await restoreWindows([w]);
  };

  const handleOpenLinkHere = async (url: string | undefined) => {
    if (!url || !url.startsWith('http')) return;
    try {
      const currentWindow = await chrome.windows.getCurrent();
      await chrome.tabs.create({ windowId: currentWindow.id, url, active: true });
    } catch (e) {
      console.error('Open link failed', e);
    }
  };

  const openInNewTab = async (url: string) => {
    if (!url.startsWith('http')) return;
    try {
      await chrome.tabs.create({ url, active: true });
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  // getDomain moved to utils - keeping for backward compatibility if needed
  // const getDomain = (url: string) => {
  //   try {
  //     return new URL(url).hostname.replace(/^www\./, '');
  //   } catch {
  //     return url;
  //   }
  // };



  const handleAddSubmit = async () => {
    if (!newUrl.trim()) return;
    if (!onAddBookmark) return;
    await onAddBookmark(newUrl.trim(), newTitle.trim(), newCollectionId);
    setShowAddModal(false);
    setNewUrl('');
    setNewTitle('');
    setNewCollectionId(undefined);
  };

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setEditTitle(item.title || '');
    setEditNotes(item.notes || '');
    setEditCollectionId(item.collectionIds?.[0]);
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditTitle('');
    setEditNotes('');
    setEditCollectionId(undefined);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !onUpdateBookmark) return;
    await onUpdateBookmark(editingItem.id, { 
      title: editTitle || editingItem.title, 
      notes: editNotes,
      collectionIds: editCollectionId ? [editCollectionId] : []
    });
    closeEditModal();
  };


  // formatDate moved to utils - keeping for backward compatibility if needed
  // const formatDate = (ts: number) => {
  //   const d = new Date(ts);
  //   return d.toLocaleDateString();
  // };

  // Helper functions for bookmarks view (used in modal too)
  const getItemCollection = (item: Item) => {
    if (!item.collectionIds || item.collectionIds.length === 0) return null;
    return collections.find(c => c.id === item.collectionIds[0]) || null;
  };

  const getCollectionProject = (collection: Collection) => {
    if (!collection) return null;
    return projects.find(p => p.id === collection.primaryProjectId) || null;
  };

  const renderContent = () => {
    switch (activeView) {
      case 'home':
        return <HomeView />;
      case 'tab-commander':
        return (
          <TabCommanderView
            windows={windows}
            workspaces={workspaces}
            onWorkspacesChanged={onWorkspacesChanged}
            onCloseTab={onCloseTab}
            onCloseWindow={onCloseWindow}
            onRefresh={onRefresh}
          />
        );
      case 'projects':
        // Virtual "All" project that aggregates everything
        const virtualAllProject: Project = {
          id: ALL_PROJECTS_ID,
          name: 'All',
          description: 'All items from all projects',
          isDefault: false,
          created_at: 0,
          updated_at: Date.now(),
        };

        // Combined list with "All" first, then real projects
        const allProjectsWithVirtual = [virtualAllProject, ...projects];

        const activeProject = selectedProjectId
          ? (selectedProjectId === ALL_PROJECTS_ID 
              ? virtualAllProject 
              : projects.find((p) => p.id === selectedProjectId) || null)
          : null;

        const collectionsForProject = (pid: string | null) => {
          if (!pid) return [];
          
          // For "All" virtual project, show all non-default collections
          if (pid === ALL_PROJECTS_ID) {
            return collections.filter((c) => !c.isDefault && c.name !== 'Unsorted');
          }
          
          const projectUnsortedId = `collection_${pid}_unsorted`;
          return collections.filter((c) => {
            // Must belong to this project
            const belongsToProject =
              c.primaryProjectId === pid || (Array.isArray(c.projectIds) && c.projectIds.includes(pid));
            if (!belongsToProject) return false;

            // Include the current project's unsorted collection
            if (c.id === projectUnsortedId) return true;

            // Exclude other unsorted/default collections
            if (c.isDefault && c.id !== projectUnsortedId) return false;
            if (c.name === 'Unsorted' && c.id !== projectUnsortedId) return false;

            // Include all other collections
            return true;
          });
        };

        const itemsForProject = (pid: string | null) => {
          if (!pid) return [];
          
          // For "All" virtual project, show ALL items
          if (pid === ALL_PROJECTS_ID) {
            return items;
          }
          
          const colIds = new Set(collectionsForProject(pid).map((c) => c.id));
          return items.filter((it) => (it.collectionIds || []).some((cid) => colIds.has(cid)));
        };

        const handleCreateProject = async () => {
          const name = window.prompt('Project name?');
          if (!name || !name.trim()) return;
          await addProject(name.trim());
          if (onRefresh) await onRefresh();
        };

        const handleDeleteProject = async (id: string) => {
          // Can't delete the virtual "All" project
          if (id === ALL_PROJECTS_ID) {
            alert('Cannot delete the "All" aggregate view.');
            return;
          }
          if (!window.confirm('Delete this project? This does not delete bookmarks.')) return;
          const ok = await deleteProject(id);
          if (!ok) {
            alert('Cannot delete default project.');
            return;
          }
          if (selectedProjectId === id) setSelectedProjectId(null);
          if (onRefresh) await onRefresh();
        };

        const ProjectCard: React.FC<{ project: Project }> = ({ project }) => {
          const isVirtualAll = project.id === ALL_PROJECTS_ID;
          const cols = collectionsForProject(project.id);
          const its = itemsForProject(project.id);
          const canDelete = !project.isDefault && !isVirtualAll;
          
          return (
            <Panel
              key={project.id}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                // Special styling for "All" virtual project
                ...(isVirtualAll ? {
                  background: 'linear-gradient(135deg, var(--accent-subtle) 0%, var(--bg-panel) 100%)',
                  borderColor: 'var(--accent)',
                  borderStyle: 'dashed',
                } : {}),
              }}
              onClick={() => setSelectedProjectId(project.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.background = isVirtualAll 
                  ? 'linear-gradient(135deg, var(--accent-subtle) 0%, var(--bg-hover) 100%)'
                  : 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isVirtualAll ? 'var(--accent)' : 'var(--border)';
                e.currentTarget.style.background = isVirtualAll 
                  ? 'linear-gradient(135deg, var(--accent-subtle) 0%, var(--bg-panel) 100%)'
                  : 'var(--bg-panel)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div>
                  <div style={{ 
                    fontWeight: 600, 
                    fontSize: 'var(--text-base)', 
                    color: isVirtualAll ? 'var(--accent)' : 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    {isVirtualAll && <span style={{ fontSize: '14px' }}>📊</span>}
                    {project.name}
                    {isVirtualAll && (
                      <span style={{ 
                        fontSize: 'var(--text-xs)', 
                        background: 'var(--accent)', 
                        color: 'var(--accent-text)',
                        padding: '1px 6px',
                        borderRadius: 8,
                        fontWeight: 500,
                      }}>
                        Aggregate
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: '2px' }}>{project.description}</div>
                  )}
                </div>
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                <span>{cols.length} collections</span>
                <span>•</span>
                <span>{its.length} bookmarks</span>
              </div>
            </Panel>
          );
        };

        if (!activeProject) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 28 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  Choose a project to view its collections and bookmarks.
                </div>
                <button
                  onClick={handleCreateProject}
                  style={{
                    padding: '3px 10px',
                    height: 24,
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: 'var(--text-xs)',
                    background: 'var(--accent)',
                    color: 'var(--accent-text)',
                    border: 'none',
                    borderRadius: 4,
                  }}
                >
                  + New Project
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '8px',
                }}
              >
                {projects.length === 0 && (
                  <Panel style={{ borderStyle: 'dashed', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No projects yet. Create one to get started.
                  </Panel>
                )}
                {allProjectsWithVirtual.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </div>
          );
        }

        // New Project Dashboard (Phase 1)
        return (
          <ProjectDashboard
            project={activeProject}
            collections={collections}
            items={items}
            projects={projects}
            onBack={() => setSelectedProjectId(null)}
            onUpdateItem={onUpdateBookmark}
            onDeleteItem={onDeleteBookmark}
            onRefresh={onRefresh}
          />
        );
      case 'bookmarks':
        // Get item count for a project
        const getProjectItemCount = (projectId: string) => {
          const projectCollectionIds = new Set(
            collections
              .filter(c => c.primaryProjectId === projectId || 
                          (Array.isArray(c.projectIds) && c.projectIds.includes(projectId)))
              .map(c => c.id)
          );
          return items.filter(item => 
            (item.collectionIds || []).some(cid => projectCollectionIds.has(cid))
          ).length;
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28, flexShrink: 0, marginBottom: '-4px' }}>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                Bookmarks
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* View mode toggle */}
                <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px' }}>
                  <button
                    onClick={() => setBookmarkViewMode('list')}
                    style={{
                      padding: '2px 6px',
                      height: 20,
                      background: bookmarkViewMode === 'list' ? 'var(--accent-weak)' : 'transparent',
                      color: bookmarkViewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                    title="List view"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => setBookmarkViewMode('grid')}
                    style={{
                      padding: '2px 6px',
                      height: 20,
                      background: bookmarkViewMode === 'grid' ? 'var(--accent-weak)' : 'transparent',
                      color: bookmarkViewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                    title="Grid view"
                  >
                    <Grid size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div style={{ flexShrink: 0 }}>
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="⌘K Search bookmarks..."
              />
            </div>

            {/* Main area: project nav + items */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${bookmarkListWidth}px 4px 1fr`,
                gap: '4px',
                flex: 1,
                minHeight: 0,
              }}
            >
              {/* Left: Project navigation */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                }}>
                  Projects
                </div>
                <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                  {/* "All" option */}
                  <div
                    onClick={() => setSelectedBookmarkProjectId('all')}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: selectedBookmarkProjectId === 'all' ? 'var(--accent-weak)' : 'transparent',
                      borderLeft: selectedBookmarkProjectId === 'all' ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: '2px',
                      fontSize: 'var(--text-sm)',
                      color: selectedBookmarkProjectId === 'all' ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: selectedBookmarkProjectId === 'all' ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedBookmarkProjectId !== 'all') {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedBookmarkProjectId !== 'all') {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📊</span>
                      <span>All</span>
                      <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                        {items.length}
                      </span>
                    </div>
                  </div>
                  
                  {/* Project list */}
                  {projects.map((project) => {
                    const projectItemCount = getProjectItemCount(project.id);
                    
                    return (
                      <div
                        key={project.id}
                        onClick={() => setSelectedBookmarkProjectId(project.id)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: selectedBookmarkProjectId === project.id ? 'var(--accent-weak)' : 'transparent',
                          borderLeft: selectedBookmarkProjectId === project.id ? '2px solid var(--accent)' : '2px solid transparent',
                          marginBottom: '2px',
                          fontSize: 'var(--text-sm)',
                          color: selectedBookmarkProjectId === project.id ? 'var(--text)' : 'var(--text-muted)',
                          fontWeight: selectedBookmarkProjectId === project.id ? 500 : 400,
                        }}
                        onMouseEnter={(e) => {
                          if (selectedBookmarkProjectId !== project.id) {
                            e.currentTarget.style.background = 'var(--bg-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedBookmarkProjectId !== project.id) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📁</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {project.name}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                            {projectItemCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  setBookmarkListWidth((w) => Math.min(Math.max(200, w + delta), 400));
                }}
              />

              {/* Right: Items grid */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                  {filteredBookmarkItems.length === 0 ? (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: '100%',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-sm)'
                    }}>
                      {searchQuery.trim() ? 'No bookmarks found' : 'No bookmarks'}
                    </div>
                  ) : bookmarkViewMode === 'list' ? (
                    // List view
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {filteredBookmarkItems.map((item) => {
                        const collection = getItemCollection(item);
                        const project = collection ? getCollectionProject(collection) : null;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              if (item.url) {
                                openInNewTab(item.url);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setBookmarkContextMenu({ item, x: e.clientX, y: e.clientY });
                            }}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--bg-glass)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              overflow: 'hidden',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--bg-hover)';
                              e.currentTarget.style.borderColor = 'var(--accent)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'var(--bg-glass)';
                              e.currentTarget.style.borderColor = 'var(--border)';
                            }}
                          >
                            {/* Title and URL */}
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ 
                                fontWeight: 600, 
                                fontSize: 'var(--text-sm)', 
                                color: 'var(--text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginBottom: '2px',
                              }}>
                                {item.title || 'Untitled'}
                              </div>
                              {item.url && (
                                <div style={{ 
                                  fontSize: 'var(--text-xs)', 
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {item.url}
                                </div>
                              )}
                            </div>
                            
                            {/* Collection and Project tags */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '6px', 
                              flexWrap: 'nowrap',
                              flexShrink: 0,
                              alignItems: 'center',
                            }}>
                              {collection && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {collection.name}
                                </span>
                              )}
                              {project && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {project.name}
                                </span>
                              )}
                              {/* Open icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingItem(item);
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  transition: 'all 0.1s ease',
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                title="Open detail"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Grid view
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '12px',
                    }}>
                      {filteredBookmarkItems.map((item) => {
                        const collection = getItemCollection(item);
                        const project = collection ? getCollectionProject(collection) : null;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              if (item.url) {
                                openInNewTab(item.url);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setBookmarkContextMenu({ item, x: e.clientX, y: e.clientY });
                            }}
                            style={{
                              padding: '12px',
                              background: 'var(--bg-glass)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              overflow: 'hidden',
                              minHeight: 0,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--bg-hover)';
                              e.currentTarget.style.borderColor = 'var(--accent)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'var(--bg-glass)';
                              e.currentTarget.style.borderColor = 'var(--border)';
                            }}
                          >
                            {/* Title */}
                            <div style={{ 
                              fontWeight: 600, 
                              fontSize: 'var(--text-base)', 
                              color: 'var(--text)',
                              lineHeight: 1.3,
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}>
                              {item.title || 'Untitled'}
                            </div>
                            
                            {/* URL */}
                            {item.url && (
                              <div style={{ 
                                fontSize: 'var(--text-xs)', 
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                wordBreak: 'break-all',
                              }}>
                                {item.url}
                              </div>
                            )}
                            
                            {/* Notes preview */}
                            {item.notes && (
                              <div style={{ 
                                fontSize: 'var(--text-xs)', 
                                color: 'var(--text-muted)',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                lineHeight: 1.4,
                                wordBreak: 'break-word',
                              }}>
                                {item.notes}
                              </div>
                            )}
                            
                            {/* Collection and Project tags */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '6px', 
                              flexWrap: 'wrap',
                              marginTop: 'auto',
                              paddingTop: '8px',
                              borderTop: '1px solid var(--border)',
                              overflow: 'hidden',
                              alignItems: 'center',
                            }}>
                              {collection && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                }}>
                                  {collection.name}
                                </span>
                              )}
                              {project && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                }}>
                                  {project.name}
                                </span>
                              )}
                              {/* Open icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingItem(item);
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  transition: 'all 0.1s ease',
                                  marginLeft: 'auto',
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                title="Open detail"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Panel>
            </div>
            
            {/* Context menu */}
            {bookmarkContextMenu && (
              <ItemContextMenu
                item={bookmarkContextMenu.item}
                x={bookmarkContextMenu.x}
                y={bookmarkContextMenu.y}
                onClose={() => setBookmarkContextMenu(null)}
                onEdit={handleEditItem}
                onDelete={(item) => {
                  if (onDeleteBookmark) {
                    onDeleteBookmark(item.id);
                  }
                  setBookmarkContextMenu(null);
                }}
                onOpenInNewTab={(item) => {
                  if (item.url) {
                    openInNewTab(item.url);
                  }
                  setBookmarkContextMenu(null);
                }}
              />
            )}
          </div>
        );
      case 'notes':
        // Get item count for a project (for notes)
        const getNotesProjectItemCount = (projectId: string) => {
          const projectCollectionIds = new Set(
            collections
              .filter(c => c.primaryProjectId === projectId || 
                          (Array.isArray(c.projectIds) && c.projectIds.includes(projectId)))
              .map(c => c.id)
          );
          return notesItems.filter(item => 
            (item.collectionIds || []).some(cid => projectCollectionIds.has(cid))
          ).length;
        };


        const handleNoteSave = async () => {
          if (!selectedNote || !onUpdateBookmark) return;
          await onUpdateBookmark(selectedNote.id, { notes: editNoteContent.trim() || undefined });
          setIsEditingNote(false);
        };

        const handleNoteCancel = () => {
          setIsEditingNote(false);
          if (selectedNote) {
            setEditNoteContent(selectedNote.notes || '');
          }
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28, flexShrink: 0, marginBottom: '-4px' }}>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                Notes
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* View mode toggle */}
                <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px' }}>
                  <button
                    onClick={() => setNotesViewMode('list')}
                    style={{
                      padding: '2px 6px',
                      height: 20,
                      background: notesViewMode === 'list' ? 'var(--accent-weak)' : 'transparent',
                      color: notesViewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                    title="List view"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => setNotesViewMode('grid')}
                    style={{
                      padding: '2px 6px',
                      height: 20,
                      background: notesViewMode === 'grid' ? 'var(--accent-weak)' : 'transparent',
                      color: notesViewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                    title="Grid view"
                  >
                    <Grid size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div style={{ flexShrink: 0 }}>
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="⌘K Search notes..."
              />
            </div>

            {/* Main area: project nav + items + detail */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${notesListWidth}px 4px 1fr 4px ${notesDetailWidth}px`,
                gap: '4px',
                flex: 1,
                minHeight: 0,
              }}
            >
              {/* Left: Project navigation */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                }}>
                  Projects
                </div>
                <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                  {/* "All" option */}
                  <div
                    onClick={() => setSelectedNotesProjectId('all')}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: selectedNotesProjectId === 'all' ? 'var(--accent-weak)' : 'transparent',
                      borderLeft: selectedNotesProjectId === 'all' ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: '2px',
                      fontSize: 'var(--text-sm)',
                      color: selectedNotesProjectId === 'all' ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: selectedNotesProjectId === 'all' ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedNotesProjectId !== 'all') {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedNotesProjectId !== 'all') {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📊</span>
                      <span>All</span>
                      <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                        {notesItems.length}
                      </span>
                    </div>
                  </div>
                  
                  {/* Project list */}
                  {projects.map((project) => {
                    const projectNotesCount = getNotesProjectItemCount(project.id);
                    
                    return (
                      <div
                        key={project.id}
                        onClick={() => setSelectedNotesProjectId(project.id)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: selectedNotesProjectId === project.id ? 'var(--accent-weak)' : 'transparent',
                          borderLeft: selectedNotesProjectId === project.id ? '2px solid var(--accent)' : '2px solid transparent',
                          marginBottom: '2px',
                          fontSize: 'var(--text-sm)',
                          color: selectedNotesProjectId === project.id ? 'var(--text)' : 'var(--text-muted)',
                          fontWeight: selectedNotesProjectId === project.id ? 500 : 400,
                        }}
                        onMouseEnter={(e) => {
                          if (selectedNotesProjectId !== project.id) {
                            e.currentTarget.style.background = 'var(--bg-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedNotesProjectId !== project.id) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📁</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {project.name}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                            {projectNotesCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  setNotesListWidth((w) => Math.min(Math.max(200, w + delta), 400));
                }}
              />

              {/* Middle: Notes grid/list */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                  {filteredNotesItems.length === 0 ? (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: '100%',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-sm)'
                    }}>
                      {searchQuery.trim() ? 'No notes found' : 'No notes'}
                    </div>
                  ) : notesViewMode === 'list' ? (
                    // List view
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {filteredNotesItems.map((item) => {
                        const collection = getItemCollection(item);
                        const project = collection ? getCollectionProject(collection) : null;
                        const isSelected = item.id === selectedNoteId;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedNoteId(item.id);
                              setIsEditingNote(false);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setNotesContextMenu({ item, x: e.clientX, y: e.clientY });
                            }}
                            style={{
                              padding: '8px 12px',
                              background: isSelected ? 'var(--accent-weak)' : 'var(--bg-glass)',
                              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              overflow: 'hidden',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.borderColor = 'var(--accent)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-glass)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                              }
                            }}
                          >
                            {/* Title and preview */}
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ 
                                fontWeight: 600, 
                                fontSize: 'var(--text-sm)', 
                                color: 'var(--text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginBottom: '2px',
                              }}>
                                {item.title || 'Untitled'}
                              </div>
                              {item.notes && (
                                <div style={{ 
                                  fontSize: 'var(--text-xs)', 
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {item.notes.substring(0, 80)}...
                                </div>
                              )}
                            </div>
                            
                            {/* Collection and Project tags */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '6px', 
                              flexWrap: 'nowrap',
                              flexShrink: 0,
                              alignItems: 'center',
                            }}>
                              {collection && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {collection.name}
                                </span>
                              )}
                              {project && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {project.name}
                                </span>
                              )}
                              {/* Open icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedNoteId(item.id);
                                  setIsEditingNote(false);
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  transition: 'all 0.1s ease',
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                title="Open detail"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Grid view
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '12px',
                    }}>
                      {filteredNotesItems.map((item) => {
                        const collection = getItemCollection(item);
                        const project = collection ? getCollectionProject(collection) : null;
                        const isSelected = item.id === selectedNoteId;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedNoteId(item.id);
                              setIsEditingNote(false);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setNotesContextMenu({ item, x: e.clientX, y: e.clientY });
                            }}
                            style={{
                              padding: '12px',
                              background: isSelected ? 'var(--accent-weak)' : 'var(--bg-glass)',
                              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                              borderRadius: 8,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              overflow: 'hidden',
                              minHeight: 0,
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                                e.currentTarget.style.borderColor = 'var(--accent)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'var(--bg-glass)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                              }
                            }}
                          >
                            {/* Title */}
                            <div style={{ 
                              fontWeight: 600, 
                              fontSize: 'var(--text-base)', 
                              color: 'var(--text)',
                              lineHeight: 1.3,
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}>
                              {item.title || 'Untitled'}
                            </div>
                            
                            {/* Notes preview */}
                            {item.notes && (
                              <div style={{ 
                                fontSize: 'var(--text-xs)', 
                                color: 'var(--text-muted)',
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                lineHeight: 1.4,
                                wordBreak: 'break-word',
                              }}>
                                {item.notes}
                              </div>
                            )}
                            
                            {/* Collection and Project tags */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '6px', 
                              flexWrap: 'wrap',
                              marginTop: 'auto',
                              paddingTop: '8px',
                              borderTop: '1px solid var(--border)',
                              overflow: 'hidden',
                              alignItems: 'center',
                            }}>
                              {collection && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                }}>
                                  {collection.name}
                                </span>
                              )}
                              {project && (
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 3,
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                }}>
                                  {project.name}
                                </span>
                              )}
                              {/* Open icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedNoteId(item.id);
                                  setIsEditingNote(false);
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  transition: 'all 0.1s ease',
                                  marginLeft: 'auto',
                                  flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                title="Open detail"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Panel>

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  setNotesDetailWidth((w) => Math.min(Math.max(300, w - delta), 600));
                }}
              />

              {/* Right: Note detail panel */}
              <Panel style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0, 
                padding: 0,
                overflow: 'hidden'
              }}>
                {selectedNote ? (
                  <div className="scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                  {/* Header */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                        {selectedNote.title || 'Untitled'}
                      </h2>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {!isEditingNote && onUpdateBookmark && (
                          <button
                            onClick={() => setIsEditingNote(true)}
                            style={{
                              padding: '4px 8px',
                              fontSize: 'var(--text-xs)',
                              background: 'var(--bg-glass)',
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              color: 'var(--text)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        )}
                        {onDeleteBookmark && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this note?')) {
                                onDeleteBookmark(selectedNote.id);
                                setSelectedNoteId(null);
                              }
                            }}
                            style={{
                              padding: '4px 8px',
                              fontSize: 'var(--text-xs)',
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Context */}
                    {(() => {
                      const itemCollection = getItemCollection(selectedNote);
                      const itemProject = itemCollection ? getCollectionProject(itemCollection) : null;
                      
                      return (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          {itemCollection && (
                            <span>📂 {itemCollection.name}</span>
                          )}
                          {itemProject && (
                            <>
                              <span>•</span>
                              <span>📁 {itemProject.name}</span>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Metadata */}
                    <div style={{ display: 'flex', gap: '12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        <span>Updated: {formatDateTime(selectedNote.updated_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes content */}
                  {isEditingNote ? (
                    <div>
                      <textarea
                        value={editNoteContent}
                        onChange={(e) => setEditNoteContent(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '300px',
                          padding: '12px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          color: 'var(--text)',
                          fontSize: 'var(--text-sm)',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          lineHeight: 1.6,
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button
                          onClick={handleNoteCancel}
                          style={{
                            padding: '6px 12px',
                            fontSize: 'var(--text-xs)',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            color: 'var(--text)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleNoteSave}
                          style={{
                            padding: '6px 12px',
                            fontSize: 'var(--text-xs)',
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: 4,
                            color: 'var(--accent-text)',
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
                      {selectedNote.notes || 'No content'}
                    </div>
                  )}
                </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    Select a note to view
                  </div>
                )}
              </Panel>
            </div>
            
            {/* Context menu */}
            {notesContextMenu && (
              <ItemContextMenu
                item={notesContextMenu.item}
                x={notesContextMenu.x}
                y={notesContextMenu.y}
                onClose={() => setNotesContextMenu(null)}
                onEdit={onUpdateBookmark ? (itemToEdit) => {
                  setSelectedNoteId(itemToEdit.id);
                  setIsEditingNote(true);
                  setEditNoteContent(itemToEdit.notes || '');
                  setNotesContextMenu(null);
                } : undefined}
                onDelete={onDeleteBookmark ? (itemToDelete) => {
                  onDeleteBookmark(itemToDelete.id);
                  if (selectedNoteId === itemToDelete.id) {
                    setSelectedNoteId(null);
                  }
                  setNotesContextMenu(null);
                } : undefined}
                onOpenInNewTab={(itemToOpen) => {
                  if (itemToOpen.url) openInNewTab(itemToOpen.url);
                  setNotesContextMenu(null);
                }}
              />
            )}
          </div>
        );
      case 'workspaces':
        if (workspaces.length === 0) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
              <div style={{ textAlign: 'center', maxWidth: '520px' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111827' }}>No workspaces yet</div>
                <div style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.95rem', lineHeight: 1.5 }}>
                  Save a snapshot from <b>Tab Commander</b> (bottom panel) and it will show up here.
                </div>
              </div>
            </div>
          );
        }

        // Card list page: pick a workspace
        if (!selectedWorkspace) {
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
              {workspaces.map((ws) => {
                const totalTabs = ws.windows.reduce((sum, w) => sum + w.tabs.length, 0);
                return (
                  <Panel
                    key={ws.id}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                    onClick={() => {
                      setSelectedWorkspaceId(ws.id);
                      setSelectedWindowIds(new Set());
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.background = 'var(--bg-panel)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--text)' }}>{ws.name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                      <span>{ws.windows.length} windows</span>
                      <span>•</span>
                      <span>{totalTabs} tabs</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {new Date(ws.updated_at).toLocaleDateString()}
                    </div>
                  </Panel>
                );
              })}
            </div>
          );
        }

        // Detail page: back + two-column (windows left, tabs right) like Tab Commander
        const selectedWindows = selectedWindowIds.size === 0
          ? selectedWorkspace.windows
          : selectedWorkspace.windows.filter((w) => selectedWindowIds.has(w.id));

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  setSelectedWorkspaceId(null);
                  setSelectedWindowIds(new Set());
                }}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  cursor: 'pointer',
                  fontWeight: 800,
                  color: '#374151',
                }}
              >
                ← Back
              </button>
              <div>
                <div style={{ fontWeight: 900, color: '#111827', fontSize: '1.1rem' }}>{selectedWorkspace.name}</div>
                <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                  Updated {new Date(selectedWorkspace.updated_at).toLocaleString()} • {selectedWorkspace.windows.length} windows
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '0.75rem', flex: 1, minHeight: 0 }}>
              {/* Windows column */}
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  background: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ fontWeight: 900, color: '#111827' }}>Windows</div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    <button
                      onClick={handleRestoreAll}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #2563eb',
                        background: '#2563eb',
                        color: 'white',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Restore all
                    </button>
                    <button
                      onClick={handleRestoreSelected}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        color: '#111827',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Restore selected
                    </button>
                    <button
                      onClick={selectAllWindows}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        color: '#111827',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Select all
                    </button>
                    <button
                      onClick={clearWindowSelection}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        color: '#111827',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                  {selectedWorkspace.windows.map((w) => {
                    const isChecked = selectedWindowIds.size === 0 ? true : selectedWindowIds.has(w.id);
                    return (
                      <div
                        key={w.id}
                        onClick={() => toggleWindowSelection(w.id)}
                        style={{
                          padding: '0.6rem',
                          marginBottom: '0.35rem',
                          borderRadius: '0.6rem',
                          border: isChecked ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                          background: isChecked ? '#eef2ff' : 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleWindowSelection(w.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb' }}
                              title="Select window"
                            />
                            <div style={{ fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {w.name || 'Window'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 900,
                                background: '#f3f4f6',
                                border: '1px solid #e5e7eb',
                                borderRadius: '9999px',
                                padding: '0.1rem 0.45rem',
                                color: '#374151',
                              }}
                            >
                              {w.tabs.length}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestoreSingle(w.id);
                              }}
                              style={{
                                padding: '0.3rem 0.45rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #e5e7eb',
                                background: 'white',
                                cursor: 'pointer',
                                fontWeight: 800,
                                color: '#374151',
                              }}
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabs column */}
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  background: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  minHeight: 0,
                }}
              >
                <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 900, color: '#111827', fontSize: '1rem' }}>Tabs</div>
                  <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                    {selectedWindows.length} window(s) • {selectedWindows.reduce((sum, w) => sum + w.tabs.length, 0)} tabs
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
                  {selectedWindows.length === 0 && (
                    <div style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>Select a window to view tabs.</div>
                  )}
                  {selectedWindows.flatMap((w) =>
                    w.tabs.map((t, idx) => (
                      <div
                        key={`${w.id}-${idx}`}
                        onClick={() => handleOpenLinkHere(t.url)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.35rem 0.25rem',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          border: '1px solid transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                        title={t.url}
                      >
                        {t.favIconUrl ? (
                          <img src={t.favIconUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 14, height: 14, borderRadius: 2, background: '#e5e7eb', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 800,
                              color: '#111827',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t.title || 'Untitled'}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t.url}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 'collections':
        return (
          <CollectionsView
            collections={collections}
            projects={projects}
            items={items}
            onItemClick={undefined}
            onUpdateItem={onUpdateBookmark}
            onDeleteItem={(item) => {
              if (onDeleteBookmark) onDeleteBookmark(item.id);
            }}
          />
        );
      default:
        return <div>Select a view</div>;
    }
  };

  return (
    <div style={{ 
      height: '100%', 
      width: '100%', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      {!(activeView === 'projects' && selectedProjectId !== null) && (
        <div style={{ 
          marginBottom: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          flexShrink: 0,
          height: 28,
        }}>
          <h1 style={{ 
            fontSize: 'var(--text-lg)', 
            fontWeight: 600, 
            color: 'var(--text)',
            margin: 0,
            textTransform: 'capitalize',
          }}>
            {activeView}
          </h1>
          {activeView === 'bookmarks' ? (
            <button style={{
              padding: '3px 10px',
              height: 24,
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
            }}
            onClick={() => setShowAddModal(true)}
            >
              <span>+ New bookmark</span>
            </button>
          ) : (
            <div />
          )}
        </div>
      )}
      
      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderContent()}
      </div>

      {/* Add bookmark modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1rem', width: '420px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>Add bookmark</div>
              <button onClick={() => setShowAddModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>URL</label>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Title (optional)</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title"
                  style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Collection</label>
                <select
                  value={newCollectionId || ''}
                  onChange={(e) => setNewCollectionId(e.target.value || undefined)}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem', background: 'white' }}
                >
                  <option value="">Unsorted</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSubmit}
                  style={{ padding: '0.5rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #111827', background: '#111827', color: 'white', cursor: 'pointer', fontWeight: 800 }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item detail view modal */}
      {viewingItem && !editingItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}
        onClick={() => setViewingItem(null)}
        >
          <div 
            style={{ 
              background: 'var(--bg-panel)', 
              borderRadius: '0.75rem', 
              padding: '1.5rem', 
              width: '600px', 
              maxWidth: '90%', 
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-panel)', 
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
            onClick={(e) => e.stopPropagation()}
            className="scrollbar"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)' }}>
                {viewingItem.title || 'Untitled'}
              </h2>
              <button 
                onClick={() => setViewingItem(null)} 
                style={{ 
                  border: 'none', 
                  background: 'transparent', 
                  cursor: 'pointer', 
                  color: 'var(--text-muted)', 
                  fontSize: '1.5rem',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
            
            {/* URL */}
            {viewingItem.url && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  URL
                </div>
                <a
                  href={viewingItem.url}
                  onClick={(e) => {
                    e.preventDefault();
                    if (viewingItem.url) {
                      chrome.tabs.create({ url: viewingItem.url });
                    }
                  }}
                  style={{
                    color: 'var(--accent)',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: 'var(--text-sm)',
                    wordBreak: 'break-all',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  <ExternalLink size={14} />
                  {viewingItem.url}
                </a>
              </div>
            )}
            
            {/* Notes */}
            {viewingItem.notes && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Notes
                </div>
                <div style={{ 
                  padding: '0.75rem', 
                  background: 'var(--bg-glass)', 
                  borderRadius: '0.5rem', 
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text)',
                }}>
                  {viewingItem.notes}
                </div>
              </div>
            )}
            
            {/* Collection and Project tags */}
            {(() => {
              const itemCollection = getItemCollection(viewingItem);
              const itemProject = itemCollection ? getCollectionProject(itemCollection) : null;
              
              if (itemCollection || itemProject) {
                return (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Organization
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {itemProject && (
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text)',
                        }}>
                          📁 {itemProject.name}
                        </span>
                      )}
                      {itemCollection && (
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text)',
                        }}>
                          📂 {itemCollection.name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            
            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setViewingItem(null)}
                style={{ 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '0.5rem', 
                  border: '1px solid var(--border)', 
                  background: 'var(--bg)', 
                  cursor: 'pointer', 
                  fontWeight: 500,
                  color: 'var(--text)',
                }}
              >
                Close
              </button>
              {onUpdateBookmark && (
                <button
                  onClick={() => {
                    setEditingItem(viewingItem);
                    setEditTitle(viewingItem.title || '');
                    setEditNotes(viewingItem.notes || '');
                    setEditCollectionId(viewingItem.collectionIds?.[0]);
                    setViewingItem(null);
                  }}
                  style={{ 
                    padding: '0.5rem 0.9rem', 
                    borderRadius: '0.5rem', 
                    border: '1px solid var(--accent)', 
                    background: 'var(--accent)', 
                    color: 'var(--accent-text)', 
                    cursor: 'pointer', 
                    fontWeight: 600,
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit bookmark modal */}
      {editingItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1rem', width: '440px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>Edit bookmark</div>
              <button onClick={closeEditModal} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Title</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem', resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>Collection</label>
                <select
                  value={editCollectionId || ''}
                  onChange={(e) => setEditCollectionId(e.target.value || undefined)}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem', background: 'white' }}
                >
                  <option value="">Unsorted</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  onClick={closeEditModal}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  style={{ padding: '0.5rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #111827', background: '#111827', color: 'white', cursor: 'pointer', fontWeight: 800 }}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
