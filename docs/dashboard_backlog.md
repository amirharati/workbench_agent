# Dashboard Backlog (Functional Priorities)

> **Goal**: Build out core functionality for collections, items, and system tabs before focusing on styling polish.  
> **Status**: Planning → Implementation  
> **Related**: See `project_dashboard_implementation.md` for architecture details

---

## 📋 Overview

This document tracks the next set of functional features to implement. We're deferring Phase 7 (styling/responsive/animations) unless it blocks functionality.

### Priority Order
1. **Epic A**: Collections Management + Sharing
2. **Epic B**: Items (Bookmarks/Notes) Management + Sharing  
3. **Epic C**: System Tabs (Standard Functions)
4. **Epic D**: Quick Access Semantics (Pinned/Favorites/Trash)
5. **Epic E**: Item Detail View Improvements

---

## Epic A: Collections Management + Sharing

### A1. Create Collection
**Goal**: Allow users to easily create new collections from the dashboard.

**Acceptance Criteria**:
- [ ] UI entry point from dashboard (button in header or system tab)
- [ ] Modal/form with fields:
  - Name (required)
  - Description (optional)
  - Color/tag (optional, future)
- [ ] Creates collection attached to current project by default
- [ ] Collection appears in pills immediately
- [ ] Validation: name must be unique within project (or globally?)

**Implementation Notes**:
- Use existing `addCollection` from `db.ts` or extend it
- Consider: should collections be project-specific or global with project attachments?
- Current model: `Collection.projectIds` array - supports multi-project sharing

**UI Location**: 
- Option 1: "+" button next to collection pills
- Option 2: "Collections Manager" system tab (more comprehensive)

---

### A2. Remove Collection from Project vs Delete Collection
**Goal**: Distinguish between detaching a collection from a project vs deleting it entirely.

**Acceptance Criteria**:
- [ ] **Detach**: Remove current project's ID from `collection.projectIds`
  - Collection remains but is no longer visible in this project
  - Other projects still see it if they have it
- [ ] **Delete**: Remove collection entirely (global deletion)
  - Confirmation dialog required
  - Warning if collection has items
  - Option to move items to another collection or delete them
- [ ] UI: Right-click on collection pill or context menu
- [ ] Both actions update UI immediately

**Implementation Notes**:
- Use `deleteCollection` from `db.ts` for global delete
- Add `removeProjectFromCollection(collectionId, projectId)` helper
- Consider cascade behavior: what happens to items when collection is deleted?

---

### A3. Share Collection with Other Projects
**Goal**: Allow collections to be shared across multiple projects.

