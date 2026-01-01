# Workbench Agent - Development Backlog

> **Note**: This is a personal project focused on functionality over perfection. We're vibecoding and iterating quickly. Code quality will improve organically as we build features.

## Priority Guidelines
- **High**: Blocks functionality or causes data loss/corruption
- **Medium**: Improves UX or prevents common issues
- **Low**: Nice to have, can wait

---

## 🔴 High Priority

### ✅ Data Safety & Backup System
**Status**: Completed  
**Impact**: Prevents data loss during imports/migrations  
**Effort**: Medium

- [x] Add automatic backup before import operations
- [x] Add backup verification function
- [x] Improve export filename with full timestamp
- [x] Add user confirmation with stats before import
- [x] Create backup utility module
- [x] Use transactions for atomic imports
- [x] Attempt automatic backup before database migrations (best effort)
- [x] Add migration warnings in console

**Files updated**:
- `src/lib/db.ts` - Added `verifyBackup`, improved `importDB`, added migration backup attempt
- `src/App.tsx` - Updated `handleExport` and `handleImport` with safety checks
- `src/lib/backup.ts` - New backup utility module

**Note**: Automatic migration backup is best-effort (uses IndexedDB.databases() API when available). 
**Always manually backup before major code updates** using the Backup button for maximum safety.

### Error Handling
**Status**: Not Started  
**Impact**: Users lose work silently, poor UX  
**Effort**: Medium

- [ ] Add try/catch blocks to all async operations in `App.tsx`
- [ ] Add error handling to database operations in `db.ts`
- [ ] Show user-friendly error messages instead of silent failures
- [ ] Handle Chrome API failures gracefully (tabs, windows)

**Files to update**:
- `src/App.tsx` - All handler functions
- `src/lib/db.ts` - CRUD operations
- `src/components/dashboard/layout/MainContent.tsx` - Async operations

---

### Database Transaction Safety
**Status**: Not Started  
**Impact**: Data corruption risk  
**Effort**: Medium

- [ ] Wrap `deleteCollection` in a transaction
- [ ] Wrap `deleteProject` in a transaction
- [ ] Review other multi-step DB operations for transaction safety

**Files to update**:
- `src/lib/db.ts` - `deleteCollection`, `deleteProject`, and related operations

---

### Input Validation
**Status**: Not Started  
**Impact**: Invalid data, crashes  
**Effort**: Low

- [ ] Add URL validation utility function
- [ ] Validate collection IDs exist before using
- [ ] Add basic length limits for text inputs
- [ ] Sanitize user input before saving

**Files to create**:
- `src/lib/validation.ts` - Validation utilities

**Files to update**:
- `src/App.tsx` - `handleAddBookmark`, `handleSaveCurrentTab`
- `src/components/dashboard/layout/MainContent.tsx` - Form handlers

---

## 🟡 Medium Priority

### Loading States
**Status**: Not Started  
**Impact**: Better UX, users know when things are happening  
**Effort**: Low

- [ ] Add loading spinner/state to `loadData()`
- [ ] Show loading state during bookmark save/update/delete
- [ ] Add loading state to workspace restore operations

**Files to update**:
- `src/App.tsx` - Add `isLoading` state
- `src/components/dashboard/layout/MainContent.tsx` - Show loading indicators

---

### Extract Duplicate Code
**Status**: Not Started  
**Impact**: Easier maintenance  
**Effort**: Low

- [ ] Create `src/lib/utils.ts` with shared utilities:
  - `getDomain(url: string)` - Extract domain from URL
  - `isValidHttpUrl(url: string)` - Validate HTTP(S) URLs
  - `formatDate(timestamp: number)` - Format dates consistently
- [ ] Replace duplicate implementations in components

**Files to create**:
- `src/lib/utils.ts`

**Files to update**:
- `src/components/dashboard/layout/MainContent.tsx`
- `src/components/dashboard/layout/BottomPanel.tsx`

---

### Constants File
**Status**: Not Started  
**Impact**: Easier to change defaults, less magic numbers  
**Effort**: Low

