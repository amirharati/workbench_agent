# Migration v3 Verification Checklist

After opening the extension/app, verify the migration succeeded:

## Quick Check (Chrome DevTools)

1. **Open DevTools**: Right-click extension → Inspect, or `Cmd+Option+I`
2. **Go to Application tab** → IndexedDB → `personal-tools-db`
3. **Check version**: Should show **Version: 3**

## Verify New Stores

- ✅ `projects` store exists
- ✅ `notes` store exists

## Verify Default Project

In `projects` store:
- ✅ Entry with `id: "project_all"`
- ✅ `name: "All"`
- ✅ `isDefault: true`

## Verify Collections Migration

In `collections` store, each collection should have:
- ✅ `primaryProjectId: "project_all"` (or another project ID)
- ✅ `projectIds: ["project_all"]` (array, includes primaryProjectId)
- ✅ `updated_at: <number>` (timestamp)
- ✅ One collection with `isDefault: true` and `id: "collection_project_all_unsorted"`

## Verify Items Migration

In `items` store, each item should have:
- ✅ `collectionIds: [...]` (array, NOT `collectionId`)
- ✅ `updated_at: <number>` (timestamp)
- ✅ Items without a collection should have `collectionIds: ["collection_project_all_unsorted"]`

## Verify Workspaces Migration

In `workspaces` store, each workspace should have:
- ✅ `projectId: undefined` (or a project ID if set)

## If Something Looks Wrong

1. Check browser console for errors
2. Export current data (Backup button)
3. Check if data still appears in UI
4. Report what you see

