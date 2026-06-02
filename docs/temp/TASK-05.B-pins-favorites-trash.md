# TASK-05.B — Pins, favorites, trash + backup sync (V2-B / D-01–D-03)

**Status:** **done** (2026-05-27)  
**Depends on:** V2-A core shipped (05.1–05.7); no dependency on D-26 / W6 / D-25  
**Closes:** [V2-DEFERRED-TRACKER.md](V2-DEFERRED-TRACKER.md) **D-01**, **D-02**, **D-03** (schema slice only — D-04/D-05 out of scope)  
**Workflows:** W1 (library quick access), W7 (Home card), backup integrity

---

## Documentation rule (required)

**Implementation session:**

- **Only update this file** (`TASK-05.B-pins-favorites-trash.md`) — fill return template, check acceptance criteria, note gaps.
- **Do not edit** `docs/backlog.md`, `docs/OVERVIEW.md`, `docs/temp/README.md`, `V2-PRODUCT-DESIGN-SPEC.md`, or other umbrella docs.

**Master session** updates higher-level docs after your return.

---

## Goal

User can **pin**, **favorite**, and **soft-delete (trash)** bookmarks/items from product UI. All mutations persist on `Item` in IndexedDB and **sync to the configured backup folder** via existing live backup (`notifyDataChanged` → `BackupCoordinator` → `exportDB` → `latest.json`).

**Ephemeral UI stays local** (not in backup): open tab strip, shell layout, font scale, search history.

**Not in scope:** D-04 notes model, D-05 import provenance, D-26/W6 category pipeline, D-25 fetch review, search click polish (D-41), dev hub gate (05.8), 30-day trash auto-purge (stretch only), V2-C fetch/embed work, **backup export scale** (see **D-35** — end of V2).

---

## Scope tiers (what this task is / is not)

| Tier | ID | Shipped in 05.B? |
|------|-----|------------------|
| **A — Core (required)** | D-01 pin, D-02 favorite, D-03 trash; schema v8; `itemQuickAccess.ts`; context menu; utility tabs; Home card; hide trash in lists/search/digest; `notifyDataChanged` → live backup | **Yes** |
| **B — Same-session polish (optional but shipped)** | Combined `QuickAccessTab` (`util-quick-access`); `ItemQuickAccessMarkers`; side panel ⭐/📌; item-tab pin/fav/trash buttons; search-result menu; multi-collection Remove vs Trash semantics; Empty trash | **Yes** |
| **C — Adjacent (not 05.B — track separately)** | Home vertical split (`Resizer` / `topPct`); **Help v1** (`HelpView` + nav) | **Yes, out of band** — see master backlog, not D-01–03 |

**Backup sync:** Tier A mutations use existing `notifyDataChanged` → full `exportDB()` → `latest.json`. **Correct for personal scale today**; **does not scale** to very large libraries — **D-35** (end of V2).

---

## App context (fresh session)

Chrome MV3 extension — React 18 + TypeScript + Vite. `DashboardLayout` + `ProjectDashboard` + utility tabs (`util-pinned`, `util-favorites`, `util-trash`, `util-recent`).

### Shipped placeholders (replace)

| Surface | File | Today |
|---------|------|--------|
| Pinned utility tab | `PinnedTab.tsx` | “Coming soon” |
| Favorites utility tab | `FavoritesTab.tsx` | “Coming soon” |
| Trash utility tab | `TrashTab.tsx` | “Coming soon” |
| Home card | `HomeView.tsx` | Empty “Favorites” card (copy mentions Pin) |
| Quick actions | `QuickActions.tsx` + `ProjectDashboard.tsx` | Opens utility tabs |
| Context menu | `ItemContextMenu.tsx` | Edit / Delete only — no pin/fav/trash |
| Recent tab | `RecentTab.tsx` | **Works** — use as list UI reference |

### Backup pipeline (do not reimplement)

