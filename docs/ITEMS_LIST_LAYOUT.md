# Items List Layout Options

> **Goal**: Provide flexible layout options for the items list to solve crowding issues and maximize screen space  
> **Status**: Planning → Implementation

---

## 🎯 Problem Statement

For long lists of items, the current left sidebar layout becomes crowded:
- Narrow width limits item title/URL visibility
- Making sidebar narrower makes it worse
- Long lists require excessive scrolling
- Grid view not practical in narrow sidebar

## 💡 Solution: Multiple Layout Options

Allow users to choose between different items list layouts:
1. **Left Sidebar** (current) - Vertical list on left
2. **Top Horizontal** - Horizontal list/grid at top
3. **Toggle between** - Quick switch via button
4. **Drag-and-drop** - Move items list between positions

---

## 📐 Layout Options

### Option 1: Left Sidebar (Current)
```
┌──────┬──────────────────────────┐
│Items │ Tab Bar                  │
│List  │ Tab Content              │
│      │                          │
│      │                          │
└──────┴──────────────────────────┘
```

**Characteristics:**
- Vertical list on left
- Resizable width (200-600px)
- Vertical scrolling
- Always visible
- Good for: Quick scanning, familiar IDE pattern

### Option 2: Top Horizontal List
```
┌──────────────────────────────────┐
│ Items: [Item] [Item] [Item]...  │ ← Horizontal scroll
│ ─────────────────────────────────│
│ Tab Bar                           │
│ Tab Content                       │
└──────────────────────────────────┘
```

**Characteristics:**
- Horizontal scrollable list at top
- Resizable height (100-300px)
- Horizontal scrolling
- More width for content area
- Good for: Long item titles, wide screens

### Option 3: Top Grid View
```
┌──────────────────────────────────┐
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐        │
│ │I │ │I │ │I │ │I │ │I │        │ ← Grid cards
│ └──┘ └──┘ └──┘ └──┘ └──┘        │
│ ─────────────────────────────────│
│ Tab Content                       │
└──────────────────────────────────┘
```

**Characteristics:**
- Grid of item cards at top
- Resizable height (150-400px)
- Horizontal + vertical scrolling
- Visual browsing
- Good for: Visual items, thumbnails, card-based browsing

---

## 🎨 Implementation Design

### Layout State Management

```typescript
type ItemsListLayout = 'left' | 'top-list' | 'top-grid';

interface LayoutState {
  itemsLayout: ItemsListLayout;
  leftWidth: number;        // When layout is 'left'
  topHeight: number;        // When layout is 'top-*'
  topViewMode: 'list' | 'grid'; // For top layout
}
```

### Toggle Mechanism

**Button in Header:**
- Icon button in ProjectDashboard header
- Cycles through: Left → Top List → Top Grid → Left
- Shows current layout icon
- Tooltip: "Switch items layout"

**Keyboard Shortcut:**
- `Cmd/Ctrl + Shift + L` - Toggle layout
- Cycles through options

### Drag-and-Drop Mechanism

**Drag Handle:**
- Small drag handle on items list panel
- When dragged:
  - If dragged left → moves to left sidebar
  - If dragged up → moves to top horizontal
  - Visual feedback during drag
  - Snaps to position on drop

**Visual Feedback:**
- Drop zones highlight when dragging
- Preview of layout change
- Smooth transition animation

---

## 🔧 Technical Implementation

### Component Structure

```
ProjectDashboard
├── Layout Toggle Button (header)
├── ItemsListPanel (conditional rendering)
│   ├── If 'left': Left sidebar with vertical resizer
│   ├── If 'top-list': Top panel with horizontal resizer
│   └── If 'top-grid': Top panel with grid layout
└── Tab Content Area (adjusts based on layout)
```

### Layout Rendering Logic

**Left Sidebar:**
```typescript
// Current implementation
<div style={{ display: 'grid', gridTemplateColumns: `${listWidth}px 4px 1fr` }}>
  <ItemsListPanel />
  <Resizer direction="vertical" />
  <TabContent />
</div>
```

**Top Horizontal:**
```typescript
<div style={{ display: 'flex', flexDirection: 'column' }}>
  <div style={{ height: `${topHeight}px`, overflowX: 'auto' }}>
    <ItemsListPanel layout="horizontal" />
  </div>
  <Resizer direction="horizontal" />
  <TabContent />
</div>
```

