# V2 Product Design Spec

**Status:** Locked — 2026-05-26 brainstorm session complete
**Source:** TASK-05.0 brainstorming session (Cursor + DeepSeek + Gemini + Claude)
**Backlog linkage:** `docs/backlog.md` → V2 — Product (V2-A)
**Depends on:** V1 closed (Tasks 01–04)
**Does not depend on:** chunk RAG, ANN, concept DAG (→ V3)

---

## Design North Star

> **Clean, focused UI for everyday use — with power available when you need it, not on every screen.**

| Layer | Audience | Role |
|-------|----------|------|
| **Product UI** | Normal / daily use | Browse, search, read enrichment, light actions, clear status |
| **Dev / Debug UI** | Power users, R&D | Queues, raw scores, batch runners, taxonomy trees — **keep in parallel for V2**; later gate behind **Advanced** or **Developer mode** |

Do **not** delete dev surfaces during V2-A. Dev hub stays as-is for testing/debugging — updates after V2 stabilizes.

---

## 1. Information Architecture (IA Map)

```text
App Shell
├── Left Nav (collapsible 200px ↔ 48px)
│   ├── ★ Home (NEW — default landing)
│   ├── ── Content ──
│   │   ├── Bookmarks (list pane + item tabs)
│   │   ├── Notes (list pane + item tabs)
│   │   └── Workspaces (list + workspace tabs)
│   └── ── Tools ──
│       ├── Tab Commander (full-page)
│       └── Settings (full-page)
│
├── Middle Workspace
│   ├── Tab Strip (drag-and-drop reorder)
│   │   ├── Item tabs (bookmark / note detail)
│   │   ├── Workspace tabs
│   │   ├── List / Common tabs (aggregate views)
│   │   └── Search tab (single reusable, ID: product-search)
│   └── Tab Content
│       ├── Home View (hero search + cards)
│       ├── Item Detail (title, URL, notes, AI summary, key points)
│       ├── Workspace links
│       └── Search Results (hybrid, filters, discovery)
│
├── Right Panel (minimizable 280px, tabbed)
│   ├── Inspector tab
│   │   ├── Processing status badges
│   │   ├── AI summary + key points
│   │   ├── AI categories (accept / reject / change)
│   │   ├── Similar items
│   │   ├── Related links / topics
│   │   └── Metadata
│   └── Ask tab
│       ├── Context selector (current item / collection / search results / library)
│       ├── Prompt textarea
│       ├── Answer with citations [B1], [B2]
│       └── Source chips
│
└── Status Bar (persistent, dismissible)
    └── Pipeline issues, API key warnings, classification failures

// No persistent top search bar — search lives in Home (hero) and Cmd+K (command palette)
```

---

## 2. Shell Architecture

```
┌──────────┬─────────────────────────────────┬──────────┐
│ Left Nav │  Middle Workspace               │ Right    │
│          │                                 │ Panel    │
│ 200px    │  Tab Strip (drag reorder)       │ 280px    │
│ (coll.)  │ ┌─────────────────────────────┐ │          │
│          │ │                             │ │ Tabs:    │
│ ★ Home   │ │ Content area                │ │ Inspector│
│ ──────── │ │ max-width: 680px (reading)  │ │ / Ask    │
│ Bookmarks│ │                             │ │          │
│ Notes    │ │                             │ │ Minimiz- │
│ Wrkspcs  │ │                             │ │ able →   │
│ ──────── │ │                             │ │          │
│ Tab Cmdr │ └─────────────────────────────┘ │          │
│ Settings │ ┌─────────────────────────────┐ │          │
│          │ │ Status Bar (dismissible)    │ │          │
└──────────┴─────────────────────────────────┴──────────┘
```

**No persistent top search bar.** Search lives in:
- Home (hero input)
- `Cmd+K` / `Ctrl+K` command palette (everywhere else)
- Search tab in middle workspace (results)

### Middle Tab Types

| Tab Type | ID Pattern | Behavior |
|----------|-----------|----------|
| `bookmark` | item.id | Single bookmark detail |
| `note` | item.id | Single note detail |
| `workspace` | workspace.id | Workspace link list with bulk actions |
| `bookmark-list` | derived from scope | Aggregate bookmark list ("Open as tab") |
| `note-list` | derived from scope | Aggregate note list |
| `common-list` | `common-list` | Multi-scope combined view with sections |
| `search` | `product-search` | **Single reusable search tab.** Home and Cmd+K search activate this tab, update query/results, preserve all other open tabs. Remembers last query, filters, scroll position |

