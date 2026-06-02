# TASK-05.7 — Shell polish phase 2 (W7)

**Status:** **done** — 2026-05-27  
**Depends on:** [TASK-05.1](TASK-05.1-home-right-panel.md) (iter 1 shell), [TASK-05.2](TASK-05.2-product-search.md) (Cmd+K), [TASK-05.40](TASK-05.40-presentation-polish.md) (D-40)  
**Design:** [V2-PRODUCT-DESIGN-SPEC.md](V2-PRODUCT-DESIGN-SPEC.md) § W7, §15 (05.7); [`UI_IDE_REDESIGN.md`](../UI_IDE_REDESIGN.md) § Phase 2–4  
**Policy:** **UI only** — no schema, no pipeline behavior changes

**Deferred by user (master):** [D-41](V2-DEFERRED-TRACKER.md) search click model — needs product thinking first; do **not** implement in 05.7.

---

## Documentation rule (required)

**Worker session:**

- **Only update this file** (`TASK-05.7-shell-polish.md`).
- **Do not edit** `backlog.md`, `OVERVIEW.md`, `README.md`, umbrella `TASK-05-v2-product-ux.md`, or design spec.

**Master session** syncs higher-level docs after your return.

---

## Goal

Finish **W7 Phase 2** from the design spec: shell feels stable and intentional when users switch scope, resize panes, and juggle many tabs. **05.1** shipped the IDE skeleton; **05.7** adds persistence, scope affordances, and light keyboard polish.

**Success:** User returns to the app and sees the same sidebar/right-panel/list widths; open tabs show when they are **outside current project/collection scope**; scope is visible without digging in the left nav dropdown only.

---

## What exists today (read first)

| Piece | Today | Gap |
|-------|--------|-----|
| Left nav | `LeftSidebar` — project dropdown + collections; `isSidebarCollapsed` in `DashboardLayout` (not persisted) | Virtual **scope chips**; collapsed state lost on reload |
| Middle split | Bookmarks/Notes/Workspaces: list pane `clamp(220px, 22%, 320px)` fixed in `DashboardLayout` | Not user-resizable; width not persisted |
| Bookmarks **full** layout | `MainContent` 3-column: `bookmarkListWidth`, `bookmarkDetailWidth` + `Resizer` (session-only state) | Widths reset on reload |
| Home split | `HomeView` `topPct` + custom row resizer | `topPct` in `globalTabState` (persisted); resizer not shared `Resizer` component |
| Global tabs | `GlobalTabSystem` — `loadGlobalTabState` / `saveGlobalTabState` (`workbench-global-tabs`: tabs, `topPct`, sidebar layout flags) | No **out-of-scope** tab badge |
| Right panel | `RightPanel` — Inspector/Ask, collapse + hover expand | Collapse state **not persisted** (deferred from 05.1) |
| Cmd+K | `CommandPalette` in `DashboardLayout` | Search-only; no general command list |
| Scope model | `scopeProjectId`, `scopeCollectionId` in `DashboardLayout`; filters list + `filteredBookmarkItems` | No chip row; tabs can show items outside scope silently |

**Existing helper:** `src/components/dashboard/Resizer.tsx` — use for new vertical splits.

---

## Recommended scope (phased — ask user before expanding)

### MVP (target for closing 05.7)

**A. Persisted shell layout (`localStorage`)**

Centralize in **`src/lib/shell/shellLayoutState.ts`** (or extend keys carefully) — single JSON blob e.g. `workbench-shell-layout`:

| Key | Default | Source today |
|-----|---------|----------------|
| `leftSidebarCollapsed` | `false` | `DashboardLayout` |
| `rightPanelCollapsed` | `false` | `RightPanel` |
| `rightPanelTab` | `'inspector'` | `RightPanel` |
| `listPaneWidth` | `260` | `DashboardLayout` split list pane |
| `bookmarkListWidth` / `bookmarkDetailWidth` | `240` / `380` | `MainContent` full bookmarks grid |
| `notesListWidth` / `notesDetailWidth` | `240` / `380` | `MainContent` notes grid |

- Load on app init; save on change (debounce 200ms ok).
- Do **not** break existing `workbench-global-tabs` — merge or namespace keys clearly.

**B. Resizable list pane (middle left)**

