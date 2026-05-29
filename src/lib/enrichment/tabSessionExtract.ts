import { normalizeBookmarkUrl } from '../db';
import { needsLiveTabHref } from '../tabUrlCapture';
import type { EnrichmentErrorCode } from './types';
import { canonicalizeXStatusUrl, isFileUrl, isRedditHost, prefersBrowserTabFetch } from './urlPolicy';
import {
  resolveEnrichmentFailureLabel,
  type FailureCategory,
} from './failureLabels';
import type { PipelineBadgeKind } from '../pipeline/pipelineBadge';

const EPHEMERAL_TAB_LOAD_MS = 45_000;
const EPHEMERAL_POST_LOAD_MS = 2_000;

export type TabExtractResult = {
  ok: boolean;
  markdown?: string;
  title?: string;
  error?: string;
  detail?: string;
  errorCode?: EnrichmentErrorCode;
};

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

function redditPathKey(url: string): string | null {
  try {
    if (!isRedditHost(url)) return null;
    return new URL(url).pathname.replace(/\/+$/, '').toLowerCase() || '/';
  } catch {
    return null;
  }
}

function hostsLooselyMatchForTabSession(tabUrl: string, bookmarkUrl: string): boolean {
  try {
    const tab = new URL(tabUrl.trim());
    const bookmark = new URL(bookmarkUrl.trim());

    if (tab.protocol === 'file:' || bookmark.protocol === 'file:') {
      return normalizeBookmarkUrl(tab.href) === normalizeBookmarkUrl(bookmark.href);
    }

    const tabReddit = redditPathKey(tab.href);
    const bookmarkReddit = redditPathKey(bookmark.href);
    if (tabReddit && bookmarkReddit) return tabReddit === bookmarkReddit;

    const tabHost = tab.hostname.replace(/^www\./, '').toLowerCase();
    const bookmarkHost = bookmark.hostname.replace(/^www\./, '').toLowerCase();
    if (tabHost !== bookmarkHost) return false;

    if (needsLiveTabHref(bookmarkUrl) || needsLiveTabHref(tabUrl)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function urlsMatchForTabSession(a: string, b: string): boolean {
  try {
    const left = normalizeBookmarkUrl(canonicalizeXStatusUrl(a.trim()));
    const right = normalizeBookmarkUrl(canonicalizeXStatusUrl(b.trim()));
    if (left === right) return true;
    return hostsLooselyMatchForTabSession(left, right);
  } catch {
    return false;
  }
}

function isScriptableUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

function tabMatchesUrl(tab: chrome.tabs.Tab, url: string): boolean {
  return Boolean(tab.url && isScriptableUrl(tab.url) && urlsMatchForTabSession(tab.url, url));
}

/** Prefer active tab in the focused window, then any open tab with the same URL. */
export async function findTabForUrl(
  url: string,
  mode: 'active' | 'any' = 'any'
): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;

  if (mode === 'active') {
    const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (focused && tabMatchesUrl(focused, url)) return focused;

    const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (current && tabMatchesUrl(current, url)) return current;
    return null;
  }

  const [focusedActive] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focusedActive && tabMatchesUrl(focusedActive, url)) return focusedActive;

  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => tabMatchesUrl(tab, url)) ?? null;
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

export async function fetchFromTabId(tabId: number): Promise<
  TabExtractResult & { fetchSourceId: 'tab-session' }
> {
  const extracted = await extractFromTab(tabId);
  return { ...extracted, fetchSourceId: 'tab-session' };
}

export async function fetchFromOpenTab(
  url: string,
  mode: 'active' | 'any' = 'any',
  tabId?: number
): Promise<TabExtractResult & { fetchSourceId: 'tab-session' }> {
  if (typeof tabId === 'number') {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.url && tabMatchesUrl(tab, url)) {
        return fetchFromTabId(tabId);
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
    await delay(prefersBrowserTabFetch(target) ? EPHEMERAL_POST_LOAD_MS : 800, signal);

    let extracted = await extractFromTab(tabId);
    if (!extracted.ok && prefersBrowserTabFetch(target) && extracted.errorCode === 'parse_empty') {
      await delay(EPHEMERAL_POST_LOAD_MS, signal);
      extracted = await extractFromTab(tabId);
    }

    return { ...extracted, fetchSourceId: 'tab-session' };
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
  return prefersBrowserTabFetch(url) || needsLiveTabHref(url);
}

/** Resolve an open browser tab for tab-session fetch (active first, then any). */
export async function resolveTabSessionForUrl(
  url: string,
  explicitTabId?: number
): Promise<{ preferTabSession: boolean; tabId?: number }> {
  if (typeof explicitTabId === 'number') {
    try {
      const tab = await chrome.tabs.get(explicitTabId);
      if (tab?.url && tabMatchesUrl(tab, url)) {
        return { preferTabSession: true, tabId: explicitTabId };
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
