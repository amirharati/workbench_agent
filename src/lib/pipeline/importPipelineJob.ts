import {
  readJsonFromBackupFolder,
  requireWritableBackupFolder,
  writeJsonToBackupFolder,
} from '../backupFolder';
import { loadPipelineMaintenanceSnapshot } from './pipelineMaintenanceSnapshot';

/** When true, Import Studio ≥96 digest and dashboard Resume use the wave runner. */
export const IMPORT_WAVE_PIPELINE_ENABLED = true;

/** Beside workbench.sqlite in the backup folder. */
export const IMPORT_PIPELINE_JOB_FILE = 'import-pipeline-job.json';
export const IMPORT_PIPELINE_JOB_VERSION = 1 as const;
/** 96 = 3× embed/discover MAP batch size (32; see EMBED_BATCH_SIZE, DEFAULT_DISCOVER_BATCH_SIZE). */
export const IMPORT_PIPELINE_WAVE_SIZE = 96;
/** Minimum |itemIds| to create a scoped pipeline job file (import commit or future Hub batch). */
export const SCOPED_PIPELINE_JOB_THRESHOLD = IMPORT_PIPELINE_WAVE_SIZE;

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
    waveSize: opts?.waveSize ?? IMPORT_PIPELINE_WAVE_SIZE,
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
    updatedAt: Date.now(),
  };
}

export async function writeImportPipelineJob(job: ImportPipelineJob): Promise<void> {
  const normalized = normalizeJobForWrite(job);
  await requireWritableBackupFolder();
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

/** Resume stub — calls wave runner when IMPORT_WAVE_PIPELINE_ENABLED, else honest toast. */
export async function resumeImportPipelineJobStub(
  addToast: (toast: ImportPipelineToast) => void
): Promise<void> {
  const pre = await preflightImportPipelineStart();
  if (!pre.ok) {
    addToast({ type: 'error', message: pre.reason ?? 'Cannot start import pipeline.' });
    return;
  }
  if (!IMPORT_WAVE_PIPELINE_ENABLED) {
    addToast({
      type: 'info',
      message:
        'Wave processing ships in the next update — use Import Studio digest for now.',
    });
    return;
  }
  // A5b-2: flag true — read job from disk and run the wave orchestrator
  const job = await readImportPipelineJob();
  if (!job) {
    addToast({ type: 'error', message: 'No pipeline job found. Re-import to create one.' });
    return;
  }
  try {
    const { runScopedPipelineJob } = await import('./scopedPipelineJobRunner');
    const result = await runScopedPipelineJob(job);
    if (result.status === 'completed') {
      addToast({ type: 'info', message: `Pipeline run completed — ${result.completedItemIds.length} items processed.` });
    } else if (result.lastError && result.lastError !== 'Cancelled') {
      addToast({ type: 'error', message: `Pipeline paused: ${result.lastError}` });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Pipeline run failed';
    addToast({ type: 'error', message: msg });
  }
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