Replace fixed `clamp(220px, 22%, 320px)` with state + **`Resizer`** between list pane and tab detail pane in `DashboardLayout` (min ~200, max ~400).

**C. Scope chips (virtual aggregate scope)**

Compact chip row above list pane (Bookmarks / Notes / Workspaces) or in list-mode header:

- Chips reflect `scopeProjectId` / `scopeCollectionId`: e.g. `All projects`, `Project: X`, `Collection: Y`, plus active **category** / **pipeline** browse chips if already set (link to existing clear handlers).
- Clicking a chip clears or cycles scope (define simple behavior — **ask Q2**).
- Left nav dropdown **stays**; chips are **summary + quick clear**, not a full replacement.

**D. Out-of-scope tab badges**

For each **item** tab in `GlobalTabSystem` / tab strip:

- If tab’s item is **not** in current `scopeProjectId` / `scopeCollectionId` filter (and scope is not `all`), show small badge e.g. `Out of scope` or icon on tab.
- Click badge or tab context action: **Switch scope to item’s project/collection** or **Reveal anyway** (keep tab active) — **ask Q3**.

Helper: `itemMatchesScope(item, scopeProjectId, scopeCollectionId, collections)`.

**E. Keyboard polish (minimal)**

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Already opens command palette → search |
| `Escape` | Close command palette / top modal if open (verify) |
| `Ctrl+W` or `Cmd+W` | Close active global tab (if not editing text field) — **ask Q4** |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle global tabs — optional |

Do **not** build a full vim-style keymap. Document shortcuts in Settings or a small `?` hint — optional.

**F. Resizer consistency (light)**

- Home `HomeView` horizontal split: use shared **`Resizer`** instead of one-off div (keep `topPct` behavior).

### Stretch (document deferral if skipped)

- Left nav auto-collapse when viewport `< 1000px` (05.1 optional).
- Persist **categoryBrowse** / **pipelineBrowse** in URL or localStorage.
- Command palette commands beyond search (Go to Home, Go to Bookmarks).
- `MainContent.tsx` decomposition (backlog Phase 4 — **not** 05.7).

### Out of scope

- **D-41** search result click / double-click / Enter model
- **05.8** Advanced / dev hub gate
- **D-26** user-signal → pipeline policy
- Favorites/pins/schema
- Changing tab persistence rules (close tabs on scope change) — **item tabs stay open** per spec

---

## Open questions (ask user before coding)

| # | Question | Default if no answer |
|---|----------|----------------------|
| **Q1** | Persist **right panel collapsed** + **active tab** (inspector/ask)? | **Yes** |
| **Q2** | Scope chip click: **clear to All** vs **open left nav** vs per-chip remove? | Chip × clears that dimension; “All projects” resets project+collection |
| **Q3** | Out-of-scope tab: **badge only** vs **badge + click switches scope**? | **Badge + click switches** scope to item’s primary collection |
| **Q4** | `Ctrl+W` close active tab? | **Yes** when focus not in input/textarea |
| **Q5** | Include **full bookmarks 3-column** width persist or only **list pane + right panel**? | **All** resizable widths in MVP |
| **Q6** | Show scope chips on **Home** view? | **No** — Bookmarks/Notes/Workspaces split only |

---

## Implementation plan (suggested order)

1. `shellLayoutState.ts` + wire load/save in `DashboardLayout`, `RightPanel`, `MainContent` (width props or context).
2. List pane resizer in `DashboardLayout`.
3. `itemMatchesScope` + tab badge in `GlobalTabSystem` / tab label renderer.
4. `ScopeChipsBar` component in list pane header.
5. Keyboard handlers in `DashboardLayout` (guard inputs).
6. Home `Resizer` swap.
7. Manual regression + `npm run build`.

---

## Key files (expected touch)

| Action | Path |
|--------|------|
| **Create** | `src/lib/shell/shellLayoutState.ts` (or `src/lib/shellLayoutState.ts`) |
| **Create** | `src/components/dashboard/ScopeChipsBar.tsx` (optional name) |
| **Edit** | `src/components/dashboard/layout/DashboardLayout.tsx` |
| **Edit** | `src/components/dashboard/layout/RightPanel.tsx` |
| **Edit** | `src/components/dashboard/layout/MainContent.tsx` (width init from storage; chips in listMode header) |
| **Edit** | `src/components/dashboard/GlobalTabSystem.tsx` (tab labels / badges) |
| **Edit** | `src/components/dashboard/HomeView.tsx` (Resizer) |
| **Read** | `src/components/dashboard/Resizer.tsx` |
| **Read** | `docs/UI_IDE_REDESIGN.md` § Phase 2 |
| **Do not** | `ProductSearchView` click handlers (D-41), pipeline libs, `db.ts` |

