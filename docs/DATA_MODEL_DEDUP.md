# Data Model: Canonical URLs & Deduplication

## Problem Statement

The current data model allows duplicate `Item` records for the same URL when:
- User saves same tab to multiple collections
- Importing from external sources (Raindrop, browser bookmarks)
- Re-importing same data
- Saving workspaces with duplicate tabs

This creates data bloat, inconsistent notes, and confusing deletion behavior.

## Design Goals

1. **One canonical record per URL** — normalized URL is the identity key
2. **Multi-context placement** — same bookmark can live in multiple collections/projects
3. **Per-context metadata** — each placement can have its own notes and tags
4. **Clean imports** — find existing by URL, add placement, merge metadata
5. **Granular deletion** — remove from one collection vs delete everywhere
6. **Workspace dedup** — tabs are unique by URL within a saved workspace

---

## Schema Changes

### Current `Item` Schema

```typescript
interface Item {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  collectionIds: string[];
  tags: string[];
  notes?: string;  // Global only — problem!
  created_at: number;
  updated_at: number;
  source: 'tab' | 'twitter' | 'manual' | 'bookmark';
  metadata?: Record<string, any>;
}
```

### New `Item` Schema

```typescript
interface ItemPlacement {
  collectionId: string;
  notes?: string;       // Per-placement notes
  tags?: string[];      // Per-placement tags
  addedAt: number;      // When added to this collection
  source: string;       // How it was added ('tab', 'import:raindrop', etc.)
}

interface Item {
  id: string;
  url: string;          // Normalized canonical URL
  urlRaw?: string;      // Original URL before normalization (for display)
  title: string;        // Best title seen
  favicon?: string;     // Best favicon seen
  
  // Quick-access array for filtering (derived from placements)
  collectionIds: string[];
  
  // Per-collection metadata
  placements: Record<string, ItemPlacement>;  // keyed by collectionId
  
  // Legacy: global notes (migrate to placements)
  notes?: string;
  tags: string[];
  
  created_at: number;
  updated_at: number;
  source: string;       // Original source
  metadata?: Record<string, any>;
}
```

### Migration Strategy

1. Existing items get their `notes` copied to first placement
2. `placements` map is created from `collectionIds`
3. Duplicate URLs are merged:
   - Keep oldest `created_at`
   - Union all placements
   - Concatenate notes (with separator) or keep per-placement

---

## URL Normalization

```typescript
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'zanpid',
  '_ga', '_gl', 'yclid', 'dclid'
];

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    
    // Remove hash
    u.hash = '';
    
    // Normalize trailing slashes
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    
    // Remove tracking params
    TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    
    // Sort remaining params for consistency
    u.searchParams.sort();
    
    // Remove trailing slash from final URL
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}
```

### Index

Add a `by-normalized-url` index on the normalized URL for O(1) duplicate detection:

```typescript
items: {
  // ...existing indexes...
  indexes: {
    'by-url': 'url',           // Keep for backward compat
    'by-normalized': 'url',    // After migration, url is normalized
    'by-collection': 'collectionIds',
    'by-updated': 'updated_at'
  }
}
```

---

## Core Operations

### 1. Add Bookmark

