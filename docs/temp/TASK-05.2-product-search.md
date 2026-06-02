# TASK-05.2 — Product Library Search (W5 + W1 slice)

**Status:** Shipped — 2026-05-27 (post-ship refinements: tab entry, Inspector history, tab scroll)  
**Depends on:** [TASK-05.1](TASK-05.1-home-right-panel.md) (shell shipped), [V2-PRODUCT-DESIGN-SPEC.md](V2-PRODUCT-DESIGN-SPEC.md) §7  
**Blocks:** 05.3 (enrichment display can reuse search selection patterns)  
**Workflows covered:** W5 (search & discovery), W1 (daily library — find + open items)

---

## App context (for fresh sessions)

**What this is:** Chrome MV3 extension — React 18 + TypeScript + Vite. Dashboard uses state-driven `DashboardView` (no React Router). Styling: CSS variables in `global.css` + inline styles. Icons: `lucide-react`.

**05.1 shipped:**
- Home as default landing (`HomeView.tsx`)
- Right panel: Inspector + Ask (`RightPanel.tsx`)
- Global tab system (`GlobalTabSystem.tsx`) — item/list/search tabs, persisted in `localStorage` key `workbench-global-tabs`
- `DashboardLayout.tsx` ~541 lines — `globalTabState`, toast wrappers, `inspectorItem` from active **item** tab only

**Search today (the problem):**

| Surface | File | What it does |
|---------|------|--------------|
| List-pane `SearchBar` | `SearchBar.tsx` + `MainContent.tsx` | **Filter** — live substring filter on current Bookmarks/Notes/Workspaces list |
| `SearchTab` in global tabs | `SearchTab.tsx` | **Substring library search** — title/URL/notes/tags, used from Home bottom pane |
| Dev hybrid search | `SearchDevPanel.tsx` | **Real search** — hybrid lexical + embedding + category via `src/lib/search/*` |

**Goal of 05.2:** One **product library search** experience using the hybrid engine, discoverable from nav + keyboard + Home, with clear separation from list **filter**.

---

## Design decisions (locked)

| # | Decision |
|---|----------|
| 1 | **Library search** ≠ **list filter**. Rename list control to “Filter in list…” |
| 2 | Add **Search** under **Tools** in left nav (with Tab Commander, Settings) |
| 3 | **No third tab** in right panel (Inspector \| Ask only). Search lives in **middle workspace** |
| 4 | **No persistent top search bar** — entry via Tools, Cmd+K, Home hero |
| 5 | **Single search session** — one canonical state, not multiple search tabs per query |
| 6 | **Search history** — recent queries as chips inside Search UI + Cmd+K palette |
| 7 | **Inspector** follows **selected search result** (single-click), not only active item tab |
| 8 | **Ask tab** wires **“Current search results”** context (was placeholder in 05.1) |
| 9 | **Dev hub unchanged** — `SearchDevPanel` stays for score breakdown / R&D |
| 10 | Hybrid mode default; graceful fallback to lexical-only when no API key / no embeddings |

---

## Information architecture (after 05.2)

```text
Left Nav
├── ★ Home
├── ── Content ──
│   ├── Bookmarks    ← list pane has "Filter in list..." only
│   ├── Notes
│   └── Workspaces
└── ── Tools ──
    ├── Search         ← NEW — full-middle library search view
    ├── Tab Commander
    └── Settings

Middle workspace (when Tools → Search, or Cmd+K, or Home hero)
└── ProductSearchView
    ├── Query input + scope/filters
    ├── Recent searches (history)
    ├── Results list (hybrid)
    └── Discovery (related topics/tags — product styling)

Right panel (unchanged tabs)
├── Inspector  ← updates on selected search result OR active item tab
└── Ask        ← "Current search results" context wired
```

---

## How to open library search (all entry points → same surface)

### 1. Tools → Search (primary, mouse)

User on **Bookmarks** → clicks **Search** under Tools → middle becomes full-width search (no list pane), same as Home full-middle layout.

### 2. Cmd+K / Ctrl+K (primary, keyboard)

From **any** dashboard view → palette opens:

```text
┌─────────────────────────────────────┐
│  Search library...                  │
│  ─────────────────────────────────  │
│  Recent: react hooks                │
│          embedding models           │
│  ─────────────────────────────────  │
│  Go to Home                         │
│  Go to Bookmarks                    │
└─────────────────────────────────────┘
```

- Type query + Enter → navigate to Search view, run hybrid search, append to history  
- Optional: quick nav items (Home, Bookmarks) — nice-to-have, not required for 05.2 MVP

### 3. Home hero (already exists — migrate behavior)