**Acceptance Criteria**:
- [ ] UI to manage which projects a collection belongs to
- [ ] Show list of all projects with checkboxes
- [ ] Current project is checked and disabled (can't remove)
- [ ] Save updates `collection.projectIds` array
- [ ] Collection appears/disappears from project pills based on selection
- [ ] Visual indicator if collection is shared (multiple projects)

**Implementation Notes**:
- Modal/dialog or dedicated system tab
- Need to fetch all projects for selection
- Consider: should there be a "primary project" concept?

**UI Location**: 
- Context menu on collection pill: "Manage Sharing"
- Or in "Collections Manager" system tab

---

## Epic B: Items (Bookmarks/Notes) Management + Sharing

### B1. Create Item (Bookmark/Note)
**Goal**: Standard way to add new bookmarks or notes.

**Acceptance Criteria**:
- [ ] System tab: "Add Item" (or "New Item")
- [ ] Form fields:
  - Title (required)
  - URL (optional, validates if provided)
  - Notes (optional, textarea)
  - Collections (multi-select, defaults to current filter if applicable)
- [ ] Save creates item and opens it in a tab
- [ ] Item appears in list immediately
- [ ] Validation: URL must be valid http/https if provided

**Implementation Notes**:
- Use existing `addItem` from `db.ts`
- Consider: should we auto-detect if it's a bookmark (has URL) vs note (no URL)?
- Current model: `Item.source` can be 'bookmark', 'manual', 'tab', etc.

**UI Location**: 
- System tab (full version)
- Quick "Add" button in header (opens system tab or inline form)

---

### B2. Edit Item
**Goal**: Edit existing item details.

**Acceptance Criteria**:
- [ ] System tab: "Edit Item" (or edit section in item detail view)
- [ ] Pre-filled form with current values:
  - Title
  - URL
  - Notes
  - Collections (multi-select)
- [ ] Save updates item via `updateItem`
- [ ] Changes reflect immediately in list and tabs
- [ ] Can edit from context menu or item detail view

**Implementation Notes**:
- Use existing `updateItem` from `db.ts`
- Consider: inline editing vs modal vs dedicated tab
- Should we support editing multiple items at once? (future)

---

### B3. Delete Item
**Goal**: Remove items with proper confirmation.

**Acceptance Criteria**:
- [ ] **Option 1 (Simple)**: Hard delete with confirmation
  - Confirmation dialog: "Delete [title]?"
  - Removes item from database
  - Closes tab if item is open
- [ ] **Option 2 (Better)**: Soft delete (Trash)
  - Sets `item.deletedAt` timestamp
  - Item moves to Trash system tab
  - Can restore or permanently delete from Trash
- [ ] Delete from context menu or item detail view
- [ ] UI updates immediately

**Implementation Notes**:
- Current model: no `deletedAt` field - need to add if doing soft delete
- Or start with hard delete, add soft delete later
- Consider: should deleting an item remove it from all collections or just current?

---

### B4. Share Item Across Collections/Projects
**Goal**: Allow items to belong to multiple collections (which may be in different projects).

**Acceptance Criteria**:
- [ ] UI to manage which collections an item belongs to
- [ ] Show all available collections (from current project + shared collections)
- [ ] Multi-select interface (checkboxes or tags)
- [ ] Save updates `item.collectionIds` array
- [ ] Item appears in all selected collections
- [ ] Visual indicator if item is in multiple collections

**Implementation Notes**:
- Current model: `Item.collectionIds` array - already supports this!
- Just need UI to manage the array
- Consider: should we show which project each collection belongs to?

**UI Location**: 
- In item detail/edit view
- Or context menu: "Manage Collections"

---

## Epic C: System Tabs (Standard Functions)

### C1. System Tabs Registry & Standard Behavior
**Goal**: Define and implement standard system tabs that behave consistently.

**System Tabs**:
- `search` - Search across items
- `agent` - AI Agent workspace
- `add` - Add new item
- `collections` - Collections manager
- `favorites` - Favorites list
- `pinned` - Pinned items
- `trash` - Deleted items (if soft delete)
- `recent` - Recent items (already implemented)

**Standard Behavior**:
- [ ] All system tabs can be opened, focused, closed, moved between spaces
- [ ] Default open location: Right pane if visible, else main top
- [ ] Can be opened from:
  - Header buttons (Search, AI Agent, Add)
  - Quick actions
  - Keyboard shortcuts (future)
- [ ] Each tab has a unique ID: `system-{name}`
- [ ] Tabs remember their content/state (if applicable)

**Implementation Notes**:
- Extend current `Tab` type to support system tabs
- System tabs have `itemId: ''` and `content` or render custom component
- Consider: should system tabs persist across project switches? (probably not)

---

### C2. Search Tab
**Goal**: Full-featured search interface.

**Acceptance Criteria**:
- [ ] Opens as system tab
- [ ] Search input at top
- [ ] Real-time search across:
  - Item titles
  - URLs
  - Notes
- [ ] Results list (similar to ItemsListPanel)
- [ ] Click result opens item in chosen space
- [ ] Keyboard shortcuts: Enter to open first result, Arrow keys to navigate
- [ ] Search history (optional, future)

**Implementation Notes**:
- Can reuse existing search logic from `filteredItems`
- Consider: should search be global (all projects) or scoped to current project?

---

### C3. AI Agent Tab
**Goal**: Placeholder for AI agent functionality.

**Acceptance Criteria**:
- [ ] Opens as system tab
- [ ] Placeholder UI is fine for now
- [ ] Must behave like a "real" system tab:
  - Can be opened, focused, closed
  - Can be moved between spaces
  - Persists when switching projects (or not? TBD)
- [ ] Structure ready for future AI integration

**Implementation Notes**:
- Keep it simple for now
- Just needs to be a functional tab that doesn't break anything

---

### C4. Add Item Tab
**Goal**: Full form for adding items (see B1).

**Acceptance Criteria**:
- [ ] Opens as system tab
- [ ] Form as described in B1
- [ ] Save creates item and optionally opens it
- [ ] Can be closed without saving (draft state? or just discard)

---

### C5. Collections Manager Tab
**Goal**: Comprehensive collection management.

**Acceptance Criteria**:
- [ ] Opens as system tab
- [ ] Lists all collections (current project + shared)
- [ ] Actions per collection:
  - Edit name/description
  - Manage sharing (A3)
  - Delete/detach
- [ ] Create new collection (A1)
- [ ] Filter/search collections

---

## Epic D: Quick Access Semantics

### D1. Pinned Items
**Goal**: Allow users to pin important items.

**Acceptance Criteria**:
- [ ] Add `pinned` boolean field to Item (or `pinnedAt` timestamp)
- [ ] UI to pin/unpin items:
  - Context menu option
  - Button in item detail view
  - Keyboard shortcut (future)
- [ ] "Pinned" quick action opens system tab showing pinned items
- [ ] Visual indicator in item list (icon/badge)
- [ ] Pinned items appear at top of lists (optional)

**Implementation Notes**:
- Need to add field to Item model
- Migration: add `pinned: boolean` defaulting to `false`
- Consider: should pinned be per-project or global?

---

### D2. Favorites
**Goal**: Allow users to favorite items.

**Acceptance Criteria**:
- [ ] Add `favorite` boolean field to Item (or `favoriteAt` timestamp)
- [ ] UI to favorite/unfavorite items:
  - Context menu option
  - Button in item detail view
  - Heart icon (future)
- [ ] "Favorites" quick action opens system tab showing favorited items
- [ ] Visual indicator in item list
- [ ] Favorites appear in dedicated view

**Implementation Notes**:
- Similar to pinned
- Consider: favorites vs pinned - are they different? (maybe favorites = personal, pinned = project-level?)

---

### D3. Trash (Soft Delete)
**Goal**: Soft delete with restore capability.

**Acceptance Criteria**:
- [ ] Add `deletedAt` timestamp field to Item
- [ ] Delete action sets `deletedAt` instead of removing item
- [ ] "Trash" quick action opens system tab showing deleted items
- [ ] Trash view shows:
  - Deleted items list
  - Restore button (clears `deletedAt`)
  - Permanent delete button (actual deletion)
- [ ] Items with `deletedAt` don't appear in normal lists
- [ ] Auto-cleanup: permanently delete items older than X days (optional, future)

**Implementation Notes**:
- Need migration to add `deletedAt: number | null`
- Update all item queries to filter out deleted items (unless in Trash view)
- Consider: should deleted items be removed from collections? (probably yes, or show as "removed from collection")

---

## Epic E: Item Detail View Improvements

### E1. URL Clickable
**Goal**: Make URLs in item details open in new browser tab.

**Acceptance Criteria**:
- [ ] URL field in item detail is clickable/link
- [ ] Click opens URL in new browser tab (via `chrome.tabs.create`)
- [ ] Visual indication that URL is clickable (underline, icon, button)
- [ ] Works for both viewing and editing modes

**Implementation Notes**:
- Simple: wrap URL in `<a>` tag or button with `onClick` handler
- Use `chrome.tabs.create({ url: item.url })`

---

### E2. Show Full Item Info
**Goal**: Display all relevant item information in detail view.

**Acceptance Criteria**:
- [ ] Item detail shows:
  - Title (editable)
  - URL (clickable, editable)
  - Notes (editable, textarea)
  - Collections (list with badges, editable)
  - Created date
  - Updated date
  - Source type (bookmark, note, tab, etc.)
- [ ] All fields are visible and properly formatted
- [ ] Edit mode allows changing all fields
- [ ] Save button updates item

**Implementation Notes**:
- Enhance current `TabContent` component
- Consider: should we show item ID? (probably not, but useful for debugging)

---

### E3. Notes Editor (Simple Text)
**Goal**: Basic text editing for notes (markdown deferred).

**Acceptance Criteria**:
- [ ] Textarea for notes field
- [ ] Multi-line support
- [ ] Basic formatting preserved (line breaks)
- [ ] Character count (optional)
- [ ] Auto-save draft (optional, future)

**Implementation Notes**:
- Keep it simple: plain textarea
- Markdown support is explicitly deferred until core features are done
- Consider: should we support basic formatting like bold/italic? (probably not yet)

---

## 🎯 Implementation Order Recommendation

### Sprint 1: Foundation
1. **A1**: Create Collection (simple version)
2. **B1**: Create Item (system tab)
3. **C1**: System tabs registry + standard behavior
4. **C2**: Search tab (basic)

### Sprint 2: Management
5. **A2**: Remove/Delete Collection
6. **A3**: Share Collection
7. **B2**: Edit Item
8. **B3**: Delete Item (start with hard delete)

### Sprint 3: Quick Access
9. **D1**: Pinned Items
10. **D2**: Favorites
11. **D3**: Trash (soft delete)

### Sprint 4: Polish
12. **E1**: URL Clickable
13. **E2**: Full Item Info Display
14. **E3**: Notes Editor (simple)

### Sprint 5: Advanced
15. **B4**: Share Item Across Collections
16. **C3-C5**: Remaining system tabs (AI Agent, Collections Manager)

---

## 📝 Notes & Decisions

### Data Model Changes Needed
- [ ] Add `pinned: boolean` to Item (default: false)
- [ ] Add `favorite: boolean` to Item (default: false)
- [ ] Add `deletedAt: number | null` to Item (default: null)

### UI Patterns
- **System Tabs**: All open in right pane if visible, else main top
- **Modals vs Tabs**: Prefer system tabs for complex forms, modals for quick actions
- **Context Menus**: Use for quick actions (pin, favorite, delete, etc.)

### Deferred Features
- Markdown editor for notes
- Advanced responsive/mobile polish
- Animations
- Keyboard shortcuts (beyond ⌘K for search)
- Focus views (collection-focused, item-focused full views)
- Search history
- Auto-save drafts
- Per-project layout preferences

---

## 🧪 Testing Considerations

For each epic, test:
- [ ] Data persistence (survives refresh)
- [ ] UI updates immediately after actions
- [ ] Error handling (invalid inputs, network issues)
- [ ] Edge cases (empty states, large lists, special characters)
- [ ] Cross-space behavior (tabs in different spaces)

---

*This backlog will be updated as features are implemented and new requirements emerge.*

