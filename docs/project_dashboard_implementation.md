# Project Dashboard Implementation Plan

> **Goal**: Build a flexible, resizable project dashboard based on View #6 mockup from `ui_mocks/`  
> **Status**: Planning → Implementation  
> **Can be done across multiple sessions**

---

## 📋 Overview

### What We're Building
A project dashboard that appears when a user clicks on a project. The dashboard has:
- Flexible, resizable spaces with movable dividers
- Collection filtering via pills at the top
- Items list on the left
- Tabbed content panels (main + optional right)
- Vertical splitting capability
- Tab dragging between panes

### Design Reference
- **Source**: `ui_mocks/src/components/ProjectDashboard.js` - View #6
- **Design System**: Dark theme with glass morphism (`ui_mocks/src/style.css`)
- **Layout**: See screenshot/description for exact structure

---

## 🎯 Current State vs Target State

### Current State
- Projects view shows project cards
- Clicking project shows basic detail view
- Items shown in grid/list format
- Modals for item details
- Bottom panel with Tab Commander (to be moved)

### Target State
- Clicking project → Opens full dashboard
- Dashboard has flexible panes
- Tabbed interface for multiple items
- Resizable columns
- Collection filtering at top
- Search integrated in top bar

---

## ✅ Current Phase Status (Quick Summary)

**Last Updated**: After tab dragging and context menu implementation

### Completed Phases
- **Phase 0**: ✅ Done (nav updates, Tab Commander full-page, no bottom split, Home placeholder)
- **Phase 1**: ✅ Done (single-pane ProjectDashboard wired: pills + search + items list + tab bar/content)
- **Phase 2**: ✅ Done (CollectionPills, SearchBar with ⌘K shortcut, QuickActions, header layout)
- **Phase 3**: ✅ Done (ItemsListPanel with icons, dates, active highlighting, context menu)
- **Phase 4**: ✅ Done (TabBar, TabContent - ContentPanel integrated into ProjectDashboard)
- **Phase 5**: ✅ Done (Resizer with smooth dragging, layout state management, right pane split)
- **Phase 6**: ✅ Done (Data flow, item actions, tab management)
- **Phase 7**: ✅ Partially Done (Theme system, CSS vars, primitives, custom scrollbars - animations pending)
- **Phase 8**: ✅ Mostly Done (Right pane toggle, layout persistence, recent items, **tab dragging**, **context menu**)

### Additional Features Implemented (Beyond Original Plan)
- ✅ **Independent tab spaces**: 4 independent tab spaces (main top, main bottom, right top, right bottom) with no duplicate tabs
- ✅ **Utility buttons in header**: Search, AI Agent, and Add buttons in top-right (similar to mockup)
- ✅ **Layout controls**: Split/unsplit and right pane controls moved to control strip above grid (not in tab section)
- ✅ **Title visibility**: Theme-aware titles with conditional hiding in project dashboard
- ✅ **Smooth resizing**: Incremental delta-based resizing with `touch-action: none` for IDE-like precision
- ✅ **Keyboard shortcut**: ⌘K/Ctrl+K to focus search (implemented in ProjectDashboard)
- ✅ **Recent items**: Quick action shows real recent items sorted by `updated_at`
- ✅ **Tab dragging**: Full drag-and-drop between all 4 spaces with visual feedback, reordering within spaces
- ✅ **Context menu**: Right-click menu on items with edit, delete, open in new tab, duplicate, and "Open in space" options
- ✅ **Smart item highlighting**: Items highlight correctly regardless of which space their tab is in
- ✅ **Open in any space**: Items can be opened in any available space via context menu or Ctrl/Cmd+Click

---

## 🏗️ Architecture Overview

### Component Structure
```
ProjectDashboard (new)
├── ProjectDashboardHeader
│   ├── CollectionPills
│   ├── SearchBar
│   └── QuickActions
├── ProjectDashboardContent
│   ├── ItemsListPanel (left, resizable)
│   ├── Resizer
│   └── ContentPanel (right, tabbed, splittable)
│       └── TabbedPane (can have multiple)
│           ├── TabBar
│           └── TabContent
└── Optional: RightPane (toggleable)
```

