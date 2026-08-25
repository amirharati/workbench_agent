import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Database, ExternalLink, FileText, Folder, Layers3, Tags } from 'lucide-react';
import { getItem, type Collection, type Item, type Project, type UpdateItemOptions } from '../../lib/db';
import { loadRawBody } from '../../lib/enrichment/rawBodyStore';
import { useInspectorItemData } from '../../hooks/useInspectorItemData';
import { DialogShell } from './DialogShell';
import { ItemOrganizationEditor } from './ItemOrganizationEditor';
import { openBookmarkInBrowser } from './BookmarkUrlLink';
import { LinkVisual } from './LinkVisual';
import { EnrichmentContent } from './PipelineDisplayBlocks';
import type { WorkspaceDestination } from './workspaceDestinations';

export interface ItemPeekOptions {
  itemIds?: readonly string[];
  sourceLabel?: string;
}

interface ItemPeekContextValue {
  openPeek: (itemId: string, options?: ItemPeekOptions) => void;
  closePeek: () => void;
  activeItemId: string | null;
}

const ItemPeekContext = createContext<ItemPeekContextValue>({
  openPeek: () => {},
  closePeek: () => {},
  activeItemId: null,
});

export function useItemPeek(): ItemPeekContextValue {
  return useContext(ItemPeekContext);
}

interface PeekRequest {
  itemId: string;
  itemIds: string[];
  sourceLabel?: string;
}

interface ItemPeekProviderProps {
  children: React.ReactNode;
  items: readonly Item[];
  projects: readonly Project[];
  collections: readonly Collection[];
  workspaceDestinations: readonly WorkspaceDestination[];
  activeWorkspaceKey: string;
  isItemInWorkspace: (item: Item, destination: WorkspaceDestination) => boolean;
  onAddItemToWorkspace: (item: Item, destination: WorkspaceDestination) => void;
  onViewItemInWorkspace: (item: Item, destination: WorkspaceDestination) => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
}

const MAX_PREVIEW_CHARS = 500_000;
const ItemPeekMarkdown = React.lazy(() => import('./ItemPeekMarkdown'));

