# Dashboard Backlog - Current Status

> **Last Updated**: After quick access placeholders and usability improvements

## 📊 Summary

**Overall Progress**: ~50% of backlog items completed

**Core MVP Features**: ~85% complete

### By Epic:
- **Epic A (Collections)**: 60% done (A1 ✅, A2 partial ✅, A3 ⏸️)
- **Epic B (Items)**: 60% done (B1 ✅, B2 ✅, B3 ✅, B4 ⏸️)
- **Epic C (System Tabs)**: 60% done (C1 partial ✅, C2 ✅, C4 ✅, C5 mostly ✅, C3 placeholder)
- **Epic D (Quick Access)**: 25% done (Recent ✅, others have realistic placeholders)
- **Epic E (Item Details)**: 70% done (E1 ✅, E2 ✅, E3 basic)

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
  - Full tab with last 20 most recently updated items
  - Click items to open in tabs
  - Shows title, domain, and updated date
  - Sorted by `updated_at` (most recent first)

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

### Epic D: Quick Access (Realistic Placeholders)
- **Recent Items** ✅
  - Shows last 20 most recently updated items
  - Click items to open in tabs
  - Sorted by most recent first
  
- **D1: Pinned Items** (Realistic Placeholder)
  - Polished placeholder tab with icon and description
  - Shows planned features (pin/unpin, visual indicators, etc.)
  - Ready for implementation when design is finalized
  
- **D2: Favorites** (Realistic Placeholder)
  - Polished placeholder tab with heart icon
  - Shows planned features (favorite/unfavorite, heart indicators, etc.)
  - Ready for implementation when design is finalized
  
- **D3: Trash** (Realistic Placeholder)
  - Polished placeholder tab with trash icon
  - Shows planned features (soft delete, restore, auto-cleanup, etc.)
  - Ready for implementation when design is finalized

### Epic E: Item Details
- **E1: URL Clickable** ✅
  - URLs are clickable with external link icon
  - Opens in new browser tab
  - Shows domain in header, full URL in content section
  - Hover effects for better UX
  
- **E2: Show Full Item Info** ✅
  - Displays created/updated dates with calendar icons
  - Shows source type (bookmark, note, tab, etc.)
  - Notes displayed in dedicated section
  - URL shown in dedicated section when available
  - Metadata organized in glass panel
  
- **E3: Notes Editor** - Basic textarea exists in edit mode, could be enhanced

---

## 🎯 Recommended Next Steps

Based on current progress, here's what makes sense to tackle next:

### Priority 1: Quick Wins & Polish (Epic E) ✅
1. **E1: URL Clickable** ✅ DONE
2. **E2: Show Full Item Info** ✅ DONE

### Priority 2: Search (Epic C) ✅
3. **C2: Search Tab** ✅ DONE
   - Real-time search by title, URL, notes, tags
   - Filter by collection
   - Results sorted by most recent

### Priority 3: Sharing (Epic A & B)
4. **B4: Share Item** - UI to manage item's collection memberships
   - Multi-collection selector in edit form
   - Visual indicators for items in multiple collections
5. **A3: Share Collection** - Manage collection sharing across projects

### Priority 4: Quick Access (Epic D) - Realistic Placeholders Created
6. **Recent Items** ✅ DONE - Shows last 20 most recently updated items
7. **D1-D3: Pinned/Favorites/Trash** - Realistic placeholders created, ready for implementation when design is finalized
   - All have polished UI with icons and feature descriptions
   - Help visualize how these features will work

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
- Sharing features not started (may change design, defer for now)
- Quick access features (pinned, favorites, trash) have realistic placeholders - ready for implementation when design is finalized
- AI Agent tab is placeholder (defer for now)

### Technical Debt
- Placeholder system tabs need real implementations (Search, AI Agent)
- Data model may need updates for pinned/favorites/trash
- Item detail view could be enhanced with more metadata display

---

*Status will be updated as features are completed.*

