# Data Model Design

## Overview

This document defines the core data model for Workbench Agent, designed to support both current IndexedDB storage and future file-based/API interoperability with external tools (Notion, coding editors, etc.).

## Core Principle

Design for serialization and interoperability. The model should:
- Export cleanly to JSON/files
- Map naturally to folder structures (if needed later)
- Be queryable via APIs (if needed later)
- Work with external tools (Notion, editors, etc.)

---

## Data Model

### Projects

Top-level organizational containers. A default project exists to represent an \"All\" view.

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean; // Special built-in project (e.g., "All")
  created_at: number;
  updated_at: number;
}
```

**Properties:**
- `id`: Unique identifier (UUID)
- `name`: Project name (unique)
- `description`: Optional project description
- `isDefault`: Boolean flag for the default \"All\" project
- `created_at`: Timestamp of creation
- `updated_at`: Timestamp of last update

**Rules:**
- Exactly one project must have `isDefault: true`
- The default project functions as an **"All" view**; entities do not need explicit membership to appear there

---

### Collections

Organizational folders for bookmarks. Scoped to a primary project but can be shared across multiple projects.

```typescript
interface Collection {
  id: string;
  name: string;
  primaryProjectId: string; // Where it "lives" - for future folder structure
  projectIds: string[]; // All projects it appears in (includes primary)
  color?: string;
  isDefault: boolean; // "Unsorted" collection for a project
  created_at: number;
  updated_at: number;
}
```

**Properties:**
- `id`: Unique identifier (UUID)
- `name`: Collection name (unique within primaryProjectId)
- `primaryProjectId`: The project where this collection was created/lives
- `projectIds`: Array of all project IDs this collection belongs to (must include primaryProjectId)
- `color`: Optional color for UI display
- `isDefault`: Boolean flag for "Unsorted" collections (one per project)
- `created_at`: Timestamp of creation
- `updated_at`: Timestamp of last update

**Rules:**
- Collection name must be unique within its primary project
- Same collection name can exist in different projects (different collections)
- `projectIds` must always include `primaryProjectId`
- Each project has exactly one default collection (`isDefault: true`)
- Collections can be shared across projects by adding project IDs to `projectIds[]`

**Example:**
- "Tutorials" collection created in "Learning C++" project:
  - `primaryProjectId: "learning-c++"`
  - `projectIds: ["learning-c++"]`
- "Tutorials" collection created in "Web Development" project:
  - `primaryProjectId: "web-dev"`
  - `projectIds: ["web-dev"]`
- These are separate collections with the same name

---

### Items (Bookmarks)

Individual bookmarks/URLs. Belong to one or more collections.

```typescript
interface Item {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  collectionIds: string[]; // Many-to-many with collections
  tags: string[];
  notes?: string; // User notes (different from Note entity)
  created_at: number;
  updated_at: number;
  source: 'tab' | 'twitter' | 'manual' | 'bookmark';
  metadata?: Record<string, any>; // Future: for external tool integration
}
```

**Properties:**
- `id`: Unique identifier (UUID)
- `url`: The bookmark URL
- `title`: Display title
- `favicon`: Optional favicon URL
- `collectionIds`: Array of collection IDs this item belongs to (many-to-many)
- `tags`: Array of tag strings
- `notes`: Optional user notes (plain text)
- `source`: Origin of the bookmark
- `created_at`: Timestamp of creation
- `updated_at`: Timestamp of last update
- `metadata`: Optional object for future external tool integration

**Rules:**
- `collectionIds` must be **non-empty** (every bookmark belongs to at least one collection)
- If the user does not specify a collection, assign the bookmark to the project's default collection ("Unsorted")

---

### Notes

Text notes that belong to a collection and can be linked to bookmarks.

```typescript
interface Note {
  id: string;
  title: string;
  content: string; // Plain text (can add markdown later)
  collectionId: string; // Notes belong to a collection (default if unspecified)
  linkedItemIds: string[]; // Bookmarks linked to this note
  pageContext?: {
    url: string;
    title: string;
    timestamp: number;
  };
  created_at: number;
  updated_at: number;
  externalIds?: Record<string, string>; // Future: e.g., { notion: "page-id-123" }
}
```

**Properties:**
- `id`: Unique identifier (UUID)
- `title`: Note title
- `content`: Note content (plain text initially, markdown support later)
- `collectionId`: The collection this note belongs to
- `linkedItemIds`: Array of item IDs (bookmarks) linked to this note
- `pageContext`: Optional context if note was created from a web page
- `created_at`: Timestamp of creation
- `updated_at`: Timestamp of last update
- `externalIds`: Optional mapping for external tool sync (e.g., Notion page ID)

**Rules:**
- `collectionId` is required (every note belongs to a collection)
- If the user does not specify a collection, assign the note to the project's default collection ("Unsorted")
- `linkedItemIds` can be empty
- `pageContext` is set when note is created from a web page

---

### Workspaces (Session Snapshots)

Workspaces are **snapshots of open browser state** (windows + tabs) that can be restored later. They are distinct from Bookmarks:
- A Workspace preserves **session structure** (grouped windows/tabs) and is meant for **reopening**.
- A Bookmark (Item) is a **curated saved URL** intended for **long-term reference**, independent of window/session structure.

Workspaces can optionally be associated with a Project to provide context (e.g., “these windows were part of Learning C++”), but the URLs inside a workspace do **not** become bookmarks unless explicitly saved as Items.

```typescript
interface WorkspaceTab {
  url: string;
  title?: string;
  favIconUrl?: string;
}

