# Workbench Agent - Architecture Overview

## System Architecture

Workbench Agent is a Chrome extension with a client-side architecture. No server infrastructure required.

```
┌─────────────────────────────────────────────────┐
│           Chrome Extension                       │
│  ┌─────────────┐  ┌──────────────────────────┐ │
│  │   UI Layer  │  │   Background Service     │ │
│  │  (React)    │  │      Worker              │ │
│  └─────────────┘  └──────────────────────────┘ │
│         │                    │                   │
│         └────────┬───────────┘                   │
│                  │                               │
│         ┌────────▼─────────┐                    │
│         │  Storage Layer   │                    │
│         └────────┬─────────┘                    │
└──────────────────┼──────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
   IndexedDB    Files      AI APIs
  (Local DB)  (via API)  (OpenAI/etc)
```

## UI Architecture: Dual-Mode Strategy

The application runs in two distinct modes based on context:

### 1. Dashboard Mode (Full Page)
**Purpose:** Deep work, organization, management.
**Layout:** 3-Pane Flexible Workspace.

**Structure:**
- **Left Sidebar (Navigation):**
  - Primary navigation: Projects, Bookmarks, Workspaces, Notes, Collections.
  - Collapsible to maximize main area.
- **Main Content Area:**
  - View-specific content (e.g., Workspace Detail, Bookmark Grid).
  - List/Card views for data entities.
- **Tab Commander (Bottom Panel):**
  - **Live Workbench**: Managing currently open browser state.
  - **Two-Column Layout**: Left window navigator (W1, W2, etc.) and right tab list.
  - **Scalability**: Handles 100+ tabs via paged rendering and dense list/gallery views.
  - **Resizable**: Drag divider to reclaim screen height; collapsible to 0px.

### 2. Assistant Mode (Side Panel)
**Purpose:** Quick actions and AI helper while browsing.

---

## Data Model (IndexedDB v2)

### 1. Workspaces (`workspaces` store)
Snapshots of active browser sessions.
- **Workspace**: `{ id, name, created_at, updated_at, windows: WorkspaceWindow[] }`
- **WorkspaceWindow**: `{ id, name, tabs: WorkspaceTab[] }`
- **WorkspaceTab**: `{ url, title, favIconUrl }`

### 2. Bookmarks (`items` store)
Curated long-term resources.
- **Item**: `{ id, url, title, favicon, collectionId, tags[], notes, source }`

### 3. Collections (`collections` store)
Organizational folders for Bookmarks.
- **Collection**: `{ id, name, color, isDefault }`

---

## Tab Commander Features

### Multi-Window Handling
- **Window Navigator**: Compact list showing windows as **W1, W2, W3** based on current order.
- **Find Window**: Triggers a focus loop (flashing) to locate windows across macOS desktops/Spaces.
- **Multi-select**: Checkboxes for windows and tabs to enable batch moves.

### Tab Operations
- **Drag & Drop**: Drag selected tabs onto a window in the navigator to move them.
- **Open Here**: Creates a new tab in the *current* window with the target URL, allowing peeks without desktop jumping.
- **Close Previews**: Track and close all "Open Here" tabs in one click.
- **View Switcher**: Toggle between high-density **List** and visual **Gallery** cards.

---

## Key Technical Decisions

### macOS Spaces Limitations
Programmatic window focusing on macOS often triggers a focus-return to the originating window. We mitigate this via:
1. **Open Here**: Bringing the content to the current desktop.
2. **Find Window**: Helping the user visually locate the desktop for manual navigation.

### Storage Strategy
- **IndexedDB**: Primary source of truth for all user data.
- **No-Server**: All API calls (AI, Dropbox) are direct from the client.
- **Export/Import**: Full JSON backup support for manual data portability.

---

## Next Steps

1. **Projects Integration**: Replace placeholder views with real Project management logic.
2. **AI Integration**: Implement the Chat interface and context assembly pipeline.
3. **Advanced Linking**: Connect Workspaces/Tabs directly to Projects.
