import { useEffect, useState } from 'react';
import { previewClassifyBatchItemIds } from '../lib/categorization/classifyTopicExtract';
import { subscribeToDataChanges } from '../lib/dataChangeNotifier';
import {
  loadItemIdsForPipelineQueue,
  loadLibraryCategoryOverview,
  loadProcessingDigest,
  type CategoryOverviewTile,
  type ProcessingDigest,
} from '../lib/pipeline/itemPipelineContext';
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
]);

export function useHomePipelineStats() {
  const [digest, setDigest] = useState<ProcessingDigest | null>(null);
  const [maintenance, setMaintenance] = useState<PipelineMaintenanceSnapshot | null>(null);
  const [categories, setCategories] = useState<CategoryOverviewTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [classifyRunnable, setClassifyRunnable] = useState<number | null>(null);
  const [classifyRunnableLoading, setClassifyRunnableLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      loadProcessingDigest(),
      loadLibraryCategoryOverview(8),
      loadPipelineMaintenanceSnapshot(),
    ])
      .then(([d, c, m]) => {
        if (cancelled) return;
        setDigest(d);
        setCategories(c);
        setMaintenance(m);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  useEffect(() => {
    return subscribeToDataChanges((event) => {
      if (RELOAD_REASONS.has(event.reason)) {
        setRevision((r) => r + 1);
      }
    });
  }, []);

  useEffect(() => {
    if (!digest || digest.pendingClassify === 0) {
      setClassifyRunnable(null);
      setClassifyRunnableLoading(false);
      return;
    }

    let cancelled = false;
    setClassifyRunnableLoading(true);

    void loadItemIdsForPipelineQueue('pending_classify')
      .then((ids) => previewClassifyBatchItemIds(ids))
      .then((preview) => {
        if (cancelled) return;
        setClassifyRunnable(preview.filter((p) => p.runnable).length);
      })
      .catch(() => {
        if (!cancelled) setClassifyRunnable(null);
      })
      .finally(() => {
        if (!cancelled) setClassifyRunnableLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [digest?.pendingClassify, revision]);

  return { digest, maintenance, categories, loading, classifyRunnable, classifyRunnableLoading };
}
