import React, { useMemo, useRef } from 'react';
import { Search, Star, Clock, Zap, BarChart2 } from 'lucide-react';
import type { Item, Collection, Project, UpdateItemOptions } from '../../lib/db';
import { GlobalTabSystem, type GlobalTabState } from './GlobalTabSystem';
import { useLibrarySearch } from '../../hooks/useLibrarySearch';
import { useHomePipelineStats } from '../../hooks/useHomePipelineStats';
import type { PipelineQueueKind } from '../../lib/pipeline';

type LibrarySearchApi = ReturnType<typeof useLibrarySearch>;

const MIN_TOP_PX = 120;
const MIN_BOTTOM_PX = 100;
const RECENTLY_ADDED_LIMIT = 15;

// ===== Props =====
interface HomeViewProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  homeState: GlobalTabState;
  onHomeStateChange: (next: GlobalTabState) => void;
  onUpdateItem?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>, options?: UpdateItemOptions) => Promise<void>;
  onDeleteBookmark?: (id: string, collectionId?: string) => Promise<void>;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onLibrarySearchInTab?: (query: string) => void;
  librarySearch?: LibrarySearchApi;
  onOpenItemFromSearch?: (item: Item) => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  onPipelineBrowse?: (kind: PipelineQueueKind) => void;
  onBatchProcessQueue?: (kind: PipelineQueueKind) => Promise<void>;
  topPct: number;
  onTopPctChange: (pct: number) => void;
  renderListTab?: (tab: any) => React.ReactNode;
  statusBar?: React.ReactNode;
}

