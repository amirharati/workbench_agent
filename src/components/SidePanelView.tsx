import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Link2,
  Save,
  Star,
} from 'lucide-react';
import type { Collection, Item, Project } from '../lib/db';
import { normalizeBookmarkUrl } from '../lib/db';
import { favoriteItem, unfavoriteItem } from '../lib/itemQuickAccess';
import { getActiveTabBookmarkContext } from '../lib/tabUrlCapture';
import { isValidBookmarkUrl } from '../lib/utils';
import { ButtonGhost, ButtonPrimary, IconButton, Input, Panel } from '../styles/primitives';
import { ItemOrganizationEditor } from './dashboard/ItemOrganizationEditor';
import { SidePanelDigestPanel } from './SidePanelDigestPanel';
import {
  SidePanelExternalSection,
  type SessionExternalLink,
} from './SidePanelExternalSection';

interface SidePanelViewProps {
  projects: Project[];
  collections: Collection[];
  items: Item[];
  onCreateItem: (data: {
    title: string;
    url?: string;
    notes?: string;
    collectionIds: string[];
  }) => Promise<void>;
  onCreateExternalLink: (data: {
    url: string;
    collectionIds: string[];
  }) => Promise<string | void>;
  onUpdateItem: (
    id: string,
    data: {
      title: string;
      url?: string;
      notes?: string;
      collectionIds: string[];
      tags?: string[];
    }
  ) => Promise<void>;
  onCreateProject: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection: (data: { name: string; projectId: string }) => Promise<string | void>;
  onOpenFullPage: () => void;
  status: string;
  externalLinks?: SessionExternalLink[];
  onHostTabNavigate?: () => void;
  onHostTabContext?: (url: string) => void;
  savedStatePending?: boolean;
}

function collectionsForProject(collections: Collection[], projectId: string): Collection[] {
  return collections.filter(
    (collection) =>
      collection.primaryProjectId === projectId ||
      collection.projectIds?.includes(projectId)
  );
}

function defaultCollectionForProject(
  collections: Collection[],
  projectId: string
): Collection | undefined {
  const scoped = collectionsForProject(collections, projectId);
  return scoped.find((collection) => collection.isDefault) ?? scoped[0];
}

