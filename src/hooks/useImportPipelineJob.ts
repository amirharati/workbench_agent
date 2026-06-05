import { useCallback, useEffect, useState } from 'react';
import {
  clearImportPipelineJob,
  IMPORT_WAVE_PIPELINE_ENABLED,
  readImportPipelineJob,
  type ImportPipelineJob,
} from '../lib/pipeline/importPipelineJob';

export function useImportPipelineJob(backupFolderReady?: boolean) {
  const [job, setJob] = useState<ImportPipelineJob | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!backupFolderReady) {
      setJob(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setJob(await readImportPipelineJob());
    } catch {
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [backupFolderReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismissJob = useCallback(async () => {
    await clearImportPipelineJob();
    setJob(null);
  }, []);

  const isResumable = Boolean(
    job &&
      (job.status === 'paused' || job.status === 'failed') &&
      IMPORT_WAVE_PIPELINE_ENABLED
  );

  return { job, loading, refresh, dismissJob, isResumable };
}
