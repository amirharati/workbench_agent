# TASK-05.1 — Home View + Right Panel + Status System

**Status:** ✅ Complete for iteration 1 (2026-05-27) — product shell shipped; Home polish deferred
**Depends on:** V2-PRODUCT-DESIGN-SPEC.md (section references below)
**Blocks:** All subsequent 05.x subtasks (they land in this shell)
**Workflows covered:** W1 (daily library use), W7 (shell & focus), W8 (settings & trust)

---

## Implementation Status (Iteration 1)

### Summary

The product shell from this subtask is in place: Home is the default landing view, the right panel is tabbed and minimizable, the three-tier status system ships (StatusBar + Toast + StatusBadge component), font scaling works, and split-view layout uses adaptive widths. Build passes (`npm run build`).

**Home is intentionally accepted as incomplete for this iteration** — hero search + cards + bottom tab row work, but the full Home vision (rich digest/overview, favorites wiring, deeper search-first UX) is deferred to later 05.x work.

### Achievements

| Area | Done | Notes |
|------|------|-------|
| **HomeView** | ✅ | Hero search, 4 cards (2 functional, 2 placeholders), Recently Added opens tabs, bottom split pane with tabs when items are open |
| **RightPanel** | ✅ | Inspector + Ask tabs, 280px expanded / 8px collapsed, hover-to-expand on collapsed strip, slide transition |
| **InspectorTab** | ✅ | Placeholder + basic item metadata when an item tab is active |
| **AskTab** | ✅ | Context selector; Current item + Whole library work via `onTestAI`; collection/search scopes show placeholder |
| **StatusBar** | ✅ | Component + `useStatusBar` hook; rendered below tab strip in `GlobalTabSystem`; wired for invalid URL on bookmark add |
| **Toast system** | ✅ | `ToastProvider` wraps dashboard; save/delete/edit bookmark actions show toasts |
| **StatusBadge** | ✅ (component only) | `StatusBadge.tsx` ships; not wired in UI yet (per spec — lands in 05.3) |
| **Font scaling** | ✅ | `--font-scale` CSS tokens, Settings > Appearance control, persisted + applied on mount |
| **Adaptive layout** | ✅ | List pane `clamp(220px, 22%, 320px)`; `.reading-content` on item tab bodies |
| **Default view** | ✅ | `activeView` defaults to `'home'` |
| **LeftSidebar** | ✅ | Home nav item added |
| **DashboardLayout** | ✅ | Refactored (~541 lines, down from ~1875); inline assistant panel removed |

### Bonus work (beyond original file list)

| File | What |
|------|------|
| `GlobalTabSystem.tsx` (~486 lines) | Unified tab system extracted and reused on Home bottom pane + split-view detail pane; persistent `localStorage` key `workbench-global-tabs` |
| `WorkspaceTabRenderer.tsx` | Workspace tab content restored for `listType: 'workspace'` tabs app-wide |

### Known gaps / deferred polish

| Item | Status |
|------|--------|
| Home full product vision | **Accepted incomplete** for this iteration — cards are functional stubs, not final UX |
| Left nav auto-collapse at `< 1000px` | Not implemented (optional in spec) |
| StatusBadge in UI | Component only — no consumers yet |
| Automatic StatusBar sources (pipeline, review) | Deferred to 05.3 / 05.4 |
| Right panel collapsed state persistence | Deferred to 05.7 |
| Toast undo action | Not implemented (spec says OK for 05.1) |
| Duplicate feedback | App-level `showStatus()` still runs alongside dashboard toasts on some actions |

### Key files (current state)

| File | Role |
|------|------|
| `src/components/dashboard/layout/DashboardLayout.tsx` | Root shell (~541 lines). `ToastProvider`, `useStatusBar`, wrapped bookmark handlers, `globalTabState`, `<RightPanel>`, Home default |
| `src/components/dashboard/HomeView.tsx` | Home landing (~202 lines). Hero search, cards, resizable top/bottom split, `GlobalTabSystem` in bottom pane |
| `src/components/dashboard/GlobalTabSystem.tsx` | Shared tabs: drag-reorder, overflow menu, tabs/sidebar layouts, item detail editing, `<StatusBar>` slot |
| `src/components/dashboard/layout/RightPanel.tsx` | Tabbed Inspector + Ask, minimize/hover expand |
| `src/components/dashboard/StatusBar.tsx` | Tier-2 persistent messages |
| `src/components/ToastContainer.tsx` + `Toast.tsx` | Tier-3 transient toasts |
| `src/components/StatusBadge.tsx` | Tier-1 inline badge (ready, unwired) |
| `src/styles/global.css` | Font scale, `.reading-content`, right-panel + toast + status-bar CSS |

