# IndexedDB Migration v3

## Summary

This migration bumps IndexedDB from **v2 → v3** and introduces the foundations for:
- **Projects**
- **Notes**
- **Items (Bookmarks) in multiple collections** (`collectionIds[]`)
- **Collections scoped to a primary project + shareable across projects**
- **Workspaces optionally associated with a project** (`projectId?`)

## Safety (recommended)

Before running a build with this migration, take a backup:
- Use the UI **Backup/Export** action and save the JSON into `data/backups/` (or any safe location).

## Schema changes

- Added stores:
  - `projects`
  - `notes`
- Updated `items`:
  - `collectionId?: string` → `collectionIds: string[]` (multiEntry index)
  - Added `updated_at`
- Updated `collections`:
  - Added `updated_at`, `primaryProjectId`, `projectIds[]`, `isDefault`
- Updated `workspaces`:
  - Added `projectId?: string`

## Migration behavior

- Ensures a default project exists (`project_all`, name: `All`).
- Ensures a default \"Unsorted\" collection exists for that project.
- Migrates existing collections by assigning them to the default project as their primary project.
- Migrates existing items:
  - If `collectionId` existed → becomes `collectionIds: [collectionId]`
  - If no collection was set → becomes `collectionIds: [defaultUnsortedCollectionId]`
- Adds `projectId: undefined` to existing workspaces.


