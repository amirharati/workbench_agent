/**
 * Browser-session fetch capability for the MV3 service worker.
 *
 * The durable pipeline runs in an offscreen document, where Chrome exposes only
 * chrome.runtime. This service owns no jobs or data; it only resolves/opens a
 * browser tab, extracts the rendered page, and returns the result.
 */
(function installBrowserFetchServiceFactory(root) {
  const MIN_MARKDOWN_CHARS = 80;
  const TAB_LOAD_MS = 45_000;
  const SESSION_POST_LOAD_MS = 2_000;
  const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'ref', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'zanpid',
    '_ga', '_gl', 'yclid', 'dclid',
  ];

  function createBrowserFetchService(chromeApi) {
    const requests = new Map();
    const cancelledBeforeStart = new Map();
    let ephemeralTail = Promise.resolve();

    function pruneCancellationTombstones() {
      const cutoff = Date.now() - 60_000;
      for (const [requestId, cancelledAt] of cancelledBeforeStart) {
        if (cancelledAt < cutoff) cancelledBeforeStart.delete(requestId);
      }
    }

    function failure(error, errorCode = 'provider_error') {
      return { ok: false, error, errorCode, fetchSourceId: 'tab-session' };
    }

    function normalizeUrl(url) {
      const raw = String(url || '').trim();
      if (!raw) return raw;
      try {
        const parsed = new URL(raw);
        parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
        if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        for (const param of TRACKING_PARAMS) parsed.searchParams.delete(param);
        parsed.pathname = parsed.pathname.replace(/\/(photo|video)\/\d+$/i, '');
        return parsed.toString();
      } catch {
        return raw;
      }
    }

    function hostOf(url) {
      try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return '';
      }
    }

    function sameHost(left, right) {
      const a = hostOf(left);
      return Boolean(a && a === hostOf(right));
    }

    function needsLiveHref(url) {
      const value = String(url || '').trim();
      if (!value) return true;
      if (/mail\.google\.com|outlook\.(live|office)\.com|outlook\.office365\.com/i.test(value)) {
        return true;
      }
      if (/grok\.com|chatgpt\.com|claude\.ai/i.test(value)) return true;
      try {
        const parsed = new URL(value);
        if (parsed.hash && parsed.hash.length > 1) return false;
        return parsed.hostname.includes('docs.google.com') || parsed.hostname.includes('drive.google.com');
      } catch {
        return true;
      }
    }

    function googleResourceKey(url) {
      try {
        const parsed = new URL(url);
        const host = hostOf(url);
        if (host === 'docs.google.com') {
          const doc = parsed.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
          if (doc) return `gdoc:${doc[1]}`;
          const sheet = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
          if (sheet) return `gsheet:${sheet[1]}`;
          const slides = parsed.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
          if (slides) return `gslides:${slides[1]}`;
        }
        if (host === 'drive.google.com') {
          const file = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
          if (file) return `gdrive:${file[1]}`;
          const folder = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
          if (folder) return `gfolder:${folder[1]}`;
        }
      } catch {
        // Invalid URL.
      }
      return null;
    }

    function urlsMatch(left, right) {
      const a = normalizeUrl(left);
      const b = normalizeUrl(right);
      if (a === b) return true;
      try {
        const aUrl = new URL(a);
        const bUrl = new URL(b);
        if (aUrl.protocol === 'file:' || bUrl.protocol === 'file:') return false;
        if (!sameHost(a, b)) return false;

        const host = hostOf(a);
        if (host === 'reddit.com' || host.endsWith('.reddit.com')) {
          return aUrl.pathname.replace(/\/+$/, '').toLowerCase() ===
            bUrl.pathname.replace(/\/+$/, '').toLowerCase();
        }

        if (needsLiveHref(a) || needsLiveHref(b)) {
          const aKey = googleResourceKey(a);
          const bKey = googleResourceKey(b);
          return aKey && bKey ? aKey === bKey : false;
        }
      } catch {
        return false;
      }
      return false;
    }

    function sessionPrefix(url) {
      try {
        const parsed = new URL(url);
        const host = hostOf(url);
        const parts = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
        if (host.endsWith('udemy.com')) {
          const index = parts.indexOf('course');
          return index >= 0 && parts[index + 1] ? `/course/${parts[index + 1].toLowerCase()}/` : null;
        }
        if (host.endsWith('coursera.org')) {
          const index = parts.indexOf('learn');
          return index >= 0 && parts[index + 1] ? `/learn/${parts[index + 1].toLowerCase()}/` : null;
        }
        if (host.endsWith('linkedin.com')) {
          return parts[0] === 'learning' && parts[1] ? `/learning/${parts[1].toLowerCase()}/` : null;
        }
        if (host.endsWith('medium.com')) {
          if (parts[0] && parts[0].startsWith('@')) return `/${parts[0].toLowerCase()}/`;
          return parts[0] === 'p' && parts[1] ? `/p/${parts[1].toLowerCase()}` : null;
        }
        if (host.endsWith('substack.com')) {
          return parts[0] === 'p' && parts[1] ? `/p/${parts[1].toLowerCase()}` : null;
        }
      } catch {
        // Invalid URL.
      }
      return null;
    }

    function sharesSessionPrefix(left, right) {
      if (!sameHost(left, right)) return false;
      const a = sessionPrefix(left);
      const b = sessionPrefix(right);
      return Boolean(a && b && a === b);
    }

    function isScriptableUrl(url) {
      return /^https?:\/\//i.test(String(url || '')) || /^file:\/\//i.test(String(url || ''));
    }

    function isSessionFirstUrl(url) {
      const host = hostOf(url);
      return /^file:\/\//i.test(String(url || '')) ||
        host === 'reddit.com' || host.endsWith('.reddit.com') ||
        host === 'mail.google.com' || host === 'docs.google.com' ||
        host === 'drive.google.com' || /^outlook\.(live|office)\.com$/i.test(host) ||
        host === 'outlook.office365.com';
    }

    function throwIfCancelled(state) {
      if (state.cancelled) throw new Error('browser_fetch_cancelled');
    }

    async function liveHref(tabId, fallback) {
      if (!needsLiveHref(fallback)) return fallback;
      try {
        const rows = await chromeApi.scripting.executeScript({
          target: { tabId },
          func: () => window.location.href,
        });
        const result = rows && rows[0] && rows[0].result;
        return typeof result === 'string' && isScriptableUrl(result) ? result.trim() : fallback;
      } catch {
        return fallback;
      }
    }

    async function tabMatches(tab, url) {
      if (!tab || typeof tab.id !== 'number' || !isScriptableUrl(tab.url)) return false;
      if (urlsMatch(tab.url, url)) return true;
      if (!sameHost(tab.url, url) || !needsLiveHref(url)) return false;
      return urlsMatch(await liveHref(tab.id, tab.url), url);
    }

    async function pickMatchingTab(candidates, url) {
      for (const tab of candidates || []) {
        if (await tabMatches(tab, url)) return tab;
      }
      for (const tab of candidates || []) {
        if (isScriptableUrl(tab && tab.url) && sharesSessionPrefix(tab.url, url)) return tab;
      }
      return null;
    }

    async function findMatchingTab(url, mode, windowId) {
      if (typeof windowId === 'number') {
        return pickMatchingTab(await chromeApi.tabs.query({ windowId }), url);
      }
      const focused = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
      const focusedMatch = await pickMatchingTab(focused, url);
      if (focusedMatch) return focusedMatch;
      if (mode === 'active') {
        const current = await chromeApi.tabs.query({ active: true, currentWindow: true });
        return pickMatchingTab(current, url);
      }
      return pickMatchingTab(await chromeApi.tabs.query({}), url);
    }

    async function extractFromTab(tabId, state) {
      throwIfCancelled(state);
      try {
        await chromeApi.scripting.executeScript({ target: { tabId }, files: ['tab-page-extract.js'] });
        throwIfCancelled(state);
        const rows = await chromeApi.scripting.executeScript({
          target: { tabId },
          func: async () => {
            const win = window;
            if (typeof win.workbenchExtractPageContentAsync === 'function') {
              return win.workbenchExtractPageContentAsync();
            }
            if (typeof win.workbenchExtractPageContent === 'function') {
              return win.workbenchExtractPageContent();
            }
            return { ok: false, error: 'extract_script_missing' };
          },
        });
        throwIfCancelled(state);
        const payload = rows && rows[0] && rows[0].result;
        const markdown = payload && typeof payload.markdown === 'string' ? payload.markdown.trim() : '';
        if (!payload || !payload.ok || !markdown) {
          return failure((payload && (payload.detail || payload.error)) || 'Could not read content from the browser tab', 'parse_empty');
        }
        if (markdown.length < MIN_MARKDOWN_CHARS) {
          return failure(`Only ${markdown.length} chars read from tab — wait for the page to finish loading`, 'parse_empty');
        }
        const tab = await chromeApi.tabs.get(tabId).catch(() => null);
        return {
          ok: true,
          markdown,
          title: payload.title && String(payload.title).trim() || undefined,
          previewImage: payload.previewImage && String(payload.previewImage).trim() || undefined,
          pageUrl: tab && tab.url && String(tab.url).trim() || undefined,
          fetchSourceId: 'tab-session',
        };
      } catch (error) {
        if (state.cancelled || (error && error.message === 'browser_fetch_cancelled')) {
          return failure('Fetch cancelled');
        }
        const message = error instanceof Error ? error.message : String(error);
        const restricted = /cannot access|extension manifest|chrome:|Cannot access contents of url/i.test(message);
        return failure(
          restricted ? 'This page cannot be read by the extension (browser restriction)' : message,
          restricted ? 'excluded' : 'provider_error'
        );
      }
    }

    function waitForTabComplete(tabId, state) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          chromeApi.tabs.onUpdated.removeListener(onUpdated);
          if (chromeApi.tabs.onRemoved) chromeApi.tabs.onRemoved.removeListener(onRemoved);
          if (state.cancelCurrent === onCancel) state.cancelCurrent = null;
          callback();
        };
        const onUpdated = (id, info) => {
          if (id === tabId && info && info.status === 'complete') finish(resolve);
        };
        const onRemoved = (id) => {
          if (id === tabId) finish(() => reject(new Error('Tab closed before load')));
        };
        const onCancel = () => finish(() => reject(new Error('browser_fetch_cancelled')));
        const timeout = setTimeout(
          () => finish(() => reject(new Error('Tab load timeout'))),
          TAB_LOAD_MS
        );
        state.cancelCurrent = onCancel;
        chromeApi.tabs.onUpdated.addListener(onUpdated);
        if (chromeApi.tabs.onRemoved) chromeApi.tabs.onRemoved.addListener(onRemoved);
        chromeApi.tabs.get(tabId).then(
          (tab) => { if (tab && tab.status === 'complete') finish(resolve); },
          () => finish(() => reject(new Error('Tab closed before load')))
        );
      });
    }

    function delay(ms, state) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (state.cancelCurrent === onCancel) state.cancelCurrent = null;
          resolve();
        }, ms);
        const onCancel = () => {
          clearTimeout(timer);
          if (state.cancelCurrent === onCancel) state.cancelCurrent = null;
          reject(new Error('browser_fetch_cancelled'));
        };
        state.cancelCurrent = onCancel;
      });
    }

    async function runEphemeral(url, state, windowId) {
      const previous = ephemeralTail;
      let release;
      ephemeralTail = new Promise((resolve) => { release = resolve; });
      await previous.catch(() => {});
      try {
        throwIfCancelled(state);
        const createProperties = { url, active: false };
        if (typeof windowId === 'number') createProperties.windowId = windowId;
        const created = await chromeApi.tabs.create(createProperties);
        if (!created || typeof created.id !== 'number') return failure('Could not open a background browser tab');
        state.tabId = created.id;
        state.ephemeral = true;
        throwIfCancelled(state);
        await waitForTabComplete(created.id, state);
        await delay(isSessionFirstUrl(url) ? SESSION_POST_LOAD_MS : 800, state);
        let result = await extractFromTab(created.id, state);
        if (!result.ok && result.errorCode === 'parse_empty' && isSessionFirstUrl(url)) {
          await delay(SESSION_POST_LOAD_MS, state);
          result = await extractFromTab(created.id, state);
        }
        return result;
      } catch (error) {
        if (state.cancelled || (error && error.message === 'browser_fetch_cancelled')) {
          return failure('Fetch cancelled');
        }
        return failure(error instanceof Error ? error.message : String(error));
      } finally {
        if (state.ephemeral && typeof state.tabId === 'number') {
          await chromeApi.tabs.remove(state.tabId).catch(() => {});
        }
        state.tabId = undefined;
        state.ephemeral = false;
        release();
      }
    }

    async function extract(input) {
      const requestId = input && String(input.requestId || '');
      const url = input && String(input.url || '').trim();
      if (!requestId || !isScriptableUrl(url)) {
        return failure('Browser fetch requires a valid request ID and http(s) or file URL', 'excluded');
      }
      pruneCancellationTombstones();
      const wasCancelled = cancelledBeforeStart.delete(requestId);
      const state = {
        requestId,
        cancelled: wasCancelled,
        cancelCurrent: null,
        tabId: undefined,
        ephemeral: false,
      };
      requests.set(requestId, state);
      try {
        const candidateIds = [input.tabId, input.sidePanelHostTabId]
          .filter((value, index, all) => typeof value === 'number' && all.indexOf(value) === index);
        for (const candidateId of candidateIds) {
          throwIfCancelled(state);
          const tab = await chromeApi.tabs.get(candidateId).catch(() => null);
          if (!tab || !isScriptableUrl(tab.url)) continue;
          const matches = await tabMatches(tab, url);
          const explicitSameHost = candidateId === input.tabId && sameHost(tab.url, url);
          if (matches || explicitSameHost || sharesSessionPrefix(tab.url, url)) {
            return await extractFromTab(candidateId, state);
          }
        }

        throwIfCancelled(state);
        const matching = await findMatchingTab(
          url,
          input.mode === 'active' ? 'active' : 'any',
          input.windowId
        );
        if (matching && typeof matching.id === 'number') {
          return await extractFromTab(matching.id, state);
        }
        if (input.allowEphemeral === true) return await runEphemeral(url, state, input.windowId);
        return failure('No open browser tab matches this URL');
      } catch (error) {
        if (state.cancelled || (error && error.message === 'browser_fetch_cancelled')) {
          return failure('Fetch cancelled');
        }
        return failure(error instanceof Error ? error.message : String(error));
      } finally {
        if (requests.get(requestId) === state) requests.delete(requestId);
      }
    }

    async function cancel(requestId) {
      const normalizedRequestId = String(requestId || '');
      const state = requests.get(normalizedRequestId);
      if (!state) {
        pruneCancellationTombstones();
        if (normalizedRequestId) cancelledBeforeStart.set(normalizedRequestId, Date.now());
        return { ok: true, active: false };
      }
      state.cancelled = true;
      if (typeof state.cancelCurrent === 'function') state.cancelCurrent();
      if (state.ephemeral && typeof state.tabId === 'number') {
        await chromeApi.tabs.remove(state.tabId).catch(() => {});
      }
      return { ok: true, active: true };
    }

    return {
      extract,
      cancel,
      _test: { normalizeUrl, urlsMatch, sharesSessionPrefix },
    };
  }

  root.HomebaseBrowserFetchService = { createBrowserFetchService };
})(globalThis);
