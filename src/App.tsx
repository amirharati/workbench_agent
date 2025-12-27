import React, { useState, useEffect } from 'react';
import { Layout } from 'lucide-react';
import { 
  addItem, 
  exportDB, 
  importDB, 
  getAllCollections, 
  getAllWorkspaces,
  getAllItems,
  updateItem,
  deleteItem,
  Collection,
  Workspace,
  Item
} from './lib/db';
import { DashboardLayout } from './components/dashboard/layout/DashboardLayout';
import { SidePanelView } from './components/SidePanelView';

export interface WindowGroup {
  windowId: number;
  tabs: chrome.tabs.Tab[];
}

function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isSidePanel, setIsSidePanel] = useState(false);
  const [currentWindows, setCurrentWindows] = useState<WindowGroup[]>([]);
  const [status, setStatus] = useState('');

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
      await addItem({
        url: tab.url,
        title: tab.title || 'Untitled',
        favicon: tab.favIconUrl,
        tags: [],
        source: 'tab',
        collectionId,
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
    await addItem({
      url,
      title: cleanTitle,
      favicon: undefined,
      tags: [],
      source: 'manual',
      collectionId,
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
    const json = await exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importDB(text);
    showStatus('Data restored!');
    await loadData();
  };

  const handleOpenFullPage = async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    if (isSidePanel) window.close();
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
      <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f9fafb', minHeight: '100vh' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', background: 'white', borderBottom: '1px solid #e5e7eb' }}>
          <Layout size={20} style={{ color: '#3b82f6' }} />
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Tab Manager</h1>
        </header>
        <SidePanelView
          collections={collections}
          onSaveTab={handleSaveCurrentTab}
          onAddBookmark={handleAddBookmark}
          onExport={handleExport}
          onImport={handleImport}
          onOpenFullPage={handleOpenFullPage}
          status={status}
        />
      </div>
    );
  }

  // Full Page View
  return (
    <DashboardLayout 
          windows={currentWindows}
          collections={collections}
      items={items}
      workspaces={workspaces}
      onWorkspacesChanged={loadData}
      onAddBookmark={handleAddBookmark}
      onUpdateBookmark={handleUpdateBookmark}
      onDeleteBookmark={handleDeleteBookmark}
          onCloseTab={handleCloseTab}
      onCloseWindow={handleCloseWindow}
      onRefresh={loadCurrentWindows}
    />
  );
}

export default App;