### File Structure
```
src/
├── components/
│   ├── dashboard/
│   │   ├── ProjectDashboard.tsx (new - main component)
│   │   ├── ProjectDashboardHeader.tsx (new)
│   │   ├── CollectionPills.tsx (new)
│   │   ├── SearchBar.tsx (new)
│   │   ├── QuickActions.tsx (new)
│   │   ├── ItemsListPanel.tsx (new)
│   │   ├── ContentPanel.tsx (new)
│   │   ├── TabbedPane.tsx (new)
│   │   ├── TabBar.tsx (new)
│   │   ├── Resizer.tsx (new)
│   │   ├── TabCommanderView.tsx (new - from Phase 0)
│   │   └── HomeView.tsx (new - from Phase 0)
│   └── dashboard/layout/
│       ├── LeftSidebar.tsx (update - Phase 0)
│       ├── DashboardLayout.tsx (update - Phase 0)
│       └── MainContent.tsx (update - Phase 0 & Phase 1)
```

---

## 📐 Layout Details

### Left Sidebar (Update Existing - Phase 0)
**File**: `src/components/dashboard/layout/LeftSidebar.tsx`

**Navigation Items (after Phase 0):**
- Home (new, placeholder for now)
- Projects (existing)
- Tab Commander (moved from bottom panel, opens full page)
- Bookmarks (existing, keep functionality)
- Workspaces (existing, keep functionality)
- Notes (existing, keep functionality)
- Collections (existing, keep functionality)

**Changes (Phase 0):**
- ✅ Add "Home" nav item
- ✅ Add "Tab Commander" nav item
- ✅ Keep all existing items with their current functionality

### Main Dashboard Layout

**Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Collection Pills | Search | Quick Actions          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌──────────────┬────┬─────────────────────────────────────┐ │
│ │              │    │                                     │ │
│ │  Items List  │ │  │   Content Panel (Tabbed)            │ │
│ │              │ │  │   [Tab 1] [Tab 2] [Tab 3] ×         │ │
│ │  - Item 1    │ │  │   ─────────────────────────────     │ │
│ │  - Item 2    │ │  │                                     │ │
│ │  - Item 3    │ │  │   [Content Area]                    │ │
│ │              │ │  │                                     │ │
│ │  + New       │ │  │   [Split: ⊞]                       │ │
│ └──────────────┴────┴─────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Dimensions:**
- Items List: 280px default (resizable, min 150px)
- Resizer: 4px width
- Content Panel: flex: 1 (takes remaining space)

---

## 🎨 Design System Implementation

### Colors (from mockup)
```typescript
// Add to src/lib/constants.ts or create src/lib/theme.ts
export const THEME = {
  bg: {
    app: '#0f1115',
    panel: '#181b21',
    glass: 'rgba(24, 27, 33, 0.7)',
  },
  text: {
    primary: '#ffffff',
    secondary: '#9ca3af',
    muted: '#6b7280',
  },
  primary: '#6366f1',
  primaryHover: '#4f46e5',
  border: {
    subtle: 'rgba(255, 255, 255, 0.08)',
    focus: 'rgba(99, 102, 241, 0.5)',
  },
} as const;
```

### Typography
- Font: 'Outfit', 'Inter', system-ui
- Sizes: 0.75rem (small), 0.85rem (body), 1rem (default), 1.5rem (header)

### Glass Morphism
```css
.glass-panel {
  background: rgba(24, 27, 33, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}
```

---

## 📊 Data Model Mapping

### From Mockup to Our Model

**Projects:**
- Mockup: `project.id`, `project.title`
- Our: `Project.id`, `Project.name` ✅

**Collections:**
- Mockup: `collection.id`, `collection.title`, `collection.itemCount`
- Our: `Collection.id`, `Collection.name` ✅
- Need: Calculate `itemCount` from items

