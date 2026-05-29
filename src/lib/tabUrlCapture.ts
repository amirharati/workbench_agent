/** Hosts where message/doc id is often in location.hash and chrome.tabs may omit it. */
const HASH_CRITICAL_HOST_RE =
  /mail\.google\.com|outlook\.(live|office)\.com|outlook\.office365\.com/i;

export function needsLiveTabHref(fallbackUrl: string): boolean {
  const trimmed = fallbackUrl.trim();
  if (!trimmed) return true;
  if (HASH_CRITICAL_HOST_RE.test(trimmed)) return true;
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

export async function getActiveTabBookmarkContext(): Promise<ActiveTabBookmarkContext | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) return null;
  const raw = tab.url.trim();
  if (!/^https?:\/\//i.test(raw) && !/^file:\/\//i.test(raw)) return null;

  const url = await resolveTabBookmarkUrl(tab.id, tab.url);
  return {
    tabId: tab.id,
    url,
    title: (tab.title || '').trim() || url,
    favIconUrl: tab.favIconUrl,
  };
}