interface WorkspaceWindow {
  id: string;
  name?: string;
  tabs: WorkspaceTab[];
}

interface Workspace {
  id: string;
  name: string;
  projectId?: string; // Optional: associate this session snapshot with a project
  created_at: number;
  updated_at: number;
  windows: WorkspaceWindow[];
}
```

**Rules:**
- A workspace is restore-able into real browser windows (open/close/reopen workflow).
- Associating a workspace with a project should not mutate bookmarks/items.
- Workspaces are not “saved links”; they are saved **session states**.

---

## Relationships

### Relationship Diagram

```
Project (1) ──< (many) Collections
  │                      │
  │                      │ (primaryProjectId)
  │                      │
  │                      ▼
  │              Collection (many) ──< (many) Items (Bookmarks)
  │                      │
  │                      │ (via projectIds)
  │                      │
  └──────────────────────┘

Collection (many) ──< (many) Notes
  │
  │ (collectionId)
  │
  ▼
Notes (many) ──< (many) Items (Bookmarks)
       (via linkedItemIds)
```

**Also:**
- A Project can have many Workspaces (via `Workspace.projectId`)
- A Workspace contains many windows and tabs (snapshot structure)

### Relationship Summary

1. **Project → Collections**: One-to-many
   - A project can have many collections
   - Collections have a primary project (`primaryProjectId`)
   - Collections can belong to multiple projects (`projectIds[]`)

2. **Collection → Items**: Many-to-many
   - An item can belong to multiple collections
   - A collection can contain many items
   - Relationship via `collectionIds[]` on Items

3. **Collection → Notes**: One-to-many
   - A note belongs to exactly one collection (`collectionId`)
   - A collection can have many notes

4. **Note → Items**: Many-to-many
   - A note can link to multiple items (bookmarks)
   - An item can be linked to multiple notes
   - Relationship via `linkedItemIds[]` on Notes

5. **Project → Workspaces**: One-to-many (optional association)
   - A workspace can be associated with a project (`projectId`)
   - A project can have many workspaces
   - Workspaces remain session snapshots; they do not imply bookmark creation

---

## Design Decisions

### 1. Collections Scoped to Primary Project

**Decision**: Collections have a `primaryProjectId` and names are unique within that project.

**Rationale**:
- Allows same collection name in different projects (e.g., "Tutorials" in both C++ and Web projects)
- Clear ownership for future folder structure mapping
- Supports sharing via `projectIds[]` array

**Future Folder Structure**:
```
/projects/
  /learning-c++/
    /tutorials/  (primary location)
  /web-dev/
    /tutorials/  (link to learning-c++/tutorials or separate)
```

### 2. Many-to-Many Relationships

**Decision**: Items ↔ Collections and Notes ↔ Items are many-to-many.

**Rationale**:
- Maximum flexibility for organization
- Items can appear in multiple contexts
- Notes can reference multiple resources
- Supports complex organizational needs

### 3. Default Project

**Decision**: One default project that functions as an \"All\" view.

**Rationale**:
- Provides a catch-all view
- Ensures nothing is "orphaned"
- Simplifies queries (always can fall back to default project)

### 4. Extensibility Fields

**Decision**: Include `metadata` on Items and `externalIds` on Notes.

**Rationale**:
- Future-proof for external tool integration
- Can store Notion page IDs, editor references, etc.
- Doesn't break existing data if not used

---

## Future Considerations

### File-Based Export

The model maps naturally to folder structures:

```
/projects/
  /{project-id}/
    metadata.json
    /collections/
      /{collection-id}/
        metadata.json
        items.json
    /notes/
      /{note-id}.json
```

### API/External Tool Integration

- **Notion**: Map Projects → Databases, Collections → Properties, Items → Pages
- **Coding Editors**: Export notes as markdown files, items as JSON
- **Web APIs**: RESTful endpoints returning clean JSON structures

### Sync Considerations

- Timestamps (`created_at`, `updated_at`) for conflict resolution
- `externalIds` for tracking external tool references
- `metadata` for sync state, version info, etc.

---

## IndexedDB Schema

### Object Stores

1. **projects**
   - Key: `id`
   - Indexes: `by-name` (unique), `by-updated`

2. **collections**
   - Key: `id`
   - Indexes: `by-primary-project`, `by-name` (within project), `by-updated`

3. **items**
   - Key: `id`
   - Indexes: `by-url`, `by-collection` (multiEntry via `collectionIds[]`), `by-updated`

4. **notes**
   - Key: `id`
   - Indexes: `by-collection`, `by-updated`, `by-title`

### Migration Strategy

- Version database schema for future changes
- Handle migration of existing `collectionId` (single) to `collectionIds[]` (array)
- Create default project if it doesn't exist
- Migrate existing collections to have `primaryProjectId` and `projectIds[]`
- Notes: new store; existing bookmark `notes` field remains separate from Note entities

---

## Implementation Checklist

- [ ] Define TypeScript interfaces
- [ ] Update IndexedDB schema (version bump)
- [ ] Create default project on first run
- [ ] Migrate existing collections (add primaryProjectId, projectIds)
- [ ] Migrate existing items (collectionId → collectionIds[])
- [ ] Add CRUD helpers for Projects
- [ ] Add CRUD helpers for Notes
- [ ] Update Collection CRUD to handle primaryProjectId and projectIds
- [ ] Update Item CRUD to handle collectionIds[]
- [ ] Add linking helpers (link/unlink collections to projects, items to collections, etc.)
- [ ] Update export/import to include new stores
- [ ] Add validation (unique names within project, etc.)

