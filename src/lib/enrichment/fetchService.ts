import type { Item } from '../db';
import { getAllItems, getItem, normalizeBookmarkUrl, updateItem } from '../db';
import {
  checkEligibility,
  classifySourceKind,
  getLocalTextBundle,
  hashText,
  titleLooksWeak,
} from './eligibility';
import { extractEnrichmentWithAI, type EnrichmentAIExtract } from './aiExtract';
import { detectFetchFailure, stripProviderWrapper } from './fetchQuality';
import { hybridProvider } from './providers/hybrid';
import { jinaProvider } from './providers/jina';
import { noopProvider } from './providers/noop';
import type { FetchProvider } from './providers/types';
import {
  parseFetchedContent,
  snippetIsUseful,
} from './parse';
import { deleteRawBody, loadRawBody, writeRawBody, writeReviewRawBody } from './rawBodyStore';
import {
  deleteEnrichment,
  getAllEnrichments,
  getEnrichment,
  getEnrichmentsByStatus,
  putEnrichment,
} from './storage';
import type {
  EnrichBatchOptions,
  EnrichBatchResult,
  EnrichmentErrorCode,
  EnrichmentResult,
  ItemEnrichment,
} from './types';
import { ENRICHMENT_DEFAULTS } from './types';

let activeProvider: FetchProvider = hybridProvider;

export function registerFetchProvider(provider: FetchProvider): void {
  activeProvider = provider;
}

export function getFetchProvider(): FetchProvider {
  return activeProvider;
}

/** Use noop provider (e.g. tests). */
export function useNoopProvider(): void {
  activeProvider = noopProvider;
}

export function useJinaProvider(): void {
  activeProvider = jinaProvider;
}

export function useHybridProvider(): void {
  activeProvider = hybridProvider;
}

export { checkEligibility, checkUrlEligibility } from './eligibility';
export { getEnrichment, getAllEnrichments } from './storage';
export { loadRawBody } from './rawBodyStore';
export { buildItemText, buildItemTextAsync } from './itemText';

export async function getEnrichmentState(itemId: string): Promise<ItemEnrichment | undefined> {
  return getEnrichment(itemId);
}

export async function listNeedsAttention(): Promise<ItemEnrichment[]> {
  return getEnrichmentsByStatus(['failed', 'stale']);
}

function buildDiskDump(opts: {
  url: string;
  fetchSourceId?: string;
  providerId: string;
  ai: EnrichmentAIExtract | null;
  markdown: string;
  cleanMarkdown: string;
}): string {
  const header = {
    url: opts.url,
    providerId: opts.providerId,
    fetchSourceId: opts.fetchSourceId ?? null,
    ai: opts.ai ?? null,
    savedAt: new Date().toISOString(),
  };
  const body = opts.cleanMarkdown.trim() || opts.markdown.trim();
  return `<!-- enrichment-meta\n${JSON.stringify(header, null, 2)}\n-->\n\n${body}`;
}

async function applyItemTier2Updates(
  item: Item,
  parsedTitle: string | undefined,
  sourceKind: ReturnType<typeof classifySourceKind>,
  ai?: { improvedTitle?: string; tags?: string[] }
): Promise<string[]> {
  const applied: string[] = [];
  const updates: Partial<Item> = {};
  const meta = { ...(item.metadata || {}) };

  const titleCandidate = ai?.improvedTitle?.trim() || parsedTitle?.trim();
  if (
    titleCandidate &&
    titleLooksWeak(item.title, item.url) &&
    titleCandidate.length > (item.title || '').length &&
    titleCandidate !== item.url
  ) {
    updates.title = titleCandidate;
    applied.push('title');
  }

  if (ai?.tags?.length) {
    const existing = new Set((item.tags || []).map((t) => t.toLowerCase()));
    const merged = [...(item.tags || [])];
    for (const tag of ai.tags) {
      if (!existing.has(tag.toLowerCase())) {
        merged.push(tag);
        existing.add(tag.toLowerCase());
      }
    }
    if (merged.length > (item.tags || []).length) {
      updates.tags = merged;
      applied.push('tags');
    }
  }

  if (sourceKind === 'x' && !meta.platform) {
    meta.platform = 'x';
    applied.push('metadata.platform');
  }
  if (sourceKind === 'video' && !meta.platform) {
    try {
      const host = new URL(item.url).hostname;
      if (host.includes('youtube') || host.includes('youtu.be')) meta.platform = 'youtube';
      else meta.platform = 'video';
    } catch {
      meta.platform = 'video';
    }
    applied.push('metadata.platform');
  }

  if (Object.keys(meta).length > Object.keys(item.metadata || {}).length) {
    updates.metadata = meta;
  }

  if (Object.keys(updates).length > 0) {
    await updateItem(item.id, updates);
  }
  return applied;
}