export const HomeView: React.FC<HomeViewProps> = ({
  items, collections, projects, homeState, onHomeStateChange, onUpdateItem, onDeleteBookmark, searchQuery, onSearchQueryChange, onLibrarySearchInTab, librarySearch, onOpenItemFromSearch, onBrowseCategory, onPipelineBrowse, onBatchProcessQueue, topPct, onTopPctChange, renderListTab, statusBar
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const { digest, categories, loading: pipelineLoading } = useHomePipelineStats();
  const [batchRunning, setBatchRunning] = React.useState(false);

  const handleProcessNotEnriched = async () => {
    if (!onBatchProcessQueue || batchRunning || !digest?.notEnriched) return;
    setBatchRunning(true);
    try {
      await onBatchProcessQueue('not_enriched');
    } finally {
      setBatchRunning(false);
    }
  };

  const recentItems = useMemo(
    () =>
      [...items]
        .sort(
          (a, b) =>
            (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at)
        )
        .slice(0, RECENTLY_ADDED_LIMIT),
    [items]
  );

  const openItemTab = (item: Item) => {
    const existing = homeState.tabs.find(t => t.kind === 'item' && t.itemId === item.id);
    if (existing) { onHomeStateChange({ ...homeState, activeTabId: existing.id }); return; }
    const id = 'item-' + item.id;
    // ensure new tab is at the end
    const nextTabs = [...homeState.tabs, { kind: 'item' as const, id, itemId: item.id }];
    onHomeStateChange({ ...homeState, tabs: nextTabs, activeTabId: id });
  };

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) onLibrarySearchInTab?.(q);
  };

  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const clamped = Math.max(MIN_TOP_PX, Math.min(rect.height - MIN_BOTTOM_PX, y));
      onTopPctChange((clamped / rect.height) * 100);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const hasBottomRow = homeState.tabs.length > 0;

  return (
    <div ref={containerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ===== TOP PANE ===== */}
      <div
        style={{ height: hasBottomRow ? `${topPct}%` : '100%', minHeight: MIN_TOP_PX, flexShrink: 0, overflowY: 'auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}
        className="scrollbar"
      >
        {/* Hero search */}
        <div style={{ maxWidth: 640, width: '100%' }}>
          <form onSubmit={handleHeroSearch}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 18px', boxShadow: 'var(--shadow-sm)' }}>
              <Search size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => onSearchQueryChange(e.target.value)}
                placeholder="Search your library..."
                autoFocus
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 'var(--text-lg)', fontFamily: 'var(--font-sans)' }}
              />
              {searchQuery && (
                <button type="submit" style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', padding: '5px 14px', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  Search
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, width: '100%', maxWidth: 1000 }}>
          <HomeCard icon={<Star size={14} />} title="Favorites">
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
              Pin items to see them here.<br />Right-click any item &rarr; Pin.
            </div>
          </HomeCard>

          <HomeCard icon={<Clock size={14} />} title="Recently Added">
            {recentItems.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>Add your first bookmark or note.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
                {recentItems.map(item => {
                  const tabId = 'item-' + item.id;
                  const isActive = homeState.activeTabId === tabId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => openItemTab(item)}
                      title={item.title || 'Untitled'}
                      style={{ background: isActive ? 'var(--bg-active)' : 'none', border: 'none', padding: '4px 6px', textAlign: 'left', cursor: 'pointer', color: isActive ? 'var(--accent)' : 'var(--text)', fontSize: 'var(--text-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 'var(--radius-sm)' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text)'; }}
                    >
                      {item.title || 'Untitled'}
                    </button>
                  );
                })}
              </div>
            )}
          </HomeCard>

          <HomeCard icon={<Zap size={14} />} title="Processing Digest">
            {pipelineLoading ? (
              <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', padding: '4px 0' }}>
                Loading…
              </div>
            ) : digest?.healthy ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                All caught up — library processing looks healthy.
              </div>
            ) : digest ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                <DigestLine
                  label="AI categories"
                  count={digest.suggestedCategories}
                  tone="warning"
                  onBrowse={onPipelineBrowse ? () => onPipelineBrowse('suggested_categories') : undefined}
                />
                <DigestLine
                  label="Manual review"
                  count={digest.manualReview}
                  tone="warning"
                  onBrowse={onPipelineBrowse ? () => onPipelineBrowse('manual_review') : undefined}
                />
                <DigestLine
                  label="Enrich failed"
                  count={digest.enrichFailed}
                  tone="error"
                  onBrowse={onPipelineBrowse ? () => onPipelineBrowse('enrich_failed') : undefined}
                />
                <DigestLine
                  label="Pending classify"
                  count={digest.pendingClassify}
                  tone="info"
                  onBrowse={onPipelineBrowse ? () => onPipelineBrowse('pending_classify') : undefined}
                />
                <DigestLine
                  label="Not enriched"
                  count={digest.notEnriched}
                  tone="muted"
                  onBrowse={onPipelineBrowse ? () => onPipelineBrowse('not_enriched') : undefined}
                />
                {digest.notEnriched > 0 && onBatchProcessQueue ? (
                  <button
                    type="button"
                    onClick={() => void handleProcessNotEnriched()}
                    disabled={batchRunning}
                    style={{
                      marginTop: 4,
                      padding: '5px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--accent)',
                      background: batchRunning ? 'var(--bg-hover)' : 'var(--accent-weak)',
                      color: 'var(--accent)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: batchRunning ? 'wait' : 'pointer',
                      opacity: batchRunning ? 0.7 : 1,
                      width: 'fit-content',
                    }}
                  >
                    {batchRunning
                      ? 'Processing…'
                      : `Process not enriched (${digest.notEnriched})`}
                  </button>
                ) : null}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                No processing data yet.
              </div>
            )}
          </HomeCard>

          <HomeCard icon={<BarChart2 size={14} />} title="Library Overview">
            {pipelineLoading ? (
              <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', padding: '4px 0' }}>
                Loading…
              </div>
            ) : categories.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                No AI categories with items yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                {categories.map((tile) => (
                  <button
                    key={tile.categoryId}
                    type="button"
                    onClick={() => onBrowseCategory?.(tile.categoryId, tile.name)}
                    title={`Browse ${tile.name}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '4px 6px',
                      textAlign: 'left',
                      cursor: onBrowseCategory ? 'pointer' : 'default',
                      color: 'var(--text)',
                      fontSize: 'var(--text-xs)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      if (onBrowseCategory) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none';
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tile.name}
                    </span>
                    <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>{tile.itemCount}</span>
                  </button>
                ))}
              </div>
            )}
          </HomeCard>
        </div>

        {items.length > 0 && !hasBottomRow && (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginTop: 16 }}>
            {items.length} item{items.length !== 1 ? 's' : ''} in your library
          </div>
        )}
      </div>

      {/* ===== DIVIDER ===== */}
      {hasBottomRow && (
        <div
          onMouseDown={onDividerMouseDown}
          style={{ height: 5, flexShrink: 0, background: 'var(--border)', cursor: 'row-resize', zIndex: 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-weak)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}
        />
      )}

      {/* ===== BOTTOM PANE ===== */}
      {hasBottomRow && (
        <GlobalTabSystem 
          items={items} 
          collections={collections} 
          projects={projects} 
          tabState={homeState} 
          onTabStateChange={onHomeStateChange} 
          onUpdateItem={onUpdateItem} 
          onDeleteBookmark={onDeleteBookmark}
          renderListTab={renderListTab}
          statusBar={statusBar}
          librarySearch={librarySearch}
          onOpenItemFromSearch={onOpenItemFromSearch}
        />
      )}
    </div>
  );
};

// ===== Shared card =====
interface HomeCardProps { icon: React.ReactNode; title: string; children: React.ReactNode; }
const HomeCard: React.FC<HomeCardProps> = ({ icon, title, children }) => (
  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 70 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>{icon}{title}</div>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);

const DigestLine: React.FC<{
  label: string;
  count: number;
  tone: 'warning' | 'error' | 'info' | 'muted';
  onBrowse?: () => void;
}> = ({ label, count, tone, onBrowse }) => {
  if (count === 0) return null;

  const color =
    tone === 'warning'
      ? '#d29922'
      : tone === 'error'
        ? '#ef4444'
        : tone === 'info'
          ? '#818cf8'
          : 'var(--text-muted)';

  const row = (
    <>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color }}>{count}</span>
    </>
  );

  if (!onBrowse) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        {row}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onBrowse}
      title={`Browse ${label.toLowerCase()}`}
      style={{
        all: 'unset',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        padding: '2px 4px',
        margin: '0 -4px',
        borderRadius: 'var(--radius-sm)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)';
        e.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      {row}
    </button>
  );
};
