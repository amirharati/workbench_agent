import {
  BackupFolderRequiredError,
  isBackupFolderPermissionPaused,
  requireWritableBackupFolder,
  writeJsonToBackupFolder,
} from '../backupFolder';
import { isPipelineDebugEnabled } from '../enrichment/pipelineDebug';
import {
  formatPipelineRunAnalysisMarkdown,
  pipelineRunToJsonl,
  pipelineRunToTsv,
  type PipelineRunExport,
} from './pipelineRunAnalysis';

const RUNS_DIR = 'pipeline-runs';

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};
/** Beside workbench.sqlite in the backup folder. */
export const PIPELINE_RUN_LATEST_FILE = 'pipeline-run-latest.json';
export const PIPELINE_RUN_IN_PROGRESS_FILE = 'pipeline-run-in-progress.json';

function buildLatestBundle(exported: PipelineRunExport) {
  return {
    meta: exported.meta,
    counts: exported.counts,
    batch: exported.batch,
    results: exported.results,
    analysisMarkdown: formatPipelineRunAnalysisMarkdown(exported),
  };
}

function runFolderName(exported: PipelineRunExport): string {
  const stamp = exported.meta.finishedAt.replace(/[:.]/g, '-').slice(0, 19);
  const shortId = exported.meta.runId.slice(0, 8);
  return `app-${stamp}-${shortId}`;
}

async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function writeJsonBesideSqlite(
  filename: string,
  json: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireWritableBackupFolder();
  } catch (e) {
    if (isBackupFolderPermissionPaused(e) || e instanceof BackupFolderRequiredError) {
      return { ok: false, error: e instanceof Error ? e.message : 'Backup folder not writable' };
    }
    throw e;
  }
  return writeJsonToBackupFolder(filename, json);
}

export type PersistPipelineRunResult = {
  ok: boolean;
  folder?: string;
  files?: string[];
  error?: string;
};

export function shouldWritePipelineRunArtifacts(): boolean {
  return isPipelineDebugEnabled();
}

/** At pipeline start — writes pipeline-run-in-progress.json next to workbench.sqlite. */
export async function markPipelineRunStarted(itemCount: number, startedAt: number): Promise<void> {
  if (!shouldWritePipelineRunArtifacts()) return;
  const json = JSON.stringify({ status: 'running', itemCount, startedAt }, null, 2);
  const res = await writeJsonBesideSqlite(PIPELINE_RUN_IN_PROGRESS_FILE, json);
  if (!res.ok) {
    throw new Error(res.error ?? 'Failed to write pipeline-run-in-progress.json');
  }
}

/** At pipeline end — latest.json + pipeline-runs/app-…/ folder. */
export async function persistPipelineRunExportIfEnabled(
  exported: PipelineRunExport
): Promise<PersistPipelineRunResult> {
  if (!shouldWritePipelineRunArtifacts()) {
    return { ok: true, files: [] };
  }
  return persistPipelineRunExport(exported);
}

export async function persistPipelineRunExport(
  exported: PipelineRunExport
): Promise<PersistPipelineRunResult> {
  const latestJson = JSON.stringify(buildLatestBundle(exported), null, 2);

  const flat = await writeJsonBesideSqlite(PIPELINE_RUN_LATEST_FILE, latestJson);
  if (!flat.ok) {
    return { ok: false, error: flat.error ?? 'Failed to write pipeline-run-latest.json' };
  }

  const finishedAt = Date.parse(exported.meta.finishedAt) || Date.now();
  await writeJsonBesideSqlite(
    PIPELINE_RUN_IN_PROGRESS_FILE,
    JSON.stringify({ status: 'done', finishedAt }, null, 2)
  );

  try {
    const root = await requireWritableBackupFolder();
    const runsDir = await root.getDirectoryHandle(RUNS_DIR, { create: true });
    const folder = runFolderName(exported);
    const runDir = await runsDir.getDirectoryHandle(folder, { create: true });

    await writeTextFile(runDir, 'meta.json', JSON.stringify(exported.meta, null, 2));
    await writeTextFile(runDir, 'summary.json', JSON.stringify(exported.counts, null, 2));
    await writeTextFile(runDir, 'results.jsonl', pipelineRunToJsonl(exported));
    await writeTextFile(runDir, 'results.tsv', pipelineRunToTsv(exported));
    await writeTextFile(runDir, 'analysis.md', formatPipelineRunAnalysisMarkdown(exported));
    if (exported.batch) {
      await writeTextFile(runDir, 'batch.json', JSON.stringify(exported.batch, null, 2));
    }

    return {
      ok: true,
      folder: `${RUNS_DIR}/${folder}`,
      files: [
        PIPELINE_RUN_LATEST_FILE,
        'meta.json',
        'summary.json',
        'results.jsonl',
        'results.tsv',
        'analysis.md',
        ...(exported.batch ? ['batch.json'] : []),
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[pipelineRun] pipeline-runs/ subfolder failed:', msg);
    return {
      ok: true,
      folder: PIPELINE_RUN_LATEST_FILE,
      files: [PIPELINE_RUN_LATEST_FILE],
      error: `subfolder_failed: ${msg}`,
    };
  }
}

export function downloadPipelineRunBundle(exported: PipelineRunExport): void {
  const stamp = exported.meta.finishedAt.replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([JSON.stringify(buildLatestBundle(exported), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pipeline-run-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveAndDownloadPipelineRun(
  exported: PipelineRunExport
): Promise<PersistPipelineRunResult> {
  const saved = await persistPipelineRunExport(exported);
  downloadPipelineRunBundle(exported);
  return saved;
}

/** Remove pipeline-run-*.json and pipeline-runs/ from the backup folder (testing reset). */
export async function purgePipelineRunArtifactsFromBackupFolder(): Promise<number> {
  let removed = 0;
  try {
    const root = await requireWritableBackupFolder();
    for (const name of [PIPELINE_RUN_LATEST_FILE, PIPELINE_RUN_IN_PROGRESS_FILE]) {
      try {
        await root.removeEntry(name);
        removed++;
      } catch {
        /* may not exist */
      }
    }
    try {
      const runsDir = await root.getDirectoryHandle(RUNS_DIR);
      for await (const [name] of (runsDir as DirectoryWithEntries).entries()) {
        try {
          await runsDir.removeEntry(name, { recursive: true });
          removed++;
        } catch {
          /* skip */
        }
      }
    } catch {
      /* no pipeline-runs dir */
    }
  } catch {
    return removed;
  }
  return removed;
}
