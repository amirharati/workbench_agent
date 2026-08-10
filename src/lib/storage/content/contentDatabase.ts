/** Worker-local storage engine for fetched and review bodies. */
import { normalizeBinaryPayload } from '../../binaryPayload';
import {
  exportNamedDatabaseBytes,
  importNamedOpfsDatabaseBytes,
  openNamedOpfsDatabase,
} from '../sqlite/connectionOpfs';
import { deserializeFromBytes, initSqlite3, type Database } from '../sqlite/connectionShared';
import type { SqliteStorageMode } from '../sqlite/types';

export const CONTENT_DATABASE_NAME = 'workbench-content.sqlite';
const CONTENT_SCHEMA_VERSION = 1;

export type ContentDocumentKind = 'raw' | 'review';

export type PutContentDocumentInput = {
  itemId: string;
  kind: ContentDocumentKind;
  body: string;
  /** Identity shared with the core enrichment row. Defaults to the body hash. */
  contentHash?: string;
  fetchedAt?: number;
};

export type ContentDocument = {
  itemId: string;
  kind: ContentDocumentKind;
  body: string;
  contentHash: string;
  bodyHash: string;
  rawBytes: number;
  storedBytes: number;
  fetchedAt?: number;
  createdAt: number;
};

export type ContentDatabaseStats = {
  storageMode: SqliteStorageMode;
  rowCount: number;
  rawCount: number;
  reviewCount: number;
  rawBytes: number;
  storedBytes: number;
  revision: number;
  dirtyWrites: number;
  lastExportedAt?: number;
};

type StoredContentRow = {
  item_id: string;
  kind: ContentDocumentKind;
  content_hash: string;
  body_hash: string;
  codec: 'gzip' | 'identity';
  body: Uint8Array | ArrayBuffer;
  raw_bytes: number;
  stored_bytes: number;
  fetched_at: number | null;
  created_at: number;
};

type ContentMetaRow = {
  revision: number;
  dirty_writes: number;
  last_exported_at: number | null;
};