async function persistSkipped(
  item: Item,
  skipReason: string,
  sourceKind: ReturnType<typeof classifySourceKind>
): Promise<EnrichmentResult> {
  const localBundle = getLocalTextBundle(item);
  const now = Date.now();
  const record: ItemEnrichment = {
    itemId: item.id,
    normalizedUrl: normalizeBookmarkUrl(item.url),
    status: 'skipped',
    providerId: activeProvider.id,
    fetchedAt: now,
    attempts: 0,
    textHash: hashText(localBundle),
    snippet: localBundle.slice(0, ENRICHMENT_DEFAULTS.snippetMaxChars),
    summary: localBundle.slice(0, 2000),
    sourceKind,
    skipReason,
    hasRawBody: false,
    updated_at: now,
  };
  await putEnrichment(record);
  return { itemId: item.id, status: 'skipped', skipped: true, message: skipReason };
}

function hasValuablePriorEnrichment(existing?: ItemEnrichment | null): boolean {
  if (!existing || existing.status !== 'ok') return false;
  if (existing.aiStatus === 'ok' && existing.summary?.trim()) return true;
  return (existing.snippet?.trim().length ?? 0) >= ENRICHMENT_DEFAULTS.minUsefulSnippetChars;
}

async function preservePriorOnSuspiciousFetch(
  item: Item,
  existing: ItemEnrichment,
  pending: ItemEnrichment,
  reason: EnrichmentErrorCode,
  suspiciousMarkdown?: string
): Promise<EnrichmentResult> {
  const now = Date.now();
  let reviewRawRef: string | undefined;
  if (suspiciousMarkdown?.trim()) {
    const review = await writeReviewRawBody(
      item.id,
      `# Suspicious re-fetch (${reason})\n\nURL: ${item.url}\n\n${suspiciousMarkdown}`
    );
    if (review.ok && review.rawRef) reviewRawRef = review.rawRef;
  }
  await putEnrichment({
    ...existing,
    attempts: pending.attempts,
    lastErrorCode: reason,
    pendingFetchReview: true,
    pendingFetchReviewReason: reason,
    reviewRawRef,
    updated_at: now,
  });
  return {
    itemId: item.id,
    status: 'ok',
    skipped: true,
    message: `prior_kept_${reason}`,
  };
}

