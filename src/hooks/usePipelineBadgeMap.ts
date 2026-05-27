import { useCallback, useEffect, useState } from 'react';
import { subscribeToDataChanges } from '../lib/dataChangeNotifier';
import { loadPipelineBadgeMap, type PipelineBadge } from '../lib/pipeline';

const RELOAD_REASONS = new Set([
  'categorization.review',
  'categorization.update',
  'enrichment.update',
  'pipeline.clear',
]);

export function usePipelineBadgeMap(itemIds: string[]) {
  const [badgeMap, setBadgeMap] = useState<Map<string, PipelineBadge>>(new Map());
  const key = itemIds.join('\0');
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => {
    setRevision((r) => r + 1);
  }, []);

  useEffect(() => {
    if (!itemIds.length) {
      setBadgeMap(new Map());
      return;
    }
    let cancelled = false;
    void loadPipelineBadgeMap(itemIds).then((map) => {
      if (!cancelled) setBadgeMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [key, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!itemIds.length) return;
    return subscribeToDataChanges((event) => {
      if (RELOAD_REASONS.has(event.reason)) {
        reload();
      }
    });
  }, [itemIds.length, reload]);

  return badgeMap;
}
