import React, { useMemo, useState } from 'react';
import { ExternalLink, FileText, Layers3, Link2, Search, X } from 'lucide-react';
import type { Item } from '../../lib/db';
import type { GlobalTab } from './GlobalTabSystem';
import { buildItemQuickFilterText, buildQuickFilterText, matchesQuickFilter } from '../../lib/itemQuickFilter';
import { useItemDragDrop } from './ItemDragDropProvider';

function workspaceEntryLabel(tab: GlobalTab, items: readonly Item[]): string {
  if (tab.kind === 'search') return tab.query.trim() || 'Search';
  if (tab.kind === 'url') return tab.title?.trim() || tab.url;
  if (tab.kind === 'list') return tab.title || 'List';
  return items.find((item) => item.id === tab.itemId)?.title?.trim() || 'Untitled';
}

export interface ActiveWorkspaceCardProps {
  workspaceKey: string;
  projectId: string | 'all';
  title: string;
  contextLabel: string;
  tabs: GlobalTab[];
  items: Item[];
  activeEntryId?: string | null;
  emptyMessage: string;
  onSelectEntry: (tab: GlobalTab) => void;
  onRemoveEntry: (tabId: string) => void;
  trailingControl?: React.ReactNode;
  getEntryScopeLabel?: (tab: GlobalTab) => string | undefined;
  allowRemove?: boolean;
  /** Bounds compact placements such as Search; null lets the parent own scrolling. */
  maxListHeight?: number | null;
}

export const ActiveWorkspaceCard: React.FC<ActiveWorkspaceCardProps> = ({
  workspaceKey,
  projectId,
  title,
  contextLabel,
  tabs,
  items,
  activeEntryId,
  emptyMessage,
  onSelectEntry,
  onRemoveEntry,
  trailingControl,
  getEntryScopeLabel,
  allowRemove = true,
  maxListHeight = 224,
}) => {
  const { getDragProps, getDropTargetProps, getReorderTargetProps } = useItemDragDrop();
  const [filterQuery, setFilterQuery] = useState('');
  const searchIndex = useMemo(
    () => tabs.map((tab) => {
      const item = tab.kind === 'item' ? items.find((candidate) => candidate.id === tab.itemId) : undefined;
      return {
        tab,
        searchText: buildQuickFilterText(tab, workspaceEntryLabel(tab, items), getEntryScopeLabel?.(tab), item ? buildItemQuickFilterText(item) : null),
      };
    }),
    [getEntryScopeLabel, items, tabs]
  );
  const filteredTabs = filterQuery.trim()
    ? searchIndex.filter(({ searchText }) => matchesQuickFilter(searchText, filterQuery)).map(({ tab }) => tab)
    : tabs;

  return <section
    {...getDropTargetProps({
      kind: 'workspace',
      containerId: workspaceKey,
      containerLabel: title,
      projectId,
    })}
    className="ui-item-inline-drop-target"
    style={{
      padding: '10px 12px',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-panel)',
      boxShadow: 'var(--shadow-sm)',
    }}
    aria-label={`${contextLabel} active workspace`}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 25, height: 25, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--accent-weak)', color: 'var(--accent)' }}>
          <Layers3 size={12} />
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', fontSize: 'var(--text-xs)' }}>{title}</strong>
          <span style={{ display: 'block', marginTop: 1, color: 'var(--text-faint)', fontSize: 10 }}>
            {filterQuery.trim() ? `${filteredTabs.length} of ${tabs.length}` : tabs.length} workspace entr{tabs.length === 1 ? 'y' : 'ies'} · {contextLabel}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trailingControl}
      </div>
    </div>

    {tabs.length > 1 ? (
      <label className="ui-list-quick-filter" style={{ width: '100%', marginTop: 8 }}>
        <Search size={12} aria-hidden="true" />
        <input type="search" value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Filter this workspace…" aria-label={`Filter ${title}`} title="Matches all workspace entry and saved item information" />
        {filterQuery ? <button type="button" onClick={() => setFilterQuery('')} aria-label={`Clear ${title} filter`} title="Clear filter"><X size={11} /></button> : null}
      </label>
    ) : null}

    {tabs.length === 0 ? (
      <div style={{ marginTop: 8, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{emptyMessage}</div>
    ) : filteredTabs.length === 0 ? (
      <div style={{ marginTop: 8, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>No workspace entries match “{filterQuery.trim()}”.</div>
    ) : (
      <div
        className="scrollbar"
        style={{
          marginTop: 8,
          overflowY: maxListHeight == null ? 'visible' : 'auto',
          maxHeight: maxListHeight ?? undefined,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)',
        }}
      >
        {filteredTabs.map((tab) => {
          const item = tab.kind === 'item' ? items.find((candidate) => candidate.id === tab.itemId) : undefined;
          const label = workspaceEntryLabel(tab, items);
          const selected = activeEntryId === tab.id;
          const scopeLabel = getEntryScopeLabel?.(tab);
          const dragProps = item ? getDragProps(item, {
            kind: 'workspace',
            containerId: workspaceKey,
            containerLabel: title,
            projectId,
          }) : {};
          const reorderProps = item ? getReorderTargetProps(item.id, {
            kind: 'workspace',
            containerId: workspaceKey,
            containerLabel: title,
            projectId,
          }) : {};
          return (
            <div
              key={tab.id}
              {...dragProps}
              {...reorderProps}
              data-item-drag-source={item ? 'true' : undefined}
              style={{
                width: '100%',
                minWidth: 0,
                minHeight: 40,
                display: 'flex',
                alignItems: 'stretch',
                borderBottom: '1px solid var(--border)',
                background: selected ? 'var(--bg-active)' : 'transparent',
                color: selected ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              <button
                type="button"
                onClick={() => onSelectEntry(tab)}
                title={label}
                style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: selected ? 650 : 550, cursor: 'pointer' }}
              >
                <span style={{ width: 24, height: 24, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: selected ? 'var(--accent-weak)' : 'var(--bg-hover)', color: selected ? 'var(--accent)' : 'var(--text-faint)' }}>
                  {tab.kind === 'search' ? <Search size={11} /> : tab.kind === 'url' ? <ExternalLink size={11} /> : item?.url ? <Link2 size={11} /> : <FileText size={11} />}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  {scopeLabel && <span style={{ display: 'block', marginTop: 1, color: 'var(--text-faint)', fontSize: 10, fontWeight: 500 }}>{scopeLabel}</span>}
                </span>
              </button>
              {allowRemove && <button
                type="button"
                onClick={() => onRemoveEntry(tab.id)}
                title={`Remove ${label} from workspace`}
                aria-label={`Remove ${label} from workspace`}
                style={{ width: 34, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderLeft: '1px solid var(--border)', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' }}
              >
                <X size={10} />
              </button>}
            </div>
          );
        })}
      </div>
    )}
  </section>;
};
