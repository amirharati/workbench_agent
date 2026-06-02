# Task 01 return (implementation session)

## Shipped

- Full `src/lib/enrichment/` module: eligibility, parse, Jina + noop providers, IDB storage, disk `rawBodyStore`, `fetchService` orchestrator, `buildItemText`.
- IndexedDB **v5** with `item_enrichment` store; export/import includes enrichment rows.
- Disk cache: `{userBackupFolder}/enrichment-cache/{itemId}.md` via existing backup folder handle.
- UI: **Enrich** button on Bookmarks header + post-import enrich on Import Studio.
- Item delete cleans enrichment IDB + disk file.

## Files

| Area | Path |
|------|------|
| Core | `src/lib/enrichment/*` |
| DB v5 | `src/lib/db.ts` |
| UI | `src/components/dashboard/EnrichmentPanel.tsx`, `MainContent.tsx`, `ImportStudioView.tsx` |
| Verify | `data/migrations/v5-console-check.js` |

## Storage

- **IDB:** `item_enrichment` keyed by `itemId` — snippet, summary, status, X/video fields, `rawRef`, hashes.
- **Disk:** `enrichment-cache/{itemId}.md` under user backup folder (degrades gracefully if folder not set).
- **Item tier-2:** title / `metadata.platform` only when weak/missing; notes never touched.

## `buildItemText`

`src/lib/enrichment/itemText.ts` — sync default; `buildItemTextAsync` optional `loadRaw`.

## Deviations

- No Vitest yet (build-only); manual subset testing required in extension.
- `AbortSignal.any` not used (listener-based abort).
- Import commit does not return new IDs; post-import enrich uses **collection** scope.

## Manual test checklist

1. Configure backup folder (Settings).
2. **Thin bookmark** → Enrich smart → `ok`, snippet in IDB, file in `enrichment-cache/`.
3. **Rich notes** → smart skip → `skipped_sufficient_local`.
4. **Article URL** → snippet populated.
5. **X URL** → check `quotedText` or `parse_empty` / failed.
6. Reload extension → enrichment state persists.
7. Delete item → `.md` file removed.
8. Export DB JSON → includes `item_enrichment` array.

## Ready for Task 02

**Yes** — `buildItemText(item, enrichment)` and persisted enrichment records are in place.