**Items:**
- Mockup: `item.id`, `item.title`, `item.type`, `item.content`, `item.date`
- Our: `Item.id`, `Item.title`, `Item.source`, `Item.url`, `Item.created_at` ✅
- Mapping:
  - `item.type` → Map from `Item.source`:
    - `'tab'` → 'link' icon 🔗
    - `'bookmark'` → 'link' icon 🔗
    - `'manual'` → 'note' icon 📝
    - `'twitter'` → 'link' icon 🔗
  - `item.content` → Use `Item.notes` or `Item.url`
  - `item.date` → Format `Item.created_at`

**Tabs:**
- Mockup: Tabs are items or system tabs (search, AI, etc.)
- Our: Create tab interface that can hold:
  - Items (bookmarks)
  - System tabs (search, AI, favorites, etc.)

---

## 🔨 Implementation Steps

### Phase 0: Prerequisite Changes (Do This First!)

**Goal**: Refactor existing layout to prepare for project dashboard. Move Tab Commander to navigation, remove split-screen layout, keep existing functionality intact.

#### Step 0.1: Update DashboardView Type
**File**: `src/components/dashboard/layout/DashboardLayout.tsx`

**Changes:**
- [x] Add new view types: `'home' | 'tab-commander'`
- [x] Update `DashboardView` type:
```typescript
export type DashboardView = 'home' | 'projects' | 'bookmarks' | 'notes' | 'collections' | 'workspaces' | 'tab-commander';
```

#### Step 0.2: Update Left Sidebar Navigation
**File**: `src/components/dashboard/layout/LeftSidebar.tsx`

**Changes:**
- [x] Add "Home" nav item (first in list)
- [x] Add "Tab Commander" nav item (after Projects)
- [x] Keep all existing items (Projects, Bookmarks, Workspaces, Notes, Collections)
- [x] Update icons if needed

**New nav structure:**
```typescript
const navItems = [
  { icon: Home, label: 'Home', id: 'home' },
  { icon: Layout, label: 'Projects', id: 'projects' },
  { icon: Terminal, label: 'Tab Commander', id: 'tab-commander' }, // New
  { icon: BookMarked, label: 'Bookmarks', id: 'bookmarks' },
  { icon: Layers, label: 'Workspaces', id: 'workspaces' },
  { icon: FileText, label: 'Notes', id: 'notes' },
  { icon: FolderOpen, label: 'Collections', id: 'collections' },
];
```

**Tasks:**
- [x] Import Home icon from lucide-react
- [x] Import Terminal or appropriate icon for Tab Commander
- [x] Add new nav items to array
- [x] Test navigation still works for all views

#### Step 0.3: Create Tab Commander Full Page View
**File**: `src/components/dashboard/TabCommanderView.tsx` (new)

**Purpose**: Extract Tab Commander from BottomPanel and make it a full-page view

**Structure:**
```typescript
interface TabCommanderViewProps {
  windows: WindowGroup[];
  workspaces: Workspace[];
  onWorkspacesChanged?: () => Promise<void>;
  onCloseTab?: (tabId: number) => Promise<void>;
  onCloseWindow?: (windowId: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export const TabCommanderView: React.FC<TabCommanderViewProps> = ({
  windows,
  workspaces,
  onWorkspacesChanged,
  onCloseTab,
  onCloseWindow,
  onRefresh,
}) => {
  // Move BottomPanel content here, but make it full-page
  // Remove the collapse/expand logic
  // Keep all Tab Commander functionality
};
```

**Tasks:**
- [x] Create new file
- [x] Copy BottomPanel logic (or refactor to share components)
- [x] Make it full-page (no bottom panel constraints)
- [x] Keep all existing functionality (search, tabs, workspaces, etc.)
- [x] Test all features work

#### Step 0.4: Update MainContent to Handle New Views
**File**: `src/components/dashboard/layout/MainContent.tsx`

**Changes:**
- [x] Add case for `'home'` view (placeholder for now)
- [x] Add case for `'tab-commander'` view → render `TabCommanderView`
- [x] Keep all existing views working (bookmarks, notes, collections, workspaces)

