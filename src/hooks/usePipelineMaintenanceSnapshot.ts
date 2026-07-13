import { useCallback, useEffect, useState } from 'react';
import { subscribeToDataChanges } from '../lib/dataChangeNotifier';
import {
  loadPipelineMaintenanceSnapshot,
  type PipelineMaintenanceSnapshot,
} from '../lib/pipeline/pipelineMaintenanceSnapshot';

const RELOAD_REASONS = new Set([
  'categorization.review',
  'categorization.update',
  'enrichment.update',
  'pipeline.clear',
  'import.replace',
  'import.bulk',
]);

export function usePipelineMaintenanceSnapshot(opts?: {
  itemIds?: string[];
  /** When true, skip reload while a pipeline job is running (parent sets this). */
  pauseWhileRunning?: boolean;
  isRunning?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<PipelineMaintenanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);

  const itemIdsKey = opts?.itemIds?.join(',') ?? '';

  const reload = useCallback(
    async (silent?: boolean) => {
      if (opts?.pauseWhileRunning && opts.isRunning) return;
      if (!silent) {
        if (!snapshot) setLoading(true);
        else setRefreshing(true);
      }
      try {
        const next = await loadPipelineMaintenanceSnapshot(
          opts?.itemIds?.length ? { itemIds: opts.itemIds } : undefined
        );
        setSnapshot(next);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [opts?.itemIds, opts?.isRunning, opts?.pauseWhileRunning, snapshot]
  );

  useEffect(() => {
    void reload();
  }, [revision, itemIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return subscribeToDataChanges((event) => {
      if (!RELOAD_REASONS.has(event.reason)) return;
      if (opts?.pauseWhileRunning && opts.isRunning) return;
      void import('../lib/pipeline/singleLinkDigest').then(({ isAnyDigestInFlight }) => {
        if (isAnyDigestInFlight()) return;
        setRevision((r) => r + 1);
      });
    });
  }, [opts?.isRunning, opts?.pauseWhileRunning]);

  useEffect(() => {
    if (!opts?.isRunning && opts?.pauseWhileRunning) {
      setRevision((r) => r + 1);
    }
  }, [opts?.isRunning, opts?.pauseWhileRunning]);

  return { snapshot, loading, refreshing, reload };
}
