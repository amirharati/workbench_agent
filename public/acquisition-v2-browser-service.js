/** Narrow Chrome capability provider for content-acquisition service v2. */
(function installAcquisitionV2BrowserService(root) {
  const TAB_LOAD_TIMEOUT_MS = 45_000;
  const POST_LOAD_MS = 1_000;
  const DOCUMENT_CHUNK_BYTES = 2 * 1024 * 1024;
  const DOCUMENT_BUFFER_TTL_MS = 2 * 60_000;

  function createAcquisitionV2BrowserService(chromeApi) {
    const active = new Map();
    const cancelledBeforeStart = new Map();
    const documentBuffers = new Map();
    let ephemeralTail = Promise.resolve();

    function fail(error, errorCode = 'provider_error') {
      return { ok: false, error, errorCode };
    }

    function pruneDocumentBuffers() {
      const now = Date.now();
      for (const [token, row] of documentBuffers) {
        if (row.expiresAt <= now) documentBuffers.delete(token);
      }
    }

    function stageDocument(bytes, metadata) {
      pruneDocumentBuffers();
      const documentToken = crypto.randomUUID();
      documentBuffers.set(documentToken, {
        bytes,
        expiresAt: Date.now() + DOCUMENT_BUFFER_TTL_MS,
      });
      return {
        ok: true,
        documentToken,
        byteLength: bytes.byteLength,
        contentType: metadata.contentType || '',
        finalUrl: metadata.finalUrl,
      };
    }

    function isAllowedUrl(url) {
      return /^(https?|file):\/\//i.test(String(url || '').trim());
    }

    function normalize(url) {
      try {
        const parsed = new URL(String(url || '').trim());
        parsed.hash = '';
        if (parsed.protocol !== 'file:') {
          parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
          for (const key of [...parsed.searchParams.keys()]) {
            if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) parsed.searchParams.delete(key);
          }
        }
        return parsed.href.replace(/\/$/, '');
      } catch {
        return String(url || '').trim();
      }
    }

    function exactMatch(left, right) {
      return normalize(left) === normalize(right);
    }

    function sameOrigin(left, right) {
      try {
        return new URL(left).origin === new URL(right).origin;
      } catch {
        return false;
      }
    }

    function remoteDocumentTargets(input) {
      const targets = [];
      try {
        for (const target of Array.isArray(input.documentTargets) ? input.documentTargets : []) {
          if (!/^https?:\/\//i.test(String(target?.url || ''))) continue;
          if (!/^https?:\/\//i.test(String(target?.sessionUrl || ''))) continue;
          targets.push({ url: String(target.url), sessionUrl: String(target.sessionUrl) });
        }
        if (targets.length) return targets;
        const parsed = new URL(input.url);
        targets.push({ url: input.url, sessionUrl: `${parsed.origin}/` });
      } catch {
        targets.push({ url: input.url, sessionUrl: input.url });
      }
      return targets;
    }

    function throwIfCancelled(state) {
      if (state.cancelled) throw new DOMException('Cancelled', 'AbortError');
    }

    function delay(ms, state) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        state.cancelCurrent = () => {
          clearTimeout(timer);
          reject(new DOMException('Cancelled', 'AbortError'));
        };
      }).finally(() => {
        state.cancelCurrent = null;
      });
    }

    async function waitForComplete(tabId, state) {
      const current = await chromeApi.tabs.get(tabId).catch(() => null);
      if (current?.status === 'complete') return;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('Browser tab did not finish loading')), TAB_LOAD_TIMEOUT_MS);
        const listener = (updatedId, changeInfo) => {
          if (updatedId === tabId && changeInfo.status === 'complete') finish();
        };
        function finish(error) {
          clearTimeout(timeout);
          chromeApi.tabs.onUpdated.removeListener(listener);
          state.cancelCurrent = null;
          error ? reject(error) : resolve();
        }
        state.cancelCurrent = () => finish(new DOMException('Cancelled', 'AbortError'));
        chromeApi.tabs.onUpdated.addListener(listener);
      });
    }

    async function serializeEphemeral(work) {
      const previous = ephemeralTail;
      let release;
      ephemeralTail = new Promise((resolve) => { release = resolve; });
      await previous.catch(() => {});
      try {
        return await work();
      } finally {
        release();
      }
    }

    async function preferredOrExactTab(input) {
      const preferredIds = [input.preferredTabId, input.sidePanelHostTabId]
        .filter((value, index, all) => typeof value === 'number' && all.indexOf(value) === index);
      for (const id of preferredIds) {
        const tab = await chromeApi.tabs.get(id).catch(() => null);
        if (tab?.url && exactMatch(tab.url, input.url)) return tab;
      }
      const query = typeof input.windowId === 'number' ? { windowId: input.windowId } : {};
      const tabs = await chromeApi.tabs.query(query);
      return tabs.find((tab) => tab.url && exactMatch(tab.url, input.url)) || null;
    }

    async function captureTab(tab, state, allowTranscriptInteraction) {
      throwIfCancelled(state);
      await chromeApi.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['acquisition-v2-page-capture.js'],
      });
      throwIfCancelled(state);
      const rows = await chromeApi.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: async (allowInteraction) => {
          if (typeof globalThis.workbenchCapturePageEvidenceV2 !== 'function') {
            return { ok: false, error: 'v2_capture_script_missing' };
          }
          return globalThis.workbenchCapturePageEvidenceV2({ allowTranscriptInteraction: allowInteraction });
        },
        args: [allowTranscriptInteraction],
      });
      throwIfCancelled(state);
      const frames = rows
        .filter((row) => row?.result?.ok)
        .map((row) => ({ frameId: row.frameId, ...row.result }))
        .sort((left, right) => left.frameId - right.frameId);
      if (!frames.length) return fail(rows[0]?.result?.error || 'No accessible page frame produced evidence', 'parse_empty');
      const latest = await chromeApi.tabs.get(tab.id).catch(() => tab);
      return {
        ok: true,
        evidence: {
          requestedUrl: state.url,
          finalUrl: latest?.url || tab.url || state.url,
          tabId: tab.id,
          usedExistingTab: !state.ephemeral,
          frames,
        },
      };
    }

    async function capture(input) {
      const requestId = String(input?.requestId || '');
      const url = String(input?.url || '').trim();
      if (!requestId || !isAllowedUrl(url)) return fail('Capture requires an HTTP(S) or local file URL', 'excluded');
      if (/^file:/i.test(url) && !(await chromeApi.extension.isAllowedFileSchemeAccess())) {
        return fail('Enable “Allow access to file URLs” in Homebase extension details, then retry', 'excluded');
      }
      const state = { requestId, url, cancelled: cancelledBeforeStart.delete(requestId), tabId: undefined, ephemeral: false, cancelCurrent: null };
      active.set(requestId, state);
      try {
        throwIfCancelled(state);
        const existing = await preferredOrExactTab(input);
        if (existing?.id != null) return await captureTab(existing, state, false);
        return await serializeEphemeral(async () => {
          throwIfCancelled(state);
          const created = await chromeApi.tabs.create({ url, active: false, windowId: input.windowId });
          if (created.id == null) return fail('Could not open an inactive acquisition tab');
          state.tabId = created.id;
          state.ephemeral = true;
          await waitForComplete(created.id, state);
          await delay(POST_LOAD_MS, state);
          return captureTab(created, state, true);
        });
      } catch (error) {
        if (state.cancelled || error?.name === 'AbortError') return fail('Cancelled', 'timeout');
        const message = error instanceof Error ? error.message : String(error);
        const restricted = /cannot access|chrome:|extension manifest|file url/i.test(message);
        return fail(restricted ? 'Chrome did not allow this page to be read' : message, restricted ? 'excluded' : 'provider_error');
      } finally {
        if (state.ephemeral && typeof state.tabId === 'number') {
          await chromeApi.tabs.remove(state.tabId).catch(() => {});
        }
        active.delete(requestId);
      }
    }

    function bytesToBase64(bytes) {
      let binary = '';
      const chunk = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
      }
      return btoa(binary);
    }

    async function readLocalDocument(url, state) {
      const allowed = await chromeApi.extension.isAllowedFileSchemeAccess();
      if (!allowed) {
        return fail('Enable “Allow access to file URLs” in Homebase extension details, then retry', 'excluded');
      }
      throwIfCancelled(state);
      try {
        const response = await fetch(url);
        if (!response.ok) return fail(`Local file read returned ${response.status}`, 'excluded');
        const bytes = new Uint8Array(await response.arrayBuffer());
        return stageDocument(bytes, {
          contentType: response.headers.get('content-type') || '',
          finalUrl: url,
        });
      } catch (error) {
        return fail(`Could not read the local file: ${error instanceof Error ? error.message : String(error)}`, 'excluded');
      }
    }

    async function fetchBytesInPage(tabId, url, state) {
      const pageToken = crypto.randomUUID();
      const rows = await chromeApi.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async (targetUrl, token) => {
          try {
            const response = await fetch(targetUrl, {
              credentials: 'include',
              redirect: 'follow',
              cache: 'default',
              headers: { Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' },
            });
            if (!response.ok) return { ok: false, status: response.status, error: `HTTP ${response.status}` };
            const bytes = new Uint8Array(await response.arrayBuffer());
            const contentType = response.headers.get('content-type') || '';
            const isPdf = /application\/pdf/i.test(contentType) || (
              bytes.byteLength >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-'
            );
            if (!isPdf) {
              return {
                ok: false,
                status: 403,
                error: 'Document request returned an HTML login or challenge page',
              };
            }
            const buffers = globalThis.__homebaseAcquisitionV2DocumentBuffers || new Map();
            globalThis.__homebaseAcquisitionV2DocumentBuffers = buffers;
            buffers.set(token, bytes);
            return {
              ok: true,
              pageToken: token,
              byteLength: bytes.byteLength,
              contentType,
              finalUrl: response.url || targetUrl,
            };
          } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
          }
        },
        args: [url, pageToken],
      });
      throwIfCancelled(state);
      const result = rows[0]?.result;
      if (result?.ok && result.pageToken && Number.isFinite(result.byteLength)) {
        const bytes = new Uint8Array(Number(result.byteLength));
        try {
          for (let offset = 0; offset < bytes.byteLength; offset += DOCUMENT_CHUNK_BYTES) {
            throwIfCancelled(state);
            const chunkRows = await chromeApi.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              func: (token, start, length) => {
                const source = globalThis.__homebaseAcquisitionV2DocumentBuffers?.get(token);
                if (!(source instanceof Uint8Array)) return { ok: false, error: 'Document buffer expired' };
                const slice = source.subarray(start, Math.min(start + length, source.byteLength));
                let binary = '';
                const block = 0x8000;
                for (let index = 0; index < slice.length; index += block) {
                  binary += String.fromCharCode(...slice.subarray(index, Math.min(index + block, slice.length)));
                }
                return { ok: true, base64: btoa(binary) };
              },
              args: [result.pageToken, offset, DOCUMENT_CHUNK_BYTES],
            });
            const chunkResult = chunkRows[0]?.result;
            if (!chunkResult?.ok || typeof chunkResult.base64 !== 'string') {
              return fail(chunkResult?.error || 'Could not transfer document bytes from the browser tab');
            }
            const binary = atob(chunkResult.base64);
            for (let index = 0; index < binary.length; index += 1) {
              bytes[offset + index] = binary.charCodeAt(index);
            }
          }
          return stageDocument(bytes, result);
        } finally {
          await chromeApi.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (token) => globalThis.__homebaseAcquisitionV2DocumentBuffers?.delete(token),
            args: [result.pageToken],
          }).catch(() => {});
        }
      }
      const status = Number(result?.status || 0);
      return fail(result?.error || 'Authenticated document fetch failed', status === 401 || status === 403 ? 'auth_required' : 'provider_error');
    }

    async function findSameOriginPage(input) {
      const preferredIds = [input.preferredTabId, input.sidePanelHostTabId]
        .filter((value, index, all) => typeof value === 'number' && all.indexOf(value) === index);
      for (const id of preferredIds) {
        const tab = await chromeApi.tabs.get(id).catch(() => null);
        if (tab?.url && /^https?:/i.test(tab.url) && sameOrigin(tab.url, input.url) && !/\.pdf(?:$|[?#])/i.test(tab.url)) return tab;
      }
      const query = typeof input.windowId === 'number' ? { windowId: input.windowId } : {};
      const tabs = await chromeApi.tabs.query(query);
      return tabs.find((tab) => tab.url && /^https?:/i.test(tab.url) && sameOrigin(tab.url, input.url) && !/\.pdf(?:$|[?#])/i.test(tab.url)) || null;
    }

    async function directDocumentFetch(url, state) {
      throwIfCancelled(state);
      try {
        const response = await fetch(url, {
          credentials: 'include',
          redirect: 'follow',
          cache: 'default',
          headers: {
            Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        if (!response.ok) {
          return fail(`HTTP ${response.status}`, response.status === 401 || response.status === 403 ? 'auth_required' : 'provider_error');
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || '';
        const isPdf = /application\/pdf/i.test(contentType) || (
          bytes.byteLength >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-'
        );
        if (!isPdf) return fail('Document request returned an HTML login or challenge page', 'auth_required');
        return stageDocument(bytes, { contentType, finalUrl: response.url || url });
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error), 'provider_error');
      }
    }

    async function readRemoteTarget(input, target, state) {
      const direct = await directDocumentFetch(target.url, state);
      if (direct.ok) return direct;
      const sessionInput = { ...input, url: target.sessionUrl };
      const existing = await findSameOriginPage(sessionInput);
      if (existing?.id != null) return fetchBytesInPage(existing.id, target.url, state);
      return serializeEphemeral(async () => {
        const created = await chromeApi.tabs.create({ url: target.sessionUrl, active: false, windowId: input.windowId });
        if (created.id == null) return fail('Could not open an authenticated document helper tab');
        state.tabId = created.id;
        state.ephemeral = true;
        try {
          await waitForComplete(created.id, state);
          await delay(POST_LOAD_MS, state);
          return await fetchBytesInPage(created.id, target.url, state);
        } finally {
          await chromeApi.tabs.remove(created.id).catch(() => {});
          if (state.tabId === created.id) {
            state.tabId = undefined;
            state.ephemeral = false;
          }
        }
      });
    }

    async function readRemoteDocument(input, state) {
      let lastFailure = fail('No document provider was applicable');
      for (const target of remoteDocumentTargets(input)) {
        throwIfCancelled(state);
        const result = await readRemoteTarget(input, target, state);
        if (result.ok) {
          // Alternate provider URLs are representations of the requested PDF,
          // not user-visible redirects to a different bookmark resource.
          return { ...result, finalUrl: input.url };
        }
        lastFailure = result;
      }
      return lastFailure;
    }

    function readDocumentChunk(input) {
      pruneDocumentBuffers();
      const token = String(input?.documentToken || '');
      const row = documentBuffers.get(token);
      if (!row) return fail('Document transfer expired; retry the fetch', 'provider_error');
      const offset = Math.max(0, Number(input?.offset || 0));
      if (!Number.isSafeInteger(offset) || offset > row.bytes.byteLength) {
        return fail('Invalid document transfer offset', 'provider_error');
      }
      row.expiresAt = Date.now() + DOCUMENT_BUFFER_TTL_MS;
      const bytes = row.bytes.subarray(offset, Math.min(offset + DOCUMENT_CHUNK_BYTES, row.bytes.byteLength));
      return {
        ok: true,
        base64: bytesToBase64(bytes),
        offset,
        byteLength: row.bytes.byteLength,
        done: offset + bytes.byteLength >= row.bytes.byteLength,
      };
    }

    function releaseDocument(input) {
      const token = String(input?.documentToken || '');
      if (token) documentBuffers.delete(token);
      return { ok: true };
    }

    async function readDocument(input) {
      const requestId = String(input?.requestId || '');
      const url = String(input?.url || '').trim();
      if (!requestId || !isAllowedUrl(url)) return fail('Document read requires an HTTP(S) or local file URL', 'excluded');
      const state = { requestId, url, cancelled: cancelledBeforeStart.delete(requestId), tabId: undefined, ephemeral: false, cancelCurrent: null };
      active.set(requestId, state);
      try {
        throwIfCancelled(state);
        return /^file:/i.test(url) ? await readLocalDocument(url, state) : await readRemoteDocument(input, state);
      } catch (error) {
        if (state.cancelled || error?.name === 'AbortError') return fail('Cancelled', 'timeout');
        return fail(error instanceof Error ? error.message : String(error));
      } finally {
        if (state.ephemeral && typeof state.tabId === 'number') await chromeApi.tabs.remove(state.tabId).catch(() => {});
        active.delete(requestId);
      }
    }

    async function cancel(requestId) {
      const id = String(requestId || '');
      const state = active.get(id);
      if (!state) {
        if (id) cancelledBeforeStart.set(id, Date.now());
        return { ok: true, active: false };
      }
      state.cancelled = true;
      if (typeof state.cancelCurrent === 'function') state.cancelCurrent();
      if (state.ephemeral && typeof state.tabId === 'number') await chromeApi.tabs.remove(state.tabId).catch(() => {});
      return { ok: true, active: true };
    }

    return {
      capture,
      readDocument,
      readDocumentChunk,
      releaseDocument,
      cancel,
      _test: { normalize, exactMatch, sameOrigin },
    };
  }

  root.HomebaseAcquisitionV2BrowserService = { createAcquisitionV2BrowserService };
})(globalThis);