Home hero submit → **navigate to Search view** with query (replace current behavior that opens `search-home` tab in Home bottom pane).

**Migration note:** After 05.2, Home hero should call shared `openLibrarySearch(query)` instead of `openSearchTab` in `HomeView.tsx`. Home bottom pane may still show item tabs from Recently Added; search no longer opens there.

---

## Filter vs library search (rename + behavior)

| | **Filter in list** | **Library search** |
|--|---------------------|-------------------|
| **Location** | Left list pane (Bookmarks/Notes/Workspaces) | Tools → Search view |
| **Scope** | Current view + project/collection scope | Whole library (optional filters) |
| **Engine** | Substring match on loaded items | `runAppHybridSearchWithRelated` |
| **UI label** | Placeholder: `Filter in list...` | `Search your library...` |
| **Component** | Existing `SearchBar` in `MainContent` | New `ProductSearchView` |

**Files to update placeholders** (grep for `Search bookmarks`, `Search notes`, `⌘K Search`):
- `MainContent.tsx` — Bookmarks, Notes, Workspaces list headers
- `SearchBar.tsx` — default placeholder should **not** imply library search; use `Filter in list...`

Do **not** remove filter functionality — only clarify labeling.

---

## Canonical search state

Introduce shared library search state at `DashboardLayout` level (or a small hook `useLibrarySearch`):

```typescript
export const LIBRARY_SEARCH_TAB_ID = 'product-search'; // canonical id if still used in global tabs

export interface LibrarySearchState {
  query: string;
  filters: SearchFilters;           // from src/lib/search/types
  mode: 'hybrid' | 'lexical-only';  // default hybrid
  loading: boolean;
  error: string | null;
  result: HybridSearchResultWithRelated | null;
  selectedItemId: string | null;    // for Inspector highlight
  recentQueries: string[];          // max 20, persisted
}
```

**Persistence:**
- `recentQueries` → `localStorage` key `workbench-search-history` (JSON array of strings)
- Active query/results: **session only** (do not persist full result set)

**Single session rule:**
- Running a new search **replaces** current results in the same Search view
- No second search tab per query
- History stores query strings only

**Shared opener:**

```typescript
function openLibrarySearch(query?: string) {
  setActiveView('search');
  if (query?.trim()) {
    void runSearch(query.trim());
  }
}
```

Wire from: LeftSidebar Search click, Cmd+K, Home hero, optional “Search library” links later.

---

## Product search UI (`ProductSearchView`)

New component (name flexible: `ProductSearchView.tsx` or evolve `SearchTab.tsx` into product version).

### Layout

```text
ProductSearchView (full middle, scrollable)
├── Header row
│   ├── Search input (large, autofocus on navigate)
│   └── [Search] button (or Enter)
├── Scope / filters row (collapsible on narrow width)
│   ├── Collection filter (dropdown, optional)
│   ├── Domain filter (text or dropdown from results)
│   └── Mode toggle: Hybrid | Text only (optional, subtle)
├── Recent searches (when query empty OR collapsed section)
│   └── chips: click → rerun query
├── Results area
│   ├── Loading / error / empty states
│   ├── Result cards (see below)
│   └── Result count + timing (optional, subtle)
└── Discovery section (when results exist)
    ├── Related topics (chips from result.related)
    └── Related tags (chips)
    └── Reuse/adapt SearchDiscoveryBlocks — hide dev score bars
```

### Result card (product — not dev)

Each result from `HybridSearchResult.results` (`SearchResult` type):

| Show | Hide (dev-only) |
|------|------------------|
| Title (link/button) | Lexical/embedding/category score bars |
| Domain | Raw `ScoreBreakdown` numbers |
| Snippet: summary or notes excerpt | EmbedBackfillBlock |
| AI category chips (if any) | Index stats line |
| Optional: match reason one-liner (“title match”, “similar topic”) | |

**Interactions:**

| Action | Behavior |
|--------|----------|
| Single click result | Set `selectedItemId` → Inspector updates |
| Double click / Enter on focused row | Open item in global tab (`handleOpenItemTab`) |
| Cmd+Enter | Open URL in browser (if bookmark) |
| Click related topic chip | Set query to topic, rerun search |

### Search engine integration

Use existing app APIs from `src/lib/search/index.ts`:

```typescript
import {
  runAppHybridSearchWithRelated,
  runAppFindSimilar,
  loadSearchIndexFromDb,
  searchIndexStats,
  type HybridSearchResultWithRelated,
  type SearchFilters,
} from '../../lib/search';
```

**Primary call** (mirror `SearchDevPanel.runSearchWithQuery`):

