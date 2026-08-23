import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDocumentBytesV2 } from './browserClient';

describe('v2 browser document client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reassembles staged document chunks and always releases the service-worker buffer', async () => {
    const sendMessage = vi.fn(async (message: Record<string, unknown>) => {
      if (message.action === 'read-document') {
        return {
          ok: true,
          documentToken: 'document-1',
          byteLength: 5,
          contentType: 'application/pdf',
          finalUrl: 'file:///paper.pdf',
        };
      }
      if (message.action === 'read-document-chunk') {
        return {
          ok: true,
          base64: btoa(String.fromCharCode(37, 80, 68, 70, 45)),
          offset: 0,
          byteLength: 5,
          done: true,
        };
      }
      if (message.action === 'release-document') return { ok: true };
      throw new Error(`Unexpected action: ${String(message.action)}`);
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const result = await readDocumentBytesV2('file:///paper.pdf');
    expect(result.ok).toBe(true);
    expect([...result.bytes!]).toEqual([37, 80, 68, 70, 45]);
    expect(sendMessage).toHaveBeenLastCalledWith({
      target: 'acquisition-v2-browser',
      action: 'release-document',
      documentToken: 'document-1',
    });
  });
});