- [ ] Create `src/lib/constants.ts` with:
  - Status timeout (2000ms)
  - Side panel width threshold (500px)
  - Default colors, names
  - Database name/version
- [ ] Replace hardcoded values

**Files to create**:
- `src/lib/constants.ts`

**Files to update**:
- `src/App.tsx`
- `src/lib/db.ts`
- Various components

---

### Memory Leak Prevention
**Status**: Review Needed  
**Impact**: Performance degradation over time  
**Effort**: Low

- [ ] Review all `useEffect` hooks for proper cleanup
- [ ] Verify Chrome API listeners are removed on unmount
- [ ] Check for event listener cleanup in components

**Files to review**:
- `src/App.tsx` - Event listeners
- `src/components/dashboard/layout/BottomPanel.tsx` - Chrome API listeners

---

## 🟢 Low Priority

### Component Splitting
**Status**: Not Started  
**Impact**: Better maintainability, but not blocking  
**Effort**: High

- [ ] Split `MainContent.tsx` (1241 lines) into:
  - `ProjectsView.tsx`
  - `BookmarksView.tsx`
  - `WorkspacesView.tsx`
  - `NotesView.tsx`
- [ ] Split `BottomPanel.tsx` (1705 lines) into:
  - `TabList.tsx`
  - `TabGallery.tsx`
  - `WindowList.tsx`
  - `WorkspaceSaveMenu.tsx`

**Note**: Can be done incrementally as we work on UI updates

---

### Styling Refactor
**Status**: Will be addressed during UI update  
**Impact**: Better maintainability  
**Effort**: Medium

- [ ] Move inline styles to CSS modules or styling solution
- [ ] Extract common styles to shared stylesheet
- [ ] Create reusable style utilities

**Note**: This will naturally happen as we implement UI mockups

---

### Type Safety Improvements
**Status**: Not Started  
**Impact**: Better developer experience  
**Effort**: Low

- [ ] Replace `any` types in migration code with proper types
- [ ] Create `LegacyCollection`, `LegacyItem` types for migrations
- [ ] Add stricter types where possible

**Files to update**:
- `src/lib/db.ts` - Migration code

---

### Accessibility
**Status**: Not Started  
**Impact**: Better UX for all users  
**Effort**: Medium

- [ ] Add ARIA labels to buttons and interactive elements
- [ ] Add keyboard navigation support
- [ ] Ensure proper focus management
- [ ] Add screen reader support

**Note**: Can be done incrementally

---

### Documentation
**Status**: Not Started  
**Impact**: Easier onboarding, maintenance  
**Effort**: Low

- [ ] Add JSDoc comments to public functions
- [ ] Document complex logic
- [ ] Add inline comments for non-obvious code

**Note**: Can be done as we work on features

---

### Testing
**Status**: Not Started  
**Impact**: Confidence in changes, catch regressions  
**Effort**: High

- [ ] Set up testing framework (Vitest + React Testing Library)
- [ ] Add unit tests for utility functions
- [ ] Add tests for database operations
- [ ] Add component tests for critical flows

**Note**: Low priority for personal project, but good to have

---

## 🎨 UI Update Related (Will be addressed during mockup implementation)

These will be fixed naturally as we implement the UI mockups:

- [ ] Inline styles → CSS modules/styled components
- [ ] Component organization improvements
- [ ] Consistent spacing and design tokens
- [ ] Responsive design improvements
- [ ] Better visual feedback for actions

---

## 📝 Notes

- **Don't over-optimize**: Focus on functionality first
- **Vibecoding is OK**: Code quality will improve organically
- **Future considerations**: 
  - Local DB/file system integration (later)
  - Potential rewrite if productized (acknowledged)
- **Current focus**: Make it work, make it usable

---

## Quick Wins (Do These First)

1. ✅ Create this backlog
2. ⬜ Add error handling to `handleSaveCurrentTab` and `handleAddBookmark`
3. ⬜ Create `utils.ts` with `getDomain` and `isValidHttpUrl`
4. ⬜ Create `constants.ts` with magic numbers
5. ⬜ Add loading state to `loadData()`

---

*Last updated: [Auto-update on changes]*

