# Data Folder

This folder is for **local artifacts** related to data management:

- **Backups** (JSON exports)
- **Migration notes** (what version changed, how we migrated)
- Any other local data files we may introduce later (optional)

## Suggested structure

- `data/backups/` — exported JSON backups (manual or automated)
- `data/migrations/` — notes/checklists for schema changes
- `data/experiments/` — local CLI eval outputs (`enrich-fetch/`, `categorize/`); ignored by git

> Note: Some artifacts may be user-specific and should not be committed if they contain personal data.


