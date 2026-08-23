import { cleanLiveDocumentTitle, shouldUpgradeBookmarkTitle } from './enrichment/eligibility';

/** Hosts where message/doc id is often in location.hash and chrome.tabs may omit it. */
const HASH_CRITICAL_HOST_RE =
  /mail\.google\.com|outlook\.(live|office)\.com|outlook\.office365\.com/i;

/** SPAs where chrome.tabs.url can lag behind in-page navigation. */
const SPA_LIVE_HREF_HOST_RE = /grok\.com|chatgpt\.com|claude\.ai/i;

export function needsLiveTabHref(fallbackUrl: string): boolean {
  const trimmed = fallbackUrl.trim();
  if (!trimmed) return true;
  if (HASH_CRITICAL_HOST_RE.test(trimmed)) return true;
  if (SPA_LIVE_HREF_HOST_RE.test(trimmed)) return true;
  try {
    const u = new URL(trimmed);
    if (u.hash && u.hash.length > 1) return false;
    if (u.hostname.includes('docs.google.com') || u.hostname.includes('drive.google.com')) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

/** Prefer the tab's live location.href — critical for Gmail #inbox/… message ids. */
export async function resolveTabBookmarkUrl(
  tabId: number,
  fallbackUrl: string
): Promise<string> {
  const fallback = fallbackUrl.trim();
  if (!needsLiveTabHref(fallback)) return fallback;
  if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) {
    return fallback;
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.location.href,
    });
    if (
      typeof result === 'string' &&
      (/^https?:\/\//i.test(result.trim()) || /^file:\/\//i.test(result.trim()))
    ) {
      return result.trim();
    }
  } catch {
    /* restricted or transient — use fallback */
  }
  return fallback;
}

export type ActiveTabBookmarkContext = {
  tabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
};

type LiveTitleCandidates = {
  metadataTitle?: string;
  structuredTitle?: string;
  headingTitle?: string;
  documentTitle?: string;
};

export function chooseLiveBookmarkTitle(
  fallbackTitle: string,
  url: string,
  candidates: LiveTitleCandidates
): string {
  let title = cleanLiveDocumentTitle(fallbackTitle);
  for (const candidate of [
    cleanLiveDocumentTitle(candidates.documentTitle || ''),
    candidates.headingTitle,
    candidates.structuredTitle,
    candidates.metadataTitle,
  ]) {
    if (shouldUpgradeBookmarkTitle(title, candidate, url)) title = candidate!.trim();
  }
  return title || url;
}

async function resolveTabBookmarkTitle(
  tabId: number,
  url: string,
  fallbackTitle: string
): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) {
    return fallbackTitle.trim() || url;
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
        const meta = (names: string[]) => {
          for (const name of names) {
            const value = document
              .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
              ?.getAttribute('content');
            if (clean(value)) return clean(value);
          }
          return undefined;
        };
        let structuredTitle: string | undefined;
        for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const visit = (value: unknown): string | undefined => {
              if (!value || typeof value !== 'object') return undefined;
              if (Array.isArray(value)) {
                for (const row of value) {
                  const found = visit(row);
                  if (found) return found;
                }
                return undefined;
              }
              const record = value as Record<string, unknown>;
              for (const key of ['headline', 'name']) {
                const candidate = clean(record[key]);
                if (candidate.length >= 4 && candidate.length <= 300) return candidate;
              }
              return visit(record['@graph']);
            };
            structuredTitle = visit(JSON.parse(node.textContent || ''));
            if (structuredTitle) break;
          } catch {
            // Ignore malformed structured metadata.
          }
        }
        let headingTitle: string | undefined;
        const headingSelectors = [
          'main h1', 'article h1', '[role="main"] h1',
          '[role="heading"][aria-level="1"]', 'h1',
          'main h2', 'article h2', '[role="main"] h2', 'h2',
        ];
        for (const selector of headingSelectors) {
          for (const node of document.querySelectorAll(selector)) {
            const style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const candidate = clean((node as HTMLElement).innerText || node.textContent);
            if (candidate.length >= 4 && candidate.length <= 300) {
              headingTitle = candidate;
              break;
            }
          }
          if (headingTitle) break;
        }
        return {
          metadataTitle: meta(['og:title', 'twitter:title']),
          structuredTitle,
          headingTitle,
          documentTitle: clean(document.title) || undefined,
        };
      },
    });
    return chooseLiveBookmarkTitle(
      fallbackTitle,
      url,
      (result ?? {}) as LiveTitleCandidates
    );
  } catch {
    return fallbackTitle.trim() || url;
  }
}

