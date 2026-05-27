import { useEffect, useState } from 'react';
import { subscribeToDataChanges } from '../lib/dataChangeNotifier';
import {
  loadLibraryCategoryOverview,
  loadProcessingDigest,
  type CategoryOverviewTile,
  type ProcessingDigest,
} from '../lib/pipeline/itemPipelineContext';

const RELOAD_REASONS = new Set([
  'categorization.review',
  'categorization.update',
  'enrichment.update',
  'pipeline.clear',
  'import.replace',
]);

export function useHomePipelineStats() {
  const [digest, setDigest] = useState<ProcessingDigest | null>(null);
  const [categories, setCategories] = useState<CategoryOverviewTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([loadProcessingDigest(), loadLibraryCategoryOverview(8)])
      .then(([d, c]) => {
        if (cancelled) return;
        setDigest(d);
        setCategories(c);
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

  return { digest, categories, loading };
}
