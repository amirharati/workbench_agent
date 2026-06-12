import type { ClassifyState, TopicClassifySummary } from '../categorization/types';
import { getDB } from '../db';
import type { Item } from '../db';
import { resolveEnrichmentFailureLabel } from '../enrichment/failureLabels';
import {
  getAllPipelineDebugRecords,
  type PipelineDebugPayload,
} from '../enrichment/pipelineDebug';
import type { EnrichmentResult, ItemEnrichment } from '../enrichment/types';
import type { BatchDigestResult } from './batchDigest';
import {
  buildClassifyOutcomeReportRows,
  resolveEnrichReportOutcome,
  type PipelineReportAction,
  type PipelineReportRow,
} from './pipelineBatchReport';

export type PipelineRunKind = 'batch_full' | 'batch_enrich' | 'batch_classify' | 'snapshot';

export interface PipelineRunMeta {
  runId: string;
  kind: PipelineRunKind;
  source: 'app';
  startedAt: string;
  finishedAt: string;
  itemCount: number;
  action?: PipelineReportAction;
  cancelled?: boolean;
}

export interface PipelineRunEnrichRecord {
  status: string;
  fetchSourceId?: string;
  providerId?: string;
  lastErrorCode?: string;
  lastErrorDetail?: string;
  failureStage?: string;
  failureCategory?: string;
  failureLabel?: string;
  aiStatus?: string;
  aiError?: string;
  snippetLen: number;
  summaryLen: number;
  hasRawBody: boolean;
  rawRef?: string;
  attempts: number;
  fetchedAt?: number;
  skipReason?: string;
  pendingFetchReview?: boolean;
  fetchMs?: number;
  aiMs?: number;
  totalMs?: number;
  /** Debug phases (fetch route, redirect verdict, summary, …) */
  phases?: import('../enrichment/pipelineDebug').PipelineDebugPhase[];
  redirectClass?: string;
  redirectVerdictStatus?: string;
  redirectVerdictMatch?: boolean;
  redirectVerdictKind?: string;
  summaryPromptMode?: string;
  summaryPageMatchesBookmark?: boolean;
  redirectVerdictMs?: number;
  aiCalls?: import('../ai/callAudit').PipelineDebugAICall[];
}

export interface PipelineRunClassifyRecord {
  state?: string;
  skipReason?: string;
  primaryCategoryId?: string;
  primaryCategoryName?: string;
  topicLabel?: string;
}

export interface PipelineRunItemRecord {
  itemId: string;
  url: string;
  host: string;
  title: string;
  sourceKind?: string;
  /** tab-session vs headless (local/jina/…) — app fetch path bucket */
  fetchRoute?: 'tab' | 'headless' | 'other';
  /** ok record vs kept-for-review vs failed/skipped */
  recordKind?: 'record' | 'review' | 'failed' | 'skipped' | 'none';
  run?: {
    outcome: string;
    detail: string;
  };
  enrich: PipelineRunEnrichRecord;
  classify?: PipelineRunClassifyRecord;
}

export interface PipelineRunCounts {
  total: number;
  enrichOk: number;
  enrichFailed: number;
  enrichSkipped: number;
  fetchBySource: Record<string, number>;
  /** tab vs headless among ok fetches */
  fetchRoute: Record<string, number>;
  /** record vs review vs failed vs skipped */
  recordKind: Record<string, number>;
  fetchErrors: Record<string, number>;
  failureCategories: Record<string, number>;
  aiStatus: Record<string, number>;
  classifyState: Record<string, number>;
  runOutcomes: Record<string, number>;
  redirectClass: Record<string, number>;
  redirectVerdictStatus: Record<string, number>;
  summaryPromptMode: Record<string, number>;
}

export interface PipelineRunExport {
  meta: PipelineRunMeta;
  batch?: {
    enriched: number;
    skipped: number;
    failed: number;
    classified: number;
    classifySummary?: TopicClassifySummary;
    message?: string;
  };
  counts: PipelineRunCounts;
  results: PipelineRunItemRecord[];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'invalid';
  }
}

function itemTitle(item: Item): string {
  return item.title?.trim() || item.url?.trim() || item.id;
}

