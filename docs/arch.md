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
**URL:** `index.html` (in a full tab)
**Layout:** IDE-like flexible workspace.

**Structure:**
- **Left Sidebar (Navigation):**
  - Primary navigation (Projects, Bookmarks, Notes)
  - Tree/Folder view of content
  - Collapsible to maximize main area
- **Main Content Area (Top):**
  - Active view (Grid of bookmarks, Note editor, Project canvas)
  - Rich item cards with metadata
  - Search and filter controls
- **Bottom Panel (Open Tabs/Workbench):**
  - Horizontal strip or grid of currently open tabs/windows
  - "Staging area" for active work
  - Drag-and-drop tabs into projects/notes
  - Collapsible/Resizable

**Key Interactions:**
- **Drag & Drop:** Drag tabs from Bottom Panel to Projects/Notes in Main Area.
- **Resizability:** Split panes allow adjusting space between "stored work" and "active tabs".
- **Collapsibility:** Sections collapse to focus on specific tasks (e.g., full-screen writing).

### 2. Assistant Mode (Side Panel)
**Purpose:** Quick actions, context, AI helper.
**Context:** Chrome Side Panel (narrow width)
**Layout:** Linear, vertical flow.

**Structure:**
- **Context Awareness:** Shows AI insights about the *current* active tab.
- **Quick Actions:** "Save to Project", "Add Note", "Ask AI".
- **Reference:** Minimal view of relevant notes/bookmarks for current task.

---

## Feature Modules

The application is divided into modular components that work independently but become more powerful when connected via the AI agent.

### 1. Tab Manager

**Purpose:** Manage open browser tabs and save sessions

**Core Features (Mechanical):**
- View all open tabs across windows
- Group tabs by window
- Search/filter tabs
- Close/organize tabs
- Save tab collections
- Restore saved sessions
- Save tabs as bookmarks
- Save as "workspace" (TBD: what differentiates from collections?)

**AI-Enhanced Features (Future):**
- Auto-group related tabs
- Suggest which tabs to close
- "What am I working on?" - AI summarizes open tabs
- Smart session naming

**Data:**
- Current tabs (Chrome API - ephemeral)
- Saved sessions (stored)
- Tab metadata (title, URL, favicons)

---

### 2. Bookmark Manager

**Purpose:** Organize and manage bookmarks with AI assistance

**Core Features (Mechanical):**
- Import bookmarks from:
  - Browser (Chrome native)
  - Twitter/X bookmarks
  - Other apps (TBD: Pocket, Instapaper, etc.)
- Add bookmarks manually or via other channels (email, whatsapp - future)
- Organize bookmarks:
  - Collections/folders
  - Tags
  - Categories
  - Search and filter
- Visual bookmark grid
- Edit metadata (title, notes, tags)
- Link bookmarks to projects (TBD: vs collections?)

**AI-Enhanced Features:**
- **Auto-organization:** AI groups related links together
- **Content research:** AI fetches and analyzes linked pages
- **Smart tagging:** AI suggests tags/categories
- **Related links:** "Find similar bookmarks to this"
- **Project assembly:** "Pull all links related to [project]"
- **Content summarization:** AI reads and summarizes bookmarked pages
- **Dead link detection:** Check if links still work
- **Duplicate detection:** Find similar/duplicate bookmarks

**Example Workflows:**
```
User: "I'm researching TradingView"
AI: 
  - Finds 12 related bookmarks
  - Groups them (tutorials, docs, community posts)
  - Fetches and summarizes content
  - Creates a project with organized links
  - Suggests related bookmarks user doesn't have yet
```

**Data:**
- Bookmark metadata (URL, title, tags, notes)
- Content cache (for AI analysis)
- Project/collection associations
- Import history

**Questions to Resolve:**
- Projects vs Collections: What's the difference?
  - *Option A:* Collections = simple groups, Projects = collections + notes + AI context
  - *Option B:* They're the same thing, just different naming
  - *Option C:* Projects are work-focused, Collections are topical
- When to fetch content: On-demand, on-save, background?

---

### 3. Note Taking & AI Study Buddy

