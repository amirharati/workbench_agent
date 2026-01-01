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
- [ ] Add new view types: `'home' | 'tab-commander'`
- [ ] Update `DashboardView` type:
```typescript
export type DashboardView = 'home' | 'projects' | 'bookmarks' | 'notes' | 'collections' | 'workspaces' | 'tab-commander';
```

#### Step 0.2: Update Left Sidebar Navigation
**File**: `src/components/dashboard/layout/LeftSidebar.tsx`

**Changes:**
- [ ] Add "Home" nav item (first in list)
- [ ] Add "Tab Commander" nav item (after Projects)
- [ ] Keep all existing items (Projects, Bookmarks, Workspaces, Notes, Collections)
- [ ] Update icons if needed

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
- [ ] Import Home icon from lucide-react
- [ ] Import Terminal or appropriate icon for Tab Commander
- [ ] Add new nav items to array
- [ ] Test navigation still works for all views

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
- [ ] Create new file
- [ ] Copy BottomPanel logic (or refactor to share components)
- [ ] Make it full-page (no bottom panel constraints)
- [ ] Keep all existing functionality (search, tabs, workspaces, etc.)
- [ ] Test all features work

#### Step 0.4: Update MainContent to Handle New Views
**File**: `src/components/dashboard/layout/MainContent.tsx`

**Changes:**
- [ ] Add case for `'home'` view (placeholder for now)
- [ ] Add case for `'tab-commander'` view → render `TabCommanderView`
- [ ] Keep all existing views working (bookmarks, notes, collections, workspaces)

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
- [ ] Import TabCommanderView
- [ ] Add routing cases
- [ ] Create placeholder HomeView component
- [ ] Test all views still work

#### Step 0.5: Remove Bottom Panel from DashboardLayout
**File**: `src/components/dashboard/layout/DashboardLayout.tsx`

**Changes:**
- [ ] Remove BottomPanel import
- [ ] Remove bottom panel state (isBottomPanelCollapsed, bottomPanelHeight, etc.)
- [ ] Remove bottom panel JSX
- [ ] Remove resize handle for bottom panel
- [ ] Make main content area take full height (remove flex column split)

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
- [ ] Remove BottomPanel component usage
- [ ] Remove bottom panel state
- [ ] Remove resize logic for bottom panel
- [ ] Update layout to single column
- [ ] Test layout looks correct

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
- [ ] Create simple placeholder component
- [ ] Add to MainContent routing
- [ ] Test navigation works

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

#### Step 1.1: Create Project Dashboard Component
**File**: `src/components/dashboard/ProjectDashboard.tsx`

**Structure:**
```typescript
interface ProjectDashboardProps {
  project: Project;
  onBack: () => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ project, onBack }) => {
  // State management
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsListWidth, setItemsListWidth] = useState(280);
  const [rightPaneVisible, setRightPaneVisible] = useState(false);
  const [mainPaneTabs, setMainPaneTabs] = useState<Tab[]>([]);
  const [activeMainTab, setActiveMainTab] = useState<string | null>(null);
  
  // Data
  const collections = useMemo(() => /* filter by project */, [project]);
  const items = useMemo(() => /* filter by collection + search */, [selectedCollectionId, searchQuery]);
  
  return (
    <div className="project-dashboard">
      <ProjectDashboardHeader 
        collections={collections}
        selectedCollectionId={selectedCollectionId}
        onCollectionSelect={setSelectedCollectionId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onQuickAction={handleQuickAction}
      />
      <div className="dashboard-content">
        <ItemsListPanel 
          width={itemsListWidth}
          items={items}
          onItemClick={handleItemClick}
          onNewItem={handleNewItem}
        />
        <Resizer 
          onResize={setItemsListWidth}
          minWidth={150}
        />
        <ContentPanel 
          tabs={mainPaneTabs}
          activeTab={activeMainTab}
          onTabSelect={setActiveMainTab}
          onTabClose={handleTabClose}
          onSplit={handleSplit}
        />
        {rightPaneVisible && (
          <>
            <Resizer onResize={...} />
            <ContentPanel ... />
          </>
        )}
      </div>
    </div>
  );
};
```

**Tasks:**
- [ ] Create component file
- [ ] Set up basic layout structure
- [ ] Add state management hooks
- [ ] Wire up data fetching (collections, items)
- [ ] Add basic styling (dark theme)

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
- [ ] Add route for project dashboard
- [ ] When project clicked, navigate to dashboard
- [ ] Pass project data to ProjectDashboard component

---

### Phase 2: Header Components

#### Step 2.1: Collection Pills
**File**: `src/components/dashboard/CollectionPills.tsx`

**Features:**
- [ ] Display "All" pill with total count
- [ ] Display collection pills with item counts
- [ ] Active state styling (primary background)
- [ ] Click handler to filter items

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
- [ ] Input with search icon
- [ ] Placeholder: "⌘K to search..."
- [ ] Clear button (appears when text entered)
- [ ] Real-time filtering
- [ ] Keyboard shortcut (⌘K) to focus

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
- [ ] Buttons: Pinned, Recent, Favorites, Trash
- [ ] Click opens as tab in content panel
- [ ] Placeholder content for now (can be enhanced later)

**Props:**
```typescript
interface QuickActionsProps {
  onAction: (action: 'pinned' | 'recent' | 'favorites' | 'trash') => void;
}
```

