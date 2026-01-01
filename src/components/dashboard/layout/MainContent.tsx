import React, { useMemo, useState } from 'react';
import { Workspace, Item, Collection, Project, addProject, deleteProject, addCollection } from '../../../lib/db';
import { DashboardView } from './DashboardLayout';
import type { WindowGroup } from '../../../App';
import { HomeView } from '../HomeView';
import { TabCommanderView } from '../TabCommanderView';

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

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [
        item.title,
        item.url,
        item.notes || '',
        item.tags.join(' ')
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [items, searchQuery]);

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

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString();
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
        const activeProject = selectedProjectId
          ? projects.find((p) => p.id === selectedProjectId) || null
          : null;

        const collectionsForProject = (pid: string | null) => {
          if (!pid) return [];
          return collections.filter((c) => (c.projectIds || []).includes(pid));
        };

        const itemsForProject = (pid: string | null) => {
          if (!pid) return [];
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
          const cols = collectionsForProject(project.id);
          const its = itemsForProject(project.id);
          return (
            <div
              key={project.id}
              style={{
                background: 'white',
                padding: '1.25rem',
                borderRadius: '0.75rem',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                cursor: 'pointer',
                transition: 'box-shadow 0.2s, transform 0.1s',
              }}
              onClick={() => setSelectedProjectId(project.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.08)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                e.currentTarget.style.transform = 'translateY(0px)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{project.name}</div>
                  {project.description && (
                    <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem' }}>{project.description}</div>
                  )}
                </div>
                {!project.isDefault && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                    style={{
                      border: 'none',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      borderRadius: '9999px',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', color: '#6b7280', fontSize: '0.85rem' }}>
                <span>{cols.length} collections</span>
                <span>•</span>
                <span>{its.length} bookmarks</span>
              </div>
            </div>
          );
        };

        if (!activeProject) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>Projects</div>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Choose a project to view its collections and bookmarks.</div>
                </div>
                <button
                  onClick={handleCreateProject}
                  style={{
                    background: '#111827',
                    color: 'white',
                    border: '1px solid #111827',
                    borderRadius: '0.5rem',
                    padding: '0.5rem 0.9rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
                >
                  + New Project
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '1rem',
                }}
              >
                {projects.length === 0 && (
                  <div
                    style={{
                      background: 'white',
                      border: '1px dashed #e5e7eb',
                      borderRadius: '0.75rem',
                      padding: '1rem',
                      textAlign: 'center',
                      color: '#6b7280',
                    }}
                  >
                    No projects yet. Create one to get started.
                  </div>
                )}
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </div>
          );
        }

        // Project detail view
        const cols = collectionsForProject(activeProject.id);
        const its = itemsForProject(activeProject.id);

        const handleAddCollectionToProject = async () => {
          const name = window.prompt('Collection name?');
          if (!name || !name.trim()) return;
          await addCollection(name.trim(), undefined, activeProject.id);
          if (onRefresh) await onRefresh();
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <button
                  onClick={() => setSelectedProjectId(null)}
                  style={{
                    border: '1px solid #e5e7eb',
                    background: 'white',
                    borderRadius: '0.5rem',
                    padding: '0.35rem 0.65rem',
                    marginRight: '0.5rem',
                    cursor: 'pointer',
                  }}
                >
                  ← Back
                </button>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                  {activeProject.name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!activeProject.isDefault && (
                  <button
                    onClick={() => handleDeleteProject(activeProject.id)}
                    style={{
                      border: '1px solid #fca5a5',
                      background: '#fef2f2',
                      color: '#b91c1c',
                      borderRadius: '0.5rem',
                      padding: '0.35rem 0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Delete Project
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '0.75rem',
                padding: '1rem',
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: '160px' }}>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Collections</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{cols.length}</div>
              </div>
              <div style={{ minWidth: '160px' }}>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Bookmarks</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{its.length}</div>
              </div>
            </div>

            <div
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '0.75rem',
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 700 }}>Collections in this project</div>
                <button
                  onClick={handleAddCollectionToProject}
                  style={{
                    border: '1px solid #e5e7eb',
                    background: 'white',
                    borderRadius: '0.5rem',
                    padding: '0.35rem 0.65rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  + Add Collection
                </button>
              </div>
              {cols.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No collections yet.</div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {cols.map((c) => (
                    <span
                      key={c.id}
                      style={{
                        padding: '0.35rem 0.55rem',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        borderRadius: '9999px',
                        fontSize: '0.85rem',
                        border: '1px solid #dbeafe',
                      }}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '0.75rem',
                padding: '1rem',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Bookmarks in this project</div>
              {its.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No bookmarks yet.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
                  {its.map((it) => (
                    <div
                      key={it.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.65rem',
                        padding: '0.75rem',
                        background: 'white',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem', color: '#111827' }}>
                        {it.title}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getDomain(it.url)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      case 'bookmarks':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.75rem',
              padding: '0.75rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'center'
            }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, url, tags, notes..."
                style={{
                  flex: '1 1 240px',
                  minWidth: '240px',
                  padding: '0.55rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.9rem'
                }}
              />
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  padding: '0.55rem 0.9rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #111827',
                  background: '#111827',
                  color: 'white',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Add bookmark
              </button>
            </div>

            <div style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.75rem',
              padding: '0.5rem',
              minHeight: '200px'
            }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: '1.25rem', textAlign: 'center', color: '#6b7280' }}>
                  No bookmarks yet. Add one from here or save the current tab.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 220px 140px 160px',
                        gap: '0.5rem',
                        alignItems: 'center',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '0.6rem',
                        border: '1px solid #f3f4f6',
                        transition: 'border-color 0.2s, box-shadow 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.03)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f3f4f6'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                        {item.favicon ? (
                          <img src={item.favicon} alt="" style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 18, height: 18, borderRadius: 4, background: '#e5e7eb', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, color: '#111827', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title || 'Untitled'}
                          </div>
                          <div style={{ color: '#6b7280', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getDomain(item.url)}
                          </div>
                        </div>
                      </div>

                      <div style={{ color: '#6b7280', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.url}>
                        {item.url}
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {item.tags && item.tags.length > 0 ? (
                          item.tags.map((t) => (
                            <span key={t} style={{ fontSize: '0.75rem', background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '0.1rem 0.45rem', borderRadius: '9999px', color: '#374151' }}>
                              {t}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>—</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{formatDate(item.created_at)}</span>
                        <button
                          onClick={() => openInNewTab(item.url)}
                          style={{
                            padding: '0.35rem 0.55rem',
                            borderRadius: '0.45rem',
                            border: '1px solid #e5e7eb',
                            background: 'white',
                            cursor: 'pointer',
                            fontWeight: 700,
                            color: '#111827'
                          }}
                        >
                          Open
                        </button>
                        <button
                          onClick={() => handleEditItem(item)}
                          style={{
                            padding: '0.35rem 0.55rem',
                            borderRadius: '0.45rem',
                            border: '1px solid #e5e7eb',
                            background: 'white',
                            cursor: 'pointer',
                            fontWeight: 700,
                            color: '#111827'
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          style={{
                            padding: '0.35rem 0.55rem',
                            borderRadius: '0.45rem',
                            border: '1px solid #ef4444',
                            background: '#fef2f2',
                            cursor: 'pointer',
                            fontWeight: 700,
                            color: '#b91c1c'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      case 'notes':
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '1.5rem',
            height: '100%'
          }}>
            {/* Note List */}
            <div style={{
              borderRight: '1px solid #e5e7eb',
              paddingRight: '1.5rem',
              overflowY: 'auto'
            }}>
              {[1, 2, 3, 4].map((i) => (
                <div 
                  key={i} 
                  style={{
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    border: '1px solid transparent',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  <h4 style={{ 
                    fontWeight: 500, 
                    color: '#111827', 
                    marginBottom: '0.25rem',
                    margin: '0 0 0.25rem 0'
                  }}>
                    Meeting Notes {i}
                  </h4>
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    margin: '0 0 0.5rem 0'
                  }}>
                    Discussion about the new architecture and how we plan to migrate the database...
                  </p>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: '#9ca3af', 
                    display: 'block' 
                  }}>
                    2 hours ago
                  </span>
                </div>
              ))}
            </div>
            {/* Editor Placeholder */}
            <div style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              padding: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af'
            }}>
              Select a note to view
            </div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.75rem',
                    padding: '0.75rem',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setSelectedWorkspaceId(ws.id);
                    setSelectedWindowIds(new Set());
                  }}
                  title={ws.name}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 900, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.name}
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '9999px', padding: '0.125rem 0.5rem', color: '#374151' }}>
                      {ws.windows.length} windows
                    </span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.375rem' }}>
                    Updated {new Date(ws.updated_at).toLocaleString()}
                  </div>
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{
                        padding: '0.375rem 0.5rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        cursor: 'pointer',
                        fontWeight: 800,
                        color: '#374151',
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
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
      <div style={{ 
        marginBottom: '1.5rem', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <h1 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 'bold', 
          color: '#111827',
          margin: 0,
          textTransform: 'capitalize'
        }}>
          {activeView}
        </h1>
        {activeView === 'bookmarks' ? (
          <button style={{
            padding: '0.5rem 1rem',
            background: '#2563eb',
            color: 'white',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}
          onClick={() => setShowAddModal(true)}
          >
            <span>+ New bookmark</span>
          </button>
        ) : (
          <div />
        )}
      </div>
      
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
