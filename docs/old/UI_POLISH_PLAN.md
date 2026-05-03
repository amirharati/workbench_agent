# UI Polish Plan: IDE-like Dashboard

> **Goal**: Transform the dashboard into a polished, compact, IDE-like interface  
> **Focus**: Project Dashboard first, then apply patterns to other views  
> **Approach**: Systematic updates to spacing, typography, and visual polish

---

## 📋 Current Issues

### 1. Spacing (Primary Issue)
- **Problem**: Using `1.5rem` (24px) as default padding everywhere
- **IDE standard**: 8-12px for most padding
- **Impact**: ~50% less content visible than similar apps

### 2. Typography
- **Font**: Inter is good, but sizes may be too large
- **Line height**: Not optimized for density
- **Weight**: Could use more variation for hierarchy

### 3. Visual Density
- **Item heights**: ~40px when IDE apps use 22-32px
- **Gaps**: 8-12px when IDEs use 2-4px
- **Headers**: Take too much vertical space

### 4. Polish Details
- **Borders**: Too prominent in some places
- **Shadows**: Could be more subtle
- **Hover states**: Not consistent

---

## 🎯 Target Spacing System

```css
/* Compact IDE spacing scale */
--space-xxs: 2px;   /* Tight gaps between related items */
--space-xs: 4px;    /* Small gaps, icon margins */
--space-sm: 8px;    /* Default padding for compact elements */
--space-md: 12px;   /* Panel padding, section gaps */
--space-lg: 16px;   /* Major section spacing (use sparingly) */
/* Avoid 24px+ for general UI - only for page margins */
```

### Spacing Rules
| Element | Current | Target |
|---------|---------|--------|
| Main container padding | 24px | 8px |
| Panel internal padding | 20-24px | 10-12px |
| Tab content padding | 24px | 12px |
| Item padding (vertical) | 10px | 6px |
| Item padding (horizontal) | 12px | 10px |
| Gaps between items | 8px | 4px |
| Section header margin | 24px | 12px |
| Tab bar height | 34px | 28px |

---

## 🔤 Typography System

```css
/* Font stack - keep Inter, it's good for IDEs */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;

/* Sizes - slightly smaller for density */
--text-xs: 0.7rem;    /* 11.2px - labels, metadata */
--text-sm: 0.8rem;    /* 12.8px - secondary text */
--text-base: 0.875rem; /* 14px - body text (not 16px!) */
--text-lg: 1rem;      /* 16px - headings */
--text-xl: 1.125rem;  /* 18px - page titles */

/* Line heights - tighter for density */
--leading-tight: 1.25;
--leading-normal: 1.4;
--leading-relaxed: 1.6;

/* Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
```

---

## 🎨 Visual Polish

### Colors (Keep current, minor tweaks)
```css
/* Borders - make slightly more subtle */
--border: rgba(255, 255, 255, 0.08); /* was 0.12 */
--border-focus: rgba(99, 102, 241, 0.4);

/* Hover states */
--hover-bg: rgba(255, 255, 255, 0.04);
--hover-border: rgba(255, 255, 255, 0.12);

/* Active states */
--active-bg: rgba(99, 102, 241, 0.12);
--active-border: rgba(99, 102, 241, 0.3);
```

### Shadows (More subtle)
```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
--shadow-md: 0 4px 8px rgba(0, 0, 0, 0.12);
--shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.15);
```

### Border Radius (Slightly smaller for IDE feel)
```css
--radius-sm: 4px;  /* was 6px */
--radius-md: 6px;  /* was 9px */
--radius-lg: 8px;  /* was 12px */
```

---

## 📐 Component Updates

### 1. DashboardLayout.tsx
- Main content padding: `24px` → `8px`

### 2. ProjectDashboard.tsx
- Header padding: reduce
- Control strip padding: reduce
- Grid gaps: reduce

### 3. ItemsListPanel.tsx
- Panel padding: `8px` → `6px`
- Item padding: `10px 12px` → `6px 10px`
- Header height: reduce
- Font sizes: reduce

### 4. TabBar.tsx
- Height: `34px` → `28px`
- Tab padding: reduce
- Gap: `4px` → `2px`
- Font size: reduce

### 5. TabContent.tsx
- Content padding: `24px` → `12px`
- Margins: reduce

### 6. CollectionPills.tsx
- Pill padding: reduce
- Gap: reduce
- Font size: reduce

### 7. SearchBar.tsx
- Input padding: reduce
- Height: reduce

### 8. QuickActions.tsx
- Button padding: reduce
- Gap: reduce

### 9. LeftSidebar.tsx
- Item padding: reduce
- Section padding: reduce

---

## 🔧 Implementation Order

### Phase 1: Global CSS Variables ✅ DONE
1. ✅ Update `global.css` with new spacing/typography variables
2. ✅ Add new CSS custom properties
3. ✅ Update `theme.ts` with compact spacing tokens
4. ✅ Update `primitives.tsx` with compact component styles

### Phase 2: Core Layout (DashboardLayout) ✅ DONE
1. ✅ Reduce main container padding (24px → 8px)
2. ✅ Reduce sidebar width (256px → 200px)
3. ✅ Use CSS font variables

### Phase 3: Project Dashboard Components ✅ DONE
1. ✅ ItemsListPanel - compact items (28px height, tighter padding)
2. ✅ TabBar - compact tabs (28px height, smaller text)
3. ✅ CollectionPills - compact pills (24px height)
4. ✅ SearchBar - compact input (26px height)
5. ✅ QuickActions - compact buttons (24px height)
6. ✅ Header area - reduced spacing, smaller text

### Phase 4: Left Sidebar ✅ DONE
1. ✅ Compact nav items (28px height)
2. ✅ Reduce padding (6px)
3. ✅ Smaller icons (16px)
4. ✅ Compact header (36px)

### Phase 5: Other Views (Future)
1. ⏳ Bookmarks view
2. ⏳ Collections view
3. ⏳ Notes view
4. ⏳ Tab Commander view

---

## ✅ Success Criteria

- [x] Dashboard feels "IDE-like" - compact and efficient
- [x] More content visible on screen
- [x] Visual hierarchy is clear
- [x] Consistent spacing throughout
- [x] Hover/active states are polished
- [x] Typography is readable but compact
- [x] Works well in both light and dark themes

---

## 🆕 Additional Improvements (Just Added)

### Collection Overflow Handling
When there are many collections, instead of showing all pills (which takes space):
- Show first 4 collections as visible pills
- Show "+N more" dropdown for the rest
- Dropdown displays all overflow collections with hover selection
- Selected collection in overflow is highlighted

### Workspace Selector (Placeholder)
Added a workspace linking UI to the dashboard:
- Shows linked workspaces as pills (max 2 visible)
- Dropdown to link/unlink workspaces to the project
- Click linked workspace to open it (placeholder action)
- Allows creating new workspaces (placeholder)

**Files Added/Updated:**
- `src/components/dashboard/CollectionPills.tsx` - Added overflow dropdown
- `src/components/dashboard/WorkspaceSelector.tsx` - New component
- `src/components/dashboard/ProjectDashboard.tsx` - Integrated WorkspaceSelector

---

## 📝 Notes

- Keep functionality unchanged - this is purely visual
- Test in both themes after changes
- Compare with VS Code/Linear/Figma for reference
- Can be done incrementally - each component independently


