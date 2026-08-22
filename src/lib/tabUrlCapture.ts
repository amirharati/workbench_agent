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
    return {
      tabId: tab.id,
      url,
      title: (tab.title || '').trim() || url,
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
    return {
      tabId: tab.id,
      url,
      title: (tab.title || '').trim() || url,
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
