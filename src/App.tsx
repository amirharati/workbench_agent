import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  addItemWithMerge, 
  addProject,
  addCollection,
  deleteProject,
  deleteCollection,
  importDB, 
  verifyBackup,
  getAllProjects,
  getAllCollections, 
  getAllWorkspaces,
  updateItem,
  removeItemFromCollection,
  Collection,
  Workspace,
  Item,
  Project,
  UpdateItemOptions,
  normalizeBookmarkUrl,
  reloadDB,
  refreshPipelineCacheFromWorker,
  getItem,
  formatLibraryHydrateProgress,
  subscribeLibraryHydrateProgress,
  type LibraryHydrateProgress,
} from './lib/db';
import { getActiveItems, isActiveItem, moveItemToTrash, formatRestoreSummary } from './lib/itemQuickAccess';
import { INBOX_COLLECTION_LIMIT_MESSAGE } from './lib/systemDataModel';
import {
  shouldUseLightLibraryRefresh,
  type LibraryRefreshScope,
} from './lib/libraryRefresh';
import { DashboardLayout } from './components/dashboard/layout/DashboardLayout';
import { SidePanelConnected } from './components/SidePanelConnected';
import { PipelineProgressProvider } from './components/dashboard/PipelineProgressProvider';
import { getActiveTabBookmarkContext, resolveTabBookmarkUrl } from './lib/tabUrlCapture';
import { isAnyDigestInFlight } from './lib/pipeline/singleLinkDigest';
import { BackupOnboardingModal } from './components/BackupOnboardingModal';
import {
  setBackupFolderOnboarding,
  requestBackupOnboardingOpen,
} from './lib/backupOnboarding';
import {
  pickAndPersistBackupFolder,
  type PickBackupFolderResult,
  wasBackupFolderLinked,
  markBackupFolderLinkedFlag,
  hasWritableBackupFolder,
  hasConfiguredBackupFolder,
  getBackupFolderName,
  regrantBackupFolderPermission,
  tryReuseConfiguredBackupFolder,
} from './lib/backupFolder';
import {
  DATA_CHANGED_BROADCAST_CHANNEL,
  DATA_CHANGE_SOURCE_ID,
  subscribeToDataChanges,
  type DataChangeEvent,
} from './lib/dataChangeNotifier';
import { ensureDbWorker, mirrorNow, getDbWorkerStatus, getRemoteStore, type DbWorkerStatus } from './lib/storage/dbClient';
import { backupCoordinator, BackupStatusSnapshot, isSqliteBackupFile, type RestoreBackupResult } from './lib/backupCoordinator';
import { ManualFolderBackupSink } from './lib/backupSinks';
import { revisionTracker } from './lib/revisionTracker';
import { loadAISettings, saveAISettings } from './lib/ai/settings';
import type { AISettings } from './lib/ai/types';
import { runAITestPrompt } from './lib/ai/client';
import { notifyUser } from './lib/userNotify';
import { isTransientDbRpcError } from './lib/storage/dbClient';
import { runWithDbPriority } from './lib/storage/dbRpcPriority';
import { buildPipelineSnapshotExport } from './lib/pipeline/pipelineRunAnalysis';
import { saveAndDownloadPipelineRun } from './lib/pipeline/pipelineRunStore';
import {
  createDashboardStartupProjection,
  loadImmediateDashboardStartupProjection,
  loadPersistedDashboardStartupProjection,
  persistDashboardStartupProjection,
  requestSharedDashboardStartupProjection,
  type DashboardStartupProjection,
} from './lib/dashboardStartupProjection';
import { loadWorkbenchSqliteFromFolder } from './lib/linkBackupFolder';
import { scheduleStartupIdleWork, waitForStartupIdle } from './lib/startupScheduling';
import { isSidePanelSurface } from './lib/appSurface';

export interface WindowGroup {
  windowId: number;
  tabs: chrome.tabs.Tab[];
}