export async function enrichOne(
  itemId: string,
  options?: { force?: boolean; signal?: AbortSignal; refetchCompare?: boolean }
): Promise<EnrichmentResult> {
  const item = await getItem(itemId);
  if (!item?.url) {
    return { itemId, status: 'failed', errorCode: 'excluded', message: 'no_item' };
  }

  const existing = await getEnrichment(itemId);
  const elig = checkEligibility(item, existing, {
    force: options?.force,
    refetchCompare: options?.refetchCompare,
  });

  if (!elig.eligible) {
    return {
      itemId,
      status: existing?.status ?? 'none',
      skipped: true,
      message: elig.reason,
    };
  }

  const sourceKind = elig.sourceKind ?? classifySourceKind(item.url, item);

  if (elig.skipFetch && !options?.force) {
    return persistSkipped(item, elig.skipReason || 'skipped_sufficient_local', sourceKind);
  }

  const attempts = (existing?.attempts ?? 0) + 1;
  const now = Date.now();
  const pending: ItemEnrichment = {
    itemId: item.id,
    normalizedUrl: normalizeBookmarkUrl(item.url),
    status: 'pending',
    providerId: activeProvider.id,
    attempts,
    sourceKind,
    hasRawBody: false,
    updated_at: now,
  };
  await putEnrichment(pending);

  const timeoutMs = ENRICHMENT_DEFAULTS.timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const signal = controller.signal;

  try {
    const fetchResult = await activeProvider.fetchUrl({
      url: item.url,
      normalizedUrl: pending.normalizedUrl,
      hints: { sourceKind, force: options?.force },
      signal,
    });
    clearTimeout(timeout);

    if (!fetchResult.ok || !fetchResult.markdown) {
      const errorCode = fetchResult.errorCode ?? 'provider_error';
      if (existing && hasValuablePriorEnrichment(existing)) {
        return preservePriorOnSuspiciousFetch(item, existing, pending, errorCode);
      }
      const nextRetryAt =
        attempts < ENRICHMENT_DEFAULTS.maxAttempts
          ? now + ENRICHMENT_DEFAULTS.backoffBaseMs * Math.pow(2, attempts - 1)
          : undefined;
      const failed: ItemEnrichment = {
        ...pending,
        status: 'failed',
        lastErrorCode: errorCode,
        nextRetryAt,
        fetchedAt: now,
        updated_at: now,
      };
      await putEnrichment(failed);
      return { itemId, status: 'failed', errorCode, message: errorCode };
    }

    if (
      fetchResult.rawBytesApprox &&
      fetchResult.rawBytesApprox > ENRICHMENT_DEFAULTS.maxResponseBytes
    ) {
      if (existing && hasValuablePriorEnrichment(existing)) {
        return preservePriorOnSuspiciousFetch(
          item,
          existing,
          pending,
          'oversized',
          fetchResult.markdown
        );
      }
      const failed: ItemEnrichment = {
        ...pending,
        status: 'failed',
        lastErrorCode: 'oversized',
        fetchedAt: now,
        updated_at: now,
      };
      await putEnrichment(failed);
      return { itemId, status: 'failed', errorCode: 'oversized' };
    }

    const rawMarkdown = fetchResult.markdown;
    const cleanMarkdown = stripProviderWrapper(rawMarkdown);

    const authOrEmpty = detectFetchFailure(cleanMarkdown);
    const localBundle = getLocalTextBundle(item);
    const parsed = parseFetchedContent(
      cleanMarkdown,
      sourceKind,
      fetchResult.title
    );

    let status: ItemEnrichment['status'] = 'ok';
    let lastErrorCode = authOrEmpty;

    if (authOrEmpty) {
      status = 'failed';
    } else if (!snippetIsUseful(parsed.snippet, localBundle)) {
      status = 'failed';
      lastErrorCode = 'parse_empty';
    }

    if (status === 'failed' && existing && hasValuablePriorEnrichment(existing)) {
      return preservePriorOnSuspiciousFetch(
        item,
        existing,
        pending,
        lastErrorCode ?? 'parse_empty',
        cleanMarkdown
      );
    }

    const textHash = hashText(localBundle);
    const contentHash = hashText(cleanMarkdown);
    const pageUnchanged =
      !options?.force &&
      status === 'ok' &&
      existing?.status === 'ok' &&
      !!existing.contentHash &&
      existing.contentHash === contentHash;

    if (pageUnchanged && existing.aiStatus === 'ok') {
      await putEnrichment({
        ...existing,
        textHash,
        snippet: parsed.snippet ?? existing.snippet,
        fetchedTitle: parsed.title ?? existing.fetchedTitle,
        fetchedAt: now,
        fetchSourceId: fetchResult.fetchSourceId,
        pendingFetchReview: false,
        pendingFetchReviewReason: undefined,
        reviewRawRef: undefined,
        updated_at: now,
      });
      return {
        itemId: item.id,
        status: 'ok',
        skipped: true,
        message: 'content_unchanged',
      };
    }

    let aiOutcome: Awaited<ReturnType<typeof extractEnrichmentWithAI>> | undefined;
    let aiExtract: EnrichmentAIExtract | undefined;
    const needsAiExtract =
      status === 'ok' && (!pageUnchanged || existing.aiStatus !== 'ok');
    if (needsAiExtract) {
      aiOutcome = await extractEnrichmentWithAI(
        parsed.snippet || cleanMarkdown,
        item.url,
        parsed.title || item.title,
        {
          sourceKind,
          hints: {
            quotedText: parsed.quotedText,
            quotedAuthor: parsed.quotedAuthor,
            channel: parsed.channel,
            description: parsed.description,
          },
        }
      );
      aiExtract = aiOutcome.data;
      if (aiExtract?.improvedTitle) {
        parsed.title = aiExtract.improvedTitle;
      }
    }

    let rawRef: string | undefined;
    let rawBytes: number | undefined;
    let hasRawBody = false;

    const diskBody = buildDiskDump({
      url: item.url,
      fetchSourceId: fetchResult.fetchSourceId,
      providerId: activeProvider.id,
      ai: aiExtract ?? null,
      markdown: rawMarkdown,
      cleanMarkdown,
    });

    if (diskBody.trim()) {
      const disk = await writeRawBody(item.id, diskBody);
      if (disk.ok && disk.rawRef) {
        rawRef = disk.rawRef;
        rawBytes = disk.rawBytes;
        hasRawBody = true;
      }
    }

    let tier2Applied: string[] | undefined;
    if (status === 'ok') {
      tier2Applied = await applyItemTier2Updates(item, parsed.title, sourceKind, aiExtract);
      if (tier2Applied.length === 0) tier2Applied = undefined;
    }

    const record: ItemEnrichment = {
      itemId: item.id,
      normalizedUrl: pending.normalizedUrl,
      status,
      providerId: activeProvider.id,
      fetchSourceId: fetchResult.fetchSourceId,
      fetchedAt: now,
      attempts,
      lastErrorCode,
      nextRetryAt:
        status === 'failed' && attempts < ENRICHMENT_DEFAULTS.maxAttempts
          ? now + ENRICHMENT_DEFAULTS.backoffBaseMs * Math.pow(2, attempts - 1)
          : undefined,
      contentHash,
      textHash,
      snippet: parsed.snippet,
      summary: aiExtract?.summary,
      fetchedTitle: parsed.title,
      sourceKind,
      quotedText: parsed.quotedText,
      quotedAuthor: parsed.quotedAuthor,
      channel: parsed.channel,
      description: parsed.description,
      aiTags: aiExtract?.tags,
      aiKeyPoints: aiExtract?.keyPoints,
      aiStatus: aiOutcome?.status,
      aiError: aiOutcome?.error,
      aiAt: aiOutcome?.at,
      rawRef,
      rawBytes,
      hasRawBody,
      tier2Applied,
      pendingFetchReview: false,
      pendingFetchReviewReason: undefined,
      reviewRawRef: undefined,
      updated_at: now,
    };
    await putEnrichment(record);

    return {
      itemId,
      status,
      errorCode: lastErrorCode,
      message: status === 'ok' ? undefined : lastErrorCode,
    };
  } catch (e) {
    clearTimeout(timeout);
    const errorCode =
      e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : 'network';
    if (existing && hasValuablePriorEnrichment(existing)) {
      return preservePriorOnSuspiciousFetch(item, existing, pending, errorCode);
    }
    const failed: ItemEnrichment = {
      ...pending,
      status: 'failed',
      lastErrorCode: errorCode,
      fetchedAt: Date.now(),
      updated_at: Date.now(),
      nextRetryAt: Date.now() + ENRICHMENT_DEFAULTS.backoffBaseMs,
    };
    await putEnrichment(failed);
    return { itemId, status: 'failed', errorCode };
  }
}

