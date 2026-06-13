/**
 * SQLite Store
 * 
 * Provides typed CRUD operations for all entity types.
 * Maps SQLite rows to TypeScript types with JSON field parsing.
 */

import { getConnection, getConnectionSync } from './connection';
import type { SqliteConnection } from './types';
import type {
  Project,
  Collection,
  Item,
  ItemPlacement,
  Note,
  Snapshot,
  Workspace,
  WorkspaceWindow,
} from '../../db';
import type { EnrichmentReference, ItemEnrichment } from '../../enrichment/types';
import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  AiTaxonomyState,
} from '../../categorization/types';
import type { TrashHistoryEntry } from '../../trashHistory';

// ============================================================================
// Row type mappers (snake_case DB -> camelCase TS)
// ============================================================================

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  is_default: number;
  created_at: number;
  updated_at: number;
}

interface CollectionRow {
  id: string;
  name: string;
  color: string | null;
  is_default: number;
  created_at: number;
  updated_at: number;
  primary_project_id: string | null;
  project_ids: string;
}

interface ItemRow {
  id: string;
  url: string;
  url_raw: string | null;
  title: string;
  favicon: string | null;
  collection_ids: string;
  tags: string;
  notes: string | null;
  placements: string | null;
  created_at: number;
  updated_at: number;
  source: string;
  metadata: string | null;
  pinned_at: number | null;
  favorite_at: number | null;
  deleted_at: number | null;
}

interface NoteRow {
  id: string;
  title: string;
  content: string;
  collection_id: string | null;
  linked_item_ids: string;
  page_context: string | null;
  created_at: number;
  updated_at: number;
  external_ids: string | null;
}

interface SnapshotRow {
  id: number;
  timestamp: number;
  tab_count: number;
  tabs: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  project_id: string | null;
  created_at: number;
  updated_at: number;
  windows: string;
}

interface EnrichmentRow {
  item_id: string;
  normalized_url: string;
  status: string;
  provider_id: string;
  fetched_at: number | null;
  attempts: number;
  last_error_code: string | null;
  last_error_detail: string | null;
  next_retry_at: number | null;
  content_hash: string | null;
  text_hash: string | null;
  snippet: string | null;
  summary: string | null;
  fetched_title: string | null;
  source_kind: string | null;
  quoted_text: string | null;
  quoted_author: string | null;
  channel: string | null;
  description: string | null;
  raw_ref: string | null;
  raw_bytes: number | null;
  has_raw_body: number;
  skip_reason: string | null;
  tier2_applied: string | null;
  fetch_source_id: string | null;
  ai_tags: string | null;
  ai_key_points: string | null;
  references_json: string | null;
  ai_status: string | null;
  ai_error: string | null;
  ai_at: number | null;
  pending_fetch_review: number;
  pending_fetch_review_reason: string | null;
  review_raw_ref: string | null;
  failure_stage: string | null;
  failure_category: string | null;
  updated_at: number;
}

interface PipelineDebugRow {
  item_id: string;
  captured_at: number;
  payload: string;
}

interface CategoryRow {
  id: string;
  name: string;
  kind: string;
  status: string;
  assignable: number;
  parent_id: string | null;
  parent_name: string | null;
  description: string | null;
  source: string | null;
  centroid: Uint8Array | null;
  canonical_tags: string | null;
  is_general_fallback: number;
  item_count: number;
  primary_item_count: number;
  secondary_item_count: number;
  child_leaf_count: number;
  created_at: number;
  updated_at: number;
}

interface LinkRow {
  id: string;
  item_id: string;
  category_id: string;
  score: number;
  is_primary: number;
  source: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface SignalRow {
  item_id: string;
  text_hash: string;
  classify_text_hash: string | null;
  embedding_model: string;
  embedding: Uint8Array | null;
  derived_tags: string;
  tag_confidence: number | null;
  signal_status: string;
  classify_state: string | null;
  discover_state: string | null;
  is_novelty: number;
  classify_retry_count: number;
  last_classify_skip_reason: string | null;
  eligibility_reason: string | null;
  input_quality_tier: string | null;
  last_processed_at: number;
  last_classified_at: number | null;
  llm_review: string | null;
}

interface TaxonomyRow {
  id: string;
  taxonomy_version: number;
  classify_mode: string;
  embedding_model: string;
  discover_batch_threshold: number;
  bulk_import_threshold: number;
  bulk_mode_active: number;
  bulk_discover_runs: number;
  max_bulk_discover_runs: number;
  max_new_leaves_per_discover: number;
  max_new_parents_per_discover: number;
  unassigned_threshold_percent: number;
  last_discover_at: number | null;
  last_classify_at: number | null;
  last_classify_run: string | null;
  last_discover_run: string | null;
  updated_at: number;
}

interface TrashRow {
  normalized_url: string;
  url: string;
  title: string | null;
  reason: string;
  reason_code: string;
  item_id: string | null;
  trashed_at: number;
  purged_at: number | null;
}

// ============================================================================
// Mappers
// ============================================================================

const parseJson = <T>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

const toJson = (value: unknown): string => JSON.stringify(value);

const blobToArray = (blob: Uint8Array | null): number[] => {
  if (!blob) return [];
  return Array.from(new Float32Array(blob.buffer));
};

const arrayToBlob = (arr: number[] | undefined): Uint8Array | null => {
  if (!arr || arr.length === 0) return null;
  return new Uint8Array(new Float32Array(arr).buffer);
};

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isDefault: row.is_default === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function projectToRow(p: Project): Omit<ProjectRow, 'rowid'> {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    is_default: p.isDefault ? 1 : 0,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    isDefault: row.is_default === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    primaryProjectId: row.primary_project_id ?? '',
    projectIds: parseJson<string[]>(row.project_ids, []),
  };
}

function collectionToRow(c: Collection): CollectionRow {
  return {
    id: c.id,
    name: c.name,
    color: c.color ?? null,
    is_default: c.isDefault ? 1 : 0,
    created_at: c.created_at,
    updated_at: c.updated_at,
    primary_project_id: c.primaryProjectId || null,
    project_ids: toJson(c.projectIds || []),
  };
}

