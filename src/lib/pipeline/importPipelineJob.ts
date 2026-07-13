import {
  readJsonFromBackupFolder,
  requireWritableBackupFolder,
  writeJsonToBackupFolder,
} from '../backupFolder';
import { loadPipelineMaintenanceSnapshot } from './pipelineMaintenanceSnapshot';

/** When true, Import Studio and dashboard Resume use the scoped wave runner. */
export const IMPORT_WAVE_PIPELINE_ENABLED = true;

/** Beside workbench.sqlite in the backup folder. */
export const IMPORT_PIPELINE_JOB_FILE = 'import-pipeline-job.json';
/** Compact timing summary for dogfood comparisons (wave path only). */
export const SCOPED_PIPELINE_RUN_LATEST = 'scoped-pipeline-run-latest.json';
export const IMPORT_PIPELINE_JOB_VERSION = 1 as const;
/** 96 = 3× embed/discover MAP batch size (32; see EMBED_BATCH_SIZE, DEFAULT_DISCOVER_BATCH_SIZE). */
export const IMPORT_PIPELINE_WAVE_SIZE = 96;
/** Minimum |itemIds| to create a scoped pipeline job file (Import Studio: any non-empty batch). */
export const SCOPED_PIPELINE_JOB_THRESHOLD = 1;

export function shouldCreateScopedPipelineJob(itemIds: string[]): boolean {
  return itemIds.length >= SCOPED_PIPELINE_JOB_THRESHOLD;
}

export type ImportPipelineJobStatus = 'paused' | 'running' | 'completed' | 'failed';

export type ImportPipelinePreflight = {
  ok: boolean;
  reason?: string;
};

export async function preflightImportPipelineStart(): Promise<ImportPipelinePreflight> {
  const { blockers } = await loadPipelineMaintenanceSnapshot();
  if (blockers.needsApiKey) {
    return { ok: false, reason: 'Add AI API key in Settings.' };
  }
  return { ok: true };
}

export type ImportPipelineWaveCheckpoint = {
  waveIndex: number;
  completedCount: number;
  at: number;
};

export type ImportPipelineJob = {
  version: 1;
  importRunId: string;
  itemIds: string[];
  waveSize: number;
  waveIndex: number;
  status: ImportPipelineJobStatus;
  completedItemIds: string[];
  pendingEnrich: string[];
  pendingDownstream: string[];
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  /** Set when runScopedPipelineJob starts — absent on commit-only job files. */
  runner?: 'scoped_wave' | null;
  /** Wall-clock start of the active wave run (preserved across resume). */
  startedAt?: number | null;
  finishedAt?: number | null;
  durationMs?: number | null;
  waveCheckpoints?: ImportPipelineWaveCheckpoint[];
};

export type ScopedPipelineRunSummary = {
  runner: 'scoped_wave';
  importRunId: string;
  scopeCount: number;
  waveSize: number;
  waveCount: number;
  status: ImportPipelineJobStatus;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  completedCount: number;
  waveCheckpoints: ImportPipelineWaveCheckpoint[];
  lastError: string | null;
};

const STATUSES: readonly ImportPipelineJobStatus[] = [
  'paused',
  'running',
  'completed',
  'failed',
];

function dedupeStrings(ids: string[]): string[] {
  return [...new Set(ids)];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isStatus(value: unknown): value is ImportPipelineJobStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

function parseOptionalMs(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function parseWaveCheckpoints(value: unknown): ImportPipelineWaveCheckpoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ImportPipelineWaveCheckpoint[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.waveIndex !== 'number' || !Number.isFinite(r.waveIndex)) continue;
    if (typeof r.completedCount !== 'number' || !Number.isFinite(r.completedCount)) continue;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at)) continue;
    out.push({
      waveIndex: Math.floor(r.waveIndex),
      completedCount: Math.floor(r.completedCount),
      at: r.at,
    });
  }
  return out.length ? out : undefined;
}

function parseOptionalTimingFields(o: Record<string, unknown>): Pick<
  ImportPipelineJob,
  'runner' | 'startedAt' | 'finishedAt' | 'durationMs' | 'waveCheckpoints'
> {
  const runner = o.runner === 'scoped_wave' ? 'scoped_wave' : o.runner === null ? null : undefined;
  return {
    runner,
    startedAt: parseOptionalMs(o.startedAt),
    finishedAt: parseOptionalMs(o.finishedAt),
    durationMs: parseOptionalMs(o.durationMs),
    waveCheckpoints: parseWaveCheckpoints(o.waveCheckpoints),
  };
}

export function formatPipelineDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  const min = ms / 60_000;
  if (min < 1) return `${Math.round(ms / 1000)}s`;
  return `${min.toFixed(1)} min`;
}