```typescript
async function addBookmark(input: {
  url: string;
  title: string;
  collectionId: string;
  notes?: string;
  tags?: string[];
  source: string;
  favicon?: string;
}): Promise<{ itemId: string; merged: boolean }> {
  const normalizedUrl = normalizeUrl(input.url);
  const existing = await findByNormalizedUrl(normalizedUrl);
  
  if (existing) {
    // Add placement to existing item
    const placement: ItemPlacement = {
      collectionId: input.collectionId,
      notes: input.notes,
      tags: input.tags,
      addedAt: Date.now(),
      source: input.source
    };
    
    existing.placements[input.collectionId] = placement;
    existing.collectionIds = Object.keys(existing.placements);
    
    // Update title/favicon if incoming is better
    if (input.title && input.title !== input.url && !existing.title) {
      existing.title = input.title;
    }
    if (input.favicon && !existing.favicon) {
      existing.favicon = input.favicon;
    }
    
    existing.updated_at = Date.now();
    await db.put('items', existing);
    
    return { itemId: existing.id, merged: true };
  }
  
  // Create new item
  const newItem: Item = {
    id: crypto.randomUUID(),
    url: normalizedUrl,
    urlRaw: input.url !== normalizedUrl ? input.url : undefined,
    title: input.title || normalizedUrl,
    favicon: input.favicon,
    collectionIds: [input.collectionId],
    placements: {
      [input.collectionId]: {
        collectionId: input.collectionId,
        notes: input.notes,
        tags: input.tags,
        addedAt: Date.now(),
        source: input.source
      }
    },
    tags: [],
    created_at: Date.now(),
    updated_at: Date.now(),
    source: input.source
  };
  
  await db.put('items', newItem);
  return { itemId: newItem.id, merged: false };
}
```

### 2. Remove from Collection

```typescript
async function removeFromCollection(itemId: string, collectionId: string): Promise<{
  removed: boolean;
  itemDeleted: boolean;
  remainingPlacements: number;
}> {
  const item = await db.get('items', itemId);
  if (!item) return { removed: false, itemDeleted: false, remainingPlacements: 0 };
  
  delete item.placements[collectionId];
  item.collectionIds = Object.keys(item.placements);
  
  if (item.collectionIds.length === 0) {
    // No placements left — delete entirely
    await db.delete('items', itemId);
    return { removed: true, itemDeleted: true, remainingPlacements: 0 };
  }
  
  item.updated_at = Date.now();
  await db.put('items', item);
  return { removed: true, itemDeleted: false, remainingPlacements: item.collectionIds.length };
}
```

### 3. Delete Everywhere

```typescript
async function deleteItem(itemId: string): Promise<{ deleted: boolean; placementCount: number }> {
  const item = await db.get('items', itemId);
  if (!item) return { deleted: false, placementCount: 0 };
  
  const count = Object.keys(item.placements || {}).length;
  await db.delete('items', itemId);
  return { deleted: true, placementCount: count };
}
```

### 4. Bulk Import

```typescript
async function importBookmarks(candidates: ImportCandidate[], collectionId: string): Promise<{
  created: number;
  merged: number;
  skipped: number;
}> {
  let created = 0, merged = 0, skipped = 0;
  
  // Group by normalized URL to handle duplicates within import
  const byUrl = new Map<string, ImportCandidate[]>();
  for (const c of candidates) {
    const normalized = normalizeUrl(c.url);
    if (!byUrl.has(normalized)) byUrl.set(normalized, []);
    byUrl.get(normalized)!.push(c);
  }
  
  for (const [normalizedUrl, dupes] of byUrl) {
    // Pick best candidate from duplicates
    const best = pickBestCandidate(dupes);
    
    const result = await addBookmark({
      url: normalizedUrl,
      title: best.title,
      collectionId,
      notes: best.notes,
      tags: best.tags,
      source: best.source || 'import',
      favicon: undefined
    });
    
    if (result.merged) merged++;
    else created++;
  }
  
  return { created, merged, skipped };
}

function pickBestCandidate(candidates: ImportCandidate[]): ImportCandidate {
  // Prefer one with notes, then longest title
  return candidates.sort((a, b) => {
    if (a.notes && !b.notes) return -1;
    if (b.notes && !a.notes) return 1;
    return (b.title?.length || 0) - (a.title?.length || 0);
  })[0];
}
```

---

## Workspace Deduplication

When saving a workspace, deduplicate tabs by normalized URL:

```typescript
function deduplicateWorkspaceTabs(windows: WorkspaceWindow[]): WorkspaceWindow[] {
  const seenUrls = new Set<string>();
  
  return windows.map(win => ({
    ...win,
    tabs: win.tabs.filter(tab => {
      if (!tab.url) return true;  // Keep non-URL tabs
      const normalized = normalizeUrl(tab.url);
      if (seenUrls.has(normalized)) return false;
      seenUrls.add(normalized);
      return true;
    })
  })).filter(win => win.tabs.length > 0);  // Remove empty windows
}
```

