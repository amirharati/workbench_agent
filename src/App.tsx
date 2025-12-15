import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from 'lucide-react';
import { addItem, exportDB, importDB, getAllItems, deleteItem, getAllCollections, addCollection, updateItem, Item, Collection } from './lib/db';
import { Sidebar } from './components/Sidebar';
import { OpenWindowsSection } from './components/OpenWindowsSection';
import { BookmarksGrid } from './components/BookmarksGrid';
import { BookmarkDetailPanel } from './components/BookmarkDetailPanel';
import { SidePanelView } from './components/SidePanelView';

interface WindowGroup {
  windowId: number;
  tabs: chrome.tabs.Tab[];
}

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isSidePanel, setIsSidePanel] = useState(false);
  const [currentWindows, setCurrentWindows] = useState<WindowGroup[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

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
    const allItems = await getAllItems();
    const allCollections = await getAllCollections();
    setItems(allItems);
    setCollections(allCollections);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Computed values
  const unsortedCount = useMemo(() => items.filter((i) => !i.collectionId).length, [items]);
  const collectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      if (item.collectionId) counts[item.collectionId] = (counts[item.collectionId] || 0) + 1;
    });
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (selectedCollectionId === null) return items;
    if (selectedCollectionId === 'unsorted') return items.filter((i) => !i.collectionId);
    return items.filter((i) => i.collectionId === selectedCollectionId);
  }, [items, selectedCollectionId]);

  const selectedTitle = useMemo(() => {
    if (selectedCollectionId === null) return 'All Bookmarks';
    if (selectedCollectionId === 'unsorted') return 'Unsorted';
    const col = collections.find((c) => c.id === selectedCollectionId);
    return col ? col.name : 'Bookmarks';
  }, [selectedCollectionId, collections]);

  // Handlers
  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2000);
  };

  const handleSaveTab = async (tab: chrome.tabs.Tab, collectionId?: string) => {
    if (!tab.url || !tab.url.startsWith('http')) return;
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
  };

  const handleSaveWindow = async (windowId: number, collectionId?: string) => {
    const windowGroup = currentWindows.find((w) => w.windowId === windowId);
    if (!windowGroup) return;
    let count = 0;
    for (const tab of windowGroup.tabs) {
      if (tab.url && tab.url.startsWith('http')) {
        await addItem({ url: tab.url, title: tab.title || 'Untitled', favicon: tab.favIconUrl, tags: [], source: 'tab', collectionId });
        count++;
      }
    }
    showStatus(`Saved ${count} tabs!`);
    await loadData();
  };

  const handleSaveAllWindows = async (collectionId?: string) => {
    let count = 0;
    for (const w of currentWindows) {
      for (const tab of w.tabs) {
        if (tab.url && tab.url.startsWith('http')) {
          await addItem({ url: tab.url, title: tab.title || 'Untitled', favicon: tab.favIconUrl, tags: [], source: 'tab', collectionId });
          count++;
        }
      }
    }
    showStatus(`Saved ${count} tabs!`);
    await loadData();
  };

  const handleCloseTab = async (tabId: number) => {
    await chrome.tabs.remove(tabId);
    await loadCurrentWindows();
  };

  const handleDeleteItem = async (id: string) => {
    await deleteItem(id);
    if (selectedItem?.id === id) setSelectedItem(null);
    await loadData();
  };

  const handleUpdateItem = async (id: string, updates: { collectionId?: string; notes?: string }) => {
    await updateItem(id, updates);
    showStatus('Saved!');
    await loadData();
    // Update selected item if it was changed
    const updatedItems = await getAllItems();
    const updatedItem = updatedItems.find(i => i.id === id);
    if (updatedItem) setSelectedItem(updatedItem);
  };

  const handleMoveItem = async (itemId: string, collectionId: string | undefined) => {
    await updateItem(itemId, { collectionId });
    showStatus('Moved!');
    await loadData();
  };

  const handleAddCategory = async () => {
    if (newCategoryName.trim()) {
      await addCollection(newCategoryName.trim());
      setNewCategoryName('');
      setShowAddCategoryModal(false);
      await loadData();
    }
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
    <div style={{ display: 'flex', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f9fafb' }}>
      <Sidebar
        collections={collections}
        selectedCollectionId={selectedCollectionId}
        onSelectCollection={setSelectedCollectionId}
        onAddCollection={() => setShowAddCategoryModal(true)}
        onMoveItem={handleMoveItem}
        unsortedCount={unsortedCount}
        totalCount={items.length}
        collectionCounts={collectionCounts}
      />

      <main style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {status && (
          <div style={{ position: 'fixed', top: '1rem', right: selectedItem ? '340px' : '1rem', padding: '0.75rem 1rem', background: '#10b981', color: 'white', borderRadius: '0.5rem', fontSize: '0.875rem', zIndex: 1000, transition: 'right 0.2s' }}>
            {status}
          </div>
        )}

        <div style={{ flex: 1, marginBottom: '1.5rem' }}>
          <BookmarksGrid
            items={filteredItems}
            onDeleteItem={handleDeleteItem}
            onSelectItem={setSelectedItem}
            selectedItemId={selectedItem?.id || null}
            title={selectedTitle}
          />
        </div>

        <div style={{ borderTop: '2px solid #e5e7eb', marginBottom: '1.5rem' }} />

        <OpenWindowsSection
          windows={currentWindows}
          collections={collections}
          onCloseTab={handleCloseTab}
          onSaveTab={handleSaveTab}
          onSaveWindow={handleSaveWindow}
          onSaveAllWindows={handleSaveAllWindows}
        />
      </main>

      {/* Right Detail Panel */}
      {selectedItem && (
        <BookmarkDetailPanel
          item={selectedItem}
          collections={collections}
          onClose={() => setSelectedItem(null)}
          onSave={handleUpdateItem}
          onDelete={handleDeleteItem}
        />
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowAddCategoryModal(false)}
        >
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '400px', maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>New Category</h3>
            <input
              type="text"
              placeholder="Category name..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              autoFocus
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '1rem', marginBottom: '1rem', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddCategoryModal(false)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: 'white', borderRadius: '0.375rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleAddCategory} style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
