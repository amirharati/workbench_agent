export type RightPanelTab = 'inspector' | 'ask';

export interface ShellLayoutState {
  leftSidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  rightPanelTab: RightPanelTab;
  listPaneWidth: number;
  bookmarkListWidth: number;
  bookmarkDetailWidth: number;
  notesListWidth: number;
  notesDetailWidth: number;
}

export const SHELL_LAYOUT_STORAGE_KEY = 'workbench-shell-layout';

export const SHELL_LAYOUT_DEFAULTS: ShellLayoutState = {
  leftSidebarCollapsed: false,
  rightPanelCollapsed: false,
  rightPanelTab: 'inspector',
  listPaneWidth: 260,
  bookmarkListWidth: 240,
  bookmarkDetailWidth: 380,
  notesListWidth: 300,
  notesDetailWidth: 400,
};

const WIDTH_BOUNDS = {
  listPaneWidth: { min: 200, max: 400 },
  bookmarkListWidth: { min: 180, max: 480 },
  bookmarkDetailWidth: { min: 280, max: 560 },
  notesListWidth: { min: 180, max: 480 },
  notesDetailWidth: { min: 280, max: 560 },
} as const;

function clampWidth(key: keyof typeof WIDTH_BOUNDS, value: number): number {
  const { min, max } = WIDTH_BOUNDS[key];
  return Math.min(max, Math.max(min, value));
}

function normalizeShellLayout(raw: Partial<ShellLayoutState> | null | undefined): ShellLayoutState {
  const base = SHELL_LAYOUT_DEFAULTS;
  return {
    leftSidebarCollapsed: !!raw?.leftSidebarCollapsed,
    rightPanelCollapsed: !!raw?.rightPanelCollapsed,
    rightPanelTab: raw?.rightPanelTab === 'ask' ? 'ask' : 'inspector',
    listPaneWidth: clampWidth(
      'listPaneWidth',
      typeof raw?.listPaneWidth === 'number' ? raw.listPaneWidth : base.listPaneWidth
    ),
    bookmarkListWidth: clampWidth(
      'bookmarkListWidth',
      typeof raw?.bookmarkListWidth === 'number' ? raw.bookmarkListWidth : base.bookmarkListWidth
    ),
    bookmarkDetailWidth: clampWidth(
      'bookmarkDetailWidth',
      typeof raw?.bookmarkDetailWidth === 'number' ? raw.bookmarkDetailWidth : base.bookmarkDetailWidth
    ),
    notesListWidth: clampWidth(
      'notesListWidth',
      typeof raw?.notesListWidth === 'number' ? raw.notesListWidth : base.notesListWidth
    ),
    notesDetailWidth: clampWidth(
      'notesDetailWidth',
      typeof raw?.notesDetailWidth === 'number' ? raw.notesDetailWidth : base.notesDetailWidth
    ),
  };
}

let cached: ShellLayoutState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function loadShellLayout(): ShellLayoutState {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(SHELL_LAYOUT_STORAGE_KEY);
    if (!raw) {
      cached = SHELL_LAYOUT_DEFAULTS;
      return cached;
    }
    cached = normalizeShellLayout(JSON.parse(raw) as Partial<ShellLayoutState>);
    return cached;
  } catch {
    cached = SHELL_LAYOUT_DEFAULTS;
    return cached;
  }
}

export function saveShellLayout(state: ShellLayoutState): void {
  cached = normalizeShellLayout(state);
  try {
    localStorage.setItem(SHELL_LAYOUT_STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // ignore quota errors
  }
}

export function saveShellLayoutDebounced(state: ShellLayoutState, delayMs = 200): void {
  cached = normalizeShellLayout(state);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveShellLayout(cached!);
    saveTimer = null;
  }, delayMs);
}

export function patchShellLayout(
  patch: Partial<ShellLayoutState>,
  base?: ShellLayoutState
): ShellLayoutState {
  const next = normalizeShellLayout({ ...(base ?? loadShellLayout()), ...patch });
  cached = next;
  saveShellLayoutDebounced(next);
  return next;
}
