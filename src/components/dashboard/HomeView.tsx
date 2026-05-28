import React, { useMemo, useRef } from 'react';
import { Search, Star, Clock, Zap, BarChart2, Pin, Trash2 } from 'lucide-react';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';
import type { Item, Collection, Project, UpdateItemOptions } from '../../lib/db';
import { getHomeQuickAccessItems } from '../../lib/itemQuickAccess';
import { GlobalTabSystem, type GlobalTabState, type GlobalTabList } from './GlobalTabSystem';
import { ItemContextMenu } from './ItemContextMenu';
import { Resizer } from './Resizer';
import { useLibrarySearch } from '../../hooks/useLibrarySearch';
import { useHomePipelineStats } from '../../hooks/useHomePipelineStats';
import type { PipelineQueueKind, ProcessingDigest } from '../../lib/pipeline';
import { PIPELINE_QUEUE_LABELS, PIPELINE_QUEUE_HINTS } from '../../lib/pipeline';

type LibrarySearchApi = ReturnType<typeof useLibrarySearch>;

const MIN_TOP_PX = 72;
const MIN_BOTTOM_PX = 44;
const DIVIDER_PX = 8;
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
  scopeProjectId?: string | 'all';
  scopeCollectionId?: string | 'all';
  onSwitchScopeForItem?: (item: Item) => void;
  topPct: number;
  onTopPctChange: (pct: number) => void;
  renderListTab?: (tab: any) => React.ReactNode;
  statusBar?: React.ReactNode;
}