**Purpose:** Take notes and get AI assistance while learning/researching

**Core Features (Mechanical):**
- Create/edit notes (markdown)
- Organize notes:
  - Link to projects
  - Link to bookmarks
  - Tag/categorize
- Notes can be created:
  - Standalone
  - While reading a page (capture context)
  - From bookmark (annotate a link)
- Search notes
- Export notes

**AI Study Buddy Features:**
- **Page understanding:** "Explain this page to me"
- **Question answering:** Ask questions about what you're reading
- **Note assistance:** AI helps write/structure notes
- **Summarization:** AI summarizes articles/docs
- **Concept extraction:** Pull key concepts from reading
- **Connection finding:** "How does this relate to my project?"
- **Research compilation:** AI builds research docs from sources
- **Study guide generation:** Create study materials from notes

**Example Workflows:**

*Reading a technical article:*
```
User: [Reading on page about React Server Components]
User: "Explain how this works"
AI: [Has context: page content + user's React project notes]
    "Based on what you're reading and your existing React knowledge..."

User: "Add this to my React learning notes"
AI: Creates note with summary, links to article, tags with project
```

*Building a research document:*
```
User: "Help me understand blockchain"
AI: 
  - Reviews bookmarks tagged 'blockchain'
  - Reads and synthesizes content
  - Creates structured research doc
  - Adds relevant quotes and citations
  - Suggests follow-up resources
```

**Context Available to AI:**
- Current page content
- Related project notes
- Linked bookmarks and their content
- Previous conversation history
- User's other notes on similar topics

**Data:**
- Note content (markdown)
- Note metadata (tags, project, created/updated)
- Page context (if created while reading)
- AI conversation history (per note)
- Links to resources

---

### 4. Projects (TBD: Naming/Scope)

**Purpose:** Organize work around specific topics/goals

**Core Concept:**
A project is a collection of:
- Related bookmarks
- Related notes
- AI context/understanding
- Research documents
- Goals/TODO (maybe?)

**Features:**
- Create/manage projects
- Add bookmarks to projects
- Add notes to projects
- AI has full project context
- Project dashboard/overview
- Export entire project

**Questions to Resolve:**
- Is this different from "Collections"?
- Do projects have stages/workflow?
- Are projects hierarchical? (sub-projects?)
- Do projects have deadlines/goals?

**Possible Distinction:**
- **Collections:** Simple bookmark groups (mechanical)
- **Projects:** Smart workspaces (mechanical + AI context + notes)

---

## Module Interaction

How components connect:

```
┌─────────────┐
│ Tab Manager │
└──────┬──────┘
       │ (save as)
       ▼
┌──────────────────┐     ┌──────────────────┐
│ Bookmark Manager │────▶│     Projects     │
└────────┬─────────┘     └────────┬─────────┘
         │ (annotate)              │
         ▼                         │
┌──────────────────┐              │
│   Note Taking    │◀─────────────┘
└────────┬─────────┘
         │
         ▼
    ┌────────────┐
    │ AI Agent   │──────────┐
    └────────────┘          │
         │                  │
         │ (enhances all    │
         └──────────────────┘
              modules)
```

**Example Connected Workflow:**

1. **User browses and opens 20 tabs about TradingView**
2. **Tab Manager:** "Save this session"
3. **AI:** Analyzes tabs, suggests creating a "TradingView Learning" project
4. **User accepts:** Tabs → Bookmarks → Project
5. **Bookmark Manager:** AI fetches and analyzes all pages
6. **AI:** Groups them (beginner, advanced, reference)
7. **User opens a guide:** Starts reading
8. **Note Taking:** User asks "What's a candlestick pattern?"
9. **AI:** Answers with context from:
   - Current page
   - Other bookmarked guides
   - Previous notes in project
10. **AI:** "Should I add this to your notes?"
11. **User:** Yes → Note created with summary, links, project context

---

## Storage Architecture - Options & Trade-offs

### Core Question
Where do we store user data (notes, bookmarks, projects, tabs)?

---

## Option 1: IndexedDB Only (Pure Local DB)

### Architecture
```
User Data → IndexedDB (Client-Side DB)
└── Optional: Manual export/backup
```