**Routing logic:**
```typescript
switch (activeView) {
  case 'home':
    return <HomeView />; // Placeholder
  case 'tab-commander':
    return <TabCommanderView 
      windows={windows}
      workspaces={workspaces}
      onWorkspacesChanged={onWorkspacesChanged}
      onCloseTab={onCloseTab}
      onCloseWindow={onCloseWindow}
      onRefresh={onRefresh}
    />;
  case 'projects':
    // Existing projects view
  // ... other cases
}
```

**Tasks:**
- [x] Import TabCommanderView
- [x] Add routing cases
- [x] Create placeholder HomeView component
- [x] Test all views still work

#### Step 0.5: Remove Bottom Panel from DashboardLayout
**File**: `src/components/dashboard/layout/DashboardLayout.tsx`

**Changes:**
- [x] Remove BottomPanel import
- [x] Remove bottom panel state (isBottomPanelCollapsed, bottomPanelHeight, etc.)
- [x] Remove bottom panel JSX
- [x] Remove resize handle for bottom panel
- [x] Make main content area take full height (remove flex column split)

**Before:**
```typescript
<div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
  <div style={{ flex: 1 }}>MainContent</div>
  <ResizeHandle />
  <div style={{ height: '300px' }}>BottomPanel</div>
</div>
```

**After:**
```typescript
<div style={{ flex: 1, overflow: 'auto' }}>
  <MainContent ... />
</div>
```

**Tasks:**
- [x] Remove BottomPanel component usage
- [x] Remove bottom panel state
- [x] Remove resize logic for bottom panel
- [x] Update layout to single column
- [x] Test layout looks correct

#### Step 0.6: Create Placeholder Home View
**File**: `src/components/dashboard/HomeView.tsx` (new)

**Purpose**: Placeholder for Home view (content TBD later)

**Structure:**
```typescript
export const HomeView: React.FC = () => {
  return (
    <div>
      <h1>Home</h1>
      <p>Home view - content to be determined</p>
      {/* Can add quick stats, recent items, etc. later */}
    </div>
  );
};
```

**Tasks:**
- [x] Create simple placeholder component
- [x] Add to MainContent routing
- [x] Test navigation works

#### Step 0.7: Verify Existing Functionality Still Works
**Testing Checklist:**
- [ ] Projects view works
- [ ] Bookmarks view works
- [ ] Workspaces view works (save, restore, etc.)
- [ ] Notes view works (if implemented)
- [ ] Collections view works
- [ ] Tab Commander opens in full page
- [ ] Tab Commander functionality intact (search, tabs, workspaces, etc.)
- [ ] Navigation between all views works
- [ ] No broken features

**Files to Test:**
- [ ] `src/components/dashboard/layout/MainContent.tsx` - All view cases
- [ ] `src/components/dashboard/layout/LeftSidebar.tsx` - All nav items
- [ ] `src/components/dashboard/layout/DashboardLayout.tsx` - Layout structure
- [ ] `src/components/dashboard/TabCommanderView.tsx` - Full functionality

#### Step 0.8: Clean Up (Optional)
- [ ] Remove unused BottomPanel file (or keep for reference)
- [ ] Remove unused state/handlers
- [ ] Update any imports
- [ ] Check for console errors

---

### Phase 1: Foundation & Layout Structure

**Status:** ✅ Completed (single-pane MVP wired; build passing)

**What we did:**
- Wired `ProjectDashboard` into `MainContent` when a project is selected
- Core layout: collection pills + search + items list (left) + single tabbed panel (right)
- Refactored into small, focused components:
  - `CollectionPills.tsx`
  - `SearchBar.tsx`
  - `QuickActions.tsx` (placeholder actions)
  - `ItemsListPanel.tsx`
  - `TabBar.tsx`
  - `TabContent.tsx`
  - `ProjectDashboard.tsx` (orchestrates state, uses the above)
- Deferred: right pane, vertical split, tab dragging (future phases)
- Build is clean (`npm run build`)

**Good practices:**
- Components are small/presentational; state stays in `ProjectDashboard`
- Composable pieces to keep future changes localized (avoid bloat)