---

## App Context (for fresh sessions)

**What this is:** Chrome MV3 extension — React 18 + TypeScript + Vite. Same `index.html` serves as side panel (< 500px viewport) and full-page dashboard. Local-first via IndexedDB (`idb` library). No CSS framework — uses CSS custom properties (`global.css`) + inline styles. Icons from `lucide-react`. No React Router — navigation is state-driven via `DashboardView` union type in `DashboardLayout.tsx`.

**Key files to understand before starting:**

| File | Role |
|------|------|
| `src/components/dashboard/layout/DashboardLayout.tsx` | Root shell. Manages `activeView`, scope, `globalTabState`, toast/status wrappers, `<RightPanel>`. ~541 lines. |
| `src/components/dashboard/layout/LeftSidebar.tsx` | Left nav: Home, project dropdown, collections, Content, Tools. |
| `src/components/dashboard/layout/MainContent.tsx` | Content router — renders views based on `activeView`. Split mode (list + tabs) vs full-page vs full-middle (Home). |
| `src/components/dashboard/HomeView.tsx` | Home landing: hero search, cards, bottom tab row via `GlobalTabSystem`. |
| `src/components/dashboard/GlobalTabSystem.tsx` | Unified tab strip + item/search/list tab content; persisted to `workbench-global-tabs`. |
| `src/styles/global.css` | Theme tokens + `--font-scale` typography + `.reading-content` + status/toast/right-panel CSS. |
| `src/components/SidePanelView.tsx` | Side panel UI — bookmark save, project/collection pickers. **Do NOT modify.** |
| `src/components/dashboard/PipelineDevView.tsx` | Dev hub — queue, taxonomy, raw scores. **Do NOT modify.** |

**DashboardView type** (in `DashboardLayout.tsx`):
```typescript
export type DashboardView =
  | 'home' | 'settings' | 'projects' | 'tab-commander'
  | 'bookmarks' | 'notes' | 'collections' | 'workspaces';
```

**Current right panel:** Extracted to `RightPanel.tsx` with Inspector / Ask tabs. Inspector context comes from the active global item tab (`inspectorItem` in `DashboardLayout`). Ask uses `onTestAI` + `aiSettings`.

**Key DashboardLayout state / props:**
- `globalTabState: GlobalTabState` — tabs, activeTabId, searchQuery, topPct, bottomLayout (persisted)
- `items`, `projects`, `collections`, `workspaces`
- Wrapped handlers: `handleAddBookmarkWithToast`, `handleUpdateBookmarkWithToast`, `handleDeleteBookmarkWithToast`
- `useStatusBar()` → `<StatusBar>` passed into `GlobalTabSystem`
- Scope state: `scopeProjectId`, `scopeCollectionId`

**`onTestAI` signature:**
```typescript
onTestAI?: (
  settings: AISettings,
  prompt: string
) => Promise<{ text: string; model: string; requestedModel?: string; modelMismatch?: boolean }>;
```

**`buildBookmarkGroundingPrompt` import:**
```typescript
import { buildBookmarkGroundingPrompt } from '../../lib/ai/bookmarkContext';
// Returns { prompt: string; sources: BookmarkAISource[] }
// Used in MainContent.tsx for the "Ask AI" feature on bookmarks
```

---

## Why This First

Every subsequent subtask (search tab, enrichment display, category review, digest UX, signals) needs somewhere to render. This ships the **product shell** that all AI-enriched features land in. Without it, we're pouring enrichment data into dev-only modals and a bare textarea.

---

## What We're Building (end state)

The stub `HomeView` becomes a search-first landing. The bare right textarea becomes a tabbed, minimizable Inspector + Ask panel. We add a three-tier status system (badges, bar, toasts) and font scaling.

### Before (current)

```
Left Nav: Home = dashed placeholder "intentionally empty"

Right Panel: 
┌─────────────────┐
│ Assistant       │ ← header
├─────────────────┤
│ [  textarea  ]  │
│ [    Ask    ]   │
│ Output appears  │
└─────────────────┘
```

### After (this subtask)