### How It Works
- All data stored in browser's IndexedDB
- Fast queries, relationships, indexes
- Sync/backup via periodic exports (JSON/ZIP)
- Dropbox integration for backup files only

### Pros
- ✅ Fast queries and complex filtering
- ✅ Relational data and indexes
- ✅ Full offline support
- ✅ No API rate limits
- ✅ Simple to implement initially

### Cons
- ❌ Data opaque to users (can't open notes in other apps)
- ❌ Export/import required for backup
- ❌ Multi-device sync requires custom implementation
- ❌ Data locked in extension
- ❌ No version history by default

### Best For
- Performance-critical apps
- Complex queries/relationships
- Single-device primary use

---

## Option 2: File-Based Storage (Dropbox/Cloud Files)

### Architecture
```
User Data → Dropbox Files (Markdown, JSON)
└── Optional: IndexedDB cache for speed
```

### Structure Example
```
/workbench_agent/
  ├── notes/
  │   ├── 2024-12-15-my-note.md
  │   └── projects/
  │       └── crypto/
  │           └── overview.md
  ├── bookmarks.json
  └── projects.json
```

### How It Works
- Notes as `.md` files
- Bookmarks/projects as JSON files
- Read/write via Dropbox API
- Optional: Cache in IndexedDB for offline/speed
- Dropbox handles sync across devices

### Pros
- ✅ User owns files (can edit anywhere)
- ✅ Automatic backup via Dropbox
- ✅ Multi-device sync out of the box
- ✅ Version history (Dropbox built-in)
- ✅ Interoperable (use with Obsidian, VS Code, etc.)
- ✅ No vendor lock-in
- ✅ Can use git for version control
- ✅ Transparent to users

### Cons
- ❌ Requires internet for primary storage
- ❌ API rate limits (though generous)
- ❌ Slower queries (must read files)
- ❌ Complex searches require full-text scanning
- ❌ Relational queries harder

### Best For
- Personal tools with user ownership
- Multi-device sync
- Interoperability with other apps
- Long-term data portability

---

## Option 3: Hybrid Approach

### Architecture
```
Primary: Dropbox Files (Source of Truth)
Cache: IndexedDB (Local Index + Offline Copy)
```

### How It Works
- Files in Dropbox are the "source of truth"
- IndexedDB caches full content + search index
- Reads from cache (fast)
- Writes to both Dropbox + cache
- Periodic sync checks timestamps
- Conflict resolution via last-write-wins or manual

### Data Flow
```
Read:  Cache (fast) → Dropbox (if miss/stale)
Write: Dropbox (primary) + Cache (secondary)
Sync:  Compare timestamps, update cache
```

### Pros
- ✅ All benefits of file-based storage
- ✅ Fast local queries/search
- ✅ Offline capable
- ✅ User owns data
- ✅ Multi-device sync

### Cons
- ❌ Most complex to implement
- ❌ Sync conflicts possible
- ❌ Cache invalidation challenges
- ❌ Need to manage consistency

### Best For
- Production-grade personal tools
- When you need both speed and portability
- Multi-device with offline support

---

## Option 4: Local Folder + File System Access API

### Architecture
```
User selects local folder
Extension reads/writes files directly
Optional: Dropbox for backup
```

### How It Works
- User grants permission to a local folder
- Extension uses File System Access API
- Notes as `.md`, bookmarks as JSON
- User can put folder in Dropbox/Drive folder
- OS handles sync via cloud provider

### Pros
- ✅ Fully local (no API calls)
- ✅ User owns files completely
- ✅ Works with any cloud sync (Dropbox, Drive, iCloud)
- ✅ Fast access
- ✅ Interoperable

### Cons
- ❌ Chrome-only feature (not in Firefox)
- ❌ User must grant permissions
- ❌ More complex UX (folder selection)
- ❌ Need to re-request handle on browser restart

### Best For
- Privacy-focused users
- Those already using cloud sync folders
- When you want zero API dependencies

---

## Option 5: Cloud Database (Firebase/Supabase)

### Architecture
```
User Data → Firebase/Supabase (Hosted DB)
Client connects directly (no server)
```

### How It Works
- Client-side SDK connects to hosted DB
- Real-time sync built-in
- Offline support included
- User auth (optional)

### Pros
- ✅ Real-time multi-device sync
- ✅ Built-in conflict resolution
- ✅ Offline support out of the box
- ✅ Query engine included
- ✅ Scalable

### Cons
- ❌ Data on third-party servers
- ❌ Not file-based (less portable)
- ❌ Vendor lock-in
- ❌ Learning curve
- ❌ Privacy concerns for users

### Best For
- When you need real-time collaboration
- Multi-user scenarios
- When scaling to public release

---

## Recommendation Matrix

| Priority | Recommended Approach |
|----------|---------------------|
| **Simplest to start** | Option 1: IndexedDB Only |
| **Best user ownership** | Option 2: File-Based (Dropbox) |
| **Best performance + portability** | Option 3: Hybrid |
| **Maximum privacy** | Option 4: Local Folder |
| **Future public release** | Option 5: Cloud DB |

---

## Recommended Path for Workbench Agent

### Phase 1: Start Simple
**IndexedDB Only**
- Get core features working
- Fast development
- Add manual export/backup

### Phase 2: Add File Sync
**Migrate to Hybrid**
- Export to Dropbox files
- Build sync logic
- Keep IndexedDB as cache
- Users get portability

### Phase 3 (If Needed): Advanced Sync
**Local Folder Option**
- Add File System Access API
- Let users choose storage location
- Support any cloud sync provider

---

## AI Integration Architecture

### Direct API Calls (Recommended)
```
Extension → AI API (OpenAI/Anthropic/etc.)
├── API key stored locally
├── Context assembled client-side
└── Responses processed client-side
```

### Why This Works
- No server needed
- Simple implementation
- User controls API key
- Privacy (no middleware)

### Context Management
- Assemble relevant notes/bookmarks before API call
- Include current page content if needed
- Manage token limits client-side
- Cache responses locally

---

## Security Considerations

### API Keys
- Store in `chrome.storage.local` (encrypted by Chrome)
- Never in code or git
- User provides their own key

### Data Privacy
- All processing client-side
- Only user's AI provider sees data
- No telemetry/analytics (personal tool)

### Chrome Extension Permissions
```json
{
  "permissions": [
    "storage",          // For settings
    "unlimitedStorage", // For IndexedDB
    "tabs",             // Tab management
    "bookmarks"         // Bookmark access
  ],
  "optional_permissions": [
    "history"           // If user wants context from history
  ]
}
```

---

## Technology Stack

### Core
- **Frontend**: React + TypeScript
- **Build**: Vite
- **Storage**: IndexedDB (via `idb` library)
- **UI**: Lucide icons, minimal CSS

### Integrations
- **Cloud Sync**: Dropbox API (or File System Access API)
- **AI**: Direct API calls (OpenAI, Anthropic, etc.)
- **Chrome APIs**: Extension APIs for tabs, bookmarks, windows

### Optional
- **Markdown**: markdown-it or similar
- **Search**: Fuse.js for fuzzy search
- **Export**: JSZip for backup creation

---

## Decision Points

### Now (MVP Phase)
- [ ] Choose storage approach (IndexedDB vs File-based vs Hybrid)
- [ ] Pick AI provider (OpenAI, Anthropic, or multi-provider)
- [ ] Decide on data format (if file-based)

### Later (Polish Phase)
- [ ] Add sync mechanism
- [ ] Build search/indexing
- [ ] Implement conflict resolution
- [ ] Add export/import tools

### Future (If Scaling)
- [ ] Multi-user support
- [ ] Collaboration features
- [ ] Public API
- [ ] Mobile companion

---

## Next Steps

1. **Dashboard UI Shell**: Build the 3-pane layout (Left Nav, Main, Bottom Tabs).
2. **Tab Manager**: Implement the "Bottom Panel" to visualize and drag tabs.
3. **Data Layer**: Ensure IndexedDB can support this drag-and-drop linking.
4. **Features**: Build Project/Bookmark views in the Main Area.