```typescript
const result = await runAppHybridSearchWithRelated({
  query: trimmed,
  mode: 'hybrid',           // or 'lexical-only' if user toggles / no API key
  limit: 30,
  filters: { collectionId, domain, ... },
});
```

**Reference implementation:** `src/components/dashboard/SearchDevPanel.tsx` lines 72–95  
**Reuse for discovery UI:** `src/components/dashboard/SearchDiscoveryBlocks.tsx` (`InlineSimilarPanel`, `SearchRelatedPanel`) — restyle for product tokens (`--text-sm` not `--dev-fs-*`).

**Empty / degraded states:**

| Condition | UX |
|-----------|-----|
| No query | Show recent searches + hint text |
| No results | “No matches. Try different words or clear filters.” |
| No API key | Hybrid still runs lexical + category; embedding leg skipped automatically in `runAppHybridSearchWithRelated` |
| Index empty | “No searchable bookmarks yet.” |
| Search error | StatusBar or inline error + toast |

---

## Navigation changes

### 1. Extend `DashboardView`

```typescript
export type DashboardView =
  | 'home'
  | 'search'      // NEW
  | 'settings'
  | ...
```

### 2. `LeftSidebar.tsx`

Add under **Tools** section (before or after Tab Commander — prefer **first** in Tools):

```typescript
{ icon: Search, label: 'Search', id: 'search' }
```

Click → `onSelectView('search')`.

### 3. `DashboardLayout.tsx`

- Add `'search'` to `FULL_MIDDLE_VIEWS` (same layout bucket as `'home'` — full middle, no list pane, right panel visible)
- Hold `librarySearchState` + `openLibrarySearch` / `runLibrarySearch`
- Pass to `MainContent` and wire Cmd+K listener at layout level
- Extend `inspectorItem` resolution:

```typescript
const inspectorItem = useMemo(() => {
  // Priority: selected search result > active global item tab
  if (librarySearchState.selectedItemId) {
    return items.find(i => i.id === librarySearchState.selectedItemId) ?? null;
  }
  const activeGlobalTab = globalTabState.tabs.find(t => t.id === globalTabState.activeTabId);
  if (activeGlobalTab?.kind === 'item') {
    return items.find(i => i.id === activeGlobalTab.itemId) ?? null;
  }
  return null;
}, [...]);
```

When user opens an item tab from search, both can align (same item).

### 4. `MainContent.tsx`

Route `activeView === 'search'` → render `ProductSearchView` with library search state + callbacks.

---

## Cmd+K command palette

New component: `CommandPalette.tsx` (modal overlay).

**MVP scope:**

| Feature | Required |
|---------|----------|
| Open on Cmd+K / Ctrl+K | Yes |
| Input focused, ESC closes | Yes |
| Enter with text → `openLibrarySearch(text)` | Yes |
| Show recent queries (from history) | Yes |
| Click recent → run search | Yes |
| Navigate to Home / Bookmarks | Optional |

**Implementation notes:**
- Attach `keydown` listener on `DashboardLayout` (not side panel — dashboard only)
- Prevent default browser behavior when palette open
- z-index above shell, below nothing critical
- Style: centered modal, matches `--bg-panel`, compact

**Do not** implement full Raycast-style command registry in 05.2 — search-first palette is enough.

---

## Home hero migration

**Shipped behavior:** Home hero calls `onLibrarySearchInTab` → opens **`product-search` tab** in Home bottom pane (shared hybrid UI), stays on Home.

**Tools → Search** remains full-page. **Open in tab** on Search page moves session to Home tab strip.

~~**Target:** Call prop `onLibrarySearch` from `DashboardLayout` → `openLibrarySearch(query)`.~~ (superseded by tab-first Home entry)

---

## Global tab system — search tab cleanup

**Current:** `GlobalTabSystem` renders legacy `SearchTab` for `kind === 'search'`.

**05.2 options (pick one — recommend A):**

| Option | Action |
|--------|--------|
| **A (recommended)** | Remove `kind: 'search'` from global tabs. All library search goes through `activeView: 'search'`. Migrate any persisted `search` tabs out of `loadGlobalTabState` (filter on load). |
| B | Keep global search tab but render `ProductSearchView` embedded and normalize id to `product-search` |

Recommend **A** for one mental model. If persisted tabs contain old search tabs, strip them in `loadGlobalTabState` or on first load.

---

## Ask tab — wire “Current search results”

**File:** `src/components/dashboard/AskTab.tsx`

**Current:** `current-search` context shows error “not fully wired yet.”

**05.2:** Pass search context into `AskTab`:

