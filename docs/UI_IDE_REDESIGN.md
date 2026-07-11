# Homebase UI Redesign (IDE Shell)

This document defines the target interaction model for a polished, stable, IDE-style Homebase UI. The goal is to improve consistency and reduce context loss while preserving existing feature behavior and data workflows.

## 1) Goals

- Keep users oriented while switching between projects, bookmarks, notes, and workspaces.
- Eliminate page-level UI churn (main shell must stay stable).
- Move heavy item browsing into center workspace panes instead of left tree.
- Support power-user workflows (multiple open contexts, multi-selection scopes) without forcing complexity on new users.
- Keep regressions low by shipping in small functional slices.

## 2) Core Mental Model

Homebase uses a three-region shell:

- Left: navigation and scope selection.
- Middle: primary workspace (tabs + pane splits).
- Right: AI/inspector/support panel.

Main principle:

- Scope drives list content.
- Tabs drive active work.

Changing scope must not destroy open tabs or reset the workspace shell.

## 3) Information Architecture

### 3.1 Structural hierarchy (entity model)

- Workspace
  - Project
    - Collection
      - Items (bookmarks, notes, future item types)

### 3.2 Virtual scopes

Virtual nodes are first-class views, not physical entities:

- All Projects
- All Collections
- All Bookmarks
- All Notes

Virtual scopes enable cross-project workflows while preserving the structural tree model.

### 3.3 Tools vs content

Separate content hierarchy from utility tools:

- Content hierarchy: workspaces/projects/collections/items
- Utility tools: Tab Commander, Settings, Import Studio, diagnostics views

Tools can use custom center layouts, but should still live inside the same top-level shell.

## 4) Layout Contract

### 4.1 Left navigation panel (stable)

Left panel is for navigation, scope, and structure only.

- Show hierarchy nodes and high-level utility entries.
- Avoid rendering long item-level lists by default.
- Use grouped sections (for example: **Content**, **Tools**).
- Keep interaction lightweight: select/focus/open; not heavy content rendering.

### 4.2 Middle workspace (dynamic by module)

Middle area is the main execution canvas.

**Iteration 1 (implemented):**

- **Content modules** (Bookmarks, Notes, Workspaces): a **split layout** — left-middle **scoped list** (search, import, counts, “open as tab” / **add to common tab** where applicable); right-middle **item tabs only** (individual bookmark/note, workspace link-list tab, filtered aggregate list tab, or **common** multi-section tab). Tabs represent **items or workspace sessions**, not top-level modules; users **drag tabs** to reorder them.
- **Tool modules** (Tab Commander, Settings): **full-page** center region inside the same outer shell (no list/detail split).
- Changing **scope** (project/collection) updates the list pane; **open item tabs persist** unless closed by the user.

**Stretch / later:**

- Optional richer tab-local memory (divider width persistence, default split ratios).
- Optional module-level strip if product wants both “module” and “item” tabs—iteration 1 intentionally uses left nav for modules and tabs for items only.

### 4.3 Right panel (AI + inspector)

Right panel is an optional sidecar:

- context-aware AI assistant
- metadata and related entities
- quick actions and references

Right panel should be pinnable/collapsible and not block core workflows.

## 5) Interaction Rules

### 5.1 Navigation vs item tabs (iteration 1)

- **Left nav** selects the active module (Bookmarks, Notes, Workspaces, Tab Commander, Settings) and **scope** (project dropdown, collections when a project is selected).
- **Center-right tabs** are **item/workspace/list tabs** only: duplicate titles activate the existing tab where applicable (aggregate tabs encode scope in the tab id/title).
- Closing an active item tab should focus a sensible neighbor (nearest remaining tab).
- **Reorder**: users may **drag and drop** tabs along the strip to change order (native HTML5 drag-and-drop).

### 5.2 Scope vs open tabs

- Scope changes update list panes and filters.
- Open tabs remain available even if item is outside current scope.
- If a tab is out-of-scope, show subtle indicator and offer "Reveal in tree" / "Switch scope".

### 5.3 Multi-selection scopes

- Default mode: single selection.
- Advanced mode: ctrl/cmd multi-select (projects/collections).
- Always show explicit scope summary chips when multi-select is active.
- Provide one-click clear/reset scope.

### 5.4 Depth and density constraints

- Left tree depth should remain shallow by default.
- Do not auto-expand large item lists in left nav.
- Any list expected to exceed ~30 items belongs in middle list pane with search/filter/sort.

## 6) View-specific exceptions

Most modules should use shared content layout patterns. Exceptions are allowed for operational tools.