#### Step 1.2: Navigation Already Updated (Phase 0)
**File**: `src/components/dashboard/layout/LeftSidebar.tsx`

**Status**: ✅ Already done in Phase 0
- Navigation items updated
- Tab Commander moved to nav
- Home added
- All existing views preserved

#### Step 1.3: Update Main Content Router
**File**: `src/components/dashboard/layout/MainContent.tsx`

**Changes:**
- [x] Add route for project dashboard
- [x] When project clicked, navigate to dashboard
- [x] Pass project data to ProjectDashboard component

---

### Phase 2: Header Components

#### Step 2.1: Collection Pills
**File**: `src/components/dashboard/CollectionPills.tsx`

**Features:**
- [x] Display "All" pill with total count
- [x] Display collection pills with item counts
- [x] Active state styling (primary background)
- [x] Click handler to filter items

**Props:**
```typescript
interface CollectionPillsProps {
  collections: Collection[];
  selectedId: string | 'all';
  onSelect: (id: string | 'all') => void;
  totalItems: number;
}
```

**Styling:**
- Active: `background: var(--primary)`, `color: white`
- Inactive: `background: rgba(255,255,255,0.05)`, `color: var(--text-secondary)`
- Border radius: 16px
- Padding: 0.4rem 0.8rem

#### Step 2.2: Search Bar
**File**: `src/components/dashboard/SearchBar.tsx`

**Features:**
- [x] Input with search icon
- [x] Placeholder: "⌘K to search..."
- [x] Clear button (appears when text entered)
- [x] Real-time filtering
- [x] Keyboard shortcut (⌘K) to focus (implemented in ProjectDashboard)

**Props:**
```typescript
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}
```

#### Step 2.3: Quick Actions
**File**: `src/components/dashboard/QuickActions.tsx`

**Features:**
- [x] Buttons: Pinned, Recent, Favorites, Trash
- [x] Click handler wired (placeholder/no-op for now)
- [x] Open as tab with content (Recent shows real items, others are placeholders)

**Props:**
```typescript
interface QuickActionsProps {
  onAction: (action: 'pinned' | 'recent' | 'favorites' | 'trash') => void;
}
```

#### Step 2.4: Dashboard Header (Container)
**File**: `src/components/dashboard/ProjectDashboardHeader.tsx`

**Features:**
- [x] Combines CollectionPills, SearchBar, QuickActions
- [x] Layout: Pills | Search (flex: 1) | Quick Actions
- [x] Responsive wrapping
- [x] Back button (in ProjectDashboard header)

---

### Phase 3: Items List Panel

#### Step 3.1: Items List Component
**File**: `src/components/dashboard/ItemsListPanel.tsx`

**Features:**
- [x] Header: Item count (+ New deferred)
- [x] Scrollable list of items
- [ ] Item display:
  - [x] Icon (based on source type)
  - [x] Title (truncated)
  - [x] Date (formatted)
  - [x] Context menu (right-click) with full actions
- [x] Active item highlighting (works across all spaces)
- [x] Click to open in content panel (or focus if already open)
- [x] Open in any available space (via context menu or Ctrl/Cmd+Click)

**Props:**
```typescript
interface ItemsListPanelProps {
  width: number;
  items: Item[];
  activeItemId: string | null;
  onItemClick: (item: Item) => void;
  onNewItem: () => void;
}
```

**Item Icons:**
- `'tab'` or `'bookmark'` → 🔗
- `'manual'` → 📝
- `'twitter'` → 🔗
- Default → 📄

**Active State:**
- Background: `rgba(99,102,241,0.15)`
- Left border: `3px solid var(--primary)`

**Styling:**
- Padding: 0.6rem 0.75rem per item
- Border radius: 6px
- Hover: Show context menu

---

### Phase 4: Content Panel & Tabs

#### Step 4.1: Tab Types & Interface
**File**: `src/components/dashboard/types.ts` (or in ProjectDashboard.tsx)

```typescript
export type TabType = 'item' | 'search' | 'ai' | 'pinned' | 'recent' | 'favorites' | 'trash';

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  itemId?: string; // For item tabs
  content?: string; // For system tabs
}
```

