import type { Item } from '../db';
import type { ItemEnrichment, SourceKind } from './types';

export type FieldStore = 'bookmark' | 'enrichment' | 'disk';

export type DataModelRow = {
  id: string;
  group: string;
  label: string;
  store: FieldStore;
  value: string | null;
  empty: boolean;
  /** Value came from / was updated by fetch */
  fromFetch?: boolean;
  /** Bookmark vs fetch — only when both sides exist or fetch ran */
  compare?: { current: string | null; retrieved: string | null };
};

export type FillableFieldState =
  | 'local-only'
  | 'retrieved'
  | 'applied'
  | 'same'
  | 'empty-after-fetch';

export type FillableFieldRow = {
  id: string;
  label: string;
  current: string | null;
  retrieved: string | null;
  state: FillableFieldState;
  statusHint: string;
  applicable: boolean;
};

function clip(text: unknown, max = 600): string | null {
  if (text === undefined || text === null) return null;
  if (typeof text === 'number' || typeof text === 'boolean') return String(text);
  if (Array.isArray(text)) {
    if (text.length === 0) return null;
    const s = text.map((x) => String(x)).join(', ');
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }
  const t = String(text).trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function ts(ms?: number): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleString();
}

function platformFromKind(kind?: SourceKind, item?: Item): string | null {
  if (kind === 'x') return 'x';
  if (kind === 'video') {
    const p = item?.metadata?.platform;
    if (p === 'youtube' || p === 'video') return p;
    return 'youtube';
  }
  return null;
}

function row(
  group: string,
  id: string,
  label: string,
  store: FieldStore,
  value: string | null,
  opts?: { fromFetch?: boolean; compare?: DataModelRow['compare'] }
): DataModelRow {
  return {
    id,
    group,
    label,
    store,
    value,
    empty: !value,
    fromFetch: opts?.fromFetch,
    compare: opts?.compare,
  };
}

function tier2Has(enrich: ItemEnrichment | null | undefined, key: string): boolean {
  return !!enrich?.tier2Applied?.includes(key);
}

/** One row per collection — avoids 4× repeated empty rows per collection id. */
function buildPlacementRows(item: Item): DataModelRow[] {
  const placements = item.placements || {};
  const ids = new Set<string>([...(item.collectionIds || []), ...Object.keys(placements)]);
  const rows: DataModelRow[] = [];

  rows.push(
    row(
      'Collections',
      'placements.help',
      'what this is',
      'bookmark',
      'Same URL can sit in multiple collections. collectionIds = quick list. placements[collectionId] = notes/tags per collection (optional).'
    )
  );

  if (ids.size === 0) {
    rows.push(row('Collections', 'placements.none', 'collections', 'bookmark', null));
    return rows;
  }

  rows.push(
    row(
      'Collections',
      'item.collectionIds',
      'collectionIds (list)',
      'bookmark',
      clip(item.collectionIds?.length ? item.collectionIds.join(', ') : [...ids].join(', '))
    )
  );

  const onlyInIds = (item.collectionIds || []).filter((id) => !placements[id]);
  const onlyInPlacements = Object.keys(placements).filter(
    (id) => !(item.collectionIds || []).includes(id)
  );
  if (onlyInIds.length > 0 || onlyInPlacements.length > 0) {
    const parts: string[] = [];
    if (onlyInIds.length > 0) {
      parts.push(`in collectionIds only (${onlyInIds.length}): ${onlyInIds.map(shortId).join(', ')}`);
    }
    if (onlyInPlacements.length > 0) {
      parts.push(
        `in placements only (${onlyInPlacements.length}): ${onlyInPlacements.map(shortId).join(', ')}`
      );
    }
    rows.push(row('Collections', 'placements.sync', 'list mismatch', 'bookmark', parts.join(' · ')));
  }

  for (const cid of [...ids].sort()) {
    const p = placements[cid];
    const lines: string[] = [`collectionId: ${cid}`];
    if (p) {
      lines.push(`notes: ${p.notes?.trim() || '(empty)'}`);
      lines.push(`tags: ${p.tags?.length ? p.tags.join(', ') : '(empty)'}`);
      lines.push(`source: ${p.source || '(empty)'}`);
      lines.push(`addedAt: ${ts(p.addedAt) || '(empty)'}`);
    } else {
      lines.push('(listed in collectionIds but no placements[…] record yet)');
    }
    rows.push(
      row('Collections', `placement.${cid}`, `collection ${shortId(cid)}`, 'bookmark', lines.join('\n'))
    );
  }

  return rows;
}

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `…${id.slice(-10)}`;
}

