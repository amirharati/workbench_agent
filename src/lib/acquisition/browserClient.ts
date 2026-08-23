import type {
  BrowserAcquisitionResponseV2,
  BrowserEvidenceV2,
  RemoteDocumentTargetV2,
} from './types';

const TARGET = 'acquisition-v2-browser';

function requestId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function cancelled(): DOMException {
  return new DOMException('Cancelled', 'AbortError');
}

async function sendCancellable<T extends BrowserAcquisitionResponseV2>(
  action: 'capture' | 'read-document',
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) throw cancelled();
  const id = requestId(action);
  const onAbort = () => {
    void chrome.runtime.sendMessage({ target: TARGET, action: 'cancel', requestId: id }).catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await chrome.runtime.sendMessage({
      target: TARGET,
      action,
      requestId: id,
      ...payload,
    }) as T | undefined;
    if (signal?.aborted) throw cancelled();
    return response ?? ({ ok: false, error: 'Acquisition browser service did not respond' } as T);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function captureBrowserEvidenceV2(
  url: string,
  options?: {
    preferredTabId?: number;
    browserWindowId?: number;
    signal?: AbortSignal;
  }
): Promise<BrowserAcquisitionResponseV2 & { evidence?: BrowserEvidenceV2 }> {
  return sendCancellable('capture', {
    url,
    preferredTabId: options?.preferredTabId,
    windowId: options?.browserWindowId,
  }, options?.signal);
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function readDocumentBytesV2(
  url: string,
  options?: {
    preferredTabId?: number;
    browserWindowId?: number;
    signal?: AbortSignal;
    documentTargets?: RemoteDocumentTargetV2[];
  }
): Promise<BrowserAcquisitionResponseV2> {
  const response = await sendCancellable('read-document', {
    url,
    preferredTabId: options?.preferredTabId,
    windowId: options?.browserWindowId,
    documentTargets: options?.documentTargets,
  }, options?.signal);
  if (!response.ok) return response;
  if (response.base64) {
    return { ...response, bytes: decodeBase64(response.base64), base64: undefined };
  }
  const byteLength = response.byteLength;
  if (!response.documentToken || !Number.isSafeInteger(byteLength) || byteLength == null || byteLength < 0) {
    return { ...response, ok: false, error: 'Document transfer did not provide readable bytes' };
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  try {
    while (offset < bytes.byteLength) {
      if (options?.signal?.aborted) throw cancelled();
      const chunk = await chrome.runtime.sendMessage({
        target: TARGET,
        action: 'read-document-chunk',
        documentToken: response.documentToken,
        offset,
      }) as BrowserAcquisitionResponseV2 | undefined;
      if (!chunk?.ok || typeof chunk.base64 !== 'string') {
        return {
          ...response,
          ok: false,
          errorCode: chunk?.errorCode,
          error: chunk?.error || 'Document transfer stopped before completion',
        };
      }
      const decoded = decodeBase64(chunk.base64);
      if (decoded.byteLength === 0 || offset + decoded.byteLength > bytes.byteLength) {
        return { ...response, ok: false, error: 'Document transfer returned an invalid chunk' };
      }
      bytes.set(decoded, offset);
      offset += decoded.byteLength;
    }
    return {
      ...response,
      bytes,
      base64: undefined,
      documentToken: undefined,
    };
  } finally {
    await chrome.runtime.sendMessage({
      target: TARGET,
      action: 'release-document',
      documentToken: response.documentToken,
    }).catch(() => {});
  }
}
