import type { Item } from '../db';
import { getAllItems, getItem, normalizeBookmarkUrl, updateItem } from '../db';
import {
  checkEligibility,
  classifySourceKind,
  getLocalTextBundle,
  hashText,
  shouldUpgradeBookmarkTitle,
  titleLooksWeak,
} from './eligibility';
import { ensurePlatformTagOnExtract, mergePlatformTag } from './platformTags';
import { failureFieldsFromEnrichment } from './failureLabels';
import { extractEnrichmentWithAI, type EnrichmentAIExtract } from './aiExtract';
import {
  describeEnrichmentError,
  formatEnrichmentFailureMessage,
} from './errorMessages';
import {
  attachFetchRedirectFields,
  buildRedirectContext,
  shouldFlagRedirectReview,
  shouldRunRedirectAiVerdict,
  urlsEquivalentForRedirect,
  type RedirectContext,
} from './fetchRedirect';
import { runRedirectAiVerdict, type RedirectAiVerdictData, type RedirectAiVerdictOutcome } from './redirectAiVerdict';
import { resolveSummaryRedirectPromptMode } from './prompts';
import {
  explainHardFetchFailure,
  explainSoftFetchSuspect,
  isFetchBodySubstantive,
  isVideoTabBodyUsable,
  rewriteDocumentFetchUrl,
  stripProviderWrapper,
} from './fetchQuality';
import {
  isSyndicationFetchSourceId,
  isXStatusUrl,
  isXTabFetchAcceptable,
  isXTweetUnavailableBody,
  isXTabChromeDominant,
  looksLikeSyndicationXMarkdown,
  shouldKeepSyndicationOverTab,
} from './xFetchHeuristics';
import { enrichMarkdownWithVision, needsImageVisionEnrichment } from './imageVision';
import { buildMediaPrimaryMechanicalSummary, isMediaPrimaryXContent } from './xMedia';
import { hybridProvider } from './providers/hybrid';
import { jinaProvider } from './providers/jina';
import { fetchAuthenticatedPdf, looksLikeRemotePdf } from './providers/local';
import { noopProvider } from './providers/noop';
import type { FetchProvider, FetchProviderResult } from './providers/types';
import { timedAbortSignal } from './fetchAbort';
import {
  fetchThroughBrowserService,
  fetchFromOpenTab,
  findTabForUrl,
  hasDirectBrowserTabAccess,
  openEphemeralTabAndExtract,
  resolveTabSessionForUrl,
  shouldUseEphemeralTab,
} from './tabSessionExtract';
import { prefersBrowserTabFirst, skipHeadlessAfterTabMiss } from './urlPolicy';
import {
  parseFetchedContent,
} from './parse';
import { buildReferenceIndex, referencesForMeta } from './referenceIndex';
import { appendXLinkFollowBodies } from './providers/xLinkFollow';
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
  EnrichmentAIStatus,
  EnrichmentErrorCode,
  EnrichmentReference,
  EnrichmentResult,
  ItemEnrichment,
} from './types';
import { ENRICHMENT_DEFAULTS } from './types';
import {
  isPipelineDebugEnabled,
  PipelineDebugCollector,
  type PipelineDebugRedirect,
  saveEnrichPipelineDebug,
} from './pipelineDebug';
import type { PipelineDebugAICall } from '../ai/callAudit';
import { acquireContentV2, acquisitionResultToFetchResult } from '../acquisition/service';
import type { FetchEngine } from '../acquisition/types';

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
export { getEnrichment, getEnrichmentsForItemIds, getAllEnrichments } from './storage';
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
  references?: EnrichmentReference[] | null;
  redirect?: PipelineDebugRedirect | null;
  aiCalls?: PipelineDebugAICall[] | null;
  markdown: string;
  cleanMarkdown: string;
}): string {
  const header = {
    url: opts.url,
    providerId: opts.providerId,
    fetchSourceId: opts.fetchSourceId ?? null,
    ai: opts.ai ?? null,
    references: opts.references?.length ? referencesForMeta(opts.references) : null,
    redirect: opts.redirect ?? null,
    aiCalls: opts.aiCalls?.length ? opts.aiCalls : null,
    savedAt: new Date().toISOString(),
  };
  const body = opts.cleanMarkdown.trim() || opts.markdown.trim();
  return `<!-- enrichment-meta\n${JSON.stringify(header, null, 2)}\n-->\n\n${body}`;
}

function buildRedirectDebugSnapshot(input: {
  redirectContext: RedirectContext;
  verdictEligible: boolean;
  verdictOutcome?: RedirectAiVerdictOutcome;
  verdictMs?: number;
  redirectVerdict?: RedirectAiVerdictData;
  summaryPromptMode: ReturnType<typeof resolveSummaryRedirectPromptMode>;
  aiExtract?: EnrichmentAIExtract;
  pendingFetchReview?: boolean;
}): PipelineDebugRedirect | undefined {
  const { redirectContext } = input;
  if (redirectContext.redirectClass === 'none' && !input.verdictEligible) return undefined;

  let verdictStatus: string | undefined = input.verdictOutcome?.status;
  if (!input.verdictEligible) verdictStatus = 'skipped:not_eligible';
  const verdict = input.redirectVerdict;

  return {
    redirectClass: redirectContext.redirectClass,
    resourceMismatch: redirectContext.resourceMismatch ?? false,
    requestedUrl: redirectContext.requestedUrl,
    finalUrl: redirectContext.finalUrl,
    verdictEligible: input.verdictEligible,
    verdictStatus,
    verdictMs: input.verdictMs || undefined,
    verdictPageMatchesBookmark: verdict?.pageMatchesBookmark,
    verdictFetchedPageKind: verdict?.fetchedPageKind,
    verdictRedirectNote: verdict?.redirectNote?.trim() || undefined,
    summaryPromptMode: input.summaryPromptMode,
    summaryPageMatchesBookmark: input.aiExtract?.pageMatchesBookmark,
    summaryRedirectNote: input.aiExtract?.redirectNote?.trim() || undefined,
    pendingFetchReview: input.pendingFetchReview,
  };
}

function annotateFailureFields(record: ItemEnrichment): ItemEnrichment {
  if (record.status !== 'failed') {
    return { ...record, failureStage: undefined, failureCategory: undefined };
  }
  return { ...record, ...failureFieldsFromEnrichment(record) };
}

