import { getSidePanelHostTabId, needsLiveTabHref, resolveTabBookmarkUrl } from '../tabUrlCapture';
import type { EnrichmentErrorCode } from './types';
import { ENRICHMENT_DEFAULTS } from './types';
import {
  isFileUrl,
  prefersBrowserTabFetch,
  prefersBrowserTabFirst,
} from './urlPolicy';
import {
  sameAuthWorkspaceHost,
  sharedAuthSessionPathPrefix,
  urlsMatchForTabSession,
} from './tabSessionMatch';
import {
  resolveEnrichmentFailureLabel,
  type FailureCategory,
} from './failureLabels';
import type { PipelineBadgeKind } from '../pipeline/pipelineBadge';

const EPHEMERAL_TAB_LOAD_MS = 45_000;
const EPHEMERAL_POST_LOAD_MS = 2_000;

/** Serialize ephemeral background tabs — avoids Chrome load races under batch enrich. */
class EphemeralTabSemaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    return () => this.release();
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

const ephemeralTabSemaphore = new EphemeralTabSemaphore(
  ENRICHMENT_DEFAULTS.ephemeralMaxConcurrent
);

export async function withEphemeralTabSlot<T>(fn: () => Promise<T>): Promise<T> {
  const release = await ephemeralTabSemaphore.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

export type TabExtractResult = {
  ok: boolean;
  markdown?: string;
  title?: string;
  /** Live tab URL after load (for redirect vs bookmark comparison). */
  pageUrl?: string;
  error?: string;
  detail?: string;
  errorCode?: EnrichmentErrorCode;
};

type BrowserFetchServiceResult = TabExtractResult & { fetchSourceId: 'tab-session' };

export function hasDirectBrowserTabAccess(): boolean {
  const runtimeGlobal = globalThis as typeof globalThis & {
    chrome?: {
      tabs?: { query?: unknown; get?: unknown };
      scripting?: { executeScript?: unknown };
    };
  };
  return (
    typeof runtimeGlobal.chrome?.tabs?.query === 'function' &&
    typeof runtimeGlobal.chrome.tabs.get === 'function' &&
    typeof runtimeGlobal.chrome?.scripting?.executeScript === 'function'
  );
}

/**
 * Ask the MV3 service worker to use chrome.tabs/chrome.scripting for us.
 * Offscreen documents only have chrome.runtime, so authenticated fetches cross
 * this narrow capability boundary without moving pipeline ownership.
 */
export async function fetchThroughBrowserService(
  url: string,
  options?: {
    tabId?: number;
    mode?: 'active' | 'any';
    allowEphemeral?: boolean;
    windowId?: number;
    signal?: AbortSignal;
  }
): Promise<BrowserFetchServiceResult> {
  const fail = (
    error: string,
    errorCode: EnrichmentErrorCode = 'provider_error'
  ): BrowserFetchServiceResult => ({
    ok: false,
    error,
    errorCode,
    fetchSourceId: 'tab-session',
  });
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return fail('Browser-session fetch service is unavailable');
  }
  if (options?.signal?.aborted) return fail('Fetch cancelled');

  const requestId = crypto.randomUUID();
  const cancel = () => {
    chrome.runtime.sendMessage({
      target: 'browser-fetch-service',
      action: 'cancel',
      requestId,
    }).catch(() => {});
  };
  options?.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'browser-fetch-service',
      action: 'extract',
      requestId,
      url,
      tabId: options?.tabId,
      mode: options?.mode ?? 'any',
      allowEphemeral: options?.allowEphemeral === true,
      windowId: options?.windowId,
    }) as BrowserFetchServiceResult | undefined;
    if (options?.signal?.aborted) return fail('Fetch cancelled');
    if (!response || typeof response.ok !== 'boolean') {
      return fail('Browser-session fetch service returned no result');
    }
    return { ...response, fetchSourceId: 'tab-session' };
  } catch (error) {
    if (options?.signal?.aborted) return fail('Fetch cancelled');
    return fail(error instanceof Error ? error.message : String(error));
  } finally {
    options?.signal?.removeEventListener('abort', cancel);
  }
}

/** Match aiExtract minimum — reject error-shell snippets that slip through DOM scrape. */
export const MIN_TAB_SESSION_MARKDOWN_CHARS = 80;

function isEphemeralTabUrl(url: string): boolean {
  const t = url.trim();
  return /^https?:\/\//i.test(t) || isFileUrl(t);
}

const TAB_SESSION_FAILURE_CATEGORIES = new Set<FailureCategory>([
  'auth',
  'bot',
  'parse',
  'ai_short',
  'ai_empty',
]);

/** Whether Inspector should offer explicit browser-tab fetch (vs generic re-digest). */
export function shouldOfferTabSessionFetch(
  url: string,
  enrichment?: Parameters<typeof resolveEnrichmentFailureLabel>[0],
  badgeKind?: PipelineBadgeKind | null
): boolean {
  if (!url.trim()) return false;
  if (isFileUrl(url) || prefersBrowserTabFetch(url)) {
    return badgeKind === 'failed' || badgeKind === 'not_processed';
  }
  if (badgeKind !== 'failed') return false;
  const label = resolveEnrichmentFailureLabel(enrichment ?? undefined);
  if (!label) {
    return (
      enrichment?.lastErrorCode === 'bot_blocked' ||
      enrichment?.lastErrorCode === 'auth_required'
    );
  }
  return TAB_SESSION_FAILURE_CATEGORIES.has(label.category);
}

function isScriptableUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

function tabMatchesUrl(tab: chrome.tabs.Tab, url: string): boolean {
  return Boolean(tab.url && isScriptableUrl(tab.url) && urlsMatchForTabSession(tab.url, url));
}

function tabMatchesUrlTierB(tab: chrome.tabs.Tab, url: string): boolean {
  if (!tab.url || !isScriptableUrl(tab.url)) return false;
  if (!sameAuthWorkspaceHost(tab.url, url)) return false;
  return sharedAuthSessionPathPrefix(tab.url, url);
}

async function tabMatchesUrlLive(tab: chrome.tabs.Tab, url: string): Promise<boolean> {
  if (!tab.url || !isScriptableUrl(tab.url)) return false;
  if (tabMatchesUrl(tab, url)) return true;
  if (!needsLiveTabHref(url) || tab.id === undefined) return false;
  if (!sameAuthWorkspaceHost(tab.url, url)) return false;
  const live = await resolveTabBookmarkUrl(tab.id, url);
  return urlsMatchForTabSession(live, url);
}

async function pickMatchingTab(
  candidates: chrome.tabs.Tab[],
  url: string
): Promise<chrome.tabs.Tab | null> {
  for (const tab of candidates) {
    if (await tabMatchesUrlLive(tab, url)) return tab;
  }
  for (const tab of candidates) {
    if (tabMatchesUrlTierB(tab, url)) return tab;
  }
  return null;
}

/** Prefer active tab in the focused window, then any open tab with the same URL. */
export async function findTabForUrl(
  url: string,
  mode: 'active' | 'any' = 'any'
): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;

  if (mode === 'active') {
    const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (focused && (await tabMatchesUrlLive(focused, url))) return focused;
    if (focused && tabMatchesUrlTierB(focused, url)) return focused;

    const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (current && (await tabMatchesUrlLive(current, url))) return current;
    if (current && tabMatchesUrlTierB(current, url)) return current;
    return null;
  }

  const [focusedActive] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focusedActive && (await tabMatchesUrlLive(focusedActive, url))) return focusedActive;
  if (focusedActive && tabMatchesUrlTierB(focusedActive, url)) return focusedActive;

  const tabs = await chrome.tabs.query({});
  return pickMatchingTab(tabs, url);
}

export async function extractFromTab(tabId: number): Promise<TabExtractResult> {
  if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) {
    return {
      ok: false,
      error: 'Tab extraction is unavailable in this context',
      errorCode: 'provider_error',
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['tab-page-extract.js'],
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const win = window as Window & {
          workbenchExtractPageContentAsync?: () => Promise<TabExtractResult>;
          workbenchExtractPageContent?: () => TabExtractResult;
        };
        if (typeof win.workbenchExtractPageContentAsync === 'function') {
          return win.workbenchExtractPageContentAsync();
        }
        if (typeof win.workbenchExtractPageContent === 'function') {
          return win.workbenchExtractPageContent();
        }
        return { ok: false, error: 'extract_script_missing' };
      },
    });

    const payload = result as TabExtractResult | undefined;
    const markdown = payload?.markdown?.trim();
    if (!payload?.ok || !markdown) {
      return {
        ok: false,
        error:
          payload?.detail ||
          payload?.error ||
          'Could not read content from the open tab',
        errorCode: 'parse_empty',
      };
    }

    if (markdown.length < MIN_TAB_SESSION_MARKDOWN_CHARS) {
      return {
        ok: false,
        error:
          payload.detail ||
          `Only ${markdown.length} chars read from tab — wait for the page to finish loading`,
        errorCode: 'parse_empty',
      };
    }

    return {
      ok: true,
      markdown,
      title: payload.title?.trim() || undefined,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const restricted =
      /cannot access|extension manifest|chrome:|Cannot access contents of url/i.test(message);
    return {
      ok: false,
      error: restricted
        ? 'This page cannot be read by the extension (browser restriction)'
        : message,
      errorCode: restricted ? 'excluded' : 'provider_error',
    };
  }
}

async function readTabPageUrl(tabId: number): Promise<string | undefined> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function fetchFromTabId(tabId: number): Promise<
  TabExtractResult & { fetchSourceId: 'tab-session' }
> {
  const extracted = await extractFromTab(tabId);
  const pageUrl = await readTabPageUrl(tabId);
  return { ...extracted, pageUrl, fetchSourceId: 'tab-session' };
}