```
Left Nav: ★ Home (default, navigates to Home view)

Home View (in middle):
┌──────────────────────────────────────────────┐
│                                              │
│       🔍 Search your library...              │
│                                              │
│  ┌───────────────┐ ┌───────────────┐  ...   │
│  │ ⭐ Favorites  │ │ 🆕 Recently   │        │
│  └───────────────┘ └───────────────┘        │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ 📊 Library Overview                  │   │
│  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘

Right Panel:
┌─────────────────┐
│ Inspector | Ask │ ← tabs
│           [◀▶] │ ← minimize toggle
├─────────────────┤
│  [active tab]   │
│                 │
│                 │
└─────────────────┘

Status Bar (below tab strip, above content):
┌──────────────────────────────────────────────┐
│ ⚠️ Pipeline issues / key warnings  [X]     │
└──────────────────────────────────────────────┘

Toasts (bottom-right, transient):
┌─────────────────────────────────┐
│ ✓ Action confirmed              │
└─────────────────────────────────┘
```

---

## Scope — What Ships in 05.1

### 1. Home View (rewrite)

Replace the stub `HomeView.tsx` with a functional, styled landing page.

**Must include:**

| Element | Detail | Reference |
|---------|--------|-----------|
| Hero search input | Centered, large, with search icon. Submitting triggers search (activates Search tab — defers actual search to 05.2). Empty state: if Search tab doesn't exist yet, show placeholder message "Search tab coming in 05.2" or open the existing `SearchTab` (substring) as fallback. | Spec §3 |
| Favorites card | Empty state with message and CTA. No data wiring yet — data comes in 05.3/05.4. Shows: "Pin items to see them here." | Spec §3 |
| Recently Added card | Shows last N items from `items` array (sorted by `created_at` descending). Click opens item tab (reuse existing `handleOpenItemTab`). Empty state: "Add your first bookmark or note to get started." | Spec §3 |
| Processing Digest card | Placeholder only. Shows static text: "Processing overview coming soon." Real data in 05.3. | Spec §3 |
| Library Overview card | Placeholder only. Shows static text: "Category overview coming soon." Real data in 05.3. | Spec §3 |

**Styling:** Use existing CSS variable tokens (`--bg-panel`, `--border`, `--text`, `--accent`, `--text-muted`). Cards use consistent border-radius (6px), subtle border, light background (`--bg-panel`). Hero search uses the same style as current `SearchBar` but larger and centered.

**Edge cases:**
- User has zero items → Recently Added shows empty state message
- User has items but they just landed → Recently Added shows the items (it should work day 1)
- No Search tab infrastructure yet → search triggers the existing `SearchTab` component as fallback, with the query pre-filled

### 2. Right Panel (new component tree)

Extract the right panel from the inline JSX in `DashboardLayout.tsx` (lines ~1791–1858) into dedicated components.

**Must include:**

| Component | Detail | Reference |
|-----------|--------|-----------|
| `RightPanel` | Outer container with tab header + toggle. 280px wide. Border-left matching `--border`. Background `--bg-panel`. | Spec §4, §5, §6 |
| Tab header | Two tabs: "Inspector" and "Ask". Click switches active tab. Active tab has bottom border accent. | Spec §4, §5 |
| Minimize toggle | `◀▶` icon button (use `ChevronLeft`/`ChevronRight` from lucide-react) in the header right. Click collapses panel to ~8px strip. CSS slide transition 200ms ease. Expanded state: 280px. Collapsed state: `width: 8px` with a thin vertical handle. Hovering the collapsed strip re-expands it (or click to expand). | Spec §6 |
| `InspectorTab` | Placeholder content. Shows: "Select an item or search result to see details." Real inspector content (status, summary, categories, similar) lands in 05.3/05.4. | Spec §4 |
| `AskTab` | Context-aware chat. Reuses the existing `onTestAI` callback and `aiSettings`. Moves the existing textarea + Ask button + answer display from inline JSX into this component. Context selector dropdown (Current item / Current collection / Current search results / Whole library) — functional dropdown but grounding assembly defers full grounding per context to 05.3+. For 05.1, "Current item" and "Whole library" work (reuse existing `buildBookmarkGroundingPrompt`). "Current collection" and "Current search results" show placeholder message if selected. | Spec §5 |