Apply when creating or updating workspace:

```typescript
async function saveWorkspace(name: string, windows: WorkspaceWindow[]): Promise<string> {
  const dedupedWindows = deduplicateWorkspaceTabs(windows);
  return addWorkspace(name, dedupedWindows);
}
```

---

## UI Behavior

### Display

| Context | Behavior |
|---------|----------|
| Collection view | Show item with that collection's notes |
| "All" view | Show item once, badge showing placement count if >1 |
| Search | Search across title + all placement notes |
| Item detail | Show all placements with their notes, allow editing each |

### Delete Flow

```
User clicks delete on item in collection X

→ Dialog: "This bookmark exists in 3 collections"
   [Remove from X only]  [Delete everywhere]  [Cancel]

If "Remove from X only":
   → Remove placement for X
   → If last placement, delete item

If "Delete everywhere":
   → Delete item
```

### Edit Flow

```
User clicks edit on item in collection X

→ Edit panel shows:
   - Title (global)
   - URL (readonly, global)
   - Notes (for collection X — clearly labeled)
   - Tags (for collection X)
   - "This bookmark also appears in: [Y], [Z]" (expandable)
```

---

## Migration Plan

### Phase 1: Schema Update (DB v4)

1. Add `placements` field to Item schema
2. Add `urlRaw` field
3. Migrate existing items:
   - Create placement for each collectionId
   - Copy global `notes` to first placement
   - Normalize URL, store original in `urlRaw` if different

### Phase 2: Deduplication Pass

1. Group all items by normalized URL
2. For duplicates:
   - Keep oldest item
   - Merge placements from all duplicates
   - Delete duplicate items

### Phase 3: Update All Write Paths

1. `addItem` → use `addBookmark` with find-or-merge
2. `updateItem` → handle placement-specific notes
3. `deleteItem` → add removal flow
4. Import flows → use bulk import with dedup

### Phase 4: Update UI

1. Delete confirmation shows placement count
2. Edit shows placement context
3. "All" view shows placement badges
4. Import shows merge summary

---

## Testing Checklist

- [ ] Add same URL to two collections → single Item with two placements
- [ ] Import with duplicate URLs → deduped in single pass
- [ ] Import URL that already exists → merged into existing
- [ ] Remove from one collection → item still exists in others
- [ ] Delete everywhere → item gone
- [ ] Save workspace with duplicate tabs → deduplicated
- [ ] Notes are per-collection, display correctly
- [ ] Search finds items by any placement's notes
- [ ] Migration doesn't lose any data

---

## Implementation Status

**Implemented (v4 migration):**
- [x] `ItemPlacement` interface for per-collection metadata
- [x] `Item.placements` map for per-collection notes/tags
- [x] `Item.urlRaw` to preserve original URL after normalization
- [x] Enhanced URL normalization (strips tracking params)
- [x] DB migration v4: adds placements, merges duplicate URLs
- [x] `addItem` / `addItemWithMerge`: find-or-merge by normalized URL
- [x] `removeItemFromCollection`: remove from one collection
- [x] `deleteItem`: returns placement count for confirmation
- [x] `bulkImportBookmarks`: batch import with deduplication
- [x] `deduplicateWorkspaceTabs`: workspace tab dedup on save/update
- [x] `DeleteConfirmDialog` component (ready for UI integration)

**To integrate in UI:**
- [ ] Use `DeleteConfirmDialog` for multi-placement items
- [ ] Show placement badges in "All" view
- [ ] Edit form shows per-placement notes
- [ ] Import summary shows created/merged counts

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Strip tracking params? | Yes — `utm_*`, `fbclid`, etc. |
| Keep original URL? | Yes, in `urlRaw` for display |
| Workspace dedup: which tab wins? | First occurrence |
| Import merge: which notes win? | Per-candidate; don't merge text |
| Global vs per-placement tags? | Per-placement (can show union in UI) |