#### Step 4.2: Tab Bar Component
**File**: `src/components/dashboard/TabBar.tsx`

**Features:**
- [x] Display tabs horizontally
- [x] Active tab highlighting
- [x] Close button (×) on each tab
- [x] Tab title truncation
- [x] Click to switch tabs
- [ ] Drag handle (for future dragging)

**Props:**
```typescript
interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
}
```

**Styling:**
- Background: `rgba(0,0,0,0.2)`
- Active tab: `background: var(--bg-panel)`
- Border bottom: `1px solid var(--border-subtle)`
- Height: 40px

#### Step 4.3: Tab Content Component
**File**: `src/components/dashboard/TabContent.tsx`

**Features:**
- [x] Render content based on tab type
- [x] Item tabs: Show item details (title, url, notes, etc.)
- [x] System tabs: Show placeholder or actual content
- [x] Scrollable content area

**Props:**
```typescript
interface TabContentProps {
  tab: Tab;
  item?: Item; // If tab type is 'item'
}
```

#### Step 4.4: Content Panel Component
**File**: `src/components/dashboard/ContentPanel.tsx`

**Features:**
- [ ] Contains TabBar and TabContent
- [ ] Split button (⊞) in tab bar
- [ ] Handles vertical splitting
- [ ] Manages top/bottom tabs when split

**Props:**
```typescript
interface ContentPanelProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onSplit: () => void;
  isSplit?: boolean;
  splitRatio?: number;
  onSplitResize?: (ratio: number) => void;
}
```

**Split Functionality:**
- When split: Show top pane + resizer + bottom pane
- Each pane has its own tabs
- Split button becomes unsplit (⊟) when split
- Resizable split ratio (10% - 90%)

---

### Phase 5: Resizing & Layout

#### Step 5.1: Resizer Component
**File**: `src/components/dashboard/Resizer.tsx`

**Features:**
- [x] Vertical resizer (for columns)
- [x] Horizontal resizer (for split panes)
- [x] Hover effect (turns primary color)
- [x] Drag to resize (smooth incremental deltas, touch-action: none)
- [x] Min/max constraints (implicit via state management)

**Props:**
```typescript
interface ResizerProps {
  direction: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
  minSize?: number;
  maxSize?: number;
}
```

**Styling:**
- Width/Height: 4px
- Background: transparent (primary on hover)
- Cursor: `col-resize` or `row-resize`

#### Step 5.2: Layout State Management
**File**: `src/components/dashboard/ProjectDashboard.tsx`

**State to manage:**
- [x] Items list width
- [x] Right pane visibility
- [x] Right pane width (if visible)
- [x] Main pane split state
- [x] Main pane split ratio
- [x] Right pane split state (if visible)
- [x] Right pane split ratio (if visible)

**Persistence:**
- [x] Save layout preferences to localStorage (optional, future)
- [x] Restore on mount (optional, future)

---

### Phase 6: Integration & Data Flow

#### Step 6.1: Update MainContent Router
**File**: `src/components/dashboard/layout/MainContent.tsx`

**Changes:**
- [x] Add project dashboard route
- [x] Handle project click → navigate to dashboard
- [x] Pass project data

**Routing logic:**
```typescript
if (activeView === 'projects' && selectedProjectId) {
  return <ProjectDashboard project={selectedProject} onBack={() => setSelectedProjectId(null)} />;
}
```

#### Step 6.2: Data Fetching
**File**: `src/components/dashboard/ProjectDashboard.tsx`

**Data needed:**
- [x] Project details
- [x] Collections for project
- [x] Items for project/collection
- [x] Item counts per collection