**States:**
- Right panel expanded (default) — all content visible
- Right panel collapsed — 8px strip, hover/click to expand
- Ask tab with active item → ground on item (existing behavior)
- Ask tab without active item → "Select an item or Ask about your library."
- Ask tab error → red error text (already handled by existing `rightError` state)

**Data flow:**
- `activeTabItem` (already in DashboardLayout state) → passed to InspectorTab and AskTab as context
- `aiSettings` and `onTestAI` → passed to AskTab
- Right panel minimize state → local state in RightPanel (persisted to localStorage optionally)

### 3. StatusBar (new component)

Persistent dismissible message strip positioned **below the tab strip, above content area** in the middle workspace.

**Must include:**

| Element | Detail | Reference |
|---------|--------|-----------|
| Component | `StatusBar.tsx` — thin horizontal bar, full width of middle workspace content area | Spec §11 (Tier 2) |
| Messages | Stack vertically, max 3. Each: icon + message + optional action button + dismiss (X). Click dismiss removes that message. | Spec §11 |
| Types | `warning` (yellow/amber icon), `error` (red icon), `info` (neutral icon) | Spec §11 |
| State management | Simple local state array of messages. No persistence for 05.1. Add/remove via `addStatusMessage`/`dismissStatusMessage` callbacks. | — |
| Empty state | When no messages → nothing renders (no empty bar taking space) | — |

**For 05.1, StatusBar ships structurally but with no automatic message sources.** We add message triggers in later subtasks (05.3 for pipeline issues, 05.4 for review needs). A dev-only test button somewhere (or a `useEffect` in App) can add a sample message to verify it works.

### 4. Toast System (new components)

Transient notification system positioned bottom-right of the middle workspace.

**Must include:**

| Component | Detail | Reference |
|-----------|--------|-----------|
| `ToastContainer` | Manages toast queue. Renders toasts stacked in bottom-right corner. Max 5 visible. | Spec §11 (Tier 3) |
| `Toast` | Individual toast. Types: `success` (green), `error` (red), `info` (neutral). Each has: icon, message, optional action button, optional dismiss. CSS animation: fade + slide in (~250ms). | Spec §11 |
| Auto-dismiss | `success` and `info` toasts auto-dismiss after 3s. `error` toasts persist until dismissed. | Spec §11 |
| State management | React context or simple local state in DashboardLayout. `addToast` function accepts `{ type, message, action? }`. | — |

**For 05.1, Toast ships structurally but is wired to existing actions** — e.g., when a bookmark is saved or deleted, show a toast instead of (or in addition to) existing behavior. This proves the system works and provides immediate value.

**Actions to wire to toasts (05.1):**
- Bookmark saved → `{ type: 'success', message: 'Bookmark saved to Collection Name' }`
- Bookmark deleted → `{ type: 'info', message: 'Bookmark removed' }`
- Item edit saved → `{ type: 'success', message: 'Changes saved' }`

### 5. StatusBadge (new shared component)

Inline status indicator used across item cards, Inspector, search results, etc.

**Must include:**

| Element | Detail | Reference |
|---------|--------|-----------|
| Component | `StatusBadge.tsx` — inline pill/badge with icon + label | Spec §11 (Tier 1) |
| Variants | `success` (green), `warning` (amber), `error` (red), `info` (blue/neutral) | Spec §11 |
| Usage | Consumable by any component. Exports: `<StatusBadge variant="success">Ready</StatusBadge>` | Spec §11 |
| Styling | CSS variables, compact (font-size: `--text-xs`, padding: 2px 8px, radius: 999px) | — |

**For 05.1:** Ship the component. Wire it nowhere yet — it'll be used in 05.3 (item cards, inspector). Include in the component library ready for consumption.

### 6. Font Scaling System

CSS-based font scaling with user preference.

**Must include:**

| Element | Detail | Reference |
|---------|--------|-----------|
| CSS custom property | `--font-scale` on `:root`, default `1` | Spec §10 |
| CSS changes | Convert existing font size variables to use `calc()` with `--font-scale`: `--text-xs: calc(0.75rem * var(--font-scale))`, etc. | Spec §10 |
| Reading tokens | Add `--reading-leading: calc(1.6 * var(--font-scale))` for notes/AI summary text | Spec §10 |
| User preference | Persist to `localStorage` (key: `workbench-font-scale`). Default: `normal` (scale 1.0). Apply on app mount. | Spec §10 |
| Settings UI | Add Appearance section in `SettingsView` with font size control: segmented button or radio: Small (0.9) | Normal (1.0) | Large (1.15) | Spec §10 |
| Content max-width | Reading content in item tabs gets `max-width: 680px` with `margin: 0 auto`. Apply as CSS class (e.g., `.reading-content`) | Spec §9 |

