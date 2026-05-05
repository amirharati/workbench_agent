import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { Collection, Item, Project } from '../lib/db';
import { Panel, Input, ButtonGhost, ButtonPrimary, Divider } from '../styles/primitives';
import { isValidHttpUrl } from '../lib/utils';

interface SidePanelViewProps {
  projects: Project[];
  collections: Collection[];
  items: Item[];
  onSaveTab: (collectionId?: string) => Promise<void>;
  onCreateItem: (data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => Promise<void>;
  onUpdateItem: (id: string, data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onCreateProject: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection: (data: { name: string; projectId: string }) => Promise<string | void>;
  onOpenFullPage: () => void;
  onSetAsBrowserHome: () => Promise<void>;
  status: string;
}

export const SidePanelView: React.FC<SidePanelViewProps> = ({
  projects,
  collections,
  items,
  onSaveTab,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onCreateProject,
  onCreateCollection,
  onOpenFullPage,
  onSetAsBrowserHome,
  status,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewProjectInline, setShowNewProjectInline] = useState(false);
  const [showNewCollectionInline, setShowNewCollectionInline] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExistingItemId, setSelectedExistingItemId] = useState<string | null>(null);
  const [forceNewCopyMode, setForceNewCopyMode] = useState(false);
  const prefillInFlightRef = useRef(false);
  const lastPrefilledRef = useRef<{ url: string; title: string }>({ url: '', title: '' });
  const activeTabUrlRef = useRef('');

  const themedSelectStyle: React.CSSProperties = {
    width: '100%',
    height: 30,
    padding: '0 0.5rem',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    fontSize: 'var(--text-sm)',
  };

  const themedOptionStyle: React.CSSProperties = {
    background: 'var(--bg-panel)',
    color: 'var(--text)',
  };

  const collectionsForProject = (pid: string) =>
    collections.filter(
      (c) => c.primaryProjectId === pid || (Array.isArray(c.projectIds) && c.projectIds.includes(pid))
    );
  const isUnsorted = (c: Collection) => c.isDefault || /^unsorted$/i.test(c.name);
  const normalizeUrl = (value: string): string => {
    try {
      const u = new URL(value.trim());
      u.hash = '';
      const normalizedPath = u.pathname.replace(/\/+$/, '');
      u.pathname = normalizedPath || '/';
      return u.toString().replace(/\/$/, '');
    } catch {
      return value.trim();
    }
  };

  const defaultProjectId = useMemo(() => {
    const def = projects.find((p) => p.isDefault)?.id;
    return def || projects[0]?.id || '';
  }, [projects]);

  useEffect(() => {
    if (!projectId && defaultProjectId) setProjectId(defaultProjectId);
  }, [projectId, defaultProjectId]);

  const scopedCollections = useMemo(() => collectionsForProject(projectId), [collections, projectId]);
  const matchingItems = useMemo(() => {
    const target = normalizeUrl(url);
    if (!target || !isValidHttpUrl(target)) return [];
    return items
      .filter((item) => item.url && normalizeUrl(item.url) === target)
      .slice(0, 5);
  }, [items, url]);
  const selectedExistingItem = useMemo(
    () => matchingItems.find((item) => item.id === selectedExistingItemId) || null,
    [matchingItems, selectedExistingItemId]
  );
  const hasExistingForUrl = matchingItems.length > 0;

  const collectionNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of collections) map.set(col.id, col.name);
    return map;
  }, [collections]);

  useEffect(() => {
    if (!projectId) return;
    if (scopedCollections.some((c) => c.id === collectionId)) return;
    const unsorted = scopedCollections.find(isUnsorted);
    setCollectionId(unsorted?.id || scopedCollections[0]?.id || '');
  }, [projectId, scopedCollections, collectionId]);

  useEffect(() => {
    if (selectedExistingItemId && !matchingItems.some((item) => item.id === selectedExistingItemId)) {
      setSelectedExistingItemId(null);
    }
  }, [matchingItems, selectedExistingItemId]);

  useEffect(() => {
    if (forceNewCopyMode) return;
    if (matchingItems.length === 0) return;
    if (selectedExistingItemId && matchingItems.some((item) => item.id === selectedExistingItemId)) return;
    // Default behavior for existing URLs: always preselect one version for update flow.
    selectExistingItemForEdit(matchingItems[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingItems, selectedExistingItemId, forceNewCopyMode]);

  useEffect(() => {
    if (matchingItems.length === 0 && forceNewCopyMode) {
      setForceNewCopyMode(false);
    }
  }, [matchingItems, forceNewCopyMode]);

  const resetForm = () => {
    setTitle('');
    setUrl('');
    setNotes('');
    setError(null);
    setSelectedExistingItemId(null);
    setForceNewCopyMode(false);
  };

  const createProjectInline = async () => {
    const name = newProjectName.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true);
    setError(null);
    try {
      const createdId = await onCreateProject({ name });
      if (createdId) setProjectId(createdId);
      setNewProjectName('');
      setShowNewProjectInline(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const createCollectionInline = async () => {
    const name = newCollectionName.trim();
    if (!name || !projectId || creatingCollection) return;
    setCreatingCollection(true);
    setError(null);
    try {
      const createdId = await onCreateCollection({ name, projectId });
      if (createdId) setCollectionId(createdId);
      setNewCollectionName('');
      setShowNewCollectionInline(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setCreatingCollection(false);
    }
  };

  const submitItem = async () => {
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    const trimmedNotes = notes.trim();

    if (!collectionId) {
      setError('Pick a collection');
      return;
    }
    if (!trimmedUrl) {
      setError('Bookmark requires a URL');
      return;
    }
    if (trimmedUrl && !isValidHttpUrl(trimmedUrl)) {
      setError('URL must start with http:// or https://');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: trimmedTitle || trimmedUrl,
        url: trimmedUrl,
        notes: trimmedNotes || undefined,
        collectionIds: [collectionId],
      };
      if (selectedExistingItemId) {
        await onUpdateItem(selectedExistingItemId, payload);
      } else {
        await onCreateItem(payload);
        // After a successful save, always return to selected-existing flow.
        setForceNewCopyMode(false);
        resetForm();
        await prefillFromActiveTab();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setSubmitting(false);
    }
  };

  const selectExistingItemForEdit = (item: Item) => {
    setForceNewCopyMode(false);
    setSelectedExistingItemId(item.id);
    setTitle(item.title || '');
    setUrl(item.url || '');
    setNotes(item.notes || '');
    const nextCollectionId = item.collectionIds?.[0];
    if (nextCollectionId) {
      setCollectionId(nextCollectionId);
      const col = collections.find((c) => c.id === nextCollectionId);
      if (col?.primaryProjectId) setProjectId(col.primaryProjectId);
    }
    setError(null);
  };

  const prefillFromActiveTab = async () => {
    if (prefillInFlightRef.current) return;
    prefillInFlightRef.current = true;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab) return;
      const tabUrl = (tab.url || '').trim();
      const tabTitle = (tab.title || '').trim();
      const tabChanged =
        !!tabUrl &&
        isValidHttpUrl(tabUrl) &&
        normalizeUrl(tabUrl) !== normalizeUrl(activeTabUrlRef.current);

      if (tabChanged) {
        activeTabUrlRef.current = tabUrl;
        setForceNewCopyMode(false);
        setSelectedExistingItemId(null);
        setNotes('');
        if (tabTitle) {
          setTitle(tabTitle);
          lastPrefilledRef.current.title = tabTitle;
        }
        setUrl(tabUrl);
        lastPrefilledRef.current.url = tabUrl;
        return;
      }

      if (tabUrl && /^https?:\/\//i.test(tabUrl)) {
        setUrl((current) => {
          const trimmed = current.trim();
          if (!trimmed || trimmed === lastPrefilledRef.current.url) {
            lastPrefilledRef.current.url = tabUrl;
            return tabUrl;
          }
          return current;
        });
      }
      if (tabTitle) {
        setTitle((current) => {
          const trimmed = current.trim();
          if (!trimmed || trimmed === lastPrefilledRef.current.title) {
            lastPrefilledRef.current.title = tabTitle;
            return tabTitle;
          }
          return current;
        });
      }
    } catch {
      // Ignore prefill failures in restricted contexts.
    } finally {
      prefillInFlightRef.current = false;
    }
  };

  useEffect(() => {
    void prefillFromActiveTab();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFocus = () => {
      void prefillFromActiveTab();
    };
    const onActivated = () => {
      void prefillFromActiveTab();
    };
    const onUpdated = (_tabId: number, changeInfo: { url?: string; title?: string; status?: string }) => {
      if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') {
        void prefillFromActiveTab();
      }
    };

    window.addEventListener('focus', onFocus);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      window.removeEventListener('focus', onFocus);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
    // register listeners once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', color: 'var(--text)' }}>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 600,
          padding: '0.15rem 0.25rem',
        }}
      >
        Quick actions
      </div>

      <ButtonPrimary
        onClick={() => {
          if (hasExistingForUrl && selectedExistingItemId) {
            void submitItem();
            return;
          }
          void (async () => {
            setForceNewCopyMode(false);
            setSelectedExistingItemId(null);
            await onSaveTab(collectionId || undefined);
            await prefillFromActiveTab();
          })();
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.625rem',
          borderRadius: 8,
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
        }}
      >
        <Save size={16} /> {hasExistingForUrl && selectedExistingItemId ? 'Update Selected' : 'Save This Tab'}
      </ButtonPrimary>

      {status && (
        <Panel
          style={{
            padding: '0.5rem',
            background: 'var(--accent-subtle, var(--bg-glass))',
            color: 'var(--text)',
            fontSize: 'var(--text-xs)',
            textAlign: 'center',
          }}
        >
          {status}
        </Panel>
      )}

      <Panel style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
          Add bookmark
        </div>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          style={{ height: 30, fontSize: 'var(--text-sm)' }}
        />

        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          style={{ height: 30, fontSize: 'var(--text-sm)' }}
        />

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Notes (optional)"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.5rem 0.6rem',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--input-bg)',
            color: 'var(--text)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Project</span>
              <button
                type="button"
                onClick={() => setShowNewProjectInline((v) => !v)}
                style={{ border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}
              >
                + New
              </button>
            </div>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={themedSelectStyle}
            >
              {projects.length === 0 && (
                <option value="" style={themedOptionStyle}>
                  No projects
                </option>
              )}
              {projects.map((p) => (
                <option key={p.id} value={p.id} style={themedOptionStyle}>
                  {p.name}
                  {p.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            {showNewProjectInline && (
              <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  style={{
                    width: '100%',
                    height: 28,
                    padding: '0 0.45rem',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--text-xs)',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createProjectInline();
                  }}
                />
                <ButtonPrimary
                  onClick={() => void createProjectInline()}
                  disabled={!newProjectName.trim() || creatingProject}
                  style={{ padding: '0 0.45rem', fontSize: 'var(--text-xs)' }}
                >
                  {creatingProject ? '…' : 'Add'}
                </ButtonPrimary>
              </div>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Collection</span>
              <button
                type="button"
                onClick={() => setShowNewCollectionInline((v) => !v)}
                style={{ border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}
              >
                + New
              </button>
            </div>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              style={themedSelectStyle}
            >
              {scopedCollections.length === 0 && (
                <option value="" style={themedOptionStyle}>
                  No collections
                </option>
              )}
              {scopedCollections.map((c) => (
                <option key={c.id} value={c.id} style={themedOptionStyle}>
                  {c.name}
                  {isUnsorted(c) ? ' (default)' : ''}
                </option>
              ))}
            </select>
            {showNewCollectionInline && (
              <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                <input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection name"
                  style={{
                    width: '100%',
                    height: 28,
                    padding: '0 0.45rem',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--text-xs)',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createCollectionInline();
                  }}
                />
                <ButtonPrimary
                  onClick={() => void createCollectionInline()}
                  disabled={!newCollectionName.trim() || creatingCollection || !projectId}
                  style={{ padding: '0 0.45rem', fontSize: 'var(--text-xs)' }}
                >
                  {creatingCollection ? '…' : 'Add'}
                </ButtonPrimary>
              </div>
            )}
          </div>
        </div>

        {matchingItems.length > 0 && (
          <Panel
            style={{
              padding: '0.5rem',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
              Already saved ({matchingItems.length})
            </div>
            {matchingItems.map((item) => {
              const notePreview = item.notes?.trim();
              const collectionNames = (item.collectionIds || [])
                .map((id) => collectionNameMap.get(id))
                .filter(Boolean)
                .join(', ');
              return (
                <div
                  key={item.id}
                  style={{
                    padding: '0.4rem 0.45rem',
                    borderRadius: 6,
                    border:
                      selectedExistingItemId === item.id
                        ? '1px solid var(--accent)'
                        : '1px solid var(--border)',
                    background:
                      selectedExistingItemId === item.id
                        ? 'var(--accent-weak)'
                        : 'var(--bg-panel)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', fontWeight: 600 }}>
                    {item.title || '(Untitled)'}
                  </div>
                  {selectedExistingItemId === item.id ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>
                      Editing this version
                    </div>
                  ) : null}
                  {notePreview ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Note: {notePreview.slice(0, 120)}
                      {notePreview.length > 120 ? '…' : ''}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Collections: {collectionNames || 'Unsorted'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => selectExistingItemForEdit(item)}
                        style={{
                          border: '1px solid var(--border)',
                          background: 'var(--bg-glass)',
                          color: 'var(--text)',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        Edit this version
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Delete this saved bookmark version?')) return;
                          await onDeleteItem(item.id);
                          if (selectedExistingItemId === item.id) {
                            setSelectedExistingItemId(null);
                          }
                        }}
                        style={{
                          border: '1px solid rgba(220, 38, 38, 0.45)',
                          background: 'rgba(220, 38, 38, 0.08)',
                          color: '#dc2626',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        Remove copy
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            <ButtonGhost
              type="button"
              onClick={async () => {
                setForceNewCopyMode(true);
                setSelectedExistingItemId(null);
                setNotes('');
                await prefillFromActiveTab();
              }}
              style={{ padding: '0.35rem 0.5rem', fontSize: 'var(--text-xs)' }}
            >
              Add a new copy
            </ButtonGhost>
          </Panel>
        )}

        {error ? (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: '#ef4444',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              padding: '0.35rem 0.45rem',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        ) : null}

        <ButtonPrimary
          onClick={() => void submitItem()}
          disabled={submitting}
          style={{ width: '100%', padding: '0.5rem', fontWeight: 600, fontSize: 'var(--text-sm)' }}
        >
          {submitting ? 'Saving…' : selectedExistingItem ? 'Update selected bookmark' : 'Add bookmark'}
        </ButtonPrimary>
      </Panel>

      <Divider style={{ margin: '0.25rem 0' }} />

      <ButtonGhost
        onClick={onOpenFullPage}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
        }}
      >
        <RefreshCw size={16} /> Open Dashboard
      </ButtonGhost>
      <ButtonGhost
        onClick={() => void onSetAsBrowserHome()}
        style={{
          padding: '0.55rem',
          fontSize: 'var(--text-xs)',
          fontWeight: 500,
        }}
      >
        Set Workbench as Home
      </ButtonGhost>
    </div>
  );
};