**Hooks:**
```typescript
const collections = useMemo(() => 
  collections.filter(c => c.projectIds.includes(project.id)),
  [collections, project.id]
);

const items = useMemo(() => {
  let filtered = items.filter(i => {
    const itemCollections = i.collectionIds || [];
    return itemCollections.some(cid => 
      collections.some(c => c.id === cid && c.projectIds.includes(project.id))
    );
  });
  
  if (selectedCollectionId !== 'all') {
    filtered = filtered.filter(i => i.collectionIds.includes(selectedCollectionId));
  }
  
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(i => 
      i.title.toLowerCase().includes(q) ||
      i.url?.toLowerCase().includes(q) ||
      i.notes?.toLowerCase().includes(q)
    );
  }
  
  return filtered;
}, [items, collections, project.id, selectedCollectionId, searchQuery]);
```

#### Step 6.3: Item Actions
**File**: `src/components/dashboard/ProjectDashboard.tsx`

**Handlers:**
- [x] `handleItemClick`: Open item as tab
- [x] `handleNewItem`: Create new item (bookmark)
- [x] `handleTabClose`: Remove tab
- [x] `handleTabSelect`: Switch active tab
- [x] `handleQuickAction`: Open quick action as tab
- [x] `handleSplit`: Split pane vertically
- [x] `handleUnsplit`: Merge split panes

---

### Phase 7: Styling & Polish

#### Step 7.1: Create Theme/CSS Module
**File**: `src/components/dashboard/ProjectDashboard.module.css` (or use styled-components)

**Styles needed:**
- [x] Dark theme colors
- [x] global tokens; primetives and some  styling
- [x] Glass morphism effects (partial - bg-glass, backdrop-filter in some components)
- [x] Typography (font-family, sizes via CSS vars)
- [x] Spacing (via theme tokens and CSS vars)
- [ ] Animations (fade-in, etc.)
- [x] Custom scrollbars (global.css has scrollbar styles)

#### Step 7.2: Responsive Behavior
- [ ] Handle small screens (collapse sidebar?)
- [ ] Minimum widths for panes
- [ ] Touch-friendly resizers (optional)

#### Step 7.3: Animations
- [ ] Fade-in on mount
- [ ] Smooth tab transitions
- [ ] Resize animations (optional, can be instant)

---

### Phase 8: Advanced Features (Future)

#### Step 8.1: Tab Dragging
- [x] Make tabs draggable (HTML5 drag API)
- [x] Drop zones in other panes (all 4 spaces support drag-and-drop)
- [x] Visual feedback during drag (ghost image, drop zone highlighting, opacity changes)
- [x] Tab reordering within same space by dragging
- [x] Automatic space management (tabs removed from source when moved)

#### Step 8.2: Right Pane Toggle
- [x] "+ Add Right" button in header
- [x] Toggle right pane visibility
- [x] Independent tab management for right pane

#### Step 8.3: Layout Persistence
- [x] Save layout state to localStorage
- [x] Restore on project open
- [ ] Per-project layouts (future)

#### Step 8.4: Quick Actions Implementation
- [ ] Pinned items (add `pinned` field to Item?)
- [x] Recent items (sort by `updated_at` - implemented, shows in quick action tab)
- [ ] Favorites (add `favorite` field to Item?)
- [ ] Trash (soft delete?)

---

## 🧪 Testing Checklist

### Functionality
- [x] Click project → Dashboard opens
- [x] Collection pills filter items correctly
- [x] Search filters items in real-time
- [x] Click item → Opens as tab (or focuses if already open)
- [x] Multiple tabs can be open (across all 4 spaces)
- [x] Close tab works
- [x] Switch between tabs works
- [x] Resize items list works (smooth dragging)
- [x] Split pane works (main and right panes can split vertically)
- [x] Quick actions open as tabs
- [x] Back button returns to projects list
- [x] Tab dragging between spaces works
- [x] Tab reordering within space works
- [x] Context menu on items works (right-click)
- [x] Open item in any space works (context menu or Ctrl/Cmd+Click)
- [x] Item highlighting works regardless of which space tab is in

### Data
- [x] Items load correctly for project
- [x] Collections show correct item counts
- [x] Item details display correctly
- [x] Icons map correctly to item types

### UI/UX
- [x] Dark theme applied (with light mode toggle)
- [x] Glass morphism effects visible (partial implementation)
- [x] Active states highlight correctly (across all spaces)
- [x] Hover states work
- [x] Scrollbars styled
- [x] Responsive on different screen sizes (basic support, min widths enforced)

