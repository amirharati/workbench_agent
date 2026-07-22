import React, { useEffect, useState } from 'react';
import { Grid2X2, List } from 'lucide-react';
import { uiPatterns } from '../../styles/uiPatterns';

export type ContentBrowseMode = 'list' | 'gallery';

export interface ContentBrowseEntry {
  id: string;
  title: string;
  icon: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  onContextMenu?: (event: React.MouseEvent) => void;
}

interface ContentBrowserProps {
  title: string;
  entries: ContentBrowseEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  mode: ContentBrowseMode;
  onModeChange: (mode: ContentBrowseMode) => void;
  emptyMessage: string;
  ariaLabel?: string;
  headerActions?: React.ReactNode;
}

export function useContentBrowseMode(storageKey: string): [ContentBrowseMode, (mode: ContentBrowseMode) => void] {
  const [mode, setMode] = useState<ContentBrowseMode>(() => {
    if (typeof window === 'undefined') return 'list';
    return window.localStorage.getItem(storageKey) === 'gallery' ? 'gallery' : 'list';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, mode);
  }, [mode, storageKey]);

  return [mode, setMode];
}

export const ContentBrowser: React.FC<ContentBrowserProps> = ({
  title,
  entries,
  selectedId,
  onSelect,
  mode,
  onModeChange,
  emptyMessage,
  ariaLabel,
  headerActions,
}) => {
  const [renderLimit, setRenderLimit] = useState(60);
  const selectedEntryRef = React.useRef<HTMLDivElement>(null);
  const firstEntryId = entries[0]?.id;
  const lastEntryId = entries[entries.length - 1]?.id;

  useEffect(() => {
    setRenderLimit(60);
  }, [mode, entries.length, firstEntryId, lastEntryId]);

  useEffect(() => {
    if (renderLimit >= entries.length || typeof window === 'undefined') return;
    const revealMore = () => setRenderLimit((current) => Math.min(entries.length, current + 100));
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(revealMore, { timeout: 120 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(revealMore, 16);
    return () => window.clearTimeout(id);
  }, [entries.length, renderLimit]);

  const renderedEntries = entries.slice(0, renderLimit);

  useEffect(() => {
    if (!selectedId || !selectedEntryRef.current) return;
    selectedEntryRef.current.scrollIntoView({ block: 'nearest' });
  }, [renderedEntries.length, selectedId]);

  return (
  <section className="ui-panel ui-content-browser" style={panelStyle} aria-label={ariaLabel ?? title}>
    <div className="ui-content-browser__header" style={headerStyle}>
      <div className="ui-content-browser__heading">
        <strong className="ui-content-browser__title">{title}</strong>
        <span className="ui-content-browser__count">{entries.length.toLocaleString()} item{entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="ui-content-browser__header-actions">
        {headerActions}
        <div className="ui-content-browser__view-toggle" role="group" aria-label={`${title} view`}>
          <button className="ui-content-browser__view-button" type="button" aria-label="List view" aria-pressed={mode === 'list'} title="List view" onClick={() => onModeChange('list')}><List size={13} /></button>
          <button className="ui-content-browser__view-button" type="button" aria-label="Gallery view" aria-pressed={mode === 'gallery'} title="Gallery view" onClick={() => onModeChange('gallery')}><Grid2X2 size={13} /></button>
        </div>
      </div>
    </div>
    <div className="scrollbar ui-content-browser__body" data-content-view={mode}>
      {entries.length === 0 ? (
        <div className="ui-content-browser__empty">{emptyMessage}</div>
      ) : renderedEntries.map((entry) => {
        const selected = entry.id === selectedId;
        return (
          <div
            ref={selected ? selectedEntryRef : undefined}
            key={entry.id}
            role="button"
            tabIndex={0}
            aria-current={selected ? 'true' : undefined}
            data-content-entry
            data-selected={selected ? 'true' : 'false'}
            onClick={() => onSelect(entry.id)}
            onContextMenu={entry.onContextMenu}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(entry.id);
              }
            }}
            className="ui-content-browser__entry"
          >
            <span className="ui-content-browser__leading" data-content-leading="true">{entry.icon}</span>
            <span className="ui-content-browser__copy">
              <span className="ui-content-browser__entry-title" title={entry.title || 'Untitled'}>{entry.title || 'Untitled'}</span>
              {entry.subtitle && <span className="ui-content-browser__subtitle">{entry.subtitle}</span>}
              {entry.meta && <span className="ui-content-browser__meta">{entry.meta}</span>}
            </span>
            {entry.actions && (
              <span
                className="ui-content-browser__actions"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {entry.actions}
              </span>
            )}
          </div>
        );
      })}
      {renderedEntries.length < entries.length ? (
        <div className="ui-content-browser__loading" role="status">
          Loading more… {renderedEntries.length} of {entries.length}
        </div>
      ) : null}
    </div>
  </section>
  );
};

const panelStyle = uiPatterns.panel;
const headerStyle: React.CSSProperties = uiPatterns.panelHeader;
