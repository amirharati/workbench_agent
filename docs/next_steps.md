# Next Steps & Priorities

## Current Status Summary

**✅ Completed:**
- Tab Commander (live tab management)
- Workspaces (save/restore browser sessions)
- Bookmarks (Items) with Collections
- Export/Import functionality
- Basic UI structure (Dashboard, Side Panel)

**⏳ Next Priority:**
Define and implement the core data model relationships between Projects, Collections, Bookmarks (Items), and Notes so we can build UI and features without rethinking the foundation.

---

## Phase 1: Data Model Definition & Implementation

### Goal
Establish a data model for Projects, Collections, Bookmarks (Items), and Notes with clear relationships.

### Decisions Needed

#### Projects vs Collections Relationship
- How do Projects and Collections relate?
- Can a Project contain Collections?
- Can a bookmark be in a Collection AND linked to a Project?
- What fields should Projects have? (name, description, status, timestamps, etc.)

#### Current State
- **Collections**: Simple folders for Bookmarks (one bookmark = one collection)
- **Bookmarks (Items)**: Have `collectionId`, `tags`, `notes` field
- **Projects**: Not yet implemented
- **Notes**: Not yet implemented

### Data Model to Define

**To be defined:**
- Project interface (fields, relationships)
- Note interface (fields, relationships)
- How to extend Item interface for linking
- Relationship cardinality (one-to-many vs many-to-many)

### Implementation Plan

#### Step 1: Add Projects Store
- [ ] Add `projects` object store to IndexedDB schema
- [ ] Create `Project` interface
- [ ] Add CRUD helpers: `getAllProjects`, `addProject`, `updateProject`, `deleteProject`
- [ ] Add indexes: `by-name`, `by-status`, `by-updated`

#### Step 2: Add Notes Store
- [ ] Add `notes` object store to IndexedDB schema
- [ ] Create `Note` interface
- [ ] Add CRUD helpers: `getAllNotes`, `addNote`, `updateNote`, `deleteNote`
- [ ] Add indexes: `by-project`, `by-updated`, `by-title`

#### Step 3: Extend Items (Bookmarks)
- [ ] Add `projectIds: string[]` field to `Item` interface
- [ ] Add `noteIds: string[]` field to `Item` interface
- [ ] Update database migration (version bump)
- [ ] Update existing items to have empty arrays for new fields

#### Step 4: Add Linking Helpers
- [ ] `linkItemToProject(itemId, projectId)` / `unlinkItemFromProject`
- [ ] `linkItemToNote(itemId, noteId)` / `unlinkItemFromNote`
- [ ] `linkNoteToProject(noteId, projectId)` / `unlinkNoteFromProject`
- [ ] `getItemsByProject(projectId)`
- [ ] `getNotesByProject(projectId)`
- [ ] `getItemsByNote(noteId)`

#### Step 5: Update Export/Import
- [ ] Include `projects` and `notes` in export
- [ ] Handle migration of existing data during import

---

## Phase 2: Basic UI Implementation

Once data model is stable, build minimal UI for:

### Projects View
- [ ] List projects
- [ ] Create new project
- [ ] Edit project
- [ ] Delete project
- [ ] View project details

### Notes View
- [ ] List notes
- [ ] Create note (manual or from page)
- [ ] Edit note
- [ ] Delete note
- [ ] Link/unlink bookmarks to note
- [ ] Note editor

### Linking UI
- [ ] In Bookmarks view: show linked projects/notes, allow linking
- [ ] In Notes view: show linked bookmarks, allow linking
- [ ] In Projects view: show linked bookmarks and notes

---

## Phase 3: Polish & Enhancements

- [ ] Note editor improvements
- [ ] Visual relationship graphs
- [ ] Enhanced search (across projects, notes, bookmarks)
- [ ] Bulk operations

---

## Phase 4: AI & Advanced Features

- [ ] AI chat interface
- [ ] Context assembly (current page + related bookmarks/notes/projects)
- [ ] AI-powered organization suggestions
- [ ] Dropbox sync/backup

---

## Questions to Resolve

1. **Projects ↔ Collections**: How do they relate? Can projects contain collections? Are they separate?

2. **Note Content Format**: Plain text or markdown?

3. **Page Context in Notes**: What context to capture? (URL, title, content, selection?)

4. **Project Status**: Do we need status field? What values?

5. **Relationship Cardinality**: 
   - Can a bookmark link to multiple projects? (many-to-many)
   - Can a bookmark link to multiple notes? (many-to-many)
   - Can a note belong to multiple projects? (many-to-many or one-to-many)