```typescript
interface AskTabProps {
  ...
  searchContext?: {
    query: string;
    resultItemIds: string[];  // top N from last search
    items: Item[];            // or pass from parent
  } | null;
}
```

**Grounding:** Reuse `buildBookmarkGroundingPrompt` from `src/lib/ai/bookmarkContext.ts` with items resolved from `resultItemIds` (cap at 20, same as Bookmarks Ask AI in `MainContent.tsx`).

Remove blocking error for `current-search` when `searchContext` has results.

---

## Inspector — search selection

**File:** `src/components/dashboard/InspectorTab.tsx`

When item comes from search selection, Inspector behavior is the same as item tab (already shows title, URL, metadata placeholder).

Optional 05.2 polish: subtle label “From search results” when `selectedItemId` matches search selection — not required.

---

## Files to create

| File | Purpose | Est. lines |
|------|---------|------------|
| `src/components/dashboard/ProductSearchView.tsx` | Full library search UI (query, filters, results, history, discovery) | ~250–350 |
| `src/components/dashboard/CommandPalette.tsx` | Cmd+K overlay | ~120–180 |
| `src/hooks/useLibrarySearch.ts` (optional) | State + history + runSearch logic | ~100–150 |

## Files to modify

| File | Changes |
|------|---------|
| `src/components/dashboard/layout/DashboardLayout.tsx` | `'search'` view; library search state; Cmd+K listener; `openLibrarySearch`; inspector priority; pass props |
| `src/components/dashboard/layout/LeftSidebar.tsx` | Search under Tools |
| `src/components/dashboard/layout/MainContent.tsx` | Route `'search'`; filter placeholders; pass `onLibrarySearch` to HomeView |
| `src/components/dashboard/HomeView.tsx` | Hero → `onLibrarySearch` instead of local search tab |
| `src/components/dashboard/GlobalTabSystem.tsx` | Remove or deprecate legacy `SearchTab` rendering; strip old search tabs on load |
| `src/components/dashboard/SearchBar.tsx` | Default placeholder `Filter in list...` |
| `src/components/dashboard/AskTab.tsx` | Wire `current-search` context |
| `src/components/dashboard/layout/RightPanel.tsx` | Pass `searchContext` to AskTab |
| `src/components/dashboard/SearchDiscoveryBlocks.tsx` | Optional: product variant props (hide scores) |

## Files NOT to modify

| File | Reason |
|------|--------|
| `SearchDevPanel.tsx` | Dev-only; stays as R&D surface |
| `src/lib/search/*` | Backend sufficient for 05.2 |
| `SidePanelView.tsx` | Out of scope |
| `PipelineDevView.tsx` | Out of scope |

---

## Implementation order (recommended)

1. **`useLibrarySearch` / state in DashboardLayout** — history persist, `runSearch`, `openLibrarySearch`
2. **`ProductSearchView`** — UI + hybrid engine (no nav yet; test via temporary route)
3. **Nav: `'search'` view + LeftSidebar Tools item + MainContent route**
4. **Inspector priority** — selected search result
5. **Home hero migration** — `onLibrarySearch`
6. **`CommandPalette` + Cmd+K**
7. **Ask tab search context**
8. **Filter rename** — placeholders in MainContent / SearchBar
9. **GlobalTabSystem cleanup** — remove legacy search tab path
10. **Smoke test** all entry points + Bookmarks filter unchanged

---

## Acceptance criteria

### Navigation & entry points
- [x] **Search** appears under **Tools** in left nav
- [x] Clicking Search shows full-middle search view (no list pane)
- [x] **Cmd+K** opens command palette from Bookmarks, Notes, Home, Settings (dashboard)
- [x] Entering query in palette navigates to Search and runs hybrid search
- [x] Home hero search opens **search in Home main tab** (not full Search view) — *refined after initial spec*
- [x] Search tool page has **Open in tab** → Home tab strip
- [x] List pane control labeled **Filter in list...** (Bookmarks, Notes, Workspaces)

### Search functionality
- [x] Hybrid search uses `runAppHybridSearchWithRelated`
- [x] Results show title, domain, snippet/summary where available
- [x] Dev score breakdowns **not** shown in product UI
- [x] Related topics/tags section appears when data exists
- [x] Recent queries persist across reload (localStorage)
- [x] Clicking recent query reruns search (Inspector + Cmd+K; main pane points to Inspector)
- [x] Empty query shows helpful empty state
- [x] Lexical-only fallback works without API key (no crash)