async function applyItemTier2Updates(
  item: Item,
  parsedTitle: string | undefined,
  sourceKind: ReturnType<typeof classifySourceKind>,
  ai?: { improvedTitle?: string; tags?: string[] },
  previewImage?: string
): Promise<string[]> {
  const applied: string[] = [];
  const updates: Partial<Item> = {};
  const meta = { ...(item.metadata || {}) };
  let metadataChanged = false;

  const titleCandidate = ai?.improvedTitle?.trim() || parsedTitle?.trim();
  if (
    titleCandidate &&
    shouldUpgradeBookmarkTitle(item.title, titleCandidate, item.url)
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

  const platformMerge = mergePlatformTag(updates.tags ?? item.tags, item.url, ai?.tags);
  if (platformMerge.added) {
    updates.tags = platformMerge.tags;
    applied.push('tags');
  }
  if (platformMerge.platform && !meta.platform) {
    meta.platform = platformMerge.platform;
    metadataChanged = true;
    applied.push('metadata.platform');
  } else if (sourceKind === 'x' && !meta.platform) {
    meta.platform = 'x';
    metadataChanged = true;
    applied.push('metadata.platform');
  } else if (sourceKind === 'video' && !meta.platform) {
    try {
      const host = new URL(item.url).hostname;
      if (host.includes('youtube') || host.includes('youtu.be')) meta.platform = 'youtube';
      else meta.platform = 'video';
    } catch {
      meta.platform = 'video';
    }
    metadataChanged = true;
    applied.push('metadata.platform');
  }

  if (previewImage && meta.previewImage !== previewImage) {
    meta.previewImage = previewImage;
    metadataChanged = true;
    applied.push('metadata.previewImage');
  }

  if (metadataChanged) {
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

/** Cap huge PDFs / pages — same idea as X link-follow (10k/link), but higher for direct bookmarks. */
function truncateFetchedMarkdown(
  markdown: string,
  maxChars: number = ENRICHMENT_DEFAULTS.maxFetchMarkdownChars
): { markdown: string; truncated: boolean; originalChars: number } {
  const originalChars = markdown.length;
  if (originalChars <= maxChars) {
    return { markdown, truncated: false, originalChars };
  }
  const suffix = `\n\n---\n\n[Content truncated for enrichment — ${originalChars.toLocaleString()} characters in source, using first ${maxChars.toLocaleString()}.]`;
  return {
    markdown: markdown.slice(0, maxChars) + suffix,
    truncated: true,
    originalChars,
  };
}

function hasValuablePriorEnrichment(existing?: ItemEnrichment | null): boolean {
  if (!existing || existing.status !== 'ok') return false;
  if (existing.aiStatus === 'ok' && existing.summary?.trim()) return true;
  return (existing.snippet?.trim().length ?? 0) >= ENRICHMENT_DEFAULTS.minUsefulSnippetChars;
}

/** True when cached fetch text exists but is below the normal AI extract minimum. */
export function isSnippetTooShortForAI(
  enrichment?: Pick<ItemEnrichment, 'snippet'> | null
): boolean {
  const len = enrichment?.snippet?.trim().length ?? 0;
  return len > 0 && len < ENRICHMENT_DEFAULTS.minUsefulSnippetChars;
}

function errorCodeAfterAiFailure(
  softCode: EnrichmentErrorCode | undefined,
  aiStatus: EnrichmentAIStatus
): EnrichmentErrorCode {
  if (
    softCode &&
    (aiStatus === 'empty_response' || aiStatus === 'content_too_short')
  ) {
    return softCode;
  }
  if (aiStatus === 'empty_response' || aiStatus === 'content_too_short') {
    return 'parse_empty';
  }
  return 'parse_empty';
}

async function tabSessionFetchResult(
  url: string,
  mode: 'active' | 'any',
  tabId?: number
): Promise<{ result: FetchProviderResult | null; error?: FetchProviderResult }> {
  const tab = await fetchFromOpenTab(url, mode, tabId);
  if (!tab.ok || !tab.markdown?.trim()) {
    return {
      result: null,
      error: {
        ok: false,
        errorCode: tab.errorCode ?? 'parse_empty',
        error: tab.error ?? 'Could not read content from the open tab',
        fetchSourceId: 'tab-session',
      },
    };
  }
  const markdown = tab.markdown.trim();
  if (isXTweetUnavailableBody(markdown)) {
    return {
      result: null,
      error: {
        ok: false,
        errorCode: 'parse_empty',
        error: 'tweet_unavailable',
        fetchSourceId: 'tab-session',
      },
    };
  }
  if (isXTabChromeDominant(markdown, url)) {
    return {
      result: null,
      error: {
        ok: false,
        errorCode: 'parse_empty',
        error: 'X tab page is mostly UI chrome — syndication fetch preferred',
        fetchSourceId: 'tab-session',
      },
    };
  }
  return {
    result: attachFetchRedirectFields(
      {
        ok: true,
        markdown,
        title: tab.title,
        previewImage: tab.previewImage,
        fetchSourceId: tab.fetchSourceId,
        rawBytesApprox: new TextEncoder().encode(markdown).length,
      },
      url,
      tab.pageUrl
    ),
  };
}

async function tryOpenTabFetch(
  url: string,
  tabId?: number,
  options?: { allowEphemeral?: boolean; windowId?: number; signal?: AbortSignal }
): Promise<{ result: FetchProviderResult | null; error?: FetchProviderResult }> {
  if (!hasDirectBrowserTabAccess()) {
    const remote = await fetchThroughBrowserService(url, {
      tabId,
      mode: 'any',
      allowEphemeral: options?.allowEphemeral,
      windowId: options?.windowId,
      signal: options?.signal,
    });
    if (!remote.ok || !remote.markdown?.trim()) {
      return {
        result: null,
        error: {
          ok: false,
          errorCode: remote.errorCode ?? 'parse_empty',
          error: remote.error ?? 'Could not read content from the browser tab',
          fetchSourceId: 'tab-session',
        },
      };
    }
    return {
      result: attachFetchRedirectFields(
        {
          ok: true,
          markdown: remote.markdown.trim(),
          title: remote.title,
          previewImage: remote.previewImage,
          fetchSourceId: remote.fetchSourceId,
          rawBytesApprox: new TextEncoder().encode(remote.markdown).length,
        },
        url,
        remote.pageUrl
      ),
    };
  }

  const tried = new Set<number>();
  let lastError: FetchProviderResult | undefined;

  const attempt = async (id: number): Promise<FetchProviderResult | null> => {
    if (tried.has(id)) return null;
    tried.add(id);
    const tab = await tabSessionFetchResult(url, 'any', id);
    if (tab.error) lastError = tab.error;
    return tab.result ?? null;
  };

  if (typeof tabId === 'number') {
    const direct = await attempt(tabId);
    if (direct) return { result: direct };
  }

  const active = await findTabForUrl(url, 'active');
  if (active?.id) {
    const fromActive = await attempt(active.id);
    if (fromActive) return { result: fromActive };
  }

  const any = await findTabForUrl(url, 'any');
  if (any?.id) {
    const fromAny = await attempt(any.id);
    if (fromAny) return { result: fromAny };
  }

  if (options?.allowEphemeral) {
    const ephemeral = await openEphemeralTabAndExtract(url, options.signal);
    if (!ephemeral.ok || !ephemeral.markdown?.trim()) {
      lastError = {
        ok: false,
        errorCode: ephemeral.errorCode ?? 'parse_empty',
        error: ephemeral.error ?? 'Could not read content from background tab',
        fetchSourceId: 'tab-session',
      };
    } else {
      const markdown = ephemeral.markdown.trim();
      if (isXTweetUnavailableBody(markdown)) {
        lastError = {
          ok: false,
          errorCode: 'parse_empty',
          error: 'tweet_unavailable',
          fetchSourceId: 'tab-session',
        };
      } else if (isXTabChromeDominant(markdown, url)) {
        lastError = {
          ok: false,
          errorCode: 'parse_empty',
          error: 'X tab page is mostly UI chrome — syndication fetch preferred',
          fetchSourceId: 'tab-session',
        };
      } else {
      return {
        result: attachFetchRedirectFields(
          {
            ok: true,
            markdown,
            title: ephemeral.title,
            previewImage: ephemeral.previewImage,
            fetchSourceId: ephemeral.fetchSourceId,
            rawBytesApprox: new TextEncoder().encode(markdown).length,
          },
          url,
          ephemeral.pageUrl
        ),
      };
      }
    }
  }

  return { result: null, error: lastError };
}

export function acceptTabFetchResult(result: FetchProviderResult, url: string): boolean {
  if (!result.ok || !result.markdown?.trim()) return false;
  const clean = stripProviderWrapper(result.markdown);
  if (classifySourceKind(url) === 'x') {
    return isXTabFetchAcceptable(clean, url);
  }
  if (classifySourceKind(url) === 'video') {
    return isVideoTabBodyUsable(clean, url, result.title);
  }
  return isFetchBodySubstantive(clean, { url, title: result.title });
}

function headlessSyndicationIsGoodEnough(
  headless: FetchProviderResult,
  url: string,
  cleanMarkdown: string
): boolean {
  return (
    headlessResultIsGoodEnough(headless, url, cleanMarkdown) &&
    isSyndicationFetchSourceId(headless.fetchSourceId)
  );
}

export function shouldRetryWithBrowserTab(
  headless: FetchProviderResult,
  url: string,
  cleanMarkdown?: string
): boolean {
  if (classifySourceKind(url) === 'x') {
    if (headless.ok && isSyndicationFetchSourceId(headless.fetchSourceId)) return false;
    // Public syndication failed or returned an unusable X shell. Try the
    // dashboard-bound authenticated session before declaring private/deleted.
    if (!headless.ok) return true;
  }

  if (prefersBrowserTabFirst(url)) return true;

  if (!headless.ok) {
    const code = headless.errorCode;
    return code === 'bot_blocked' || code === 'auth_required' || code === 'parse_empty';
  }

  if (!cleanMarkdown?.trim()) return true;

  return !isFetchBodySubstantive(cleanMarkdown, { url, title: headless.title });
}

export function shouldAllowEphemeralTabRetry(
  url: string,
  alreadyAllowed: boolean
): boolean {
  return alreadyAllowed || classifySourceKind(url) !== 'video';
}

function headlessResultIsGoodEnough(
  headless: FetchProviderResult,
  url: string,
  cleanMarkdown: string
): boolean {
  if (!headless.ok || !cleanMarkdown.trim()) return false;
  return isFetchBodySubstantive(cleanMarkdown, { url, title: headless.title });
}

function restoreSavedDocumentIdentity(
  result: FetchProviderResult,
  savedUrl: string,
  contentUrl: string
): FetchProviderResult {
  if (savedUrl === contentUrl) return result;

  const finalUrl = result.finalUrl?.trim();
  if (finalUrl && !urlsEquivalentForRedirect(contentUrl, finalUrl)) {
    return attachFetchRedirectFields(
      { ...result, redirectContext: undefined, requestedUrl: undefined },
      savedUrl,
      finalUrl
    );
  }

  return {
    ...result,
    requestedUrl: savedUrl,
    finalUrl: savedUrl,
    redirectContext: buildRedirectContext(savedUrl, savedUrl),
  };
}

/** All URL processing starts in Chrome's authenticated browsing context. */
export function shouldUseBrowserSessionFirstForUrl(url: string): boolean {
  return Boolean(url.trim());
}

async function resolveItemFetch(
  item: Item,
  pending: ItemEnrichment,
  sourceKind: ReturnType<typeof classifySourceKind>,
  options?: {
    force?: boolean;
    signal?: AbortSignal;
    preferTabSession?: boolean;
    tabId?: number;
    /** Skip headless — open/match tab (incl. ephemeral) only. */
    tabSessionOnly?: boolean;
    browserWindowId?: number;
    debug?: PipelineDebugCollector;
  }
): Promise<FetchProviderResult> {
  const userSignal = options?.signal;
  const overall = timedAbortSignal(ENRICHMENT_DEFAULTS.fetchOverallTimeoutMs, userSignal);
  const contentFetchUrl = rewriteDocumentFetchUrl(item.url);

  const runTabFetch = async (allowEphemeral: boolean) => {
    const tabPhase = timedAbortSignal(ENRICHMENT_DEFAULTS.tabFetchTimeoutMs, overall.signal);
    try {
      // Chrome's PDF viewer has no useful page DOM. "Tab first" for a PDF
      // therefore means downloading its bytes inside an authenticated,
      // same-origin browser page and decoding them with the shared PDF parser.
      if (looksLikeRemotePdf(item.url)) {
        const pdf = await fetchAuthenticatedPdf(item.url, {
          requestedUrl: item.url,
          tabId: options?.tabId,
          windowId: options?.browserWindowId,
          signal: tabPhase.signal,
        });
        return pdf?.ok
          ? { result: pdf }
          : { result: null, error: pdf ?? tabSessionEmptyError() };
      }
      const attempt = await tryOpenTabFetch(contentFetchUrl, options?.tabId, {
        allowEphemeral,
        windowId: options?.browserWindowId,
        signal: tabPhase.signal,
      });
      return {
        ...attempt,
        result: attempt.result
          ? restoreSavedDocumentIdentity(attempt.result, item.url, contentFetchUrl)
          : null,
      };
    } finally {
      tabPhase.dispose();
    }
  };

  const runHeadless = async () => {
    const headlessPhase = timedAbortSignal(ENRICHMENT_DEFAULTS.headlessTimeoutMs, overall.signal);
    try {
      return await activeProvider.fetchUrl({
        url: item.url,
        normalizedUrl: pending.normalizedUrl,
        hints: {
          sourceKind,
          force: options?.force,
          requestedUrl: item.url,
          browserWindowId: options?.browserWindowId,
          browserTabId: options?.tabId,
          browserSessionAttempted: true,
        },
        signal: headlessPhase.signal,
      });
    } finally {
      headlessPhase.dispose();
    }
  };

  const expandAcceptedTabResult = async (
    result: FetchProviderResult
  ): Promise<FetchProviderResult> => {
    if (sourceKind !== 'x' || !result.markdown?.trim()) return result;
    const markdown = await appendXLinkFollowBodies(result.markdown, item.url, {
      signal: overall.signal,
      browserWindowId: options?.browserWindowId,
    });
    return {
      ...result,
      markdown,
      rawBytesApprox: new TextEncoder().encode(markdown).length,
    };
  };

  const tabSessionEmptyError = (): FetchProviderResult => ({
    ok: false,
    errorCode: 'parse_empty',
    error: 'Could not read page in browser tab',
    fetchSourceId: 'tab-session',
  });

  try {
    const debug = options?.debug;
    const isXStatus = classifySourceKind(item.url) === 'x';
    let browserFirstError: FetchProviderResult | undefined;
    if (contentFetchUrl !== item.url) {
      debug?.phase('document_representation', true, contentFetchUrl);
    }
    const allowEphemeralTab = Boolean(
      options?.tabSessionOnly || options?.preferTabSession || shouldUseEphemeralTab(item.url)
    );
    const tabFirst =
      !options?.tabSessionOnly &&
      shouldUseBrowserSessionFirstForUrl(item.url);

    if (options?.tabSessionOnly) {
      debug?.phase('tab_session_only_start');
      const tabOnly = await runTabFetch(true);
      debug?.phase(
        'tab_session_only',
        !!tabOnly.result?.ok,
        tabOnly.result?.fetchSourceId ?? tabOnly.error?.fetchSourceId
      );
      if (tabOnly.result && acceptTabFetchResult(tabOnly.result, contentFetchUrl)) {
        return expandAcceptedTabResult(tabOnly.result);
      }
      if (!isXStatus) {
        return tabOnly.error ?? tabSessionEmptyError();
      }
      debug?.phase('tab_session_only_x_fallback', true, 'syndication');
    }

    if (tabFirst) {
      debug?.phase('tab_first_start');
      const tabAttempt = await runTabFetch(true);
      debug?.phase(
        'tab_first',
        !!tabAttempt.result?.ok,
        tabAttempt.result?.fetchSourceId ?? tabAttempt.error?.fetchSourceId
      );
      if (tabAttempt.result && acceptTabFetchResult(tabAttempt.result, contentFetchUrl)) {
        return expandAcceptedTabResult(tabAttempt.result);
      }
      if (tabAttempt.result && isXStatus) {
        debug?.phase('tab_first_rejected', false, 'x_not_acceptable');
      }
      browserFirstError = tabAttempt.error ?? (
        tabAttempt.result
          ? {
              ok: false,
              errorCode: 'parse_empty',
              error: 'Authenticated browser content did not pass the content quality check',
              fetchSourceId: tabAttempt.result.fetchSourceId ?? 'tab-session',
            }
          : undefined
      );
      if (skipHeadlessAfterTabMiss(item.url)) {
        return tabAttempt.error ?? tabSessionEmptyError();
      }
    } else if (!isXStatus && classifySourceKind(item.url) !== 'video') {
      debug?.phase('tab_quick_start');
      const quickTab = await runTabFetch(false);
      debug?.phase(
        'tab_quick',
        !!quickTab.result?.ok,
        quickTab.result?.fetchSourceId ?? quickTab.error?.fetchSourceId
      );
      if (quickTab.result && acceptTabFetchResult(quickTab.result, contentFetchUrl)) {
        return expandAcceptedTabResult(quickTab.result);
      }
    } else {
      debug?.phase(
        'tab_quick_skipped',
        true,
        isXStatus ? 'x_syndication_first' : 'video_jina_first'
      );
    }

    debug?.phase('headless_start');
    const headless = await runHeadless();
    debug?.phase('headless', headless.ok, headless.fetchSourceId);
    if (headless.ok && headless.markdown) {
      const clean = stripProviderWrapper(headless.markdown);
      if (headlessResultIsGoodEnough(headless, contentFetchUrl, clean)) return headless;
    }

    const headlessClean =
      headless.ok && headless.markdown ? stripProviderWrapper(headless.markdown) : undefined;

    if (
      headlessClean &&
      headlessSyndicationIsGoodEnough(headless, contentFetchUrl, headlessClean)
    ) {
      return headless;
    }

    // The default route already completed one authenticated browser attempt.
    // Do not reopen the same page after the provider fallback.
    if (tabFirst) {
      if (!headless.ok && browserFirstError?.error) {
        return {
          ...headless,
          errorCode: browserFirstError.errorCode ?? headless.errorCode,
          error: `Browser session: ${browserFirstError.error}. Provider fallback: ${headless.error ?? 'no usable content'}`,
        };
      }
      return headless;
    }

    if (!shouldRetryWithBrowserTab(headless, contentFetchUrl, headlessClean)) {
      return headless;
    }

    if (
      classifySourceKind(item.url) === 'x' &&
      headless.ok &&
      isSyndicationFetchSourceId(headless.fetchSourceId)
    ) {
      return headless;
    }

    // Legacy/provider-first callers may still request a browser retry here.
    const allowEphemeralRetry = shouldAllowEphemeralTabRetry(item.url, allowEphemeralTab);
    const tabRetry = await runTabFetch(allowEphemeralRetry);
    debug?.phase(
      'tab_retry',
      !!tabRetry.result?.ok,
      tabRetry.result?.fetchSourceId ?? tabRetry.error?.fetchSourceId
    );
    if (tabRetry.result) {
      const tabClean = tabRetry.result.markdown
        ? stripProviderWrapper(tabRetry.result.markdown)
        : '';
      if (isXStatus) {
        if (headless.ok && headlessClean && shouldKeepSyndicationOverTab(headless, tabClean, item.url)) {
          return headless;
        }
        if (tabClean && isXTweetUnavailableBody(tabClean)) {
          if (headless.ok) return headless;
          return {
            ok: false,
            errorCode: 'parse_empty',
            error: 'tweet_unavailable',
            fetchSourceId: 'tab-session',
          };
        }
        if (acceptTabFetchResult(tabRetry.result, contentFetchUrl)) {
          return expandAcceptedTabResult(tabRetry.result);
        }
        return headless;
      }
      if (tabClean && isXTweetUnavailableBody(tabClean)) {
        if (headless.ok) return headless;
        return {
          ok: false,
          errorCode: 'parse_empty',
          error: 'tweet_unavailable',
          fetchSourceId: 'tab-session',
        };
      }
      if (tabClean && isXTabChromeDominant(tabClean, item.url)) {
        if (headless.ok) return headless;
      } else if (shouldKeepSyndicationOverTab(headless, tabClean, item.url)) {
        return headless;
      } else if (
        classifySourceKind(item.url) === 'x' &&
        !headless.ok &&
        headless.errorCode === 'parse_empty' &&
        !looksLikeSyndicationXMarkdown(tabClean)
      ) {
        return headless;
      } else if (acceptTabFetchResult(tabRetry.result, contentFetchUrl)) {
        return tabRetry.result;
      } else {
        debug?.phase('tab_retry_rejected', false, 'not_substantive');
        return headless;
      }
    }

    if (
      classifySourceKind(item.url) === 'x' &&
      tabRetry.error?.error === 'tweet_unavailable'
    ) {
      return tabRetry.error;
    }

    if (
      tabRetry.error &&
      options?.preferTabSession &&
      classifySourceKind(item.url) === 'x'
    ) {
      return tabRetry.error;
    }

    return headless;
  } finally {
    overall.dispose();
  }
}

async function preservePriorOnSuspiciousFetch(
  item: Item,
  existing: ItemEnrichment,
  pending: ItemEnrichment,
  reason: EnrichmentErrorCode,
  suspiciousMarkdown?: string,
  deferPostProcess = false
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
  await putEnrichment(
    {
      ...existing,
      attempts: pending.attempts,
      lastErrorCode: reason,
      pendingFetchReview: true,
      pendingFetchReviewReason: reason,
      reviewRawRef,
      updated_at: now,
    },
    { deferPostProcess }
  );
  return {
    itemId: item.id,
    status: 'ok',
    skipped: true,
    message: `prior_kept_${reason}`,
  };
}

export async function enrichOne(
  itemId: string,
  options?: {
    /** Acquisition implementation pinned by the durable pipeline job. */
    fetchEngine?: FetchEngine;
    force?: boolean;
    signal?: AbortSignal;
    refetchCompare?: boolean;
    /** Use the open browser tab when URL matches (side-panel save, auth pages). */
    preferTabSession?: boolean;
    /** Tab captured at save time — avoids side-panel active-tab lookup issues. */
    tabId?: number;
    /** Browser tab only (skip headless). Used by Inspector “Fetch in browser”. */
    tabSessionOnly?: boolean;
    /** Chrome window reserved for temporary browser-session fetch tabs. */
    browserWindowId?: number;
    /** Fetch and parse only — preserve existing AI fields; no extractEnrichmentWithAI. */
    skipAi?: boolean;
    /** Batch import: defer embed + classify queue until batch post-process. */
    deferPostProcess?: boolean;
  }
): Promise<EnrichmentResult> {
  const deferPostProcess = options?.deferPostProcess === true;
  const fetchEngine = options?.fetchEngine ?? 'legacy';
  const providerId = fetchEngine === 'v2' ? 'acquisition-v2' : activeProvider.id;
  const saveEnrichment = (record: ItemEnrichment) =>
    putEnrichment(record, { deferPostProcess });
  const item = await getItem(itemId);
  if (!item?.url) {
    return { itemId, status: 'failed', errorCode: 'excluded', message: 'no_item' };
  }

  let preferTabSession: boolean;
  let tabId: number | undefined;
  if (options?.tabSessionOnly) {
    preferTabSession = Boolean(options?.preferTabSession);
    tabId = options?.tabId;
  } else if (fetchEngine === 'legacy' && isXStatusUrl(item.url) && options?.preferTabSession !== true) {
    preferTabSession = false;
    tabId = undefined;
  } else {
    const resolvedTabSession = await resolveTabSessionForUrl(item.url, options?.tabId);
    preferTabSession = options?.preferTabSession ?? resolvedTabSession.preferTabSession;
    tabId = options?.tabId ?? resolvedTabSession.tabId;
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
    providerId,
    attempts,
    sourceKind,
    hasRawBody: false,
    updated_at: now,
  };
  await saveEnrichment(pending);

  const debugEnabled = isPipelineDebugEnabled();
  const runStart = debugEnabled ? Date.now() : 0;
  const collector = debugEnabled ? new PipelineDebugCollector() : undefined;
  let fetchMs = 0;
  let aiMs = 0;
  let redirectDebug: PipelineDebugRedirect | undefined;
  const aiCalls: PipelineDebugAICall[] = [];
  const aiCallRecord = debugEnabled
    ? (record: PipelineDebugAICall) => aiCalls.push(record)
    : undefined;
  let debugOutcome:
    | {
        enrichStatus: string;
        aiStatus?: string;
        errorCode?: string;
        fetchSourceId?: string;
      }
    | undefined;

  const flushDebug = (): void => {
    if (!debugEnabled || !debugOutcome || !item.url) return;
    void saveEnrichPipelineDebug({
      itemId: item.id,
      url: item.url,
      collector,
      fetchMs,
      aiMs,
      totalMs: Date.now() - runStart,
      fetchSourceId: debugOutcome.fetchSourceId,
      enrichStatus: debugOutcome.enrichStatus,
      aiStatus: debugOutcome.aiStatus,
      errorCode: debugOutcome.errorCode,
      attempts,
      redirect: redirectDebug,
      aiCalls: aiCalls.length ? aiCalls : undefined,
      options: {
        fetchEngine,
        preferTabSession,
        tabId,
        tabSessionOnly: options?.tabSessionOnly,
        skipAi: options?.skipAi,
      },
    });
  };

  try {
    const fetchStart = Date.now();
    let fetchResult: FetchProviderResult;
    if (fetchEngine === 'v2') {
      const acquisition = await acquireContentV2({
        itemId: item.id,
        url: item.url,
        normalizedUrl: pending.normalizedUrl,
        sourceKind,
        signal: options?.signal,
        preferredTabId: tabId,
        browserWindowId: options?.browserWindowId,
        tabSessionOnly: options?.tabSessionOnly,
      });
      fetchResult = acquisitionResultToFetchResult(acquisition);
    } else {
      fetchResult = await resolveItemFetch(item, pending, sourceKind, {
        force: options?.force,
        signal: options?.signal,
        preferTabSession,
        tabId,
        tabSessionOnly: options?.tabSessionOnly,
        browserWindowId: options?.browserWindowId,
        debug: collector,
      });
    }
    fetchMs = Date.now() - fetchStart;

    if (!fetchResult.ok || !fetchResult.markdown) {
      const errorCode = fetchResult.errorCode ?? 'provider_error';
      const lastErrorDetail = fetchResult.error?.trim() || undefined;
      if (existing && hasValuablePriorEnrichment(existing) && !options?.force) {
        debugOutcome = {
          enrichStatus: 'ok',
          errorCode,
          fetchSourceId: fetchResult.fetchSourceId,
        };
        flushDebug();
        return preservePriorOnSuspiciousFetch(item, existing, pending, errorCode, undefined, deferPostProcess);
      }
      const nextRetryAt =
        attempts < ENRICHMENT_DEFAULTS.maxAttempts
          ? now + ENRICHMENT_DEFAULTS.backoffBaseMs * Math.pow(2, attempts - 1)
          : undefined;
      const failed: ItemEnrichment = {
        ...pending,
        status: 'failed',
        lastErrorCode: errorCode,
        lastErrorDetail,
        fetchSourceId: fetchResult.fetchSourceId,
        fetchedAt: now,
        updated_at: now,
        nextRetryAt,
      };
      await saveEnrichment(annotateFailureFields(failed));
      debugOutcome = {
        enrichStatus: 'failed',
        errorCode,
        fetchSourceId: fetchResult.fetchSourceId,
      };
      flushDebug();
      return {
        itemId,
        status: 'failed',
        errorCode,
        message: describeEnrichmentError(errorCode, lastErrorDetail),
      };
    }

    let rawMarkdown = fetchResult.markdown ?? '';
    const truncated = truncateFetchedMarkdown(rawMarkdown);
    rawMarkdown = truncated.markdown;
    fetchResult = {
      ...fetchResult,
      markdown: rawMarkdown,
      rawBytesApprox: new TextEncoder().encode(rawMarkdown).length,
    };

    const cleanMarkdown = stripProviderWrapper(rawMarkdown);
    const qualityCtx = { url: item.url, title: fetchResult.title };
    const redirectContext =
      fetchResult.redirectContext ??
      buildRedirectContext(item.url, fetchResult.finalUrl ?? item.url);

    const hardFailure = explainHardFetchFailure(cleanMarkdown, qualityCtx);
    const softSuspect = hardFailure
      ? undefined
      : explainSoftFetchSuspect(cleanMarkdown, qualityCtx);

    let enrichMarkdown = cleanMarkdown;
    if (!hardFailure) {
      const mediaPrimaryBody =
        sourceKind === 'x' && isMediaPrimaryXContent(cleanMarkdown);
      if (!mediaPrimaryBody) {
        const visionStart = Date.now();
        enrichMarkdown = await enrichMarkdownWithVision(cleanMarkdown, {
          sourceKind,
          signal: options?.signal,
          audit: aiCallRecord ? { purpose: 'enrich_vision', record: aiCallRecord } : undefined,
        });
        if (enrichMarkdown.length > cleanMarkdown.length) {
          collector?.phase(
            'image_vision',
            true,
            `+${enrichMarkdown.length - cleanMarkdown.length} chars · ${Date.now() - visionStart}ms`
          );
        } else if (needsImageVisionEnrichment(cleanMarkdown, sourceKind)) {
          collector?.phase('image_vision', false, 'no_description');
        }
      } else {
        collector?.phase('image_vision', true, 'skipped:media-not-transcribed');
      }
    }

    const localBundle = getLocalTextBundle(item);
    const parsed = parseFetchedContent(
      enrichMarkdown,
      sourceKind,
      fetchResult.title
    );
    const references = hardFailure ? undefined : buildReferenceIndex(enrichMarkdown, item.url);

    let status: ItemEnrichment['status'] = 'ok';
    let lastErrorCode: EnrichmentErrorCode | undefined;
    let lastErrorDetail: string | undefined;

    if (hardFailure) {
      status = 'failed';
      lastErrorCode = hardFailure.code;
      lastErrorDetail = hardFailure.detail;
    }

    if (status === 'failed' && existing && hasValuablePriorEnrichment(existing) && !options?.force) {
      debugOutcome = {
        enrichStatus: 'ok',
        errorCode: lastErrorCode,
        fetchSourceId: fetchResult.fetchSourceId,
      };
      flushDebug();
      return preservePriorOnSuspiciousFetch(
        item,
        existing,
        pending,
        lastErrorCode ?? 'parse_empty',
        cleanMarkdown,
        deferPostProcess
      );
    }

    const textHash = hashText(localBundle);
    const contentHash = hashText(enrichMarkdown);
    const pageUnchanged =
      !hardFailure &&
      !options?.force &&
      existing?.status === 'ok' &&
      !!existing.contentHash &&
      existing.contentHash === contentHash;

    if (pageUnchanged && existing.aiStatus === 'ok') {
      const applied = await applyItemTier2Updates(
        item,
        parsed.title,
        sourceKind,
        undefined,
        fetchResult.previewImage
      );
      const tier2Applied = applied.length > 0
        ? [...new Set([...(existing.tier2Applied || []), ...applied])]
        : existing.tier2Applied;
      const keepRedirectReview = Boolean(
        existing.pendingFetchReview &&
        existing.pendingFetchReviewReason === 'url_redirect' &&
        redirectContext.redirectClass !== 'none'
      );
      await saveEnrichment({
        ...existing,
        textHash,
        snippet: parsed.snippet ?? existing.snippet,
        fetchedTitle: parsed.title ?? existing.fetchedTitle,
        fetchedAt: now,
        fetchSourceId: fetchResult.fetchSourceId,
        references: hardFailure ? existing.references : references,
        pendingFetchReview: keepRedirectReview,
        pendingFetchReviewReason: keepRedirectReview ? 'url_redirect' : undefined,
        reviewRawRef: undefined,
        tier2Applied,
        updated_at: now,
      });
      debugOutcome = {
        enrichStatus: 'ok',
        aiStatus: existing.aiStatus,
        fetchSourceId: fetchResult.fetchSourceId,
      };
      flushDebug();
      return {
        itemId: item.id,
        status: 'ok',
        skipped: true,
        message: 'content_unchanged',
      };
    }

    let aiOutcome: Awaited<ReturnType<typeof extractEnrichmentWithAI>> | undefined;
    let aiExtract: EnrichmentAIExtract | undefined;
    let redirectVerdict: RedirectAiVerdictData | undefined;
    let redirectVerdictOutcome: RedirectAiVerdictOutcome | undefined;
    let redirectVerdictMs = 0;
    let summaryPromptMode: ReturnType<typeof resolveSummaryRedirectPromptMode> = 'none';
    const verdictEligible = shouldRunRedirectAiVerdict(redirectContext);
    collector?.phase(
      'redirect_context',
      true,
      `${redirectContext.redirectClass}${redirectContext.resourceMismatch ? '+mismatch' : ''}`
    );
    const needsAiExtract =
      !options?.skipAi &&
      !hardFailure &&
      (!pageUnchanged || existing?.aiStatus !== 'ok');
    if (needsAiExtract) {
      const aiStart = Date.now();
      if (verdictEligible) {
        const verdictStart = Date.now();
        redirectVerdictOutcome = await runRedirectAiVerdict({
          redirectContext,
          bookmarkTitle: item.title,
          fetchedTitle: parsed.title || fetchResult.title,
          bodyPreview: parsed.snippet || enrichMarkdown,
          signal: options?.signal,
          audit: aiCallRecord ? { record: aiCallRecord } : undefined,
        });
        redirectVerdictMs = Date.now() - verdictStart;
        if (redirectVerdictOutcome.status === 'ok') {
          redirectVerdict = redirectVerdictOutcome.data;
        }
        const verdictDetail = redirectVerdict
          ? `${redirectVerdictOutcome.status} match=${redirectVerdict.pageMatchesBookmark} kind=${redirectVerdict.fetchedPageKind}`
          : redirectVerdictOutcome.error
            ? `${redirectVerdictOutcome.status}:${redirectVerdictOutcome.error.slice(0, 100)}`
            : redirectVerdictOutcome.status;
        collector?.phase(
          'redirect_ai_verdict',
          redirectVerdictOutcome.status === 'ok',
          verdictDetail
        );
      } else if (redirectContext.redirectClass !== 'none') {
        collector?.phase('redirect_ai_verdict', true, 'skipped:not_eligible');
      }
      summaryPromptMode = resolveSummaryRedirectPromptMode({ redirectContext, redirectVerdict });
      const mediaPrimary =
        sourceKind === 'x' && isMediaPrimaryXContent(enrichMarkdown);
      if (mediaPrimary) {
        const mechanical = buildMediaPrimaryMechanicalSummary(
          enrichMarkdown,
          item.title,
          item.url
        );
        const now = Date.now();
        aiOutcome = {
          status: 'ok',
          at: now,
          data: {
            summary: mechanical.summary,
            keyPoints: mechanical.keyPoints,
            tags: mechanical.tags,
            pageMatchesBookmark: true,
          },
        };
        aiExtract = aiOutcome.data;
        collector?.phase('ai_summary', true, 'mechanical:media-not-transcribed');
        aiMs = Date.now() - aiStart;
      } else {
        aiOutcome = await extractEnrichmentWithAI(
          parsed.snippet || enrichMarkdown,
          item.url,
          parsed.title || item.title,
          {
            sourceKind,
            signal: options?.signal,
            hints: {
              quotedText: parsed.quotedText,
              quotedAuthor: parsed.quotedAuthor,
              channel: parsed.channel,
              description: parsed.description,
              references,
              redirectContext,
              redirectVerdict,
            },
            audit: aiCallRecord ? { record: aiCallRecord } : undefined,
          }
        );
        aiExtract = aiOutcome.data;
        collector?.phase(
          'ai_summary',
          aiOutcome.status === 'ok' || aiOutcome.status === 'content_too_short' || aiOutcome.status === 'empty_response',
          `${summaryPromptMode}${aiExtract?.pageMatchesBookmark != null ? ` pmb=${aiExtract.pageMatchesBookmark}` : ''}`
        );
        aiMs = Date.now() - aiStart;
      }
      if (aiExtract?.improvedTitle) {
        parsed.title = aiExtract.improvedTitle;
      }

      if (aiOutcome.status === 'ok') {
        status = 'ok';
        lastErrorCode = undefined;
      } else if (aiOutcome.status === 'not_configured') {
        status = 'ok';
        lastErrorCode = undefined;
      } else if (
        aiOutcome.status === 'content_too_short' ||
        aiOutcome.status === 'empty_response'
      ) {
        const fallbackText = (parsed.snippet || enrichMarkdown || localBundle || item.title || '')
          .trim()
          .slice(0, ENRICHMENT_DEFAULTS.snippetMaxChars);
        if (fallbackText.length >= 8) {
          status = 'ok';
          lastErrorCode = undefined;
          parsed.snippet = fallbackText;
          if (!aiExtract?.summary && item.title?.trim()) {
            aiExtract = { summary: item.title.trim().slice(0, 500) };
          }
        } else {
          status = 'failed';
          lastErrorCode = errorCodeAfterAiFailure(softSuspect?.code, aiOutcome.status);
          lastErrorDetail =
            aiOutcome.error?.trim() ||
            (softSuspect ? softSuspect.detail : undefined);
        }
      } else {
        const fallbackText = (parsed.snippet || enrichMarkdown || '')
          .trim()
          .slice(0, ENRICHMENT_DEFAULTS.snippetMaxChars);
        if (fallbackText.length >= 8) {
          // Fetch succeeded. An AI backend failure must not discard or relabel
          // the fetched text; keep it available to keyword search and report
          // the AI failure separately through aiStatus/aiError.
          status = 'ok';
          lastErrorCode = undefined;
          parsed.snippet = fallbackText;
        } else {
          status = 'failed';
          lastErrorCode = errorCodeAfterAiFailure(softSuspect?.code, aiOutcome.status);
          lastErrorDetail =
            aiOutcome.error?.trim() ||
            (softSuspect ? softSuspect.detail : undefined);
        }
      }
    }

    aiExtract = ensurePlatformTagOnExtract(aiExtract, item.url);

    if (options?.skipAi && !hardFailure) {
      status = 'ok';
      lastErrorCode = undefined;
    }

    let rawRef: string | undefined;
    let rawBytes: number | undefined;
    let hasRawBody = false;

    let tier2Applied: string[] | undefined;
    if (status === 'ok') {
      tier2Applied = await applyItemTier2Updates(item, parsed.title, sourceKind, aiExtract, fetchResult.previewImage);
      if (tier2Applied.length === 0) tier2Applied = undefined;
    }

    if (truncated.truncated && status === 'ok') {
      const note = `Fetched body truncated (${truncated.originalChars.toLocaleString()} → ${ENRICHMENT_DEFAULTS.maxFetchMarkdownChars.toLocaleString()} chars)`;
      lastErrorDetail = lastErrorDetail ? `${lastErrorDetail}; ${note}` : note;
    }

    let pendingFetchReview = false;
    let pendingFetchReviewReason: EnrichmentErrorCode | undefined;
    if (status === 'ok' && redirectContext.redirectClass !== 'none') {
      const redirectReview = shouldFlagRedirectReview(redirectContext, {
        pageMatchesBookmark: aiExtract?.pageMatchesBookmark,
        redirectNote: aiExtract?.redirectNote,
        redirectVerdict: redirectVerdict
          ? {
              pageMatchesBookmark: redirectVerdict.pageMatchesBookmark,
              fetchedPageKind: redirectVerdict.fetchedPageKind,
              redirectNote: redirectVerdict.redirectNote,
              reason: redirectVerdict.reason,
            }
          : undefined,
      });
      const redirectNote =
        redirectReview.annotate?.trim() ||
        aiExtract?.redirectNote?.trim() ||
        redirectReview.reason?.trim();
      if (redirectNote) {
        lastErrorDetail = lastErrorDetail
          ? `${lastErrorDetail}; ${redirectNote}`
          : redirectNote;
      }
      if (redirectReview.flag) {
        pendingFetchReview = true;
        pendingFetchReviewReason = 'url_redirect';
      }
    }

    redirectDebug = buildRedirectDebugSnapshot({
      redirectContext,
      verdictEligible,
      verdictOutcome: redirectVerdictOutcome,
      verdictMs: redirectVerdictMs,
      redirectVerdict,
      summaryPromptMode,
      aiExtract,
      pendingFetchReview,
    });

    const diskBody = buildDiskDump({
      url: item.url,
      fetchSourceId: fetchResult.fetchSourceId,
      providerId,
      ai: options?.skipAi ? null : (aiExtract ?? null),
      references: hardFailure ? null : references,
      redirect: redirectDebug ?? null,
      aiCalls: aiCalls.length ? aiCalls : null,
      markdown: rawMarkdown,
      cleanMarkdown: enrichMarkdown,
    });

    if (diskBody.trim()) {
      const disk = await writeRawBody(item.id, diskBody, {
        contentHash,
        fetchedAt: now,
      });
      if (disk.ok && disk.rawRef) {
        rawRef = disk.rawRef;
        rawBytes = disk.rawBytes;
        hasRawBody = true;
      }
    }

    // A rerun that reaches the AI provider but fails must not erase a prior
    // successful summary, tags, or key points. The current aiStatus/aiError
    // below still records the failed attempt so every UI can explain it.
    const preservePriorAiFields =
      options?.skipAi === true || (aiOutcome != null && aiOutcome.status !== 'ok');

    const record: ItemEnrichment = {
      itemId: item.id,
      normalizedUrl: pending.normalizedUrl,
      status,
      providerId,
      fetchSourceId: fetchResult.fetchSourceId,
      fetchedAt: now,
      attempts,
      lastErrorCode,
      lastErrorDetail,
      nextRetryAt:
        status === 'failed' && attempts < ENRICHMENT_DEFAULTS.maxAttempts
          ? now + ENRICHMENT_DEFAULTS.backoffBaseMs * Math.pow(2, attempts - 1)
          : undefined,
      contentHash,
      textHash,
      snippet: parsed.snippet,
      summary: preservePriorAiFields ? existing?.summary : aiExtract?.summary,
      fetchedTitle: parsed.title,
      sourceKind,
      quotedText: parsed.quotedText,
      quotedAuthor: parsed.quotedAuthor,
      channel: parsed.channel,
      description: parsed.description,
      aiTags: preservePriorAiFields ? existing?.aiTags : aiExtract?.tags,
      aiKeyPoints: preservePriorAiFields ? existing?.aiKeyPoints : aiExtract?.keyPoints,
      references: hardFailure ? undefined : references,
      aiStatus: options?.skipAi ? existing?.aiStatus : aiOutcome?.status,
      aiError: options?.skipAi ? existing?.aiError : aiOutcome?.error,
      aiAt: options?.skipAi ? existing?.aiAt : aiOutcome?.at,
      rawRef,
      rawBytes,
      hasRawBody,
      tier2Applied,
      pendingFetchReview,
      pendingFetchReviewReason,
      reviewRawRef: undefined,
      updated_at: now,
    };
    await saveEnrichment(annotateFailureFields(record));

    debugOutcome = {
      enrichStatus: status,
      aiStatus: options?.skipAi ? existing?.aiStatus : aiOutcome?.status,
      errorCode: lastErrorCode,
      fetchSourceId: fetchResult.fetchSourceId,
    };
    flushDebug();

    const failureMessage =
      status === 'failed'
        ? formatEnrichmentFailureMessage(record) ??
          describeEnrichmentError(lastErrorCode, lastErrorDetail)
        : undefined;

    return {
      itemId,
      status,
      errorCode: lastErrorCode,
      message:
        status === 'failed'
          ? failureMessage
          : options?.skipAi
            ? 'fetch_only'
            : undefined,
    };
  } catch (e) {
    console.error('[enrichOne] unexpected error:', e);
    const isAbort =
      options?.signal?.aborted ||
      (e instanceof Error && e.name === 'AbortError');
    // Cancellation is coordinator state, not an enrichment failure. Do not
    // convert it into retry metadata or allow downstream stages to continue.
    if (isAbort) throw new DOMException('Cancelled', 'AbortError');
    const rawMsg = e instanceof Error ? e.message.trim() : String(e).trim();
    const errorCode: EnrichmentErrorCode = /SQLITE|database|Db is closed/i.test(rawMsg)
        ? 'provider_error'
        : 'network';
    if (existing && hasValuablePriorEnrichment(existing) && !options?.force) {
      debugOutcome = { enrichStatus: 'ok', errorCode };
      flushDebug();
      return preservePriorOnSuspiciousFetch(item, existing, pending, errorCode, undefined, deferPostProcess);
    }
    const lastErrorDetail = rawMsg || 'Unexpected error during fetch or save';
    const failed: ItemEnrichment = {
      ...pending,
      status: 'failed',
      lastErrorCode: errorCode,
      lastErrorDetail,
      fetchedAt: Date.now(),
      updated_at: Date.now(),
      nextRetryAt: Date.now() + ENRICHMENT_DEFAULTS.backoffBaseMs,
    };
    await saveEnrichment(annotateFailureFields(failed));
    debugOutcome = { enrichStatus: 'failed', errorCode };
    flushDebug();
    return {
      itemId,
      status: 'failed',
      errorCode,
      message: describeEnrichmentError(errorCode, lastErrorDetail),
    };
  }
}

/** Re-run AI extraction from cached snippet — no network fetch. */
export async function reextractAI(
  itemId: string,
  options?: { force?: boolean; signal?: AbortSignal }
): Promise<EnrichmentResult> {
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
  if (!options?.force && snippet.length < ENRICHMENT_DEFAULTS.minUsefulSnippetChars) {
    return {
      itemId,
      status: 'ok',
      skipped: true,
      message: 'snippet_too_short',
    };
  }

  if (!snippet.length) {
    return {
      itemId,
      status: 'ok',
      skipped: true,
      message: 'snippet_empty',
    };
  }

  const sourceKind = existing.sourceKind ?? classifySourceKind(item.url, item);
  const aiOutcome = await extractEnrichmentWithAI(
    snippet,
    item.url,
    existing.fetchedTitle || item.title,
    {
      sourceKind,
      forceShort: options?.force === true,
      signal: options?.signal,
      hints: {
        quotedText: existing.quotedText,
        quotedAuthor: existing.quotedAuthor,
        channel: existing.channel,
        description: existing.description,
        references: existing.references,
      },
    }
  );

  const aiExtract = aiOutcome.data;
  if (options?.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
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
  const aiSucceeded = aiOutcome.status === 'ok' && Boolean(aiExtract);
  const record: ItemEnrichment = {
    ...existing,
    summary: aiSucceeded ? aiExtract?.summary : existing.summary,
    fetchedTitle: aiSucceeded
      ? aiExtract?.improvedTitle || existing.fetchedTitle
      : existing.fetchedTitle,
    aiTags: aiSucceeded ? aiExtract?.tags : existing.aiTags,
    aiKeyPoints: aiSucceeded ? aiExtract?.keyPoints : existing.aiKeyPoints,
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
    message: aiOutcome.status === 'ok' ? undefined : aiOutcome.error ?? aiOutcome.status,
  };
}

async function resolveBatchItems(options: EnrichBatchOptions): Promise<Item[]> {
  if (options.itemIds?.length) {
    const rows = await Promise.all(options.itemIds.map((id) => getItem(id)));
    return rows.filter((i): i is Item => !!i?.url?.trim());
  }

  const all = await getAllItems();
  const bookmarks = all.filter((i) => i.url?.trim());

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

  let items = await resolveBatchItems(options);
  const scopedIds = options.itemIds?.filter(Boolean) ?? [];
  if (scopedIds.length === 0 && mode === 'full') {
    // Unscoped full enrich would load every enrichment row — refuse (callers must pass ids).
    console.warn('[enrichBatch] refusing unscoped full enrich — pass itemIds');
    return {
      runId: crypto.randomUUID(),
      processed: 0,
      skipped: 0,
      failed: 0,
      itemResults: options.collectItemResults ? [] : undefined,
    };
  }
  const enrichmentMap = new Map<string, ItemEnrichment>();
  if (scopedIds.length > 0) {
    // Always scoped — getAllEnrichments OOMs on large libraries during bulk enrich.
    await Promise.all(
      scopedIds.map(async (id) => {
        const e = await getEnrichment(id);
        if (e) enrichmentMap.set(e.itemId, e);
      })
    );
  } else {
    for (const e of await getAllEnrichments()) {
      enrichmentMap.set(e.itemId, e);
    }
  }

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

  // Process full resolved scope unless caller passes maxItems (no default cap).
  if (options.maxItems != null && options.maxItems >= 0) {
    items = items.slice(0, options.maxItems);
  }

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
          skipAi: options.skipAi,
          deferPostProcess: options.deferPostProcess,
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
      // Yield so side-panel save / UI clicks can run between items.
      await new Promise<void>((r) => setTimeout(r, 0));
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