```
DB write → notifyDataChanged('item.*') → BackupCoordinator (debounce ~1.5s) → exportDB() → latest.json
```

- `exportDB()` already exports full `items[]` — new optional fields ride along automatically.
- Cross-document refresh: `DATA_CHANGED_BROADCAST_CHANNEL` in `dataChangeNotifier.ts`.
- Reference: [`docs/DATA_BACKUP_AND_INTEGRITY.md`](../DATA_BACKUP_AND_INTEGRITY.md).

**Worker rule:** Every new write path must call `notifyDataChanged` with an appropriate reason (`item.update` / `item.delete`). Prefer going through `db.ts` helpers that already notify.

---

## Schema decision (locked for this task)

Add optional **timestamp fields** on `Item` (`src/lib/db.ts`). Presence = flag set; `undefined` = unset.

```typescript
export interface Item {
  // ... existing fields ...
  /** When set, item is pinned (sort/recency uses this timestamp). */
  pinnedAt?: number;
  /** When set, item is a favorite. */
  favoriteAt?: number;
  /** When set, item is in trash (soft-deleted). Hidden from normal library views. */
  deletedAt?: number;
}
```

**Why timestamps (not booleans):** single source of truth + stable sort order (newest pin/fav first).

### IndexedDB migration

- Bump **`DB_VERSION` from `7` → `8`**.
- In `upgrade()`: no store recreation required — new fields are optional on existing `items` records.
- **Optional (recommended):** add non-unique indexes on `items` for query speed:
  - `by-pinned` on `pinnedAt`
  - `by-favorite` on `favoriteAt`
  - `by-deleted` on `deletedAt`  
  (If indexes are awkward in idb upgrade, MVP may filter in memory after `getAll('items')` for typical library sizes — document choice in return.)

### Semantics

| Concept | Rule |
|---------|------|
| **Active item** | `deletedAt == null` (undefined) |
| **Pinned** | `pinnedAt != null` |
| **Favorite** | `favoriteAt != null` |
| **Trash** | `deletedAt != null` |
| Pin + favorite | Independent — item may be both |
| Trash | Clears from browse/search/lists; still in DB until permanent delete |

---

## Implementation plan

### 1. DB helpers (`src/lib/db.ts` or `src/lib/itemQuickAccess.ts`)

Export small API used by UI (all paths call `notifyDataChanged`):

| Function | Behavior |
|----------|----------|
| `pinItem(id)` | `updateItem(id, { pinnedAt: now })` |
| `unpinItem(id)` | `updateItem(id, { pinnedAt: undefined })` — use explicit clear in put |
| `favoriteItem(id)` / `unfavoriteItem(id)` | same pattern with `favoriteAt` |
| `moveItemToTrash(id)` | `updateItem(id, { deletedAt: now })` |
| `restoreItemFromTrash(id)` | clear `deletedAt` |
| `permanentlyDeleteItem(id)` | existing `deleteItem(id)` — hard delete + enrichment cleanup |
| `isActiveItem(item)` | `!item.deletedAt` |
| `getActiveItems()` | all items where `!deletedAt` |
| `getPinnedItems()` | active + `pinnedAt` set, sort desc |
| `getFavoriteItems()` | active + `favoriteAt` set, sort desc |
| `getTrashedItems()` | `deletedAt` set, sort desc |

**`getAllItems()`:** keep returning **all** rows (including trash) for backup/dev parity, OR document if you change default — prefer adding `getActiveItems()` and switching **product** loaders to it.

**`updateItem`:** already accepts `Partial<Item>` — use for flag toggles.

### 2. Product data loading (hide trash everywhere except Trash tab)

Audit and update callers so normal library views exclude trashed items:

