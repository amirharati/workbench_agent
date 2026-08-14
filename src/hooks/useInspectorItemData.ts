import { useCallback, useEffect, useState } from 'react';
import { subscribeToDataChanges } from '../lib/dataChangeNotifier';
import {
  loadItemPipelineContext,
  type ItemPipelineContext,
} from '../lib/pipeline/itemPipelineContext';
import { runAppFindSimilar, type FindSimilarResult } from '../lib/search';

const INSPECTOR_RELOAD_REASONS = new Set([
  'item.update',
  'item.trash.bulk',
  'item.delete',
  'import.replace',
  'import.bulk',
  'categorization.review',
  'categorization.update',
  'enrichment.update',
  'pipeline.complete',
  'pipeline.clear',
]);

type SharedLoad<T> = {
  value?: T;
  promise?: Promise<T>;
};
const MAX_SHARED_INSPECTOR_ITEMS = 100;

const contextLoads = new Map<string, SharedLoad<ItemPipelineContext | null>>();
const similarLoads = new Map<string, SharedLoad<FindSimilarResult>>();

function loadShared<T>(
  cache: Map<string, SharedLoad<T>>,
  itemId: string,
  load: () => Promise<T>
): Promise<T> {
  const current = cache.get(itemId);
  if (current && 'value' in current) return Promise.resolve(current.value as T);
  if (current?.promise) return current.promise;

  const promise = load().then(
    (value) => {
      // An item may be invalidated while this request is in flight. Never let
      // the older response repopulate the shared cache after that boundary.
      if (cache.get(itemId)?.promise === promise) {
        cache.delete(itemId);
        cache.set(itemId, { value });
        if (cache.size > MAX_SHARED_INSPECTOR_ITEMS) {
          for (const [cachedItemId, cached] of cache) {
            if (cachedItemId === itemId) continue;
            if (!('value' in cached)) continue;
            cache.delete(cachedItemId);
            if (cache.size <= MAX_SHARED_INSPECTOR_ITEMS) break;
          }
        }
      }
      return value;
    },
    (error) => {
      if (cache.get(itemId)?.promise === promise) cache.delete(itemId);
      throw error;
    }
  );
  cache.set(itemId, { promise });
  return promise;
}

function peekShared<T>(cache: Map<string, SharedLoad<T>>, itemId: string): T | undefined {
  const current = cache.get(itemId);
  return current && 'value' in current ? current.value : undefined;
}

function invalidateInspectorItem(itemId: string): void {
  contextLoads.delete(itemId);
  similarLoads.delete(itemId);
}

/**
 * The one product Inspector data flow. Every surface supplies only an item ID;
 * keyed context and Similar reads, deduplication, invalidation, and stale-result
 * protection are owned here rather than by Home, Library, or Enrichment.
 */
export function useInspectorItemData(itemId: string | null | undefined) {
  const [revision, setRevision] = useState(0);
  const [context, setContext] = useState<ItemPipelineContext | null>(() =>
    itemId ? peekShared(contextLoads, itemId) ?? null : null
  );
  const [contextItemId, setContextItemId] = useState<string | null>(itemId ?? null);
  const [similar, setSimilar] = useState<FindSimilarResult | null>(() =>
    itemId ? peekShared(similarLoads, itemId) ?? null : null
  );
  const [similarItemId, setSimilarItemId] = useState<string | null>(itemId ?? null);
  const [contextLoading, setContextLoading] = useState(Boolean(itemId && !context));
  const [similarLoading, setSimilarLoading] = useState(Boolean(itemId && !similar));
  const [contextError, setContextError] = useState<string | null>(null);
  const [similarError, setSimilarError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (itemId) invalidateInspectorItem(itemId);
    setRevision((current) => current + 1);
  }, [itemId]);

  useEffect(() => {
    if (!itemId) {
      setContext(null);
      setContextItemId(null);
      setSimilar(null);
      setSimilarItemId(null);
      setContextLoading(false);
      setSimilarLoading(false);
      setContextError(null);
      setSimilarError(null);
      return;
    }

    let cancelled = false;
    const cachedContext = peekShared(contextLoads, itemId);
    const cachedSimilar = peekShared(similarLoads, itemId);
    setContext(cachedContext ?? null);
    setContextItemId(itemId);
    setSimilar(cachedSimilar ?? null);
    setSimilarItemId(itemId);
    setContextLoading(cachedContext === undefined);
    setSimilarLoading(cachedSimilar === undefined);
    setContextError(null);
    setSimilarError(null);

    // Always enqueue the high-priority keyed context read before the secondary
    // low-priority Similar request. All product surfaces use this exact order.
    const contextRequest = loadShared(
      contextLoads,
      itemId,
      () => loadItemPipelineContext(itemId)
    );
    void contextRequest.then(
      (value) => {
        if (!cancelled) {
          setContext(value);
          setContextItemId(itemId);
          setContextLoading(false);
        }
      },
      (error) => {
        if (!cancelled) {
          setContextError(error instanceof Error ? error.message : String(error));
          setContextLoading(false);
        }
      }
    );
    // Context is the first-paint contract. Starting Similar only after that
    // keyed request settles guarantees identical ordering on every surface and
    // prevents a cold secondary query from occupying the worker first.
    void contextRequest
      .catch(() => null)
      .then(() => loadShared(
        similarLoads,
        itemId,
        () => runAppFindSimilar({ itemId, limit: 12 })
      ))
      .then(
        (value) => {
          if (!cancelled) {
            setSimilar(value);
            setSimilarItemId(itemId);
            setSimilarLoading(false);
          }
        },
        (error) => {
          if (!cancelled) {
            setSimilarError(error instanceof Error ? error.message : String(error));
            setSimilarLoading(false);
          }
        }
      );

    return () => {
      cancelled = true;
    };
  }, [itemId, revision]);

  useEffect(() => {
    if (!itemId) return;
    return subscribeToDataChanges((event) => {
      if (!INSPECTOR_RELOAD_REASONS.has(event.reason)) return;
      if (
        event.entityId &&
        event.entityId !== itemId &&
        !event.entityIds?.includes(itemId)
      ) return;
      void import('../lib/pipeline/singleLinkDigest').then(({ isAnyDigestInFlight }) => {
        if (isAnyDigestInFlight()) return;
        invalidateInspectorItem(itemId);
        setRevision((current) => current + 1);
      });
    });
  }, [itemId]);

  return {
    context: contextItemId === itemId ? context : null,
    similar: similarItemId === itemId ? similar : null,
    contextLoading: Boolean(itemId) && (contextItemId !== itemId || contextLoading),
    similarLoading: Boolean(itemId) && (similarItemId !== itemId || similarLoading),
    contextError: contextItemId === itemId ? contextError : null,
    similarError: similarItemId === itemId ? similarError : null,
    reload,
  };
}
