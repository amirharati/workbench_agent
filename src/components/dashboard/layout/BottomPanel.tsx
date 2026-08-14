import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uiPatterns } from '../../../styles/uiPatterns';
import { ChevronDown, ChevronUp, Copy, ExternalLink, Globe, GripHorizontal, LayoutGrid, List, RefreshCw, Search, Trash2, X } from 'lucide-react';
import type { WindowGroup } from '../../../App';
import { addWorkspace, normalizeBookmarkUrl, updateWorkspace } from '../../../lib/db';
import type { Project, Workspace, WorkspaceWindow } from '../../../lib/db';
import type { GlobalTabState } from '../GlobalTabSystem';
import {
  addBrowserSnapshotToProjectWorkspace,
  createProjectWorkspaceFromBrowserSnapshot,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionWorkspaceKey,
} from '../workspaceSession';

interface BottomPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  displayMode?: 'panel' | 'page';
  windows: WindowGroup[];
  workspaces: Workspace[];
  /** Used when creating a workspace from Tab Commander (project vs detached) */
  projects?: Project[];
  items?: import('../../../lib/db').Item[];
  homeState?: GlobalTabState;
  onHomeStateChange?: (next: GlobalTabState) => void;
  onWorkspacesChanged?: () => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

type TabLite = chrome.tabs.Tab;