const config = {
  dbName: CONTENT_DATABASE_NAME,
  schemaVersion: CONTENT_SCHEMA_VERSION,
  opfsVfsName: 'workbench-content-opfs',
  opfsDirectory: '.workbench-content-opfs',
};
let database: Database | null = null;
let storageMode: SqliteStorageMode = 'opfs';
let openPromise: Promise<Database> | null = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function normalizeBlob(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
    return [...new Uint8Array(digest)]
      .map((part) => part.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 5381;
  for (const byte of bytes) hash = ((hash * 33) ^ byte) >>> 0;
  return `djb2-${hash.toString(16)}`;
}

async function transformBytes(
  bytes: Uint8Array,
  mode: 'compress' | 'decompress'
): Promise<Uint8Array> {
  const StreamCtor = mode === 'compress' ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (typeof StreamCtor !== 'function') throw new Error(`${mode} stream unavailable`);
  const stream = new StreamCtor('gzip');
  const writer = stream.writable.getWriter();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await writer.write(copy);
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

async function encodeBody(body: string): Promise<{
  codec: 'gzip' | 'identity';
  bytes: Uint8Array;
  rawBytes: number;
  bodyHash: string;
}> {
  const raw = encoder.encode(body);
  const bodyHash = await digestBytes(raw);
  try {
    const compressed = await transformBytes(raw, 'compress');
    if (compressed.byteLength < raw.byteLength) {
      return { codec: 'gzip', bytes: compressed, rawBytes: raw.byteLength, bodyHash };
    }
  } catch {
    // CompressionStream is optional in test/fallback contexts.
  }
  return { codec: 'identity', bytes: raw, rawBytes: raw.byteLength, bodyHash };
}

async function decodeBody(row: StoredContentRow): Promise<string> {
  const stored = normalizeBlob(row.body);
  const raw = row.codec === 'gzip' ? await transformBytes(stored, 'decompress') : stored;
  if ((await digestBytes(raw)) !== row.body_hash) {
    throw new Error(`Content integrity check failed for ${row.item_id}/${row.kind}`);
  }
  return decoder.decode(raw);
}

function initContentSchema(db: Database): void {
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS content_documents (
      item_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('raw', 'review')),
      content_hash TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      codec TEXT NOT NULL CHECK(codec IN ('gzip', 'identity')),
      body BLOB NOT NULL,
      raw_bytes INTEGER NOT NULL,
      stored_bytes INTEGER NOT NULL,
      fetched_at INTEGER,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(item_id, kind, content_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_content_documents_item_kind
      ON content_documents(item_id, kind);
    CREATE TABLE IF NOT EXISTS content_meta (
      id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      dirty_writes INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_exported_at INTEGER
    );
    PRAGMA user_version=${CONTENT_SCHEMA_VERSION};
  `);
  const now = Date.now();
  db.exec({
    sql: `INSERT OR IGNORE INTO content_meta
      (id, revision, dirty_writes, updated_at, last_exported_at)
      VALUES ('default', 0, 0, ?, NULL);`,
    bind: [now],
  });
}

async function getDatabase(): Promise<Database> {
  if (database) return database;
  if (openPromise) return openPromise;
  openPromise = (async () => {
    const opened = await openNamedOpfsDatabase(config);
    database = opened.database;
    storageMode = opened.mode;
    initContentSchema(database);
    return database;
  })();
  try {
    return await openPromise;
  } finally {
    openPromise = null;
  }
}

function queryMeta(db: Database): ContentMetaRow {
  const rows = db.exec({
    sql: `SELECT revision, dirty_writes, last_exported_at
          FROM content_meta WHERE id = 'default';`,
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as ContentMetaRow[];
  return rows[0] ?? { revision: 0, dirty_writes: 0, last_exported_at: null };
}

function recordMutation(db: Database, now = Date.now()): number {
  db.exec({
    sql: `UPDATE content_meta
          SET revision = revision + 1, dirty_writes = dirty_writes + 1, updated_at = ?
          WHERE id = 'default';`,
    bind: [now],
  });
  return Number(queryMeta(db).revision);
}

export function contentRefForItem(
  itemId: string,
  kind: ContentDocumentKind,
  contentHash: string
): string {
  return `content:v1:${kind}:${encodeURIComponent(itemId)}:${encodeURIComponent(contentHash)}`;
}

export function parseContentRef(
  rawRef: string
): { itemId: string; kind: ContentDocumentKind; contentHash: string } | null {
  const match = /^content:v1:(raw|review):([^:]+):([^:]+)$/.exec(rawRef);
  if (!match) return null;
  try {
    return {
      kind: match[1] as ContentDocumentKind,
      itemId: decodeURIComponent(match[2]),
      contentHash: decodeURIComponent(match[3]),
    };
  } catch {
    return null;
  }
}

export async function putContentDocument(
  input: PutContentDocumentInput
): Promise<{ rawRef: string; rawBytes: number; storedBytes: number; revision: number }> {
  const itemId = input.itemId.trim();
  if (!itemId) throw new Error('Content itemId is required');
  if (input.kind !== 'raw' && input.kind !== 'review') throw new Error('Invalid content kind');
  const encoded = await encodeBody(input.body);
  const contentHash = input.contentHash?.trim() || encoded.bodyHash;
  const db = await getDatabase();
  const existing = db.exec({
    sql: `SELECT item_id, kind, content_hash, body_hash, codec, body, raw_bytes,
                 stored_bytes, fetched_at, created_at
          FROM content_documents
          WHERE item_id = ? AND kind = ? AND content_hash = ?;`,
    bind: [itemId, input.kind, contentHash],
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as StoredContentRow[];
  if (existing[0]) {
    // The source hash is the identity shared with core. A repeated extraction
    // can produce a slightly different diagnostic wrapper for the same source;
    // preserve and return the first accepted immutable row rather than replacing it.
    return {
      rawRef: contentRefForItem(itemId, input.kind, contentHash),
      rawBytes: existing[0].raw_bytes,
      storedBytes: existing[0].stored_bytes,
      revision: Number(queryMeta(db).revision),
    };
  }

  const now = Date.now();
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec({
      sql: `INSERT INTO content_documents
        (item_id, kind, content_hash, body_hash, codec, body, raw_bytes, stored_bytes, fetched_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      bind: [
        itemId,
        input.kind,
        contentHash,
        encoded.bodyHash,
        encoded.codec,
        encoded.bytes,
        encoded.rawBytes,
        encoded.bytes.byteLength,
        input.fetchedAt ?? null,
        now,
      ],
    });
    const revision = recordMutation(db, now);
    db.exec('COMMIT;');
    return {
      rawRef: contentRefForItem(itemId, input.kind, contentHash),
      rawBytes: encoded.rawBytes,
      storedBytes: encoded.bytes.byteLength,
      revision,
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

export async function getContentDocument(
  itemId: string,
  kind: ContentDocumentKind,
  contentHash: string
): Promise<ContentDocument | null> {
  const db = await getDatabase();
  const rows = db.exec({
    sql: `SELECT item_id, kind, content_hash, body_hash, codec, body, raw_bytes,
                 stored_bytes, fetched_at, created_at
          FROM content_documents
          WHERE item_id = ? AND kind = ? AND content_hash = ?;`,
    bind: [itemId, kind, contentHash],
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as StoredContentRow[];
  const row = rows[0];
  if (!row) return null;
  return {
    itemId: row.item_id,
    kind: row.kind,
    body: await decodeBody(row),
    contentHash: row.content_hash,
    bodyHash: row.body_hash,
    rawBytes: Number(row.raw_bytes),
    storedBytes: Number(row.stored_bytes),
    fetchedAt: row.fetched_at ?? undefined,
    createdAt: Number(row.created_at),
  };
}

export async function getContentDocumentByRef(rawRef: string): Promise<ContentDocument | null> {
  const parsed = parseContentRef(rawRef);
  if (!parsed) return null;
  return getContentDocument(parsed.itemId, parsed.kind, parsed.contentHash);
}

export async function deleteContentDocument(
  itemId: string,
  kind?: ContentDocumentKind
): Promise<{ removed: number; revision: number }> {
  const db = await getDatabase();
  db.exec('BEGIN IMMEDIATE;');
  try {
    if (kind) {
      db.exec({
        sql: 'DELETE FROM content_documents WHERE item_id = ? AND kind = ?;',
        bind: [itemId, kind],
      });
    } else {
      db.exec({ sql: 'DELETE FROM content_documents WHERE item_id = ?;', bind: [itemId] });
    }
    const removed = Math.max(0, db.changes());
    const revision = removed ? recordMutation(db) : Number(queryMeta(db).revision);
    db.exec('COMMIT;');
    return { removed, revision };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

export async function clearContentDatabase(): Promise<{ removed: number; revision: number }> {
  const db = await getDatabase();
  const counts = db.exec({
    sql: 'SELECT COUNT(*) AS count FROM content_documents;',
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as { count: number }[];
  const removed = Number(counts[0]?.count ?? 0);
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec('DELETE FROM content_documents;');
    const revision = recordMutation(db);
    db.exec('COMMIT;');
    return { removed, revision };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

export async function getContentDatabaseStats(): Promise<ContentDatabaseStats> {
  const db = await getDatabase();
  const rows = db.exec({
    sql: `SELECT COUNT(*) AS row_count,
                 SUM(CASE WHEN kind = 'raw' THEN 1 ELSE 0 END) AS raw_count,
                 SUM(CASE WHEN kind = 'review' THEN 1 ELSE 0 END) AS review_count,
                 COALESCE(SUM(raw_bytes), 0) AS raw_bytes,
                 COALESCE(SUM(stored_bytes), 0) AS stored_bytes
          FROM content_documents;`,
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as Array<Record<string, number>>;
  const row = rows[0];
  const meta = queryMeta(db);
  return {
    storageMode,
    rowCount: Number(row?.row_count ?? 0),
    rawCount: Number(row?.raw_count ?? 0),
    reviewCount: Number(row?.review_count ?? 0),
    rawBytes: Number(row?.raw_bytes ?? 0),
    storedBytes: Number(row?.stored_bytes ?? 0),
    revision: Number(meta.revision),
    dirtyWrites: Number(meta.dirty_writes),
    lastExportedAt: meta.last_exported_at ?? undefined,
  };
}

export async function exportContentDatabaseBytes(): Promise<Uint8Array> {
  const db = await getDatabase();
  const integrity = db.exec({
    sql: 'PRAGMA integrity_check;',
    returnValue: 'resultRows',
    rowMode: 'array',
  }) as unknown[][];
  if (String(integrity[0]?.[0] ?? '').toLowerCase() !== 'ok') {
    throw new Error('Content database integrity check failed');
  }
  return exportNamedDatabaseBytes(db);
}

export async function markContentDatabaseExported(revision: number): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  db.exec({
    sql: `UPDATE content_meta
          SET dirty_writes = CASE WHEN revision <= ? THEN 0 ELSE dirty_writes END,
              last_exported_at = ?, updated_at = ?
          WHERE id = 'default';`,
    bind: [revision, now, now],
  });
}

async function validateContentSnapshot(bytes: Uint8Array): Promise<void> {
  const sqlite = await initSqlite3();
  const candidate = deserializeFromBytes(sqlite, bytes);
  try {
    const integrity = candidate.exec({
      sql: 'PRAGMA integrity_check;',
      returnValue: 'resultRows',
      rowMode: 'array',
    }) as unknown[][];
    if (String(integrity[0]?.[0] ?? '').toLowerCase() !== 'ok') {
      throw new Error('Content snapshot failed integrity_check');
    }
    const tables = candidate.exec({
      sql: `SELECT COUNT(*) AS count FROM sqlite_master
            WHERE type = 'table' AND name IN ('content_documents', 'content_meta');`,
      returnValue: 'resultRows',
      rowMode: 'object',
    }) as { count: number }[];
    if (Number(tables[0]?.count ?? 0) !== 2) {
      throw new Error('Content snapshot schema is missing');
    }
  } finally {
    candidate.close();
  }
}

export async function bootstrapContentDatabaseFromBytes(
  input: unknown
): Promise<{ imported: boolean; reason?: string; rowCount: number }> {
  const bytes = normalizeBinaryPayload(input);
  if (!bytes || bytes.byteLength < 16) {
    return { imported: false, reason: 'empty', rowCount: 0 };
  }
  const current = await getContentDatabaseStats();
  if (current.rowCount > 0 || current.dirtyWrites > 0) {
    return { imported: false, reason: 'local-has-state', rowCount: current.rowCount };
  }
  await validateContentSnapshot(bytes);
  if (database) database.close();
  database = null;
  const opened = await importNamedOpfsDatabaseBytes(bytes, config);
  database = opened.database;
  storageMode = opened.mode;
  initContentSchema(database);
  const now = Date.now();
  database.exec({
    sql: `UPDATE content_meta
          SET dirty_writes = 0, last_exported_at = ?, updated_at = ?
          WHERE id = 'default';`,
    bind: [now, now],
  });
  const restored = await getContentDatabaseStats();
  return { imported: true, rowCount: restored.rowCount };
}

/** Test-only reset of this module's in-memory connection. */
export function resetContentDatabaseConnectionForTests(): void {
  if (database) database.close();
  database = null;
  openPromise = null;
  storageMode = 'opfs';
}