**Top Grid:**
```typescript
<div style={{ display: 'flex', flexDirection: 'column' }}>
  <div style={{ 
    height: `${topHeight}px`, 
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '8px',
    overflowY: 'auto'
  }}>
    {items.map(item => <ItemCard key={item.id} item={item} />)}
  </div>
  <Resizer direction="horizontal" />
  <TabContent />
</div>
```

### ItemsListPanel Modifications

**New Props:**
```typescript
interface ItemsListPanelProps {
  // ... existing props
  layout?: 'vertical' | 'horizontal' | 'grid';
  onLayoutChange?: (layout: ItemsListLayout) => void;
}
```

**Conditional Rendering:**
- `layout === 'vertical'`: Current vertical list
- `layout === 'horizontal'`: Horizontal scrollable list
- `layout === 'grid'`: Grid of cards

### Persistence

**Local Storage:**
```typescript
const LAYOUT_KEY = `pd-items-layout-${project.id}`;

// Save on change
localStorage.setItem(LAYOUT_KEY, JSON.stringify({
  itemsLayout,
  leftWidth,
  topHeight,
  topViewMode
}));

// Load on mount
const saved = localStorage.getItem(LAYOUT_KEY);
if (saved) {
  const layout = JSON.parse(saved);
  setItemsLayout(layout.itemsLayout);
  // ... restore other values
}
```

---

## 📋 Implementation Checklist

### Phase 1: Basic Toggle (Left ↔ Top List)
- [ ] Add layout state to `ProjectDashboard`
- [ ] Add toggle button in header
- [ ] Implement conditional rendering for left vs top
- [ ] Add horizontal resizer for top layout
- [ ] Modify `ItemsListPanel` to support horizontal layout
- [ ] Persist layout preference
- [ ] Test layout switching

### Phase 2: Grid View
- [ ] Add grid layout option to state
- [ ] Create `ItemCard` component for grid
- [ ] Implement grid rendering in `ItemsListPanel`
- [ ] Add grid-specific styling
- [ ] Test grid view

### Phase 3: Drag-and-Drop
- [ ] Add drag handle to `ItemsListPanel`
- [ ] Implement drag detection
- [ ] Add drop zones (left/top indicators)
- [ ] Handle layout change on drop
- [ ] Add visual feedback during drag
- [ ] Test drag-and-drop

### Phase 4: Polish
- [ ] Add smooth transitions
- [ ] Keyboard shortcuts
- [ ] Tooltips and help text
- [ ] Responsive behavior
- [ ] Edge case handling

---

## 🎨 UI/UX Details

### Toggle Button

**Location:** ProjectDashboard header, next to layout controls

**Icon States:**
- Left sidebar: `LayoutVertical` or `Sidebar` icon
- Top list: `LayoutHorizontal` or `List` icon
- Top grid: `Grid` or `LayoutGrid` icon

**Tooltip:**
- "Items layout: Left sidebar" / "Top list" / "Top grid"
- "Click to switch layout (Cmd+Shift+L)"

### Drag Handle

**Visual:**
- Small grip icon (6 dots) in top-left of items panel
- Only visible on hover
- Cursor: `grab` / `grabbing`

**Behavior:**
- Click and drag to move panel
- Drop zones appear when dragging
- Smooth animation on drop

### Drop Zones

**Left Drop Zone:**
- Highlight left edge of screen
- Show preview: "Move to left sidebar"

**Top Drop Zone:**
- Highlight top edge
- Show preview: "Move to top"

---

## 🔄 Migration & Backwards Compatibility

**Existing Users:**
- Default to 'left' layout (current behavior)
- No breaking changes
- Layout preference saved per project

**Data Migration:**
- No database changes needed
- Only localStorage for preferences

---

## 📊 Success Criteria

- [ ] Users can toggle between left and top layouts
- [ ] Layout preference persists per project
- [ ] Top layout provides more horizontal space
- [ ] Grid view works for visual browsing
- [ ] Drag-and-drop feels natural
- [ ] No performance issues with layout switching
- [ ] Works in both light and dark themes

---

## 🚀 Future Enhancements

- **Collapsible top panel**: Minimize to bar, expand on click
- **Split view**: Items on both left and top simultaneously
- **Custom layouts**: User-defined positions
- **Layout presets**: Save/load layout configurations
- **Per-collection layouts**: Different layout per collection filter

---

## 📝 Notes

- Start with Phase 1 (basic toggle) for MVP
- Grid view can come later if needed
- Drag-and-drop is nice-to-have, not essential
- Focus on solving the crowding problem first
- Keep it simple - don't over-engineer