function enrichRecordFromDb(enrich?: ItemEnrichment): PipelineRunEnrichRecord {
  const failure = enrich ? resolveEnrichmentFailureLabel(enrich) : undefined;
  return {
    status: enrich?.status ?? 'none',
    fetchSourceId: enrich?.fetchSourceId,
    providerId: enrich?.providerId,
    lastErrorCode: enrich?.lastErrorCode,
    lastErrorDetail: enrich?.lastErrorDetail,
    failureStage: enrich?.failureStage ?? failure?.stage,
    failureCategory: enrich?.failureCategory ?? failure?.category,
    failureLabel: failure?.label,
    aiStatus: enrich?.aiStatus,
    aiError: enrich?.aiError,
    snippetLen: enrich?.snippet?.trim().length ?? 0,
    summaryLen: enrich?.summary?.trim().length ?? 0,
    hasRawBody: enrich?.hasRawBody ?? false,
    rawRef: enrich?.rawRef,
    attempts: enrich?.attempts ?? 0,
    fetchedAt: enrich?.fetchedAt,
    skipReason: enrich?.skipReason,
    pendingFetchReview: enrich?.pendingFetchReview,
  };
}

function bump(map: Record<string, number>, key: string | undefined): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

/** App fetch path: browser tab vs headless chain. */
export function classifyFetchRoute(fetchSourceId?: string): 'tab' | 'headless' | 'other' {
  if (!fetchSourceId) return 'other';
  if (fetchSourceId === 'tab-session') return 'tab';
  if (['local', 'jina', 'markdown-new', 'hybrid', 'syndication'].includes(fetchSourceId)) {
    return 'headless';
  }
  return 'other';
}

/** Saved outcome bucket: clean record, review queue, or failure. */
export function classifyRecordKind(enrich: PipelineRunEnrichRecord): PipelineRunItemRecord['recordKind'] {
  const st = enrich.status;
  if (st === 'failed') return 'failed';
  if (st === 'skipped') return 'skipped';
  if (st === 'ok') return enrich.pendingFetchReview ? 'review' : 'record';
  return 'none';
}

export function summarizePipelineRunRecords(records: PipelineRunItemRecord[]): PipelineRunCounts {
  const counts: PipelineRunCounts = {
    total: records.length,
    enrichOk: 0,
    enrichFailed: 0,
    enrichSkipped: 0,
    fetchBySource: {},
    fetchRoute: {},
    recordKind: {},
    fetchErrors: {},
    failureCategories: {},
    aiStatus: {},
    classifyState: {},
    runOutcomes: {},
    redirectClass: {},
    redirectVerdictStatus: {},
    summaryPromptMode: {},
  };

  for (const row of records) {
    const st = row.enrich.status;
    if (st === 'ok') counts.enrichOk++;
    else if (st === 'failed') counts.enrichFailed++;
    else if (st === 'skipped') counts.enrichSkipped++;

    bump(counts.recordKind, row.recordKind ?? classifyRecordKind(row.enrich));
    if (st === 'ok') {
      bump(counts.fetchBySource, row.enrich.fetchSourceId ?? 'unknown');
      bump(counts.fetchRoute, row.fetchRoute ?? classifyFetchRoute(row.enrich.fetchSourceId));
    }
    if (st === 'failed') bump(counts.fetchErrors, row.enrich.lastErrorCode ?? 'unknown');
    bump(counts.failureCategories, row.enrich.failureCategory);
    bump(counts.aiStatus, row.enrich.aiStatus ?? (st === 'ok' ? 'none' : undefined));
    bump(counts.classifyState, row.classify?.state);
    bump(counts.runOutcomes, row.run?.outcome);
    bump(counts.redirectClass, row.enrich.redirectClass);
    bump(counts.redirectVerdictStatus, row.enrich.redirectVerdictStatus);
    bump(counts.summaryPromptMode, row.enrich.summaryPromptMode);
  }

  return counts;
}

