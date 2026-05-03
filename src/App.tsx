import React, { useState, useEffect } from 'react';
import { Layout } from 'lucide-react';
import { 
  addItem, 
  exportDB, 
  importDB, 
  verifyBackup,
  getAllProjects,
  getAllCollections, 
  getAllWorkspaces,
  getAllItems,
  updateItem,
  deleteItem,
  Collection,
  Workspace,
  Item,
  Project
} from './lib/db';
import { DashboardLayout } from './components/dashboard/layout/DashboardLayout';
import { SidePanelView } from './components/SidePanelView';
import { BackupOnboardingModal } from './components/BackupOnboardingModal';
import {
  shouldShowBackupOnboarding,
  setBackupFolderOnboarding,
  requestBackupOnboardingOpen,
} from './lib/backupOnboarding';
import {
  pickAndPersistBackupFolder,
  hasWritableBackupFolder,
  getBackupFolderName,
} from './lib/backupFolder';

export interface WindowGroup {
  windowId: number;
  tabs: chrome.tabs.Tab[];
}

function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isSidePanel, setIsSidePanel] = useState(false);
  const [currentWindows, setCurrentWindows] = useState<WindowGroup[]>([]);
  const [status, setStatus] = useState('');
  const [showBackupOnboarding, setShowBackupOnboarding] = useState(false);
  const [backupFolderReady, setBackupFolderReady] = useState(false);
  const [backupFolderName, setBackupFolderName] = useState<string | null>(null);

  const refreshBackupFolderStatus = async () => {
    try {
      const ready = await hasWritableBackupFolder();
      const name = await getBackupFolderName();
      setBackupFolderReady(ready);
      setBackupFolderName(name);
    } catch {
      setBackupFolderReady(false);
      setBackupFolderName(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const show = await shouldShowBackupOnboarding();
        if (!cancelled && show) setShowBackupOnboarding(true);
        if (!cancelled) await refreshBackupFolderStatus();
      } catch (e) {
        console.error('Backup onboarding check failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect context
  useEffect(() => {
    const checkContext = () => setIsSidePanel(window.innerWidth < 500);
    checkContext();
    window.addEventListener('resize', checkContext);
    return () => window.removeEventListener('resize', checkContext);
  }, []);

  // Load windows
  const loadCurrentWindows = async () => {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      const windowGroups: WindowGroup[] = windows
        .filter((w) => w.tabs && w.tabs.length > 0)
        .map((w) => ({
          windowId: w.id!,
          tabs: w.tabs!.filter((t) => t.url && !t.url.startsWith('chrome://')),
        }));
      setCurrentWindows(windowGroups);
    } catch (e) {
      console.error('Failed to load windows:', e);
    }
  };

  useEffect(() => {
    loadCurrentWindows();
    const handleTabUpdate = () => loadCurrentWindows();
    chrome.tabs.onCreated.addListener(handleTabUpdate);
    chrome.tabs.onRemoved.addListener(handleTabUpdate);
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    return () => {
      chrome.tabs.onCreated.removeListener(handleTabUpdate);
      chrome.tabs.onRemoved.removeListener(handleTabUpdate);
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    };
  }, []);

  // Load data
  const loadData = async () => {
    const allProjects = await getAllProjects();
    setProjects(allProjects);
    const allCollections = await getAllCollections();
    setCollections(allCollections);
    const allWorkspaces = await getAllWorkspaces();
    setWorkspaces(allWorkspaces);
    const allItems = await getAllItems();
    setItems(allItems.sort((a, b) => b.created_at - a.created_at));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handlers
  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2000);
  };

  const handleSaveCurrentTab = async (collectionId?: string) => {
    const tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    const tab = tabs[0];
    if (tab && tab.url && tab.url.startsWith('http')) {
      const collectionIds = collectionId ? [collectionId] : [];
      await addItem({
        url: tab.url,
        title: tab.title || 'Untitled',
        favicon: tab.favIconUrl,
        tags: [],
        source: 'tab',
        collectionIds,
      });
      showStatus('Tab saved!');
      await loadData();
    } else {
      showStatus('Cannot save this page');
    }
  };

  const handleAddBookmark = async (url: string, title?: string, collectionId?: string) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      showStatus('Please enter a valid http(s) URL');
      return;
    }
    const cleanTitle = title && title.trim().length > 0 ? title.trim() : url;
    const collectionIds = collectionId ? [collectionId] : [];
    await addItem({
      url,
      title: cleanTitle,
      favicon: undefined,
      tags: [],
      source: 'manual',
      collectionIds,
    });
    showStatus('Bookmark added');
    await loadData();
  };

  const handleUpdateBookmark = async (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => {
    await updateItem(id, updates);
    await loadData();
    showStatus('Bookmark updated');
  };

  const handleDeleteBookmark = async (id: string) => {
    await deleteItem(id);
    await loadData();
    showStatus('Bookmark deleted');
  };

  const handleExport = async () => {
    try {
    const json = await exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
      // Include full timestamp for better organization
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `workbench-backup-${timestamp}.json`;
    a.click();
      URL.revokeObjectURL(url);
      showStatus('Backup exported!');
    } catch (error) {
      console.error('Export failed:', error);
      showStatus('Failed to export backup');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImportFile(file, 'replace');
  };

  const handleImportFile = async (file: File, mode: 'replace' | 'merge' = 'replace') => {
    if (mode === 'merge') {
      showStatus('Merge import is coming soon. Please use Replace for now.');
      return;
    }
    
    try {
    const text = await file.text();
      
      // Verify backup before importing
      const verification = verifyBackup(text);
      if (!verification.valid) {
        showStatus(`Invalid backup file: ${verification.error}`);
        return;
      }
      
      // Show stats and confirm
      const stats = verification.stats;
      const confirmMessage = `This will replace all current data with:\n` +
        `- ${stats.projects} projects\n` +
        `- ${stats.collections} collections\n` +
        `- ${stats.items} bookmarks\n` +
        `- ${stats.notes} notes\n` +
        `- ${stats.workspaces} workspaces\n\n` +
        `A backup will be created automatically. Continue?`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }
      
      const success = await importDB(text, true); // true = create backup first
      if (success) {
        showStatus('Data restored! Backup created before import.');
    await loadData();
      } else {
        showStatus('Import failed. Your original data is safe.');
      }
    } catch (error) {
      console.error('Import error:', error);
      showStatus('Failed to read backup file');
    }
  };

  const handleChooseBackupFolder = async () => {
    const res = await pickAndPersistBackupFolder();
    if (!res.ok) {
      if (res.error !== 'cancelled') {
        showStatus(`Backup setup failed: ${res.error ?? 'Unknown error'}`);
      }
      return;
    }
    if (res.existingBackupJson) {
      const verification = verifyBackup(res.existingBackupJson);
      if (!verification.valid) {
        showStatus('Folder linked. Existing latest.json is invalid, so current DB was kept unchanged.');
      } else {
        const imported = await importDB(res.existingBackupJson, true);
        if (imported) {
          await loadData();
          showStatus('Folder linked. Existing latest.json was loaded and replaced current DB data.');
        } else {
          showStatus('Folder linked, but loading existing latest.json failed. Current DB was kept.');
        }
      }
    } else {
      showStatus('Backup folder saved. No existing latest.json found, so a new one was created from current DB.');
    }
    await setBackupFolderOnboarding('done');
    setShowBackupOnboarding(false);
    await refreshBackupFolderStatus();
  };

  const handleOpenFullPage = async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    if (isSidePanel) window.close();
  };

  const handleOpenFullPageForBackupSetup = async () => {
    await requestBackupOnboardingOpen();
    await handleOpenFullPage();
  };

  const handleCloseTab = async (tabId: number) => {
    await chrome.tabs.remove(tabId);
    await loadCurrentWindows();
  };

  const handleCloseWindow = async (windowId: number) => {
    await chrome.windows.remove(windowId);
    await loadCurrentWindows();
  };

  // Side Panel View
  if (isSidePanel) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f9fafb', minHeight: '100vh', position: 'relative' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', background: 'white', borderBottom: '1px solid #e5e7eb' }}>
          <Layout size={20} style={{ color: '#3b82f6' }} />
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Tab Manager</h1>
        </header>
        {showBackupOnboarding ? (
          <div
            style={{
              margin: '0.75rem',
              padding: '0.75rem',
              background: '#ffffff',
              border: '1px solid #dbeafe',
              borderRadius: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#1f2937', lineHeight: 1.4 }}>
              Backup setup is required. Open full-page setup to choose a backup folder.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleOpenFullPageForBackupSetup}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0.4rem',
                  border: 'none',
                  background: '#2563eb',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                Open full page setup
              </button>
            </div>
          </div>
        ) : null}
        {!showBackupOnboarding ? (
          <SidePanelView
            collections={collections}
            onSaveTab={handleSaveCurrentTab}
            onAddBookmark={handleAddBookmark}
            onExport={handleExport}
            onImport={handleImport}
            onOpenFullPage={handleOpenFullPage}
            status={status}
          />
        ) : null}
      </div>
    );
  }

  // Full Page View
  return (
    <>
    <BackupOnboardingModal
      open={showBackupOnboarding}
      allowSkip={false}
      onComplete={handleChooseBackupFolder}
    />
    <DashboardLayout 
      windows={currentWindows}
      projects={projects}
      collections={collections}
      items={items}
      workspaces={workspaces}
      onWorkspacesChanged={loadData}
      onAddBookmark={handleAddBookmark}
      onUpdateBookmark={handleUpdateBookmark}
      onDeleteBookmark={handleDeleteBookmark}
      onCloseTab={handleCloseTab}
      onCloseWindow={handleCloseWindow}
      onRefresh={loadData}
      onChooseBackupFolder={handleChooseBackupFolder}
      onRestoreBackupFile={handleImportFile}
      backupFolderReady={backupFolderReady}
      backupFolderName={backupFolderName}
    />
    </>
  );
}

export default App;