| Area | Action |
|------|--------|
| `App.tsx` item load for dashboard | Prefer `getActiveItems()` (or filter after load) |
| `ItemsListPanel` / collection lists | Exclude `deletedAt` |
| `HomeView` recent list | Active only |
| `RecentTab` | Active only |
| Product search (`appSearch` / library search) | Exclude trashed |
| Pipeline digest queues | Exclude trashed (or document if intentional) |

**Trash tab** is the only product surface that lists `getTrashedItems()`.

### 3. Context menu (`ItemContextMenu.tsx`)

Add actions (lucide icons: Pin, Star, Trash2):

| Item state | Menu |
|------------|------|
| Active | Toggle **Pin** / **Unpin**, **Add to favorites** / **Remove favorite**, **Move to trash** (replaces or precedes hard Delete) |
| Trashed | **Restore**, **Delete permanently** (confirm) |

Wire from `ItemsListPanel`, `TabContent` (item tab), and any other menu host.

**Delete behavior change (product):**

- Default **Delete** in bookmark context → **`moveItemToTrash`** (soft).
- **Permanent delete** only from Trash tab (with confirm dialog).
- Keep `removeItemFromCollection` behavior unchanged (removes placement; hard-deletes item only when **last** placement removed — not the same as trash).

### 4. Utility tabs (replace placeholders)

Refactor `PinnedTab`, `FavoritesTab`, `TrashTab` to real lists (mirror `RecentTab` patterns):

- Load via helpers; `subscribeToDataChanges` or parent refresh so pin/fav/trash updates live.
- Row click → `onItemClick(item)` (open item tab).
- Empty states: short copy, no “Coming soon” blocks.
- **Trash tab header:** optional **Empty trash** (permanent delete all trashed — confirm).

### 5. Home Favorites card (`HomeView.tsx`)

Per [V2-PRODUCT-DESIGN-SPEC.md](V2-PRODUCT-DESIGN-SPEC.md) § Home Cards:

- Show up to **8** items: **favorites first**, then **pinned** (dedupe by id), newest first within each group.
- Empty state: *“Star or pin items to see them here. Right-click any item → Add to favorites or Pin.”*
- Click row → open item tab (existing `openItemTab`).
- **View all** link → open `util-favorites` tab (or pinned if only pins — pick one consistent target; document in return).

### 6. List polish (MVP)

| Enhancement | Priority |
|-------------|----------|
| Pin/star icons on `ItemsListPanel` rows when flagged | **Required** |
| Sort pinned to top within a collection list | **Stretch** |
| `ItemCard.tsx` (legacy grid) | Update if still used in product path; else skip |

### 7. Backup sync verification (required manual test)

Document in return:

1. Configure backup folder (Settings).
2. Pin an item → within ~2s footer shows live backup OK / revision bumps.
3. Open `latest.json` → find item with `pinnedAt` / `favoriteAt`.
4. Move to trash → item has `deletedAt`; still in backup JSON (soft delete preserved).
5. Restore → `deletedAt` cleared in JSON after debounce.
6. Permanent delete → item removed from `items[]` in next export.

### 8. Optional audit (stretch)

Grep for IndexedDB `put` on `items` outside `db.ts` — ensure notify. Known pipeline stores already notify separately; item flags should only use `db.ts`.

---

## Design spec references

| Topic | Where |
|-------|--------|
| Home Favorites card | `V2-PRODUCT-DESIGN-SPEC.md` — Home Cards |
| Quick access | Spec + `QuickActions.tsx` |
| Deferred IDs | `V2-DEFERRED-TRACKER.md` D-01…D-03 |

---

## UX copy (product)

| Action | Label |
|--------|--------|
| Pin | Pin |
| Unpin | Unpin |
| Favorite | Add to favorites |
| Unfavorite | Remove from favorites |
| Soft delete | Move to trash |
| Restore | Restore |
| Permanent delete | Delete permanently |
| Empty trash | Empty trash |
| Confirm permanent | “Permanently delete this item? This cannot be undone.” |
| Confirm empty trash | “Permanently delete all items in trash?” |

