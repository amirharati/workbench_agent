import React, { useMemo, useState } from 'react';
import { Workspace, Item, Collection, Project, addProject, deleteProject, ALL_PROJECTS_ID } from '../../../lib/db';
import { DashboardView } from './DashboardLayout';
import type { WindowGroup } from '../../../App';
import { HomeView } from '../HomeView';
import { TabCommanderView } from '../TabCommanderView';
import { ProjectDashboard } from '../ProjectDashboard';
import { CollectionsView } from '../CollectionsView';
import { NotesView } from '../NotesView';
import { ItemsListPanel } from '../ItemsListPanel';
import { CollectionPills } from '../CollectionPills';
import { SearchBar } from '../SearchBar';
import { TabBar, TabBarTab } from '../TabBar';
import { TabContent } from '../TabContent';
import { Resizer } from '../Resizer';
import { Panel } from '../../../styles/primitives';

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
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | 'all'>('all');
  const [bookmarkTabs, setBookmarkTabs] = useState<Array<{ id: string; title: string; itemId: string }>>([]);
  const [activeBookmarkTabId, setActiveBookmarkTabId] = useState<string | null>(null);
  const [bookmarkListWidth, setBookmarkListWidth] = useState(320);
  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) || null,
    [workspaces, selectedWorkspaceId]
  );

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

  // Get all collections for filtering (bookmarks view)
  const allCollections = useMemo(() => {
    return collections.filter((c) => !c.isDefault || c.name === 'Unsorted');
  }, [collections]);

  // Get item counts per collection (bookmarks view)
  const collectionItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      (item.collectionIds || []).forEach((cid) => {
        counts[cid] = (counts[cid] || 0) + 1;
      });
    });
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    let filtered = items;

    // Filter by collection (for bookmarks view)
    if (selectedCollectionId !== 'all') {
      filtered = filtered.filter((item) => (item.collectionIds || []).includes(selectedCollectionId));
    }

    // Filter by search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((item) => {
        const haystack = [
          item.title,
          item.url,
          item.notes || '',
          item.tags.join(' ')
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    return filtered;
  }, [items, searchQuery, selectedCollectionId]);

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

  const handleDelete = async (id: string) => {
    if (!onDeleteBookmark) return;
    await onDeleteBookmark(id);
  };

  // formatDate moved to utils - keeping for backward compatibility if needed
  // const formatDate = (ts: number) => {
  //   const d = new Date(ts);
  //   return d.toLocaleDateString();
  // };

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
        // Handle item click - open in tab
        const handleBookmarkItemClick = (item: Item) => {
          // If item is already open, focus it
          const existingTab = bookmarkTabs.find((t) => t.itemId === item.id);
          if (existingTab) {
            setActiveBookmarkTabId(existingTab.id);
            return;
          }

          // Create new tab
          const newTab = {
            id: item.id,
            title: item.title || 'Untitled',
            itemId: item.id,
          };
          setBookmarkTabs((prev) => [...prev, newTab]);
          setActiveBookmarkTabId(newTab.id);
        };

        const handleBookmarkTabClose = (tabId: string) => {
          setBookmarkTabs((prev) => prev.filter((t) => t.id !== tabId));
          if (activeBookmarkTabId === tabId) {
            const remaining = bookmarkTabs.filter((t) => t.id !== tabId);
            setActiveBookmarkTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
          }
        };

        const activeBookmarkTab = bookmarkTabs.find((t) => t.id === activeBookmarkTabId) || null;
        const activeBookmarkItem = activeBookmarkTab?.itemId ? items.find((i) => i.id === activeBookmarkTab.itemId) || null : null;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28 }}>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                Bookmarks
              </h1>
            </div>

            {/* Filters: Collection pills + Search */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <CollectionPills
                collections={allCollections}
                selectedId={selectedCollectionId}
                onSelect={setSelectedCollectionId}
                totalItems={items.length}
                getCountForCollection={(cid) => collectionItemCounts[cid] || 0}
                maxVisible={4}
              />
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="⌘K Search bookmarks..."
              />
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  padding: '3px 10px',
                  height: 24,
                  background: 'var(--accent)',
                  color: 'var(--accent-text)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                }}
              >
                + New
              </button>
            </div>

            {/* Main area: items list + content */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${bookmarkListWidth}px 4px 1fr`,
                gap: '4px',
                flex: 1,
                minHeight: 0,
              }}
            >
              {/* Items list */}
              <ItemsListPanel
                items={filteredItems}
                activeItemId={activeBookmarkItem?.id || null}
                onItemClick={handleBookmarkItemClick}
                title={selectedCollectionId === 'all' ? 'All Bookmarks' : collections.find((c) => c.id === selectedCollectionId)?.name || 'Bookmarks'}
                onNew={() => setShowAddModal(true)}
                onEdit={handleEditItem}
                onDelete={(item) => handleDelete(item.id)}
                onOpenInNewTab={(item) => {
                  if (item.url) openInNewTab(item.url);
                }}
              />

              <Resizer
                direction="vertical"
                onResize={(delta) => {
                  setBookmarkListWidth((w) => Math.min(Math.max(200, w + delta), 600));
                }}
              />

              {/* Tabbed content area */}
              <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
                <TabBar
                  tabs={bookmarkTabs as TabBarTab[]}
                  activeTabId={activeBookmarkTabId}
                  onTabSelect={setActiveBookmarkTabId}
                  onTabClose={handleBookmarkTabClose}
                  spaceId="bookmarks"
                />
                <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <TabContent
                    tab={activeBookmarkTab}
                    item={activeBookmarkItem || null}
                    items={items}
                    collections={collections}
                    projects={projects}
                    onUpdateItem={onUpdateBookmark}
                    onDeleteItem={(item) => {
                      handleDelete(item.id);
                      // Close tab if open
                      if (bookmarkTabs.find((t) => t.itemId === item.id)) {
                        handleBookmarkTabClose(item.id);
                      }
                    }}
                  />
                </div>
              </Panel>
            </div>
          </div>
        );
      case 'notes':
        return (
          <NotesView
            items={items}
            collections={collections}
            projects={projects}
            onItemClick={(_item) => {
              // Optionally open in a tab or navigate
            }}
            onUpdateItem={onUpdateBookmark}
          />
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