### 7. Adaptive Layout (DashboardLayout changes)

Modify `DashboardLayout.tsx` to support flexible region widths.

**Must include:**

| Element | Detail | Reference |
|---------|--------|-----------|
| List pane width | Change fixed `280px` to `clamp(220px, 22%, 320px)` for the left-middle list pane in split mode | Spec §9 |
| Left nav auto-collapse | On window width < 1000px (optional, toggleable), auto-collapse to 48px icon-only mode. Keep existing manual collapse toggle working. | Spec §9 |
| Right panel integration | Replace inline right panel JSX with `<RightPanel>` component. Panel width: 280px (collapsible to 8px). | Spec §6 |
| StatusBar integration | Add `<StatusBar>` below tab strip, above content area in middle workspace | Spec §11 |
| ToastContainer integration | Add `<ToastContainer>` in DashboardLayout, positioned fixed bottom-right of middle workspace | Spec §11 |

### 8. LeftSidebar — Home nav item

Add Home to the left navigation.

**Must include:**

| Element | Detail | Reference |
|---------|--------|-----------|
| Home icon | `Star` or `Home` from lucide-react (choose one, be consistent). Placed at top of nav, above Content section. | Spec §1 (IA Map) |
| Active state | Home is the default view when app launches. `activeView` defaults to `'home'`. | Spec §1 |
| Routing | Clicking Home sets `activeView` to `'home'`. `MainContent` renders `HomeView` (rewrite). | — |

---

## What We Are NOT Building (deferred to later subtasks)

| Item | Why deferred | Will land in |
|------|-------------|-------------|
| Hybrid search engine in product | Search tab infrastructure needs 05.2 | 05.2 |
| AI summary in item tab body | Needs enrichment data display patterns | 05.3 |
| Category accept/reject UI | Needs category data flow | 05.4 |
| Real Processing Digest data | Needs pipeline status aggregation | 05.3 |
| Real Library Overview data | Needs category aggregation | 05.3 |
| Full Inspector content (status, summary, similar) | Needs data display patterns | 05.3, 05.4 |
| Context grounding for collection/search scope in Ask | Needs those data flows | 05.2, 05.3 |
| `Cmd+K` command palette | Needs search tab infrastructure | 05.2 |
| Persisted right panel state | Nice-to-have, not critical path | 05.7 |
| Persisted split widths | Phase 2 shell polish | 05.7 |

---

## Files to Create

| File | Component | Status |
|------|-----------|--------|
| `src/components/dashboard/HomeView.tsx` | Rewrite existing stub | ✅ ~202 lines |
| `src/components/dashboard/layout/RightPanel.tsx` | Tabbed panel with minimize | ✅ ~161 lines |
| `src/components/dashboard/InspectorTab.tsx` | Placeholder inspector | ✅ |
| `src/components/dashboard/AskTab.tsx` | Chat interface | ✅ |
| `src/components/dashboard/StatusBar.tsx` | Persistent message strip | ✅ ~113 lines |
| `src/components/ToastContainer.tsx` | Toast queue manager | ✅ ~74 lines |
| `src/components/Toast.tsx` | Individual toast | ✅ ~105 lines |
| `src/components/StatusBadge.tsx` | Inline status indicator | ✅ ~39 lines (unwired) |
| `src/components/dashboard/GlobalTabSystem.tsx` | Unified tab system (bonus) | ✅ ~486 lines |
| `src/components/dashboard/WorkspaceTabRenderer.tsx` | Workspace tab content (bonus) | ✅ |

## Files to Modify

| File | Changes | Status |
|------|---------|--------|
| `src/components/dashboard/layout/DashboardLayout.tsx` | RightPanel, StatusBar, ToastProvider, global tabs, clamp, Home default | ✅ |
| `src/components/dashboard/layout/LeftSidebar.tsx` | Home nav item | ✅ |
| `src/components/dashboard/layout/MainContent.tsx` | Route `'home'` → `HomeView`; pass global tab state | ✅ |
| `src/styles/global.css` | Font scale, reading content, animations | ✅ |
| `src/components/dashboard/SettingsView.tsx` | Appearance font size control | ✅ |

---

## Implementation Order (recommended)