function rowToItem(row: ItemRow): Item {
  const item: Item = {
    id: row.id,
    url: row.url,
    title: row.title,
    collectionIds: parseJson<string[]>(row.collection_ids, []),
    tags: parseJson<string[]>(row.tags, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
    source: row.source as Item['source'],
  };
  if (row.url_raw) item.urlRaw = row.url_raw;
  if (row.favicon) item.favicon = row.favicon;
  if (row.notes) item.notes = row.notes;
  if (row.placements) item.placements = parseJson<Record<string, ItemPlacement>>(row.placements, {});
  if (row.metadata) item.metadata = parseJson<Record<string, unknown>>(row.metadata, {});
  if (row.pinned_at) item.pinnedAt = row.pinned_at;
  if (row.favorite_at) item.favoriteAt = row.favorite_at;
  if (row.deleted_at) item.deletedAt = row.deleted_at;
  return item;
}

function itemToRow(i: Item): ItemRow {
  return {
    id: i.id,
    url: i.url,
    url_raw: i.urlRaw ?? null,
    title: i.title,
    favicon: i.favicon ?? null,
    collection_ids: toJson(i.collectionIds || []),
    tags: toJson(i.tags || []),
    notes: i.notes ?? null,
    placements: i.placements ? toJson(i.placements) : null,
    created_at: i.created_at,
    updated_at: i.updated_at,
    source: i.source,
    metadata: i.metadata ? toJson(i.metadata) : null,
    pinned_at: i.pinnedAt ?? null,
    favorite_at: i.favoriteAt ?? null,
    deleted_at: i.deletedAt ?? null,
  };
}

function rowToNote(row: NoteRow): Note {
  const note: Note = {
    id: row.id,
    title: row.title,
    content: row.content,
    collectionId: row.collection_id ?? '',
    linkedItemIds: parseJson<string[]>(row.linked_item_ids, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.page_context) {
    const ctx = parseJson<{ url: string; title: string; timestamp: number }>(row.page_context, { url: '', title: '', timestamp: 0 });
    if (ctx.url) note.pageContext = ctx;
  }
  if (row.external_ids) note.externalIds = parseJson<Record<string, string>>(row.external_ids, {});
  return note;
}

function noteToRow(n: Note): NoteRow {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    collection_id: n.collectionId || null,
    linked_item_ids: toJson(n.linkedItemIds || []),
    page_context: n.pageContext ? toJson(n.pageContext) : null,
    created_at: n.created_at,
    updated_at: n.updated_at,
    external_ids: n.externalIds ? toJson(n.externalIds) : null,
  };
}

function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    timestamp: row.timestamp,
    tabCount: row.tab_count,
    tabs: parseJson(row.tabs, []),
  };
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    windows: parseJson<WorkspaceWindow[]>(row.windows, []),
  };
}

function workspaceToRow(w: Workspace): WorkspaceRow {
  return {
    id: w.id,
    name: w.name,
    project_id: w.projectId ?? null,
    created_at: w.created_at,
    updated_at: w.updated_at,
    windows: toJson(w.windows || []),
  };
}

function rowToEnrichment(row: EnrichmentRow): ItemEnrichment {
  const e: ItemEnrichment = {
    itemId: row.item_id,
    normalizedUrl: row.normalized_url,
    status: row.status as ItemEnrichment['status'],
    providerId: row.provider_id,
    attempts: row.attempts,
    hasRawBody: row.has_raw_body === 1,
    updated_at: row.updated_at,
  };
  if (row.fetched_at) e.fetchedAt = row.fetched_at;
  if (row.last_error_code) e.lastErrorCode = row.last_error_code as ItemEnrichment['lastErrorCode'];
  if (row.last_error_detail) e.lastErrorDetail = row.last_error_detail;
  if (row.next_retry_at) e.nextRetryAt = row.next_retry_at;
  if (row.content_hash) e.contentHash = row.content_hash;
  if (row.text_hash) e.textHash = row.text_hash;
  if (row.snippet) e.snippet = row.snippet;
  if (row.summary) e.summary = row.summary;
  if (row.fetched_title) e.fetchedTitle = row.fetched_title;
  if (row.source_kind) e.sourceKind = row.source_kind as ItemEnrichment['sourceKind'];
  if (row.quoted_text) e.quotedText = row.quoted_text;
  if (row.quoted_author) e.quotedAuthor = row.quoted_author;
  if (row.channel) e.channel = row.channel;
  if (row.description) e.description = row.description;
  if (row.raw_ref) e.rawRef = row.raw_ref;
  if (row.raw_bytes) e.rawBytes = row.raw_bytes;
  if (row.skip_reason) e.skipReason = row.skip_reason;
  if (row.tier2_applied) e.tier2Applied = parseJson<string[]>(row.tier2_applied, []);
  if (row.fetch_source_id) e.fetchSourceId = row.fetch_source_id;
  if (row.ai_tags) e.aiTags = parseJson<string[]>(row.ai_tags, []);
  if (row.ai_key_points) e.aiKeyPoints = parseJson<string[]>(row.ai_key_points, []);
  if (row.references_json) e.references = parseJson<EnrichmentReference[]>(row.references_json, []);
  if (row.ai_status) e.aiStatus = row.ai_status as ItemEnrichment['aiStatus'];
  if (row.ai_error) e.aiError = row.ai_error;
  if (row.ai_at) e.aiAt = row.ai_at;
  if (row.pending_fetch_review) e.pendingFetchReview = true;
  if (row.pending_fetch_review_reason) e.pendingFetchReviewReason = row.pending_fetch_review_reason as ItemEnrichment['pendingFetchReviewReason'];
  if (row.review_raw_ref) e.reviewRawRef = row.review_raw_ref;
  if (row.failure_stage) e.failureStage = row.failure_stage as ItemEnrichment['failureStage'];
  if (row.failure_category) e.failureCategory = row.failure_category;
  return e;
}

function enrichmentToRow(e: ItemEnrichment): EnrichmentRow {
  return {
    item_id: e.itemId,
    normalized_url: e.normalizedUrl,
    status: e.status,
    provider_id: e.providerId,
    fetched_at: e.fetchedAt ?? null,
    attempts: e.attempts,
    last_error_code: e.lastErrorCode ?? null,
    last_error_detail: e.lastErrorDetail ?? null,
    next_retry_at: e.nextRetryAt ?? null,
    content_hash: e.contentHash ?? null,
    text_hash: e.textHash ?? null,
    snippet: e.snippet ?? null,
    summary: e.summary ?? null,
    fetched_title: e.fetchedTitle ?? null,
    source_kind: e.sourceKind ?? null,
    quoted_text: e.quotedText ?? null,
    quoted_author: e.quotedAuthor ?? null,
    channel: e.channel ?? null,
    description: e.description ?? null,
    raw_ref: e.rawRef ?? null,
    raw_bytes: e.rawBytes ?? null,
    has_raw_body: e.hasRawBody ? 1 : 0,
    skip_reason: e.skipReason ?? null,
    tier2_applied: e.tier2Applied ? toJson(e.tier2Applied) : null,
    fetch_source_id: e.fetchSourceId ?? null,
    ai_tags: e.aiTags ? toJson(e.aiTags) : null,
    ai_key_points: e.aiKeyPoints ? toJson(e.aiKeyPoints) : null,
    references_json: e.references?.length ? toJson(e.references) : null,
    ai_status: e.aiStatus ?? null,
    ai_error: e.aiError ?? null,
    ai_at: e.aiAt ?? null,
    pending_fetch_review: e.pendingFetchReview ? 1 : 0,
    pending_fetch_review_reason: e.pendingFetchReviewReason ?? null,
    review_raw_ref: e.reviewRawRef ?? null,
    failure_stage: e.failureStage ?? null,
    failure_category: e.failureCategory ?? null,
    updated_at: e.updated_at,
  };
}