#### Step 2.4: Dashboard Header (Container)
**File**: `src/components/dashboard/ProjectDashboardHeader.tsx`

**Features:**
- [ ] Combines CollectionPills, SearchBar, QuickActions
- [ ] Layout: Pills | Search (flex: 1) | Quick Actions
- [ ] Responsive wrapping
- [ ] Back button (optional, or in main header)

---

### Phase 3: Items List Panel

#### Step 3.1: Items List Component
**File**: `src/components/dashboard/ItemsListPanel.tsx`

**Features:**
- [ ] Header: Item count + "+ New" button
- [ ] Scrollable list of items
- [ ] Item display:
  - Icon (based on source type)
  - Title (truncated)
  - Date (formatted)
  - Context menu (⋮) on hover
- [ ] Active item highlighting
- [ ] Click to open in content panel

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
- [ ] Display tabs horizontally
- [ ] Active tab highlighting
- [ ] Close button (×) on each tab
- [ ] Tab title truncation
- [ ] Click to switch tabs
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
- [ ] Render content based on tab type
- [ ] Item tabs: Show item details (title, url, notes, etc.)
- [ ] System tabs: Show placeholder or actual content
- [ ] Scrollable content area

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
- [ ] Vertical resizer (for columns)
- [ ] Horizontal resizer (for split panes)
- [ ] Hover effect (turns primary color)
- [ ] Drag to resize
- [ ] Min/max constraints

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
- [ ] Items list width
- [ ] Right pane visibility
- [ ] Right pane width (if visible)
- [ ] Main pane split state
- [ ] Main pane split ratio
- [ ] Right pane split state (if visible)
- [ ] Right pane split ratio (if visible)

**Persistence:**
- [ ] Save layout preferences to localStorage (optional, future)
- [ ] Restore on mount (optional, future)

---

### Phase 6: Integration & Data Flow

#### Step 6.1: Update MainContent Router
**File**: `src/components/dashboard/layout/MainContent.tsx`

**Changes:**
- [ ] Add project dashboard route
- [ ] Handle project click → navigate to dashboard
- [ ] Pass project data

**Routing logic:**
```typescript
if (activeView === 'projects' && selectedProjectId) {
  return <ProjectDashboard project={selectedProject} onBack={() => setSelectedProjectId(null)} />;
}
```

#### Step 6.2: Data Fetching
**File**: `src/components/dashboard/ProjectDashboard.tsx`

**Data needed:**
- [ ] Project details
- [ ] Collections for project
- [ ] Items for project/collection
- [ ] Item counts per collection

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
- [ ] `handleItemClick`: Open item as tab
- [ ] `handleNewItem`: Create new item (bookmark)
- [ ] `handleTabClose`: Remove tab
- [ ] `handleTabSelect`: Switch active tab
- [ ] `handleQuickAction`: Open quick action as tab
- [ ] `handleSplit`: Split pane vertically
- [ ] `handleUnsplit`: Merge split panes

---

### Phase 7: Styling & Polish

#### Step 7.1: Create Theme/CSS Module
**File**: `src/components/dashboard/ProjectDashboard.module.css` (or use styled-components)

**Styles needed:**
- [ ] Dark theme colors
- [ ] Glass morphism effects
- [ ] Typography
- [ ] Spacing
- [ ] Animations (fade-in, etc.)
- [ ] Custom scrollbars

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
- [ ] Make tabs draggable
- [ ] Drop zones in other panes
- [ ] Visual feedback during drag

#### Step 8.2: Right Pane Toggle
- [ ] "+ Add Right" button in header
- [ ] Toggle right pane visibility
- [ ] Independent tab management for right pane

#### Step 8.3: Layout Persistence
- [ ] Save layout state to localStorage
- [ ] Restore on project open
- [ ] Per-project layouts (future)

#### Step 8.4: Quick Actions Implementation
- [ ] Pinned items (add `pinned` field to Item?)
- [ ] Recent items (sort by `updated_at`)
- [ ] Favorites (add `favorite` field to Item?)
- [ ] Trash (soft delete?)

---

## 🧪 Testing Checklist

### Functionality
- [ ] Click project → Dashboard opens
- [ ] Collection pills filter items correctly
- [ ] Search filters items in real-time
- [ ] Click item → Opens as tab
- [ ] Multiple tabs can be open
- [ ] Close tab works
- [ ] Switch between tabs works
- [ ] Resize items list works
- [ ] Split pane works (if implemented)
- [ ] Quick actions open as tabs
- [ ] Back button returns to projects list

### Data
- [ ] Items load correctly for project
- [ ] Collections show correct item counts
- [ ] Item details display correctly
- [ ] Icons map correctly to item types

### UI/UX
- [ ] Dark theme applied
- [ ] Glass morphism effects visible
- [ ] Active states highlight correctly
- [ ] Hover states work
- [ ] Scrollbars styled
- [ ] Responsive on different screen sizes

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
1. Resizable columns
2. Vertical splitting
3. Right pane toggle
4. Quick actions

### Third Pass
1. Tab dragging
2. Layout persistence
3. Advanced quick actions
4. Polish & animations

---

## 📚 Reference Files

### Mockup Files
- `ui_mocks/src/components/ProjectDashboard.js` - View #6 implementation
- `ui_mocks/src/style.css` - Design system
- `ui_mocks/src/data.js` - Data structure reference

### Current App Files
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