Use existing toast patterns from `DashboardLayout` / `ToastProvider`.

---

## Key files (expected touch)

| Action | Path |
|--------|------|
| **Edit** | `src/lib/db.ts` (Item type, v8 migration, helpers) |
| **Create** | `src/lib/itemQuickAccess.ts` (optional — re-export from db if you prefer single file) |
| **Edit** | `ItemContextMenu.tsx` |
| **Edit** | `ItemsListPanel.tsx`, `TabContent.tsx` |
| **Edit** | `PinnedTab.tsx`, `FavoritesTab.tsx`, `TrashTab.tsx` |
| **Edit** | `HomeView.tsx` |
| **Edit (Tier B)** | `SidePanelView.tsx`, `ItemQuickAccessMarkers.tsx`, `QuickAccessTab.tsx`, `ProductSearchView.tsx` |
| **Edit (Tier C — adjacent)** | `HelpView.tsx`, `Resizer.tsx`, `MainContent.tsx`, `LeftSidebar.tsx` |
| **Edit** | `App.tsx`, `ProjectDashboard.tsx` (active item loading) |
| **Maybe** | `src/lib/search/appSearch.ts` (exclude trash) |
| **Do not** | Pipeline classify/enrich logic, `docs/backlog.md`, umbrella docs |

---

## Acceptance criteria

### Required

- [x] `Item` has `pinnedAt`, `favoriteAt`, `deletedAt`; DB migrates v7→v8 without data loss
- [x] User can pin/unpin and favorite/unfavorite from context menu on active items
- [x] User can move active item to trash; item disappears from normal lists and search
- [x] Trash tab lists trashed items; user can restore or permanently delete
- [x] Home card shows pinned/favorited items (up to 8) with working open-item click
- [x] Pinned / Favorites utility tabs show real lists (not placeholders)
- [x] Every mutation calls `notifyDataChanged`; live backup updates `latest.json` with new fields
- [x] `npm run build` passes
- [x] Dev hub / pipeline behavior unchanged

### Stretch

- [ ] Pinned items sort to top in `ItemsListPanel`
- [x] Empty trash action
- [x] `subscribeToDataChanges` refresh on utility tabs without full page reload (Trash tab; Pinned/Favorites via BroadcastChannel → App reload)
- [ ] IndexedDB indexes for pin/fav/trash (MVP: filter in memory after `getAll`)

### Explicitly out of scope

- [ ] D-04 / D-05 schema
- [ ] D-26 / W6 category change / pipeline triggers
- [ ] D-25 fetch review UI
- [ ] 30-day auto-purge alarm
- [ ] Editing `docs/backlog.md` / `OVERVIEW.md` / `README.md`

---

## Testing hints (manual)

1. Pin item A → appears in Pinned tab + Home card; `latest.json` has `pinnedAt`.
2. Favorite item B → appears in Favorites tab + Home card; unpin A → gone from Pinned, still in backup history until next save reflects clear.
3. Move item C to trash → gone from Bookmarks list; visible in Trash; search does not return C.
4. Restore C → back in library.
5. Permanent delete from Trash → gone from DB and next `latest.json` export.
6. Import backup on fresh profile (or reload) → pin/fav/trash flags restored.
7. Multi-placement item: trash hides whole item from active views (placements remain on record until permanent delete).

---

## Task 05.B return

### Tier A — Core (D-01…D-03)

- Pin / favorite / soft-delete on `Item` (`pinnedAt`, `favoriteAt`, `deletedAt`); DB v7→v8.
- `itemQuickAccess.ts` helpers; all writes → `notifyDataChanged` → live backup pipeline.
- Context menu + trash tab (restore, permanent delete, Empty trash); Pinned / Favorites utility tabs.
- Home **Favorites & pins** card (8 items); trash hidden from lists, search, pipeline digest.
- `getActiveItems()` for product loaders; permanent delete via existing `deleteItem()`.