function rowToCategory(row: CategoryRow): AiCategory {
  const cat: AiCategory = {
    id: row.id,
    name: row.name,
    kind: row.kind as AiCategory['kind'],
    status: row.status as AiCategory['status'],
    assignable: row.assignable === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.parent_id) cat.parentId = row.parent_id;
  if (row.parent_name) cat.parentName = row.parent_name;
  if (row.description) cat.description = row.description;
  if (row.source) cat.source = row.source as AiCategory['source'];
  if (row.centroid) cat.centroid = blobToArray(row.centroid);
  if (row.canonical_tags) cat.canonicalTags = parseJson<string[]>(row.canonical_tags, []);
  if (row.is_general_fallback) cat.isGeneralFallback = true;
  if (row.item_count) cat.itemCount = row.item_count;
  if (row.primary_item_count) cat.primaryItemCount = row.primary_item_count;
  if (row.secondary_item_count) cat.secondaryItemCount = row.secondary_item_count;
  if (row.child_leaf_count) cat.childLeafCount = row.child_leaf_count;
  return cat;
}

function categoryToRow(c: AiCategory): CategoryRow {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    status: c.status,
    assignable: c.assignable ? 1 : 0,
    parent_id: c.parentId ?? null,
    parent_name: c.parentName ?? null,
    description: c.description ?? null,
    source: c.source ?? null,
    centroid: arrayToBlob(c.centroid),
    canonical_tags: c.canonicalTags ? toJson(c.canonicalTags) : null,
    is_general_fallback: c.isGeneralFallback ? 1 : 0,
    item_count: c.itemCount ?? 0,
    primary_item_count: c.primaryItemCount ?? 0,
    secondary_item_count: c.secondaryItemCount ?? 0,
    child_leaf_count: c.childLeafCount ?? 0,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

function rowToLink(row: LinkRow): AiItemCategoryLink {
  return {
    id: row.id,
    itemId: row.item_id,
    categoryId: row.category_id,
    score: row.score,
    isPrimary: row.is_primary === 1,
    source: row.source as AiItemCategoryLink['source'],
    status: row.status as AiItemCategoryLink['status'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function linkToRow(l: AiItemCategoryLink): LinkRow {
  return {
    id: l.id,
    item_id: l.itemId,
    category_id: l.categoryId,
    score: l.score,
    is_primary: l.isPrimary ? 1 : 0,
    source: l.source,
    status: l.status,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

function rowToSignal(row: SignalRow): AiItemSignal {
  return {
    itemId: row.item_id,
    textHash: row.text_hash,
    classifyTextHash: row.classify_text_hash ?? undefined,
    embeddingModel: row.embedding_model,
    embedding: blobToArray(row.embedding),
    derivedTags: parseJson<string[]>(row.derived_tags, []),
    tagConfidence: row.tag_confidence ?? undefined,
    signalStatus: row.signal_status as AiItemSignal['signalStatus'],
    classifyState: row.classify_state as AiItemSignal['classifyState'],
    discoverState: row.discover_state as AiItemSignal['discoverState'],
    isNovelty: row.is_novelty === 1,
    classifyRetryCount: row.classify_retry_count,
    lastClassifySkipReason: row.last_classify_skip_reason ?? undefined,
    eligibilityReason: row.eligibility_reason ?? undefined,
    inputQualityTier: row.input_quality_tier as AiItemSignal['inputQualityTier'],
    lastProcessedAt: row.last_processed_at,
    lastClassifiedAt: row.last_classified_at ?? undefined,
    llmReview: parseJson(row.llm_review, undefined),
  };
}

function signalToRow(s: AiItemSignal): SignalRow {
  return {
    item_id: s.itemId,
    text_hash: s.textHash,
    classify_text_hash: s.classifyTextHash ?? null,
    embedding_model: s.embeddingModel,
    embedding: arrayToBlob(s.embedding),
    derived_tags: toJson(s.derivedTags || []),
    tag_confidence: s.tagConfidence ?? null,
    signal_status: s.signalStatus,
    classify_state: s.classifyState ?? null,
    discover_state: s.discoverState ?? null,
    is_novelty: s.isNovelty ? 1 : 0,
    classify_retry_count: s.classifyRetryCount ?? 0,
    last_classify_skip_reason: s.lastClassifySkipReason ?? null,
    eligibility_reason: s.eligibilityReason ?? null,
    input_quality_tier: s.inputQualityTier ?? null,
    last_processed_at: s.lastProcessedAt,
    last_classified_at: s.lastClassifiedAt ?? null,
    llm_review: s.llmReview ? toJson(s.llmReview) : null,
  };
}

function rowToTaxonomy(row: TaxonomyRow): AiTaxonomyState {
  return {
    id: row.id as 'default',
    taxonomyVersion: row.taxonomy_version,
    classifyMode: row.classify_mode as AiTaxonomyState['classifyMode'],
    embeddingModel: row.embedding_model,
    discoverBatchThreshold: row.discover_batch_threshold,
    bulkImportThreshold: row.bulk_import_threshold,
    bulkModeActive: row.bulk_mode_active === 1,
    bulkDiscoverRuns: row.bulk_discover_runs,
    maxBulkDiscoverRuns: row.max_bulk_discover_runs,
    maxNewLeavesPerDiscover: row.max_new_leaves_per_discover,
    maxNewParentsPerDiscover: row.max_new_parents_per_discover,
    unassignedThresholdPercent: row.unassigned_threshold_percent,
    lastDiscoverAt: row.last_discover_at ?? undefined,
    lastClassifyAt: row.last_classify_at ?? undefined,
    lastClassifyRun: parseJson(row.last_classify_run, undefined),
    lastDiscoverRun: parseJson(row.last_discover_run, undefined),
    updated_at: row.updated_at,
  };
}

function taxonomyToRow(t: AiTaxonomyState): TaxonomyRow {
  return {
    id: t.id,
    taxonomy_version: t.taxonomyVersion,
    classify_mode: t.classifyMode,
    embedding_model: t.embeddingModel,
    discover_batch_threshold: t.discoverBatchThreshold,
    bulk_import_threshold: t.bulkImportThreshold,
    bulk_mode_active: t.bulkModeActive ? 1 : 0,
    bulk_discover_runs: t.bulkDiscoverRuns,
    max_bulk_discover_runs: t.maxBulkDiscoverRuns,
    max_new_leaves_per_discover: t.maxNewLeavesPerDiscover,
    max_new_parents_per_discover: t.maxNewParentsPerDiscover,
    unassigned_threshold_percent: t.unassignedThresholdPercent,
    last_discover_at: t.lastDiscoverAt ?? null,
    last_classify_at: t.lastClassifyAt ?? null,
    last_classify_run: t.lastClassifyRun ? toJson(t.lastClassifyRun) : null,
    last_discover_run: t.lastDiscoverRun ? toJson(t.lastDiscoverRun) : null,
    updated_at: t.updated_at,
  };
}

function rowToTrash(row: TrashRow): TrashHistoryEntry {
  return {
    normalizedUrl: row.normalized_url,
    url: row.url,
    title: row.title ?? undefined,
    reason: row.reason,
    reasonCode: row.reason_code as TrashHistoryEntry['reasonCode'],
    itemId: row.item_id ?? undefined,
    trashedAt: row.trashed_at,
    purgedAt: row.purged_at ?? undefined,
  };
}

function trashToRow(t: TrashHistoryEntry): TrashRow {
  return {
    normalized_url: t.normalizedUrl,
    url: t.url,
    title: t.title ?? null,
    reason: t.reason,
    reason_code: t.reasonCode,
    item_id: t.itemId ?? null,
    trashed_at: t.trashedAt,
    purged_at: t.purgedAt ?? null,
  };
}

// ============================================================================
// Store API
// ============================================================================

export class SqliteStore {
  private conn: SqliteConnection;

  constructor(conn: SqliteConnection) {
    this.conn = conn;
  }

  // --- Projects ---
  getAllProjects(): Project[] {
    const rows = this.conn.selectAll<ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC');
    return rows.map(rowToProject);
  }

  getProject(id: string): Project | undefined {
    const row = this.conn.selectOne<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
    return row ? rowToProject(row) : undefined;
  }

  putProject(project: Project): void {
    const r = projectToRow(project);
    this.conn.exec(
      `INSERT OR REPLACE INTO projects (id, name, description, is_default, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [r.id, r.name, r.description, r.is_default, r.created_at, r.updated_at]
    );
  }

  deleteProject(id: string): void {
    this.conn.exec('DELETE FROM projects WHERE id = ?', [id]);
  }

  // --- Collections ---
  getAllCollections(): Collection[] {
    const rows = this.conn.selectAll<CollectionRow>('SELECT * FROM collections');
    return rows.map(rowToCollection);
  }

  getCollection(id: string): Collection | undefined {
    const row = this.conn.selectOne<CollectionRow>('SELECT * FROM collections WHERE id = ?', [id]);
    return row ? rowToCollection(row) : undefined;
  }

  putCollection(collection: Collection): void {
    const r = collectionToRow(collection);
    this.conn.exec(
      `INSERT OR REPLACE INTO collections 
       (id, name, color, is_default, created_at, updated_at, primary_project_id, project_ids) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.name, r.color, r.is_default, r.created_at, r.updated_at, r.primary_project_id, r.project_ids]
    );
  }

  deleteCollection(id: string): void {
    this.conn.exec('DELETE FROM collections WHERE id = ?', [id]);
  }

  // --- Items ---
  getAllItems(): Item[] {
    const rows = this.conn.selectAll<ItemRow>('SELECT * FROM items');
    return rows.map(rowToItem);
  }

  getItemsPage(offset: number, limit: number): Item[] {
    const rows = this.conn.selectAll<ItemRow>(
      'SELECT * FROM items ORDER BY id LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return rows.map(rowToItem);
  }

  getItem(id: string): Item | undefined {
    const row = this.conn.selectOne<ItemRow>('SELECT * FROM items WHERE id = ?', [id]);
    return row ? rowToItem(row) : undefined;
  }

  getItemsByCollection(collectionId: string): Item[] {
    // Filter items that contain this collection ID in their collectionIds array
    const allItems = this.getAllItems();
    return allItems.filter(item => item.collectionIds.includes(collectionId));
  }

  putItem(item: Item): void {
    const r = itemToRow(item);
    this.conn.exec(
      `INSERT OR REPLACE INTO items 
       (id, url, url_raw, title, favicon, collection_ids, tags, notes, placements, 
        created_at, updated_at, source, metadata, pinned_at, favorite_at, deleted_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.url, r.url_raw, r.title, r.favicon, r.collection_ids, r.tags, r.notes, r.placements,
       r.created_at, r.updated_at, r.source, r.metadata, r.pinned_at, r.favorite_at, r.deleted_at]
    );
  }

  deleteItem(id: string): void {
    this.conn.exec('DELETE FROM items WHERE id = ?', [id]);
  }

  /** Scope filter for hub list — null means all bookmarks. */
  private hubScopeCollectionIds(
    collections: Collection[],
    scopeProjectId: string | 'all',
    scopeCollectionId: string | 'all'
  ): string[] | null {
    if (scopeProjectId === 'all' && scopeCollectionId === 'all') return null;
    if (scopeCollectionId !== 'all') return [scopeCollectionId];
    return collections
      .filter(
        (c) =>
          c.primaryProjectId === scopeProjectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(scopeProjectId))
      )
      .map((c) => c.id);
  }

  private hubBookmarkWhereClause(scopeCollectionIds: string[] | null): {
    sql: string;
    params: unknown[];
  } {
    let sql =
      'deleted_at IS NULL AND url IS NOT NULL AND length(trim(url)) > 0';
    const params: unknown[] = [];
    if (scopeCollectionIds !== null) {
      if (scopeCollectionIds.length === 0) {
        return { sql: '0', params: [] };
      }
      const parts = scopeCollectionIds.map(
        () => 'EXISTS (SELECT 1 FROM json_each(collection_ids) je WHERE je.value = ?)'
      );
      sql += ` AND (${parts.join(' OR ')})`;
      params.push(...scopeCollectionIds);
    }
    return { sql, params };
  }

  countHubBookmarks(
    collections: Collection[],
    scopeProjectId: string | 'all',
    scopeCollectionId: string | 'all'
  ): number {
    const scopeIds = this.hubScopeCollectionIds(collections, scopeProjectId, scopeCollectionId);
    const { sql, params } = this.hubBookmarkWhereClause(scopeIds);
    if (sql === '0') return 0;
    const row = this.conn.selectOne<{ n: number }>(
      `SELECT COUNT(*) as n FROM items WHERE ${sql}`,
      params
    );
    return row?.n ?? 0;
  }

  getHubBookmarksPage(
    collections: Collection[],
    scopeProjectId: string | 'all',
    scopeCollectionId: string | 'all',
    offset: number,
    limit: number
  ): { items: Item[]; total: number } {
    const scopeIds = this.hubScopeCollectionIds(collections, scopeProjectId, scopeCollectionId);
    const { sql, params } = this.hubBookmarkWhereClause(scopeIds);
    if (sql === '0') return { items: [], total: 0 };
    const total = this.countHubBookmarks(collections, scopeProjectId, scopeCollectionId);
    const off = Math.max(0, offset);
    const lim = Math.min(500, Math.max(1, limit));
    const rows = this.conn.selectAll<ItemRow>(
      `SELECT * FROM items WHERE ${sql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, lim, off]
    );
    return { items: rows.map(rowToItem), total };
  }

  getEnrichmentForItemIds(itemIds: string[]): ItemEnrichment[] {
    if (!itemIds.length) return [];
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = this.conn.selectAll<EnrichmentRow>(
      `SELECT * FROM item_enrichment WHERE item_id IN (${placeholders})`,
      itemIds
    );
    return rows.map(rowToEnrichment);
  }

  getSignalsForItemIds(itemIds: string[]): AiItemSignal[] {
    if (!itemIds.length) return [];
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = this.conn.selectAll<SignalRow>(
      `SELECT * FROM ai_item_signals WHERE item_id IN (${placeholders})`,
      itemIds
    );
    return rows.map(rowToSignal);
  }

  getLinksForItemIds(itemIds: string[]): AiItemCategoryLink[] {
    if (!itemIds.length) return [];
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = this.conn.selectAll<LinkRow>(
      `SELECT * FROM ai_item_category_links WHERE item_id IN (${placeholders}) AND status IN ('suggested', 'accepted')`,
      itemIds
    );
    return rows.map(rowToLink);
  }

  // --- Notes ---
  getAllNotes(): Note[] {
    const rows = this.conn.selectAll<NoteRow>('SELECT * FROM notes');
    return rows.map(rowToNote);
  }

  getNotesPage(offset: number, limit: number): Note[] {
    const rows = this.conn.selectAll<NoteRow>(
      'SELECT * FROM notes ORDER BY id LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return rows.map(rowToNote);
  }

  getNote(id: string): Note | undefined {
    const row = this.conn.selectOne<NoteRow>('SELECT * FROM notes WHERE id = ?', [id]);
    return row ? rowToNote(row) : undefined;
  }

  putNote(note: Note): void {
    const r = noteToRow(note);
    this.conn.exec(
      `INSERT OR REPLACE INTO notes 
       (id, title, content, collection_id, linked_item_ids, page_context, created_at, updated_at, external_ids) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.title, r.content, r.collection_id, r.linked_item_ids, r.page_context, r.created_at, r.updated_at, r.external_ids]
    );
  }

  deleteNote(id: string): void {
    this.conn.exec('DELETE FROM notes WHERE id = ?', [id]);
  }

  // --- Snapshots ---
  getAllSnapshots(): Snapshot[] {
    const rows = this.conn.selectAll<SnapshotRow>('SELECT * FROM snapshots');
    return rows.map(rowToSnapshot);
  }

  putSnapshot(snapshot: Omit<Snapshot, 'id'>): number {
    this.conn.exec(
      `INSERT INTO snapshots (timestamp, tab_count, tabs) VALUES (?, ?, ?)`,
      [snapshot.timestamp, snapshot.tabCount, toJson(snapshot.tabs)]
    );
    const row = this.conn.selectOne<{ id: number }>('SELECT last_insert_rowid() as id');
    return row?.id ?? 0;
  }

  // --- Workspaces ---
  getAllWorkspaces(): Workspace[] {
    const rows = this.conn.selectAll<WorkspaceRow>('SELECT * FROM workspaces ORDER BY updated_at DESC');
    return rows.map(rowToWorkspace);
  }

  getWorkspace(id: string): Workspace | undefined {
    const row = this.conn.selectOne<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [id]);
    return row ? rowToWorkspace(row) : undefined;
  }

  putWorkspace(workspace: Workspace): void {
    const r = workspaceToRow(workspace);
    this.conn.exec(
      `INSERT OR REPLACE INTO workspaces 
       (id, name, project_id, created_at, updated_at, windows) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [r.id, r.name, r.project_id, r.created_at, r.updated_at, r.windows]
    );
  }

  deleteWorkspace(id: string): void {
    this.conn.exec('DELETE FROM workspaces WHERE id = ?', [id]);
  }

  // --- Enrichment ---
  getAllEnrichment(): ItemEnrichment[] {
    const rows = this.conn.selectAll<EnrichmentRow>('SELECT * FROM item_enrichment');
    return rows.map(rowToEnrichment);
  }

  getEnrichmentPage(offset: number, limit: number): ItemEnrichment[] {
    const rows = this.conn.selectAll<EnrichmentRow>(
      'SELECT * FROM item_enrichment ORDER BY item_id LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return rows.map(rowToEnrichment);
  }

  getEnrichment(itemId: string): ItemEnrichment | undefined {
    const row = this.conn.selectOne<EnrichmentRow>('SELECT * FROM item_enrichment WHERE item_id = ?', [itemId]);
    return row ? rowToEnrichment(row) : undefined;
  }

  putEnrichment(enrichment: ItemEnrichment): void {
    const r = enrichmentToRow(enrichment);
    this.conn.exec(
      `INSERT OR REPLACE INTO item_enrichment 
       (item_id, normalized_url, status, provider_id, fetched_at, attempts, last_error_code, 
        last_error_detail, next_retry_at, content_hash, text_hash, snippet, summary, fetched_title,
        source_kind, quoted_text, quoted_author, channel, description, raw_ref, raw_bytes,
        has_raw_body, skip_reason, tier2_applied, fetch_source_id, ai_tags, ai_key_points,
        references_json, ai_status, ai_error, ai_at, pending_fetch_review, pending_fetch_review_reason,
        review_raw_ref, failure_stage, failure_category, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.item_id, r.normalized_url, r.status, r.provider_id, r.fetched_at, r.attempts, r.last_error_code,
       r.last_error_detail, r.next_retry_at, r.content_hash, r.text_hash, r.snippet, r.summary, r.fetched_title,
       r.source_kind, r.quoted_text, r.quoted_author, r.channel, r.description, r.raw_ref, r.raw_bytes,
       r.has_raw_body, r.skip_reason, r.tier2_applied, r.fetch_source_id, r.ai_tags, r.ai_key_points,
       r.references_json, r.ai_status, r.ai_error, r.ai_at, r.pending_fetch_review, r.pending_fetch_review_reason,
       r.review_raw_ref, r.failure_stage, r.failure_category, r.updated_at]
    );
  }

  deleteEnrichment(itemId: string): void {
    this.conn.exec('DELETE FROM item_enrichment WHERE item_id = ?', [itemId]);
  }

  getAllPipelineDebug(): Array<{ itemId: string; capturedAt: number; payload: unknown }> {
    const rows = this.conn.selectAll<PipelineDebugRow>('SELECT * FROM pipeline_debug ORDER BY captured_at');
    return rows.map((row) => ({
      itemId: row.item_id,
      capturedAt: row.captured_at,
      payload: parseJson(row.payload, {}),
    }));
  }

  putPipelineDebug(record: { itemId: string; capturedAt: number; payload: unknown }): void {
    this.conn.exec(
      `INSERT OR REPLACE INTO pipeline_debug (item_id, captured_at, payload) VALUES (?, ?, ?)`,
      [record.itemId, record.capturedAt, toJson(record.payload)]
    );
  }

  clearAllPipelineDebug(): number {
    const before = this.conn.selectOne<{ n: number }>(
      'SELECT COUNT(*) as n FROM pipeline_debug',
      []
    )?.n ?? 0;
    this.conn.exec('DELETE FROM pipeline_debug');
    return before;
  }

  // --- AI Categories ---
  getAllCategories(): AiCategory[] {
    const rows = this.conn.selectAll<CategoryRow>('SELECT * FROM ai_categories');
    return rows.map(rowToCategory);
  }

  getCategory(id: string): AiCategory | undefined {
    const row = this.conn.selectOne<CategoryRow>('SELECT * FROM ai_categories WHERE id = ?', [id]);
    return row ? rowToCategory(row) : undefined;
  }

  putCategory(category: AiCategory): void {
    const r = categoryToRow(category);
    this.conn.exec(
      `INSERT OR REPLACE INTO ai_categories 
       (id, name, kind, status, assignable, parent_id, parent_name, description, source,
        centroid, canonical_tags, is_general_fallback, item_count, primary_item_count,
        secondary_item_count, child_leaf_count, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.name, r.kind, r.status, r.assignable, r.parent_id, r.parent_name, r.description, r.source,
       r.centroid, r.canonical_tags, r.is_general_fallback, r.item_count, r.primary_item_count,
       r.secondary_item_count, r.child_leaf_count, r.created_at, r.updated_at]
    );
  }

  deleteCategory(id: string): void {
    this.conn.exec('DELETE FROM ai_categories WHERE id = ?', [id]);
  }

  // --- AI Links ---
  getAllLinks(): AiItemCategoryLink[] {
    const rows = this.conn.selectAll<LinkRow>('SELECT * FROM ai_item_category_links');
    return rows.map(rowToLink);
  }

  getLinksPage(offset: number, limit: number): AiItemCategoryLink[] {
    const rows = this.conn.selectAll<LinkRow>(
      'SELECT * FROM ai_item_category_links ORDER BY id LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return rows.map(rowToLink);
  }

  getLinksByItem(itemId: string): AiItemCategoryLink[] {
    const rows = this.conn.selectAll<LinkRow>('SELECT * FROM ai_item_category_links WHERE item_id = ?', [itemId]);
    return rows.map(rowToLink);
  }

  getLinksByCategory(categoryId: string): AiItemCategoryLink[] {
    const rows = this.conn.selectAll<LinkRow>('SELECT * FROM ai_item_category_links WHERE category_id = ?', [categoryId]);
    return rows.map(rowToLink);
  }

  putLink(link: AiItemCategoryLink): void {
    const r = linkToRow(link);
    this.conn.exec(
      `INSERT OR REPLACE INTO ai_item_category_links 
       (id, item_id, category_id, score, is_primary, source, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.item_id, r.category_id, r.score, r.is_primary, r.source, r.status, r.created_at, r.updated_at]
    );
  }

  deleteLink(id: string): void {
    this.conn.exec('DELETE FROM ai_item_category_links WHERE id = ?', [id]);
  }

  deleteLinksByItem(itemId: string): void {
    this.conn.exec('DELETE FROM ai_item_category_links WHERE item_id = ?', [itemId]);
  }

  // --- AI Signals ---
  getAllSignals(): AiItemSignal[] {
    const rows = this.conn.selectAll<SignalRow>('SELECT * FROM ai_item_signals');
    return rows.map(rowToSignal);
  }

  getSignalsPage(offset: number, limit: number): AiItemSignal[] {
    const rows = this.conn.selectAll<SignalRow>(
      'SELECT * FROM ai_item_signals ORDER BY item_id LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return rows.map(rowToSignal);
  }

  getSignal(itemId: string): AiItemSignal | undefined {
    const row = this.conn.selectOne<SignalRow>('SELECT * FROM ai_item_signals WHERE item_id = ?', [itemId]);
    return row ? rowToSignal(row) : undefined;
  }

  getSignalsByClassifyState(state: string): AiItemSignal[] {
    const rows = this.conn.selectAll<SignalRow>('SELECT * FROM ai_item_signals WHERE classify_state = ?', [state]);
    return rows.map(rowToSignal);
  }

  putSignal(signal: AiItemSignal): void {
    const r = signalToRow(signal);
    this.conn.exec(
      `INSERT OR REPLACE INTO ai_item_signals 
       (item_id, text_hash, classify_text_hash, embedding_model, embedding, derived_tags,
        tag_confidence, signal_status, classify_state, discover_state, is_novelty,
        classify_retry_count, last_classify_skip_reason, eligibility_reason, input_quality_tier,
        last_processed_at, last_classified_at, llm_review) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.item_id, r.text_hash, r.classify_text_hash, r.embedding_model, r.embedding, r.derived_tags,
       r.tag_confidence, r.signal_status, r.classify_state, r.discover_state, r.is_novelty,
       r.classify_retry_count, r.last_classify_skip_reason, r.eligibility_reason, r.input_quality_tier,
       r.last_processed_at, r.last_classified_at, r.llm_review]
    );
  }

  deleteSignal(itemId: string): void {
    this.conn.exec('DELETE FROM ai_item_signals WHERE item_id = ?', [itemId]);
  }

  // --- AI Taxonomy State ---
  getTaxonomyState(): AiTaxonomyState | undefined {
    const row = this.conn.selectOne<TaxonomyRow>(`SELECT * FROM ai_taxonomy_state WHERE id = 'default'`);
    return row ? rowToTaxonomy(row) : undefined;
  }

  putTaxonomyState(state: AiTaxonomyState): void {
    const r = taxonomyToRow(state);
    this.conn.exec(
      `INSERT OR REPLACE INTO ai_taxonomy_state 
       (id, taxonomy_version, classify_mode, embedding_model, discover_batch_threshold,
        bulk_import_threshold, bulk_mode_active, bulk_discover_runs, max_bulk_discover_runs,
        max_new_leaves_per_discover, max_new_parents_per_discover, unassigned_threshold_percent,
        last_discover_at, last_classify_at, last_classify_run, last_discover_run, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.taxonomy_version, r.classify_mode, r.embedding_model, r.discover_batch_threshold,
       r.bulk_import_threshold, r.bulk_mode_active, r.bulk_discover_runs, r.max_bulk_discover_runs,
       r.max_new_leaves_per_discover, r.max_new_parents_per_discover, r.unassigned_threshold_percent,
       r.last_discover_at, r.last_classify_at, r.last_classify_run, r.last_discover_run, r.updated_at]
    );
  }

  // --- Trash History ---
  getAllTrashHistory(): TrashHistoryEntry[] {
    const rows = this.conn.selectAll<TrashRow>('SELECT * FROM trash_history ORDER BY trashed_at DESC');
    return rows.map(rowToTrash);
  }

  getTrashEntry(normalizedUrl: string): TrashHistoryEntry | undefined {
    const row = this.conn.selectOne<TrashRow>('SELECT * FROM trash_history WHERE normalized_url = ?', [normalizedUrl]);
    return row ? rowToTrash(row) : undefined;
  }

  putTrashEntry(entry: TrashHistoryEntry): void {
    const r = trashToRow(entry);
    this.conn.exec(
      `INSERT OR REPLACE INTO trash_history 
       (normalized_url, url, title, reason, reason_code, item_id, trashed_at, purged_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.normalized_url, r.url, r.title, r.reason, r.reason_code, r.item_id, r.trashed_at, r.purged_at]
    );
  }

  deleteTrashEntry(normalizedUrl: string): void {
    this.conn.exec('DELETE FROM trash_history WHERE normalized_url = ?', [normalizedUrl]);
  }

  // --- Bulk operations for import ---
  /** Caller should wrap in `withTransaction` when atomicity is required. */
  clearAllTables(): void {
    this.conn.exec('DELETE FROM trash_history');
    this.conn.exec('DELETE FROM ai_taxonomy_state');
    this.conn.exec('DELETE FROM ai_item_signals');
    this.conn.exec('DELETE FROM ai_item_category_links');
    this.conn.exec('DELETE FROM ai_categories');
    this.conn.exec('DELETE FROM item_enrichment');
    this.conn.exec('DELETE FROM pipeline_debug');
    this.conn.exec('DELETE FROM workspaces');
    this.conn.exec('DELETE FROM snapshots');
    this.conn.exec('DELETE FROM notes');
    this.conn.exec('DELETE FROM items');
    this.conn.exec('DELETE FROM collections');
    this.conn.exec('DELETE FROM projects');
  }

  // --- Transaction helper ---
  withTransaction<T>(fn: () => T): T {
    return this.conn.withTransaction(() => fn());
  }
}

// ============================================================================
// IDB Compatibility Layer
// ============================================================================

/**
 * Provides IDB-style API for backward compatibility with existing code.
 * This allows gradual migration without changing all callers at once.
 */
export class IdbCompatStore {
  private store: SqliteStore;
  
  // Fake objectStoreNames for compatibility checks
  objectStoreNames = {
    contains: (_name: string) => true, // All stores exist in SQLite
  };

  constructor(store: SqliteStore) {
    this.store = store;
  }

  // Generic getAll that routes to the right store method
  getAll(storeName: string): any[] {
    switch (storeName) {
      case 'projects': return this.store.getAllProjects();
      case 'collections': return this.store.getAllCollections();
      case 'items': return this.store.getAllItems();
      case 'notes': return this.store.getAllNotes();
      case 'snapshots': return this.store.getAllSnapshots();
      case 'workspaces': return this.store.getAllWorkspaces();
      case 'item_enrichment': return this.store.getAllEnrichment();
      case 'ai_categories': return this.store.getAllCategories();
      case 'ai_item_category_links': return this.store.getAllLinks();
      case 'ai_item_signals': return this.store.getAllSignals();
      case 'ai_taxonomy_state': {
        const state = this.store.getTaxonomyState();
        return state ? [state] : [];
      }
      case 'trash_history': return this.store.getAllTrashHistory();
      case 'pipeline_debug': return this.store.getAllPipelineDebug();
      default: return [];
    }
  }

  /** Paginated read for hydrate RPC (keeps each postMessage under Chrome's ~64MiB cap). */
  getPage(storeName: string, offset: number, limit: number): unknown[] {
    const off = Math.max(0, offset);
    const lim = Math.min(5000, Math.max(1, limit));
    switch (storeName) {
      case 'items':
        return this.store.getItemsPage(off, lim);
      case 'notes':
        return this.store.getNotesPage(off, lim);
      case 'item_enrichment':
        return this.store.getEnrichmentPage(off, lim);
      case 'ai_item_signals':
        return this.store.getSignalsPage(off, lim);
      case 'ai_item_category_links':
        return this.store.getLinksPage(off, lim);
      default: {
        const all = this.getAll(storeName);
        return all.slice(off, off + lim);
      }
    }
  }

  // Generic get that routes to the right store method
  get(storeName: string, key: string): any {
    switch (storeName) {
      case 'projects': return this.store.getProject(key);
      case 'collections': return this.store.getCollection(key);
      case 'items': return this.store.getItem(key);
      case 'notes': return this.store.getNote(key);
      case 'workspaces': return this.store.getWorkspace(key);
      case 'item_enrichment': return this.store.getEnrichment(key);
      case 'ai_categories': return this.store.getCategory(key);
      case 'ai_item_signals': return this.store.getSignal(key);
      case 'ai_taxonomy_state': return this.store.getTaxonomyState();
      case 'trash_history': return this.store.getTrashEntry(key);
      default: return undefined;
    }
  }

  // Generic put that routes to the right store method
  put(storeName: string, value: any): void {
    switch (storeName) {
      case 'projects': this.store.putProject(value); break;
      case 'collections': this.store.putCollection(value); break;
      case 'items': this.store.putItem(value); break;
      case 'notes': this.store.putNote(value); break;
      case 'workspaces': this.store.putWorkspace(value); break;
      case 'item_enrichment': this.store.putEnrichment(value); break;
      case 'ai_categories': this.store.putCategory(value); break;
      case 'ai_item_category_links': this.store.putLink(value); break;
      case 'ai_item_signals': this.store.putSignal(value); break;
      case 'ai_taxonomy_state': this.store.putTaxonomyState(value); break;
      case 'trash_history': this.store.putTrashEntry(value); break;
      case 'pipeline_debug': this.store.putPipelineDebug(value); break;
    }
  }

  // Generic delete
  delete(storeName: string, key: string): void {
    switch (storeName) {
      case 'projects': this.store.deleteProject(key); break;
      case 'collections': this.store.deleteCollection(key); break;
      case 'items': this.store.deleteItem(key); break;
      case 'notes': this.store.deleteNote(key); break;
      case 'workspaces': this.store.deleteWorkspace(key); break;
      case 'item_enrichment': this.store.deleteEnrichment(key); break;
      case 'ai_categories': this.store.deleteCategory(key); break;
      case 'ai_item_category_links': this.store.deleteLink(key); break;
      case 'ai_item_signals': this.store.deleteSignal(key); break;
      case 'trash_history': this.store.deleteTrashEntry(key); break;
    }
  }

  // Simulate getAllFromIndex
  getAllFromIndex(storeName: string, indexName: string, value: any): any[] {
    switch (storeName) {
      case 'items':
        if (indexName === 'by-collection') {
          return this.store.getAllItems().filter(item => item.collectionIds.includes(value));
        }
        return [];
      case 'ai_item_category_links':
        if (indexName === 'by-item') return this.store.getLinksByItem(value);
        if (indexName === 'by-category') return this.store.getLinksByCategory(value);
        return [];
      case 'ai_item_signals':
        if (indexName === 'by-classify-state') return this.store.getSignalsByClassifyState(value);
        return [];
      default:
        return [];
    }
  }

  // Simulate transaction - returns an object with objectStore method
  transaction(_storeNames: string | string[], _mode?: string) {
    const self = this;
    return {
      objectStore: (name: string) => ({
        getAll: () => Promise.resolve(self.getAll(name)),
        get: (key: string) => Promise.resolve(self.get(name, key)),
        put: (value: any) => { self.put(name, value); return Promise.resolve(); },
        delete: (key: string) => { self.delete(name, key); return Promise.resolve(); },
        getAllFromIndex: (indexName: string, value: any) => 
          Promise.resolve(self.getAllFromIndex(name, indexName, value)),
        index: (indexName: string) => ({
          getAll: (value?: any) => {
            if (value !== undefined) {
              return Promise.resolve(self.getAllFromIndex(name, indexName, value));
            }
            return Promise.resolve(self.getAll(name));
          },
          getAllKeys: () => {
            const items = self.getAll(name);
            return Promise.resolve(items.map((i: any) => i.id || i.itemId || i.normalizedUrl));
          },
        }),
      }),
      done: Promise.resolve(),
    };
  }

  // Direct access to underlying SqliteStore for new code
  get sqlite(): SqliteStore {
    return this.store;
  }

  // Forward all SqliteStore methods for gradual migration
  getAllProjects() { return this.store.getAllProjects(); }
  getProject(id: string) { return this.store.getProject(id); }
  putProject(project: Project) { this.store.putProject(project); }
  deleteProject(id: string) { this.store.deleteProject(id); }
  
  getAllCollections() { return this.store.getAllCollections(); }
  getCollection(id: string) { return this.store.getCollection(id); }
  putCollection(collection: Collection) { this.store.putCollection(collection); }
  deleteCollection(id: string) { this.store.deleteCollection(id); }
  
  getAllItems() { return this.store.getAllItems(); }
  getItem(id: string) { return this.store.getItem(id); }
  putItem(item: Item) { this.store.putItem(item); }
  deleteItem(id: string) { this.store.deleteItem(id); }

  countHubBookmarks(
    collections: Collection[],
    scopeProjectId: string | 'all',
    scopeCollectionId: string | 'all'
  ) {
    return this.store.countHubBookmarks(collections, scopeProjectId, scopeCollectionId);
  }

  getHubBookmarksPage(
    collections: Collection[],
    scopeProjectId: string | 'all',
    scopeCollectionId: string | 'all',
    offset: number,
    limit: number
  ) {
    return this.store.getHubBookmarksPage(
      collections,
      scopeProjectId,
      scopeCollectionId,
      offset,
      limit
    );
  }

  getEnrichmentForItemIds(itemIds: string[]) {
    return this.store.getEnrichmentForItemIds(itemIds);
  }

  getSignalsForItemIds(itemIds: string[]) {
    return this.store.getSignalsForItemIds(itemIds);
  }

  getLinksForItemIds(itemIds: string[]) {
    return this.store.getLinksForItemIds(itemIds);
  }
  
  getAllNotes() { return this.store.getAllNotes(); }
  getNote(id: string) { return this.store.getNote(id); }
  putNote(note: Note) { this.store.putNote(note); }
  deleteNote(id: string) { this.store.deleteNote(id); }
  
  getAllSnapshots() { return this.store.getAllSnapshots(); }
  putSnapshot(snapshot: Omit<Snapshot, 'id'>) { return this.store.putSnapshot(snapshot); }
  
  getAllWorkspaces() { return this.store.getAllWorkspaces(); }
  getWorkspace(id: string) { return this.store.getWorkspace(id); }
  putWorkspace(workspace: Workspace) { this.store.putWorkspace(workspace); }
  deleteWorkspace(id: string) { this.store.deleteWorkspace(id); }
  
  getAllEnrichment() { return this.store.getAllEnrichment(); }
  getEnrichment(itemId: string) { return this.store.getEnrichment(itemId); }
  putEnrichment(enrichment: ItemEnrichment) { this.store.putEnrichment(enrichment); }
  deleteEnrichment(itemId: string) { this.store.deleteEnrichment(itemId); }

  getAllPipelineDebug() { return this.store.getAllPipelineDebug(); }
  putPipelineDebug(record: { itemId: string; capturedAt: number; payload: unknown }) {
    this.store.putPipelineDebug(record);
  }
  clearAllPipelineDebug() { return this.store.clearAllPipelineDebug(); }
  
  getAllCategories() { return this.store.getAllCategories(); }
  getCategory(id: string) { return this.store.getCategory(id); }
  putCategory(category: AiCategory) { this.store.putCategory(category); }
  deleteCategory(id: string) { this.store.deleteCategory(id); }
  
  getAllLinks() { return this.store.getAllLinks(); }
  getLinksByItem(itemId: string) { return this.store.getLinksByItem(itemId); }
  getLinksByCategory(categoryId: string) { return this.store.getLinksByCategory(categoryId); }
  putLink(link: AiItemCategoryLink) { this.store.putLink(link); }
  deleteLink(id: string) { this.store.deleteLink(id); }
  deleteLinksByItem(itemId: string) { this.store.deleteLinksByItem(itemId); }
  
  getAllSignals() { return this.store.getAllSignals(); }
  getSignal(itemId: string) { return this.store.getSignal(itemId); }
  getSignalsByClassifyState(state: string) { return this.store.getSignalsByClassifyState(state); }
  putSignal(signal: AiItemSignal) { this.store.putSignal(signal); }
  deleteSignal(itemId: string) { this.store.deleteSignal(itemId); }
  
  getTaxonomyState() { return this.store.getTaxonomyState(); }
  putTaxonomyState(state: AiTaxonomyState) { this.store.putTaxonomyState(state); }
  
  getAllTrashHistory() { return this.store.getAllTrashHistory(); }
  getTrashEntry(normalizedUrl: string) { return this.store.getTrashEntry(normalizedUrl); }
  putTrashEntry(entry: TrashHistoryEntry) { this.store.putTrashEntry(entry); }
  deleteTrashEntry(normalizedUrl: string) { this.store.deleteTrashEntry(normalizedUrl); }
  
  clearAllTables() { this.store.clearAllTables(); }
  withTransaction<T>(fn: () => T): T { return this.store.withTransaction(fn); }
}

// ============================================================================
// Singleton access
// ============================================================================

let storeInstance: SqliteStore | null = null;
let compatInstance: IdbCompatStore | null = null;

export async function getSqliteStore(): Promise<SqliteStore> {
  if (storeInstance) return storeInstance;
  const conn = await getConnection();
  storeInstance = new SqliteStore(conn);
  return storeInstance;
}

export function getSqliteStoreSync(): SqliteStore | null {
  if (storeInstance) return storeInstance;
  const conn = getConnectionSync();
  if (!conn) return null;
  storeInstance = new SqliteStore(conn);
  return storeInstance;
}

export async function getIdbCompatStore(): Promise<IdbCompatStore> {
  if (compatInstance) return compatInstance;
  const store = await getSqliteStore();
  compatInstance = new IdbCompatStore(store);
  return compatInstance;
}

export function getIdbCompatStoreSync(): IdbCompatStore | null {
  if (compatInstance) return compatInstance;
  const store = getSqliteStoreSync();
  if (!store) return null;
  compatInstance = new IdbCompatStore(store);
  return compatInstance;
}

/** Drop cached singletons so the next open reads fresh persisted bytes. */
export function resetStoreSingletons(): void {
  storeInstance = null;
  compatInstance = null;
}