### 6.1 Tab Commander exception

Tab Commander uses a **full-page center layout** (operations console for windows/tabs), still inside the same left nav + right assistant shell.

- Visual styling aligns with shared theme tokens (`BottomPanel` / CSS variables); behavior remains the existing Tab Commander feature set.
- Right AI panel remains available like other views.

## 7) Visual and Component Standards

Based on `ui-design-brain` guidance:

- Strong shell consistency over decorative variation.
- Clear visual hierarchy with restrained accent usage.
- One primary action per local section.
- Predictable empty/loading/error states.
- Keyboard and focus-visible accessibility baseline.

Component-level expectations:

- Tabs: stable active state, compact labels, clear close affordance, **drag-and-drop reorder** for open item tabs.
- Navigation: grouped sections with concise labels.
- Lists: fast scan, clear selection state, non-jumpy row controls.
- Splits: draggable dividers, persisted widths/heights.

## 8) Rollout Plan (functional-first)

### Phase 1 — shipped (iteration 1)

- Stable three-region shell: left nav, middle workspace, right assistant.
- Left nav: **project dropdown** (All Projects or one project), **collections** for selected project, **Content** (Bookmarks, Notes, Workspaces) vs **Tools** (Tab Commander, Settings).
- Middle: **list + item-tab detail** for content modules; **full-page** for Tab Commander and Settings.
- Workspaces in Content: single tab shows workspace links with multi-select, open/bookmark/remove flows; detached workspaces visible without duplication when scoped to All Projects.
- **Aggregate lists**: “Open as tab” opens bookmark-list or note-list tabs with **scoped titles**; optional **list vs grid** layout toggle.
- **Common tab**: user can merge multiple “open as tab” scopes into one tab with **sections** per project/collection (each section is its own heading + links); supports the same list/grid toggle.
- **Item tab strip**: tabs reorder via **drag-and-drop** along the strip.

### Phase 2 — next

- Shared split primitives / resizer consistency across views.
- Virtual scope chips and clearer **out-of-scope** affordances for open tabs.
- Optional scope summary when multi-select or advanced filtering lands.

### Phase 3

- Right pane contract polish (pin/collapse/context), inspector patterns.

### Phase 4

- Decompose large containers (`MainContent`, layout files); keyboard navigation and persisted UI state.

## 9) Non-goals for this redesign pass

- Full data model redesign.
- Rewriting Tab Commander **internals** (multi-window logic, drag/drop)—behavior preserved; **styling** aligned with dashboard tokens.
- Rewriting all inline styles everywhere at once.

These can be addressed incrementally after shell and navigation contracts are stable.

## 10) Acceptance Criteria

- **Iteration 1:** Left nav stays compact; long lists live in the middle list pane.
- Switching projects/collections/modules does **not** clear open **item** tabs without explicit user action.
- Core flows (create/edit/delete/filter/import/Tab Commander) remain functional.
- Tab Commander and the rest of the dashboard share the same **theme tokens** and shell framing.

## 11) Implementation status — iteration 1 complete

**Shell**

- `DashboardLayout`: left sidebar + middle + right AI panel; middle is either **full-page** (Settings, Tab Commander) or **split** (list pane ~280px + tabbed detail pane).
- `LeftSidebar`: project **dropdown** (not an expandable tree of all projects), collections only for the selected project, counts on collections; **Content** vs **Tools** grouping.

**Middle workspace**

- **Bookmarks / Notes / Workspaces:** `MainContent` **list mode** in the left-middle pane (search, add, import for bookmarks, “Open as tab” / **Add to common** for filtered lists). Row actions open **item tabs** or workspace tab in the right-middle pane.
- **Item tabs:** bookmark, note, workspace (link list with checkboxes and bulk actions), bookmark-list / note-list aggregate tabs (optional **list vs grid**), **common-list** tab (multiple sections by scope); individual bookmark/note tabs support **edit** (title, URL, notes) with **placement-aware** notes when an item exists in multiple collections.
- **Tab strip:** drag-and-drop reordering along the strip.

**Tab Commander**

- Routed as full-page view; reuses `BottomPanel` logic with **theme-aligned** styling (CSS variables, shared surfaces). Functionality unchanged.

**Intentional deferrals (iteration 2+)**

- Virtual scope chips (`All Collections` as explicit chip row), out-of-scope tab badges, persisted split widths, keyboard-first navigation.

---

*Last updated: 2026-05-10 — Documented aggregate/common list UX, list/grid toggles, DnD tab reorder, placement-aware notes in tabs.*