/** Every Item + placement + enrichment field (empty rows included). */
export function buildAllDataModelFields(
  item: Item,
  enrich?: ItemEnrichment | null
): DataModelRow[] {
  const rows: DataModelRow[] = [];
  const tier2 = new Set(enrich?.tier2Applied ?? []);
  const fetchRan = !!enrich?.fetchedAt;

  const addCompare = (
    group: string,
    id: string,
    label: string,
    store: FieldStore,
    current: string | null,
    retrieved: string | null,
    fromFetchBookmark?: boolean
  ) => {
    const value = current ?? retrieved;
    const fromFetch =
      fromFetchBookmark ||
      tier2.has(id) ||
      (store === 'enrichment' && !!retrieved) ||
      (store === 'disk' && !!retrieved);
    rows.push(
      row(group, id, label, store, value, {
        fromFetch: fromFetch && !!value,
        compare: fetchRan || current || retrieved ? { current, retrieved } : undefined,
      })
    );
  };

  // —— Bookmark (Item) ——
  rows.push(row('Bookmark', 'item.id', 'id', 'bookmark', clip(item.id, 80)));
  rows.push(row('Bookmark', 'item.url', 'url', 'bookmark', clip(item.url)));
  rows.push(row('Bookmark', 'item.urlRaw', 'urlRaw', 'bookmark', clip(item.urlRaw)));
  addCompare(
    'Bookmark',
    'item.title',
    'title',
    'bookmark',
    clip(item.title),
    clip(enrich?.fetchedTitle),
    tier2Has(enrich, 'title')
  );
  rows.push(row('Bookmark', 'item.favicon', 'favicon', 'bookmark', clip(item.favicon, 200)));
  rows.push(row('Bookmark', 'item.notes', 'notes (legacy)', 'bookmark', clip(item.notes)));
  rows.push(row('Bookmark', 'item.tags', 'tags (global)', 'bookmark', clip(item.tags)));
  rows.push(row('Bookmark', 'item.source', 'source', 'bookmark', clip(item.source)));
  // collectionIds detailed under Collections (one block per collection)
  rows.push(row('Bookmark', 'item.created_at', 'created_at', 'bookmark', ts(item.created_at)));
  rows.push(row('Bookmark', 'item.updated_at', 'updated_at', 'bookmark', ts(item.updated_at)));

  // —— Metadata ——
  const meta = item.metadata || {};
  const metaKeys = new Set(Object.keys(meta));
  metaKeys.add('platform');
  for (const k of [...metaKeys].sort()) {
    const val = clip(meta[k]);
    const isPlatform = k === 'platform';
    addCompare(
      'Metadata',
      `metadata.${k}`,
      k,
      'bookmark',
      val,
      isPlatform ? platformFromKind(enrich?.sourceKind, item) : null,
      isPlatform && tier2Has(enrich, 'metadata.platform')
    );
  }
  if (metaKeys.size === 1 && metaKeys.has('platform') && !meta.platform) {
    // still show empty platform row (addCompare already added)
  }

  rows.push(...buildPlacementRows(item));

  // —— Enrichment (IDB) ——
  const enrichFields: { key: keyof ItemEnrichment; label: string }[] = [
    { key: 'itemId', label: 'itemId' },
    { key: 'normalizedUrl', label: 'normalizedUrl' },
    { key: 'status', label: 'status' },
    { key: 'providerId', label: 'providerId' },
    { key: 'fetchSourceId', label: 'fetchSourceId' },
    { key: 'fetchedAt', label: 'fetchedAt' },
    { key: 'attempts', label: 'attempts' },
    { key: 'lastErrorCode', label: 'lastErrorCode' },
    { key: 'lastErrorDetail', label: 'lastErrorDetail' },
    { key: 'nextRetryAt', label: 'nextRetryAt' },
    { key: 'contentHash', label: 'contentHash' },
    { key: 'textHash', label: 'textHash' },
    { key: 'sourceKind', label: 'sourceKind' },
    { key: 'fetchedTitle', label: 'fetchedTitle' },
    { key: 'snippet', label: 'snippet' },
    { key: 'summary', label: 'summary' },
    { key: 'aiTags', label: 'aiTags' },
    { key: 'aiKeyPoints', label: 'aiKeyPoints' },
    { key: 'references', label: 'references' },
    { key: 'quotedText', label: 'quotedText' },
    { key: 'quotedAuthor', label: 'quotedAuthor' },
    { key: 'channel', label: 'channel' },
    { key: 'description', label: 'description' },
    { key: 'rawRef', label: 'rawRef' },
    { key: 'rawBytes', label: 'rawBytes' },
    { key: 'hasRawBody', label: 'hasRawBody' },
    { key: 'skipReason', label: 'skipReason' },
    { key: 'tier2Applied', label: 'tier2Applied' },
    { key: 'updated_at', label: 'updated_at' },
  ];

  for (const { key, label } of enrichFields) {
    let raw: unknown = enrich ? enrich[key] : undefined;
    if (key === 'fetchedAt' || key === 'nextRetryAt' || key === 'updated_at') {
      raw = typeof raw === 'number' ? ts(raw) : raw;
    }
    if (key === 'hasRawBody') raw = enrich ? String(enrich.hasRawBody) : undefined;
    if (key === 'tier2Applied' && enrich?.tier2Applied?.length) {
      raw = enrich.tier2Applied.join(', ');
    }
    if (key === 'aiTags' && enrich?.aiTags?.length) {
      raw = enrich.aiTags.join(', ');
    }
    if (key === 'aiKeyPoints' && enrich?.aiKeyPoints?.length) {
      raw = enrich.aiKeyPoints.join('; ');
    }
    if (key === 'references' && enrich?.references?.length) {
      raw = enrich.references
        .map((r) => `${r.label}${r.followed ? ' [fetched]' : ''}: ${r.url}`)
        .join('\n');
    }
    const val = clip(raw as string | undefined);
    rows.push(
      row('Enrichment (IDB)', `enrichment.${String(key)}`, label, 'enrichment', val, {
        fromFetch: !!val && fetchRan,
        compare:
          key === 'fetchedTitle' && fetchRan
            ? { current: clip(item.title), retrieved: val }
            : undefined,
      })
    );
  }

  // —— Disk ——
  const dumpVal = enrich?.hasRawBody
    ? `yes · ${enrich.rawRef ?? '?'} (${enrich.rawBytes ?? '?'} bytes)`
    : enrich
      ? 'no'
      : null;
  rows.push(
    row('Disk cache', 'disk.fullDump', 'full markdown file', 'disk', dumpVal, {
      fromFetch: !!enrich?.hasRawBody,
      compare: enrich
        ? { current: null, retrieved: dumpVal }
        : undefined,
    })
  );

  return rows;
}