export const HomeView: React.FC<HomeViewProps> = ({
  items, collections, projects, homeState, onHomeStateChange, onUpdateItem, onDeleteBookmark, searchQuery, onSearchQueryChange, onLibrarySearchInTab, librarySearch, onOpenItemFromSearch, onBrowseCategory, onPipelineBrowse, onBatchProcessQueue, scopeProjectId = 'all', scopeCollectionId = 'all', onSwitchScopeForItem, topPct, onTopPctChange, renderListTab, statusBar
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const topPctRef = useRef(topPct);
  topPctRef.current = topPct;
  const { digest, categories, loading: pipelineLoading } = useHomePipelineStats();
  const [batchRunning, setBatchRunning] = React.useState(false);
  const [homeItemContextMenu, setHomeItemContextMenu] = React.useState<{
    item: Item;
    x: number;
    y: number;
  } | null>(null);

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

  const quickAccessItems = useMemo(() => getHomeQuickAccessItems(items, 8), [items]);

  type HomeUtilTabId =
    | 'util-pinned'
    | 'util-favorites'
    | 'util-quick-access'
    | 'util-recent'
    | 'util-trash';

  const HOME_UTIL_META: Record<HomeUtilTabId, { listType: GlobalTabList['listType']; title: string }> = {
    'util-pinned': { listType: 'pinned', title: 'Pinned' },
    'util-favorites': { listType: 'favorites', title: 'Favorites' },
    'util-quick-access': { listType: 'quick-access', title: 'Favorites & pins' },
    'util-recent': { listType: 'recent', title: 'Recent' },
    'util-trash': { listType: 'trash', title: 'Trash' },
  };

  const openUtilityTab = (tabId: HomeUtilTabId) => {
    const meta = HOME_UTIL_META[tabId];
    const existing = homeState.tabs.find((t) => t.id === tabId);
    if (existing) {
      onHomeStateChange({ ...homeState, activeTabId: tabId });
      return;
    }
    onHomeStateChange({
      ...homeState,
      tabs: [
        ...homeState.tabs,
        { kind: 'list' as const, id: tabId, listType: meta.listType, title: meta.title },
      ],
      activeTabId: tabId,
    });
  };

  const openItemTab = (item: Item) => {
    const existing = homeState.tabs.find(t => t.kind === 'item' && t.itemId === item.id);
    if (existing) { onHomeStateChange({ ...homeState, activeTabId: existing.id }); return; }
    const id = 'item-' + item.id;
    // ensure new tab is at the end
    const nextTabs = [...homeState.tabs, { kind: 'item' as const, id, itemId: item.id }];
    onHomeStateChange({ ...homeState, tabs: nextTabs, activeTabId: id });
  };

  const showHomeItemContextMenu = (e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    setHomeItemContextMenu({ item, x: e.clientX, y: e.clientY });
  };

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) onLibrarySearchInTab?.(q);
  };

  const onDividerResize = (delta: number) => {
    if (!containerRef.current) return;
    const containerH = containerRef.current.getBoundingClientRect().height;
    const available = containerH - DIVIDER_PX;
    if (available <= 0) return;
    const maxTop = available - MIN_BOTTOM_PX;
    // Use stored split ratio — not DOM height (content was forcing the top pane larger).
    const currentTopPx = (topPctRef.current / 100) * available;
    const newTop = Math.max(MIN_TOP_PX, Math.min(maxTop, currentTopPx + delta));
    const nextPct = (newTop / available) * 100;
    topPctRef.current = nextPct;
    onTopPctChange(nextPct);
  };

  const hasBottomRow = homeState.tabs.length > 0;
  const bottomPct = Math.max(0, 100 - topPct);

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateRows: hasBottomRow
          ? `minmax(${MIN_TOP_PX}px, ${topPct}fr) ${DIVIDER_PX}px minmax(${MIN_BOTTOM_PX}px, ${bottomPct}fr)`
          : '1fr',
        overflow: 'hidden',
      }}
    >

      {/* ===== TOP PANE (landing) — scrolls independently of split size ===== */}
      <div
        style={{
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          alignItems: 'center',
        }}
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

        {/* Quick access links */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 640, width: '100%' }}>
          {(
            [
              { id: 'util-pinned' as const, label: 'Pinned', Icon: Pin },
              { id: 'util-favorites' as const, label: 'Favorites', Icon: Star },
              { id: 'util-recent' as const, label: 'Recent', Icon: Clock },
              { id: 'util-trash' as const, label: 'Trash', Icon: Trash2 },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => openUtilityTab(id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-panel)',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, width: '100%', maxWidth: 1000 }}>
          <HomeCard
            icon={<Star size={14} />}
            title="Favorites & pins"
            headerExtra={
              quickAccessItems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => openUtilityTab('util-quick-access')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--accent)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                  }}
                >
                  View all
                </button>
              ) : null
            }
          >
            {quickAccessItems.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6, padding: '4px 0' }}>
                Star or pin items to see them here.<br />Right-click any item &rarr; Add to favorites or Pin.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
                {quickAccessItems.map((item) => {
                  const tabId = 'item-' + item.id;
                  const isActive = homeState.activeTabId === tabId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => openItemTab(item)}
                      onContextMenu={(e) => showHomeItemContextMenu(e, item)}
                      title={item.title || 'Untitled'}
                      style={{
                        background: isActive ? 'var(--bg-active)' : 'none',
                        border: 'none',
                        padding: '4px 6px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: isActive ? 'var(--accent)' : 'var(--text)',
                        fontSize: 'var(--text-xs)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--accent)'; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text)'; }}
                    >
                      <ItemQuickAccessMarkers item={item} size={10} />
                      {item.title || 'Untitled'}
                    </button>
                  );
                })}
              </div>
            )}
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
                      onContextMenu={(e) => showHomeItemContextMenu(e, item)}
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
              <ProcessingDigestBody
                digest={digest}
                onPipelineBrowse={onPipelineBrowse}
                onBatchProcessQueue={onBatchProcessQueue}
                batchRunning={batchRunning}
                onProcessNotEnriched={() => void handleProcessNotEnriched()}
              />
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {categories.map((tile) => (
                  <button
                    key={tile.categoryId}
                    type="button"
                    onClick={() => onBrowseCategory?.(tile.categoryId, tile.name)}
                    title={`Browse ${tile.name}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '5px 8px',
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
          style={{
            height: DIVIDER_PX,
            minHeight: DIVIDER_PX,
            display: 'flex',
            alignItems: 'stretch',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}
          title="Drag to resize landing and tabs"
        >
          <Resizer direction="horizontal" onResize={onDividerResize} thickness={DIVIDER_PX} />
        </div>
      )}

      {/* ===== BOTTOM PANE (tabs) — scrolls inside GlobalTabSystem ===== */}
      {hasBottomRow && (
        <div
          style={{
            minHeight: 0,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
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
          scopeProjectId={scopeProjectId}
          scopeCollectionId={scopeCollectionId}
          onSwitchScopeForItem={onSwitchScopeForItem}
          />
        </div>
      )}
      {homeItemContextMenu && (
        <ItemContextMenu
          item={homeItemContextMenu.item}
          x={homeItemContextMenu.x}
          y={homeItemContextMenu.y}
          onClose={() => setHomeItemContextMenu(null)}
          onDelete={
            onDeleteBookmark
              ? (it) => {
                  void onDeleteBookmark(it.id);
                  setHomeItemContextMenu(null);
                }
              : undefined
          }
          onOpenInNewTab={(it) => {
            if (it.url) chrome.tabs.create({ url: it.url });
          }}
        />
      )}
    </div>
  );
};

// ===== Shared card =====
interface HomeCardProps { icon: React.ReactNode; title: string; children: React.ReactNode; headerExtra?: React.ReactNode; }
const HomeCard: React.FC<HomeCardProps> = ({ icon, title, children, headerExtra }) => (
  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 70 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>{icon}{title}</div>
      {headerExtra}
    </div>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);

const DigestLine: React.FC<{
  label: string;
  count: number;
  tone: 'warning' | 'error' | 'info' | 'muted';
  onBrowse?: () => void;
  hint?: string;
  deemphasized?: boolean;
}> = ({ label, count, tone, onBrowse, hint, deemphasized }) => {
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
      <span style={deemphasized ? { color: 'var(--text-faint)' } : undefined}>{label}</span>
      <span style={{ fontWeight: deemphasized ? 500 : 600, color: deemphasized ? 'var(--text-faint)' : color }}>
        {count}
      </span>
    </>
  );

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 'var(--text-xs)',
    color: deemphasized ? 'var(--text-faint)' : 'var(--text-muted)',
    opacity: deemphasized ? 0.85 : 1,
  };

  if (!onBrowse) {
    return (
      <div style={rowStyle} title={hint}>
        {row}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onBrowse}
      title={hint ?? `Browse ${label.toLowerCase()}`}
      style={{
        all: 'unset',
        ...rowStyle,
        width: '100%',
        cursor: 'pointer',
        padding: '3px 6px',
        margin: '0 -6px',
        borderRadius: 'var(--radius-sm)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)';
        e.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = deemphasized ? 'var(--text-faint)' : 'var(--text-muted)';
      }}
    >
      {row}
    </button>
  );
};

interface ProcessingDigestBodyProps {
  digest: ProcessingDigest;
  onPipelineBrowse?: (kind: PipelineQueueKind) => void;
  onBatchProcessQueue?: (kind: PipelineQueueKind) => Promise<void>;
  batchRunning: boolean;
  onProcessNotEnriched: () => void;
}

const ACTIONABLE_DIGEST_LINES: Array<{
  kind: PipelineQueueKind;
  countKey: keyof Pick<
    ProcessingDigest,
    'suggestedCategories' | 'manualReview' | 'enrichFailed' | 'pendingClassify'
  >;
  tone: 'warning' | 'error' | 'info';
}> = [
  { kind: 'suggested_categories', countKey: 'suggestedCategories', tone: 'warning' },
  { kind: 'manual_review', countKey: 'manualReview', tone: 'warning' },
  { kind: 'enrich_failed', countKey: 'enrichFailed', tone: 'error' },
  { kind: 'pending_classify', countKey: 'pendingClassify', tone: 'info' },
];

const ProcessingDigestBody: React.FC<ProcessingDigestBodyProps> = ({
  digest,
  onPipelineBrowse,
  onBatchProcessQueue,
  batchRunning,
  onProcessNotEnriched,
}) => {
  const hasActionable = ACTIONABLE_DIGEST_LINES.some((line) => digest[line.countKey] > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
      {ACTIONABLE_DIGEST_LINES.map(({ kind, countKey, tone }) => (
        <DigestLine
          key={kind}
          label={PIPELINE_QUEUE_LABELS[kind]}
          count={digest[countKey]}
          tone={tone}
          hint={PIPELINE_QUEUE_HINTS[kind]}
          onBrowse={onPipelineBrowse ? () => onPipelineBrowse(kind) : undefined}
        />
      ))}

      {digest.notEnriched > 0 && (
        <>
          {hasActionable && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                marginTop: 4,
                paddingTop: 4,
              }}
            />
          )}
          <DigestLine
            label={PIPELINE_QUEUE_LABELS.not_enriched}
            count={digest.notEnriched}
            tone="muted"
            hint={PIPELINE_QUEUE_HINTS.not_enriched}
            deemphasized={hasActionable}
            onBrowse={onPipelineBrowse ? () => onPipelineBrowse('not_enriched') : undefined}
          />
          {onBatchProcessQueue ? (
            <button
              type="button"
              onClick={onProcessNotEnriched}
              disabled={batchRunning}
              style={{
                marginTop: 4,
                padding: '5px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: batchRunning ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--text-muted)',
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
        </>
      )}
    </div>
  );
};