### Results interaction
- [x] Single click result → Inspector shows that item
- [x] Enter/double-click result → opens item tab via `handleOpenItemTab`
- [x] New search replaces results (single session, no tab spam)
- [ ] **Result open/selection feels inconsistent** across entry points — defer polish (see Known gaps)

### Ask + Inspector
- [x] Ask tab **Current search results** works when search has results
- [x] Inspector shows selected search result metadata
- [x] Inspector shows **Recent searches** when on Search page or search tab — *added post-ship*

### Compatibility
- [x] List filter still narrows Bookmarks/Notes/Workspaces in place
- [x] Existing item tabs, workspace tabs, Tab Commander, Settings unchanged
- [x] `SearchDevPanel` in dev hub unchanged
- [x] Side panel unchanged
- [x] `npm run build` passes

### Edge cases
- [x] Zero bookmarks → search empty state, no errors
- [x] Very long query → truncated display, search still runs
- [x] Search while loading → disable double-submit / show loading indicator
- [x] Switching nav away from Search and back → results preserved for session
- [x] Tab navigator scrolls to active tab when search (or other) tab opens — *fixed post-ship*

---

## Out of scope (05.2)

- Saved search tabs / pinned searches
- Search tab inside right panel (Inspector \| Ask \| Search)
- Persistent top search bar
- Formal weight tuning (`04-defer-*`)
- StatusBadge on result cards (05.3)
- Processing status filters (05.3)
- Side panel search entry
- Replacing `MainContent` Bookmarks “Ask AI from scope” bar (separate feature)

---

## Design spec references

| Topic | Spec section |
|-------|--------------|
| Search tab behavior (single reusable) | V2-PRODUCT-DESIGN-SPEC §7 |
| No top search bar | V2-PRODUCT-DESIGN-SPEC §2, §16 decision #1 |
| Inspector + Ask (no search tab in right panel) | §4, §5, §6 |
| Filter vs search mental model | §7, W5 workflow matrix §13 |
| Search history in Search UI | §7 |
| Product vs dev (`SearchDevPanel`) | §14 |

## Related docs

| Doc | Use |
|-----|-----|
| [TASK-04-search-foundation-v1.5.md](TASK-04-search-foundation-v1.5.md) | Hybrid search engine, CLI eval |
| [TASK-05.1-home-right-panel.md](TASK-05.1-home-right-panel.md) | Shell, GlobalTabSystem, Inspector/Ask baseline |
| [CLI_WORKFLOW.md](../CLI_WORKFLOW.md) | Search CLI for debugging corpus |

---

---

## Known gaps (defer — not blocking 05.2 close)

| Gap | Notes |
|-----|--------|
| **Result open/selection inconsistency** | Opening a search result (single-click → Inspector vs double-click/Enter → item tab) can feel unpredictable depending on entry point (Home tab vs Tools Search page), focus state, and whether a global item tab is already active. Track as **D-41**; unify in 05.2.x / 05.7 pass. |
| Inspector enrichment / StatusBadge on results | **Shipped in 05.3** (read-only data). **Presentation** still rough → **D-40**. |
| Cmd+K quick-nav (Home, Bookmarks) | Nice-to-have, optional |

---

## Task 05.2 return

- **Workflow covered:** W5 (+ W1 find/open slice)
- **Shipped:**
  - Product library search (`ProductSearchView` + `useLibrarySearch`) with hybrid engine
  - Entry: Tools → Search (full page), Cmd+K → Search page, Home hero → **tab**, Search page → **Open in tab**
  - Single canonical search session + persisted history (`workbench-search-history`)
  - Inspector: selected result priority + **Recent searches** in search context
  - Ask: **Current search results** context wired
  - List filter renamed to **Filter in list...**
  - Legacy substring `SearchTab` removed from global tabs; `product-search` tab uses hybrid UI
  - Tab strip scrolls/pins active tab when overflow
- **Entry points tested:** Tools / Cmd+K / Home hero (tab) / Open in tab / Filter unchanged / build passes
- **Files created:** `useLibrarySearch.ts`, `ProductSearchView.tsx`, `CommandPalette.tsx`
- **Files modified:** `DashboardLayout`, `MainContent`, `HomeView`, `LeftSidebar`, `GlobalTabSystem`, `InspectorTab`, `RightPanel`, `AskTab`, `SearchBar`, `SearchDiscoveryBlocks`
- **Dev UI impact:** unchanged (`SearchDevPanel` untouched)
- **Known gaps / follow-ups:**
  - Result open/selection consistency → **D-41**
  - AI badges, digest stats, enrichment layout → **D-40** (05.3 shipped data; polish later)

---

*Last updated: 2026-05-27 — Shipped; one acceptance item deferred (result open consistency).*