export function summarizeDataModel(rows: DataModelRow[]): {
  filled: number;
  empty: number;
  fromFetch: number;
} {
  let filled = 0;
  let empty = 0;
  let fromFetch = 0;
  for (const r of rows) {
    if (r.empty) empty++;
    else filled++;
    if (r.fromFetch) fromFetch++;
  }
  return { filled, empty, fromFetch };
}

// —— Compare-only subset (kept for tests / optional filter) ——

function resolveState(
  current: string | null,
  retrieved: string | null,
  appliedToBookmark: boolean,
  fetchRan: boolean
): FillableFieldState {
  if (appliedToBookmark && retrieved) return 'applied';
  if (current && retrieved && current === retrieved) return 'same';
  if (retrieved && !current) return 'retrieved';
  if (current && !retrieved) return 'local-only';
  if (fetchRan) return 'empty-after-fetch';
  return 'local-only';
}

function statusHintFor(state: FillableFieldState, fetchRan: boolean): string {
  switch (state) {
    case 'applied':
      return 'Fetch got this · copied onto bookmark';
    case 'retrieved':
      return 'Only in fetch cache (not on bookmark)';
    case 'local-only':
      return fetchRan ? 'On bookmark · fetch had nothing for this' : 'On bookmark';
    case 'same':
      return 'Bookmark and fetch match';
    case 'empty-after-fetch':
      return 'Fetch ran · this field came back empty';
    default:
      return '';
  }
}

