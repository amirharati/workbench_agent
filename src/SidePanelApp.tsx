import { useCallback, useEffect, useState } from 'react';
import { SidePanelConnected } from './components/SidePanelConnected';
import { PipelineProgressProvider } from './components/dashboard/PipelineProgressProvider';
import {
  addCollection,
  addProject,
  type Collection,
  type Project,
} from './lib/db';
import { requestBackupOnboardingOpen } from './lib/backupOnboarding';
import {
  hasConfiguredBackupFolder,
  hasWritableBackupFolder,
  regrantBackupFolderPermission,
  wasBackupFolderLinked,
} from './lib/backupFolder';
import {
  DATA_CHANGED_BROADCAST_CHANNEL,
  subscribeToDataChanges,
  type DataChangeEvent,
} from './lib/dataChangeNotifier';
import { INBOX_COLLECTION_LIMIT_MESSAGE } from './lib/systemDataModel';
import { requestSidePanelStartupProjection } from './lib/sidePanelStartup';
import { buildDashboardOpenItemUrl } from './lib/shell/dashboardOpenIntent';

function shouldRefreshOrganization(event: DataChangeEvent): boolean {
  return (
    event.reason.startsWith('project.') ||
    event.reason.startsWith('collection.') ||
    event.reason.startsWith('import.')
  );
}

function SidePanelApp() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [folderConfigured, setFolderConfigured] = useState(false);
  const [folderLinkLost, setFolderLinkLost] = useState(false);
  const [folderWritable, setFolderWritable] = useState(false);
  const [gateResolved, setGateResolved] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);

  const loadOrganization = useCallback(async () => {
    const projection = await requestSidePanelStartupProjection();
    setProjects(projection.projects);
    setCollections(projection.collections);
    setStartupError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const configured = await hasConfiguredBackupFolder();
        const linkedBefore = await wasBackupFolderLinked();
        const writable = configured ? await hasWritableBackupFolder() : false;
        if (cancelled) return;
        setFolderConfigured(configured);
        setFolderLinkLost(!configured && linkedBefore);
        setFolderWritable(writable);
        setGateResolved(true);
        if (configured) await loadOrganization();
      } catch (error) {
        if (cancelled) return;
        setGateResolved(true);
        setStartupError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadOrganization]);

  useEffect(() => {
    if (!folderConfigured) return;
    let refreshTimer: number | undefined;
    const scheduleRefresh = (event: DataChangeEvent) => {
      if (!shouldRefreshOrganization(event)) return;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void loadOrganization().catch(() => {});
      }, 150);
    };
    const unsubscribe = subscribeToDataChanges(scheduleRefresh);
    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(DATA_CHANGED_BROADCAST_CHANNEL)
      : null;
    if (channel) {
      channel.onmessage = (message: MessageEvent<DataChangeEvent>) => scheduleRefresh(message.data);
    }
    return () => {
      unsubscribe();
      channel?.close();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [folderConfigured, loadOrganization]);

  const openDashboard = useCallback(async (openSetup = false, itemId?: string) => {
    if (openSetup) await requestBackupOnboardingOpen();
    await chrome.tabs.create({
      url: buildDashboardOpenItemUrl(chrome.runtime.getURL('index.html'), itemId),
    });
  }, []);

  const reconnectFolder = useCallback(async () => {
    if (folderWritable || !folderConfigured) return;
    const result = await regrantBackupFolderPermission();
    if (!result.ok) return;
    setFolderWritable(true);
    await loadOrganization().catch(() => {});
  }, [folderConfigured, folderWritable, loadOrganization]);

  const createProject = useCallback(async (data: { name: string; description?: string }) => {
    const name = data.name.trim();
    if (!name) return;
    if (projects.some((project) => project.name.trim().toLowerCase() === name.toLowerCase())) {
      return;
    }
    const id = await addProject(name, data.description);
    await loadOrganization();
    return id;
  }, [loadOrganization, projects]);

  const createCollection = useCallback(async (data: { name: string; projectId: string }) => {
    const name = data.name.trim();
    if (!name) return;
    if (projects.find((project) => project.id === data.projectId)?.isDefault) {
      throw new Error(INBOX_COLLECTION_LIMIT_MESSAGE);
    }
    const duplicate = collections.some((collection) => {
      const inProject =
        collection.primaryProjectId === data.projectId ||
        collection.projectIds?.includes(data.projectId);
      return inProject && collection.name.trim().toLowerCase() === name.toLowerCase();
    });
    if (duplicate) return;
    const id = await addCollection(name, undefined, data.projectId);
    await loadOrganization();
    return id;
  }, [collections, loadOrganization, projects]);

  if (!gateResolved) {
    return (
      <div className="side-panel-surface" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        Loading…
      </div>
    );
  }

  if (!folderConfigured) {
    return (
      <div className="side-panel-surface" style={{ minHeight: '100vh', padding: '0.75rem' }}>
        <div className="ui-card" style={{ padding: '0.75rem', display: 'grid', gap: '0.6rem' }}>
          <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.45 }}>
            {folderLinkLost
              ? 'Your backup folder link was lost. Re-select the folder from the full Homebase page.'
              : 'Choose a data folder in the full Homebase page before using the side panel.'}
          </div>
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => void openDashboard(true)}
          >
            Open full-page setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="side-panel-surface"
      style={{ minHeight: '100vh', position: 'relative', background: 'var(--bg)', color: 'var(--text)' }}
      onPointerDownCapture={() => void reconnectFolder()}
    >
      {startupError ? (
        <div role="alert" style={{ padding: '0.5rem 0.75rem', color: 'var(--error)' }}>
          Could not load Homebase: {startupError}
        </div>
      ) : null}
      <PipelineProgressProvider onRefresh={loadOrganization}>
        <SidePanelConnected
          projects={projects}
          collections={collections}
          items={[]}
          onCreateProject={createProject}
          onCreateCollection={createCollection}
          onOpenFullPage={(itemId) => void openDashboard(false, itemId)}
        />
      </PipelineProgressProvider>
    </div>
  );
}

export default SidePanelApp;