export function cleanStoredPreviewMarkdown(value: string): string {
  return value
    .replace(/^\s*<!--\s*enrichment-meta\b[\s\S]*?-->\s*/i, '')
    .trim();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function normalizePeekOrder(itemId: string, itemIds?: readonly string[]): string[] {
  const ordered = [...new Set((itemIds ?? []).filter(Boolean))];
  if (!ordered.includes(itemId)) ordered.unshift(itemId);
  return ordered;
}

export const ItemPeekProvider: React.FC<ItemPeekProviderProps> = ({
  children,
  items,
  projects,
  collections,
  workspaceDestinations,
  activeWorkspaceKey,
  isItemInWorkspace,
  onAddItemToWorkspace,
  onViewItemInWorkspace,
  onUpdateItem,
  onCreateProject,
  onCreateCollection,
}) => {
  const [request, setRequest] = useState<PeekRequest | null>(null);
  const [resolvedItem, setResolvedItem] = useState<Item | null>(null);
  const [itemLoading, setItemLoading] = useState(false);
  const [rawBody, setRawBody] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawUnavailable, setRawUnavailable] = useState(false);
  const [showStoredSource, setShowStoredSource] = useState(false);
  const [workspaceKey, setWorkspaceKey] = useState(activeWorkspaceKey);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);

  const openPeek = useCallback((itemId: string, options?: ItemPeekOptions) => {
    setRequest({
      itemId,
      itemIds: normalizePeekOrder(itemId, options?.itemIds),
      sourceLabel: options?.sourceLabel,
    });
  }, []);
  const closePeek = useCallback(() => setRequest(null), []);
  const currentIndex = request ? request.itemIds.indexOf(request.itemId) : -1;
  const canGoPrevious = currentIndex > 0;
  const canGoNext = Boolean(request && currentIndex >= 0 && currentIndex < request.itemIds.length - 1);

  const goToIndex = useCallback((index: number) => {
    setRequest((current) => {
      const itemId = current?.itemIds[index];
      return current && itemId ? { ...current, itemId } : current;
    });
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const index = request.itemIds.indexOf(request.itemId);
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        goToIndex(index - 1);
      } else if (event.key === 'ArrowRight' && index >= 0 && index < request.itemIds.length - 1) {
        event.preventDefault();
        goToIndex(index + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToIndex, request]);

  useEffect(() => {
    if (!request) {
      setResolvedItem(null);
      setItemLoading(false);
      return;
    }
    const hydrated = items.find((item) => item.id === request.itemId);
    if (hydrated) {
      setResolvedItem(hydrated);
      setItemLoading(false);
      return;
    }
    let cancelled = false;
    setResolvedItem(null);
    setItemLoading(true);
    void getItem(request.itemId)
      .then((item) => {
        if (!cancelled) setResolvedItem(item ?? null);
      })
      .catch(() => {
        if (!cancelled) setResolvedItem(null);
      })
      .finally(() => {
        if (!cancelled) setItemLoading(false);
      });
    return () => { cancelled = true; };
  }, [items, request]);

  const item = resolvedItem?.id === request?.itemId ? resolvedItem : null;
  const { context, contextLoading } = useInspectorItemData(request?.itemId);
  const rawRef = context?.enrichment?.rawRef;

  useEffect(() => {
    setShowStoredSource(false);
    setRawBody(null);
    setRawUnavailable(false);
    setRawLoading(false);
  }, [request?.itemId]);

  useEffect(() => {
    if (!request?.itemId || !rawRef || !showStoredSource) return;
    let cancelled = false;
    setRawLoading(true);
    void loadRawBody(rawRef)
      .then((body) => {
        if (cancelled) return;
        setRawBody(body);
        setRawUnavailable(body == null);
      })
      .catch(() => {
        if (!cancelled) setRawUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setRawLoading(false);
      });
    return () => { cancelled = true; };
  }, [rawRef, request?.itemId, showStoredSource]);

  useEffect(() => {
    setWorkspaceKey(activeWorkspaceKey);
    setWorkspaceNotice(null);
  }, [activeWorkspaceKey, request?.itemId]);

  const contextValue = useMemo<ItemPeekContextValue>(() => ({
    openPeek,
    closePeek,
    activeItemId: request?.itemId ?? null,
  }), [closePeek, openPeek, request?.itemId]);

  const selectedWorkspace = workspaceDestinations.find((destination) => destination.key === workspaceKey)
    ?? workspaceDestinations.find((destination) => destination.key === activeWorkspaceKey)
    ?? workspaceDestinations[0];
  const sourceText = cleanStoredPreviewMarkdown(rawBody ?? '');
  const sourceTruncated = sourceText.length > MAX_PREVIEW_CHARS;
  const displayedSource = sourceTruncated ? sourceText.slice(0, MAX_PREVIEW_CHARS) : sourceText;
  const enrichmentTags = [...new Map(
    [...(context?.enrichment?.aiTags ?? []), ...(item?.tags ?? [])]
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => [tag.toLocaleLowerCase(), tag] as const)
  ).values()];
  const acceptedCategories = context?.acceptedLinks ?? [];
  const suggestedCategories = context?.suggestedLinks ?? [];
  const hasNotes = Boolean(item?.notes?.trim());

  return (
    <ItemPeekContext.Provider value={contextValue}>
      {children}
      {request ? (
        <DialogShell
          title="Preview"
          description={request.sourceLabel ? `Opened from ${request.sourceLabel}. Your underlying view stays unchanged.` : 'Your underlying view stays unchanged.'}
          onClose={closePeek}
          maxWidth="min(94vw, 1320px)"
          maxHeight="92vh"
          bodyClassName="ui-item-peek"
          bodyStyle={{ padding: 0, overflow: 'hidden' }}
          footer={(
            <div className="ui-item-peek__footer">
              <span>{request.itemIds.length > 1 ? `${currentIndex + 1} of ${request.itemIds.length}` : 'Previewing one item'}</span>
              <div>
                <button className="ui-button ui-button--secondary" type="button" disabled={!canGoPrevious} onClick={() => goToIndex(currentIndex - 1)}><ArrowLeft size={13} /> Previous</button>
                <button className="ui-button ui-button--secondary" type="button" disabled={!canGoNext} onClick={() => goToIndex(currentIndex + 1)}>Next <ArrowRight size={13} /></button>
                {item?.url ? <button className="ui-button ui-button--primary" type="button" onClick={() => void openBookmarkInBrowser(item)}><ExternalLink size={13} /> Open original</button> : null}
              </div>
            </div>
          )}
        >
          <div className="ui-item-peek__layout">
            <main className="ui-item-peek__content scrollbar">
              {itemLoading ? <div className="ui-item-peek__empty">Loading item…</div> : item ? (
                <>
                  <header className="ui-item-peek__item-header">
                    <span className="ui-item-peek__kind">{item.url ? <ExternalLink size={13} /> : <FileText size={13} />}{item.url ? 'Saved link' : 'Note'}</span>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {item.url ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} /> : null}
                      {item.title || 'Untitled'}
                    </h3>
                    {item.url ? <button type="button" className="ui-item-peek__url" onClick={() => void openBookmarkInBrowser(item)} title="Open original in Chrome">{item.url}</button> : null}
                  </header>
                  <article className="ui-item-peek__document">
                    {item.url ? (
                      <section className="ui-item-peek__section" aria-label="Saved item summary">
                        {contextLoading && !context ? (
                          <div className="ui-item-peek__section-loading">Loading saved details…</div>
                        ) : (
                          <EnrichmentContent
                            summary={context?.summary}
                            tags={enrichmentTags}
                            keyPoints={context?.keyPoints ?? []}
                            references={context?.references ?? []}
                            emptyMessage="No AI summary is available yet. The title, URL, notes, and organization are still preserved."
                          />
                        )}
                      </section>
                    ) : null}

                    {hasNotes ? (
                      <section className="ui-item-peek__section" aria-label="Notes">
                        <h4>Notes</h4>
                        <React.Suspense fallback={<div className="ui-item-peek__section-loading">Formatting notes…</div>}>
                          <ItemPeekMarkdown markdown={item.notes!.trim()} />
                        </React.Suspense>
                      </section>
                    ) : !item.url ? (
                      <div className="ui-item-peek__empty"><strong>This note is empty.</strong></div>
                    ) : null}

                    {acceptedCategories.length || suggestedCategories.length ? (
                      <section className="ui-item-peek__section" aria-label="Categories">
                        <h4><Tags size={13} /> Categories</h4>
                        <div className="ui-item-peek__categories">
                          {acceptedCategories.map((category) => (
                            <span className="ui-item-peek__category" data-state="accepted" key={`accepted-${category.categoryId}`}>
                              <strong>{category.name}</strong>
                              {category.parentName ? <small>{category.parentName}</small> : null}
                            </span>
                          ))}
                          {suggestedCategories.map((category) => (
                            <span className="ui-item-peek__category" data-state="suggested" key={`suggested-${category.categoryId}`}>
                              <strong>{category.name}</strong>
                              <small>{category.parentName ? `${category.parentName} · Suggested` : 'Suggested'}</small>
                            </span>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {rawRef ? (
                      <section className="ui-item-peek__source-section">
                        <button
                          className="ui-button ui-button--secondary ui-button--compact"
                          type="button"
                          aria-expanded={showStoredSource}
                          onClick={() => setShowStoredSource((visible) => !visible)}
                        >
                          <Database size={13} /> {showStoredSource ? 'Hide stored source' : 'View stored source'}
                        </button>
                        <span>The extracted source is diagnostic material, not the item preview.</span>
                        {showStoredSource ? (
                          <div className="ui-item-peek__source">
                            <h4>Stored source text</h4>
                            {rawLoading ? (
                              <div className="ui-item-peek__section-loading">Loading stored source…</div>
                            ) : displayedSource ? (
                              <>
                                <pre>{displayedSource}</pre>
                                {sourceTruncated ? <p className="ui-item-peek__notice">Stored source truncated for performance.</p> : null}
                              </>
                            ) : (
                              <p>{rawUnavailable ? 'The stored source could not be read.' : 'No stored source text is available.'}</p>
                            )}
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                  </article>
                </>
              ) : <div className="ui-item-peek__empty">This item is no longer available.</div>}
            </main>

            <aside className="ui-item-peek__organize scrollbar" aria-label="Organize previewed item">
              <section>
                <h3><Folder size={13} /> Collections and tags</h3>
                {item ? (
                  <ItemOrganizationEditor
                    key={item.id}
                    item={item}
                    projects={[...projects]}
                    collections={[...collections]}
                    editable={Boolean(onUpdateItem)}
                    onUpdate={onUpdateItem ? (patch) => onUpdateItem(item.id, patch) : undefined}
                    onCreateProject={onCreateProject}
                    onCreateCollection={onCreateCollection}
                    compact
                  />
                ) : null}
              </section>

              <section>
                <h3><Layers3 size={13} /> Workspace</h3>
                <p>Choose a destination. Changing or adding here does not navigate.</p>
                <select className="ui-field" value={selectedWorkspace?.key ?? ''} onChange={(event) => { setWorkspaceKey(event.target.value); setWorkspaceNotice(null); }} aria-label="Preview workspace destination">
                  {workspaceDestinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.path}</option>)}
                </select>
                {item && selectedWorkspace ? (
                  <div className="ui-item-peek__workspace-actions">
                    <button
                      className="ui-button ui-button--primary"
                      type="button"
                      disabled={isItemInWorkspace(item, selectedWorkspace)}
                      onClick={() => {
                        onAddItemToWorkspace(item, selectedWorkspace);
                        setWorkspaceNotice(`Added to ${selectedWorkspace.path}`);
                      }}
                    >
                      {isItemInWorkspace(item, selectedWorkspace) ? 'Already added' : 'Add to workspace'}
                    </button>
                    <button
                      className="ui-button ui-button--secondary"
                      type="button"
                      onClick={() => {
                        closePeek();
                        onViewItemInWorkspace(item, selectedWorkspace);
                      }}
                    >
                      View workspace
                    </button>
                  </div>
                ) : null}
                {workspaceNotice ? <div className="ui-status" data-tone="success" role="status">{workspaceNotice}</div> : null}
              </section>
            </aside>
          </div>
        </DialogShell>
      ) : null}
    </ItemPeekContext.Provider>
  );
};