function getDomain(url?: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function tabMatchesQuery(tab: TabLite, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    (tab.title || '').toLowerCase().includes(needle) ||
    (tab.url || '').toLowerCase().includes(needle) ||
    getDomain(tab.url).toLowerCase().includes(needle)
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clampToViewportLeft(left: number, width: number, padding = 8): number {
  return clamp(left, padding, window.innerWidth - width - padding);
}

function clampToViewportTop(top: number, height: number, padding = 8): number {
  return clamp(top, padding, window.innerHeight - height - padding);
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  isCollapsed,
  onToggle,
  displayMode = 'panel',
  windows,
  workspaces,
  projects = [],
  items = [],
  homeState,
  onHomeStateChange,
  onWorkspacesChanged,
  onCloseTab,
  onCloseWindow,
  onRefresh,
}) => {
  const isPage = displayMode === 'page';
  const allTabs = useMemo(() => windows.flatMap((w) => w.tabs), [windows]);
  const [query, setQuery] = useState('');
  const [selectedWindowIds, setSelectedWindowIds] = useState<number[]>(() => {
    const activeWindow = windows.find((browserWindow) => browserWindow.tabs.some((tab) => tab.active));
    return activeWindow ? [activeWindow.windowId] : windows[0] ? [windows[0].windowId] : [];
  });
  const [lastClickedWindowId, setLastClickedWindowId] = useState<number | null>(null);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState<string | null>(null);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceProjectId, setNewWorkspaceProjectId] = useState('');
  const [newWorkspaceTargetKey, setNewWorkspaceTargetKey] = useState('');
  const [captureMode, setCaptureMode] = useState<'browser' | 'project-create' | 'project-add'>('browser');
  const [windowCollapsed, setWindowCollapsed] = useState<Record<number, boolean>>({});
  const [tabLimit, setTabLimit] = useState<number>(120);
  const TAB_PAGE_SIZE = 120;
  const [tabsView, setTabsView] = useState<'list' | 'gallery'>(() => {
    if (typeof window === 'undefined') return 'list';
    return window.localStorage.getItem('workbench:tab-commander-tabs-view') === 'gallery' ? 'gallery' : 'list';
  });
  const [hoveredTabKey, setHoveredTabKey] = useState<string | null>(null);
  const [previewTabIds, setPreviewTabIds] = useState<number[]>([]);
  const previewTabIdSet = useMemo(() => new Set(previewTabIds), [previewTabIds]);
  const PREVIEW_TAB_IDS_STORAGE_KEY = 'workbench_preview_tab_ids';
  const [dragOverWindowId, setDragOverWindowId] = useState<number | null>(null);

  const DRAG_MIME = 'application/x-workbench-tab';
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const selectedTabIdSet = useMemo(() => new Set(selectedTabIds), [selectedTabIds]);

  const windowOrderRef = useRef(new Map<number, number>());
  const nextWindowOrderRef = useRef(0);
  const sortedWindows = useMemo(() => {
    for (const browserWindow of windows) {
      if (!windowOrderRef.current.has(browserWindow.windowId)) {
        windowOrderRef.current.set(browserWindow.windowId, nextWindowOrderRef.current++);
      }
    }
    return [...windows].sort(
      (left, right) =>
        (windowOrderRef.current.get(left.windowId) ?? 0) - (windowOrderRef.current.get(right.windowId) ?? 0)
    );
  }, [windows]);

  // Stable labeling for the current UI list: W1, W2, W3...
  const windowLabelById = useMemo(() => {
    const m = new Map<number, string>();
    sortedWindows.forEach((w, idx) => m.set(w.windowId, `W${idx + 1}`));
    return m;
  }, [sortedWindows]);

  // Pick a sensible default selection: active window, else first window.
  // Also, keep selection valid if windows list changes (e.g., close window).
  useEffect(() => {
    const availableIds = new Set(windows.map((w) => w.windowId));
    setSelectedWindowIds((prev) => prev.filter((id) => availableIds.has(id)));
  }, [windows]);

  useEffect(() => {
    if (selectedWindowIds.length > 0) return;
    const activeWindow = windows.find((w) => w.tabs.some((t) => t.active));
    if (activeWindow) setSelectedWindowIds([activeWindow.windowId]);
    else if (windows[0]) setSelectedWindowIds([windows[0].windowId]);
  }, [windows, selectedWindowIds.length]);

  // Load persisted preview tabs once.
  useEffect(() => {
    try {
      chrome.storage?.local?.get?.([PREVIEW_TAB_IDS_STORAGE_KEY], (res) => {
        const raw = res?.[PREVIEW_TAB_IDS_STORAGE_KEY];
        if (Array.isArray(raw)) {
          const ids = raw.filter((v) => typeof v === 'number');
          setPreviewTabIds(ids);
        }
      });
    } catch (e) {
      // no-op
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistPreviewTabIds = (ids: number[]) => {
    setPreviewTabIds(ids);
    try {
      chrome.storage?.local?.set?.({ [PREVIEW_TAB_IDS_STORAGE_KEY]: ids });
    } catch (e) {
      // no-op
    }
  };

  const addPreviewTabId = (id: number) => {
    setPreviewTabIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev];
      try {
        chrome.storage?.local?.set?.({ [PREVIEW_TAB_IDS_STORAGE_KEY]: next });
      } catch (e) {
        // no-op
      }
      return next;
    });
  };

  const removePreviewTabId = (id: number) => {
    setPreviewTabIds((prev) => {
      const next = prev.filter((x) => x !== id);
      try {
        chrome.storage?.local?.set?.({ [PREVIEW_TAB_IDS_STORAGE_KEY]: next });
      } catch (e) {
        // no-op
      }
      return next;
    });
  };

  // Keep preview list clean if user closes preview tabs manually.
  useEffect(() => {
    const onRemoved = (tabId: number) => {
      if (previewTabIdSet.has(tabId)) removePreviewTabId(tabId);
    };
    try {
      chrome.tabs?.onRemoved?.addListener?.(onRemoved);
      return () => chrome.tabs?.onRemoved?.removeListener?.(onRemoved);
    } catch {
      return;
    }
  }, [previewTabIdSet]);

  const selectedWindows = useMemo(() => {
    const set = new Set(selectedWindowIds);
    return sortedWindows.filter((w) => set.has(w.windowId));
  }, [sortedWindows, selectedWindowIds]);

  const isMultiWindow = selectedWindowIds.length > 1;

  const filteredTabsForSelection = useMemo(() => {
    const byWindow: { windowId: number; tab: TabLite }[] = [];
    for (const w of selectedWindows) {
      for (const t of w.tabs) {
        if (tabMatchesQuery(t, query)) byWindow.push({ windowId: w.windowId, tab: t });
      }
    }

    // Sorting: active tabs first, then by window order, then by title.
    const windowOrder = new Map<number, number>();
    sortedWindows.forEach((w, idx) => windowOrder.set(w.windowId, idx));

    return byWindow.sort((a, b) => {
      const aActive = a.tab.active ? 1 : 0;
      const bActive = b.tab.active ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const ao = windowOrder.get(a.windowId) ?? 0;
      const bo = windowOrder.get(b.windowId) ?? 0;
      if (ao !== bo) return ao - bo;
      return (a.tab.title || '').localeCompare(b.tab.title || '');
    });
  }, [selectedWindows, query, sortedWindows]);

  // Keep tab selection valid as the open tabs change.
  useEffect(() => {
    const openTabIds = new Set(allTabs.map((t) => t.id).filter((id): id is number => typeof id === 'number'));
    setSelectedTabIds((prev) => prev.filter((id) => openTabIds.has(id)));
  }, [allTabs]);

  useEffect(() => {
    // Reset pagination when selection or query changes
    setTabLimit(TAB_PAGE_SIZE);
  }, [selectedWindowIds.join(','), query]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('workbench:tab-commander-tabs-view', tabsView);
  }, [tabsView]);

  const visibleTabs = filteredTabsForSelection.slice(0, tabLimit);
  const hiddenCount = Math.max(0, filteredTabsForSelection.length - visibleTabs.length);

  const closeDropdowns = () => setSaveDropdownOpen(null);

  const handleWindowClick = (windowId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const idsInOrder = sortedWindows.map((w) => w.windowId);
    const isToggle = e.metaKey || e.ctrlKey;
    const isRange = e.shiftKey;

    setLastClickedWindowId(windowId);

    setSelectedWindowIds((prev) => {
      const prevSet = new Set(prev);

      if (isRange && lastClickedWindowId !== null) {
        const a = idsInOrder.indexOf(lastClickedWindowId);
        const b = idsInOrder.indexOf(windowId);
        if (a !== -1 && b !== -1) {
          const [start, end] = a < b ? [a, b] : [b, a];
          const range = idsInOrder.slice(start, end + 1);
          const base = isToggle ? new Set(prevSet) : new Set<number>();
          range.forEach((id) => base.add(id));
          return Array.from(base);
        }
      }

      if (isToggle) {
        if (prevSet.has(windowId)) prevSet.delete(windowId);
        else prevSet.add(windowId);
        return Array.from(prevSet);
      }

      return [windowId];
    });
  };

  const toggleWindowSelection = (windowId: number) => {
    setSelectedWindowIds((prev) => {
      const set = new Set(prev);
      if (set.has(windowId)) set.delete(windowId);
      else set.add(windowId);
      return Array.from(set);
    });
    setLastClickedWindowId(windowId);
  };

  const handleSelectAllToggle = () => {
    if (selectedWindowIds.length === windows.length) setSelectedWindowIds([]);
    else setSelectedWindowIds(windows.map((w) => w.windowId));
  };

  const handleTabClick = async (tabId: number | undefined, windowId?: number) => {
    // IMPORTANT: chrome.tabs.update(tabId?) treats tabId as optional.
    // If we pass undefined, Chrome updates the currently selected tab -> feels like "always the same tab".
    if (typeof tabId !== 'number') return;
    try {
      await chrome.tabs.update(tabId, { active: true });
      if (typeof windowId === 'number') {
        await chrome.windows.update(windowId, { focused: true });
      } else {
        const tab = await chrome.tabs.get(tabId);
        if (typeof tab.windowId === 'number') await chrome.windows.update(tab.windowId, { focused: true });
      }
    } catch (e) {
      console.error('Failed to switch to tab:', e);
    }
  };

  const handleFindWindow = async (e: React.MouseEvent, windowId: number) => {
    e.stopPropagation();
    try {
      // "Find" behavior: aggressively focus window for a few seconds to help user locate it/desktop
      for (let i = 0; i < 6; i++) {
        await chrome.windows.update(windowId, { focused: true }).catch(() => {});
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      console.error('Failed to find window:', err);
    }
  };

  const handleCloseTab = async (e: React.MouseEvent, tabId: number) => {
    e.stopPropagation();
    if (onCloseTab) await onCloseTab(tabId);
    else await chrome.tabs.remove(tabId);
    if (onRefresh) await onRefresh();
  };

  const handleCloseWindow = async (e: React.MouseEvent, windowId: number) => {
    e.stopPropagation();
    if (onCloseWindow) await onCloseWindow(windowId);
    else await chrome.windows.remove(windowId);
    if (onRefresh) await onRefresh();
  };

  const handleTabDragStart = (e: React.DragEvent, tabId: number | undefined, fromWindowId: number) => {
    if (typeof tabId !== 'number') return;
    try {
      const tabIds = selectedTabIdSet.has(tabId) ? selectedTabIds : [tabId];
      const payload = JSON.stringify({ tabIds, fromWindowId });
      e.dataTransfer.setData(DRAG_MIME, payload);
      // Some browsers/tools only accept text/plain
      e.dataTransfer.setData('text/plain', payload);
      e.dataTransfer.effectAllowed = 'move';

      // Better UX for multi-select: show a drag preview with multiple items/count.
      // Note: drag images must be DOM elements; we create a temporary offscreen node.
      const count = tabIds.length;
      const labelTitles: string[] = [];
      for (const id of tabIds.slice(0, 3)) {
        const t = allTabs.find((x) => x.id === id);
        if (t?.title) labelTitles.push(t.title);
      }

      const dragEl = document.createElement('div');
      dragEl.style.position = 'fixed';
      dragEl.style.left = '-10000px';
      dragEl.style.top = '-10000px';
      dragEl.style.width = '280px';
      dragEl.style.padding = '10px';
      dragEl.style.borderRadius = '12px';
      dragEl.style.background = 'var(--bg-panel)';
      dragEl.style.border = '1px solid var(--border)';
      dragEl.style.boxShadow = 'var(--shadow-panel)';
      dragEl.style.fontFamily = 'system-ui, sans-serif';

      const title = document.createElement('div');
      title.style.display = 'flex';
      title.style.alignItems = 'center';
      title.style.justifyContent = 'space-between';
      title.style.gap = '8px';

      const left = document.createElement('div');
      left.textContent = count === 1 ? 'Moving tab' : `Moving ${count} tabs`;
      left.style.fontSize = '12px';
      left.style.fontWeight = '800';
      left.style.color = 'var(--text)';

      const pill = document.createElement('div');
      pill.textContent = count.toString();
      pill.style.fontSize = '12px';
      pill.style.fontWeight = '900';
      pill.style.color = 'var(--accent-hover)';
      pill.style.background = 'var(--accent-weak)';
      pill.style.border = '1px solid var(--accent)';
      pill.style.padding = '2px 8px';
      pill.style.borderRadius = '9999px';

      title.appendChild(left);
      if (count > 1) title.appendChild(pill);
      dragEl.appendChild(title);

      if (labelTitles.length > 0) {
        const list = document.createElement('div');
        list.style.marginTop = '8px';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '4px';
        for (const t of labelTitles) {
          const row = document.createElement('div');
          row.textContent = t;
          row.style.fontSize = '12px';
          row.style.fontWeight = '700';
          row.style.color = 'var(--text)';
          row.style.whiteSpace = 'nowrap';
          row.style.overflow = 'hidden';
          row.style.textOverflow = 'ellipsis';
          list.appendChild(row);
        }
        if (count > labelTitles.length) {
          const more = document.createElement('div');
          more.textContent = `+${count - labelTitles.length} more`;
          more.style.fontSize = '12px';
          more.style.fontWeight = '800';
          more.style.color = 'var(--text-muted)';
          list.appendChild(more);
        }
        dragEl.appendChild(list);
      }

      document.body.appendChild(dragEl);
      // setDragImage uses x/y offsets relative to the element
      e.dataTransfer.setDragImage(dragEl, 20, 20);
      // Remove next tick (must exist at time of setDragImage)
      setTimeout(() => {
        try {
          dragEl.remove();
        } catch {
          // ignore
        }
      }, 0);
    } catch {
      // ignore
    }
  };

  const getDraggedTabIds = (e: React.DragEvent): number[] => {
    const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.tabIds)) {
        return parsed.tabIds.filter((v: any) => typeof v === 'number');
      }
    } catch {
      // ignore
    }
    return [];
  };

  const handleWindowDragOver = (e: React.DragEvent, windowId: number) => {
    // Required to allow dropping.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverWindowId(windowId);
  };

  const handleWindowDrop = async (e: React.DragEvent, windowId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const tabIds = getDraggedTabIds(e);
    setDragOverWindowId(null);
    if (tabIds.length === 0) return;
    try {
      // Move to the end of the target window.
      await chrome.tabs.move(tabIds, { windowId, index: -1 });
      // Clear selection after a successful move
      setSelectedTabIds([]);
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error('Failed to move tab:', err);
    }
  };

  const toggleTabSelection = (tabId: number) => {
    setSelectedTabIds((prev) => {
      const s = new Set(prev);
      if (s.has(tabId)) s.delete(tabId);
      else s.add(tabId);
      return Array.from(s);
    });
  };

  const handleOpenHere = async (e: React.MouseEvent, url: string | undefined) => {
    e.stopPropagation();
    if (!url || (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url))) return;
    try {
      // Open in the same window as the dashboard, so we don't jump to another OS desktop/Space.
      const currentWindow = await chrome.windows.getCurrent();
      const created = await chrome.tabs.create({
        windowId: currentWindow.id,
        url,
        active: true,
      });
      if (typeof created?.id === 'number') addPreviewTabId(created.id);
    } catch (err) {
      console.error('Failed to open tab in current window:', err);
    }
  };

  const handleClosePreviews = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewTabIds.length === 0) return;
    const ids = [...previewTabIds];
    try {
      await chrome.tabs.remove(ids);
    } catch (err) {
      // If some ids are already gone, best-effort cleanup
      try {
        for (const id of ids) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await chrome.tabs.remove(id);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    } finally {
      persistPreviewTabIds([]);
      if (onRefresh) await onRefresh();
    }
  };

  const buildWorkspaceWindowsFromSelection = (): WorkspaceWindow[] => {
    // Priority: selected tabs > selected windows > all windows
    if (selectedTabIds.length > 0) {
      const tabs = selectedTabIds
        .map((id) => allTabs.find((t) => t.id === id))
        .filter((t): t is chrome.tabs.Tab =>
          Boolean(
            t &&
              t.url &&
              (/^https?:\/\//i.test(t.url) || /^file:\/\//i.test(t.url))
          )
        )
        .map((t) => ({ url: t.url!, title: t.title || undefined, favIconUrl: t.favIconUrl || undefined }));
      return [{ id: crypto.randomUUID(), name: 'Selected tabs', tabs }];
    }

    const windowGroups = selectedWindowIds.length > 0 ? selectedWindows : windows;
    return windowGroups.map((w) => ({
      id: crypto.randomUUID(),
      name: windowLabelById.get(w.windowId) || `Window ${w.windowId}`,
      tabs: w.tabs
        .filter(
          (t) =>
            t.url && (/^https?:\/\//i.test(t.url) || /^file:\/\//i.test(t.url))
        )
        .map((t) => ({ url: t.url!, title: t.title || undefined, favIconUrl: t.favIconUrl || undefined })),
    }));
  };

  const openNewWorkspaceModal = (mode: 'browser' | 'project-create' | 'project-add' = 'browser') => {
    const windowsToSave = buildWorkspaceWindowsFromSelection();
    const suggested =
      selectedTabIds.length > 0
        ? `Tabs (${windowsToSave[0]?.tabs.length || 0})`
        : selectedWindowIds.length > 0
          ? `Workspace (${selectedWindowIds.length} windows)`
          : `Workspace (${windowsToSave.length} windows)`;
    setCaptureMode(mode);
    setNewWorkspaceName(suggested);
    const initialProjectId = mode === 'browser' ? '' : projects[0]?.id ?? '';
    setNewWorkspaceProjectId(initialProjectId);
    setNewWorkspaceTargetKey(initialProjectId ? getProjectSessionWorkspaceKey(initialProjectId) : '');
    setNewWorkspaceOpen(true);
  };

  const closeNewWorkspaceModal = () => {
    setNewWorkspaceOpen(false);
  };

  const submitNewWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (captureMode !== 'project-add' && !name) return;
    const windowsToSave = buildWorkspaceWindowsFromSelection();
    const projectId = newWorkspaceProjectId.trim() || undefined;
    const capturedWorkspace: Workspace = {
      id: `capture-${crypto.randomUUID()}`,
      name: name || 'Captured tabs',
      projectId,
      created_at: Date.now(),
      updated_at: Date.now(),
      windows: windowsToSave,
    };
    if (captureMode === 'browser') {
      await addWorkspace(name, windowsToSave, projectId);
    } else if (captureMode === 'project-create') {
      if (!projectId || !homeState || !onHomeStateChange) return;
      onHomeStateChange(createProjectWorkspaceFromBrowserSnapshot({
        state: homeState,
        workspace: capturedWorkspace,
        items,
        projectId,
        name,
      }));
    } else {
      if (!projectId || !newWorkspaceTargetKey || !homeState || !onHomeStateChange) return;
      onHomeStateChange(addBrowserSnapshotToProjectWorkspace({
        state: homeState,
        workspace: capturedWorkspace,
        items,
        projectId,
        targetWorkspaceKey: newWorkspaceTargetKey,
      }));
    }
    closeNewWorkspaceModal();
    if (onWorkspacesChanged) await onWorkspacesChanged();
  };

  const projectWorkspaceTargets = newWorkspaceProjectId
    ? [
        { key: getProjectSessionWorkspaceKey(newWorkspaceProjectId), label: 'General' },
        ...(homeState?.savedWorkspaceSessions ?? [])
          .filter((session) => session.projectId === newWorkspaceProjectId)
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .map((session) => ({ key: getHomebaseWorkspaceSessionKey(session.id), label: session.name })),
      ]
    : [];

  useEffect(() => {
    if (captureMode !== 'project-add') return;
    if (projectWorkspaceTargets.some((target) => target.key === newWorkspaceTargetKey)) return;
    setNewWorkspaceTargetKey(projectWorkspaceTargets[0]?.key ?? '');
  }, [captureMode, newWorkspaceTargetKey, projectWorkspaceTargets]);

  useEffect(() => {
    if (!newWorkspaceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNewWorkspaceOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newWorkspaceOpen]);

  const updateExistingWorkspace = async (workspaceId: string) => {
    const windowsToSave = buildWorkspaceWindowsFromSelection();
    const existingWorkspace = workspaces.find((ws) => ws.id === workspaceId);
    if (!existingWorkspace) return;

    const existingWindows = existingWorkspace.windows || [];
    const existingUrlSet = new Set<string>();
    for (const win of existingWindows) {
      for (const tab of win.tabs) {
        if (!tab.url) continue;
        existingUrlSet.add(normalizeBookmarkUrl(tab.url));
      }
    }

    // Append only links that are not already in the workspace.
    const tabsToAppend: WorkspaceWindow['tabs'] = [];
    for (const win of windowsToSave) {
      for (const tab of win.tabs) {
        if (!tab.url) continue;
        const normalized = normalizeBookmarkUrl(tab.url);
        if (existingUrlSet.has(normalized)) continue;
        existingUrlSet.add(normalized);
        tabsToAppend.push(tab);
      }
    }

    if (tabsToAppend.length === 0) {
      if (onWorkspacesChanged) await onWorkspacesChanged();
      return;
    }

    const mergedWindows =
      existingWindows.length > 0
        ? existingWindows.map((win, idx) =>
            idx === 0 ? { ...win, tabs: [...win.tabs, ...tabsToAppend] } : win
          )
        : [{ id: crypto.randomUUID(), name: 'Window 1', tabs: tabsToAppend }];

    await updateWorkspace(workspaceId, { windows: mergedWindows });
    if (onWorkspacesChanged) await onWorkspacesChanged();
  };

  const TogglePillButton = ({
    active,
    label,
    icon,
    onClick,
  }: {
    active: boolean;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 9999,
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'var(--accent-weak)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text)',
        cursor: 'pointer',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const WorkspaceSaveMenu = ({
    buttonId,
    title,
    align = 'right',
    primary = false,
    label = 'Capture',
  }: {
    buttonId: string;
    title: string;
    align?: 'left' | 'right';
    primary?: boolean;
    label?: string;
  }) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const MENU_WIDTH = 260;
    const MENU_MAX_HEIGHT = 320;
    const MENU_PADDING = 8;
    const isOpen = saveDropdownOpen === buttonId;
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
      if (!isOpen) {
        setMenuPos(null);
        return;
      }
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const leftBase = align === 'left' ? rect.left : rect.right - MENU_WIDTH;
      const left = clampToViewportLeft(leftBase, MENU_WIDTH, MENU_PADDING);
      const top = clamp(rect.top - MENU_PADDING, MENU_PADDING, window.innerHeight - MENU_PADDING);
      setMenuPos({ top, left });
    }, [isOpen, align]);

    useLayoutEffect(() => {
      if (!isOpen) return;
      const btn = buttonRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      const rect = btn.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceAbove >= menuHeight + MENU_PADDING || spaceAbove > spaceBelow;
      const rawTop = openUp ? rect.top - menuHeight - MENU_PADDING : rect.bottom + MENU_PADDING;
      const top = clampToViewportTop(rawTop, menuHeight, MENU_PADDING);
      const leftBase = align === 'left' ? rect.left : rect.right - MENU_WIDTH;
      const left = clampToViewportLeft(leftBase, MENU_WIDTH, MENU_PADDING);
      setMenuPos({ top, left });
    }, [isOpen, align, workspaces.length]);

    const renderMenu = () => {
      if (!menuPos) return null;
      return createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: `${MENU_WIDTH}px`,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
            zIndex: 'var(--layer-browser-overlay)',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
              fontWeight: 600,
              color: 'var(--text)',
              fontSize: 'var(--text-sm)',
            }}
          >
            Capture tabs
          </div>

          <div
            onClick={() => {
              closeDropdowns();
              openNewWorkspaceModal('browser');
            }}
            style={{
              padding: '10px 12px',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              borderBottom: '1px solid var(--border)',
              color: 'var(--accent)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title="Preserve the selected browser tabs and window grouping"
          >
            Save browser snapshot…
          </div>

          <div
            onClick={() => {
              if (projects.length === 0 || !homeState) return;
              closeDropdowns();
              openNewWorkspaceModal('project-create');
            }}
            style={{ padding: '10px 12px', cursor: projects.length > 0 && homeState ? 'pointer' : 'not-allowed', fontSize: 'var(--text-sm)', fontWeight: 500, borderBottom: '1px solid var(--border)', color: projects.length > 0 && homeState ? 'var(--text)' : 'var(--text-faint)', opacity: projects.length > 0 && homeState ? 1 : 0.55 }}
            title="Convert selected tabs into a new Homebase project workspace"
          >
            Create project workspace…
          </div>

          <div
            onClick={() => {
              if (projects.length === 0 || !homeState) return;
              closeDropdowns();
              openNewWorkspaceModal('project-add');
            }}
            style={{ padding: '10px 12px', cursor: projects.length > 0 && homeState ? 'pointer' : 'not-allowed', fontSize: 'var(--text-sm)', fontWeight: 500, borderBottom: '1px solid var(--border)', color: projects.length > 0 && homeState ? 'var(--text)' : 'var(--text-faint)', opacity: projects.length > 0 && homeState ? 1 : 0.55 }}
            title="Add selected tabs to an existing Homebase project workspace"
          >
            Add to project workspace…
          </div>

          <div style={{ padding: '7px 12px 5px', color: 'var(--text-faint)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Update browser snapshot</div>

          <div className="scrollbar" style={{ maxHeight: `${MENU_MAX_HEIGHT}px`, overflowY: 'auto' }}>
            {workspaces.length === 0 && (
              <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                No workspaces yet.
              </div>
            )}
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={async () => {
                  closeDropdowns();
                  await updateExistingWorkspace(ws.id);
                }}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  color: 'var(--text)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                title="Append unique links to this workspace"
              >
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ws.name}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-muted)', flexShrink: 0 }}>
                  Append
                </span>
              </div>
            ))}
          </div>
        </div>,
        document.body
      );
    };

    return (
      <>
        <button
          ref={buttonRef}
          onClick={(e) => {
            e.stopPropagation();
            setSaveDropdownOpen(saveDropdownOpen === buttonId ? null : buttonId);
          }}
          title={title}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            minHeight: 31,
            borderRadius: 'var(--radius-sm)',
            border: primary ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: primary ? 'var(--accent)' : 'transparent',
            cursor: 'pointer',
            color: primary ? '#fff' : 'var(--text)',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </button>
        {isOpen ? renderMenu() : null}
      </>
    );
  };

  const newWorkspaceModal =
    newWorkspaceOpen &&
    createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 'var(--layer-browser-overlay)',
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeNewWorkspaceModal();
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            background: 'var(--bg-panel)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
              fontWeight: 600,
              fontSize: 'var(--text-base)',
              color: 'var(--text)',
            }}
          >
            {captureMode === 'browser' ? 'Save browser snapshot' : captureMode === 'project-create' ? 'Create project workspace' : 'Add to project workspace'}
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
              {captureMode === 'browser'
                ? 'Preserves the selected browser tabs and window grouping for later restoration.'
                : captureMode === 'project-create'
                  ? 'Converts matching URLs to Library items and keeps unmatched URLs as temporary workspace entries.'
                  : 'Adds the selected tabs to the chosen Homebase workspace without changing the live browser windows.'}
            </div>
            {captureMode !== 'project-add' && <div>
              <label
                style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}
                htmlFor="workbench-new-ws-name"
              >
                Name
              </label>
              <input
                id="workbench-new-ws-name"
                autoFocus
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newWorkspaceName.trim()) void submitNewWorkspace();
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text)',
                  background: 'var(--bg-input)',
                }}
              />
            </div>}
            <div>
              <label
                style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}
                htmlFor="workbench-new-ws-project"
              >
                {captureMode === 'browser' ? 'Project (optional)' : 'Project'}
              </label>
              <select
                id="workbench-new-ws-project"
                value={newWorkspaceProjectId}
                onChange={(e) => {
                  const projectId = e.target.value;
                  setNewWorkspaceProjectId(projectId);
                  setNewWorkspaceTargetKey(projectId ? getProjectSessionWorkspaceKey(projectId) : '');
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text)',
                  background: 'var(--bg-input)',
                }}
              >
                <option value="">{captureMode === 'browser' ? 'Unassigned (no project)' : 'Choose project…'}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {captureMode === 'project-add' && (
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }} htmlFor="workbench-target-project-workspace">Project workspace</label>
                <select id="workbench-target-project-workspace" value={newWorkspaceTargetKey} onChange={(e) => setNewWorkspaceTargetKey(e.target.value)} disabled={!newWorkspaceProjectId} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 'var(--text-sm)', color: 'var(--text)', background: 'var(--bg-input)' }}>
                  {projectWorkspaceTargets.map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={closeNewWorkspaceModal}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={captureMode === 'project-add' ? !newWorkspaceTargetKey : !newWorkspaceName.trim() || (captureMode === 'project-create' && !newWorkspaceProjectId)}
                onClick={() => void submitNewWorkspace()}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: (captureMode === 'project-add' ? newWorkspaceTargetKey : newWorkspaceName.trim() && (captureMode !== 'project-create' || newWorkspaceProjectId)) ? 'var(--accent)' : 'var(--border)',
                  color: (captureMode === 'project-add' ? newWorkspaceTargetKey : newWorkspaceName.trim() && (captureMode !== 'project-create' || newWorkspaceProjectId)) ? 'white' : 'var(--text-faint)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  cursor: (captureMode === 'project-add' ? newWorkspaceTargetKey : newWorkspaceName.trim() && (captureMode !== 'project-create' || newWorkspaceProjectId)) ? 'pointer' : 'not-allowed',
                }}
              >
                {captureMode === 'browser' ? 'Save snapshot' : captureMode === 'project-create' ? 'Create workspace' : 'Add tabs'}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        gap: isPage ? 12 : 0,
        minHeight: 0,
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-sans)',
      }}
      onClick={() => closeDropdowns()}
    >
      {/* Header */}
      {isPage ? (
        <>
          <header className="ui-page-header" data-tab-commander-header style={uiPatterns.pageHeader}>
            <div>
              <h1 style={uiPatterns.pageTitle}>Tab Commander</h1>
              <p style={uiPatterns.pageDescription}>Manage {windows.length} live browser window{windows.length !== 1 ? 's' : ''} and {allTabs.length} open tab{allTabs.length !== 1 ? 's' : ''}, then capture the work you want to keep.</p>
            </div>
            <div className="ui-action-row" style={uiPatterns.actionRow}>
              {onRefresh && <button type="button" onClick={() => void onRefresh()} style={pageSecondaryButtonStyle}><RefreshCw size={12} /> Refresh</button>}
              <div onClick={(event) => event.stopPropagation()}><WorkspaceSaveMenu buttonId="workspace-save-page" title="Capture selected tabs or windows" align="right" primary label={selectedTabIds.length > 0 ? `Capture ${selectedTabIds.length} tab${selectedTabIds.length !== 1 ? 's' : ''}` : selectedWindowIds.length > 0 ? `Capture ${selectedWindowIds.length} window${selectedWindowIds.length !== 1 ? 's' : ''}` : 'Capture browser'} /></div>
            </div>
          </header>
          <div className="ui-toolbar" data-tab-commander-toolbar style={{ ...uiPatterns.toolbar, minHeight: 42, gap: 10 }}>
            <label style={{ ...uiPatterns.searchField, width: 'min(620px, 100%)', height: 36 }} onClick={(event) => event.stopPropagation()}>
              <Search size={14} style={{ color: 'var(--text-faint)' }} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter selected windows by tab title, domain, or URL…" aria-label="Filter live browser tabs" style={{ minWidth: 0, flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sm)' }} />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear tab filter" title="Clear filter" style={pageIconButtonStyle}><X size={12} /></button>}
            </label>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{selectedTabIds.length > 0 ? `${selectedTabIds.length} individual tab${selectedTabIds.length !== 1 ? 's' : ''} override the window selection for capture.` : selectedWindowIds.length > 0 ? 'Search and capture apply to the selected windows.' : 'Select a window to browse its tabs; capture currently includes every open window.'}</span>
          </div>
        </>
      ) : (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-panel)',
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
          cursor: isCollapsed ? 'pointer' : 'default',
          userSelect: 'none',
          flexShrink: 0,
          gap: '0.5rem',
        }}
        onClick={isCollapsed ? onToggle : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <GripHorizontal size={16} style={{ color: 'var(--text-faint)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
            Tab Commander
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {windows.length} windows · {allTabs.length} tabs
          </span>
          {!isCollapsed && selectedWindowIds.length > 0 && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text)',
                background: 'var(--accent-weak)',
                border: '1px solid var(--accent)',
                borderRadius: '9999px',
                padding: '2px 8px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
              title="Selected windows"
            >
              {selectedWindowIds.length} selected
            </span>
          )}
        </div>

        {!isCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, justifyContent: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 10px',
                width: 'min(680px, 100%)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Search size={14} style={{ color: 'var(--text-faint)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tabs (title / domain / url)…"
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: 'var(--text-sm)',
                  width: '100%',
                  background: 'transparent',
                  color: 'var(--text)',
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '2px',
                    color: 'var(--text-faint)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {!isCollapsed && (
            <div onClick={(e) => e.stopPropagation()}>
              <WorkspaceSaveMenu buttonId="workspace-save" title="Capture selected tabs or windows" align="right" />
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: 6,
            }}
            title={isCollapsed ? 'Expand' : 'Collapse'}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      )}

      {/* Content */}
      {!isCollapsed && (
        <div
          data-tab-commander-canvas={isPage || undefined}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: isPage ? 'minmax(250px, 330px) minmax(0, 1fr)' : '240px 1fr',
            gap: isPage ? 12 : 0,
            background: 'var(--bg)',
            border: 'none',
          }}
        >
          {/* Windows column */}
          <div
            style={{
              border: isPage ? '1px solid var(--border)' : 'none',
              borderRight: '1px solid var(--border)',
              borderRadius: isPage ? 'var(--radius-lg)' : 0,
              overflowY: 'auto',
              padding: isPage ? 0 : 8,
              background: 'var(--bg-panel)',
              boxShadow: isPage ? 'var(--shadow-sm)' : 'none',
            }}
            className="scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ minHeight: isPage ? 46 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPage ? '7px 10px' : '4px 4px 8px', borderBottom: isPage ? '1px solid var(--border)' : 'none', position: isPage ? 'sticky' : undefined, top: isPage ? 0 : undefined, zIndex: isPage ? 1 : undefined, background: 'var(--bg-panel)' }}>
              <div><div style={{ fontSize: isPage ? 'var(--text-sm)' : 'var(--text-xs)', fontWeight: 650, color: 'var(--text)', textTransform: isPage ? 'none' : 'uppercase' }}>Live windows</div>{isPage && <div style={{ marginTop: 2, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{windows.length} open · {selectedWindowIds.length} selected</div>}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectAllToggle();
                }}
                style={{
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                }}
                title="Select all / clear"
              >
                {selectedWindowIds.length === windows.length && windows.length > 0 ? 'Clear' : 'All'}
              </button>
            </div>

            {sortedWindows.map((w) => {
              const isSelected = selectedWindowIds.includes(w.windowId);
              const isCollapsedWindow = windowCollapsed[w.windowId] ?? false;
              const matchCount = w.tabs.filter((t) => tabMatchesQuery(t, query)).length;
              const label = windowLabelById.get(w.windowId) || `W?`;

              if (isPage) {
                return (
                  <div
                    key={w.windowId}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${label}, ${w.tabs.length} tabs`}
                    onClick={(event) => handleWindowClick(w.windowId, event)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                      event.preventDefault();
                      setSelectedWindowIds([w.windowId]);
                      setLastClickedWindowId(w.windowId);
                    }}
                    onDragOver={(event) => handleWindowDragOver(event, w.windowId)}
                    onDragEnter={(event) => handleWindowDragOver(event, w.windowId)}
                    onDragLeave={() => { if (dragOverWindowId === w.windowId) setDragOverWindowId(null); }}
                    onDrop={(event) => void handleWindowDrop(event, w.windowId)}
                    style={{ minHeight: 58, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px 7px 10px', borderBottom: '1px solid var(--border)', borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent', background: isSelected ? 'var(--accent-weak)' : 'transparent', outline: dragOverWindowId === w.windowId ? '2px solid var(--accent)' : 'none', outlineOffset: -2, cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={isSelected} onChange={() => toggleWindowSelection(w.windowId)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${label}`} style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ width: 31, height: 31, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: isSelected ? 'var(--bg-panel)' : 'var(--bg-hover)', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 750 }}>{label}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 650 }}>
                        {w.tabs.some((tab) => tab.active) ? 'Current window' : 'Browser window'}
                        {w.tabs.some((tab) => tab.active) && <span title="Active window" style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 999, background: 'var(--status-live)' }} />}
                      </span>
                      <span style={{ display: 'block', marginTop: 2, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{query ? `${matchCount} matching of ${w.tabs.length}` : `${w.tabs.length} tab${w.tabs.length !== 1 ? 's' : ''}`}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <button type="button" onClick={(event) => void handleFindWindow(event, w.windowId)} title={`Locate ${label}`} aria-label={`Locate ${label}`} style={pageIconButtonStyle}><Search size={12} /></button>
                      {onCloseWindow && <button type="button" onClick={(event) => void handleCloseWindow(event, w.windowId)} title={`Close ${label}`} aria-label={`Close ${label}`} style={{ ...pageIconButtonStyle, color: 'var(--text-faint)' }}><X size={13} /></button>}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={w.windowId}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${label}, ${w.tabs.length} tabs`}
                  style={{
                    border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--accent-weak)' : 'var(--bg-panel)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    marginBottom: 6,
                    cursor: 'pointer',
                    outline: dragOverWindowId === w.windowId ? '2px solid var(--accent)' : 'none',
                    outlineOffset: '1px',
                  }}
                  onClick={(e) => handleWindowClick(w.windowId, e)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    setSelectedWindowIds([w.windowId]);
                    setLastClickedWindowId(w.windowId);
                  }}
                  onDragOver={(e) => handleWindowDragOver(e, w.windowId)}
                  onDragEnter={(e) => handleWindowDragOver(e, w.windowId)}
                  onDragLeave={() => {
                    if (dragOverWindowId === w.windowId) setDragOverWindowId(null);
                  }}
                  onDrop={(e) => void handleWindowDrop(e, w.windowId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {/* Left: checkbox + label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleWindowSelection(w.windowId)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 14,
                          height: 14,
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        aria-label={`Select ${label}`}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {label}
                        </span>
                        {w.tabs.some((t) => t.active) && (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 9999,
                              background: 'var(--status-live)',
                              flexShrink: 0,
                            }}
                            title="Active window"
                          />
                        )}
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-muted)',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 9999,
                            padding: '1px 6px',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                          title={query ? `${matchCount} match` : `${w.tabs.length} tabs`}
                        >
                          {query ? matchCount : w.tabs.length}
                        </span>
                      </div>
                    </div>

                    {/* Right: row controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setWindowCollapsed((prev) => ({ ...prev, [w.windowId]: !isCollapsedWindow }));
                        }}
                        style={{
                          border: '1px solid transparent',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: 3,
                          color: 'var(--text-faint)',
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title={isCollapsedWindow ? 'Expand actions' : 'Collapse actions'}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-hover)';
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.color = 'var(--text)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-faint)';
                        }}
                      >
                        {isCollapsedWindow ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                    </div>
                  </div>

                  {!isCollapsedWindow && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={(e) => handleFindWindow(e, w.windowId)}
                          title="Locate window (flashes it)"
                          style={{
                            padding: '2px 6px',
                            background: 'var(--accent-weak)',
                            border: '1px solid var(--accent)',
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 'var(--text-xs)',
                            fontWeight: 500,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--accent)';
                            e.currentTarget.style.color = 'white';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--accent-weak)';
                            e.currentTarget.style.color = 'var(--accent)';
                          }}
                        >
                          <Search size={10} />
                          Find
                        </button>
                        {onCloseWindow && (
                          <button
                            onClick={(e) => handleCloseWindow(e, w.windowId)}
                            title="Close window"
                            style={{
                              padding: 4,
                              border: '1px solid transparent',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: 'var(--text-faint)',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: 4,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--error)';
                              e.currentTarget.style.background = 'var(--error-weak)';
                              e.currentTarget.style.borderColor = 'var(--error)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-faint)';
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.borderColor = 'transparent';
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWindowIds([w.windowId]);
                        }}
                        style={{
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: 'var(--text)',
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                        }}
                        title="Focus selection"
                      >
                        Focus
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {windows.length === 0 && (
              <div style={{ padding: 16, color: 'var(--text-faint)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
                No open windows found.
              </div>
            )}
          </div>

          {/* Tabs column */}
          <div style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: isPage ? '1px solid var(--border)' : 'none', borderRadius: isPage ? 'var(--radius-lg)' : 0, background: 'var(--bg-panel)', boxShadow: isPage ? 'var(--shadow-sm)' : 'none' }} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                minHeight: isPage ? 46 : undefined,
                padding: isPage ? '7px 10px' : '8px 12px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                background: 'var(--bg-panel)',
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                    {isPage
                      ? 'Tabs in selection'
                      : selectedWindowIds.length === 0
                      ? 'Tabs'
                      : selectedWindowIds.length === 1
                        ? `${windowLabelById.get(selectedWindowIds[0]) || 'W?'}`
                        : `${selectedWindowIds.length} windows`}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {filteredTabsForSelection.length} {query ? 'matches' : 'tabs'}
                  </span>
                  {selectedWindowIds.length === 1 && (
                    <button
                      onClick={(e) => handleFindWindow(e, selectedWindowIds[0])}
                      title="Locate this window (flashes it)"
                      style={{
                        padding: '2px 6px',
                        background: 'var(--accent-weak)',
                        border: '1px solid var(--accent)',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        marginLeft: 8,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--accent)';
                        e.currentTarget.style.color = 'white';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--accent-weak)';
                        e.currentTarget.style.color = 'var(--accent)';
                      }}
                    >
                      <Search size={10} />
                      Find
                    </button>
                  )}
                </div>
                {query && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 2 }}>
                    Showing matches in selected windows
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TogglePillButton
                    active={tabsView === 'list'}
                    label="List"
                    icon={<List size={14} />}
                    onClick={() => setTabsView('list')}
                  />
                  <TogglePillButton
                    active={tabsView === 'gallery'}
                    label="Gallery"
                    icon={<LayoutGrid size={14} />}
                    onClick={() => setTabsView('gallery')}
                  />
                </div>
                {!isPage && selectedTabIds.length > 0 && (
                  <button type="button" onClick={() => setSelectedTabIds([])} title="Clear individual tab selection" style={pageSecondaryButtonStyle}>
                    {selectedTabIds.length} selected · Clear
                  </button>
                )}
                {previewTabIds.length > 0 && (
                  <button
                    onClick={handleClosePreviews}
                    title={`Close preview tabs (${previewTabIds.length})`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 9999,
                      border: '1px solid var(--error)',
                      background: 'var(--error-weak)',
                      color: 'var(--error)',
                      cursor: 'pointer',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Close previews</span>
                    <span style={{ opacity: 0.85 }}>({previewTabIds.length})</span>
                  </button>
                )}
                {!isPage && selectedWindowIds.length >= 1 && (
                  <WorkspaceSaveMenu buttonId={`workspace-save-selected-${selectedWindowIds.join('-')}`} title="Capture selection" align="right" />
                )}
              </div>
            </div>

            {isPage && selectedTabIds.length > 0 && (
              <div role="status" style={{ minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '5px 10px', borderBottom: '1px solid var(--border-active)', background: 'var(--accent-weak)', color: 'var(--accent)', fontSize: 'var(--text-xs)', fontWeight: 650 }}>
                <span>{selectedTabIds.length} tab{selectedTabIds.length !== 1 ? 's' : ''} selected for capture or drag</span>
                <button type="button" onClick={() => setSelectedTabIds([])} style={{ ...pageSecondaryButtonStyle, minHeight: 25, borderColor: 'var(--border-active)', color: 'var(--accent)' }}>Clear selection</button>
              </div>
            )}

            <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isPage ? 0 : 8, background: isPage ? 'var(--bg-panel)' : 'var(--bg)' }}>
              {selectedWindowIds.length === 0 && (
                <div style={{ padding: 20, color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Select one or more windows.</div>
              )}

              {selectedWindowIds.length > 0 && tabsView === 'list' &&
                visibleTabs.map(({ windowId, tab }) => {
                  const domain = getDomain(tab.url);
                  const isActive = Boolean(tab.active);
                  const label = windowLabelById.get(windowId) || `W?`;
                  const rowKey = `${windowId}:${tab.id}`;
                  const isHovered = hoveredTabKey === rowKey;
                  const isPreview = typeof tab.id === 'number' && previewTabIdSet.has(tab.id);
                  const isSelectedTab = typeof tab.id === 'number' && selectedTabIdSet.has(tab.id);
                  return (
                    <div
                      key={rowKey}
                      role="button"
                      tabIndex={0}
                      aria-label={`Activate ${tab.title || 'Untitled'}`}
                      onClick={() => handleTabClick(tab.id, windowId)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        void handleTabClick(tab.id, windowId);
                      }}
                      draggable
                      onDragStart={(e) => handleTabDragStart(e, tab.id, windowId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: isPage ? '7px 9px' : '6px 8px',
                        background: isSelectedTab ? 'var(--accent-weak)' : isActive ? 'var(--bg-active)' : 'var(--bg-panel)',
                        border: '1px solid transparent',
                        borderBottom: '1px solid var(--border)',
                        borderLeft: isPage ? (isSelectedTab ? '3px solid var(--accent)' : '3px solid transparent') : undefined,
                        borderRadius: isPage ? 0 : 6,
                        cursor: 'pointer',
                        marginBottom: isPage ? 0 : 2,
                        position: 'relative',
                        minHeight: isPage ? 52 : 30,
                      }}
                      onMouseEnter={(e) => {
                        setHoveredTabKey(rowKey);
                        e.currentTarget.style.background = isSelectedTab ? 'var(--accent-weak)' : isActive ? 'var(--bg-active)' : 'var(--bg-hover)';
                        if (!isPage) e.currentTarget.style.borderColor = 'var(--accent)';
                      }}
                      onMouseLeave={(e) => {
                        setHoveredTabKey(null);
                        e.currentTarget.style.background = isSelectedTab ? 'var(--accent-weak)' : isActive ? 'var(--bg-active)' : 'var(--bg-panel)';
                        if (!isPage) e.currentTarget.style.borderColor = 'transparent';
                      }}
                      title={tab.title || ''}
                    >
                      {/* Multi-select checkbox */}
                      {typeof tab.id === 'number' && (
                        <input
                          type="checkbox"
                          checked={isSelectedTab}
                          onChange={() => toggleTabSelection(tab.id!)}
                          onClick={(e) => e.stopPropagation()}
                          title="Select tab"
                          style={{
                            width: 14,
                            height: 14,
                            cursor: 'pointer',
                            flexShrink: 0,
                            opacity: isPage || isHovered || isSelectedTab ? 1 : 0,
                            transition: 'opacity 120ms ease-in-out',
                          }}
                        />
                      )}
                      {tab.favIconUrl ? (
                        <img src={tab.favIconUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }} />
                      ) : (
                        <Globe size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                      )}

                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isMultiWindow && (
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              padding: '1px 6px',
                              borderRadius: 9999,
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              color: 'var(--text)',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                            title={label}
                          >
                            {label}
                          </span>
                        )}

                        {isActive && (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 9999,
                              background: 'var(--status-live)',
                              flexShrink: 0,
                            }}
                            title="Active tab"
                          />
                        )}

                        {isPreview && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 'var(--text-xs)',
                              padding: '1px 6px',
                              borderRadius: 9999,
                              background: 'var(--warning-weak)',
                              border: '1px solid var(--warning-border)',
                              color: 'var(--warning)',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                            title="Preview copy (opened from dashboard)"
                          >
                            <Copy size={12} />
                            Copy
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 500,
                            color: 'var(--text)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          {tab.title || 'Untitled'}
                        </span>

                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 220,
                            flexShrink: 1,
                          }}
                          title={tab.url || ''}
                        >
                          {domain || tab.url}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={(e) => handleOpenHere(e, tab.url)}
                          title="Open here (new tab in this window)"
                          style={{
                            padding: 3,
                            border: '1px solid transparent',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--text-faint)',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: 4,
                            opacity: isPage || isHovered || isActive ? 1 : 0,
                            pointerEvents: isPage || isHovered || isActive ? 'auto' : 'none',
                            transition: 'opacity 120ms ease-in-out',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--accent)';
                            e.currentTarget.style.background = 'var(--accent-weak)';
                            e.currentTarget.style.borderColor = 'var(--accent)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-faint)';
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.borderColor = 'transparent';
                          }}
                        >
                          <ExternalLink size={14} />
                        </button>
                        {tab.id && (
                          <button
                            onClick={(e) => handleCloseTab(e, tab.id!)}
                            title="Close tab"
                            style={{
                              padding: 3,
                              border: '1px solid transparent',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: 'var(--text-faint)',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: 4,
                              opacity: isPage || isHovered || isActive ? 1 : 0,
                              pointerEvents: isPage || isHovered || isActive ? 'auto' : 'none',
                              transition: 'opacity 120ms ease-in-out',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--error)';
                              e.currentTarget.style.background = 'var(--error-weak)';
                              e.currentTarget.style.borderColor = 'var(--error)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-faint)';
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.borderColor = 'transparent';
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

              {selectedWindowIds.length > 0 && tabsView === 'gallery' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isPage ? 'repeat(auto-fill, minmax(180px, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 8,
                    padding: isPage ? 8 : 0,
                    alignItems: 'start',
                  }}
                >
                  {visibleTabs.map(({ windowId, tab }) => {
                    const domain = getDomain(tab.url);
                    const isActive = Boolean(tab.active);
                    const label = windowLabelById.get(windowId) || `W?`;
                    const isPreview = typeof tab.id === 'number' && previewTabIdSet.has(tab.id);
                    const isSelectedTab = typeof tab.id === 'number' && selectedTabIdSet.has(tab.id);

                    return (
                      <div
                        key={`${windowId}:${tab.id}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Activate ${tab.title || 'Untitled'}`}
                        onClick={() => handleTabClick(tab.id, windowId)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                          event.preventDefault();
                          void handleTabClick(tab.id, windowId);
                        }}
                        draggable
                        onDragStart={(e) => handleTabDragStart(e, tab.id, windowId)}
                        style={{
                          background: isActive ? 'var(--accent-weak)' : 'var(--bg-panel)',
                          border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 10,
                          minHeight: isPage ? 128 : undefined,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          outline: isSelectedTab ? '2px solid var(--accent)' : 'none',
                          outlineOffset: 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = 'var(--accent)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = 'var(--border)';
                        }}
                        title={tab.title || ''}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {typeof tab.id === 'number' && (
                              <input
                                type="checkbox"
                                checked={isSelectedTab}
                                onChange={() => toggleTabSelection(tab.id!)}
                                onClick={(e) => e.stopPropagation()}
                                title="Select tab"
                                style={{
                                  width: 14,
                                  height: 14,
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            {tab.favIconUrl ? (
                              <img src={tab.favIconUrl} alt="" style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }} />
                            ) : (
                              <Globe size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                            )}

                            {isMultiWindow && (
                              <span
                                style={{
                                  fontSize: 'var(--text-xs)',
                                  padding: '2px 8px',
                                  borderRadius: 9999,
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text)',
                                  fontWeight: 600,
                                  flexShrink: 0,
                                }}
                                title={label}
                              >
                                {label}
                              </span>
                            )}
                            {isPreview && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 'var(--text-xs)',
                                  padding: '1px 6px',
                                  borderRadius: 9999,
                                  background: 'var(--warning-weak)',
                                  border: '1px solid var(--warning-border)',
                                  color: 'var(--warning)',
                                  fontWeight: 600,
                                  flexShrink: 0,
                                }}
                                title="Preview copy (opened from dashboard)"
                              >
                                <Copy size={12} />
                                Copy
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <button
                              onClick={(e) => handleOpenHere(e, tab.url)}
                              title="Open here (new tab in this window)"
                              style={{
                                padding: 3,
                                border: '1px solid transparent',
                                background: 'transparent',
                                cursor: 'pointer',
                                color: 'var(--text-faint)',
                                display: 'flex',
                                alignItems: 'center',
                                borderRadius: 4,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'var(--accent)';
                                e.currentTarget.style.background = 'var(--accent-weak)';
                                e.currentTarget.style.borderColor = 'var(--accent)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--text-faint)';
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = 'transparent';
                              }}
                            >
                              <ExternalLink size={14} />
                            </button>
                            {tab.id && (
                              <button
                                onClick={(e) => handleCloseTab(e, tab.id!)}
                                title="Close tab"
                                style={{
                                  padding: 3,
                                  border: '1px solid transparent',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: 'var(--text-faint)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  borderRadius: 4,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = 'var(--error)';
                                  e.currentTarget.style.background = 'var(--error-weak)';
                                  e.currentTarget.style.borderColor = 'var(--error)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'var(--text-faint)';
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }}
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 500,
                            color: 'var(--text)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: 1.3,
                            minHeight: '2.4em',
                          }}
                        >
                          {tab.title || 'Untitled'}
                        </div>

                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {domain || tab.url}
                        </div>

                        {isActive && (
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              padding: '2px 8px',
                              borderRadius: 9999,
                              background: '#dcfce7',
                              color: '#166534',
                              fontWeight: 600,
                              width: 'fit-content',
                            }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedWindowIds.length > 0 && hiddenCount > 0 && (
                <button
                  onClick={() => {
                    setTabLimit((n) => clamp(n + TAB_PAGE_SIZE, TAB_PAGE_SIZE, 100000));
                  }}
                  style={{
                    width: '100%',
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 6,
                    border: '1px dashed var(--border)',
                    background: 'var(--bg-panel)',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                  }}
                >
                  Show {Math.min(TAB_PAGE_SIZE, hiddenCount)} more ({hiddenCount} hidden)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    {newWorkspaceModal}
    </>
  );
};

const pageSecondaryButtonStyle = uiPatterns.secondaryButton;
const pageIconButtonStyle: React.CSSProperties = { ...uiPatterns.iconButton, width: 25, height: 25, border: 'none' };