/** Re-run AI extraction from cached snippet — no network fetch. */
export async function reextractAI(itemId: string): Promise<EnrichmentResult> {
  const item = await getItem(itemId);
  if (!item?.url) {
    return { itemId, status: 'failed', errorCode: 'excluded', message: 'no_item' };
  }

  const existing = await getEnrichment(itemId);
  if (!existing || existing.status !== 'ok') {
    return {
      itemId,
      status: existing?.status ?? 'none',
      skipped: true,
      message: 'needs_successful_fetch',
    };
  }

  const snippet = existing.snippet?.trim() || '';
  if (snippet.length < ENRICHMENT_DEFAULTS.minUsefulSnippetChars) {
    return {
      itemId,
      status: 'ok',
      skipped: true,
      message: 'snippet_too_short',
    };
  }

  const sourceKind = existing.sourceKind ?? classifySourceKind(item.url, item);
  const aiOutcome = await extractEnrichmentWithAI(
    snippet,
    item.url,
    existing.fetchedTitle || item.title,
    {
      sourceKind,
      hints: {
        quotedText: existing.quotedText,
        quotedAuthor: existing.quotedAuthor,
        channel: existing.channel,
        description: existing.description,
      },
    }
  );

  const aiExtract = aiOutcome.data;
  let tier2Applied = existing.tier2Applied;
  if (aiExtract) {
    const applied = await applyItemTier2Updates(
      item,
      aiExtract.improvedTitle || existing.fetchedTitle,
      sourceKind,
      aiExtract
    );
    if (applied.length > 0) {
      tier2Applied = [...new Set([...(tier2Applied || []), ...applied])];
    }
  }

  const now = Date.now();
  const record: ItemEnrichment = {
    ...existing,
    summary: aiExtract?.summary,
    fetchedTitle: aiExtract?.improvedTitle || existing.fetchedTitle,
    aiTags: aiExtract?.tags,
    aiKeyPoints: aiExtract?.keyPoints,
    aiStatus: aiOutcome.status,
    aiError: aiOutcome.error,
    aiAt: aiOutcome.at,
    tier2Applied,
    updated_at: now,
  };
  await putEnrichment(record);

  return {
    itemId,
    status: 'ok',
    message: aiOutcome.status === 'ok' ? undefined : aiOutcome.status,
  };
}