function fieldApplicable(id: string, kind?: SourceKind): boolean {
  switch (id) {
    case 'quotedText':
    case 'quotedAuthor':
      return kind === 'x';
    case 'channel':
    case 'description':
      return kind === 'video';
    case 'platform':
      return kind === 'x' || kind === 'video';
    case 'favicon':
      return false;
    default:
      return true;
  }
}

export function buildFillableFields(
  item: Item,
  enrich?: ItemEnrichment | null
): FillableFieldRow[] {
  const tier2 = new Set(enrich?.tier2Applied ?? []);
  const kind = enrich?.sourceKind;
  const fetchRan = !!enrich?.fetchedAt;
  const rows: FillableFieldRow[] = [];

  const add = (
    id: string,
    label: string,
    current: string | null,
    retrieved: string | null,
    appliedToBookmark: boolean
  ) => {
    const applicable = fieldApplicable(id, kind);
    const state = resolveState(current, retrieved, appliedToBookmark, fetchRan);
    rows.push({
      id,
      label,
      current,
      retrieved,
      state,
      statusHint: statusHintFor(state, fetchRan),
      applicable,
    });
  };

  add('title', 'Title', clip(item.title), clip(enrich?.fetchedTitle), tier2.has('title'));
  add(
    'platform',
    'Platform',
    clip(item.metadata?.platform),
    platformFromKind(kind, item),
    tier2.has('metadata.platform')
  );

  const enrichFields: {
    id: string;
    label: string;
    get: (e: ItemEnrichment) => string | null | undefined;
  }[] = [
    { id: 'snippet', label: 'Main text (snippet)', get: (e) => e.snippet },
    { id: 'summary', label: 'AI summary', get: (e) => e.summary },
    {
      id: 'aiKeyPoints',
      label: 'AI key points',
      get: (e) => (e.aiKeyPoints?.length ? e.aiKeyPoints.join('\n') : null),
    },
    {
      id: 'references',
      label: 'Indexed references',
      get: (e) =>
        e.references?.length
          ? e.references
              .map((r) => `${r.label}${r.followed ? ' [fetched]' : ''}: ${r.url}`)
              .join('\n')
          : null,
    },
    { id: 'quotedText', label: 'Quoted tweet', get: (e) => e.quotedText },
    { id: 'quotedAuthor', label: 'Quote author', get: (e) => e.quotedAuthor },
    { id: 'channel', label: 'Channel', get: (e) => e.channel },
    { id: 'description', label: 'Description', get: (e) => e.description },
  ];

  for (const { id, label, get } of enrichFields) {
    add(id, label, null, enrich ? clip(get(enrich)) : null, false);
  }

  const dumpRetrieved = enrich?.hasRawBody
    ? `Saved on disk (${enrich.rawRef ?? 'file'})`
    : null;
  add('fullDump', 'Full page (disk)', null, dumpRetrieved, false);

  return rows.filter((r) => {
    if (!r.applicable) return false;
    if (r.current || r.retrieved) return true;
    if (fetchRan && r.state === 'empty-after-fetch') return true;
    return false;
  });
}

export function labelColor(state: FillableFieldState): string {
  switch (state) {
    case 'empty-after-fetch':
      return '#6b7280';
    case 'local-only':
      return 'var(--text)';
    case 'retrieved':
    case 'applied':
      return '#dc2626';
    case 'same':
      return 'var(--text)';
    default:
      return 'var(--text)';
  }
}

export function dataModelLabelColor(r: DataModelRow): string {
  if (r.fromFetch) return 'var(--error, #f85149)';
  if (r.empty) return 'var(--text-faint, #6e7681)';
  return 'var(--text, #e6edf3)';
}
