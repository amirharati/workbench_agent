import { useState, useEffect } from 'react';
import { 
  addItem, 
  addProject,
  addCollection,
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
import { backupCoordinator, BackupStatusSnapshot } from './lib/backupCoordinator';
import { FileSystemBackupSink } from './lib/backupSinks';
import { revisionTracker } from './lib/revisionTracker';
import { loadAISettings, saveAISettings } from './lib/ai/settings';
import type { AISettings } from './lib/ai/types';
import { runAITestPrompt } from './lib/ai/client';

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
  const [backupStatus, setBackupStatus] = useState<BackupStatusSnapshot>(() =>
    backupCoordinator.getStatus()
  );
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);

  const syncFileSystemSink = async () => {
    const ready = await hasWritableBackupFolder();
    if (ready) {
      // Idempotent: re-adding the same sink just replaces it with a fresh
      // instance, which is what we want after a folder change.
      backupCoordinator.addSink(new FileSystemBackupSink('latest.json'));
    } else {
      backupCoordinator.removeSink('file-system');
    }
  };

  const refreshBackupFolderStatus = async () => {
    try {
      const ready = await hasWritableBackupFolder();
      const name = await getBackupFolderName();
      setBackupFolderReady(ready);
      setBackupFolderName(name);
      await syncFileSystemSink();
    } catch {
      setBackupFolderReady(false);
      setBackupFolderName(null);
      backupCoordinator.removeSink('file-system');
    }
  };

  /**
   * Run the startup conflict check and auto-resolve safe cases.
   * Blocking outcomes are surfaced via backupStatus.conflict (subscribed
   * earlier) so the UI can render the resolution banner.
   */
  const runStartupConflictCheck = async () => {
    if (!backupCoordinator.hasAnySink()) return;
    try {
      const info = await backupCoordinator.checkForConflict();
      if (info.kind === 'remote-newer-same-device') {
        // Safe path: same deviceId means it's literally our install (e.g.
        // another window/profile wrote it). Adopt it; safety snapshot first.
        const res = await backupCoordinator.loadFromRemote();
        if (res.ok) {
          await loadData();
          showStatus(
            res.safetyRef
              ? `Loaded newer remote backup. Local saved as ${res.safetyRef}.`
              : 'Loaded newer remote backup.'
          );
        } else {
          showStatus(`Could not adopt newer remote backup: ${res.error}`);
        }
      } else if (info.kind === 'local-newer-same-device') {
        // We have unflushed edits; coordinator will write them via debounce
        // on the next mutation, but we can also nudge a flush right now.
        await backupCoordinator.flush('startup');
      }
      // 'remote-newer-different-device' and 'diverged-different-device'
      // are blocking; the coordinator already paused itself and the banner
      // will show via subscribeStatus.
    } catch (e) {
      console.error('Startup conflict check failed:', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Order matters: load tracker BEFORE starting it so the listener
        // has correct deviceId/revision in memory; then start coordinator;
        // then subscribe to status; then sync sinks; then conflict check.
        await revisionTracker.load();
        if (cancelled) return;
        revisionTracker.start();
        backupCoordinator.start();
      } catch (e) {
        console.error('Backup system bootstrap failed:', e);
      }
    })();
    const unsub = backupCoordinator.subscribeStatus(setBackupStatus);
    return () => {
      cancelled = true;
      unsub();
      // Intentionally do NOT call stop(): the coordinator is process-wide
      // and may have other subscribers (future). React's StrictMode double
      // invoke is fine — start() is idempotent.
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const show = await shouldShowBackupOnboarding();
        if (!cancelled && show) setShowBackupOnboarding(true);
        if (cancelled) return;
        // Wait for revision tracker to be loaded before doing the conflict
        // check (it reads tracker state synchronously).
        await revisionTracker.load();
        if (cancelled) return;
        await refreshBackupFolderStatus();
        if (cancelled) return;
        await runStartupConflictCheck();
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadAISettings();
        if (!cancelled) setAiSettings(loaded);
      } catch (error) {
        console.error('Failed to load AI settings:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handlers
  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2000);
  };

  const toStatusMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  };

  const handleSaveCurrentTab = async (collectionId?: string) => {
    const tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    const tab = tabs[0];
    if (tab && tab.url && tab.url.startsWith('http')) {
      const collectionIds = collectionId ? [collectionId] : [];
      try {
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
      } catch (error) {
        showStatus(toStatusMessage(error, 'Could not save tab'));
      }
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
    try {
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
    } catch (error) {
      showStatus(toStatusMessage(error, 'Could not add bookmark'));
    }
  };

  const handleUpdateBookmark = async (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => {
    try {
      await updateItem(id, updates);
      await loadData();
      showStatus('Bookmark updated');
    } catch (error) {
      showStatus(toStatusMessage(error, 'Could not update bookmark'));
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    await deleteItem(id);
    await loadData();
    showStatus('Bookmark deleted');
  };

  const handleCreateProject = async (data: { name: string; description?: string }) => {
    const id = await addProject(data.name, data.description);
    await loadData();
    showStatus('Project created');
    return id;
  };

  const handleCreateCollection = async (data: { name: string; projectId: string }) => {
    const id = await addCollection(data.name, undefined, data.projectId);
    await loadData();
    showStatus('Collection created');
    return id;
  };

  const handleCreateItem = async (data: {
    title: string;
    url?: string;
    notes?: string;
    collectionIds: string[];
  }) => {
    try {
      await addItem({
        url: data.url || '',
        title: data.title,
        notes: data.notes,
        tags: [],
        source: data.url ? 'manual' : 'manual',
        collectionIds: data.collectionIds,
      });
      await loadData();
      showStatus(data.url ? 'Bookmark added' : 'Note added');
    } catch (error) {
      showStatus(toStatusMessage(error, 'Could not add item'));
      throw error;
    }
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
    // Forget what we knew about the OLD folder's remote BEFORE the picker
    // runs, so that importDB (called below if an existing latest.json is
    // found) can populate lastSeenRemote with the NEW folder's envelope.
    revisionTracker.clearLastSeenRemote();
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
    await runStartupConflictCheck();
  };

  const handleManualBackup = async () => {
    if (!backupCoordinator.hasAnySink()) {
      showStatus('Configure a backup folder first.');
      return;
    }
    const summary = await backupCoordinator.manualBackup();
    if (!summary) {
      showStatus('Manual backup is paused while a conflict is unresolved.');
      return;
    }
    if (summary.ok) {
      const ref = summary.outcomes.find((o) => o.result.ok)?.result.ref;
      showStatus(ref ? `Manual backup written: ${ref}` : 'Manual backup written.');
    } else {
      const firstError =
        summary.outcomes.find((o) => !o.result.ok)?.result.error ?? 'Unknown error';
      showStatus(`Manual backup failed: ${firstError}`);
    }
  };

  const handleResolveConflictLoadRemote = async () => {
    const res = await backupCoordinator.loadFromRemote();
    if (res.ok) {
      await loadData();
      showStatus(
        res.safetyRef
          ? `Loaded remote latest.json. Local saved as ${res.safetyRef}.`
          : 'Loaded remote latest.json.'
      );
    } else {
      showStatus(`Could not load remote: ${res.error ?? 'Unknown error'}`);
    }
  };

  const handleResolveConflictKeepLocal = async () => {
    const res = await backupCoordinator.forcePushLocal();
    if (res.ok) {
      showStatus('Kept local data; latest.json overwritten.');
    } else {
      showStatus(`Could not overwrite remote: ${res.error ?? 'Unknown error'}`);
    }
  };

  const handleOpenFullPage = async () => {
    const dashboardTab = await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    // Keep side panel available on normal tabs, but close/disable it on the
    // full dashboard tab so the page has full focus.
    if (dashboardTab.id !== undefined) {
      await chrome.sidePanel.setOptions({
        tabId: dashboardTab.id,
        enabled: false,
      });
    }
  };

  const handleOpenFullPageForBackupSetup = async () => {
    await requestBackupOnboardingOpen();
    await handleOpenFullPage();
  };

  const handleSetAsBrowserHome = async () => {
    const dashboardUrl = chrome.runtime.getURL('index.html');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dashboardUrl);
      }
    } catch {
      // Clipboard may be unavailable in some contexts; continue with setup tabs.
    }
    await chrome.tabs.create({ url: 'chrome://settings/onStartup' });
    await chrome.tabs.create({ url: 'chrome://settings/appearance' });
    await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    await chrome.tabs.create({ url: dashboardUrl });
    showStatus('Opened settings and Workbench URL. Set it manually for Home/Startup in Chrome settings.');
  };

  const handleSaveAISettings = async (settings: AISettings) => {
    const saved = await saveAISettings(settings);
    setAiSettings(saved);
    showStatus('AI settings saved.');
  };

  const handleTestAI = async (
    settings: AISettings,
    prompt: string
  ): Promise<{ text: string; model: string }> => {
    const response = await runAITestPrompt(settings, prompt);
    return { text: response.text, model: response.model };
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
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          minHeight: '100vh',
          position: 'relative',
          background: 'Canvas',
          color: 'CanvasText',
          ['--bg' as string]: 'Canvas',
          ['--bg-panel' as string]: 'Canvas',
          ['--bg-glass' as string]: 'ButtonFace',
          ['--bg-hover' as string]: 'rgba(0, 0, 0, 0.06)',
          ['--input-bg' as string]: 'Field',
          ['--text' as string]: 'CanvasText',
          ['--text-muted' as string]: 'GrayText',
          ['--border' as string]: 'rgba(0, 0, 0, 0.15)',
          ['--accent' as string]: 'Highlight',
          ['--accent-text' as string]: 'HighlightText',
          ['--accent-weak' as string]: 'rgba(0, 120, 215, 0.15)',
        }}
      >
        {showBackupOnboarding ? (
          <div
            style={{
              margin: '0.75rem',
              padding: '0.75rem',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', lineHeight: 1.4 }}>
              Backup setup is required. Open full-page setup to choose a backup folder.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleOpenFullPageForBackupSetup}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--accent-text)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
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
            projects={projects}
            collections={collections}
            items={items}
            onSaveTab={handleSaveCurrentTab}
            onCreateItem={handleCreateItem}
            onUpdateItem={async (id, data) => {
              await handleUpdateBookmark(id, {
                title: data.title,
                url: data.url || '',
                notes: data.notes,
                collectionIds: data.collectionIds,
              });
            }}
            onDeleteItem={handleDeleteBookmark}
            onCreateProject={handleCreateProject}
            onCreateCollection={handleCreateCollection}
            onOpenFullPage={handleOpenFullPage}
            onSetAsBrowserHome={handleSetAsBrowserHome}
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
      onCreateProject={handleCreateProject}
      onCreateCollection={handleCreateCollection}
      onCreateItem={handleCreateItem}
      onCloseTab={handleCloseTab}
      onCloseWindow={handleCloseWindow}
      onRefresh={loadData}
      onChooseBackupFolder={handleChooseBackupFolder}
      onSetAsBrowserHome={handleSetAsBrowserHome}
      onRestoreBackupFile={handleImportFile}
      onManualBackup={handleManualBackup}
      onResolveConflictLoadRemote={handleResolveConflictLoadRemote}
      onResolveConflictKeepLocal={handleResolveConflictKeepLocal}
      backupFolderReady={backupFolderReady}
      backupFolderName={backupFolderName}
      backupStatus={backupStatus}
      aiSettings={aiSettings ?? undefined}
      onSaveAISettings={handleSaveAISettings}
      onTestAI={handleTestAI}
    />
    </>
  );
}

export default App;