export const SidePanelView: React.FC<SidePanelViewProps> = ({
  projects,
  collections,
  items,
  onCreateItem,
  onCreateExternalLink,
  onUpdateItem,
  onCreateProject,
  onCreateCollection,
  onOpenFullPage,
  status,
  externalLinks = [],
  onHostTabNavigate,
  onHostTabContext,
  savedStatePending = false,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [draftCollectionIds, setDraftCollectionIds] = useState<string[]>([]);
  const [externalCollectionIds, setExternalCollectionIds] = useState<string[]>([]);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeTabIdRef = useRef<number | null>(null);
  const activeUrlRef = useRef('');
  const prefillSeqRef = useRef(0);
  const syncedItemIdRef = useRef<string | null>(null);

  const normalizedUrl = useMemo(() => normalizeBookmarkUrl(url.trim()), [url]);
  const activeItem = useMemo(() => {
    if (!normalizedUrl) return null;
    return (
      items
        .filter(
          (item) =>
            item.deletedAt == null &&
            item.url &&
            normalizeBookmarkUrl(item.url) === normalizedUrl
        )
        .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))[0] ?? null
    );
  }, [items, normalizedUrl]);

  const defaultProject = useMemo(
    () => projects.find((project) => project.isDefault) ?? projects[0],
    [projects]
  );
  useEffect(() => {
    if (!defaultProject) return;
    const defaultCollection = defaultCollectionForProject(collections, defaultProject.id);
    if (!defaultCollection) return;
    setDraftCollectionIds((current) => current.length > 0 ? current : [defaultCollection.id]);
    setExternalCollectionIds((current) => current.length > 0 ? current : [defaultCollection.id]);
  }, [collections, defaultProject]);

  useEffect(() => {
    if (!activeItem) {
      syncedItemIdRef.current = null;
      return;
    }
    if (syncedItemIdRef.current === activeItem.id) return;
    syncedItemIdRef.current = activeItem.id;
    setTitle(activeItem.title || activeItem.url || '');
    setNotes(activeItem.notes || '');
  }, [activeItem, collections]);

  const applyHostTab = useCallback(
    (tabUrl: string, tabTitle: string) => {
      const nextUrl = tabUrl.trim();
      if (!nextUrl || !isValidBookmarkUrl(nextUrl)) return;
      const changed =
        normalizeBookmarkUrl(nextUrl) !== normalizeBookmarkUrl(activeUrlRef.current);
      activeUrlRef.current = nextUrl;
      setUrl(nextUrl);
      if (changed) {
        syncedItemIdRef.current = null;
        setTitle(tabTitle.trim() || nextUrl);
        setNotes('');
        setError(null);
        setOrganizeOpen(false);
        onHostTabNavigate?.();
      } else if (!activeItem) {
        setTitle((current) => current || tabTitle.trim() || nextUrl);
      }
      onHostTabContext?.(nextUrl);
    },
    [activeItem, onHostTabContext, onHostTabNavigate]
  );

  const prefillFromHostTab = useCallback(async () => {
    const seq = ++prefillSeqRef.current;
    try {
      const context = await getActiveTabBookmarkContext();
      if (!context || seq !== prefillSeqRef.current) return;
      activeTabIdRef.current = context.tabId;
      applyHostTab(context.url, context.title);
    } catch {
      /* restricted pages may not expose a normal tab context */
    }
  }, [applyHostTab]);

  useEffect(() => {
    void prefillFromHostTab();
    const onFocus = () => void prefillFromHostTab();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void prefillFromHostTab();
    };
    const onActivated = () => void prefillFromHostTab();
    const onUpdated = (
      tabId: number,
      changeInfo: { url?: string; title?: string; status?: string }
    ) => {
      if (activeTabIdRef.current != null && tabId !== activeTabIdRef.current) return;
      if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') {
        void prefillFromHostTab();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [prefillFromHostTab]);

  const saveCurrentPage = async () => {
    setError(null);
    const trimmedUrl = url.trim();
    const trimmedTitle = title.trim() || trimmedUrl;
    if (!trimmedUrl || !isValidBookmarkUrl(trimmedUrl)) {
      setError('This page cannot be saved as a bookmark.');
      return;
    }
    if (!activeItem && draftCollectionIds.length === 0) {
      setOrganizeOpen(true);
      setError('Choose a destination first.');
      return;
    }
    setSaving(true);
    try {
      if (activeItem) {
        await onUpdateItem(activeItem.id, {
          title: trimmedTitle,
          url: trimmedUrl,
          notes: notes.trim() || undefined,
          collectionIds: activeItem.collectionIds,
          tags: activeItem.tags,
        });
      } else {
        await onCreateItem({
          title: trimmedTitle,
          url: trimmedUrl,
          notes: notes.trim() || undefined,
          collectionIds: draftCollectionIds,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this page.');
    } finally {
      setSaving(false);
    }
  };

  const updateOrganization = async (patch: {
    collectionIds?: string[];
    tags?: string[];
  }) => {
    if (!activeItem || organizationSaving) return;
    setOrganizationSaving(true);
    setError(null);
    try {
      await onUpdateItem(activeItem.id, {
        title: title.trim() || activeItem.title || activeItem.url || 'Untitled',
        url: activeItem.url,
        notes: notes.trim() || undefined,
        collectionIds: patch.collectionIds ?? activeItem.collectionIds,
        tags: patch.tags ?? activeItem.tags,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update organization.');
      throw cause;
    } finally {
      setOrganizationSaving(false);
    }
  };

  const placementLabels = useMemo(() => {
    if (!activeItem) return [];
    return activeItem.collectionIds.map((id) => {
      const collection = collections.find((row) => row.id === id);
      const project = collection
        ? projects.find((row) => row.id === collection.primaryProjectId)
        : undefined;
      return `${project?.name ?? 'Unassigned'} / ${collection?.name ?? 'Unknown'}`;
    });
  }, [activeItem, collections, projects]);

  const formatDestinationLabel = (ids: string[]) => {
    if (ids.length === 0) return 'Choose destination';
    if (ids.length > 1) return `${ids.length} saved locations`;
    const collection = collections.find((row) => row.id === ids[0]);
    const project = collection
      ? projects.find((row) => row.id === collection.primaryProjectId)
      : undefined;
    return collection
      ? `${project?.name ?? 'Unassigned'} / ${collection.name}`
      : 'Selected collection';
  };

  const destinationLabel = formatDestinationLabel(draftCollectionIds);
  const externalDestinationLabel = formatDestinationLabel(externalCollectionIds);
  const draftItem: Item = {
    id: 'side-panel-save-draft',
    url,
    title: title || url,
    collectionIds: draftCollectionIds,
    tags: [],
    created_at: 0,
    updated_at: 0,
    source: 'tab',
  };
  const externalDraftItem: Item = {
    ...draftItem,
    id: 'side-panel-external-draft',
    collectionIds: externalCollectionIds,
  };

  return (
    <div
      className="side-panel-layout"
      style={{
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text)',
      }}
    >
      <header
        className="side-panel-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0.6rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', fontWeight: 750 }}>
          Homebase
        </div>
        <ButtonGhost
          type="button"
          aria-pressed={externalOpen}
          onClick={() => setExternalOpen((open) => !open)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 8px' }}
        >
          <Link2 size={13} /> Add link
        </ButtonGhost>
        <ButtonPrimary
          type="button"
          onClick={onOpenFullPage}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 8px' }}
        >
          <LayoutDashboard size={13} /> Dashboard
        </ButtonPrimary>
      </header>

      <main
        className="scrollbar side-panel-main"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
          padding: '0.65rem 0.65rem 2rem',
        }}
      >
        {externalOpen ? (
          <SidePanelExternalSection
            open
            showTrigger={false}
            onToggleOpen={() => setExternalOpen(false)}
            links={externalLinks}
            canSave={externalCollectionIds.length > 0}
            saveHint="Choose at least one destination"
            destinationLabel={externalDestinationLabel}
            destinationControls={
              <ItemOrganizationEditor
                item={externalDraftItem}
                projects={projects}
                collections={collections}
                collectionIds={externalCollectionIds}
                tags={[]}
                compact
                showTags={false}
                onCreateProject={onCreateProject}
                onCreateCollection={onCreateCollection}
                onLocalChange={({ collectionIds: nextIds }) => setExternalCollectionIds(nextIds)}
              />
            }
            onSave={async (externalUrl) => {
              await onCreateExternalLink({ url: externalUrl, collectionIds: externalCollectionIds });
            }}
          />
        ) : null}

        <Panel
          className="side-panel-current-card"
          style={{
            padding: '0.7rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="side-panel-current-status"
                data-state={savedStatePending ? 'pending' : activeItem ? 'saved' : 'unsaved'}
                role="status"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontWeight: 650,
                }}
              >
                Current page
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 'var(--text-xs)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {activeItem ? <CheckCircle2 size={12} /> : null}
                {savedStatePending
                  ? 'Checking saved state…'
                  : activeItem
                    ? `Saved in ${placementLabels.length} ${placementLabels.length === 1 ? 'place' : 'places'}`
                    : 'Not saved'}
              </div>
            </div>
            {activeItem ? (
              <IconButton
                type="button"
                className="side-panel-favorite"
                title={activeItem.favoriteAt ? 'Remove from favorites' : 'Add to favorites'}
                aria-label={activeItem.favoriteAt ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={Boolean(activeItem.favoriteAt)}
                onClick={() =>
                  void (activeItem.favoriteAt
                    ? unfavoriteItem(activeItem.id)
                    : favoriteItem(activeItem.id))
                }
                style={{
                  width: 30,
                  height: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                }}
              >
                <Star size={14} fill={activeItem.favoriteAt ? 'currentColor' : 'none'} />
              </IconButton>
            ) : null}
          </div>

          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Page title"
            style={{ height: 32 }}
          />
          <div
            title={url}
            style={{
              padding: '0 2px',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {url || 'Waiting for a supported page…'}
          </div>
          <textarea
            className="ui-field side-panel-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="Notes (optional)"
            style={{
              width: '100%',
              minHeight: 92,
              padding: '0.5rem 0.6rem',
              resize: 'vertical',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              font: 'inherit',
              fontSize: 'var(--text-sm)',
              lineHeight: 1.45,
            }}
          />

          <button
            type="button"
            className="ui-button ui-button--secondary side-panel-organize-toggle"
            aria-expanded={organizeOpen}
            onClick={() => setOrganizeOpen((open) => !open)}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              padding: '0.45rem 0.55rem',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: organizeOpen ? 'var(--accent-weak)' : 'var(--bg-glass)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
            }}
          >
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeItem ? 'Manage saved locations' : `Save to ${destinationLabel}`}
            </span>
            {organizeOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {organizeOpen ? (
            activeItem ? (
              <div style={{ padding: '0.15rem 0' }}>
                <ItemOrganizationEditor
                  item={activeItem}
                  projects={projects}
                  collections={collections}
                  editable={!organizationSaving}
                  compact
                  onCreateProject={onCreateProject}
                  onCreateCollection={onCreateCollection}
                  onUpdate={updateOrganization}
                />
              </div>
            ) : (
              <ItemOrganizationEditor
                item={draftItem}
                projects={projects}
                collections={collections}
                collectionIds={draftCollectionIds}
                tags={[]}
                compact
                showTags={false}
                onCreateProject={onCreateProject}
                onCreateCollection={onCreateCollection}
                onLocalChange={({ collectionIds: nextIds }) => setDraftCollectionIds(nextIds)}
              />
            )
          ) : null}

          {status ? (
            <div className="ui-status" data-tone="info" role="status" style={{ fontSize: 'var(--text-xs)' }}>{status}</div>
          ) : null}
          {error ? (
            <div
              role="alert"
              style={{
                padding: '0.4rem 0.5rem',
                borderRadius: 6,
                background: 'var(--error-weak)',
                color: 'var(--error)',
                fontSize: 'var(--text-xs)',
              }}
            >
              {error}
            </div>
          ) : null}

          <ButtonPrimary
            type="button"
            onClick={() => void saveCurrentPage()}
            disabled={
              saving ||
              savedStatePending ||
              !url ||
              (!activeItem && draftCollectionIds.length === 0)
            }
            style={{
              width: '100%',
              display: 'inline-flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              padding: '0.55rem',
              fontWeight: 650,
            }}
          >
            <Save size={14} />
            {saving ? 'Saving…' : activeItem ? 'Save changes' : 'Save page'}
          </ButtonPrimary>
        </Panel>

        {activeItem ? (
          <SidePanelDigestPanel itemId={activeItem.id} onOpenInApp={onOpenFullPage} />
        ) : (
          <Panel style={{ padding: '0.65rem' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Save this page first, then run an optional AI digest. Saving alone never spends AI credits.
            </div>
          </Panel>
        )}
      </main>
    </div>
  );
};