---

## Acceptance criteria

### Required

- [x] Left sidebar collapsed state survives reload
- [x] Right panel collapsed (+ tab if Q1) survives reload
- [x] List pane width draggable and persisted (Bookmarks/Notes/Workspaces split)
- [x] Scope chip row visible in split list mode; reflects project/collection (+ browse chips when active)
- [x] Item tabs outside current scope show visible **out-of-scope** affordance
- [x] At least one keyboard shortcut beyond Cmd+K (per Q4 default: close tab)
- [x] `npm run build` passes
- [x] No regression: tab persistence across scope change (tabs stay open)

### Stretch

- [x] Full bookmarks 3-column widths persisted
- [ ] Viewport auto-collapse left nav
- [ ] Shortcut cheat sheet in Settings

### Out of scope

- [ ] D-41 search interaction unification

---

## Testing hints (manual)

1. Resize list pane → reload app → width restored.
2. Collapse right panel → reload → still collapsed.
3. Scope to Collection A → open item from Collection B in tab → tab shows out-of-scope → click affordance → scope updates or tab still readable.
4. Scope chips show `Collection: Foo` → click × → back to All collections.
5. `Ctrl+W` closes active tab; typing in notes field does not close tab.
6. Cmd+K still opens search; Home hero unchanged.

---

## Task 05.7 return

- **Shipped:**
  - `workbench-shell-layout` localStorage blob (`shellLayoutState.ts`) — sidebar, right panel, list pane, bookmarks/notes column widths
  - Resizable list pane + `Resizer` between list/detail in split views
  - `ScopeChipsBar` in list-mode headers (Bookmarks/Notes/Workspaces) + full bookmarks view
  - Out-of-scope tab badge (`OOS`) on item tabs; click switches scope to item's primary collection
  - Keyboard: `Escape` closes command palette; `Cmd/Ctrl+W` closes active global tab (skips inputs)
  - Home split uses shared `Resizer` component
- **User answers (Q1–Q6):** Defaults (Q1 yes persist right panel; Q2 chip × clears dimension; Q3 badge+click switches scope; Q4 Ctrl+W; Q5 all widths; Q6 no chips on Home)
- **Persisted keys (localStorage):**
  - `workbench-shell-layout` — `leftSidebarCollapsed`, `rightPanelCollapsed`, `rightPanelTab`, `listPaneWidth`, `bookmarkListWidth`, `bookmarkDetailWidth`, `notesListWidth`, `notesDetailWidth`
  - `workbench-global-tabs` unchanged (tabs, `topPct`, etc.)
- **Files touched:**
  - `src/lib/shell/shellLayoutState.ts` (new)
  - `src/lib/shell/itemScope.ts` (new)
  - `src/components/dashboard/ScopeChipsBar.tsx` (new)
  - `src/components/dashboard/layout/DashboardLayout.tsx`
  - `src/components/dashboard/layout/RightPanel.tsx`
  - `src/components/dashboard/layout/MainContent.tsx`
  - `src/components/dashboard/GlobalTabSystem.tsx`
  - `src/components/dashboard/HomeView.tsx`
- **Deviations / deferred:** Viewport auto-collapse left nav; Settings shortcut cheat sheet; Cmd+K search-only palette unchanged
- **Suggested master doc updates:** Mark 05.7 / W7 Phase 2 done in umbrella + tracker; note persisted layout keys
- **Known gaps / follow-ups:** D-41 search clicks; 05.8 Advanced gate; optional Ctrl+Tab tab cycling


---

## After 05.7 (master planning)

| ID | What |
|----|------|
| **05.8** | Advanced / dev gate (W8) |
| **D-41** | Search interaction (when user ready) |
| **D-26** | User-signal → pipeline policy |
| **D-25** | Fetch review UI |
| **05.B** | Schema / favorites |

---

*Last updated: 2026-05-27 — Done. Master docs synced.*