export async function getSidePanelHostTabId(): Promise<number | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'side-panel-host-tab' });
    const tabId = response?.tabId;
    return typeof tabId === 'number' ? tabId : null;
  } catch {
    return null;
  }
}

/**
 * Install one lightweight observer in the contextual panel's owning page.
 * SPA pushState navigation does not reliably emit tabs.onUpdated, so the page
 * reports URL/title changes to extension contexts. Repeated installation is
 * idempotent and a full navigation naturally discards the old observer.
 */
export async function ensureTabContextMonitor(tabId: number): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const root = globalThis as typeof globalThis & {
          __homebaseSidePanelContextMonitor?: {
            emit: () => void;
          };
        };
        if (root.__homebaseSidePanelContextMonitor) {
          root.__homebaseSidePanelContextMonitor.emit();
          return;
        }
        let lastContext = '';
        const emit = () => {
          const href = window.location.href;
          const title = document.title;
          const context = `${href}\n${title}`;
          if (context === lastContext) return;
          lastContext = context;
          void chrome.runtime.sendMessage({
            type: 'side-panel-page-context-changed',
            href,
            title,
          }).catch(() => {});
        };
        window.addEventListener('popstate', emit);
        window.addEventListener('hashchange', emit);
        const titleNode = document.querySelector('title');
        const observer = titleNode
          ? new MutationObserver(emit)
          : null;
        observer?.observe(titleNode!, { childList: true, characterData: true, subtree: true });
        window.setInterval(emit, 400);
        root.__homebaseSidePanelContextMonitor = { emit };
        emit();
      },
    });
  } catch {
    // Restricted pages still use Chrome tab events and the panel fallback poll.
  }
}

export async function getTabBookmarkContext(
  tabId: number
): Promise<ActiveTabBookmarkContext | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.get) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.id || !tab.url) return null;
    const raw = tab.url.trim();
    if (!raw) return null;

    const url = await resolveTabBookmarkUrl(tab.id, tab.url);
    const title = await resolveTabBookmarkTitle(tab.id, url, (tab.title || '').trim());
    return {
      tabId: tab.id,
      url,
      title,
      favIconUrl: tab.favIconUrl,
    };
  } catch {
    return null;
  }
}

async function queryFocusedActiveTabContext(): Promise<ActiveTabBookmarkContext | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;

  const queries: chrome.tabs.QueryInfo[] = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
  ];

  for (const query of queries) {
    const [tab] = await chrome.tabs.query(query);
    if (!tab?.id || !tab.url) continue;
    const raw = tab.url.trim();
    if (!raw) continue;
    const url = await resolveTabBookmarkUrl(tab.id, tab.url);
    const title = await resolveTabBookmarkTitle(tab.id, url, (tab.title || '').trim());
    return {
      tabId: tab.id,
      url,
      title,
      favIconUrl: tab.favIconUrl,
    };
  }
  return null;
}

export async function getActiveTabBookmarkContext(): Promise<ActiveTabBookmarkContext | null> {
  const hostTabId = await getSidePanelHostTabId();
  if (hostTabId != null) {
    const host = await getTabBookmarkContext(hostTabId);
    if (host) return host;
  }
  return queryFocusedActiveTabContext();
}