---

## 3. Home View (new — replaces Bookmarks as default landing)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Workbench                                          X bookmarks  │
│                                                                  │
│       ┌────────────────────────────────────────────────────┐     │
│       │  🔍  Search your library...                         │     │
│       └────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌───────────────┐ ┌───────────────┐ ┌──────────────────────┐   │
│  │ ⭐ Favorites  │ │ 🆕 Recently   │ │ ⚡ Processing        │   │
│  │               │ │    Added      │ │                      │   │
│  │ item 1        │ │ item 1        │ │ 3 items need         │   │
│  │ item 2        │ │ item 2        │ │   category review    │   │
│  │               │ │               │ │ 2 enrichment failed  │   │
│  │ [View all →]  │ │ [View all →]  │ │                      │   │
│  └───────────────┘ └───────────────┘ │ [Review →]           │   │
│                                      └──────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📊 Library Overview                                      │   │
│  │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │   │
│  │ │  Tech  │ │ Design │ │   AI   │ │  Biz   │ │  Misc  │  │   │
│  │ │   42   │ │   18   │ │   31   │ │   12   │ │    7   │  │   │
│  │ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Home Cards (detailed)

**Favorites Card**
- Shows pinned/favorite items (limited to 5–10)
- Empty state: "Pin items to see them here. Right-click any item → Pin."
- Click item → opens item tab
- "View all" → opens aggregate list tab of all favorites

**Recently Added Card**
- Shows last N items across all projects (newest first)
- Empty state: "Add your first bookmark or note to get started."
- Same click behavior as list pane items

**Processing Digest Card** (soft, dismissible)
- Aggregate pipeline status (not raw queue counts):
  - "X items need category review"
  - "Y enrichment attempts failed"
  - "Z items recently processed"
- Each line is actionable: click to open filtered list
- Soft card — dismissible. Not a hero element. Pipeline trust builds over time.
- If everything is processed and healthy → card hides entirely (empty state = no card)

**Library Overview Card**
- AI category tiles: top N categories with item counts
- Click a tile → opens filtered list for that category
- Empty state: "No categories yet. Import and classify some bookmarks to see an overview."

---

## 4. Right Panel — Inspector Tab

Context follows the active item or selected search result:

```
Inspector Tab
├── Header: "Details" or item title (truncated)
│
├── Processing Status (horizontal badges)
│   Not processed · Processing · ✓ Ready · ⚠ Needs review · ✗ Failed
│
├── AI Summary (expandable, collapsible)
│   └── 2-3 sentence summary from enrichment
│
├── Key Points (bullet list, collapsible)
│   └── 3-5 key takeaways
│
├── Categories (collapsible section)
│   ├── Accepted: [badge] Tech / ML / NLP
│   ├── Suggested: [badge] Data Science (82%)
│   ├── Action rows per suggestion:
│   │   [Accept ✓] [Reject ✗] [Change...]
│   └── Empty state: "Not yet classified. Run pipeline?"
│
├── Similar Items (3-5, collapsible section)
│   └── Compact item cards, click to open
│
├── Related Links / Topics (collapsible section)
│   └── Topic chips + discovered links
│
└── Metadata (collapsible section)
    ├── Added: date
    ├── Source: tab / import / manual
    ├── URL: normalized (readonly, link to original)
    └── Collections: badges
```

### Inspector States

| State | Behavior |
|-------|----------|
| **Active item selected** | Shows all sections populated for that item |
| **Search result selected** | Shows enrichment preview + categories (same as item) |
| **No context** (no item, no selection) | Shows: "Select an item or search result to see details." |
| **Item not enriched** | Status "Not processed." AI sections hidden or empty. "Run enrichment?" CTA. |
| **Item enriching** | Status "Processing..." with spinner. |

---

## 5. Right Panel — Ask Tab

Context-aware chat grounded in the active scope:

