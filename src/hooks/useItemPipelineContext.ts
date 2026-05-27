import { useCallback, useEffect, useState } from 'react';
import { subscribeToDataChanges } from '../lib/dataChangeNotifier';
import {
  loadItemPipelineContext,
  type ItemPipelineContext,
} from '../lib/pipeline/itemPipelineContext';

const PIPELINE_RELOAD_REASONS = new Set([
  'categorization.review',
  'categorization.update',
  'enrichment.update',
  'pipeline.clear',
]);

export function useItemPipelineContext(itemId: string | null | undefined) {
  const [context, setContext] = useState<ItemPipelineContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => {
    setRevision((r) => r + 1);
  }, []);

  useEffect(() => {
    if (!itemId) {
      setContext(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadItemPipelineContext(itemId)
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, revision]);

  useEffect(() => {
    if (!itemId) return;
    return subscribeToDataChanges((event) => {
      if (PIPELINE_RELOAD_REASONS.has(event.reason)) {
        setRevision((r) => r + 1);
      }
    });
  }, [itemId]);

  return { context, loading, reload };
}
