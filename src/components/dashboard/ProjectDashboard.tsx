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
import { Search, Sparkles, Plus } from 'lucide-react';

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
  const [primaryTabs, setPrimaryTabs] = useState<Tab[]>([]);
  const [secondaryTabs, setSecondaryTabs] = useState<Tab[]>([]);
  const [rightPrimaryTabs, setRightPrimaryTabs] = useState<Tab[]>([]);
  const [rightSecondaryTabs, setRightSecondaryTabs] = useState<Tab[]>([]);
  const [activePrimaryTabId, setActivePrimaryTabId] = useState<string | null>(null);
  const [activeSecondaryTabId, setActiveSecondaryTabId] = useState<string | null>(null);
  const [activeRightPrimaryTabId, setActiveRightPrimaryTabId] = useState<string | null>(null);
  const [activeRightSecondaryTabId, setActiveRightSecondaryTabId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(320);
  const [rightPaneVisible, setRightPaneVisible] = useState(false);
  const [rightPaneWidth, setRightPaneWidth] = useState(420);
  const [mainSplit, setMainSplit] = useState(false);
  const [mainSplitRatio, setMainSplitRatio] = useState(60); // percent for top
  const [rightSplit, setRightSplit] = useState(false);
  const [rightSplitRatio, setRightSplitRatio] = useState(60);
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
    return [...projectItems]
      .sort((a, b) => (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at))
      .slice(0, 10);
  }, [projectItems]);

  const ensureNotInOtherSpaces = (tabId: string, dest: 'primary' | 'secondary' | 'right' | 'rightSecondary') => {
    if (dest !== 'primary') {
      setPrimaryTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActivePrimaryTabId((prev) => (prev === tabId ? null : prev));
    }
    if (dest !== 'secondary') {
      setSecondaryTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActiveSecondaryTabId((prev) => (prev === tabId ? null : prev));
    }
    if (dest !== 'right') {
      setRightPrimaryTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActiveRightPrimaryTabId((prev) => (prev === tabId ? null : prev));
    }
    if (dest !== 'rightSecondary') {
      setRightSecondaryTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActiveRightSecondaryTabId((prev) => (prev === tabId ? null : prev));
    }
  };

  const closeTabInSpace = (
    tabId: string,
    tabsArr: Tab[],
    setTabsArr: React.Dispatch<React.SetStateAction<Tab[]>>,
    activeId: string | null,
    setActiveId: React.Dispatch<React.SetStateAction<string | null>>,
  ) => {
    setTabsArr((prev) => prev.filter((t) => t.id !== tabId));
    if (activeId === tabId) {
      const next = tabsArr.filter((t) => t.id !== tabId);
      setActiveId(next.length ? next[next.length - 1].id : null);
    }
  };

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

  const activePrimaryTab = useMemo(
    () => primaryTabs.find((t) => t.id === activePrimaryTabId) || null,
    [primaryTabs, activePrimaryTabId],
  );
  const activeSecondaryTab = useMemo(
    () => secondaryTabs.find((t) => t.id === activeSecondaryTabId) || null,
    [secondaryTabs, activeSecondaryTabId],
  );
  const activeRightPrimaryTab = useMemo(
    () => rightPrimaryTabs.find((t) => t.id === activeRightPrimaryTabId) || null,
    [rightPrimaryTabs, activeRightPrimaryTabId],
  );
  const activeRightSecondaryTab = useMemo(
    () => rightSecondaryTabs.find((t) => t.id === activeRightSecondaryTabId) || null,
    [rightSecondaryTabs, activeRightSecondaryTabId],
  );

  const activePrimaryItem = useMemo(
    () => (activePrimaryTab ? projectItems.find((i) => i.id === activePrimaryTab.itemId) || null : null),
    [activePrimaryTab, projectItems],
  );
  const activeSecondaryItem = useMemo(
    () => (activeSecondaryTab ? projectItems.find((i) => i.id === activeSecondaryTab.itemId) || null : null),
    [activeSecondaryTab, projectItems],
  );
  const activeRightPrimaryItem = useMemo(
    () =>
      activeRightPrimaryTab ? projectItems.find((i) => i.id === activeRightPrimaryTab.itemId) || null : null,
    [activeRightPrimaryTab, projectItems],
  );
  const activeRightSecondaryItem = useMemo(
    () =>
      activeRightSecondaryTab ? projectItems.find((i) => i.id === activeRightSecondaryTab.itemId) || null : null,
    [activeRightSecondaryTab, projectItems],
  );

  const handleItemClick = (item: Item) => {
    const existingPrimary = primaryTabs.find((t) => t.itemId === item.id);
    if (existingPrimary) {
      setActivePrimaryTabId(existingPrimary.id);
      return;
    }
    const existingSecondary = secondaryTabs.find((t) => t.itemId === item.id);
    if (existingSecondary) {
      setActiveSecondaryTabId(existingSecondary.id);
      return;
    }
    const existingRight = rightPrimaryTabs.find((t) => t.itemId === item.id);
    if (existingRight) {
      setActiveRightPrimaryTabId(existingRight.id);
      setRightPaneVisible(true);
      return;
    }
    const existingRightSecondary = rightSecondaryTabs.find((t) => t.itemId === item.id);
    if (existingRightSecondary) {
      setActiveRightSecondaryTabId(existingRightSecondary.id);
      setRightPaneVisible(true);
      setRightSplit(true);
      return;
    }
    const newTab: Tab = { id: item.id, itemId: item.id, title: item.title || 'Untitled' };
    ensureNotInOtherSpaces(newTab.id, 'primary');
    setPrimaryTabs((prev) => [...prev, newTab]);
    setActivePrimaryTabId(newTab.id);
  };

  const handleTabClose = (tabId: string) => {
    if (primaryTabs.find((t) => t.id === tabId)) {
      closeTabInSpace(tabId, primaryTabs, setPrimaryTabs, activePrimaryTabId, setActivePrimaryTabId);
      return;
    }
    if (secondaryTabs.find((t) => t.id === tabId)) {
      closeTabInSpace(tabId, secondaryTabs, setSecondaryTabs, activeSecondaryTabId, setActiveSecondaryTabId);
      return;
    }
    if (rightPrimaryTabs.find((t) => t.id === tabId)) {
      closeTabInSpace(tabId, rightPrimaryTabs, setRightPrimaryTabs, activeRightPrimaryTabId, setActiveRightPrimaryTabId);
      return;
    }
    if (rightSecondaryTabs.find((t) => t.id === tabId)) {
      closeTabInSpace(
        tabId,
        rightSecondaryTabs,
        setRightSecondaryTabs,
        activeRightSecondaryTabId,
        setActiveRightSecondaryTabId,
      );
      return;
    }
  };

  const handleMoveTabToRight = (tabId: string) => {
    const tab =
      primaryTabs.find((t) => t.id === tabId) ||
      secondaryTabs.find((t) => t.id === tabId) ||
      rightPrimaryTabs.find((t) => t.id === tabId) ||
      rightSecondaryTabs.find((t) => t.id === tabId);
    if (!tab) return;
    ensureNotInOtherSpaces(tab.id, 'right');
    setRightPrimaryTabs((prev) => (prev.find((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveRightPrimaryTabId(tab.id);
    setRightPaneVisible(true);
  };

  const handleRightTabClose = (tabId: string) => {
    if (rightPrimaryTabs.find((t) => t.id === tabId)) {
      closeTabInSpace(tabId, rightPrimaryTabs, setRightPrimaryTabs, activeRightPrimaryTabId, setActiveRightPrimaryTabId);
      return;
    }
    if (rightSecondaryTabs.find((t) => t.id === tabId)) {
      closeTabInSpace(
        tabId,
        rightSecondaryTabs,
        setRightSecondaryTabs,
        activeRightSecondaryTabId,
        setActiveRightSecondaryTabId,
      );
    }
  };

  const handleQuickAction = (id: string) => {
    const tabId = `qa-${id}`;
    const title = id.charAt(0).toUpperCase() + id.slice(1);
    const existing =
      primaryTabs.find((t) => t.id === tabId) ||
      secondaryTabs.find((t) => t.id === tabId) ||
      rightPrimaryTabs.find((t) => t.id === tabId) ||
      rightSecondaryTabs.find((t) => t.id === tabId);
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
      ensureNotInOtherSpaces(tabId, 'primary');
      setPrimaryTabs((prev) => [...prev, { id: tabId, itemId: '', title, content }]);
      setActivePrimaryTabId(tabId);
    } else {
      if (primaryTabs.find((t) => t.id === existing.id)) {
        setActivePrimaryTabId(existing.id);
      } else if (secondaryTabs.find((t) => t.id === existing.id)) {
        setActiveSecondaryTabId(existing.id);
      } else if (rightPrimaryTabs.find((t) => t.id === existing.id)) {
        setActiveRightPrimaryTabId(existing.id);
        setRightPaneVisible(true);
      } else if (rightSecondaryTabs.find((t) => t.id === existing.id)) {
        setActiveRightSecondaryTabId(existing.id);
        setRightPaneVisible(true);
        setRightSplit(true);
      }
    }
  };

  const openUtilityTab = (kind: 'search' | 'agent' | 'add') => {
    const tabId = `util-${kind}`;
    const title =
      kind === 'search' ? 'Search' : kind === 'agent' ? 'AI Agent' : 'New Item';
    const content =
      kind === 'search'
        ? 'Search panel (coming soon).'
        : kind === 'agent'
          ? 'AI Agent workspace (coming soon).'
          : 'Quick add form (coming soon).';
    const existing =
      primaryTabs.find((t) => t.id === tabId) ||
      secondaryTabs.find((t) => t.id === tabId) ||
      rightPrimaryTabs.find((t) => t.id === tabId) ||
      rightSecondaryTabs.find((t) => t.id === tabId);
    if (!existing) {
      ensureNotInOtherSpaces(tabId, 'primary');
      setPrimaryTabs((prev) => [...prev, { id: tabId, itemId: '', title, content }]);
      setActivePrimaryTabId(tabId);
      return;
    }
    if (primaryTabs.find((t) => t.id === existing.id)) {
      setActivePrimaryTabId(existing.id);
    } else if (secondaryTabs.find((t) => t.id === existing.id)) {
      setActiveSecondaryTabId(existing.id);
    } else if (rightPrimaryTabs.find((t) => t.id === existing.id)) {
      setActiveRightPrimaryTabId(existing.id);
      setRightPaneVisible(true);
    } else if (rightSecondaryTabs.find((t) => t.id === existing.id)) {
      setActiveRightSecondaryTabId(existing.id);
      setRightPaneVisible(true);
      setRightSplit(true);
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
      rightSplit,
      rightSplitRatio,
    };
    try {
      localStorage.setItem(layoutKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [layoutKey, listWidth, rightPaneVisible, rightPaneWidth, mainSplit, mainSplitRatio, rightSplit, rightSplitRatio]);

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
    ensureNotInOtherSpaces(tabId, 'primary');
    setPrimaryTabs((prev) => [...prev, { id: tabId, itemId: '', title, content: 'Draft item (not saved yet).' }]);
    setActivePrimaryTabId(tabId);
  };

  const mergeSecondaryBack = () => {
    setPrimaryTabs((prev) => {
      const ids = new Set(prev.map((t) => t.id));
      const merged = [...prev];
      secondaryTabs.forEach((t) => {
        if (!ids.has(t.id)) merged.push(t);
      });
      return merged;
    });
    setSecondaryTabs([]);
    setActiveSecondaryTabId(null);
  };

  const mergeRightSecondaryBack = () => {
    setRightPrimaryTabs((prev) => {
      const ids = new Set(prev.map((t) => t.id));
      const merged = [...prev];
      rightSecondaryTabs.forEach((t) => {
        if (!ids.has(t.id)) merged.push(t);
      });
      return merged;
    });
    setRightSecondaryTabs([]);
    setActiveRightSecondaryTabId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
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
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <ButtonGhost
            onClick={() => openUtilityTab('search')}
            style={{ padding: '0.25rem 0.4rem' }}
            title="Search"
          >
            <Search size={16} />
          </ButtonGhost>
          <ButtonGhost
            onClick={() => openUtilityTab('agent')}
            style={{ padding: '0.25rem 0.4rem' }}
            title="AI Agent"
          >
            <Sparkles size={16} />
          </ButtonGhost>
          <ButtonGhost
            onClick={() => openUtilityTab('add')}
            style={{ padding: '0.25rem 0.4rem' }}
            title="Add"
          >
            <Plus size={16} />
          </ButtonGhost>
        </div>
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

      {/* Controls for layout + utility actions */}
      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <ButtonGhost
            onClick={() => {
              setMainSplit((v) => {
                if (v) {
                  mergeSecondaryBack();
                  return false;
                }
                return true;
              });
            }}
            style={{
              background: mainSplit ? 'rgba(99,102,241,0.18)' : 'var(--bg-glass)',
              padding: '0.25rem 0.5rem',
            }}
            title={mainSplit ? 'Unsplit main' : 'Split main horizontally'}
          >
            {mainSplit ? 'Unsplit Main' : 'Split Main'}
          </ButtonGhost>
          {(activePrimaryTabId || activeSecondaryTabId) && (
            <ButtonGhost
              onClick={() => {
                const tabId = activePrimaryTabId || activeSecondaryTabId;
                if (tabId) handleMoveTabToRight(tabId);
              }}
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(99,102,241,0.08))',
                padding: '0.25rem 0.5rem',
              }}
              title="Move active tab to right pane"
            >
              ↗ To Right
            </ButtonGhost>
          )}
          <ButtonGhost
            onClick={() => setRightPaneVisible((v) => !v)}
            style={{
              background: rightPaneVisible
                ? 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.1))'
                : 'var(--bg-glass)',
              color: rightPaneVisible ? '#e0e7ff' : 'var(--text)',
              padding: '0.25rem 0.5rem',
            }}
            title={rightPaneVisible ? 'Hide right pane' : 'Add right pane'}
          >
            {rightPaneVisible ? 'Hide Right' : 'Show Right'}
          </ButtonGhost>
          {rightPaneVisible && (
            <ButtonGhost
              onClick={() => {
                setRightSplit((v) => {
                  if (v) {
                    mergeRightSecondaryBack();
                    return false;
                  }
                  return true;
                });
              }}
              style={{
                background: rightSplit ? 'rgba(99,102,241,0.18)' : 'var(--bg-glass)',
                padding: '0.25rem 0.5rem',
              }}
              title={rightSplit ? 'Unsplit right pane' : 'Split right pane horizontally'}
            >
              {rightSplit ? 'Unsplit Right' : 'Split Right'}
            </ButtonGhost>
          )}
        </div>
      </div>

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
          activeItemId={activePrimaryItem?.id || activeSecondaryItem?.id || null}
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
          {!mainSplit && (
            <div style={{ padding: '0.15rem 0.25rem' }}>
              <TabBar
                tabs={primaryTabs as TabBarTab[]}
                activeTabId={activePrimaryTabId}
                onTabSelect={setActivePrimaryTabId}
                onTabClose={handleTabClose}
              />
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {mainSplit ? (
              <>
                <div style={{ flex: `${mainSplitRatio} 1 0px`, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '0.15rem 0.25rem' }}>
                    <TabBar
                      tabs={primaryTabs as TabBarTab[]}
                      activeTabId={activePrimaryTabId}
                      onTabSelect={setActivePrimaryTabId}
                      onTabClose={handleTabClose}
                    />
                  </div>
                  <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                    <TabContent tab={activePrimaryTab || null} item={activePrimaryItem || null} />
                  </div>
                </div>
                <Resizer
                  direction="horizontal"
                  onResize={(delta) => {
                    setMainSplitRatio((r) => {
                      const deltaPercent = delta / 2.5; // smoother control
                      return Math.max(20, Math.min(80, r + deltaPercent));
                    });
                  }}
                />
                <div style={{ flex: `${100 - mainSplitRatio} 1 0px`, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '0.15rem 0.25rem' }}>
                    <TabBar
                      tabs={secondaryTabs as TabBarTab[]}
                      activeTabId={activeSecondaryTabId}
                      onTabSelect={setActiveSecondaryTabId}
                      onTabClose={handleTabClose}
                    />
                  </div>
                  <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                    <TabContent tab={activeSecondaryTab || null} item={activeSecondaryItem || null} />
                  </div>
                </div>
              </>
            ) : (
              <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                <TabContent tab={activePrimaryTab || null} item={activePrimaryItem || null} />
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
              {rightSplit ? (
                <>
                  <div style={{ flex: `${rightSplitRatio} 1 0px`, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '0.15rem 0.25rem' }}>
                      <TabBar
                        tabs={rightPrimaryTabs as TabBarTab[]}
                        activeTabId={activeRightPrimaryTabId}
                        onTabSelect={setActiveRightPrimaryTabId}
                        onTabClose={handleRightTabClose}
                      />
                    </div>
                    <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                      <TabContent tab={activeRightPrimaryTab || null} item={activeRightPrimaryItem || null} />
                    </div>
                  </div>
                  <Resizer
                    direction="horizontal"
                    onResize={(delta) => {
                      setRightSplitRatio((r) => {
                        const deltaPercent = delta / 2.5;
                        return Math.max(20, Math.min(80, r + deltaPercent));
                      });
                    }}
                  />
                  <div style={{ flex: `${100 - rightSplitRatio} 1 0px`, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '0.15rem 0.25rem' }}>
                      <TabBar
                        tabs={rightSecondaryTabs as TabBarTab[]}
                        activeTabId={activeRightSecondaryTabId}
                        onTabSelect={setActiveRightSecondaryTabId}
                        onTabClose={handleRightTabClose}
                      />
                    </div>
                    <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                      <TabContent tab={activeRightSecondaryTab || null} item={activeRightSecondaryItem || null} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ padding: '0.15rem 0.25rem' }}>
                    <TabBar
                      tabs={rightPrimaryTabs as TabBarTab[]}
                      activeTabId={activeRightPrimaryTabId}
                      onTabSelect={setActiveRightPrimaryTabId}
                      onTabClose={handleRightTabClose}
                    />
                  </div>
                  <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                    <TabContent tab={activeRightPrimaryTab || null} item={activeRightPrimaryItem || null} />
                  </div>
                </>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
};


