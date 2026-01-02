import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { Project, Collection, Item, Workspace } from '../../lib/db';
import { addCollection, deleteCollection, updateItem, updateCollection, addItem, getAllItems, deleteItem, getAllWorkspaces } from '../../lib/db';
import { CollectionPills } from './CollectionPills';
import { SearchBar } from './SearchBar';
import { QuickActions } from './QuickActions';
import { ItemsListPanel } from './ItemsListPanel';
import { TabBar, TabBarTab } from './TabBar';
import { TabContent } from './TabContent';
import { Resizer } from './Resizer';
import { WorkspaceSelector } from './WorkspaceSelector';
import { Panel, ButtonGhost, Input } from '../../styles/primitives';
import { Search, Sparkles, Plus, X } from 'lucide-react';

type Tab = {
  id: string;
  title: string;
  itemId: string;
  content?: string;
  collectionId?: string; // For collection tabs
  type?: 'item' | 'collection' | 'system';
};

interface ProjectDashboardProps {
  project: Project;
  collections: Collection[];
  items: Item[];
  onBack: () => void;
  onUpdateItem?: (id: string, updates: Partial<Omit<Item, 'id' | 'created_at'>>) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
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
  onUpdateItem: _onUpdateItem,
  onDeleteItem,
  onRefresh,
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
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  
  // Workspace state (placeholder for now - will be linked to project later)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [linkedWorkspaceIds, setLinkedWorkspaceIds] = useState<string[]>([]);

  // Load workspaces on mount
  useEffect(() => {
    getAllWorkspaces().then(setWorkspaces).catch(console.error);
  }, []);