```
Ask Tab
├── Context selector (dropdown)
│   ├── Current item (default if item tab active)
│   ├── Current collection
│   ├── Current search results
│   └── Whole library
│
├── Prompt textarea (grows with content, min 2 lines)
│   └── Placeholder: "Ask about this item..." or "Ask about your library..."
│
├── [Ask] button
│   └── Disabled/in-progress state with spinner
│
├── Answer area (scrollable, takes remaining space)
│   ├── Markdown-formatted answer
│   ├── Inline citations: [B1], [B2]
│   └── Source chips at bottom (clickable → open item tab)
│
└── Error states:
    ├── No AI key → "Configure AI in Settings."
    ├── Timeout → "Request timed out. Try a shorter prompt."
    └── API error → message from provider
```

### Context Grounding (how grounding works)

| Context | Grounded on |
|---------|-------------|
| Current item | Item title + URL + AI summary + notes |
| Current collection | Titles + summaries of items in scope |
| Current search results | Titles + snippets of search results |
| Whole library | Broad prompt, no specific grounding (future: category summary) |

The grounding prompt assembly reuses `buildBookmarkGroundingPrompt` from `src/lib/ai/bookmarkContext.ts`. Citations are formatted as `[B1] Title (URL)` with a source chip list below the answer.

---

## 6. Right Panel — Minimize Behavior

| State | Behavior |
|-------|----------|
| **Normal** | Visible, 280px, tabbed (Inspector / Ask) |
| **Minimized** | Collapses to ~8px thin strip with a vertical handle. Hover or click to expand. Smooth CSS slide transition (~200ms ease). |
| **No context** | Inspector shows: "Select an item or search result to see details." Ask shows: "Select context to begin." |

Toggle in the panel header: `◀▶` icon button.

---

## 7. Search Tab (single reusable)

```
Search Tab (ID: product-search, type: search)
├── Search input (active query, focused on tab activation)
├── Scope chip: All library / Current project / Current collection
├── Filter row (collapsible):
│   ├── Type: Bookmarks / Notes / Workspaces
│   ├── AI category dropdown
│   ├── Domain filter
│   ├── Processing status multi-select
│   └── Date range
├── Results list (hybrid: lexical + embedding + category expansion)
│   ├── Result card with title + URL + snippet + AI summary preview + status badge
│   ├── Single click → select result, update right Inspector
│   ├── Double click / Enter → open as item tab
│   └── Cmd+Enter → open URL in browser
├── Discovery section (when query has results):
│   ├── Related topics / tags (chips)
│   └── Similar items (compact list)
└── Recent searches (when query is empty, below input):
    └── Clickable chips: "react state management", "embedding models", ...
```

### Search Tab Behavior