function App() {
  const [immediateStartupProjection] = useState(() => {
    const startedAt = performance.now();
    const projection = loadImmediateDashboardStartupProjection();
    if (projection) {
      console.info(`[startup] immediate dashboard projection in ${Math.round(performance.now() - startedAt)}ms`);
    }
    return projection;
  });
  const [collections, setCollections] = useState<Collection[]>(() => immediateStartupProjection?.collections ?? []);
  const [projects, setProjects] = useState<Project[]>(() => immediateStartupProjection?.projects ?? []);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => immediateStartupProjection?.workspaces ?? []);
  const [items, setItems] = useState<Item[]>(() => immediateStartupProjection?.items ?? []);
  const [startupProjectionReady, setStartupProjectionReady] = useState(Boolean(immediateStartupProjection));
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryHydrateProgress, setLibraryHydrateProgress] =
    useState<LibraryHydrateProgress | null>(null);
  const [isSidePanel] = useState(() => isSidePanelSurface());
  const [currentWindows, setCurrentWindows] = useState<WindowGroup[]>([]);
  const [folderGateResolved, setFolderGateResolved] = useState(false);
  /** Persisted handle exists — first-time pick is done (permission may still be revoked). */
  const [folderConfigured, setFolderConfigured] = useState(false);
  /** Sticky link flag / name / onboarding says we had a folder, but handle is missing. */
  const [folderLinkLost, setFolderLinkLost] = useState(false);
  /** Chrome currently grants read/write on the saved folder handle. */
  const [backupFolderReady, setBackupFolderReady] = useState(false);
  const [backupFolderName, setBackupFolderName] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatusSnapshot>(() =>
    backupCoordinator.getStatus()
  );
  const [folderMirrorStatus, setFolderMirrorStatus] = useState<DbWorkerStatus | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const fullLibraryReadyRef = useRef(false);
  const startupProjectionReadyRef = useRef(Boolean(immediateStartupProjection));
  const startupProjectionGeneratedAtRef = useRef(immediateStartupProjection?.generatedAt ?? 0);

  const applyStartupProjection = useCallback((projection: DashboardStartupProjection) => {
    startupProjectionReadyRef.current = true;
    setStartupProjectionReady(true);
    if (fullLibraryReadyRef.current) return;
    if (projection.generatedAt < startupProjectionGeneratedAtRef.current) return;
    startupProjectionGeneratedAtRef.current = projection.generatedAt;
    setProjects(projection.projects);
    setCollections(projection.collections);
    setWorkspaces(projection.workspaces);
    setItems(projection.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();
    // Race the durable page cache and the shared DB owner. Waiting for one
    // before starting the other made a slow chrome.storage read block the
    // otherwise-warm worker path.
    void loadPersistedDashboardStartupProjection().then((persisted) => {
      if (persisted && !cancelled) {
        applyStartupProjection(persisted);
        console.info(`[startup] persisted dashboard projection in ${Math.round(performance.now() - startedAt)}ms`);
      }
    });
    void requestSharedDashboardStartupProjection()
      .then((shared) => {
        if (cancelled) return;
        applyStartupProjection(shared);
        console.info(`[startup] shared dashboard projection in ${Math.round(performance.now() - startedAt)}ms`);
        void persistDashboardStartupProjection(shared);
      })
      .catch((error) => {
        console.warn('[startup] Shared dashboard projection unavailable; full hydrate will continue:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [applyStartupProjection]);

  const syncFileSystemSink = async () => {
    backupCoordinator.removeSink('file-system-sqlite');
    backupCoordinator.removeSink('file-system');
    backupCoordinator.removeSink('file-system-manual');
    backupCoordinator.setLiveBackupEnabled(false);

    const ready = await hasWritableBackupFolder();
    if (ready) {
      backupCoordinator.addSink(new ManualFolderBackupSink());
      try {
        await ensureDbWorker();
      } catch (e) {
        console.error('DB worker failed to start:', e);
        notifyUser({
          type: 'error',
          message: `Database worker failed to start: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  };

  const refreshBackupFolderStatus = async () => {
    try {
      // Prefer the already-selected folder — never open the picker here.
      const reused = await tryReuseConfiguredBackupFolder();
      let ready = reused.ok;
      if (!ready) {
        ready = await hasWritableBackupFolder();
      }
      const name = await getBackupFolderName();
      const configured = await hasConfiguredBackupFolder();
      setFolderConfigured(configured);
      setBackupFolderReady(ready);
      setBackupFolderName(name);
      setFolderLinkLost(!configured && (await wasBackupFolderLinked()));
      // Only force first-time pick UI when no folder was ever chosen.
      await syncFileSystemSink();
    } catch {
      // Keep reconnect mode if a folder was previously configured.
      const configured = await hasConfiguredBackupFolder().catch(() => false);
      const name = await getBackupFolderName().catch(() => null);
      setFolderConfigured(configured);
      setBackupFolderReady(false);
      setBackupFolderName(name);
      setFolderLinkLost(!configured && (await wasBackupFolderLinked().catch(() => false)));
      backupCoordinator.removeSink('file-system-manual');
      backupCoordinator.removeSink('file-system-sqlite');
      backupCoordinator.removeSink('file-system');
      backupCoordinator.setLiveBackupEnabled(false);
    }
  };

  /**
   * Load library from OPFS (and merge from folder when Chrome still grants access).
   * After the folder is configured once, this must work even when permission is `prompt`.
   */
  const bootstrapAfterFolderReady = async (options?: { deferCanonicalHydrate?: boolean }) => {
    await ensureDbWorker();
    const folderWritable = await hasWritableBackupFolder();
    if (options?.deferCanonicalHydrate) {
      // The compact projection is already a usable screen. Let it paint and
      // accept input before transferring the canonical library into this tab.
      await waitForStartupIdle({ timeoutMs: 350 });
    }
    await loadData();
    void import('./components/dashboard/PipelineHubView').then(({ prewarmHubCache }) => prewarmHubCache());
    // Cleanup, taxonomy checks, and remote conflict work are not required for
    // the first usable Home screen. Keep them behind live OPFS loading.
    void import('./lib/storage/legacyStorageCleanup')
      .then(({ purgeLegacyLocalDomainStorage }) => purgeLegacyLocalDomainStorage())
      .catch((error) => console.warn('[startup] legacy cleanup failed:', error));
    void (async () => {
      const { ensureSeedTaxonomy } = await import('./lib/categorization/classifyTopicExtract');
      const { ensureTaxonomyPatches } = await import('./lib/categorization/seedImport');
      try {
        await ensureSeedTaxonomy();
        await ensureTaxonomyPatches();
      } catch (e) {
        console.error('[startup] ensureSeedTaxonomy failed — classify will be blocked:', e);
        await new Promise((r) => setTimeout(r, 1500));
        try {
          await ensureSeedTaxonomy();
          await ensureTaxonomyPatches();
          console.info('[startup] ensureSeedTaxonomy succeeded on retry');
        } catch (e2) {
          console.error('[startup] ensureSeedTaxonomy retry also failed:', e2);
        }
      }
    })();
    if (folderWritable) {
      void runStartupConflictCheck();
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
        const res = await backupCoordinator.loadFromRemote();
        if (res.ok) {
          await loadData();
          showStatus(
            res.safetyRef
              ? `Loaded newer folder database. Local saved as ${res.safetyRef}.`
              : 'Loaded newer folder database.'
          );
        } else {
          showStatus(`Could not adopt newer folder database: ${res.error}`);
        }
      } else if (info.kind === 'local-newer-same-device') {
        // Never push OPFS over folder on startup — debounced mirror handles real edits.
      }
      // 'remote-newer-different-device' and 'diverged-different-device'
      // are blocking; the coordinator already paused itself and the banner
      // will show via subscribeStatus.
    } catch (e) {
      console.error('Startup conflict check failed:', e);
      notifyUser({
        type: 'error',
        message: `Backup conflict check failed: ${e instanceof Error ? e.message : String(e)}`,
      });
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
        notifyUser({
          type: 'error',
          message: `Backup system failed to start: ${e instanceof Error ? e.message : String(e)}`,
        });
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
    if (!backupFolderReady) {
      setFolderMirrorStatus(null);
      return;
    }
    let cancelled = false;
    const refreshMirrorStatus = async () => {
      try {
        await ensureDbWorker();
        const status = await getDbWorkerStatus();
        if (!cancelled) setFolderMirrorStatus(status);
      } catch {
        /* worker may still be starting */
      }
    };
    void refreshMirrorStatus();
    const id = window.setInterval(() => void refreshMirrorStatus(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [backupFolderReady]);

  /** Soft-schedule folder catch-up on leave — never force-export (OOM on large libs). */
  useEffect(() => {
    if (!backupFolderReady) return;
    const scheduleSoft = () => {
      if (isAnyDigestInFlight()) return;
      void import('./lib/storage/flushDurableBackup').then(({ flushDurableBackupSoon }) =>
        flushDurableBackupSoon()
      );
    };
    // pagehide only — visibilitychange fires on every tab switch and was force-dumping sqlite.
    window.addEventListener('pagehide', scheduleSoft);
    return () => {
      window.removeEventListener('pagehide', scheduleSoft);
    };
  }, [backupFolderReady]);

  useEffect(() => {
    let cancelled = false;
    // Warm up the DB service worker immediately (Hub prewarm runs after loadData when library is ready).
    void ensureDbWorker().catch(() => { /* retried by dbRpc internally */ });
    (async () => {
      try {
        // Reuse the saved folder ASAP — while a click that opened this page may
        // still count as user activation (avoids an extra "Continue" when possible).
        if (!cancelled && (await hasConfiguredBackupFolder())) {
          setFolderConfigured(true);
          const early = await tryReuseConfiguredBackupFolder();
          if (early.ok && !cancelled) {
            setBackupFolderReady(true);
            setBackupFolderName(await getBackupFolderName());
            await syncFileSystemSink();
          }
        }

        // Ensure backup system is ready before load/conflict (effect 1 may still be racing).
        await revisionTracker.load();
        if (cancelled) return;
        await revisionTracker.start();
        backupCoordinator.start();

        await refreshBackupFolderStatus();
        if (cancelled) return;

        const configured = await hasConfiguredBackupFolder();
        if (!cancelled) {
          setFolderConfigured(configured);
          setFolderLinkLost(!configured && (await wasBackupFolderLinked()));
          setFolderGateResolved(true);
        }

        if (!configured) {
          // No handle — block until they pick (first-time or recover after lost handle).
          return;
        }

        // Linked handle may exist while Chrome paused write access after reload/crash.
        // Open the library from OPFS anyway — do not force a reconnect wall.
        const writable = await hasWritableBackupFolder();
        if (!cancelled) {
          setBackupFolderReady(writable);
          try {
            await markBackupFolderLinkedFlag();
          } catch {
            /* ignore */
          }
        }
        await bootstrapAfterFolderReady({
          deferCanonicalHydrate: startupProjectionReadyRef.current,
        });
        if (cancelled) return;
      } catch (e) {
        console.error('Backup onboarding check failed:', e);
        notifyUser({
          type: 'error',
          message: `Startup failed: ${e instanceof Error ? e.message : String(e)}`,
        });
        if (!cancelled) {
          const configured = await hasConfiguredBackupFolder().catch(() => false);
          const writable = configured
            ? await hasWritableBackupFolder().catch(() => false)
            : false;
          setFolderConfigured(configured);
          setBackupFolderReady(writable);
          setFolderLinkLost(!configured && (await wasBackupFolderLinked().catch(() => false)));
          setFolderGateResolved(true);
          if (configured) {
            try {
              await bootstrapAfterFolderReady({
                deferCanonicalHydrate: startupProjectionReadyRef.current,
              });
            } catch {
              /* OPFS bootstrap best-effort */
            }
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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
      const { syncOpenTabUrls } = await import('./lib/storage/workingSetCache');
      syncOpenTabUrls(
        windowGroups.flatMap((g) => g.tabs.map((t) => t.url).filter((u): u is string => Boolean(u)))
      );
    } catch (e) {
      console.error('Failed to load windows:', e);
    }
  };

  useEffect(() => {
    return subscribeLibraryHydrateProgress((progress) => {
      setLibraryHydrateProgress(formatLibraryHydrateProgress(progress));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshWindows = () => {
      if (!cancelled) void loadCurrentWindows();
    };
    const cancelInitialLoad = scheduleStartupIdleWork(refreshWindows, { timeoutMs: 500 });
    const handleTabUpdate = () => refreshWindows();
    chrome.tabs.onCreated.addListener(handleTabUpdate);
    chrome.tabs.onRemoved.addListener(handleTabUpdate);
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    return () => {
      cancelled = true;
      cancelInitialLoad();
      chrome.tabs.onCreated.removeListener(handleTabUpdate);
      chrome.tabs.onRemoved.removeListener(handleTabUpdate);
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    };
  }, []);

  // Load data
  const loadData = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setLibraryLoading(true);
    }
    let lastError: unknown;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          // Live data is OPFS. Folder write permission may be `prompt` after reload —
          // still load the library; mirror resumes after a quiet re-grant.
          const configured = await hasConfiguredBackupFolder();
          if (!configured) {
            try {
              const allItems = await getActiveItems();
              setItems(allItems.sort((a, b) => b.created_at - a.created_at));
            } catch {
              /* not hydrated yet */
            }
            return;
          }

          const [allProjects, allCollections, allWorkspaces, allItems] = await Promise.all([
            getAllProjects(),
            getAllCollections(),
            getAllWorkspaces(),
            getActiveItems(),
          ]);
          fullLibraryReadyRef.current = true;
          setProjects([...allProjects]);
          setCollections([...allCollections]);
          setWorkspaces([...allWorkspaces]);
          setItems(allItems.sort((a, b) => b.created_at - a.created_at));
          void getDbWorkerStatus()
            .then((status) =>
              persistDashboardStartupProjection(
                createDashboardStartupProjection({
                  revision: status.revision,
                  projects: allProjects,
                  collections: allCollections,
                  workspaces: allWorkspaces,
                  items: allItems,
                })
              )
            )
            .catch((error) => console.warn('[startup] Could not refresh dashboard projection:', error));
          return;
        } catch (e) {
          lastError = e;
          if (!isTransientDbRpcError(e) || attempt >= 3) {
            console.error('loadData failed:', e);
            notifyUser({
              type: 'error',
              message: `Could not load library data: ${e instanceof Error ? e.message : String(e)}`,
            });
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
      if (lastError) {
        console.error('loadData failed:', lastError);
        notifyUser({
          type: 'error',
          message: `Could not load library data: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        });
      }
    } finally {
      if (!quiet) {
        setLibraryLoading(false);
        setLibraryHydrateProgress(null);
      }
    }
  }, []);

  const refreshLibraryItems = useCallback(async (itemIds: string[]) => {
    await refreshPipelineCacheFromWorker();
    const unique = [...new Set(itemIds)];
    const rows = await Promise.all(unique.map((id) => getItem(id)));
    setItems((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      for (let i = 0; i < unique.length; i++) {
        const id = unique[i]!;
        const row = rows[i];
        if (!row || !isActiveItem(row)) {
          byId.delete(id);
        } else {
          byId.set(id, row);
        }
      }
      return [...byId.values()].sort((a, b) => b.created_at - a.created_at);
    });
  }, []);

  const refreshLibrary = useCallback(
    async (scope?: LibraryRefreshScope) => {
      if (shouldUseLightLibraryRefresh(scope) && scope?.itemIds?.length) {
        await refreshLibraryItems(scope.itemIds);
        return;
      }
      await loadData();
    },
    [loadData, refreshLibraryItems]
  );

  const refreshWorkspaces = useCallback(async () => {
    setWorkspaces([...(await getAllWorkspaces())]);
  }, []);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  const refreshLibraryRef = useRef(refreshLibrary);
  refreshLibraryRef.current = refreshLibrary;

  const reloadFromPeer = async () => {
    // Never close SQLite mid-digest — it surfaces as a fake "network/CORS" error.
    if (isAnyDigestInFlight()) {
      await loadDataRef.current();
      return;
    }
    await reloadDB();
    await loadDataRef.current();
  };

  const refreshFromPeerChange = async (event: DataChangeEvent) => {
    const store = getRemoteStore();
    const revision = typeof event.revision === 'number' ? event.revision : undefined;

    if (event.reason === 'pipeline.complete' && event.entityIds?.length) {
      await refreshLibraryItems(event.entityIds);
      return;
    }

    if (event.entityId && event.reason.startsWith('item.')) {
      const row = await store.refreshItemFromWorker(event.entityId, revision);
      setItems((prev) => {
        const next = new Map(prev.map((item) => [item.id, item]));
        if (row && isActiveItem(row)) next.set(row.id, row);
        else next.delete(event.entityId!);
        return [...next.values()].sort((a, b) => b.created_at - a.created_at);
      });
      return;
    }

    if (event.reason.startsWith('project.')) {
      await store.refreshTablesFromWorker(['projects', 'collections']);
      if (revision != null) store.setRevision(revision);
      const [nextProjects, nextCollections] = await Promise.all([
        getAllProjects(),
        getAllCollections(),
      ]);
      setProjects([...nextProjects]);
      setCollections([...nextCollections]);
      return;
    }

    if (event.reason.startsWith('collection.')) {
      const tables = event.reason === 'collection.delete' ? ['collections', 'items'] : ['collections'];
      await store.refreshTablesFromWorker(tables);
      if (revision != null) store.setRevision(revision);
      setCollections([...(await getAllCollections())]);
      if (event.reason === 'collection.delete') {
        setItems((await getActiveItems()).sort((a, b) => b.created_at - a.created_at));
      }
      return;
    }

    if (event.reason.startsWith('workspace.')) {
      await store.refreshTablesFromWorker(['workspaces']);
      if (revision != null) store.setRevision(revision);
      setWorkspaces([...(await getAllWorkspaces())]);
      return;
    }

    await reloadFromPeer();
  };

  const refreshFromLocalChange = (event: DataChangeEvent) => {
    if (
      event.entityId &&
      (event.reason === 'item.add' || event.reason === 'item.update')
    ) {
      void refreshLibraryItems([event.entityId]).catch((error) => {
        console.error('[data-change] Could not reconcile changed item:', error);
        notifyUser({
          type: 'error',
          message: `Changed item could not be confirmed: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
      return true;
    }
    if (event.reason === 'project.add' || event.reason === 'project.update') {
      void Promise.all([getAllProjects(), getAllCollections()]).then(([nextProjects, nextCollections]) => {
        setProjects([...nextProjects]);
        setCollections([...nextCollections]);
      });
      return true;
    }
    if (event.reason === 'collection.add' || event.reason === 'collection.update') {
      void getAllCollections().then((nextCollections) => setCollections([...nextCollections]));
      return true;
    }
    if (event.reason === 'workspace.add' || event.reason === 'workspace.update' || event.reason === 'workspace.delete') {
      void getAllWorkspaces().then((nextWorkspaces) => setWorkspaces([...nextWorkspaces]));
      return true;
    }
    return false;
  };

  /** Side panel and dashboard are different documents — reload DB on peer writes only. */
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(DATA_CHANGED_BROADCAST_CHANNEL);
      bc.onmessage = (message: MessageEvent<DataChangeEvent>) => {
        const event = message.data;
        if (event?.sourceId === DATA_CHANGE_SOURCE_ID) return;
        if (!event || typeof event.reason !== 'string') {
          void reloadFromPeer();
          return;
        }
        void refreshFromPeerChange(event).catch((error) => {
          console.warn('[data-change] Scoped peer refresh failed; falling back to reload:', error);
          void reloadFromPeer();
        });
      };
    } catch {
      bc = null;
    }
    let loadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubDb = subscribeToDataChanges((event) => {
      // Mid-digest enrichment/categorization writes must not reload the full library —
      // that OOM-kills Chrome on large libraries. refreshAfterPipeline handles the end.
      if (
        isAnyDigestInFlight() &&
        (event.reason === 'enrichment.update' ||
          event.reason === 'categorization.update' ||
          event.reason === 'categorization.review')
      ) {
        return;
      }
      if (refreshFromLocalChange(event)) return;
      // Keep the open editor stable: never flash libraryLoading on routine writes.
      const quiet =
        event.reason === 'item.update' ||
        event.reason === 'item.add' ||
        event.reason === 'enrichment.update' ||
        event.reason === 'categorization.update' ||
        event.reason === 'categorization.review';
      // Same-tab item.update is already refreshed surgically by handleUpdateBookmark —
      // skip the redundant full pull (still notify other documents via BroadcastChannel).
      if (event.reason === 'item.update') return;
      const delayMs = event.reason === 'item.trash.bulk' ? 500 : 0;
      if (delayMs > 0) {
        if (loadDebounceTimer) clearTimeout(loadDebounceTimer);
        loadDebounceTimer = setTimeout(() => {
          loadDebounceTimer = null;
          void loadDataRef.current({ quiet });
        }, delayMs);
        return;
      }
      void loadDataRef.current({ quiet });
    });
    return () => {
      if (loadDebounceTimer) clearTimeout(loadDebounceTimer);
      bc?.close();
      unsubDb();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cancelLoad = scheduleStartupIdleWork(() => {
      void (async () => {
        try {
          const loaded = await loadAISettings();
          if (!cancelled) setAiSettings(loaded);
        } catch (error) {
          console.error('Failed to load AI settings:', error);
        }
      })();
    }, { timeoutMs: 500 });
    return () => {
      cancelled = true;
      cancelLoad();
    };
  }, []);

  const showStatus = (_msg: string, _holdMs = 2500) => {
    /* Side panel status: SidePanelConnected. Dashboard: DashboardLayout toasts. */
  };

  const toStatusMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      // Never surface Chrome folder-permission pause as a user status error.
      if (
        /Reconnect your backup folder|paused folder access|folder sync paused|permission paused/i.test(
          error.message
        )
      ) {
        return fallback;
      }
      return error.message;
    }
    return fallback;
  };

  /** Full-app bookmark add (toasts run in DashboardLayout). Returns item id for http(s) saves. */
  const handleAddBookmark = async (
    url: string,
    title?: string,
    collectionId?: string
  ): Promise<string | undefined> => {
    if (!url || !/^https?:\/\//i.test(url)) {
      return undefined;
    }
    const cleanTitle = title && title.trim().length > 0 ? title.trim() : url;
    const collectionIds = collectionId ? [collectionId] : [];
    const result = await addItemWithMerge({
      url,
      title: cleanTitle,
      favicon: undefined,
      tags: [],
      source: 'manual',
      collectionIds,
    });
    return result.itemId;
  };

  const handleUpdateBookmark = useCallback(async (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => {
    try {
      // Explicit UI lane: background pipeline work must never downgrade this
      // mutation. updateItem returns the canonical worker-side merged row.
      const saved = await runWithDbPriority('high', () => updateItem(id, updates, options));
      if (saved) {
        setItems((prev) => {
          const byId = new Map(prev.map((item) => [item.id, item]));
          if (isActiveItem(saved)) byId.set(saved.id, saved);
          else byId.delete(saved.id);
          return [...byId.values()].sort((a, b) => b.created_at - a.created_at);
        });
      }
    } catch (error) {
      const { isBackupFolderPermissionPaused } = await import('./lib/backupFolder');
      // Linked folder + Chrome permission pause must never look like a save failure.
      if (isBackupFolderPermissionPaused(error)) {
        await refreshLibraryRef.current({ itemIds: [id] });
        return;
      }
      showStatus(toStatusMessage(error, 'Could not update bookmark'));
      throw error;
    }
  }, []);

  const handleDeleteBookmark = async (id: string, collectionId?: string) => {
    try {
      if (collectionId) {
        const result = await removeItemFromCollection(id, collectionId);
        if (result.itemTrashed) {
          showStatus('Moved to trash');
        } else if (result.removed) {
          showStatus(`Removed from collection (still in ${result.remainingPlacements} other${result.remainingPlacements > 1 ? 's' : ''})`);
        }
      } else {
        await moveItemToTrash(id, { reason: 'Moved to trash', reasonCode: 'app_delete' });
        showStatus('Moved to trash');
      }
      // Fast UI update even if full loadData is gated on folder permission.
      await refreshLibraryItems([id]);
      await loadData();
    } catch (e) {
      console.error('Delete/trash failed:', e);
      showStatus(toStatusMessage(e, 'Could not move to trash'));
      notifyUser({
        type: 'error',
        message: `Could not move to trash: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  const handleCreateProject = async (data: { name: string; description?: string }) => {
    const name = data.name.trim();
    if (!name) {
      showStatus('Project name is required');
      return;
    }
    const duplicate = projects.some((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      showStatus('A project with this name already exists');
      return;
    }
    const id = await addProject(name, data.description);
    showStatus('Project created');
    return id;
  };

  const handleCreateCollection = async (data: { name: string; projectId: string }) => {
    const name = data.name.trim();
    if (!name) {
      showStatus('Collection name is required');
      return;
    }
    if (projects.find((project) => project.id === data.projectId)?.isDefault) {
      showStatus(INBOX_COLLECTION_LIMIT_MESSAGE);
      return;
    }
    const duplicate = collections.some((c) => {
      const inProject =
        c.primaryProjectId === data.projectId ||
        (Array.isArray(c.projectIds) && c.projectIds.includes(data.projectId));
      return inProject && c.name.trim().toLowerCase() === name.toLowerCase();
    });
    if (duplicate) {
      showStatus('A collection with this name already exists in this project');
      return;
    }
    const id = await addCollection(name, undefined, data.projectId);
    showStatus('Collection created');
    return id;
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const target = projects.find((p) => p.id === projectId);
      if (target?.isDefault) {
        showStatus('Inbox cannot be removed');
        return false;
      }
      const deleted = await deleteProject(projectId);
      if (deleted === false) {
        showStatus('Could not delete project');
        return false;
      }
      await loadData();
      showStatus('Project deleted');
      return true;
    } catch (error) {
      showStatus(toStatusMessage(error, 'Could not delete project'));
      return false;
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    try {
      const target = collections.find((c) => c.id === collectionId);
      if (target?.isDefault) {
        showStatus('System collections cannot be removed');
        return false;
      }
      await deleteCollection(collectionId);
      await loadData();
      showStatus('Collection deleted');
      return true;
    } catch (error) {
      showStatus(toStatusMessage(error, 'Could not delete collection'));
      return false;
    }
  };

  const handleCreateItem = async (data: {
    title: string;
    url?: string;
    notes?: string;
    collectionIds: string[];
  }) => {
    try {
      let saveUrl = (data.url || '').trim();
      let source: Item['source'] = 'manual';
      let title = data.title;

      const ctx = saveUrl ? await getActiveTabBookmarkContext() : null;
      if (ctx && saveUrl) {
        saveUrl = await resolveTabBookmarkUrl(ctx.tabId, saveUrl);
        if (!title.trim() || title.trim() === data.url?.trim()) {
          title = ctx.title || title;
        }
        if (normalizeBookmarkUrl(saveUrl) === normalizeBookmarkUrl(ctx.url)) {
          source = 'tab';
        }
      }

      const result = await addItemWithMerge({
        url: saveUrl,
        title,
        tags: [],
        source,
        collectionIds: data.collectionIds,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      });

      if (saveUrl && /^https?:\/\//i.test(saveUrl)) {
        if (result.updatedPlacementNotes && result.addedToCollections.length === 0) {
          showStatus('Notes saved');
        } else if (result.alreadyInCollections.length > 0 && result.addedToCollections.length === 0) {
          showStatus('Already saved in this collection');
        } else if (result.merged && result.addedToCollections.length > 0) {
          showStatus('Added to collection');
        } else {
          showStatus('Bookmark added');
        }
      } else {
        showStatus('Note added');
      }
    } catch (error) {
      showStatus(toStatusMessage(error, 'Could not add item'));
      throw error;
    }
  };

  const handleRestoreBackupFile = async (
    file: File,
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<RestoreBackupResult> => {
    if (mode === 'merge') {
      return { ok: false, error: 'Merge import is coming soon. Please use Replace for now.' };
    }

    const safetyNote =
      'Your current database will first be saved as safety-before-import-… in your backup folder.';

    const runReplaceImport = async (
      importFn: (forceOlder: boolean) => Promise<RestoreBackupResult>
    ): Promise<RestoreBackupResult> => {
      const first = await importFn(false);
      if (first.ok || first.cancelled) return first;
      if (!first.liveNewer) return first;
      const proceed = window.confirm(
        `${first.error ?? 'Your live database is newer than this backup.'}\n\nReplace anyway?`
      );
      if (!proceed) {
        return { ok: false, cancelled: true, liveNewer: true };
      }
      return importFn(true);
    };

    if (isSqliteBackupFile(file)) {
      const confirmMessage =
        `This will replace all current data with the selected SQLite backup (${file.name}).\n\n` +
        `${safetyNote}\n\nContinue?`;
      if (!window.confirm(confirmMessage)) {
        return { ok: false, cancelled: true };
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return runReplaceImport(async (forceOlder) => {
          const result = await backupCoordinator.importSqliteBytes(bytes, { forceOlder });
          if (result.ok) {
            await loadData();
          }
          return { ...result, format: 'sqlite' as const };
        });
      } catch (error) {
        console.error('SQLite restore error:', error);
        return { ok: false, error: String(error) };
      }
    }

    if (!/\.json$/i.test(file.name)) {
      return { ok: false, error: 'Choose a .sqlite or .json backup file.' };
    }

    try {
      const text = await file.text();
      const verification = verifyBackup(text);
      if (!verification.valid) {
        return { ok: false, error: verification.error ?? 'Invalid backup file' };
      }

      const stats = verification.stats;
      const confirmMessage =
        `This will replace all current data with:\n` +
        `${formatRestoreSummary(stats)}\n\n` +
        `${safetyNote}\n\nContinue?`;

      if (!window.confirm(confirmMessage)) {
        return { ok: false, cancelled: true };
      }

      return runReplaceImport(async (forceOlder) => {
        const result = await backupCoordinator.importJsonBackup(text, { forceOlder });
        if (result.ok) {
          await loadData();
          return { ...result, format: 'json' as const };
        }
        return { ok: false, error: result.error ?? 'Import failed. Your original data is safe.' };
      });
    } catch (error) {
      console.error('JSON restore error:', error);
      return { ok: false, error: 'Failed to read backup file' };
    }
  };

  const handleChooseBackupFolder = async (): Promise<PickBackupFolderResult> => {
    // Forget what we knew about the OLD folder's remote BEFORE the picker
    // runs, so that importDB (called below if an existing latest.json is
    // found) can populate lastSeenRemote with the NEW folder's envelope.
    revisionTracker.clearLastSeenRemote();
    const res = await pickAndPersistBackupFolder();
    if (!res.ok) {
      if (res.error !== 'cancelled') {
        showStatus(`Backup setup failed: ${res.error ?? 'Unknown error'}`);
      }
      return res;
    }
    if (res.existingBackupJson) {
      const verification = verifyBackup(res.existingBackupJson);
      if (!verification.valid) {
        showStatus('Folder linked. Existing latest.json is invalid, so current DB was kept unchanged.');
      } else {
        const imported = await importDB(res.existingBackupJson, true);
        if (imported) {
          await reloadDB();
          // Legacy JSON → OPFS only; mirror only if we actually have items.
          const { dbRpc } = await import('./lib/storage/dbClient');
          const liveFp = await dbRpc<{ itemCount: number }>('liveFingerprint', []);
          if (liveFp.itemCount > 0) {
            await mirrorNow(true);
          }
          await loadData();
          showStatus('Folder linked. Legacy latest.json imported into workbench.sqlite.');
        } else {
          showStatus('Folder linked, but loading existing latest.json failed. Current DB was kept.');
        }
      }
    } else {
      try {
        await ensureDbWorker();
        if (res.hadExistingWorkbenchDb) {
          const loaded = await loadWorkbenchSqliteFromFolder();
          if (!loaded.ok) {
            showStatus(
              `Backup folder linked, but could not LOAD your library (folder was NOT overwritten): ${loaded.error}`
            );
            return { ok: false, error: loaded.error };
          }
          await reloadDB();
          await loadData();
          showStatus('Loaded your library from workbench.sqlite in that folder (folder was not overwritten).');
        } else if (res.freshFolder) {
          // Re-check right before create — never allowEmptyMirror if a file appeared.
          const { folderHasWorkbenchSqlite } = await import('./lib/linkBackupFolder');
          if (await folderHasWorkbenchSqlite()) {
            const loaded = await loadWorkbenchSqliteFromFolder();
            if (!loaded.ok) {
              showStatus(`Folder has workbench.sqlite but load failed (not overwritten): ${loaded.error}`);
              return { ok: false, error: loaded.error };
            }
            await reloadDB();
            await loadData();
            showStatus('Loaded existing workbench.sqlite from that folder.');
          } else {
            await reloadDB();
            const mirror = await mirrorNow(true, { allowEmptyMirror: true });
            if (!mirror.ok) {
              showStatus(
                `Backup folder linked, but could not create workbench.sqlite: ${mirror.error ?? 'unknown error'}`
              );
              return { ok: false, error: mirror.error ?? 'Could not write workbench.sqlite' };
            }
            await loadData();
            showStatus('Backup folder saved. Live database is workbench.sqlite in that folder.');
          }
        } else {
          showStatus('Backup folder linked, but no database was found in that folder.');
          return { ok: false, error: 'No workbench.sqlite in folder.' };
        }
      } catch (e) {
        const msg = String(e);
        showStatus(`Backup setup failed: ${msg}`);
        return { ok: false, error: msg };
      }
    }
    // Every successful folder-link path must also establish or load the
    // independently owned, folder-only content store. Fresh folders previously
    // skipped this because only the core allowEmptyMirror branch ran.
    try {
      const { bootstrapContentFromBackupFolderFile } = await import(
        './lib/storage/content/contentClient'
      );
      await bootstrapContentFromBackupFolderFile();
    } catch (error) {
      const message = `Core database linked, but content database setup failed: ${String(error)}`;
      showStatus(message);
      return { ok: false, error: message };
    }
    await setBackupFolderOnboarding('done');
    setFolderConfigured(true);
    setFolderLinkLost(false);
    await markBackupFolderLinkedFlag();
    await refreshBackupFolderStatus();
    await runStartupConflictCheck();
    return { ok: true };
  };

  /** Re-grant permission on the persisted handle (no directory picker). */
  const handleReconnectBackupFolder = async (
    opts?: { quiet?: boolean }
  ): Promise<PickBackupFolderResult> => {
    const grant = await regrantBackupFolderPermission();
    if (!grant.ok) {
      return { ok: false, error: grant.error ?? 'Permission denied for backup folder' };
    }
    const name = await getBackupFolderName();
    await setBackupFolderOnboarding('done');
    setFolderConfigured(true);
    setFolderLinkLost(false);
    setBackupFolderReady(true);
    await refreshBackupFolderStatus();
    try {
      await bootstrapAfterFolderReady();
      if (!opts?.quiet) {
        showStatus(name ? `Reconnected to folder “${name}”.` : 'Reconnected to your data folder.');
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
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
      try {
        setFolderMirrorStatus(await getDbWorkerStatus());
      } catch {
        /* ignore */
      }
    } else {
      const firstError =
        summary.outcomes.find((o) => !o.result.ok)?.result.error ?? 'Unknown error';
      showStatus(`Manual backup failed: ${firstError}`);
    }
  };

  const handleExportJsonSnapshot = async () => {
    if (!backupCoordinator.hasAnySink()) {
      showStatus('Configure a backup folder first.');
      return;
    }
    const summary = await backupCoordinator.exportJsonSnapshot();
    if (!summary) {
      showStatus('JSON export is paused while a conflict is unresolved.');
      return;
    }
    if (summary.ok) {
      const ref = summary.outcomes.find((o) => o.result.ok)?.result.ref;
      showStatus(ref ? `JSON snapshot written: ${ref}` : 'JSON snapshot written.');
    } else {
      const firstError =
        summary.outcomes.find((o) => !o.result.ok)?.result.error ?? 'Unknown error';
      showStatus(`JSON export failed: ${firstError}`);
    }
  };

  const handleExportPipelineAnalysis = async () => {
    try {
      showStatus('Building pipeline analysis export…');
      const exported = await buildPipelineSnapshotExport();
      const saved = await saveAndDownloadPipelineRun(exported);
      if (saved.ok && saved.folder) {
        showStatus(
          `Pipeline analysis: ${exported.results.length} bookmarks → ${saved.folder}/ (+ download)`
        );
      } else {
        showStatus(
          `Pipeline analysis downloaded (${exported.results.length} bookmarks). Configure backup folder to save under pipeline-runs/.`
        );
      }
    } catch (e) {
      showStatus(
        `Pipeline analysis export failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  const handleResolveConflictLoadRemote = async () => {
    const res = await backupCoordinator.loadFromRemote();
    if (res.ok) {
      await loadData();
      showStatus(
        res.safetyRef
          ? `Loaded remote workbench.sqlite. Local saved as ${res.safetyRef}.`
          : 'Loaded remote workbench.sqlite.'
      );
    } else {
      showStatus(`Could not load remote: ${res.error ?? 'Unknown error'}`);
    }
  };

  const handleResolveConflictKeepLocal = async () => {
    const res = await backupCoordinator.forcePushLocal();
    if (res.ok) {
      showStatus('Kept local data; workbench.sqlite updated.');
    } else {
      showStatus(`Could not overwrite remote: ${res.error ?? 'Unknown error'}`);
    }
  };

  const handleOpenFullPage = async () => {
    // Push side-panel writes to latest.json before opening a separate document.
    if (backupCoordinator.hasAnySink()) {
      await mirrorNow(true);
    }
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
    showStatus('Opened settings and Homebase URL. Set it manually for Home/Startup in Chrome settings.');
  };

  const handleSaveAISettings = async (settings: AISettings) => {
    const saved = await saveAISettings(settings);
    setAiSettings(saved);
    showStatus('AI settings saved.');
  };

  const handleTestAI = async (
    settings: AISettings,
    prompt: string
  ): Promise<{ text: string; model: string; requestedModel?: string; modelMismatch?: boolean }> => {
    const response = await runAITestPrompt(settings, prompt);
    return {
      text: response.text,
      model: response.model,
      requestedModel: response.requestedModel,
      modelMismatch: response.modelMismatch,
    };
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
    if (!folderGateResolved) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', colorScheme: 'light dark', background: 'Canvas', color: 'CanvasText' }}>
          Loading…
        </div>
      );
    }

    // No handle — never open the library without a link.
    // Handle present but Chrome paused write access → still open OPFS library;
    // quiet re-grant on first gesture (do not force a blocking reconnect screen).
    if (!folderConfigured) {
      return (
        <div
          style={{
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            minHeight: '100vh',
            padding: '0.75rem',
            background: 'Canvas',
            color: 'CanvasText',
          }}
        >
          <div
            style={{
              padding: '0.75rem',
              background: 'ButtonFace',
              border: '1px solid rgba(0,0,0,0.15)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.4 }}>
              {folderLinkLost
                ? 'Your backup folder link was lost. Re-select the folder that contains '
                : 'Choose a data folder in full-page setup before using Homebase. Your live database is '}
              <code style={{ fontSize: '0.9em' }}>workbench.sqlite</code>
              {folderLinkLost ? '.' : ' in that folder.'}
            </div>
            <button
              type="button"
              onClick={handleOpenFullPageForBackupSetup}
              style={{
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                border: 'none',
                background: 'Highlight',
                color: 'HighlightText',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                alignSelf: 'flex-start',
              }}
            >
              Open full page setup
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className="side-panel-surface"
        style={{
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          minHeight: '100vh',
          position: 'relative',
          background: 'var(--bg)',
          color: 'var(--text)',
        }}
        onPointerDownCapture={() => {
          if (backupFolderReady) return;
          void handleReconnectBackupFolder({ quiet: true });
        }}
      >
        <PipelineProgressProvider onRefresh={refreshLibrary}>
          <SidePanelConnected
            projects={projects}
            collections={collections}
            items={items}
            onCreateProject={handleCreateProject}
            onCreateCollection={handleCreateCollection}
            onOpenFullPage={handleOpenFullPage}
          />
        </PipelineProgressProvider>
      </div>
    );
  }

  // Full Page View
  if (!folderGateResolved && !startupProjectionReady) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: 'var(--text-muted, #6b7280)',
        }}
      >
        Loading…
      </div>
    );
  }

  // No handle — block. Linked handle + Chrome permission pause must NOT block the library.
  if (folderGateResolved && !folderConfigured) {
    return (
      <BackupOnboardingModal
        open
        allowSkip={false}
        mode={folderLinkLost ? 'recover' : 'choose'}
        folderName={backupFolderName}
        onChooseFolder={handleChooseBackupFolder}
        onReconnectFolder={handleReconnectBackupFolder}
      />
    );
  }

  return (
    <div
      onPointerDownCapture={() => {
        // Quiet re-grant after reload/crash — no blocking reconnect screen.
        if (backupFolderReady) return;
        void handleReconnectBackupFolder({ quiet: true });
      }}
    >
    <DashboardLayout
      windows={currentWindows}
      projects={projects}
      collections={collections}
      items={items}
      workspaces={workspaces}
      onWorkspacesChanged={refreshWorkspaces}
      onAddBookmark={handleAddBookmark}
      onUpdateBookmark={handleUpdateBookmark}
      onDeleteBookmark={handleDeleteBookmark}
      onCreateProject={handleCreateProject}
      onCreateCollection={handleCreateCollection}
      onDeleteProject={handleDeleteProject}
      onDeleteCollection={handleDeleteCollection}
      onCreateItem={handleCreateItem}
      onCloseTab={handleCloseTab}
      onCloseWindow={handleCloseWindow}
      onRefresh={refreshLibrary}
      libraryLoading={libraryLoading}
      libraryHydrateProgress={libraryLoading ? libraryHydrateProgress : null}
      onChooseBackupFolder={async () => {
        await handleChooseBackupFolder();
      }}
      onSetAsBrowserHome={handleSetAsBrowserHome}
      onRestoreBackupFile={handleRestoreBackupFile}
      onManualBackup={handleManualBackup}
      onExportJsonSnapshot={handleExportJsonSnapshot}
      onExportPipelineAnalysis={handleExportPipelineAnalysis}
      folderMirrorStatus={folderMirrorStatus}
      onResolveConflictLoadRemote={handleResolveConflictLoadRemote}
      onResolveConflictKeepLocal={handleResolveConflictKeepLocal}
      backupFolderLinked={folderConfigured}
      backupFolderReady={backupFolderReady}
      backupFolderName={backupFolderName}
      backupStatus={backupStatus}
      aiSettings={aiSettings ?? undefined}
      onSaveAISettings={handleSaveAISettings}
      onTestAI={handleTestAI}
    />
    </div>
  );
}

export default App;
