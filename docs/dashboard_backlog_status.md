# Dashboard Backlog - Current Status

> **Last Updated**: After item management implementation (B1, B2, B3 completed)

## 📊 Summary

**Overall Progress**: ~35% of backlog items completed

### By Epic:
- **Epic A (Collections)**: 60% done (A1 ✅, A2 partial ✅, A3 ⏸️)
- **Epic B (Items)**: 60% done (B1 ✅, B2 ✅, B3 ✅, B4 ⏸️)
- **Epic C (System Tabs)**: 40% done (C1 partial ✅, C5 mostly ✅, C2-C4 placeholders)
- **Epic D (Quick Access)**: 0% done (all deferred)
- **Epic E (Item Details)**: 10% done (basic display exists, editing not implemented)

---

## ✅ Completed Items

### Epic A: Collections Management
- **A1: Create Collection** ✅
  - "+ New" button in collection pills
  - Modal with name/description
  - Creates collection in current project
  - Appears immediately in pills

- **A2: Delete Collection** ✅ (partial - delete only, no detach yet)
  - Delete button in Collections space tab
  - Right-click context menu with delete option
  - Confirmation dialog
  - Items auto-move to Unsorted
  - UI updates immediately

- **Collections Space Tab** ✅ (beyond original scope)
  - Grid view of all collections
  - Drag items from left panel onto collections
  - Rename (button or double-click)
  - Delete (button or context menu)
  - Open collection in tab
  - Click collection to filter items

### Epic C: System Tabs
- **C1: System Tabs Infrastructure** ✅ (partial)
  - System tabs can be opened, closed, moved between spaces
  - Header buttons for Search, AI Agent, Add
  - Placeholder tabs work correctly
  - Collections tab fully functional

- **C5: Collections Manager Tab** ✅ (mostly)
  - Opens as system tab
  - Grid view of collections
  - Rename, delete, open in tab
  - Drag-and-drop items to collections
  - Missing: sharing management, filter/search

- **Recent Items** ✅
  - Quick action shows real recent items
  - Sorted by `updated_at`

### Infrastructure
- **Tab Management** ✅
  - Independent tab spaces (4 spaces)
  - Tab dragging between spaces
  - Auto-select next tab when tab is moved
  - Tab reordering within spaces
  - Context menu for items

- **Item Highlighting** ✅
  - Smart highlighting across all spaces
  - Works when tabs are in different spaces
  - Open items in any space (Ctrl/Cmd+Click or context menu)

---

## 🚧 Partially Done

### Epic B: Items Management
- **B1: Create Item** ✅
  - Full form in system tab with title, URL, notes, collections
  - Validates URL format
  - Creates item and opens it in a tab
  - Defaults to current collection filter
  - Supports both bookmarks (with URL) and notes (without URL)
  
- **B2: Edit Item** ✅
  - In-place editing in the same tab (no separate edit tabs)
  - Edit button in item detail view header
  - Context menu support for editing
  - Pre-filled form with current values (title, URL, notes, collections)
  - Updates item via `updateItem`
  - Changes reflect immediately
  - Auto-resets edit mode when switching items
  
- **B3: Delete Item** ✅ (hard delete)
  - Confirmation dialog
  - Removes item from database
  - Closes item tab if open
  - UI updates immediately
  - Can delete from context menu or item detail view
  - Delete button in item detail view header
  - Note: Soft delete (Trash) deferred for future

### Epic C: System Tabs
- **C4: Add Item Tab** ✅
  - Full form implementation
  - Creates items and opens them in tabs
  - Supports both bookmarks and notes

- **C2: Search Tab** (placeholder only)
  - Opens as system tab
  - Placeholder content
  - Missing: Real search functionality

- **C3: AI Agent Tab** (placeholder only)
  - Opens as system tab
  - Placeholder content

---

## ⏸️ Not Started

### Epic A
- **A3: Share Collection** - UI to manage collection sharing across projects

### Epic B
- **B4: Share Item** - UI to manage item's collection memberships (items can already belong to multiple collections, but UI for managing this is missing)

### Epic D: Quick Access
- **D1: Pinned Items** - Pin/unpin functionality
- **D2: Favorites** - Favorite/unfavorite functionality
- **D3: Trash** - Soft delete with restore

### Epic E: Item Details
- **E1: URL Clickable** - Make URLs open in browser
- **E2: Full Item Info** - Show all fields, edit mode
- **E3: Notes Editor** - Textarea for notes editing

---

## 🎯 Recommended Next Steps

Based on current progress, here's what makes sense to tackle next:

### Priority 1: Quick Wins & Polish (Epic E)
1. **E1: URL Clickable** ⚡ Quick win - Make URLs in item details clickable
2. **E2: Show Full Item Info** - Display metadata (created date, updated date, source)

### Priority 2: Search (Epic C)
3. **C2: Search Tab** - Implement real search functionality across items
   - Search by title, URL, notes
   - Filter by collection, date range
   - Highlight matches

### Priority 3: Sharing (Epic A & B)
4. **B4: Share Item** - UI to manage item's collection memberships
   - Multi-collection selector in edit form
   - Visual indicators for items in multiple collections
5. **A3: Share Collection** - Manage collection sharing across projects

### Priority 4: Quick Access (Epic D) - Requires Data Model Changes
6. **D1: Pinned Items** - Pin/unpin functionality
7. **D2: Favorites** - Favorite/unfavorite functionality
8. **D3: Trash** - Soft delete with restore

### Priority 5: Advanced Features
9. **E3: Notes Editor** - Enhanced notes editing (markdown support?)
10. **C3: AI Agent Tab** - AI agent functionality

---

## 📝 Notes

### What's Working Well
- Collections management is solid (create, delete, rename, open in tab)
- Item management is complete (create, edit in-place, delete)
- Tab system is robust (dragging, multiple spaces, auto-selection)
- Collections space tab is very functional
- Context menus provide good UX
- In-place editing provides smooth workflow

### What Needs Work
- Search tab is just a placeholder (needs real search implementation)
- URL clickable in item details (quick win)
- Item detail view could show more metadata (dates, source, etc.)
- Sharing features not started
- Quick access features (pinned, favorites, trash) not started

### Technical Debt
- Placeholder system tabs need real implementations (Search, AI Agent)
- Data model may need updates for pinned/favorites/trash
- Item detail view could be enhanced with more metadata display

---

*Status will be updated as features are completed.*

