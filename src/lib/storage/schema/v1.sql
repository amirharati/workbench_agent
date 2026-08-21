-- SQLite Schema v1 for Tab Manager AI
-- Migrated from IndexedDB version 9
-- PRAGMA user_version = 1;

-- ============================================================================
-- Meta tables (V2.1 sync hooks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_meta (
  id TEXT PRIMARY KEY DEFAULT 'default',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  device_id TEXT
);

CREATE TABLE IF NOT EXISTS sync_meta (
  id TEXT PRIMARY KEY DEFAULT 'default',
  local_revision INTEGER NOT NULL DEFAULT 0,
  last_exported_at INTEGER
);

-- ============================================================================
-- Domain tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  primary_project_id TEXT,
  project_ids TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (primary_project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_collections_name ON collections(name);
CREATE INDEX IF NOT EXISTS idx_collections_primary_project ON collections(primary_project_id);
CREATE INDEX IF NOT EXISTS idx_collections_updated ON collections(updated_at);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  url_raw TEXT,
  title TEXT NOT NULL DEFAULT '',
  favicon TEXT,
  collection_ids TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  placements TEXT,
  removed_placements TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  metadata TEXT,
  pinned_at INTEGER,
  favorite_at INTEGER,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_items_url ON items(url);
CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_items_updated ON items(updated_at);
CREATE INDEX IF NOT EXISTS idx_items_pinned ON items(pinned_at);
CREATE INDEX IF NOT EXISTS idx_items_favorite ON items(favorite_at);

-- Durable project/collection Trash entries.  The payload is an exact
-- pre-delete snapshot used to restore the container and its memberships.
CREATE TABLE IF NOT EXISTS container_trash (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_container_trash_deleted ON container_trash(deleted_at);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  collection_id TEXT,
  linked_item_ids TEXT NOT NULL DEFAULT '[]',
  page_context TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  external_ids TEXT,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_collection ON notes(collection_id);
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  tab_count INTEGER NOT NULL,
  tabs TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  windows TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name);
CREATE INDEX IF NOT EXISTS idx_workspaces_project ON workspaces(project_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_updated ON workspaces(updated_at);

-- ============================================================================
-- Enrichment
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_enrichment (
  item_id TEXT PRIMARY KEY,
  normalized_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'none',
  provider_id TEXT NOT NULL DEFAULT '',
  fetched_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_detail TEXT,
  next_retry_at INTEGER,
  content_hash TEXT,
  text_hash TEXT,
  snippet TEXT,
  summary TEXT,
  fetched_title TEXT,
  source_kind TEXT,
  quoted_text TEXT,
  quoted_author TEXT,
  channel TEXT,
  description TEXT,
  raw_ref TEXT,
  raw_bytes INTEGER,
  has_raw_body INTEGER NOT NULL DEFAULT 0,
  skip_reason TEXT,
  tier2_applied TEXT,
  fetch_source_id TEXT,
  ai_tags TEXT,
  ai_key_points TEXT,
  references_json TEXT,
  ai_status TEXT,
  ai_error TEXT,
  ai_at INTEGER,
  pending_fetch_review INTEGER DEFAULT 0,
  pending_fetch_review_reason TEXT,
  review_raw_ref TEXT,
  failure_stage TEXT,
  failure_category TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_enrichment_status ON item_enrichment(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_updated ON item_enrichment(updated_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_normalized_url ON item_enrichment(normalized_url);

-- Debug-only per-item pipeline timings (purge with clearAllPipelineDebug / Settings).
CREATE TABLE IF NOT EXISTS pipeline_debug (
  item_id TEXT PRIMARY KEY,
  captured_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pipeline_debug_captured ON pipeline_debug(captured_at);

-- ============================================================================
-- AI Categorization
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'leaf',
  status TEXT NOT NULL DEFAULT 'ai_proposed',
  assignable INTEGER NOT NULL DEFAULT 1,
  parent_id TEXT,
  parent_name TEXT,
  description TEXT,
  source TEXT,
  centroid BLOB,
  canonical_tags TEXT,
  is_general_fallback INTEGER DEFAULT 0,
  item_count INTEGER DEFAULT 0,
  primary_item_count INTEGER DEFAULT 0,
  secondary_item_count INTEGER DEFAULT 0,
  child_leaf_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES ai_categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_status ON ai_categories(status);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON ai_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_kind ON ai_categories(kind);
CREATE INDEX IF NOT EXISTS idx_categories_updated ON ai_categories(updated_at);

CREATE TABLE IF NOT EXISTS ai_item_category_links (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'ai',
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES ai_categories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_links_item ON ai_item_category_links(item_id);
CREATE INDEX IF NOT EXISTS idx_links_category ON ai_item_category_links(category_id);
CREATE INDEX IF NOT EXISTS idx_links_status ON ai_item_category_links(status);
CREATE INDEX IF NOT EXISTS idx_links_updated ON ai_item_category_links(updated_at);

CREATE TABLE IF NOT EXISTS ai_item_signals (
  item_id TEXT PRIMARY KEY,
  text_hash TEXT NOT NULL,
  classify_text_hash TEXT,
  embedding_model TEXT NOT NULL DEFAULT '',
  embedding BLOB,
  derived_tags TEXT NOT NULL DEFAULT '[]',
  tag_confidence REAL,
  signal_status TEXT NOT NULL DEFAULT 'ok',
  classify_state TEXT DEFAULT 'pending_classify',
  discover_state TEXT DEFAULT 'none',
  is_novelty INTEGER DEFAULT 0,
  classify_retry_count INTEGER DEFAULT 0,
  last_classify_skip_reason TEXT,
  eligibility_reason TEXT,
  input_quality_tier TEXT,
  last_processed_at INTEGER NOT NULL,
  last_classified_at INTEGER,
  llm_review TEXT,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_signals_classify_state ON ai_item_signals(classify_state);
CREATE INDEX IF NOT EXISTS idx_signals_discover_state ON ai_item_signals(discover_state);
CREATE INDEX IF NOT EXISTS idx_signals_updated ON ai_item_signals(last_processed_at);

CREATE TABLE IF NOT EXISTS ai_taxonomy_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  taxonomy_version INTEGER NOT NULL DEFAULT 0,
  classify_mode TEXT NOT NULL DEFAULT 'topic-extract',
  embedding_model TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
  discover_batch_threshold INTEGER NOT NULL DEFAULT 50,
  bulk_import_threshold INTEGER NOT NULL DEFAULT 200,
  bulk_mode_active INTEGER NOT NULL DEFAULT 0,
  bulk_discover_runs INTEGER NOT NULL DEFAULT 0,
  max_bulk_discover_runs INTEGER NOT NULL DEFAULT 3,
  max_new_leaves_per_discover INTEGER NOT NULL DEFAULT 20,
  max_new_parents_per_discover INTEGER NOT NULL DEFAULT 5,
  unassigned_threshold_percent INTEGER NOT NULL DEFAULT 15,
  last_discover_at INTEGER,
  last_classify_at INTEGER,
  last_classify_run TEXT,
  last_discover_run TEXT,
  updated_at INTEGER NOT NULL
);

-- ============================================================================
-- Trash history
-- ============================================================================

CREATE TABLE IF NOT EXISTS trash_history (
  normalized_url TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  reason TEXT NOT NULL,
  reason_code TEXT NOT NULL DEFAULT 'manual',
  item_id TEXT,
  trashed_at INTEGER NOT NULL,
  purged_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_trash_trashed ON trash_history(trashed_at);

-- ============================================================================
-- Deleted-items registry (permanent delete tombstones for sync merge)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deleted_items (
  id TEXT PRIMARY KEY,
  purged_at INTEGER NOT NULL,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_deleted_items_purged ON deleted_items(purged_at);