1. ~~**Font scaling + reading CSS**~~ ✅
2. ~~**StatusBadge component**~~ ✅
3. ~~**Toast + ToastContainer**~~ ✅
4. ~~**StatusBar**~~ ✅
5. ~~**RightPanel + InspectorTab + AskTab**~~ ✅
6. ~~**HomeView rewrite**~~ ✅ (iteration 1 — polish deferred)
7. ~~**DashboardLayout integration**~~ ✅
8. ~~**LeftSidebar Home nav**~~ ✅
9. ~~**SettingsView font scale**~~ ✅

---

## Acceptance Criteria

> Checked items verified in implementation session (2026-05-27). Home marked complete for iteration 1 with polish deferred.

### Visual
- [x] Home view renders as default landing (not Bookmarks, not empty stub)
- [x] Hero search input is centered, styled, and large
- [x] Favorites card shows empty state message
- [x] Recently Added card shows items when items exist
- [x] Processing Digest card shows placeholder message
- [x] Library Overview card shows placeholder message
- [x] Right panel has Inspector and Ask tabs with visual active state
- [x] Right panel minimizes (collapses to strip) and expands (slide animation)
- [x] StatusBar renders below tab strip when messages exist
- [x] StatusBar is invisible when no messages
- [x] Toasts appear in bottom-right with fade+slide animation
- [x] Toasts auto-dismiss (success/info: 3s, error: persistent)
- [ ] StatusBadge renders inline with correct variant colors *(component ships; not placed in UI yet — OK for 05.1)*
- [x] Font scale toggle in Settings > Appearance changes all text sizes
- [x] Reading content text uses comfortable line-height (1.6) where `.reading-content` is applied

### Functional
- [x] Clicking Home in left nav shows Home view
- [x] Recently Added items are clickable → opens item tab
- [x] Hero search submits query (opens existing SearchTab with query pre-filled)
- [x] Ask tab accepts prompt and returns AI response (existing behavior preserved)
- [x] Ask tab context selector dropdown works (can switch context options)
- [x] Right panel minimize toggle works (collapses to 8px strip, click to expand)
- [x] Right panel width is 280px expanded, 8px collapsed
- [x] StatusBar messages can be dismissed individually
- [x] Toast "Undo" is not implemented yet but toast close (X) works on error toasts
- [x] Bookmark save triggers success toast
- [x] Bookmark delete triggers info toast
- [x] Item edit save triggers success toast
- [x] Font scale preference persists across page reloads

### Compatibility
- [x] Existing views (Bookmarks, Notes, Workspaces, Tab Commander, Settings) continue to work
- [x] Tab system (open/close/reorder) unaffected
- [x] Scope filtering (project/collection) unaffected
- [x] Side panel unaffected
- [x] Dev hub (PipelineDevView) unaffected
- [x] Theme toggle (dark/light) still works with new components
- [x] BroadcastChannel sync between side panel and dashboard continues to work

### Edge Cases
- [x] Zero items in library → Recently Added shows empty state, Home renders without errors
- [x] AI not configured (no API key) → Ask tab shows appropriate message/error
- [x] Right panel minimized, user opens new item tab → Inspector doesn't crash (no content to render)
- [x] Very long item title → truncated in Recently Added card, not breaking layout
- [x] Very many items → Recently Added limits to reasonable count (10–20)
- [x] Window resized to < 900px → layout doesn't break (compact mode not required yet, but shouldn't crash)

### Not in scope / still open
- [ ] Left nav auto-collapse at window width `< 1000px` *(optional in spec — not implemented)*
- [ ] Home full product polish *(accepted incomplete for iteration 1)*

---

## Design Spec References

All design decisions reference `docs/temp/V2-PRODUCT-DESIGN-SPEC.md`:

| This subtask references | Spec section |
|------------------------|-------------|
| IA Map | §1 |
| Shell architecture | §2 |
| Home View layout + cards | §3 |
| Inspector tab structure | §4 |
| Ask tab structure | §5 |
| Right panel minimize | §6 |
| Adaptive layout (clamp, max-width) | §9 |
| Font scaling system | §10 |
| Error/status system (all 3 tiers) | §11 |
| Animation policy | §12 |
| Product vs Dev map | §14 |
| Component inventory | §19 |

---

*Last updated: 2026-05-27 — Iteration 1 complete. Home polish + StatusBadge wiring deferred to later 05.x.*