export function formatPipelineRunAnalysisMarkdown(exported: PipelineRunExport): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const { meta, counts, batch } = exported;

  push('# App pipeline run analysis');
  push('');
  push(`- Run: \`${meta.runId}\``);
  push(`- Kind: **${meta.kind}**`);
  push(`- Items: **${meta.itemCount}**`);
  push(`- Window: ${meta.startedAt} → ${meta.finishedAt}`);
  if (meta.cancelled) push('- **Cancelled** (partial results)');
  if (batch?.message) push(`- Batch: ${batch.message}`);
  push('');

  push('## Enrichment outcomes');
  push('');
  push(`- ok: **${counts.enrichOk}**`);
  push(`- failed: **${counts.enrichFailed}**`);
  push(`- skipped: **${counts.enrichSkipped}**`);
  push('');

  if (Object.keys(counts.fetchRoute).length) {
    push('### Fetch route (ok rows): tab vs headless');
    push('');
    for (const [k, v] of Object.entries(counts.fetchRoute).sort((a, b) => b[1] - a[1])) {
      push(`- **${k}**: ${v}`);
    }
    push('');
  }

  if (Object.keys(counts.recordKind).length) {
    push('### Record kind (all rows): record vs review vs failed');
    push('');
    push('- **record** = ok, saved normally');
    push('- **review** = ok but `pendingFetchReview` (kept prior summary, suspicious re-fetch)');
    push('- **failed** / **skipped** = as labeled');
    push('');
    for (const [k, v] of Object.entries(counts.recordKind).sort((a, b) => b[1] - a[1])) {
      push(`- **${k}**: ${v}`);
    }
    push('');
  }

  if (Object.keys(counts.fetchBySource).length) {
    push('### Fetch source (ok rows)');
    push('');
    for (const [k, v] of Object.entries(counts.fetchBySource).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (Object.keys(counts.fetchErrors).length) {
    push('### Fetch error codes');
    push('');
    for (const [k, v] of Object.entries(counts.fetchErrors).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (Object.keys(counts.failureCategories).length) {
    push('### Failure categories');
    push('');
    for (const [k, v] of Object.entries(counts.failureCategories).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (Object.keys(counts.aiStatus).length) {
    push('### AI extract status');
    push('');
    for (const [k, v] of Object.entries(counts.aiStatus).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (counts.redirectClass && Object.keys(counts.redirectClass).length) {
    push('### Redirect class (mechanical probe)');
    push('');
    for (const [k, v] of Object.entries(counts.redirectClass).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (counts.redirectVerdictStatus && Object.keys(counts.redirectVerdictStatus).length) {
    push('### Redirect AI verdict (pre-summary call)');
    push('');
    push('- **ok** = dedicated redirect judge ran and parsed');
    push('- **skipped:not_eligible** = benign/none redirect — summary-only redirect rules if any');
    push('- **prior_verdict** summary mode = separate judge ran before summary extract');
    push('');
    for (const [k, v] of Object.entries(counts.redirectVerdictStatus).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (counts.summaryPromptMode && Object.keys(counts.summaryPromptMode).length) {
    push('### Summary prompt mode (redirect-aware extract)');
    push('');
    push('- **prior_verdict** = summary aligned to pre-step redirect judge');
    push('- **redirect_fields** = suspicious redirect; summary prompt adds pageMatchesBookmark rules');
    push('- **benign_hint** = benign redirect block in user content only');
    push('');
    for (const [k, v] of Object.entries(counts.summaryPromptMode).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (Object.keys(counts.classifyState).length) {
    push('### Classify state');
    push('');
    for (const [k, v] of Object.entries(counts.classifyState).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (Object.keys(counts.runOutcomes).length) {
    push('### Batch run outcomes');
    push('');
    for (const [k, v] of Object.entries(counts.runOutcomes).sort((a, b) => b[1] - a[1])) {
      push(`- ${k}: ${v}`);
    }
    push('');
  }

  if (batch?.classifySummary) {
    const s = batch.classifySummary;
    push('## Classify batch summary');
    push('');
    push(`- processed: ${s.processed}`);
    push(`- specific: ${s.classifiedSpecific}`);
    push(`- general: ${s.classifiedGeneral}`);
    push(`- pending discover: ${s.pendingDiscover}`);
    push(`- llm errors: ${s.llmErrors}`);
    push('');
  }

  return lines.join('\n');
}

export async function buildPipelineRunExport(input: {
  itemIds: string[];
  runId?: string;
  kind?: PipelineRunKind;
  startedAt?: number;
  finishedAt?: number;
  action?: PipelineReportAction;
  batch?: BatchDigestResult;
  enrichResults?: EnrichmentResult[];
  reportRows?: PipelineReportRow[];
  itemLabels?: Record<string, string>;
  includeClassify?: boolean;
  cancelled?: boolean;
}): Promise<PipelineRunExport> {
  const uniqueIds = [...new Set(input.itemIds.filter(Boolean))];
  const startedAt = input.startedAt ?? Date.now();
  const finishedAt = input.finishedAt ?? Date.now();
  const runId = input.runId ?? crypto.randomUUID();

  const db = await getDB();
  const reportByItem = new Map((input.reportRows ?? []).map((r) => [r.itemId, r]));
  const enrichResultByItem = new Map((input.enrichResults ?? []).map((r) => [r.itemId, r]));

  let debugByItem = new Map<string, PipelineDebugPayload>();
  try {
    const debugRows = await getAllPipelineDebugRecords();
    debugByItem = new Map(
      debugRows.map((row) => [row.itemId, row.payload as PipelineDebugPayload])
    );
  } catch {
    /* debug table optional */
  }

  let classifyRows: PipelineReportRow[] = [];
  if (input.includeClassify !== false && uniqueIds.length) {
    classifyRows = await buildClassifyOutcomeReportRows(uniqueIds, input.itemLabels ?? {});
  }
  const classifyByItem = new Map(classifyRows.map((r) => [r.itemId, r]));

  const results: PipelineRunItemRecord[] = [];

  for (const itemId of uniqueIds) {
    const item = await db.get('items', itemId);
    if (!item?.url?.trim()) continue;

    const enrich = db.objectStoreNames.contains('item_enrichment')
      ? await db.get('item_enrichment', itemId)
      : undefined;

    const report = reportByItem.get(itemId);
    const classifyRow = classifyByItem.get(itemId);
    const sig = db.objectStoreNames.contains('ai_item_signals')
      ? await db.get('ai_item_signals', itemId)
      : undefined;

    let run: PipelineRunItemRecord['run'];
    if (report) {
      run = { outcome: report.outcome, detail: report.detail };
    } else if (enrichResultByItem.get(itemId)) {
      const runFromEnrich = enrichResultByItem.get(itemId)!;
      const embedFailed = sig?.signalStatus === 'embed_failed';
      const { outcome, detail } = resolveEnrichReportOutcome(
        enrich,
        Boolean(embedFailed),
        input.action ?? 'full_digest',
        runFromEnrich
      );
      run = { outcome, detail };
    }

    const classify: PipelineRunClassifyRecord | undefined =
      sig || classifyRow
        ? {
            state: (sig?.classifyState as ClassifyState | undefined) ?? classifyRow?.outcome,
            skipReason: sig?.lastClassifySkipReason ?? classifyRow?.detail,
            topicLabel: classifyRow?.detail?.startsWith('Topic:')
              ? classifyRow.detail.replace(/^Topic:\s*/, '')
              : undefined,
          }
        : undefined;

    const enrichRec = enrichRecordFromDb(enrich);
    const debug = debugByItem.get(itemId);
    if (debug) {
      enrichRec.fetchMs = debug.fetchMs;
      enrichRec.aiMs = debug.aiMs;
      enrichRec.totalMs = debug.totalMs;
      enrichRec.phases = debug.phases;
      const rd = debug.redirect;
      if (rd) {
        enrichRec.redirectClass = rd.redirectClass;
        enrichRec.redirectVerdictStatus = rd.verdictStatus;
        enrichRec.redirectVerdictMatch = rd.verdictPageMatchesBookmark;
        enrichRec.redirectVerdictKind = rd.verdictFetchedPageKind;
        enrichRec.summaryPromptMode = rd.summaryPromptMode;
        enrichRec.summaryPageMatchesBookmark = rd.summaryPageMatchesBookmark;
        enrichRec.redirectVerdictMs = rd.verdictMs;
      }
      if (debug.aiCalls?.length) {
        enrichRec.aiCalls = debug.aiCalls;
      }
    }
    results.push({
      itemId,
      url: item.url.trim(),
      host: hostOf(item.url),
      title: input.itemLabels?.[itemId]?.trim() || itemTitle(item),
      sourceKind: enrich?.sourceKind,
      fetchRoute: classifyFetchRoute(enrichRec.fetchSourceId),
      recordKind: classifyRecordKind(enrichRec),
      run,
      enrich: enrichRec,
      classify,
    });
  }

  const counts = summarizePipelineRunRecords(results);
  const kind: PipelineRunKind =
    input.kind ??
    (input.batch
      ? input.batch.classified > 0
        ? 'batch_full'
        : 'batch_enrich'
      : 'snapshot');

  return {
    meta: {
      runId,
      kind,
      source: 'app',
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      itemCount: results.length,
      action: input.action,
      cancelled: input.cancelled,
    },
    batch: input.batch
      ? {
          enriched: input.batch.enriched,
          skipped: input.batch.skipped,
          failed: input.batch.failed,
          classified: input.batch.classified,
          classifySummary: input.batch.classifySummary,
          message: input.batch.message,
        }
      : undefined,
    counts,
    results,
  };
}

/** Snapshot current DB pipeline state for all bookmarks (or scoped ids). */
export async function buildPipelineSnapshotExport(itemIds?: string[]): Promise<PipelineRunExport> {
  const db = await getDB();
  let ids = itemIds?.filter(Boolean) ?? [];
  if (!ids.length) {
    const items = await db.getAll('items');
    ids = items.filter((i) => i.url?.trim()).map((i) => i.id);
  }
  return buildPipelineRunExport({
    itemIds: ids,
    kind: 'snapshot',
    includeClassify: true,
  });
}

export function pipelineRunToJsonl(exported: PipelineRunExport): string {
  return exported.results.map((row) => JSON.stringify(row)).join('\n') + (exported.results.length ? '\n' : '');
}

function tsvCell(value: string | number | boolean | undefined | null): string {
  const s = value == null ? '' : String(value);
  return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

/** Spreadsheet-friendly one row per bookmark. */
export function pipelineRunToTsv(exported: PipelineRunExport): string {
  const hasDebugTiming = exported.results.some(
    (r) => r.enrich.fetchMs != null || r.enrich.aiMs != null || r.enrich.totalMs != null
  );
  const hasRedirect = exported.results.some((r) => r.enrich.redirectClass != null);
  const header = [
    'url',
    'host',
    'title',
    'sourceKind',
    'fetchRoute',
    'recordKind',
    'enrichStatus',
    'fetchSourceId',
    'lastErrorCode',
    'failureCategory',
    'aiStatus',
    'snippetLen',
    'pendingReview',
    ...(hasRedirect
      ? [
          'redirectClass',
          'redirectVerdictStatus',
          'redirectVerdictMatch',
          'summaryPromptMode',
          'summaryPmb',
        ]
      : []),
    'classifyState',
    'runOutcome',
    ...(hasDebugTiming ? ['fetchMs', 'aiMs', 'totalMs'] : []),
  ].join('\t');

  const rows = exported.results.map((r) =>
    [
      r.url,
      r.host,
      r.title,
      r.sourceKind,
      r.fetchRoute ?? classifyFetchRoute(r.enrich.fetchSourceId),
      r.recordKind ?? classifyRecordKind(r.enrich),
      r.enrich.status,
      r.enrich.fetchSourceId,
      r.enrich.lastErrorCode,
      r.enrich.failureCategory,
      r.enrich.aiStatus,
      r.enrich.snippetLen,
      r.enrich.pendingFetchReview ? 'yes' : '',
      ...(hasRedirect
        ? [
            r.enrich.redirectClass ?? '',
            r.enrich.redirectVerdictStatus ?? '',
            r.enrich.redirectVerdictMatch ?? '',
            r.enrich.summaryPromptMode ?? '',
            r.enrich.summaryPageMatchesBookmark ?? '',
          ]
        : []),
      r.classify?.state,
      r.run?.outcome,
      ...(hasDebugTiming
        ? [r.enrich.fetchMs ?? '', r.enrich.aiMs ?? '', r.enrich.totalMs ?? '']
        : []),
    ]
      .map(tsvCell)
      .join('\t')
  );

  return [header, ...rows].join('\n') + '\n';
}