async function resolveBatchItems(options: EnrichBatchOptions): Promise<Item[]> {
  const all = await getAllItems();
  const bookmarks = all.filter((i) => i.url?.trim());

  if (options.itemIds?.length) {
    const set = new Set(options.itemIds);
    return bookmarks.filter((i) => set.has(i.id));
  }

  if (options.collectionId) {
    return bookmarks.filter((i) => (i.collectionIds || []).includes(options.collectionId!));
  }

  return bookmarks;
}

function scoreForSmart(item: Item, enrichment?: ItemEnrichment): number {
  const local = getLocalTextBundle(item);
  let score = 0;
  if (!enrichment || enrichment.status === 'none') score += 100;
  if (enrichment?.status === 'stale' || enrichment?.status === 'failed') score += 80;
  if (local.length < 80) score += 50;
  if (titleLooksWeak(item.title, item.url)) score += 30;
  return score;
}

export async function enrichBatch(options: EnrichBatchOptions = {}): Promise<EnrichBatchResult> {
  const runId = crypto.randomUUID();
  const mode = options.mode ?? 'smart';
  const cap =
    options.maxItems ??
    (mode === 'full' ? ENRICHMENT_DEFAULTS.fullCap : ENRICHMENT_DEFAULTS.smartCap);

  let items = await resolveBatchItems(options);
  const enrichmentMap = new Map(
    (await getAllEnrichments()).map((e) => [e.itemId, e])
  );

  if (mode === 'smart' && !options.force) {
    items = items
      .map((item) => ({
        item,
        score: scoreForSmart(item, enrichmentMap.get(item.id)),
        elig: checkEligibility(item, enrichmentMap.get(item.id), { force: false }),
      }))
      .filter(({ elig }) => elig.eligible && !elig.skipFetch)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }

  items = items.slice(0, cap);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const itemResults: EnrichmentResult[] = [];
  const concurrency = ENRICHMENT_DEFAULTS.concurrency;
  let index = 0;

  const runWorker = async () => {
    while (index < items.length) {
      if (options.signal?.aborted) break;
      const i = index++;
      const item = items[i];
      options.onProgress?.({
        runId,
        processed,
        skipped,
        failed,
        total: items.length,
        currentItemId: item.id,
      });

      try {
        const result = await enrichOne(item.id, {
          force: options.force,
          signal: options.signal,
          refetchCompare: options.refetchCompare,
        });
        if (options.collectItemResults) itemResults.push(result);
        if (result.skipped || result.status === 'skipped') skipped++;
        else if (result.status === 'ok') processed++;
        else failed++;
      } catch {
        failed++;
        if (options.collectItemResults) {
          itemResults.push({
            itemId: item.id,
            status: 'failed',
            message: 'enrich_batch_error',
          });
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );

  options.onProgress?.({
    runId,
    processed,
    skipped,
    failed,
    total: items.length,
  });

  return {
    runId,
    processed,
    skipped,
    failed,
    cancelled: options.signal?.aborted,
    itemResults: options.collectItemResults ? itemResults : undefined,
  };
}

export async function deleteEnrichmentForItem(itemId: string): Promise<void> {
  await deleteRawBody(itemId);
  await deleteEnrichment(itemId);
}

export async function markStaleIfRawMissing(itemId: string): Promise<void> {
  const rec = await getEnrichment(itemId);
  if (!rec?.hasRawBody || !rec.rawRef) return;
  const raw = await loadRawBody(rec.rawRef);
  if (raw === null) {
    await putEnrichment({
      ...rec,
      status: 'stale',
      updated_at: Date.now(),
    });
  }
}
