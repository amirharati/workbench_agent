import React, { useState, useEffect } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { MainContent } from './MainContent';
import { WindowGroup } from '../../../App';
import { Workspace, Collection, Item, Project } from '../../../lib/db';
import type { BackupStatusSnapshot } from '../../../lib/backupCoordinator';
import type { AISettings } from '../../../lib/ai/types';
import { X } from 'lucide-react';

export type DashboardView =
  | 'home'
  | 'settings'
  | 'projects'
  | 'tab-commander'
  | 'bookmarks'
  | 'notes'
  | 'collections'
  | 'workspaces';

export interface ItemTab {
  id: string;
  type: 'bookmark' | 'note' | 'workspace' | 'bookmark-list' | 'note-list';
  title: string;
  // For list tabs, store the item IDs
  itemIds?: string[];
}

const FULL_PAGE_VIEWS = new Set<DashboardView>(['settings', 'tab-commander']);

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
  aiSettings?: AISettings;
  onSaveAISettings?: (settings: AISettings) => Promise<void>;
  onTestAI?: (
    settings: AISettings,
    prompt: string
  ) => Promise<{ text: string; model: string; requestedModel?: string; modelMismatch?: boolean }>;
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
  aiSettings,
  onSaveAISettings,
  onTestAI,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>('bookmarks');
  const [scopeProjectId, setScopeProjectId] = useState<string | 'all'>('all');
  const [scopeCollectionId, setScopeCollectionId] = useState<string | 'all'>('all');
  
  // Item tabs - persist across navigation
  const [openItemTabs, setOpenItemTabs] = useState<ItemTab[]>([]);
  const [activeItemTabId, setActiveItemTabId] = useState<string | null>(null);
  
  // Workspace link selection (key = "wsId:winIdx:tabIdx")
  const [selectedWsLinks, setSelectedWsLinks] = useState<Set<string>>(new Set());
  
  // Workspace link action dialogs
  const [removeConfirm, setRemoveConfirm] = useState<{ tabs: { url: string; title?: string }[]; wsId: string } | null>(null);
  const [bookmarkDialog, setBookmarkDialog] = useState<{ tabs: { url: string; title?: string }[] } | null>(null);
  const [bookmarkProjectId, setBookmarkProjectId] = useState<string>('');
  const [bookmarkCollectionId, setBookmarkCollectionId] = useState<string>('');
  
  // Item tab editing state
  const [isEditingItem, setIsEditingItem] = useState(false);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemUrl, setEditItemUrl] = useState('');
  const [editItemNotes, setEditItemNotes] = useState('');
  
  // Right panel AI state
  const [rightPrompt, setRightPrompt] = useState('');
  const [rightAnswer, setRightAnswer] = useState('');
  const [rightError, setRightError] = useState('');
  const [rightRunning, setRightRunning] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (!current) {
      document.documentElement.dataset.theme = 'dark';
    }
  }, []);

  const handleSelectView = (view: DashboardView) => {
    setActiveView(view);
  };

  const handleSelectProjectScope = (projectId: string | 'all') => {
    setScopeProjectId(projectId);
    setScopeCollectionId('all');
  };

  const handleSelectCollectionScope = (collectionId: string, projectId?: string) => {
    setScopeCollectionId(collectionId);
    if (projectId) setScopeProjectId(projectId);
  };

  const handleOpenItemTab = (item: Item) => {
    const type = item.url && item.url.trim() ? 'bookmark' : 'note';
    const exists = openItemTabs.find((t) => t.id === item.id);
    if (!exists) {
      setOpenItemTabs((prev) => [...prev, { id: item.id, type, title: item.title || 'Untitled' }]);
    }
    setActiveItemTabId(item.id);
  };

  const handleOpenWorkspaceTab = (workspace: Workspace) => {
    const exists = openItemTabs.find((t) => t.id === workspace.id);
    if (!exists) {
      setOpenItemTabs((prev) => [...prev, { id: workspace.id, type: 'workspace', title: workspace.name }]);
    }
    setActiveItemTabId(workspace.id);
  };

  const handleOpenListTab = (type: 'bookmark-list' | 'note-list', itemIds: string[], title: string) => {
    // Create a unique ID based on content
    const tabId = `${type}-${itemIds.slice(0, 5).join('-')}-${itemIds.length}`;
    const exists = openItemTabs.find((t) => t.id === tabId);
    if (!exists) {
      setOpenItemTabs((prev) => [...prev, { id: tabId, type, title, itemIds }]);
    }
    setActiveItemTabId(tabId);
  };

  const activeTabWorkspace = activeItemTabId ? workspaces.find((ws) => ws.id === activeItemTabId) : null;
  const activeListTab = activeItemTabId ? openItemTabs.find((t) => t.id === activeItemTabId && (t.type === 'bookmark-list' || t.type === 'note-list')) : null;
  const activeListItems = activeListTab?.itemIds ? items.filter(i => activeListTab.itemIds!.includes(i.id)) : [];

  const handleCloseItemTab = (tabId: string) => {
    setOpenItemTabs((prev) => {
      const index = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      if (activeItemTabId === tabId && next.length > 0) {
        setActiveItemTabId(next[Math.min(index, next.length - 1)]?.id ?? null);
      } else if (next.length === 0) {
        setActiveItemTabId(null);
      }
      return next;
    });
  };

  const activeTabItem = activeItemTabId ? items.find((i) => i.id === activeItemTabId) : null;

  const runRightAssist = async () => {
    const prompt = rightPrompt.trim();
    if (!prompt) {
      setRightError('Enter a prompt.');
      return;
    }
    if (!onTestAI || !aiSettings) {
      setRightError('Configure AI in Settings first.');
      return;
    }
    setRightRunning(true);
    setRightError('');
    setRightAnswer('');
    try {
      const scopeSummary =
        scopeCollectionId !== 'all'
          ? `collection:${scopeCollectionId}`
          : scopeProjectId !== 'all'
            ? `project:${scopeProjectId}`
            : 'all';
      const result = await onTestAI(
        aiSettings,
        `Context view=${activeView}; scope=${scopeSummary}\n\nUser prompt:\n${prompt}`
      );
      setRightAnswer(result.text.trim());
    } catch (error) {
      setRightError(error instanceof Error ? error.message : 'AI request failed.');
    } finally {
      setRightRunning(false);
    }
  };

  const isFullPageView = FULL_PAGE_VIEWS.has(activeView);

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
      {/* Left Sidebar */}
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
          onSelectView={handleSelectView}
          projects={projects}
          collections={collections}
          items={items}
          scopeProjectId={scopeProjectId}
          scopeCollectionId={scopeCollectionId}
          onSelectProjectScope={handleSelectProjectScope}
          onSelectCollectionScope={handleSelectCollectionScope}
        />
      </div>

      {/* Middle + Right Area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', background: 'var(--bg)' }}>
        
        {/* Middle workspace */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          
          {isFullPageView ? (
            // Full-page views (Settings, Tab Commander, Workspaces)
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }} className="scrollbar">
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
                aiSettings={aiSettings}
                onSaveAISettings={onSaveAISettings}
                onTestAI={onTestAI}
                scopeProjectId={scopeProjectId}
                scopeCollectionId={scopeCollectionId}
              />
            </div>
          ) : (
            // Split view: List pane (left) + Tabbed detail pane (right)
            <div style={{ flex: 1, display: 'flex', gap: 1, overflow: 'hidden' }}>
              
              {/* LIST PANE - left middle */}
              <div style={{ 
                width: 280, 
                flexShrink: 0, 
                display: 'flex', 
                flexDirection: 'column',
                borderRight: '1px solid var(--border)',
                background: 'var(--bg-panel)',
              }}>
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
                  aiSettings={aiSettings}
                  onSaveAISettings={onSaveAISettings}
                  onTestAI={onTestAI}
                  scopeProjectId={scopeProjectId}
                  scopeCollectionId={scopeCollectionId}
                  listMode
                  onOpenItem={handleOpenItemTab}
                  onOpenWorkspace={handleOpenWorkspaceTab}
                  onOpenListTab={handleOpenListTab}
                />
              </div>

              {/* TABBED DETAIL PANE - right middle */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Tab strip */}
                <div 
                  style={{ 
                    height: 36, 
                    display: 'flex', 
                    alignItems: 'flex-end',
                    gap: 2,
                    paddingLeft: 8,
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-panel)',
                    flexShrink: 0,
                    overflowX: 'auto',
                  }}
                  className="scrollbar"
                >
                  {openItemTabs.length === 0 && (
                    <div style={{ 
                      padding: '8px 12px', 
                      fontSize: 'var(--text-xs)', 
                      color: 'var(--text-faint)',
                    }}>
                      Click an item to open it here
                    </div>
                  )}
                  {openItemTabs.map((tab) => {
                    const isActive = activeItemTabId === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveItemTabId(tab.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 30,
                          padding: '0 10px',
                          borderRadius: '6px 6px 0 0',
                          border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                          borderBottom: isActive ? '1px solid var(--bg)' : '1px solid transparent',
                          background: isActive ? 'var(--bg)' : 'transparent',
                          color: isActive ? 'var(--text)' : 'var(--text-muted)',
                          fontSize: 'var(--text-sm)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          maxWidth: 180,
                        }}
                        title={tab.title}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tab.title || 'Untitled'}
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseItemTab(tab.id);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 16,
                            height: 16,
                            borderRadius: 3,
                            color: 'var(--text-faint)',
                          }}
                          title="Close tab"
                        >
                          <X size={12} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab content */}
                <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--bg)' }} className="scrollbar">
                  {activeTabWorkspace ? (() => {
                    // Compute all link keys for this workspace
                    const allLinkKeys: string[] = [];
                    activeTabWorkspace.windows.forEach((win, winIdx) => {
                      win.tabs.forEach((_, tabIdx) => {
                        allLinkKeys.push(`${activeTabWorkspace.id}:${winIdx}:${tabIdx}`);
                      });
                    });
                    const selectedCount = allLinkKeys.filter(k => selectedWsLinks.has(k)).length;
                    const allSelected = selectedCount === allLinkKeys.length && allLinkKeys.length > 0;
                    const someSelected = selectedCount > 0;
                    
                    const toggleAll = () => {
                      if (allSelected) {
                        setSelectedWsLinks(prev => {
                          const next = new Set(prev);
                          allLinkKeys.forEach(k => next.delete(k));
                          return next;
                        });
                      } else {
                        setSelectedWsLinks(prev => {
                          const next = new Set(prev);
                          allLinkKeys.forEach(k => next.add(k));
                          return next;
                        });
                      }
                    };
                    
                    const getSelectedTabs = () => {
                      const tabs: { url: string; title?: string }[] = [];
                      activeTabWorkspace.windows.forEach((win, winIdx) => {
                        win.tabs.forEach((tab, tabIdx) => {
                          if (selectedWsLinks.has(`${activeTabWorkspace.id}:${winIdx}:${tabIdx}`)) {
                            tabs.push(tab);
                          }
                        });
                      });
                      return tabs;
                    };
                    
                    const openSelected = () => {
                      getSelectedTabs().forEach(tab => {
                        if (tab.url) window.open(tab.url, '_blank');
                      });
                    };
                    
                    const showBookmarkDialog = (tabs: { url: string; title?: string }[]) => {
                      // Set default project/collection based on scope
                      const defaultProject = scopeProjectId !== 'all' ? scopeProjectId : '';
                      const defaultCollection = scopeCollectionId !== 'all' ? scopeCollectionId : '';
                      setBookmarkProjectId(defaultProject);
                      setBookmarkCollectionId(defaultCollection);
                      setBookmarkDialog({ tabs });
                    };
                    
                    const clearSelectionForWs = () => {
                      setSelectedWsLinks(prev => {
                        const next = new Set(prev);
                        allLinkKeys.forEach(k => next.delete(k));
                        return next;
                      });
                    };
                    
                    // Get collections for selected project
                    const projectCollections = bookmarkProjectId 
                      ? collections.filter(c => 
                          c.primaryProjectId === bookmarkProjectId || 
                          (Array.isArray(c.projectIds) && c.projectIds.includes(bookmarkProjectId)))
                      : [];
                    
                    return (
                      <div style={{ maxWidth: 700 }}>
                        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 4 }}>
                          {activeTabWorkspace.name}
                        </h2>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginBottom: 16 }}>
                          {allLinkKeys.length} links · {activeTabWorkspace.windows.length} window{activeTabWorkspace.windows.length !== 1 ? 's' : ''}
                          {!activeTabWorkspace.projectId && <span style={{ marginLeft: 8, color: 'var(--warning, #f59e0b)' }}>detached</span>}
                        </div>
                        
                        {/* Selection actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={toggleAll}
                              style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                            Select all
                          </label>
                          
                          {someSelected && (
                            <>
                              <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                                {selectedCount} selected
                              </span>
                              <button
                                onClick={openSelected}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: 'var(--accent)',
                                  color: '#fff',
                                  fontSize: 'var(--text-xs)',
                                  cursor: 'pointer',
                                }}
                              >
                                Open
                              </button>
                              <button
                                onClick={() => showBookmarkDialog(getSelectedTabs())}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                  color: 'var(--text)',
                                  fontSize: 'var(--text-xs)',
                                  cursor: 'pointer',
                                }}
                              >
                                Bookmark
                              </button>
                              <button
                                onClick={() => setRemoveConfirm({ tabs: getSelectedTabs(), wsId: activeTabWorkspace.id })}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                  color: '#ef4444',
                                  fontSize: 'var(--text-xs)',
                                  cursor: 'pointer',
                                }}
                              >
                                Remove
                              </button>
                            </>
                          )}
                          
                          {!someSelected && (
                            <button
                              onClick={() => {
                                activeTabWorkspace.windows.forEach(w => {
                                  w.tabs.forEach(tab => {
                                    if (tab.url) window.open(tab.url, '_blank');
                                  });
                                });
                              }}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: 'none',
                                background: 'var(--accent)',
                                color: '#fff',
                                fontSize: 'var(--text-xs)',
                                cursor: 'pointer',
                              }}
                            >
                              Open all
                            </button>
                          )}
                        </div>
                        
                        {/* Remove Confirmation Dialog */}
                        {removeConfirm && (
                          <div style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                          }}>
                            <div style={{
                              background: 'var(--bg-panel)',
                              borderRadius: 8,
                              padding: 20,
                              maxWidth: 400,
                              width: '90%',
                              maxHeight: '80vh',
                              overflow: 'auto',
                            }}>
                              <h3 style={{ margin: '0 0 12px', fontSize: 'var(--text-base)', fontWeight: 600 }}>
                                Remove {removeConfirm.tabs.length} link{removeConfirm.tabs.length !== 1 ? 's' : ''}?
                              </h3>
                              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 16 }}>
                                The following will be removed from this workspace:
                              </div>
                              <ul style={{ margin: '0 0 16px', paddingLeft: 20, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', maxHeight: 150, overflow: 'auto' }}>
                                {removeConfirm.tabs.slice(0, 10).map((tab, i) => (
                                  <li key={i} style={{ marginBottom: 4 }}>{tab.title || tab.url}</li>
                                ))}
                                {removeConfirm.tabs.length > 10 && (
                                  <li>...and {removeConfirm.tabs.length - 10} more</li>
                                )}
                              </ul>
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => setRemoveConfirm(null)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--text)',
                                    fontSize: 'var(--text-sm)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    // TODO: Actually remove tabs from workspace
                                    // For now, just clear selection and close
                                    clearSelectionForWs();
                                    setRemoveConfirm(null);
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: '#ef4444',
                                    color: '#fff',
                                    fontSize: 'var(--text-sm)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Bookmark Dialog */}
                        {bookmarkDialog && (
                          <div style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                          }}>
                            <div style={{
                              background: 'var(--bg-panel)',
                              borderRadius: 8,
                              padding: 20,
                              maxWidth: 400,
                              width: '90%',
                            }}>
                              <h3 style={{ margin: '0 0 16px', fontSize: 'var(--text-base)', fontWeight: 600 }}>
                                Add {bookmarkDialog.tabs.length} link{bookmarkDialog.tabs.length !== 1 ? 's' : ''} to bookmarks
                              </h3>
                              
                              <div style={{ marginBottom: 12 }}>
                                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, marginBottom: 4, color: 'var(--text-muted)' }}>
                                  Project
                                </label>
                                <select
                                  value={bookmarkProjectId}
                                  onChange={(e) => {
                                    setBookmarkProjectId(e.target.value);
                                    setBookmarkCollectionId('');
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-input)',
                                    color: 'var(--text)',
                                    fontSize: 'var(--text-sm)',
                                  }}
                                >
                                  <option value="">Select a project...</option>
                                  {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              </div>
                              
                              <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, marginBottom: 4, color: 'var(--text-muted)' }}>
                                  Collection
                                </label>
                                <select
                                  value={bookmarkCollectionId}
                                  onChange={(e) => setBookmarkCollectionId(e.target.value)}
                                  disabled={!bookmarkProjectId}
                                  style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-input)',
                                    color: 'var(--text)',
                                    fontSize: 'var(--text-sm)',
                                    opacity: bookmarkProjectId ? 1 : 0.5,
                                  }}
                                >
                                  <option value="">Select a collection...</option>
                                  {projectCollections.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                              
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => setBookmarkDialog(null)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--text)',
                                    fontSize: 'var(--text-sm)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!bookmarkCollectionId) return;
                                    for (const tab of bookmarkDialog.tabs) {
                                      if (tab.url && onAddBookmark) {
                                        await onAddBookmark(tab.url, tab.title, bookmarkCollectionId);
                                      }
                                    }
                                    clearSelectionForWs();
                                    setBookmarkDialog(null);
                                  }}
                                  disabled={!bookmarkCollectionId}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: bookmarkCollectionId ? 'var(--accent)' : 'var(--accent-weak)',
                                    color: '#fff',
                                    fontSize: 'var(--text-sm)',
                                    cursor: bookmarkCollectionId ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  Add to Bookmarks
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {activeTabWorkspace.windows.map((win, winIdx) => (
                          <div key={win.id || winIdx} style={{ marginBottom: 16 }}>
                            {activeTabWorkspace.windows.length > 1 && (
                              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase' }}>
                                Window {winIdx + 1} ({win.tabs.length})
                              </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {win.tabs.map((tab, tabIdx) => {
                                const linkKey = `${activeTabWorkspace.id}:${winIdx}:${tabIdx}`;
                                const isSelected = selectedWsLinks.has(linkKey);
                                
                                const toggleSelection = () => {
                                  setSelectedWsLinks(prev => {
                                    const next = new Set(prev);
                                    if (isSelected) {
                                      next.delete(linkKey);
                                    } else {
                                      next.add(linkKey);
                                    }
                                    return next;
                                  });
                                };
                                
                                return (
                                  <label
                                    key={tabIdx}
                                    style={{
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      background: isSelected ? 'var(--accent-weak)' : 'var(--bg-panel)',
                                      border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={toggleSelection}
                                      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                                    />
                                    {tab.favIconUrl && (
                                      <img src={tab.favIconUrl} alt="" style={{ width: 16, height: 16, borderRadius: 2, flexShrink: 0 }} />
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {tab.title || tab.url || 'Untitled'}
                                      </div>
                                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {tab.url}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (tab.url) window.open(tab.url, '_blank');
                                        }}
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: 4,
                                          border: '1px solid var(--border)',
                                          background: 'transparent',
                                          color: 'var(--text-muted)',
                                          fontSize: 'var(--text-xs)',
                                          cursor: 'pointer',
                                        }}
                                        title="Open in new tab"
                                      >
                                        Open
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          showBookmarkDialog([tab]);
                                        }}
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: 4,
                                          border: '1px solid var(--border)',
                                          background: 'transparent',
                                          color: 'var(--text-muted)',
                                          fontSize: 'var(--text-xs)',
                                          cursor: 'pointer',
                                        }}
                                        title="Add to bookmarks"
                                      >
                                        +
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setRemoveConfirm({ tabs: [tab], wsId: activeTabWorkspace.id });
                                        }}
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: 4,
                                          border: '1px solid var(--border)',
                                          background: 'transparent',
                                          color: '#ef4444',
                                          fontSize: 'var(--text-xs)',
                                          cursor: 'pointer',
                                        }}
                                        title="Remove from workspace"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })() : activeListTab && activeListItems.length > 0 ? (
                    // Bookmark-list or Note-list tab content
                    <div style={{ maxWidth: 700 }}>
                      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 4 }}>
                        {activeListTab.title}
                      </h2>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginBottom: 16 }}>
                        {activeListItems.length} {activeListTab.type === 'bookmark-list' ? 'bookmark' : 'note'}{activeListItems.length !== 1 ? 's' : ''}
                      </div>
                      
                      {activeListTab.type === 'bookmark-list' && (
                        <button
                          onClick={() => {
                            activeListItems.forEach(item => {
                              if (item.url) window.open(item.url, '_blank');
                            });
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: 'var(--accent)',
                            color: '#fff',
                            fontSize: 'var(--text-sm)',
                            cursor: 'pointer',
                            marginBottom: 16,
                          }}
                        >
                          Open all links
                        </button>
                      )}
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {activeListItems.map(item => (
                          <div
                            key={item.id}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 6,
                              background: 'var(--bg-panel)',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 10,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 2 }}>
                                {item.title || 'Untitled'}
                              </div>
                              {item.url && (
                                <a 
                                  href={item.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  style={{ 
                                    fontSize: 'var(--text-xs)', 
                                    color: 'var(--accent)',
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {item.url}
                                </a>
                              )}
                              {item.notes && (
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                                  {item.notes.length > 100 ? item.notes.slice(0, 100) + '...' : item.notes}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {item.url && (
                                <button
                                  onClick={() => window.open(item.url, '_blank')}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--text-muted)',
                                    fontSize: 'var(--text-xs)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Open
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenItemTab(item)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                  color: 'var(--text-muted)',
                                  fontSize: 'var(--text-xs)',
                                  cursor: 'pointer',
                                }}
                              >
                                View
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : activeTabItem ? (() => {
                    const isBookmark = !!activeTabItem.url;
                    const startEditing = () => {
                      setEditItemTitle(activeTabItem.title || '');
                      setEditItemUrl(activeTabItem.url || '');
                      setEditItemNotes(activeTabItem.notes || '');
                      setIsEditingItem(true);
                    };
                    const cancelEditing = () => {
                      setIsEditingItem(false);
                    };
                    const saveEditing = async () => {
                      if (onUpdateBookmark) {
                        await onUpdateBookmark(activeTabItem.id, {
                          title: editItemTitle,
                          url: editItemUrl || undefined,
                          notes: editItemNotes || undefined,
                          updated_at: Date.now(),
                        });
                        // Update the tab title
                        setOpenItemTabs(prev => prev.map(t => 
                          t.id === activeTabItem.id ? { ...t, title: editItemTitle || 'Untitled' } : t
                        ));
                      }
                      setIsEditingItem(false);
                    };
                    
                    return (
                      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Header with actions */}
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'flex-start',
                          marginBottom: 16,
                          gap: 16,
                        }}>
                          <div style={{ flex: 1 }}>
                            {isEditingItem ? (
                              <input
                                type="text"
                                value={editItemTitle}
                                onChange={(e) => setEditItemTitle(e.target.value)}
                                placeholder="Title"
                                style={{
                                  width: '100%',
                                  fontSize: 'var(--text-lg)',
                                  fontWeight: 600,
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--bg-input)',
                                  color: 'var(--text)',
                                }}
                              />
                            ) : (
                              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>
                                {activeTabItem.title || 'Untitled'}
                              </h2>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            {!isEditingItem ? (
                              <>
                                {isBookmark && (
                                  <button
                                    onClick={() => window.open(activeTabItem.url, '_blank')}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: 'var(--accent)',
                                      color: '#fff',
                                      fontSize: 'var(--text-sm)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Open
                                  </button>
                                )}
                                <button
                                  onClick={startEditing}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--text)',
                                    fontSize: 'var(--text-sm)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    if (onDeleteBookmark && activeTabItem) {
                                      onDeleteBookmark(activeTabItem.id);
                                      handleCloseItemTab(activeTabItem.id);
                                    }
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: '#ef4444',
                                    fontSize: 'var(--text-sm)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={cancelEditing}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--text-muted)',
                                    fontSize: 'var(--text-sm)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={saveEditing}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: 'var(--accent)',
                                    color: '#fff',
                                    fontSize: 'var(--text-sm)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Save
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {/* URL (for bookmarks) */}
                        {(isBookmark || isEditingItem) && (
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ 
                              display: 'block', 
                              fontSize: 'var(--text-xs)', 
                              fontWeight: 500, 
                              color: 'var(--text-muted)', 
                              marginBottom: 4,
                              textTransform: 'uppercase',
                            }}>
                              URL
                            </label>
                            {isEditingItem ? (
                              <input
                                type="url"
                                value={editItemUrl}
                                onChange={(e) => setEditItemUrl(e.target.value)}
                                placeholder="https://..."
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--bg-input)',
                                  color: 'var(--text)',
                                  fontSize: 'var(--text-sm)',
                                }}
                              />
                            ) : (
                              <a 
                                href={activeTabItem.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ 
                                  color: 'var(--accent)', 
                                  fontSize: 'var(--text-sm)',
                                  wordBreak: 'break-all',
                                }}
                              >
                                {activeTabItem.url}
                              </a>
                            )}
                          </div>
                        )}
                        
                        {/* Notes */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                          <label style={{ 
                            display: 'block', 
                            fontSize: 'var(--text-xs)', 
                            fontWeight: 500, 
                            color: 'var(--text-muted)', 
                            marginBottom: 4,
                            textTransform: 'uppercase',
                          }}>
                            Notes
                          </label>
                          {isEditingItem ? (
                            <textarea
                              value={editItemNotes}
                              onChange={(e) => setEditItemNotes(e.target.value)}
                              placeholder="Add notes..."
                              style={{
                                flex: 1,
                                minHeight: 200,
                                padding: '12px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-input)',
                                color: 'var(--text)',
                                fontSize: 'var(--text-sm)',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                              }}
                            />
                          ) : (
                            <div style={{ 
                              flex: 1,
                              padding: 12, 
                              background: 'var(--bg-panel)', 
                              borderRadius: 6,
                              fontSize: 'var(--text-sm)',
                              whiteSpace: 'pre-wrap',
                              overflowY: 'auto',
                              color: activeTabItem.notes ? 'var(--text)' : 'var(--text-faint)',
                              minHeight: 100,
                            }}>
                              {activeTabItem.notes || 'No notes yet. Click Edit to add some.'}
                            </div>
                          )}
                        </div>
                        
                        {/* Metadata footer */}
                        <div style={{ 
                          marginTop: 16, 
                          paddingTop: 12, 
                          borderTop: '1px solid var(--border)',
                          fontSize: 'var(--text-xs)', 
                          color: 'var(--text-faint)',
                          display: 'flex',
                          gap: 16,
                        }}>
                          <span>Created: {new Date(activeTabItem.created_at).toLocaleDateString()}</span>
                          <span>Updated: {new Date(activeTabItem.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })() : (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: '100%',
                      color: 'var(--text-faint)',
                      fontSize: 'var(--text-sm)',
                    }}>
                      Select an item from the list to view details
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Assistant Panel */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            Assistant
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
            <textarea
              value={rightPrompt}
              onChange={(e) => setRightPrompt(e.target.value)}
              placeholder="Ask AI..."
              style={{
                width: '100%',
                minHeight: 80,
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                borderRadius: 6,
                padding: '8px',
                fontSize: 'var(--text-sm)',
                resize: 'vertical',
              }}
            />
            <button
              onClick={runRightAssist}
              disabled={rightRunning}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: rightRunning ? 'var(--accent-weak)' : 'var(--accent)',
                color: '#fff',
                cursor: rightRunning ? 'progress' : 'pointer',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
              }}
            >
              {rightRunning ? 'Asking…' : 'Ask'}
            </button>
            {rightError && <div style={{ color: '#ef4444', fontSize: 'var(--text-xs)' }}>{rightError}</div>}
            <div 
              className="scrollbar" 
              style={{ 
                flex: 1, 
                minHeight: 0, 
                overflowY: 'auto', 
                fontSize: 'var(--text-sm)', 
                color: 'var(--text)', 
                whiteSpace: 'pre-wrap',
                padding: 8,
                background: 'var(--bg)',
                borderRadius: 6,
              }}
            >
              {rightAnswer || 'Output appears here'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
