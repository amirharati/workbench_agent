import { useCallback, useEffect, useState } from 'react';
import { subscribeToDataChanges } from '../lib/dataChangeNotifier';
import { loadPipelineBadgeMap, type PipelineBadge } from '../lib/pipeline';

const RELOAD_REASONS = new Set([
  'categorization.review',
  'categorization.update',
  'enrichment.update',
  'pipeline.clear',
]);
const BADGE_BATCH_SIZE = 80;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 120 });
    } else {
      window.setTimeout(resolve, 16);
    }
  });
}

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
    setBadgeMap(new Map());
    void (async () => {
      const accumulated = new Map<string, PipelineBadge>();
      for (let offset = 0; offset < itemIds.length; offset += BADGE_BATCH_SIZE) {
        const batch = await loadPipelineBadgeMap(
          itemIds.slice(offset, offset + BADGE_BATCH_SIZE),
          { priority: 'low' }
        );
        if (cancelled) return;
        for (const [itemId, badge] of batch) accumulated.set(itemId, badge);
        // Paint the initially visible list promptly, then avoid forcing a full
        // Library rerender for every background chunk.
        if (offset === 0) setBadgeMap(new Map(accumulated));
        if (offset + BADGE_BATCH_SIZE < itemIds.length) await yieldToBrowser();
      }
      if (!cancelled) setBadgeMap(accumulated);
    })().catch((error) => {
      if (!cancelled) console.warn('[pipeline badges] Could not load badges:', error);
    });
    return () => {
      cancelled = true;
    };
  }, [key, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!itemIds.length) return;
    return subscribeToDataChanges((event) => {
      if (!RELOAD_REASONS.has(event.reason)) return;
      void import('../lib/pipeline/singleLinkDigest').then(({ isAnyDigestInFlight }) => {
        if (isAnyDigestInFlight()) return;
        reload();
      });
    });
  }, [itemIds.length, reload]);

  return badgeMap;
}
