import React, { useMemo, useRef, useState } from 'react';
import type { Project, Collection, Item } from '../../lib/db';
import { CollectionPills } from './CollectionPills';
import { SearchBar } from './SearchBar';
import { QuickActions } from './QuickActions';
import { ItemsListPanel } from './ItemsListPanel';
import { TabBar, TabBarTab } from './TabBar';
import { TabContent } from './TabContent';
import { Resizer } from './Resizer';
import { useEffect } from 'react';
import { Panel, ButtonGhost } from '../../styles/primitives';

type Tab = {
  id: string;
  title: string;
  itemId: string;
  content?: string;
};

interface ProjectDashboardProps {
  project: Project;
  collections: Collection[];
  items: Item[];
  onBack: () => void;
}

/**
 * Minimal Project Dashboard (Phase 1 MVP)
 * - Top pills for collections
 * - Search bar
 * - Items list (left)
 * - Single tabbed content panel (right)
 * - No right pane / no vertical split yet
 */
export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  project,
  collections,
  items,
  onBack,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(320);
  const [rightPaneVisible, setRightPaneVisible] = useState(false);
  const [rightPaneWidth, setRightPaneWidth] = useState(420);
  const [rightTabs, setRightTabs] = useState<Tab[]>([]);
  const [activeRightTabId, setActiveRightTabId] = useState<string | null>(null);
  const [mainSplit, setMainSplit] = useState(false);
  const [mainSplitRatio, setMainSplitRatio] = useState(60); // percent for top
  const layoutKey = `pd-layout-${project.id}`;
  const searchInputRef = useRef<HTMLInputElement>(null);

  const projectCollections = useMemo(() => {
    return collections.filter(
      (c) =>
        c.primaryProjectId === project.id ||
        (Array.isArray(c.projectIds) && c.projectIds.includes(project.id)),
    );
  }, [collections, project.id]);

  const projectItems = useMemo(() => {
    const collectionIdSet = new Set(projectCollections.map((c) => c.id));
    return items.filter((item) => {
      const cids = item.collectionIds || [];
      return cids.some((cid: string) => collectionIdSet.has(cid));
    });
  }, [items, projectCollections]);

  const collectionItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    projectItems.forEach((item) => {
      (item.collectionIds || []).forEach((cid) => {
        counts[cid] = (counts[cid] || 0) + 1;
      });
    });
    return counts;
  }, [projectItems]);

  const recentItems = useMemo(() => {
    return [...projectItems].sort((a, b) => b.created_at - a.created_at).slice(0, 10);
  }, [projectItems]);

  const filteredItems = useMemo(() => {
    let list =
      selectedCollectionId === 'all'
        ? projectItems
        : projectItems.filter((i) => (i.collectionIds || []).includes(selectedCollectionId));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => {
        const hay = [i.title, i.url, i.notes].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    return list.sort((a, b) => b.created_at - a.created_at);
  }, [projectItems, selectedCollectionId, searchQuery]);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || null, [tabs, activeTabId]);
  const activeItem = useMemo(
    () => (activeTab ? projectItems.find((i) => i.id === activeTab.itemId) || null : null),
    [activeTab, projectItems],
  );

  const handleItemClick = (item: Item) => {
    const existing = tabs.find((t) => t.itemId === item.id);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const newTab: Tab = { id: item.id, itemId: item.id, title: item.title || 'Untitled' };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleTabClose = (tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) {
      const next = tabs.filter((t) => t.id !== tabId);
      setActiveTabId(next.length ? next[next.length - 1].id : null);
    }
  };

  const handleMoveTabToRight = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    // Add to right pane if not present
    if (!rightTabs.find((t) => t.id === tab.id)) {
      setRightTabs((prev) => [...prev, tab]);
    }
    setActiveRightTabId(tab.id);
    setRightPaneVisible(true);
  };

  const handleRightTabClose = (tabId: string) => {
    setRightTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeRightTabId === tabId) {
      const next = rightTabs.filter((t) => t.id !== tabId);
      setActiveRightTabId(next.length ? next[next.length - 1].id : null);
    }
  };

  const handleQuickAction = (id: string) => {
    const tabId = `qa-${id}`;
    const title = id.charAt(0).toUpperCase() + id.slice(1);
    const existing = tabs.find((t) => t.id === tabId);
    if (!existing) {
      let content = `Placeholder for ${title}`;
      if (id === 'recent') {
        content =
          recentItems
            .map(
              (it) =>
                `- ${it.title || 'Untitled'} (${new Date(it.created_at).toLocaleDateString()})`,
            )
            .join('\n') || 'No recent items.';
      } else if (id === 'pinned') {
        content = 'Pinned items will show here. (Coming soon)';
      } else if (id === 'favorites') {
        content = 'Favorites will show here. (Coming soon)';
      } else if (id === 'trash') {
        content = 'Recently removed items will show here. (Coming soon)';
      }
      setTabs((prev) => [...prev, { id: tabId, itemId: '', title, content }]);
      setActiveTabId(tabId);
    } else {
      setActiveTabId(existing.id);
    }
  };

  // --- Layout persistence (per project) ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(layoutKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.listWidth === 'number') setListWidth(parsed.listWidth);
      if (typeof parsed.rightPaneVisible === 'boolean') setRightPaneVisible(parsed.rightPaneVisible);
      if (typeof parsed.rightPaneWidth === 'number') setRightPaneWidth(parsed.rightPaneWidth);
      if (typeof parsed.mainSplit === 'boolean') setMainSplit(parsed.mainSplit);
      if (typeof parsed.mainSplitRatio === 'number') setMainSplitRatio(parsed.mainSplitRatio);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  useEffect(() => {
    const payload = {
      listWidth,
      rightPaneVisible,
      rightPaneWidth,
      mainSplit,
      mainSplitRatio,
    };
    try {
      localStorage.setItem(layoutKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [layoutKey, listWidth, rightPaneVisible, rightPaneWidth, mainSplit, mainSplitRatio]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (!isCmdK) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleNewItem = () => {
    const tabId = `new-${Date.now()}`;
    const title = 'New item (draft)';
    setTabs((prev) => [...prev, { id: tabId, itemId: '', title, content: 'Draft item (not saved yet).' }]);
    setActiveTabId(tabId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <ButtonGhost
          onClick={onBack}
          style={{ background: 'linear-gradient(135deg, var(--bg-glass), transparent)', color: 'var(--text-muted)' }}
          title="Back to projects"
        >
          ← Back
        </ButtonGhost>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)' }}>{project.name}</div>
      </div>

      {/* Top bar: Pills + Search */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <CollectionPills
          collections={projectCollections}
          selectedId={selectedCollectionId}
          onSelect={setSelectedCollectionId}
          totalItems={projectItems.length}
          getCountForCollection={(cid) => collectionItemCounts[cid] || 0}
        />

        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="⌘K to search..."
          inputRef={searchInputRef}
        />
      </div>

      <QuickActions onAction={handleQuickAction} />

      {/* Main area: list + content */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: rightPaneVisible
            ? `${listWidth}px 6px 1fr 6px ${rightPaneWidth}px`
            : `${listWidth}px 6px 1fr`,
          gap: '0.6rem',
          height: '100%',
          minHeight: 0,
        }}
      >
        <ItemsListPanel
          items={filteredItems}
          activeItemId={activeItem?.id || null}
          onItemClick={handleItemClick}
          onNew={handleNewItem}
        />

        <Resizer
          direction="vertical"
          onResize={(delta) => {
            setListWidth((w) => Math.min(Math.max(200, w + delta), 600));
          }}
        />

        <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.35rem 0.5rem',
              gap: '0.5rem',
            }}
          >
            <TabBar
              tabs={tabs as TabBarTab[]}
              activeTabId={activeTabId}
              onTabSelect={setActiveTabId}
              onTabClose={handleTabClose}
            />
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <ButtonGhost
                onClick={() => setMainSplit((v) => !v)}
                style={{
                  background: mainSplit ? 'rgba(99,102,241,0.18)' : 'var(--bg-glass)',
                }}
                title={mainSplit ? 'Unsplit pane' : 'Split pane horizontally'}
              >
                {mainSplit ? 'Unsplit' : 'Split'}
              </ButtonGhost>
              {activeTabId && (
                <ButtonGhost
                  onClick={() => handleMoveTabToRight(activeTabId)}
                  style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.08))',
                  }}
                  title="Open this tab in right pane"
                >
                  ↗ Right
                </ButtonGhost>
              )}
              <ButtonGhost
                onClick={() => setRightPaneVisible((v) => !v)}
                style={{
                  background: rightPaneVisible
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.1))'
                    : 'var(--bg-glass)',
                  color: rightPaneVisible ? '#e0e7ff' : 'var(--text)',
                }}
                title={rightPaneVisible ? 'Hide right pane' : 'Add right pane'}
              >
                {rightPaneVisible ? '− Hide Right' : '+ Add Right'}
              </ButtonGhost>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {mainSplit ? (
              <>
                <div className="scrollbar" style={{ flex: `${mainSplitRatio} 1 0px`, minHeight: 0 }}>
                  <TabContent tab={activeTab || null} item={activeItem || null} />
                </div>
                <Resizer
                  direction="horizontal"
                  onResize={(delta) => {
                    setMainSplitRatio((r) => {
                      const deltaPercent = delta / 4; // simple heuristic
                      return Math.max(20, Math.min(80, r + deltaPercent));
                    });
                  }}
                />
                <div className="scrollbar" style={{ flex: `${100 - mainSplitRatio} 1 0px`, minHeight: 0 }}>
                  <TabContent tab={activeTab || null} item={activeItem || null} />
                </div>
              </>
            ) : (
              <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                <TabContent tab={activeTab || null} item={activeItem || null} />
              </div>
            )}
          </div>
        </Panel>

        {rightPaneVisible && (
          <>
            <Resizer
              direction="vertical"
              onResize={(delta) => {
                setRightPaneWidth((w) => Math.min(Math.max(260, w - delta), 700));
              }}
            />
            <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <TabBar
                tabs={rightTabs as TabBarTab[]}
                activeTabId={activeRightTabId}
                onTabSelect={setActiveRightTabId}
                onTabClose={handleRightTabClose}
              />
              <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                {(() => {
                  const rightTab = rightTabs.find((t) => t.id === activeRightTabId) || null;
                  const rightItem =
                    rightTab && rightTab.itemId ? projectItems.find((i) => i.id === rightTab.itemId) || null : null;
                  return <TabContent tab={rightTab} item={rightItem} />;
                })()}
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
};