---

## 📝 Implementation Notes

### State Management
- Use React hooks (useState, useMemo, useCallback)
- Consider Context API if state gets complex
- Keep state local to ProjectDashboard initially

### Performance
- Memoize filtered items list
- Virtual scrolling for long item lists (future optimization)
- Lazy load tab content if needed

### Error Handling
- Handle missing project data
- Handle empty collections/items gracefully
- Show loading states

### Accessibility
- Keyboard navigation (Tab, Enter, Escape)
- ARIA labels
- Focus management
- Screen reader support

---

## 🔄 Iteration Plan

### First Pass (MVP)
1. Basic layout structure
2. Collection pills + search
3. Items list
4. Single content panel with tabs
5. Basic item display

### Second Pass
1. ✅ Resizable columns
2. ✅ Vertical splitting
3. ✅ Right pane toggle
4. ✅ Quick actions

### Third Pass
1. ✅ Tab dragging (completed)
2. ✅ Layout persistence (completed)
3. ✅ Context menu (completed)
4. ✅ Smart item highlighting (completed)
5. ✅ Open in any space (completed)
6. ⏳ Advanced quick actions (pinned/favorites/trash - pending)
7. ⏳ Polish & animations (pending)

---

## 📚 Reference Files

### Mockup Files
- `ui_mocks/src/components/ProjectDashboard.js` - View #6 implementation
- `ui_mocks/src/style.css` - Design system
- `ui_mocks/src/data.js` - Data structure reference

### Current App Files
- `src/components/dashboard/ProjectDashboard.tsx` - Main dashboard component
- `src/components/dashboard/TabBar.tsx` - Tab bar with drag-and-drop support
- `src/components/dashboard/ItemsListPanel.tsx` - Items list with context menu
- `src/components/dashboard/ItemContextMenu.tsx` - Context menu component
- `src/components/dashboard/layout/MainContent.tsx` - Current projects view
- `src/components/dashboard/layout/LeftSidebar.tsx` - Navigation
- `src/lib/db.ts` - Data models
- `src/App.tsx` - Main app structure

---

## ✅ Session Completion Checklist

After each session, update:
- [ ] What was completed
- [ ] What's next
- [ ] Any blockers or questions
- [ ] Files modified/created

### Recent Session Achievements (Latest)

**Completed:**
- ✅ Tab dragging between all 4 spaces with visual feedback
- ✅ Tab reordering within spaces
- ✅ Context menu on items (right-click) with full actions
- ✅ Smart item highlighting (works across all spaces)
- ✅ Open items in any available space (context menu or Ctrl/Cmd+Click)
- ✅ Fixed item highlighting when tabs are in non-primary spaces

**Files Modified:**
- `src/components/dashboard/TabBar.tsx` - Added drag-and-drop support
- `src/components/dashboard/ProjectDashboard.tsx` - Tab movement logic, item highlighting fixes
- `src/components/dashboard/ItemsListPanel.tsx` - Context menu integration
- `src/components/dashboard/ItemContextMenu.tsx` - New component for item actions

**Next Steps:**
- Advanced quick actions (pinned/favorites/trash)
- Animations and polish
- Per-project layout preferences

---

## 🚨 Important Notes

### Gradual Migration Strategy
- **Don't break existing functionality** - Keep Workspaces, Collections, Notes, Bookmarks working
- **Phase 0 is critical** - Must complete before starting Phase 1
- **Test after each phase** - Verify nothing broke
- **Incremental changes** - Small, testable steps

### What We're NOT Changing (Yet)
- Workspaces functionality (save, restore, etc.)
- Collections management
- Notes functionality
- Bookmarks functionality
- Data models
- Database structure

### What We ARE Changing
- Layout structure (remove bottom panel split)
- Navigation (add Home, move Tab Commander)
- Add new Project Dashboard view
- Tab Commander becomes full-page view

---

*This document should be updated as implementation progresses. Each phase can be done in separate sessions.*