export function parseImportPipelineJob(raw: unknown): ImportPipelineJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== IMPORT_PIPELINE_JOB_VERSION) return null;
  if (typeof o.importRunId !== 'string' || !o.importRunId.trim()) return null;
  if (!isStringArray(o.itemIds) || o.itemIds.length === 0) return null;
  if (typeof o.waveSize !== 'number' || !Number.isFinite(o.waveSize) || o.waveSize <= 0) {
    return null;
  }
  if (typeof o.waveIndex !== 'number' || !Number.isFinite(o.waveIndex) || o.waveIndex < 0) {
    return null;
  }
  if (!isStatus(o.status)) return null;
  if (!isStringArray(o.completedItemIds)) return null;
  if (!isStringArray(o.pendingEnrich)) return null;
  if (!isStringArray(o.pendingDownstream)) return null;
  if (o.lastError !== null && typeof o.lastError !== 'string') return null;
  if (typeof o.createdAt !== 'number' || !Number.isFinite(o.createdAt)) return null;
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;

  return {
    version: IMPORT_PIPELINE_JOB_VERSION,
    importRunId: o.importRunId.trim(),
    itemIds: dedupeStrings(o.itemIds),
    waveSize: o.waveSize,
    waveIndex: Math.floor(o.waveIndex),
    status: o.status,
    completedItemIds: dedupeStrings(o.completedItemIds),
    pendingEnrich: dedupeStrings(o.pendingEnrich),
    pendingDownstream: dedupeStrings(o.pendingDownstream),
    lastError: o.lastError,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    ...parseOptionalTimingFields(o),
  };
}

export function createImportPipelineJob(
  itemIds: string[],
  opts?: { importRunId?: string; waveSize?: number }
): ImportPipelineJob {
  const scope = dedupeStrings(itemIds.filter((id) => typeof id === 'string' && id.trim()));
  if (scope.length === 0) {
    throw new Error('createImportPipelineJob: itemIds must be non-empty');
  }
  const now = Date.now();
  return {
    version: IMPORT_PIPELINE_JOB_VERSION,
    importRunId: opts?.importRunId?.trim() || crypto.randomUUID(),
    itemIds: scope,
    waveSize: opts?.waveSize ?? Math.min(IMPORT_PIPELINE_WAVE_SIZE, scope.length),
    waveIndex: 0,
    status: 'paused',
    completedItemIds: [],
    pendingEnrich: [],
    pendingDownstream: [],
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function readImportPipelineJob(): Promise<ImportPipelineJob | null> {
  try {
    const res = await readJsonFromBackupFolder(IMPORT_PIPELINE_JOB_FILE);
    if (!res.ok || res.notFound || !res.json) return null;
    const parsed: unknown = JSON.parse(res.json);
    return parseImportPipelineJob(parsed);
  } catch {
    return null;
  }
}

function normalizeJobForWrite(job: ImportPipelineJob): ImportPipelineJob {
  const parsed = parseImportPipelineJob(job);
  if (!parsed) {
    throw new Error('writeImportPipelineJob: invalid job (version or required fields)');
  }
  return {
    ...parsed,
    itemIds: dedupeStrings(parsed.itemIds),
    completedItemIds: dedupeStrings(parsed.completedItemIds),
    pendingEnrich: dedupeStrings(parsed.pendingEnrich),
    pendingDownstream: dedupeStrings(parsed.pendingDownstream),
    runner: job.runner ?? parsed.runner,
    startedAt: job.startedAt !== undefined ? job.startedAt : parsed.startedAt,
    finishedAt: job.finishedAt !== undefined ? job.finishedAt : parsed.finishedAt,
    durationMs: job.durationMs !== undefined ? job.durationMs : parsed.durationMs,
    waveCheckpoints: job.waveCheckpoints ?? parsed.waveCheckpoints,
    updatedAt: Date.now(),
  };
}

export async function writeScopedPipelineRunSummary(
  summary: ScopedPipelineRunSummary
): Promise<void> {
  try {
    await requireWritableBackupFolder();
  } catch (e) {
    const { isBackupFolderPermissionPaused } = await import('../backupFolder');
    if (isBackupFolderPermissionPaused(e)) {
      console.warn('[scoped-pipeline] folder sync paused — skipped run summary write');
      return;
    }
    throw e;
  }
  const json = JSON.stringify(summary, null, 2);
  const res = await writeJsonToBackupFolder(SCOPED_PIPELINE_RUN_LATEST, json);
  if (!res.ok) {
    console.warn('[scoped-pipeline] could not write run summary:', res.error);
  }
}

export async function writeImportPipelineJob(job: ImportPipelineJob): Promise<void> {
  const normalized = normalizeJobForWrite(job);
  try {
    await requireWritableBackupFolder();
  } catch (e) {
    const { isBackupFolderPermissionPaused } = await import('../backupFolder');
    if (isBackupFolderPermissionPaused(e)) {
      throw new Error('Folder sync paused — click the page once, then retry');
    }
    throw e;
  }
  const json = JSON.stringify(normalized, null, 2);
  const res = await writeJsonToBackupFolder(IMPORT_PIPELINE_JOB_FILE, json);
  if (!res.ok) {
    throw new Error(res.error ?? `Failed to write ${IMPORT_PIPELINE_JOB_FILE}`);
  }
}

export type ImportPipelineToast = {
  type: 'error' | 'info';
  message: string;
};

/** @deprecated Use PipelineProgressProvider.runResumePipelineJob for UI resume. */
export async function resumeImportPipelineJobStub(
  addToast: (toast: ImportPipelineToast) => void
): Promise<void> {
  addToast({
    type: 'info',
    message: 'Use the dashboard Resume button — it opens the pipeline progress dialog.',
  });
}

/** Remove import-pipeline-job.json from the backup folder if present. */
export async function clearImportPipelineJob(): Promise<void> {
  try {
    const root = await requireWritableBackupFolder();
    await root.removeEntry(IMPORT_PIPELINE_JOB_FILE);
  } catch {
    /* file or folder may not exist */
  }
}
