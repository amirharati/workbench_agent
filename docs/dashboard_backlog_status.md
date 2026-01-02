# Dashboard Backlog - Current Status

> **Last Updated**: After collections management implementation

## 📊 Summary

**Overall Progress**: ~30% of backlog items completed

### By Epic:
- **Epic A (Collections)**: 60% done (A1 ✅, A2 partial ✅, A3 ⏸️)
- **Epic B (Items)**: 20% done (B2/B3 partial via context menu, B1/B4 ⏸️)
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
- **B2/B3: Edit/Delete Item** (partial)
  - Context menu exists with edit/delete options
  - Delete handler exists but may need refinement
  - Edit handler exists but full edit UI not implemented
  - Missing: Full edit form/system tab

### Epic C: System Tabs
- **C2: Search Tab** (placeholder only)
  - Opens as system tab
  - Placeholder content
  - Missing: Real search functionality

- **C3: AI Agent Tab** (placeholder only)
  - Opens as system tab
  - Placeholder content

- **C4: Add Item Tab** (placeholder only)
  - Opens as system tab
  - Placeholder content
  - Missing: Full form implementation

---

## ⏸️ Not Started

### Epic A
- **A3: Share Collection** - UI to manage collection sharing across projects

### Epic B
- **B1: Create Item** - Full form for adding bookmarks/notes
- **B4: Share Item** - UI to manage item's collection memberships

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

### Priority 1: Complete Item Management (Epic B)
1. **B1: Create Item** - Full form in system tab
2. **B2: Edit Item** - Complete the edit functionality (form/system tab)
3. **B3: Delete Item** - Ensure delete works properly (may already work)

### Priority 2: System Tabs (Epic C)
4. **C2: Search Tab** - Implement real search functionality
5. **C4: Add Item Tab** - Implement the create item form

### Priority 3: Item Details (Epic E)
6. **E1: URL Clickable** - Quick win, simple implementation
7. **E2: Full Item Info** - Show all fields, enable editing

### Priority 4: Sharing (Epic A & B)
8. **A3: Share Collection** - Manage collection sharing
9. **B4: Share Item** - Manage item's collections

### Priority 5: Quick Access (Epic D)
10. **D1-D3** - Pinned, Favorites, Trash (requires data model changes)

---

## 📝 Notes

### What's Working Well
- Collections management is solid (create, delete, rename, open in tab)
- Tab system is robust (dragging, multiple spaces, auto-selection)
- Collections space tab is very functional
- Context menus provide good UX

### What Needs Work
- Item creation/editing needs full implementation
- Search tab is just a placeholder
- Item detail view is basic (needs editing capabilities)
- Sharing features not started

### Technical Debt
- Some handlers exist but UI not fully connected (edit item)
- Placeholder system tabs need real implementations
- Data model may need updates for pinned/favorites/trash

---

*Status will be updated as features are completed.*

