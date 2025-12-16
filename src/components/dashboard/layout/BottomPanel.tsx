import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Copy, ExternalLink, Globe, GripHorizontal, LayoutGrid, List, Search, Trash2, X } from 'lucide-react';
import type { WindowGroup } from '../../../App';
import { addWorkspace, updateWorkspace } from '../../../lib/db';
import type { Workspace, WorkspaceWindow } from '../../../lib/db';

interface BottomPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  windows: WindowGroup[];
  workspaces: Workspace[];
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
  windows,
  workspaces,
  onWorkspacesChanged,
  onCloseTab,
  onCloseWindow,
  onRefresh,
}) => {
  const allTabs = useMemo(() => windows.flatMap((w) => w.tabs), [windows]);
  const [query, setQuery] = useState('');
  const [selectedWindowIds, setSelectedWindowIds] = useState<number[]>([]);
  const [lastClickedWindowId, setLastClickedWindowId] = useState<number | null>(null);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState<string | null>(null);
  const [windowCollapsed, setWindowCollapsed] = useState<Record<number, boolean>>({});
  const [tabLimit, setTabLimit] = useState<number>(120);
  const TAB_PAGE_SIZE = 120;
  const [tabsView, setTabsView] = useState<'list' | 'gallery'>('list');
  const [hoveredTabKey, setHoveredTabKey] = useState<string | null>(null);
  const [previewTabIds, setPreviewTabIds] = useState<number[]>([]);
  const previewTabIdSet = useMemo(() => new Set(previewTabIds), [previewTabIds]);
  const PREVIEW_TAB_IDS_STORAGE_KEY = 'workbench_preview_tab_ids';
  const [dragOverWindowId, setDragOverWindowId] = useState<number | null>(null);

  const DRAG_MIME = 'application/x-workbench-tab';
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const selectedTabIdSet = useMemo(() => new Set(selectedTabIds), [selectedTabIds]);

  const sortedWindows = useMemo(() => {
    // Windows with an active tab first, then by tab count desc.
    return [...windows].sort((a, b) => {
      const aActive = a.tabs.some((t) => t.active) ? 1 : 0;
      const bActive = b.tabs.some((t) => t.active) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.tabs.length - a.tabs.length;
    });
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
      dragEl.style.background = 'rgba(255,255,255,0.98)';
      dragEl.style.border = '1px solid rgba(229,231,235,1)';
      dragEl.style.boxShadow = '0 18px 44px rgba(0,0,0,0.22)';
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
      left.style.color = '#111827';

      const pill = document.createElement('div');
      pill.textContent = count.toString();
      pill.style.fontSize = '12px';
      pill.style.fontWeight = '900';
      pill.style.color = '#1d4ed8';
      pill.style.background = '#eff6ff';
      pill.style.border = '1px solid #93c5fd';
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
          row.style.color = '#374151';
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
          more.style.color = '#6b7280';
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
    if (!url || !url.startsWith('http')) return;
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
        .filter((t): t is chrome.tabs.Tab => Boolean(t && t.url && t.url.startsWith('http')))
        .map((t) => ({ url: t.url!, title: t.title || undefined, favIconUrl: t.favIconUrl || undefined }));
      return [{ id: crypto.randomUUID(), name: 'Selected tabs', tabs }];
    }

    const windowGroups = selectedWindowIds.length > 0 ? selectedWindows : windows;
    return windowGroups.map((w) => ({
      id: crypto.randomUUID(),
      name: windowLabelById.get(w.windowId) || `Window ${w.windowId}`,
      tabs: w.tabs
        .filter((t) => t.url && t.url.startsWith('http'))
        .map((t) => ({ url: t.url!, title: t.title || undefined, favIconUrl: t.favIconUrl || undefined })),
    }));
  };

  const saveAsNewWorkspace = async () => {
    const windowsToSave = buildWorkspaceWindowsFromSelection();
    const suggested =
      selectedTabIds.length > 0
        ? `Tabs (${windowsToSave[0]?.tabs.length || 0})`
        : selectedWindowIds.length > 0
          ? `Workspace (${selectedWindowIds.length} windows)`
          : `Workspace (${windowsToSave.length} windows)`;

    const name = window.prompt('New workspace name:', suggested);
    if (!name || !name.trim()) return;
    await addWorkspace(name.trim(), windowsToSave);
    if (onWorkspacesChanged) await onWorkspacesChanged();
  };

  const updateExistingWorkspace = async (workspaceId: string) => {
    const windowsToSave = buildWorkspaceWindowsFromSelection();
    await updateWorkspace(workspaceId, { windows: windowsToSave });
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
        gap: '0.375rem',
        padding: '0.25rem 0.5rem',
        borderRadius: '9999px',
        border: active ? '1px solid #93c5fd' : '1px solid #e5e7eb',
        background: active ? '#eff6ff' : 'white',
        color: active ? '#1d4ed8' : '#374151',
        cursor: 'pointer',
        fontSize: '0.75rem',
        fontWeight: 800,
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
  }: {
    buttonId: string;
    title: string;
    align?: 'left' | 'right';
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
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            boxShadow: '0 18px 44px rgba(0,0,0,0.22)',
            zIndex: 2147483647,
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '0.625rem 0.75rem',
              borderBottom: '1px solid #e5e7eb',
              background: '#f9fafb',
              fontWeight: 900,
              color: '#111827',
              fontSize: '0.875rem',
            }}
          >
            Save to workspace
          </div>

          <div
            onClick={async () => {
              closeDropdowns();
              await saveAsNewWorkspace();
            }}
            style={{
              padding: '0.625rem 0.75rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 900,
              borderBottom: '1px solid #e5e7eb',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
            title="Create a new workspace snapshot"
          >
            + New workspace…
          </div>

          <div style={{ maxHeight: `${MENU_MAX_HEIGHT}px`, overflowY: 'auto' }}>
            {workspaces.length === 0 && (
              <div style={{ padding: '0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>
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
                  padding: '0.625rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                title="Update this workspace (overwrite snapshot)"
              >
                <span style={{ fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ws.name}
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#6b7280', flexShrink: 0 }}>
                  Update
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
            gap: '0.375rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '9999px',
            border: '1px solid #e5e7eb',
            background: 'white',
            cursor: 'pointer',
            color: '#374151',
            fontSize: '0.75rem',
            fontWeight: 900,
            whiteSpace: 'nowrap',
          }}
        >
          Save…
        </button>
        {isOpen ? renderMenu() : null}
      </>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        background: 'white',
      }}
      onClick={() => closeDropdowns()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f9fafb',
          padding: '0.375rem 0.5rem',
          borderBottom: '1px solid #e5e7eb',
          cursor: isCollapsed ? 'pointer' : 'default',
          userSelect: 'none',
          flexShrink: 0,
          gap: '0.5rem',
        }}
        onClick={isCollapsed ? onToggle : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <GripHorizontal size={16} style={{ color: '#9ca3af' }} />
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827', whiteSpace: 'nowrap' }}>
            Tab Commander
          </span>
          <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
            {windows.length} windows • {allTabs.length} tabs
          </span>
          {!isCollapsed && selectedWindowIds.length > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                color: '#111827',
                background: '#eef2ff',
                border: '1px solid #c7d2fe',
                borderRadius: '9999px',
                padding: '0.125rem 0.5rem',
                fontWeight: 700,
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
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '0.1875rem 0.5rem',
                width: 'min(680px, 100%)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Search size={14} style={{ color: '#9ca3af' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tabs (title / domain / url)…"
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.8125rem',
                  width: '100%',
                  background: 'transparent',
                  color: '#111827',
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '0.125rem',
                    color: '#9ca3af',
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
              <WorkspaceSaveMenu buttonId="workspace-save" title="Save to workspace" align="right" />
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
              color: '#6b7280',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '0.375rem',
            }}
            title={isCollapsed ? 'Expand' : 'Collapse'}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#e5e7eb';
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

      {/* Content */}
      {!isCollapsed && (
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: '240px 1fr',
            background: '#f9fafb',
          }}
        >
          {/* Windows column */}
          <div
            style={{
              borderRight: '1px solid #e5e7eb',
              overflowY: 'auto',
              padding: '0.375rem',
              background: '#ffffff',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.25rem 0.25rem 0.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#111827' }}>Windows</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectAllToggle();
                }}
                style={{
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  cursor: 'pointer',
                  color: '#374151',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
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

              return (
                <div
                  key={w.windowId}
                  style={{
                    border: isSelected ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                    background: isSelected ? '#eef2ff' : 'white',
                    borderRadius: '0.5rem',
                    padding: '0.375rem 0.5rem',
                    marginBottom: '0.375rem',
                    cursor: 'pointer',
                    outline: dragOverWindowId === w.windowId ? '2px solid #2563eb' : 'none',
                    outlineOffset: '1px',
                  }}
                  onClick={(e) => handleWindowClick(w.windowId, e)}
                  onDragOver={(e) => handleWindowDragOver(e, w.windowId)}
                  onDragEnter={(e) => handleWindowDragOver(e, w.windowId)}
                  onDragLeave={() => {
                    if (dragOverWindowId === w.windowId) setDragOverWindowId(null);
                  }}
                  onDrop={(e) => void handleWindowDrop(e, w.windowId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    {/* Left: checkbox + label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleWindowSelection(w.windowId)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '14px',
                          height: '14px',
                          cursor: 'pointer',
                          accentColor: '#2563eb',
                          flexShrink: 0,
                        }}
                        aria-label={`Select ${label}`}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0 }}>
                        <span style={{ fontWeight: 900, fontSize: '0.75rem', color: '#111827', whiteSpace: 'nowrap' }}>
                          {label}
                        </span>
                        {w.tabs.some((t) => t.active) && (
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '9999px',
                              background: '#22c55e',
                              flexShrink: 0,
                            }}
                            title="Active window"
                          />
                        )}
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            background: '#f3f4f6',
                            border: '1px solid #e5e7eb',
                            borderRadius: '9999px',
                            padding: '0.0625rem 0.375rem',
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                          title={query ? `${matchCount} match` : `${w.tabs.length} tabs`}
                        >
                          {query ? matchCount : w.tabs.length}
                        </span>
                      </div>
                    </div>

                    {/* Right: row controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setWindowCollapsed((prev) => ({ ...prev, [w.windowId]: !isCollapsedWindow }));
                        }}
                        style={{
                          border: '1px solid transparent',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: '0.1875rem',
                          color: '#9ca3af',
                          borderRadius: '0.375rem',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title={isCollapsedWindow ? 'Expand actions' : 'Collapse actions'}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f3f4f6';
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.color = '#374151';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.color = '#9ca3af';
                        }}
                      >
                        {isCollapsedWindow ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                    </div>
                  </div>

                  {!isCollapsedWindow && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.375rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <button
                          onClick={(e) => handleFindWindow(e, w.windowId)}
                          title="Locate window (flashes it)"
                          style={{
                            padding: '0.125rem 0.375rem',
                            background: '#f0f9ff',
                            border: '1px solid #bfdbfe',
                            color: '#2563eb',
                            cursor: 'pointer',
                            borderRadius: '0.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#dbeafe';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f0f9ff';
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
                              padding: '0.25rem',
                              border: '1px solid transparent',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: '#9ca3af',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: '0.375rem',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#ef4444';
                              e.currentTarget.style.background = '#fef2f2';
                              e.currentTarget.style.borderColor = '#fecaca';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#9ca3af';
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
                          border: '1px solid #e5e7eb',
                          background: 'white',
                          cursor: 'pointer',
                          color: '#374151',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.75rem',
                          fontWeight: 800,
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
              <div style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic' }}>
                No open windows found.
              </div>
            )}
          </div>

          {/* Tabs column */}
          <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                padding: '0.375rem 0.5rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                background: '#ffffff',
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 900, fontSize: '0.875rem', color: '#111827' }}>
                    {selectedWindowIds.length === 0
                      ? 'Tabs'
                      : selectedWindowIds.length === 1
                        ? `${windowLabelById.get(selectedWindowIds[0]) || 'W?'}`
                        : `${selectedWindowIds.length} windows`}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {filteredTabsForSelection.length} {query ? 'matches' : 'tabs'}
                  </span>
                  {selectedWindowIds.length === 1 && (
                    <button
                      onClick={(e) => handleFindWindow(e, selectedWindowIds[0])}
                      title="Locate this window (flashes it)"
                      style={{
                        padding: '0.125rem 0.375rem',
                        background: '#f0f9ff',
                        border: '1px solid #bfdbfe',
                        color: '#2563eb',
                        cursor: 'pointer',
                        borderRadius: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        marginLeft: '0.5rem',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#dbeafe';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f0f9ff';
                      }}
                    >
                      <Search size={10} />
                      Find
                    </button>
                  )}
                </div>
                {query && (
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                    Showing matches in selected windows
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
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
                {previewTabIds.length > 0 && (
                  <button
                    onClick={handleClosePreviews}
                    title={`Close preview tabs (${previewTabIds.length})`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '9999px',
                      border: '1px solid #fecaca',
                      background: '#fef2f2',
                      color: '#991b1b',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 900,
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Close previews</span>
                    <span style={{ opacity: 0.85 }}>({previewTabIds.length})</span>
                  </button>
                )}
                {selectedWindowIds.length >= 1 && (
                  <WorkspaceSaveMenu buttonId={`workspace-save-selected-${selectedWindowIds.join('-')}`} title="Save selection" align="right" />
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', background: '#f9fafb' }}>
              {selectedWindowIds.length === 0 && (
                <div style={{ padding: '1.25rem', color: '#9ca3af', fontSize: '0.875rem' }}>Select one or more windows.</div>
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
                      onClick={() => handleTabClick(tab.id, windowId)}
                      draggable
                      onDragStart={(e) => handleTabDragStart(e, tab.id, windowId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        background: isActive ? '#eff6ff' : 'white',
                        border: '1px solid transparent',
                        borderBottom: '1px solid #e5e7eb',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        marginBottom: '0.125rem',
                        position: 'relative',
                        minHeight: '30px',
                      }}
                      onMouseEnter={(e) => {
                        setHoveredTabKey(rowKey);
                        e.currentTarget.style.background = isActive ? '#eff6ff' : '#f9fafb';
                        e.currentTarget.style.borderColor = '#bfdbfe';
                      }}
                      onMouseLeave={(e) => {
                        setHoveredTabKey(null);
                        e.currentTarget.style.background = isActive ? '#eff6ff' : 'white';
                        e.currentTarget.style.borderColor = 'transparent';
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
                            width: '14px',
                            height: '14px',
                            cursor: 'pointer',
                            accentColor: '#2563eb',
                            flexShrink: 0,
                            opacity: isHovered || isSelectedTab ? 1 : 0,
                            transition: 'opacity 120ms ease-in-out',
                          }}
                        />
                      )}
                      {tab.favIconUrl ? (
                        <img src={tab.favIconUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }} />
                      ) : (
                        <Globe size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      )}

                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isMultiWindow && (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              padding: '0.0625rem 0.375rem',
                              borderRadius: '9999px',
                              background: '#f3f4f6',
                              border: '1px solid #e5e7eb',
                              color: '#374151',
                              fontWeight: 800,
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
                              width: '6px',
                              height: '6px',
                              borderRadius: '9999px',
                              background: '#22c55e',
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
                              gap: '0.25rem',
                              fontSize: '0.6875rem',
                              padding: '0.0625rem 0.375rem',
                              borderRadius: '9999px',
                              background: '#fef3c7',
                              border: '1px solid #fcd34d',
                              color: '#92400e',
                              fontWeight: 900,
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
                            fontSize: '0.8125rem',
                            fontWeight: 800,
                            color: '#111827',
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
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '220px',
                            flexShrink: 1,
                          }}
                          title={tab.url || ''}
                        >
                          {domain || tab.url}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                        <button
                          onClick={(e) => handleOpenHere(e, tab.url)}
                          title="Open here (new tab in this window)"
                          style={{
                            padding: '0.1875rem',
                            border: '1px solid transparent',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: '#9ca3af',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '0.375rem',
                            opacity: isHovered || isActive ? 1 : 0,
                            pointerEvents: isHovered || isActive ? 'auto' : 'none',
                            transition: 'opacity 120ms ease-in-out',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#2563eb';
                            e.currentTarget.style.background = '#eff6ff';
                            e.currentTarget.style.borderColor = '#bfdbfe';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#9ca3af';
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
                              padding: '0.1875rem',
                              border: '1px solid transparent',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: '#9ca3af',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: '0.375rem',
                              opacity: isHovered || isActive ? 1 : 0,
                              pointerEvents: isHovered || isActive ? 'auto' : 'none',
                              transition: 'opacity 120ms ease-in-out',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#ef4444';
                              e.currentTarget.style.background = '#fef2f2';
                              e.currentTarget.style.borderColor = '#fecaca';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#9ca3af';
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
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '0.5rem',
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
                        onClick={() => handleTabClick(tab.id, windowId)}
                        draggable
                        onDragStart={(e) => handleTabDragStart(e, tab.id, windowId)}
                        style={{
                          background: isActive ? '#eff6ff' : 'white',
                          border: isActive ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                          borderRadius: '0.75rem',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.375rem',
                          outline: isSelectedTab ? '2px solid #2563eb' : 'none',
                          outlineOffset: '1px',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = '#bfdbfe';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = '#e5e7eb';
                        }}
                        title={tab.title || ''}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            {typeof tab.id === 'number' && (
                              <input
                                type="checkbox"
                                checked={isSelectedTab}
                                onChange={() => toggleTabSelection(tab.id!)}
                                onClick={(e) => e.stopPropagation()}
                                title="Select tab"
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  cursor: 'pointer',
                                  accentColor: '#2563eb',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            {tab.favIconUrl ? (
                              <img src={tab.favIconUrl} alt="" style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }} />
                            ) : (
                              <Globe size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                            )}

                            {isMultiWindow && (
                              <span
                                style={{
                                  fontSize: '0.6875rem',
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: '9999px',
                                  background: '#f3f4f6',
                                  border: '1px solid #e5e7eb',
                                  color: '#374151',
                                  fontWeight: 800,
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
                                  gap: '0.25rem',
                                  fontSize: '0.6875rem',
                                  padding: '0.0625rem 0.375rem',
                                  borderRadius: '9999px',
                                  background: '#fef3c7',
                                  border: '1px solid #fcd34d',
                                  color: '#92400e',
                                  fontWeight: 900,
                                  flexShrink: 0,
                                }}
                                title="Preview copy (opened from dashboard)"
                              >
                                <Copy size={12} />
                                Copy
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                            <button
                              onClick={(e) => handleOpenHere(e, tab.url)}
                              title="Open here (new tab in this window)"
                              style={{
                                padding: '0.1875rem',
                                border: '1px solid transparent',
                                background: 'transparent',
                                cursor: 'pointer',
                                color: '#9ca3af',
                                display: 'flex',
                                alignItems: 'center',
                                borderRadius: '0.375rem',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#2563eb';
                                e.currentTarget.style.background = '#eff6ff';
                                e.currentTarget.style.borderColor = '#bfdbfe';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#9ca3af';
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
                                  padding: '0.1875rem',
                                  border: '1px solid transparent',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: '#9ca3af',
                                  display: 'flex',
                                  alignItems: 'center',
                                  borderRadius: '0.375rem',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = '#ef4444';
                                  e.currentTarget.style.background = '#fef2f2';
                                  e.currentTarget.style.borderColor = '#fecaca';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = '#9ca3af';
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
                            fontSize: '0.875rem',
                            fontWeight: 800,
                            color: '#111827',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: 1.2,
                            minHeight: '2.4em',
                          }}
                        >
                          {tab.title || 'Untitled'}
                        </div>

                        <div style={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {domain || tab.url}
                        </div>

                        {isActive && (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              padding: '0.125rem 0.5rem',
                              borderRadius: '9999px',
                              background: '#dcfce7',
                              color: '#166534',
                              fontWeight: 800,
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
                    marginTop: '0.5rem',
                    padding: '0.625rem',
                    borderRadius: '0.5rem',
                    border: '1px dashed #cbd5e1',
                    background: '#ffffff',
                    cursor: 'pointer',
                    color: '#334155',
                    fontSize: '0.875rem',
                    fontWeight: 700,
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
  );
};