  const projectCollections = useMemo(() => {
    const projectUnsortedId = `collection_${project.id}_unsorted`;
    return collections.filter(
      (c) => {
        // Must belong to this project
        const belongsToProject =
          c.primaryProjectId === project.id ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(project.id));
        if (!belongsToProject) return false;

        // Include the current project's unsorted collection
        if (c.id === projectUnsortedId) return true;

        // Exclude other unsorted/default collections
        if (c.isDefault && c.id !== projectUnsortedId) return false;
        if (c.name === 'Unsorted' && c.id !== projectUnsortedId) return false;

        // Include all other collections
        return true;
      },
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

  // Recent items are now handled in RecentTab component

  const ensureNotInOtherSpaces = (tabId: string, dest: 'primary' | 'secondary' | 'right' | 'rightSecondary') => {
    if (dest !== 'primary') {
      const wasActive = activePrimaryTabId === tabId;
      setPrimaryTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (wasActive && filtered.length > 0) {
          const movedIndex = prev.findIndex((t) => t.id === tabId);
          const nextIndex = movedIndex < filtered.length ? movedIndex : Math.max(0, movedIndex - 1);
          setTimeout(() => setActivePrimaryTabId(filtered[nextIndex]?.id || filtered[0]?.id || null), 0);
        } else if (wasActive) {
          setTimeout(() => setActivePrimaryTabId(null), 0);
        }
        return filtered;
      });
    }
    if (dest !== 'secondary') {
      const wasActive = activeSecondaryTabId === tabId;
      setSecondaryTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (wasActive && filtered.length > 0) {
          const movedIndex = prev.findIndex((t) => t.id === tabId);
          const nextIndex = movedIndex < filtered.length ? movedIndex : Math.max(0, movedIndex - 1);
          setTimeout(() => setActiveSecondaryTabId(filtered[nextIndex]?.id || filtered[0]?.id || null), 0);
        } else if (wasActive) {
          setTimeout(() => setActiveSecondaryTabId(null), 0);
        }
        return filtered;
      });
    }
    if (dest !== 'right') {
      const wasActive = activeRightPrimaryTabId === tabId;
      setRightPrimaryTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (wasActive && filtered.length > 0) {
          const movedIndex = prev.findIndex((t) => t.id === tabId);
          const nextIndex = movedIndex < filtered.length ? movedIndex : Math.max(0, movedIndex - 1);
          setTimeout(() => setActiveRightPrimaryTabId(filtered[nextIndex]?.id || filtered[0]?.id || null), 0);
        } else if (wasActive) {
          setTimeout(() => setActiveRightPrimaryTabId(null), 0);
        }
        return filtered;
      });
    }
    if (dest !== 'rightSecondary') {
      const wasActive = activeRightSecondaryTabId === tabId;
      setRightSecondaryTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (wasActive && filtered.length > 0) {
          const movedIndex = prev.findIndex((t) => t.id === tabId);
          const nextIndex = movedIndex < filtered.length ? movedIndex : Math.max(0, movedIndex - 1);
          setTimeout(() => setActiveRightSecondaryTabId(filtered[nextIndex]?.id || filtered[0]?.id || null), 0);
        } else if (wasActive) {
          setTimeout(() => setActiveRightSecondaryTabId(null), 0);
        }
        return filtered;
      });
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
    () => (activePrimaryTab ? items.find((i) => i.id === activePrimaryTab.itemId) || null : null),
    [activePrimaryTab, items],
  );
  const activeSecondaryItem = useMemo(
    () => (activeSecondaryTab ? items.find((i) => i.id === activeSecondaryTab.itemId) || null : null),
    [activeSecondaryTab, items],
  );
  const activeRightPrimaryItem = useMemo(
    () =>
      activeRightPrimaryTab ? items.find((i) => i.id === activeRightPrimaryTab.itemId) || null : null,
    [activeRightPrimaryTab, items],
  );
  const activeRightSecondaryItem = useMemo(
    () =>
      activeRightSecondaryTab ? items.find((i) => i.id === activeRightSecondaryTab.itemId) || null : null,
    [activeRightSecondaryTab, items],
  );

  // Get the currently active item from any space
  // Prioritize: primary > secondary > rightPrimary > rightSecondary
  const activeItem = useMemo(() => {
    // Try each space in priority order, using the active tab ID directly to find the item
    if (activePrimaryTabId) {
      const tab = primaryTabs.find((t) => t.id === activePrimaryTabId);
      if (tab && tab.itemId) {
        const item = items.find((i) => i.id === tab.itemId);
        if (item) return item;
      }
    }
    if (activeSecondaryTabId) {
      const tab = secondaryTabs.find((t) => t.id === activeSecondaryTabId);
      if (tab && tab.itemId) {
        const item = items.find((i) => i.id === tab.itemId);
        if (item) return item;
      }
    }
    if (activeRightPrimaryTabId) {
      const tab = rightPrimaryTabs.find((t) => t.id === activeRightPrimaryTabId);
      if (tab && tab.itemId) {
        const item = items.find((i) => i.id === tab.itemId);
        if (item) return item;
      }
    }
    if (activeRightSecondaryTabId) {
      const tab = rightSecondaryTabs.find((t) => t.id === activeRightSecondaryTabId);
      if (tab && tab.itemId) {
        const item = items.find((i) => i.id === tab.itemId);
        if (item) return item;
      }
    }
    return null;
  }, [
    activePrimaryTabId,
    activeSecondaryTabId,
    activeRightPrimaryTabId,
    activeRightSecondaryTabId,
    primaryTabs,
    secondaryTabs,
    rightPrimaryTabs,
    rightSecondaryTabs,
    items,
  ]);

  const handleItemClick = (item: Item, targetSpace?: 'primary' | 'secondary' | 'rightPrimary' | 'rightSecondary') => {
    // If item is already open, focus it (unless targetSpace is specified)
    if (!targetSpace) {
      const existingPrimary = primaryTabs.find((t) => t.itemId === item.id);
      if (existingPrimary) {
        // Just activate this tab, don't clear others (preserves collection tabs in other spaces)
        setActivePrimaryTabId(existingPrimary.id);
        return;
      }
      const existingSecondary = secondaryTabs.find((t) => t.itemId === item.id);
      if (existingSecondary) {
        // Just activate this tab, don't clear others (preserves collection tabs in other spaces)
        setActiveSecondaryTabId(existingSecondary.id);
        return;
      }
      const existingRight = rightPrimaryTabs.find((t) => t.itemId === item.id);
      if (existingRight) {
        // Just activate this tab, don't clear others (preserves collection tabs in other spaces)
        setActiveRightPrimaryTabId(existingRight.id);
        setRightPaneVisible(true);
        return;
      }
      const existingRightSecondary = rightSecondaryTabs.find((t) => t.itemId === item.id);
      if (existingRightSecondary) {
        // Just activate this tab, don't clear others (preserves collection tabs in other spaces)
        setActiveRightSecondaryTabId(existingRightSecondary.id);
        setRightPaneVisible(true);
        setRightSplit(true);
        return;
      }
    }

    // Create new tab in specified space (or primary by default)
    const newTab: Tab = { id: item.id, itemId: item.id, title: item.title || 'Untitled' };
    const space = targetSpace || 'primary';

    if (space === 'primary') {
      ensureNotInOtherSpaces(newTab.id, 'primary');
      setPrimaryTabs((prev) => [...prev, newTab]);
      setActivePrimaryTabId(newTab.id);
    } else if (space === 'secondary') {
      ensureNotInOtherSpaces(newTab.id, 'secondary');
      setSecondaryTabs((prev) => [...prev, newTab]);
      setActiveSecondaryTabId(newTab.id);
      if (!mainSplit) setMainSplit(true);
    } else if (space === 'rightPrimary') {
      ensureNotInOtherSpaces(newTab.id, 'right');
      setRightPrimaryTabs((prev) => [...prev, newTab]);
      setActiveRightPrimaryTabId(newTab.id);
      setRightPaneVisible(true);
    } else if (space === 'rightSecondary') {
      ensureNotInOtherSpaces(newTab.id, 'rightSecondary');
      setRightSecondaryTabs((prev) => [...prev, newTab]);
      setActiveRightSecondaryTabId(newTab.id);
      setRightPaneVisible(true);
      if (!rightSplit) setRightSplit(true);
    }
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

  const handleTabMove = (tabId: string, target: string) => {
    // Find the tab in any space
    const tab =
      primaryTabs.find((t) => t.id === tabId) ||
      secondaryTabs.find((t) => t.id === tabId) ||
      rightPrimaryTabs.find((t) => t.id === tabId) ||
      rightSecondaryTabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Handle reordering within same space (format: "spaceId:index")
    if (target.includes(':')) {
      const [spaceId, indexStr] = target.split(':');
      const targetIndex = parseInt(indexStr, 10);
      if (isNaN(targetIndex)) return;

      if (spaceId === 'primary') {
        const currentIndex = primaryTabs.findIndex((t) => t.id === tabId);
        if (currentIndex === -1 || currentIndex === targetIndex) return;
        setPrimaryTabs((prev) => {
          const newTabs = [...prev];
          newTabs.splice(currentIndex, 1);
          newTabs.splice(targetIndex, 0, tab);
          return newTabs;
        });
      } else if (spaceId === 'secondary') {
        const currentIndex = secondaryTabs.findIndex((t) => t.id === tabId);
        if (currentIndex === -1 || currentIndex === targetIndex) return;
        setSecondaryTabs((prev) => {
          const newTabs = [...prev];
          newTabs.splice(currentIndex, 1);
          newTabs.splice(targetIndex, 0, tab);
          return newTabs;
        });
      } else if (spaceId === 'rightPrimary') {
        const currentIndex = rightPrimaryTabs.findIndex((t) => t.id === tabId);
        if (currentIndex === -1 || currentIndex === targetIndex) return;
        setRightPrimaryTabs((prev) => {
          const newTabs = [...prev];
          newTabs.splice(currentIndex, 1);
          newTabs.splice(targetIndex, 0, tab);
          return newTabs;
        });
      } else if (spaceId === 'rightSecondary') {
        const currentIndex = rightSecondaryTabs.findIndex((t) => t.id === tabId);
        if (currentIndex === -1 || currentIndex === targetIndex) return;
        setRightSecondaryTabs((prev) => {
          const newTabs = [...prev];
          newTabs.splice(currentIndex, 1);
          newTabs.splice(targetIndex, 0, tab);
          return newTabs;
        });
      }
      return;
    }

    // Handle moving between spaces
    // Map target to ensureNotInOtherSpaces format
    const destMap: Record<string, 'primary' | 'secondary' | 'right' | 'rightSecondary'> = {
      primary: 'primary',
      secondary: 'secondary',
      rightPrimary: 'right',
      rightSecondary: 'rightSecondary',
    };
    const dest = destMap[target] || 'primary';
    ensureNotInOtherSpaces(tabId, dest);

    if (target === 'primary') {
      setPrimaryTabs((prev) => (prev.find((t) => t.id === tab.id) ? prev : [...prev, tab]));
      setActivePrimaryTabId(tab.id);
    } else if (target === 'secondary') {
      setSecondaryTabs((prev) => (prev.find((t) => t.id === tab.id) ? prev : [...prev, tab]));
      setActiveSecondaryTabId(tab.id);
      if (!mainSplit) setMainSplit(true);
    } else if (target === 'rightPrimary') {
      setRightPrimaryTabs((prev) => (prev.find((t) => t.id === tab.id) ? prev : [...prev, tab]));
      setActiveRightPrimaryTabId(tab.id);
      setRightPaneVisible(true);
    } else if (target === 'rightSecondary') {
      setRightSecondaryTabs((prev) => (prev.find((t) => t.id === tab.id) ? prev : [...prev, tab]));
      setActiveRightSecondaryTabId(tab.id);
      setRightPaneVisible(true);
      if (!rightSplit) setRightSplit(true);
    }
  };

  const handleQuickAction = (id: 'pinned' | 'recent' | 'favorites' | 'trash') => {
    const tabId = `util-${id}`;
    const title =
      id === 'pinned' ? 'Pinned' : id === 'recent' ? 'Recent' : id === 'favorites' ? 'Favorites' : 'Trash';
    const existing =
      primaryTabs.find((t) => t.id === tabId) ||
      secondaryTabs.find((t) => t.id === tabId) ||
      rightPrimaryTabs.find((t) => t.id === tabId) ||
      rightSecondaryTabs.find((t) => t.id === tabId);
    if (!existing) {
      // Set type to 'system' for all quick action tabs
      ensureNotInOtherSpaces(tabId, 'primary');
      setPrimaryTabs((prev) => [...prev, { id: tabId, itemId: '', title, type: 'system' }]);
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
      setPrimaryTabs((prev) => [...prev, { id: tabId, itemId: '', title, content, type: 'system' }]);
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

  const handleCreateItem = async (data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => {
    try {
      // Get the project's unsorted collection if no collections selected
      const projectUnsortedId = `collection_${project.id}_unsorted`;
      const finalCollectionIds = data.collectionIds.length > 0 ? data.collectionIds : [projectUnsortedId];

      const itemId = await addItem({
        title: data.title,
        url: data.url || '',
        notes: data.notes,
        collectionIds: finalCollectionIds,
        tags: [],
        source: data.url ? 'bookmark' : 'manual',
      });

      // Refresh data first to get the new item
      if (onRefresh) await onRefresh();

      // Fetch the newly created item
      const allItems = await getAllItems();
      const newItem = allItems.find((i) => i.id === itemId);
      if (newItem) {
        // Open the created item in a tab
        handleItemClick(newItem);
      }

      return itemId;
    } catch (error) {
      console.error('Failed to create item:', error);
      throw error;
    }
  };

  const handleNewItem = () => {
    openUtilityTab('add');
  };

  const handleEditItem = (item: Item) => {
    const tabId = `edit-${item.id}`;
    const title = `Edit: ${item.title}`;
    
    // Check if edit tab already exists in any space
    const existing =
      primaryTabs.find((t) => t.id === tabId) ||
      secondaryTabs.find((t) => t.id === tabId) ||
      rightPrimaryTabs.find((t) => t.id === tabId) ||
      rightSecondaryTabs.find((t) => t.id === tabId);
    
    if (existing) {
      // Focus existing edit tab
      if (primaryTabs.find((t) => t.id === tabId)) {
        setActivePrimaryTabId(tabId);
      } else if (secondaryTabs.find((t) => t.id === tabId)) {
        setActiveSecondaryTabId(tabId);
      } else if (rightPrimaryTabs.find((t) => t.id === tabId)) {
        setActiveRightPrimaryTabId(tabId);
        setRightPaneVisible(true);
      } else if (rightSecondaryTabs.find((t) => t.id === tabId)) {
        setActiveRightSecondaryTabId(tabId);
        setRightPaneVisible(true);
      }
      return;
    }
    
    // Create new edit tab in primary space
    ensureNotInOtherSpaces(tabId, 'primary');
    setPrimaryTabs((prev) => [...prev, { id: tabId, itemId: item.id, title, type: 'system' }]);
    setActivePrimaryTabId(tabId);
  };

  const handleUpdateItem = async (id: string, data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => {
    try {
      // Get the project's unsorted collection if no collections selected
      const projectUnsortedId = `collection_${project.id}_unsorted`;
      const finalCollectionIds = data.collectionIds.length > 0 ? data.collectionIds : [projectUnsortedId];

      await updateItem(id, {
        title: data.title,
        url: data.url || '',
        notes: data.notes,
        collectionIds: finalCollectionIds,
      });

      // Refresh data
      if (onRefresh) await onRefresh();
      
      // The edit happens in-place, so no need to close/edit tabs
    } catch (error) {
      console.error('Failed to update item:', error);
      throw error;
    }
  };

  const handleDeleteItem = async (item: Item) => {
    if (!window.confirm(`Delete "${item.title || 'Untitled'}"? This action cannot be undone.`)) return;
    try {
      if (onDeleteItem) {
        await onDeleteItem(item.id);
      } else {
        // Fallback: use deleteItem directly if handler not provided
        await deleteItem(item.id);
      }
      // Close tab if open (both item tab and edit tab)
      handleTabClose(item.id);
      handleTabClose(`edit-${item.id}`);
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const handleOpenInNewTab = (item: Item) => {
    if (item.url) {
      chrome.tabs.create({ url: item.url });
    }
  };

  const handleDuplicateItem = async (item: Item) => {
    // This would require onAddBookmark or similar - for now just open in new tab
    handleOpenInNewTab(item);
  };

  const handleCreateCollection = () => {
    setShowCreateCollectionModal(true);
    setNewCollectionName('');
    setNewCollectionDescription('');
  };

  const handleCreateCollectionSubmit = async () => {
    if (!newCollectionName.trim()) return;
    try {
      await addCollection(newCollectionName.trim(), undefined, project.id);
      setShowCreateCollectionModal(false);
      setNewCollectionName('');
      setNewCollectionDescription('');
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to create collection:', error);
      alert('Failed to create collection. Please try again.');
    }
  };

  const handleDeleteCollection = async (collection: Collection) => {
    if (!window.confirm(`Delete "${collection.name}"? Items in this collection will be moved to Unsorted.`)) return;
    try {
      await deleteCollection(collection.id);
      // If we deleted the currently selected collection, switch to 'all'
      if (selectedCollectionId === collection.id) {
        setSelectedCollectionId('all');
      }
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to delete collection:', error);
      alert('Failed to delete collection. Please try again.');
    }
  };

  const handleOpenAllCollections = () => {
    const tabId = 'collections-all';
    const existing =
      primaryTabs.find((t) => t.id === tabId) ||
      secondaryTabs.find((t) => t.id === tabId) ||
      rightPrimaryTabs.find((t) => t.id === tabId) ||
      rightSecondaryTabs.find((t) => t.id === tabId);
    
    if (!existing) {
      ensureNotInOtherSpaces(tabId, 'primary');
      setPrimaryTabs((prev) => [
        ...prev,
        { id: tabId, itemId: '', title: 'Collections', type: 'system' },
      ]);
      setActivePrimaryTabId(tabId);
    } else {
      // Focus existing tab
      if (primaryTabs.find((t) => t.id === tabId)) {
        setActivePrimaryTabId(tabId);
      } else if (secondaryTabs.find((t) => t.id === tabId)) {
        setActiveSecondaryTabId(tabId);
      } else if (rightPrimaryTabs.find((t) => t.id === tabId)) {
        setActiveRightPrimaryTabId(tabId);
        setRightPaneVisible(true);
      } else if (rightSecondaryTabs.find((t) => t.id === tabId)) {
        setActiveRightSecondaryTabId(tabId);
        setRightPaneVisible(true);
        setRightSplit(true);
      }
    }
  };

  const handleOpenCollectionInTab = (collection: Collection) => {
    const tabId = `collection-${collection.id}`;
    const existing =
      primaryTabs.find((t) => t.id === tabId) ||
      secondaryTabs.find((t) => t.id === tabId) ||
      rightPrimaryTabs.find((t) => t.id === tabId) ||
      rightSecondaryTabs.find((t) => t.id === tabId);
    
    if (!existing) {
      ensureNotInOtherSpaces(tabId, 'primary');
      setPrimaryTabs((prev) => [
        ...prev,
        { id: tabId, itemId: '', title: collection.name, collectionId: collection.id, type: 'collection' },
      ]);
      setActivePrimaryTabId(tabId);
    } else {
      // Focus existing tab
      if (primaryTabs.find((t) => t.id === tabId)) {
        setActivePrimaryTabId(tabId);
      } else if (secondaryTabs.find((t) => t.id === tabId)) {
        setActiveSecondaryTabId(tabId);
      } else if (rightPrimaryTabs.find((t) => t.id === tabId)) {
        setActiveRightPrimaryTabId(tabId);
        setRightPaneVisible(true);
      } else if (rightSecondaryTabs.find((t) => t.id === tabId)) {
        setActiveRightSecondaryTabId(tabId);
        setRightPaneVisible(true);
        setRightSplit(true);
      }
    }
  };

  const handleMoveItemToCollection = async (itemId: string, targetCollectionId: string, sourceCollectionId?: string) => {
    try {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      
      const currentCollectionIds = item.collectionIds || [];
      let newCollectionIds: string[];
      
      if (sourceCollectionId) {
        // MOVE: Remove from source, add to target
        newCollectionIds = currentCollectionIds.filter((cid) => cid !== sourceCollectionId);
        if (!newCollectionIds.includes(targetCollectionId)) {
          newCollectionIds.push(targetCollectionId);
        }
      } else {
        // If no source specified, just add to target (don't remove from others)
        if (!currentCollectionIds.includes(targetCollectionId)) {
          newCollectionIds = [...currentCollectionIds, targetCollectionId];
        } else {
          return; // Already in target
        }
      }
      
      // Ensure at least one collection
      if (newCollectionIds.length === 0) {
        const projectUnsortedId = `collection_${project.id}_unsorted`;
        newCollectionIds = [projectUnsortedId];
      }
      
      await updateItem(itemId, {
        collectionIds: newCollectionIds,
      });
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to move item to collection:', error);
      alert('Failed to move item. Please try again.');
    }
  };

  const handleRenameCollection = async (collection: Collection, newName: string) => {
    try {
      await updateCollection(collection.id, { name: newName });
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to rename collection:', error);
      alert('Failed to rename collection. Please try again.');
    }
  };

  const handleOpenCollection = (collection: Collection) => {
    // Switch to this collection in the filter
    setSelectedCollectionId(collection.id);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }}>
      {/* Header - compact */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', height: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              height: 22,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Back to projects"
          >
            ← Back
          </button>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)' }}>{project.name}</div>
        </div>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          <button
            onClick={() => openUtilityTab('search')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '4px',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Search"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Search size={14} />
          </button>
          <button
            onClick={() => openUtilityTab('agent')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '4px',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="AI Agent"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Sparkles size={14} />
          </button>
          <button
            onClick={() => openUtilityTab('add')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '4px',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Add Item"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Top bar: Pills + Search + Quick actions */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        <CollectionPills
          collections={projectCollections}
          selectedId={selectedCollectionId}
          onSelect={setSelectedCollectionId}
          totalItems={projectItems.length}
          getCountForCollection={(cid) => collectionItemCounts[cid] || 0}
          onCreateCollection={handleCreateCollection}
          onDeleteCollection={handleDeleteCollection}
          onOpenCollectionInTab={handleOpenCollectionInTab}
          onOpenAllCollections={handleOpenAllCollections}
        />
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="⌘K Search..."
          inputRef={searchInputRef}
        />
        <QuickActions onAction={handleQuickAction} />
      </div>

      {/* Second row: Workspace selector + Layout controls */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {/* Workspace selector (placeholder functionality) */}
        <WorkspaceSelector
          workspaces={workspaces}
          linkedWorkspaceIds={linkedWorkspaceIds}
          onLinkWorkspace={(id) => setLinkedWorkspaceIds(prev => [...prev, id])}
          onUnlinkWorkspace={(id) => setLinkedWorkspaceIds(prev => prev.filter(wid => wid !== id))}
          onOpenWorkspace={(ws) => {
            // TODO: Open workspace in Tab Commander or dedicated view
            console.log('Open workspace:', ws.name);
          }}
        />

        {/* Layout controls - compact */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
        <button
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
            background: mainSplit ? 'var(--accent-weak)' : 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            padding: '3px 8px',
            height: 22,
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 'var(--text-xs)',
          }}
          title={mainSplit ? 'Unsplit main' : 'Split main horizontally'}
        >
          {mainSplit ? '⊟ Unsplit' : '⊞ Split'}
        </button>
        {(activePrimaryTabId || activeSecondaryTabId) && (
          <button
            onClick={() => {
              const tabId = activePrimaryTabId || activeSecondaryTabId;
              if (tabId) handleMoveTabToRight(tabId);
            }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '3px 8px',
              height: 22,
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
            }}
            title="Move active tab to right pane"
          >
            → Right
          </button>
        )}
        <button
          onClick={() => setRightPaneVisible((v) => !v)}
          style={{
            background: rightPaneVisible ? 'var(--accent-weak)' : 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            padding: '3px 8px',
            height: 22,
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 'var(--text-xs)',
          }}
          title={rightPaneVisible ? 'Hide right pane' : 'Show right pane'}
        >
          {rightPaneVisible ? '◧ Hide' : '◨ Right'}
        </button>
        {rightPaneVisible && (
          <button
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
              background: rightSplit ? 'var(--accent-weak)' : 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '3px 8px',
              height: 22,
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
            }}
            title={rightSplit ? 'Unsplit right pane' : 'Split right pane'}
          >
            {rightSplit ? '⊟ Unsplit R' : '⊞ Split R'}
          </button>
        )}
        </div>
      </div>

      {/* Main area: list + content */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: rightPaneVisible
            ? `${listWidth}px 4px 1fr 4px ${rightPaneWidth}px`
            : `${listWidth}px 4px 1fr`,
          gap: '4px',
          flex: 1,
          minHeight: 0,
        }}
      >
        <ItemsListPanel
          items={filteredItems}
          activeItemId={activeItem?.id || null}
          onItemClick={handleItemClick}
          onNew={handleNewItem}
          onEdit={handleEditItem}
          onDelete={handleDeleteItem}
          onOpenInNewTab={handleOpenInNewTab}
          onDuplicate={handleDuplicateItem}
          currentCollectionId={selectedCollectionId}
          onOpenCollectionInTab={(collectionId) => {
            if (collectionId === 'all') return; // Can't open "all" as a collection tab
            const collection = collections.find((c) => c.id === collectionId);
            if (collection) handleOpenCollectionInTab(collection);
          }}
          availableSpaces={{
            primary: true,
            secondary: mainSplit,
            rightPrimary: rightPaneVisible,
            rightSecondary: rightPaneVisible && rightSplit,
          }}
        />

        <Resizer
          direction="vertical"
          onResize={(delta) => {
            setListWidth((w) => Math.min(Math.max(200, w + delta), 600));
          }}
        />

        <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
          {!mainSplit && (
            <TabBar
              tabs={primaryTabs as TabBarTab[]}
              activeTabId={activePrimaryTabId}
              onTabSelect={setActivePrimaryTabId}
              onTabClose={handleTabClose}
              onTabMove={handleTabMove}
              spaceId="primary"
            />
          )}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {mainSplit ? (
              <>
                <div style={{ flex: `${mainSplitRatio} 1 0px`, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <TabBar
                    tabs={primaryTabs as TabBarTab[]}
                    activeTabId={activePrimaryTabId}
                    onTabSelect={setActivePrimaryTabId}
                    onTabClose={handleTabClose}
                    onTabMove={handleTabMove}
                    spaceId="primary"
                  />
                  <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                    <TabContent 
                      tab={activePrimaryTab || null} 
                      item={activePrimaryItem || null}
                      items={items}
                      collections={collections}
                      onMoveItemToCollection={handleMoveItemToCollection}
                      onDeleteCollection={handleDeleteCollection}
                      onRenameCollection={handleRenameCollection}
                      onOpenCollection={handleOpenCollection}
                      onOpenCollectionInTab={handleOpenCollectionInTab}
                      onCreateItem={handleCreateItem}
                      onUpdateItem={handleUpdateItem}
                      onDeleteItem={handleDeleteItem}
                      onItemClick={handleItemClick}
                      defaultCollectionId={selectedCollectionId}
                      projectId={project.id}
                    />
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
                      onTabMove={handleTabMove}
                      spaceId="secondary"
                    />
                  </div>
                  <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                    <TabContent 
                      tab={activeSecondaryTab || null} 
                      item={activeSecondaryItem || null}
                      items={items}
                      collections={collections}
                      onMoveItemToCollection={handleMoveItemToCollection}
                      onDeleteCollection={handleDeleteCollection}
                      onRenameCollection={handleRenameCollection}
                      onOpenCollection={handleOpenCollection}
                      onOpenCollectionInTab={handleOpenCollectionInTab}
                      onCreateItem={handleCreateItem}
                      onUpdateItem={handleUpdateItem}
                      onDeleteItem={handleDeleteItem}
                      onItemClick={handleItemClick}
                      defaultCollectionId={selectedCollectionId}
                      projectId={project.id}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                <TabContent 
                  tab={activePrimaryTab || null} 
                  item={activePrimaryItem || null}
                  items={items}
                  collections={collections}
                  onMoveItemToCollection={handleMoveItemToCollection}
                  onDeleteCollection={handleDeleteCollection}
                  onRenameCollection={handleRenameCollection}
                  onOpenCollection={handleOpenCollection}
                  onOpenCollectionInTab={handleOpenCollectionInTab}
                  projectId={project.id}
                />
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
                        onTabMove={handleTabMove}
                        spaceId="rightPrimary"
                      />
                    </div>
                    <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                      <TabContent 
                        tab={activeRightPrimaryTab || null} 
                        item={activeRightPrimaryItem || null}
                        items={items}
                        collections={collections}
                        onMoveItemToCollection={handleMoveItemToCollection}
                        onDeleteCollection={handleDeleteCollection}
                        onRenameCollection={handleRenameCollection}
                        onOpenCollection={handleOpenCollection}
                        onOpenCollectionInTab={handleOpenCollectionInTab}
                        onCreateItem={handleCreateItem}
                        defaultCollectionId={selectedCollectionId}
                        projectId={project.id}
                      />
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
                        onTabMove={handleTabMove}
                        spaceId="rightSecondary"
                      />
                    </div>
                    <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                      <TabContent 
                        tab={activeRightSecondaryTab || null} 
                        item={activeRightSecondaryItem || null}
                        items={items}
                        collections={collections}
                        onMoveItemToCollection={handleMoveItemToCollection}
                        onDeleteCollection={handleDeleteCollection}
                        onRenameCollection={handleRenameCollection}
                        onOpenCollection={handleOpenCollection}
                        onOpenCollectionInTab={handleOpenCollectionInTab}
                        onCreateItem={handleCreateItem}
                        defaultCollectionId={selectedCollectionId}
                        projectId={project.id}
                      />
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
                      onTabMove={handleTabMove}
                      spaceId="rightPrimary"
                    />
                  </div>
                  <div className="scrollbar" style={{ flex: 1, minHeight: 0 }}>
                    <TabContent 
                      tab={activeRightPrimaryTab || null} 
                      item={activeRightPrimaryItem || null}
                      items={items}
                      collections={collections}
                      onMoveItemToCollection={handleMoveItemToCollection}
                      onDeleteCollection={handleDeleteCollection}
                      onRenameCollection={handleRenameCollection}
                      onOpenCollection={handleOpenCollection}
                      onOpenCollectionInTab={handleOpenCollectionInTab}
                      onCreateItem={handleCreateItem}
                      onUpdateItem={handleUpdateItem}
                      onDeleteItem={handleDeleteItem}
                      onItemClick={handleItemClick}
                      defaultCollectionId={selectedCollectionId}
                      projectId={project.id}
                    />
                  </div>
                </>
              )}
            </Panel>
          </>
        )}
      </div>

      {/* Create Collection Modal */}
      {showCreateCollectionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateCollectionModal(false);
            }
          }}
        >
          <Panel
            style={{
              width: '100%',
              maxWidth: 440,
              padding: '1.5rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
                Create Collection
              </h2>
              <button
                onClick={() => setShowCreateCollectionModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  Name <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <Input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection name"
                  style={{ width: '100%' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCollectionName.trim()) {
                      handleCreateCollectionSubmit();
                    }
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  Description (optional)
                </label>
                <textarea
                  value={newCollectionDescription}
                  onChange={(e) => setNewCollectionDescription(e.target.value)}
                  placeholder="Brief description..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: '0.9rem',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <ButtonGhost
                  onClick={() => setShowCreateCollectionModal(false)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </ButtonGhost>
                <ButtonGhost
                  onClick={handleCreateCollectionSubmit}
                  disabled={!newCollectionName.trim()}
                  style={{
                    padding: '0.5rem 0.9rem',
                    fontWeight: 600,
                    background: newCollectionName.trim() ? 'var(--accent)' : 'var(--bg-glass)',
                    color: newCollectionName.trim() ? '#fff' : 'var(--text-muted)',
                    cursor: newCollectionName.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Create
                </ButtonGhost>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};