### Tier B — Polish (same session, optional scope)

- Combined **Favorites & pins** tab (`util-quick-access`); Home quick links.
- `ItemQuickAccessMarkers` (⭐ then 📌); side panel pin/fav; item-tab + search-result actions.
- Multi-collection **Remove** vs **Trash** semantics; last placement removed → trash not hard delete.

### Tier C — Adjacent (not D-01…D-03)

- **Home vertical split** — draggable landing vs tab strip (`topPct` in localStorage).
- **Help v1** — `HelpView` + left nav entry (text-only).

### Master / end of V2

- **D-35:** Live backup still rewrites **full** `latest.json` on every debounced change — **important** to address **by end of V2 iteration** (see deferred tracker + [`DATA_BACKUP_AND_INTEGRITY.md`](../DATA_BACKUP_AND_INTEGRITY.md#end-of-v2-backup--export-scale)).
- **Files:** `src/lib/db.ts`, `src/lib/itemQuickAccess.ts`, `src/lib/search/appSearch.ts`, `src/lib/pipeline/itemPipelineContext.ts`, `src/App.tsx`, `ItemContextMenu.tsx`, `DeleteConfirmDialog.tsx`, `QuickAccessItemList.tsx`, `QuickAccessTab.tsx`, `PinnedTab.tsx`, `FavoritesTab.tsx`, `TrashTab.tsx`, `RecentTab.tsx`, `HomeView.tsx`, `ItemsListPanel.tsx`, `TabContent.tsx`, `GlobalTabSystem.tsx`, `ProductSearchView.tsx`, `ProjectDashboard.tsx`, `DashboardLayout.tsx`, `SidePanelView.tsx`, `ItemQuickAccessMarkers.tsx`, `Resizer.tsx`, `MainContent.tsx`, `LeftSidebar.tsx`, `HelpView.tsx`
- **Migration:** v7→v8 — optional timestamp fields on existing `items` records; no store recreation; no backfill required. IndexedDB indexes deferred (in-memory filter).
- **Backup verification:** Not run in this session — code paths use existing `notifyDataChanged` → `BackupCoordinator`. Manual: pin item → check `latest.json` for `pinnedAt`; trash → `deletedAt` present; permanent delete → row removed.
- **Delete semantics (per product decisions):**
  - **Move to trash / delete everywhere:** sets `deletedAt` (single- or multi-collection).
  - **Remove from this collection:** only when item is in **multiple** collections (dialog); removes placement, item stays active.
  - **Last placement removed** (e.g. side panel Remove on only collection): **trash** (`deletedAt`), not hard delete.
  - **Permanent delete:** Trash tab only → existing `deleteItem()` + enrichment cleanup.
  - **Open item tab after trash:** tab stays open; item resolved via `getItem()` fallback when not in active list.
- **Deviations:** Original brief: View all → `util-favorites` only; shipped combined `util-quick-access`. Tier B/C documented above.
- **Suggested master doc updates:** Done in master pass 2026-05-27 — D-01…D-03 closed; **D-35** opened; Help v1 + Home split noted as adjacent.
- **Known gaps (05.B):** ~~Pinned sort-to-top~~ → **05.C**; IndexedDB indexes; 30-day auto-purge; **manual `latest.json` verification** (steps in 05.C return).

---

## After 05.B (master planning — do not implement here)

| ID | What |
|----|------|
| **V2-C** | Fetch quality, in-tab fetch, embed hooks |
| **D-26 + W6** | Category UX + signal→pipeline matrix (one design pass) |
| **D-25** | Two-quality fetch review UI (after V2-C) |
| **D-04 / D-05** | Notes model + import provenance |

*Last updated: 2026-05-27 — **Done.** Required acceptance met; follow-up UX (side panel pin/fav, marker icons, home split, Help v1) documented in return. Master: backup scale by end of V2.*
