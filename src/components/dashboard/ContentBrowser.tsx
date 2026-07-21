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
  <section className="ui-panel" style={panelStyle} aria-label={ariaLabel ?? title}>
    <div style={headerStyle}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', overflow: 'hidden', color: 'var(--text)', fontSize: 'var(--text-sm)', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
        <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div role="group" aria-label={`${title} view`} style={toggleGroupStyle}>
        <button className="ui-view-tab" type="button" aria-label="List view" aria-pressed={mode === 'list'} title="List view" onClick={() => onModeChange('list')} style={toggleButtonStyle(mode === 'list')}><List size={12} /></button>
        <button className="ui-view-tab" type="button" aria-label="Gallery view" aria-pressed={mode === 'gallery'} title="Gallery view" onClick={() => onModeChange('gallery')} style={toggleButtonStyle(mode === 'gallery')}><Grid2X2 size={12} /></button>
      </div>
    </div>
    <div className="scrollbar" data-content-view={mode} style={mode === 'gallery' ? galleryStyle : listStyle}>
      {entries.length === 0 ? (
        <div style={{ gridColumn: '1 / -1', padding: 24, color: 'var(--text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>{emptyMessage}</div>
      ) : renderedEntries.map((entry) => {
        const selected = entry.id === selectedId;
        return (
          <div
            ref={selected ? selectedEntryRef : undefined}
            key={entry.id}
            role="button"
            tabIndex={0}
            aria-current={selected ? 'true' : undefined}
            onClick={() => onSelect(entry.id)}
            onContextMenu={entry.onContextMenu}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(entry.id);
              }
            }}
            style={mode === 'gallery' ? galleryEntryStyle(selected) : listEntryStyle(selected)}
          >
            <span style={iconStyle(selected)}>{entry.icon}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={mode === 'gallery' ? galleryTitleStyle : listTitleStyle}>{entry.title || 'Untitled'}</span>
              {entry.subtitle && <span style={mode === 'gallery' ? gallerySubtitleStyle : listSubtitleStyle}>{entry.subtitle}</span>}
              {entry.meta && <span style={{ display: 'block', marginTop: 'auto', paddingTop: 6, color: 'var(--text-faint)', fontSize: 10 }}>{entry.meta}</span>}
            </span>
            {entry.actions && <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>{entry.actions}</span>}
          </div>
        );
      })}
      {renderedEntries.length < entries.length ? (
        <div role="status" style={loadingMoreStyle}>
          Loading more… {renderedEntries.length} of {entries.length}
        </div>
      ) : null}
    </div>
  </section>
  );
};

const panelStyle = uiPatterns.panel;
const headerStyle: React.CSSProperties = { ...uiPatterns.panelHeader, padding: '7px 10px' };
const toggleGroupStyle: React.CSSProperties = { display: 'inline-flex', gap: 2, padding: 2, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)' };
const toggleButtonStyle = (active: boolean): React.CSSProperties => ({ width: 25, height: 23, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 4, background: active ? 'var(--accent-weak)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-faint)', cursor: 'pointer' });
const listStyle: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' };
const galleryStyle: React.CSSProperties = { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gridAutoRows: 'minmax(128px, auto)', alignContent: 'start', gap: 8, padding: 8, overflowY: 'auto' };
const listEntryStyle = (selected: boolean): React.CSSProperties => ({ minHeight: 52, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderBottom: '1px solid var(--border)', borderLeft: selected ? '3px solid var(--accent)' : '3px solid transparent', background: selected ? 'var(--accent-weak)' : 'transparent', cursor: 'pointer', contentVisibility: 'auto', containIntrinsicSize: '52px' });
const galleryEntryStyle = (selected: boolean): React.CSSProperties => ({ minWidth: 0, minHeight: 128, display: 'flex', alignItems: 'flex-start', gap: 8, padding: 10, border: selected ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: selected ? 'var(--accent-weak)' : 'var(--bg-panel)', boxShadow: selected ? '0 0 0 1px var(--accent-weak)' : 'none', cursor: 'pointer', overflow: 'hidden', contentVisibility: 'auto', containIntrinsicSize: '128px' });
// Most entries use a compact icon, while Library entries may use a full
// pipeline-status pill here. Let the slot grow with its content so a badge
// never paints over the title beside it.
const iconStyle = (selected: boolean): React.CSSProperties => ({ width: 'auto', minWidth: 27, minHeight: 27, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', borderRadius: 6, background: 'var(--bg-hover)', color: selected ? 'var(--accent)' : 'var(--text-faint)' });
const listTitleStyle: React.CSSProperties = { display: 'block', overflow: 'hidden', color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const galleryTitleStyle: React.CSSProperties = { display: '-webkit-box', overflow: 'hidden', color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 650, lineHeight: 1.35, WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 };
const listSubtitleStyle: React.CSSProperties = { display: 'block', marginTop: 2, overflow: 'hidden', color: 'var(--text-faint)', fontSize: 'var(--text-xs)', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const gallerySubtitleStyle: React.CSSProperties = { display: '-webkit-box', marginTop: 6, overflow: 'hidden', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.4, wordBreak: 'break-word', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3 };
const loadingMoreStyle: React.CSSProperties = { gridColumn: '1 / -1', padding: '10px 12px', color: 'var(--text-faint)', fontSize: 'var(--text-xs)', textAlign: 'center' };