export async function fetchFromOpenTab(
  url: string,
  mode: 'active' | 'any' = 'any',
  tabId?: number
): Promise<TabExtractResult & { fetchSourceId: 'tab-session' }> {
  if (typeof tabId === 'number') {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.url) {
        if ((await tabMatchesUrlLive(tab, url)) || sameAuthWorkspaceHost(tab.url, url)) {
          return fetchFromTabId(tabId);
        }
      }
    } catch {
      /* fall through to lookup */
    }
  }

  const tab = await findTabForUrl(url, mode);
  if (!tab?.id) {
    return {
      ok: false,
      error: 'No open browser tab matches this URL',
      errorCode: 'provider_error',
      fetchSourceId: 'tab-session',
    };
  }

  return fetchFromTabId(tab.id);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('Aborted'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForTabComplete(tabId: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('Aborted'));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') finish(resolve);
    };

    const onAbort = () => finish(() => reject(new Error('Aborted')));

    const timeout = setTimeout(
      () => finish(() => reject(new Error('Tab load timeout'))),
      EPHEMERAL_TAB_LOAD_MS
    );

    chrome.tabs.onUpdated.addListener(onUpdated);
    signal?.addEventListener('abort', onAbort, { once: true });

    chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === 'complete') finish(resolve);
      },
      () => finish(() => reject(new Error('Tab closed before load'))),
    );
  });
}

/**
 * Open a background tab in the user's Chrome profile, extract DOM, then close the tab.
 * Uses real cookies/session — fallback when no matching tab is already open.
 */
export async function openEphemeralTabAndExtract(
  url: string,
  signal?: AbortSignal
): Promise<TabExtractResult & { fetchSourceId: 'tab-session' }> {
  return withEphemeralTabSlot(() => openEphemeralTabAndExtractInner(url, signal));
}

async function openEphemeralTabAndExtractInner(
  url: string,
  signal?: AbortSignal
): Promise<TabExtractResult & { fetchSourceId: 'tab-session' }> {
  const fail = (
    error: string,
    errorCode: EnrichmentErrorCode = 'provider_error'
  ): TabExtractResult & { fetchSourceId: 'tab-session' } => ({
    ok: false,
    error,
    errorCode,
    fetchSourceId: 'tab-session',
  });

  if (typeof chrome === 'undefined' || !chrome.tabs?.create) {
    return fail('Background tab fetch is unavailable in this context');
  }

  const target = url.trim();
  if (!isEphemeralTabUrl(target)) {
    return fail('Only http(s) or local file URLs can be fetched in a browser tab', 'excluded');
  }

  let tabId: number | undefined;
  try {
    const created = await chrome.tabs.create({ url: target, active: false });
    tabId = created.id;
    if (tabId === undefined) return fail('Could not open a background browser tab');

    await waitForTabComplete(tabId, signal);
    await delay(prefersBrowserTabFirst(target) ? EPHEMERAL_POST_LOAD_MS : 800, signal);

    let extracted = await extractFromTab(tabId);
    if (!extracted.ok && prefersBrowserTabFirst(target) && extracted.errorCode === 'parse_empty') {
      await delay(EPHEMERAL_POST_LOAD_MS, signal);
      extracted = await extractFromTab(tabId);
    }

    const pageUrl = tabId !== undefined ? await readTabPageUrl(tabId) : undefined;
    return { ...extracted, pageUrl, fetchSourceId: 'tab-session' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'Aborted') {
      return fail('Fetch cancelled', 'provider_error');
    }
    return fail(message || 'Background tab fetch failed');
  } finally {
    if (tabId !== undefined) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        /* tab may already be closed */
      }
    }
  }
}

/** True when we should open a background tab if no existing tab matches. */
export function shouldUseEphemeralTab(url: string): boolean {
  return prefersBrowserTabFirst(url);
}

/** Resolve an open browser tab for tab-session fetch (active first, then any). */
export async function resolveTabSessionForUrl(
  url: string,
  explicitTabId?: number
): Promise<{ preferTabSession: boolean; tabId?: number }> {
  if (typeof explicitTabId === 'number') {
    try {
      const tab = await chrome.tabs.get(explicitTabId);
      if (tab?.url && ((await tabMatchesUrlLive(tab, url)) || sameAuthWorkspaceHost(tab.url, url))) {
        return { preferTabSession: true, tabId: explicitTabId };
      }
    } catch {
      /* fall through */
    }
  }

  const sidePanelHostTabId = await getSidePanelHostTabId();
  if (typeof sidePanelHostTabId === 'number') {
    try {
      const hostTab = await chrome.tabs.get(sidePanelHostTabId);
      if (hostTab?.id && (await tabMatchesUrlLive(hostTab, url))) {
        return { preferTabSession: true, tabId: hostTab.id };
      }
      if (hostTab?.id && tabMatchesUrlTierB(hostTab, url)) {
        return { preferTabSession: true, tabId: hostTab.id };
      }
    } catch {
      /* fall through */
    }
  }

  const active = await findTabForUrl(url, 'active');
  if (active?.id) return { preferTabSession: true, tabId: active.id };

  const any = await findTabForUrl(url, 'any');
  if (any?.id) return { preferTabSession: true, tabId: any.id };

  return { preferTabSession: false };
}