| Action | Result |
|--------|--------|
| Search from Home | Activate existing Search tab or create one. Set query. Run search. |
| `Cmd+K` search | Same as above. |
| Search tab already open | Update query, rerun search. Don't create duplicate tab. |
| Close Search tab | Tab removed. Next search recreates it with fresh state. |
| Switch away then back | Query, results, filters, scroll position preserved. |
| Click result item | Opens new item tab. Search tab stays open with results intact. |
| Hit Enter after typing | Replaces current search (don't accumulate tabs). |

### Search Engine

Lifts hybrid search from `src/lib/search/` (dev `SearchDevPanel` engine):
- Lexical (text match)
- Doc embedding (semantic similarity)
- Category expansion (related categories)
- Explainable blended rerank with score breakdown

Dev-only features (score breakdown UI, eval data) stay in `SearchDevPanel`.

---

## 8. Processing Status Language

Product-facing statuses, consistent across all surfaces:

| Status | Label | Icon | Meaning | Display priority |
|--------|-------|------|---------|-----------------|
| `not_processed` | Not processed | ○ | No enrichment or classification yet | Low (default) |
| `processing` | Processing | ◌ | Enrichment or classify in flight | Medium |
| `ready` | Ready | ✓ | Enriched + classified, all good | Low (success) |
| `needs_review` | Needs review | ⚠ | AI flagged it for human check | High |
| `failed` | Failed | ✗ | Fetch, extract, or classify failed | High |

### Where Status Appears

| Surface | Format |
|---------|--------|
| Item card in list pane | Small colored dot + brief label |
| Item tab header | StatusBadge next to item title |
| Inspector tab | Full status row with explanations |
| Home Digest card | Aggregated count per status |
| Search results | Badge on result card |
| Batch import results | Summary by status in completion toast |

---

## 9. Adaptive Layout (Smaller Screens)

Target: comfortable reading on 14" MacBook Pro (viewport ~1512×982, typical window ~1200–1400px).

### Region Sizing

| Region | Sizing | Behavior |
|--------|--------|----------|
| Left nav | 200px default, collapses to 48px | Icon-only mode toggleable. Consider auto-collapse on < 1000px window |
| List pane | `clamp(220px, 22%, 320px)` | Adapts to window width. Never eats more than 320px |
| Right panel | 280px, minimizable to 0 | Encourage closing when reading long content |
| Middle content | Remaining space | Reading content capped at `max-width: 680px` with `margin: 0 auto` |
| Item detail text | `max-width: 680px`, `line-height: 1.6` | Comfortable line length for reading |

### Responsive Targets

| Width | Mode | Behavior |
|-------|------|----------|
| < 500px | Side panel | Existing save-only UI. No changes in V2-A. |
| 500–900px | Compact dashboard | Left nav collapses to icons. Right panel overlays or auto-minimizes. |
| ≥ 900px | Full dashboard | All three regions visible. User controls minimize/collapse. |

**No extra breakpoints to maintain.** Simple, practical, aligned with actual Chrome extension usage.

---

## 10. Font Scaling System

### User Preference (Settings > Appearance)

| Preset | CSS Scale | Base text size | Notes text size |
|--------|-----------|---------------|-----------------|
| Small | `0.9` | ~13.5px | ~13px |
| Normal | `1.0` | ~15px | ~14.5px |
| Large | `1.15` | ~17.2px | ~16.6px |

### Implementation

CSS custom property `--font-scale` on `:root`, applied to all text sizes:

```css
:root {
  --font-scale: 1; /* set by JS from user preference */
  
  --text-xs:  calc(0.75rem  * var(--font-scale));
  --text-sm:  calc(0.875rem * var(--font-scale));
  --text-base: calc(0.9375rem * var(--font-scale));
  --text-lg:  calc(1.0625rem * var(--font-scale));
  --text-xl:  calc(1.1875rem * var(--font-scale));
}
```

### Reading Content

Notes, AI summaries, and long-form text use separate tokens for comfortable reading:

```css
--font-reading: var(--font-sans);
--reading-size: 1rem;
--reading-leading: 1.6;
```

Persisted to `localStorage` alongside theme preference. Accessible from Settings > Appearance.

---

## 11. Error & Status Communication System

Three-tier system replacing scattered `console.error` and ad-hoc inline messages.

### Tier 1: StatusBadge (component-level, inline)

```
✓ Ready   ⚠ Needs review   ✗ Failed   i 3 pending
```

```tsx
<StatusBadge variant="success">Enrichment complete</StatusBadge>
<StatusBadge variant="warning">Processing took longer</StatusBadge>
<StatusBadge variant="error">Fetch failed: timeout</StatusBadge>
<StatusBadge variant="info">3 items need review</StatusBadge>
```

**Used on:** item cards, item detail, Inspector, Home Digest card, Import Studio, search results.

### Tier 2: Status Bar (app-level, persistent, dismissible)

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠️ AI API key is invalid. Check Settings.          [Dismiss]   │
│ ⚡ 5 items failed classification.                   [Review →]  │
└────────────────────────────────────────────────────────────────┘
```

- **Position:** Thin strip below tab strip, above content area, spans full middle workspace width
- **Max 3 concurrent messages**, stacked vertically
- **Each message:** icon + message text + optional action button + dismiss (X)
- **Auto-resolve:** remove when underlying issue is fixed (e.g., key updated in Settings)
- **Never blocks UI** — sits above content, not overlaying it
- **Source:** pipeline errors, API issues, backup conflicts, import failures

### Tier 3: Toast (transient, bottom-right)

```
┌──────────────────────────────────┐
│ ✓ Bookmark saved to Tech / ML   │
└──────────────────────────────────┘   (auto-dismiss 3s)
```

- **Position:** Bottom-right corner of middle workspace (or viewport, for full-page views)
- **Types:**
  - `success` — green, auto-dismiss 3s
  - `error` — red, persistent (requires dismiss or action)
  - `info` — neutral, auto-dismiss 3s
- **Actions:** optional "Undo" on destructive operations, "View" to open result
- **Queue:** multiple toasts stack vertically. Max 5 visible.

---

## 12. Animation & Motion Policy

| Element | Animation | Reason |
|---------|-----------|--------|
| Right panel minimize/expand | CSS slide ~200ms ease | Visualize state change |
| Theme toggle | Smooth color transition (~300ms) | Avoid jarring flash |
| Tab drag-and-drop | Existing HTML5 DnD | Already shipped, works |
| Modal open/close | Fade + scale ~150ms | Standard pattern |
| Status bar show/hide | Slide down/up ~200ms | Draws attention without blocking |
| Toast enter/exit | Fade + slide ~250ms | Gentle notification |
| Content (lists, cards, search results) | **No animation** | Power users want snap, not motion delay |
| Item tab open | **No animation** | Should feel instant |
| Scope change / filter | **No animation** | Should feel instant |

**No animation libraries.** CSS transitions only. Keep the extension lightweight.

---

## 13. Workflow Matrix

### W1 — Daily Library Use

| Element | Detail |
|---------|--------|
| **Goal** | Browse enriched corpus: see AI summaries, categories, search, filter, open items, add notes |
| **Happy path** | Home → click category → browse list → open item → read summary + notes → Ask AI about it |
| **What exists** | List pane + item tabs with title/URL/notes. Scope filtering by project/collection. |
| **V2 adds** | Home as entry point. Item tab shows AI summary + key points. Right Inspector shows categories + similar items. Processing status badges on item cards. |
| **Edge cases** | No items in scope → empty state with CTA. No enriched items → prompt to run pipeline. |

### W2 — Single-link Digest

| Element | Detail |
|---------|--------|
| **Goal** | Save one URL → optional digest pipeline with visible progress |
| **Happy path** | Side panel save → enrichment runs → status badge updates → extract results in Inspector |
| **What exists** | Side panel save with project/collection/dedup. |
| **V2 adds** | After save, pipeline runs automatically. Progress: status badge on item. Results in Inspector. Toast on completion/failure. |
| **Edge cases** | Fetch fails → item exists, marked "Failed" with retry. No AI keys → pipeline skipped, "Not processed." |

### W3 — Batch Import

| Element | Detail |
|---------|--------|
| **Goal** | Import preview → commit → post-import processing |
| **Happy path** | Import Studio → preview → commit → toast confirms → Home Digest shows pending items |
| **What exists** | Import Studio: preview + commit + dedup + bulkImportBookmarks. |
| **V2 adds** | Post-commit: option to auto-classify. Processing Digest card on Home reflects new batch. Import provenance for later. |
| **Edge cases** | Very large import → chunked progress. Import URL matches existing → merged (surface in toast). |

### W4 — Post-processing / Maintenance

| Element | Detail |
|---------|--------|
| **Goal** | Re-run AI operations on selected items or in batch |
| **Happy path** | Item detail → "Re-enrich" → status updates → results refresh |
| **What exists** | Dev hub queue views, reclassify buttons, embed backfill. |
| **V2 adds** | Per-item re-run actions in Inspector. Skip/idempotent rules surfaced (won't re-run unchanged items based on hash). |
| **Edge cases** | Item hasn't changed → skip with info message. Batch on large library → queued, Home Digest shows progress. |

### W5 — Search & Discovery

| Element | Detail |
|---------|--------|
| **Goal** | Hybrid search with filters, similar items, topic exploration |
| **Happy path** | Cmd+K / Home search → Search tab → results with AI snippets → filter → click → open in new tab |
| **What exists** | Dev `SearchDevPanel` (hybrid, scored, similar, related). Product `SearchTab` is substring-only. |
| **V2 adds** | Product Search tab lifts hybrid engine. Filters. Discovery layer: similar items, topics, related links. |
| **Edge cases** | No results → suggested filters, recent items. All unenriched → prompt to run pipeline or show raw. |

### W6 — User Signals

| Element | Detail |
|---------|--------|
| **Goal** | Accept/reject AI categories, provide feedback |
| **Happy path** | Open item → Inspector shows categories → accept suggested, reject wrong |
| **What exists** | DB model supports accept/reject. No product UI. |
| **V2 adds** | Category accept/reject/change in Inspector. Review queue from Home Digest. |
| **Edge cases** | No categories → prompt to classify. All rejected → trigger rediscover. |

### W7 — Shell & Focus

| Element | Detail |
|---------|--------|
| **Goal** | Clean default UI with power under Inspector/Advanced. Avoid clutter. |
| **What exists** | IDE iteration 1 shell: left nav + list pane + item tabs + right assistant. |
| **V2 adds** | Home as default. Right panel tabbed and minimizable. Status bar. Command palette (Cmd+K). No top search bar. Content max-width. Adaptive layout. |
| **Deferred** | Virtual scope chips, out-of-scope tab badges, persisted split widths → Phase 2+. |

### W8 — Settings & Trust

| Element | Detail |
|---------|--------|
| **Goal** | AI keys, models, backup, privacy transparency, font preference |
| **What exists** | AI Settings (provider/model/key), backup config, import/export. |
| **V2 adds** | Font size preference. Appearance section. Pipeline budgets placeholder. Privacy transparency. |
| **Edge cases** | No AI key → pipeline skips, search falls back to lexical. Invalid key → Status Bar warning. |

---

## 14. Product vs Dev Map

| Feature | Product UI (V2-A) | Dev UI (kept as-is) |
|---------|-------------------|---------------------|
| Item browse | List pane + item tabs with AI summary | — |
| Enrichment status | Item badges + Inspector status + Home Digest | Queue filters in PipelineDevView |
| AI summary / key points | Item tab body (primary) + Inspector | Raw fetch body preview |
| Categories | Inspector (accept/reject/change) | Taxonomy tree, raw scores |
| Search | Product Search tab (single reusable) | SearchDevPanel (score breakdown UX) |
| Similar items / discovery | Inspector + Search tab discovery | — |
| Import | Import Studio (unchanged) | — |
| Dev hub access | Settings > Advanced (gate added later) | PipelineDevView, EmbedBackfillBlock, raw queue |
| Batch processing | Home Digest + per-item re-run actions | Batch runners |
| Ask AI | Right panel Ask tab (context-aware) | — |

**Dev hub for V2-A:** stays accessible from current location (Bookmarks toolbar → Enrichment dev hub). No changes. Later gated behind Settings > Advanced.

---

## 15. Implementation Subtask Order

| ID | Subtask | Workflows | Summary |
|----|---------|-----------|---------|
| **05.1** | Home View + Right Panel + Status System | W1, W7, W8 | Home as default landing (hero search + cards). Right panel tabbed (Inspector + Ask), minimizable. StatusBar + Toast + StatusBadge. Font scaling. Adaptive layout. |
| **05.2** | Product Search tab | W5 | Single reusable Search tab with hybrid engine, filters, discovery. Cmd+K palette. Replaces substring SearchTab. |
| **05.3** | Processing status + item enrichment display | W1, W4 | Status badges on item cards. AI summary + key points in item tab body. Inspector enrichment. Home Digest data. |
| **05.4** | Category review + user signals | W6 | Category accept/reject/change in Inspector. Review workflow from Home Digest. |
| **05.5** | Single-link digest UX | W2 | Side panel → pipeline trigger → progress → results. Toast on completion. |
| **05.6** | Import post-processing + batch maintenance | W3, W4 | Post-commit processing option. Batch re-run actions. Import provenance. |
| **05.7** | Shell polish (Phase 2) | W7 | Virtual scope chips, out-of-scope tab badges, persisted split widths, keyboard nav. |
| **05.8** | Advanced / Dev mode gate | W8 | Dev hub behind Settings > Advanced toggle. |

---

## 16. Decisions Made

| # | Decision |
|---|----------|
| 1 | No persistent top search bar. Search lives in Home (hero) + Cmd+K palette + reusable Search tab |
| 2 | Right panel is tabbed (Inspector / Ask), minimizable, context-aware |
| 3 | Home is the new default landing page, replacing Bookmarks as default view |
| 4 | AI summary + key points appear in item tab body (primary content), not just right panel |
| 5 | Single reusable Search tab (ID: `product-search`) — not per-query tabs |
| 6 | Three-tier error/status system: StatusBadge (inline), StatusBar (app-level), Toast (transient) |
| 7 | Font size preference: Small / Normal / Large, persisted, CSS custom property `--font-scale` |
| 8 | Two responsive targets: side panel (< 500px) and dashboard (≥ 900px). No extra breakpoints |
| 9 | Adaptive layout: clamp-based list pane, collapsible left nav, minimizable right panel, content max-width 680px |
| 10 | Animation: CSS transitions only. No animation libraries. Content snaps, panels slide |
| 11 | Dev hub stays as-is during V2-A; gated behind Advanced in future |
| 12 | Processing Digest on Home is soft/dismissible — pipeline trust builds over time |
| 13 | Search tab preserves state (query, filters, scroll) when switching away |
| 14 | Right panel Inspector follows active item or selected search result |
| 15 | Reading content uses comfortable leading (1.5–1.6) and capped width |

## 17. Decisions Deferred

| # | Item | Why |
|---|------|-----|
| 1 | Notes store vs URL-empty items | V2-B data model cleanup |
| 2 | Import→auto-enrich default behavior | Depends on pipeline reliability (V2-C) |
| 3 | Favorites/pins/trash | **No schema yet** — placeholders during V2-A; see [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md) D-01…D-03 |
| 4 | Side panel enrichment display | After main product shell is stable |
| 5 | Multiple saved-search tabs | V3 or later |
| 6 | Pinned/common tabs per project | V3 |
| 7 | Pipeline budgets (cost controls) | After V2-C backend refinement |

---

## 17b. V2-A execution focus (2026-05-27)

1. **UI-first** — wire existing `item_enrichment`, `ai_item_signals`, `ai_item_category_links` into product surfaces (05.3, 05.4).
2. **Placeholders OK** — Home Favorites, Pinned/Favorites utility tabs: “coming soon” until schema pass.
3. **No distraction** — skip new IndexedDB fields, import hooks, and batch runners until workflow read path is done.
4. **Tracker** — [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md) for backend/schema/pipeline items.

---

## 18. Non-goals for V2-A

- Persistent top search bar
- Favorites/pins/trash implementation (placeholders only)
- Concept DAG, chunk RAG, ANN, cloud embedder (→ V3)
- Rewriting dev hub internals (→ after V2 stable)
- Heavy animation library
- Side panel redesign (add indicators later)
- Full responsive spectrum (2 breakpoints only)
- Multi-device sync
- Advanced agentic features (web search, tool use, deep fetch)

---

## 19. Component Inventory for V2-A

### New Components to Create

| Component | File | Purpose |
|-----------|------|---------|
| `HomeView` (rewrite) | `src/components/dashboard/HomeView.tsx` | Replace stub Home with search-first + cards |
| `RightPanel` | `src/components/dashboard/layout/RightPanel.tsx` | Tabbed Inspector + Ask, minimizable, context-aware |
| `InspectorTab` | `src/components/dashboard/InspectorTab.tsx` | Item context inspector (status, summary, categories, similar) |
| `AskTab` | `src/components/dashboard/AskTab.tsx` | Grounded AI chat with context selector |
| `StatusBar` | `src/components/dashboard/StatusBar.tsx` | Persistent dismissible app-level messages |
| `ToastContainer` | `src/components/ToastContainer.tsx` | Toast queue manager, positioned bottom-right |
| `Toast` | `src/components/Toast.tsx` | Individual toast notification |
| `StatusBadge` | `src/components/StatusBadge.tsx` | Inline status indicator (shared component) |

### Existing Components to Modify

| Component | Changes |
|-----------|---------|
| `DashboardLayout.tsx` | Add RightPanel component (replace bare textarea right panel). Add StatusBar. Add ToastContainer. Integrate font scaling. Clamp list pane width. Add Home as default view. |
| `LeftSidebar.tsx` | Add Home nav item (★ icon), set as default active view on mount |
| `MainContent.tsx` | Route Home view. Pass inspector data flow (active item, processing status) |
| `global.css` | Font scaling `--font-scale` + `calc()`. Reading content styles. Right panel transition. Status bar styles. Toast animation. |
| `SettingsView.tsx` | Add Appearance section (font size preference) |

---

*Last updated: 2026-05-26 — 05.0 brainstorm complete. All 15 decisions locked. 7 decisions deferred. Implementation starts with 05.1.*