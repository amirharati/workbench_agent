import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

type BrowserService = {
  capture(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  readDocument(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  readDocumentChunk(input: Record<string, unknown>): Record<string, unknown>;
  releaseDocument(input: Record<string, unknown>): Record<string, unknown>;
  cancel(requestId: string): Promise<Record<string, unknown>>;
};

function loadFactory(): (chromeApi: unknown) => BrowserService {
  const source = readFileSync(
    new URL('../../../public/acquisition-v2-browser-service.js', import.meta.url),
    'utf8'
  );
  const scope: Record<string, unknown> = {};
  new Function('globalThis', source)(scope);
  return (scope.HomebaseAcquisitionV2BrowserService as {
    createAcquisitionV2BrowserService(chromeApi: unknown): BrowserService;
  }).createAcquisitionV2BrowserService;
}

function eventHook() {
  const listeners = new Set<(...args: unknown[]) => void>();
  return {
    addListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.delete(listener)),
  };
}

describe('v2 Chrome acquisition capability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reuses an exact tab and captures all accessible frames', async () => {
    const tab = { id: 9, url: 'https://private.example/article', status: 'complete' };
    const tabs = {
      get: vi.fn(async () => tab), query: vi.fn(async () => [tab]), create: vi.fn(),
      remove: vi.fn(), onUpdated: eventHook(),
    };
    const scripting = {
      executeScript: vi.fn(async (details: { files?: string[] }) => details.files ? [] : [
        { frameId: 0, result: { ok: true, url: tab.url, html: '<main>body</main>', visibleText: 'body', semanticText: 'body', metadata: { jsonLd: [] }, transcriptState: 'not_applicable', truncated: false } },
        { frameId: 2, result: { ok: true, url: 'https://frame.example', html: '<p>frame</p>', visibleText: 'frame', semanticText: 'frame', metadata: { jsonLd: [] }, transcriptState: 'not_applicable', truncated: false } },
      ]),
    };
    const service = loadFactory()({
      tabs, scripting,
      extension: { isAllowedFileSchemeAccess: vi.fn(async () => true) },
    });

    const result = await service.capture({ requestId: 'capture-1', url: tab.url });
    expect(result).toMatchObject({ ok: true, evidence: { usedExistingTab: true } });
    expect((result.evidence as { frames: unknown[] }).frames).toHaveLength(2);
    expect(tabs.create).not.toHaveBeenCalled();
    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 9, allFrames: true },
      files: ['acquisition-v2-page-capture.js'],
    });
  });

  it('reports the actionable Chrome permission for local documents', async () => {
    const service = loadFactory()({
      tabs: { get: vi.fn(), query: vi.fn(), create: vi.fn(), remove: vi.fn(), onUpdated: eventHook() },
      scripting: { executeScript: vi.fn() },
      extension: { isAllowedFileSchemeAccess: vi.fn(async () => false) },
    });

    const result = await service.readDocument({ requestId: 'local-1', url: 'file:///Users/test/paper.pdf' });
    expect(result).toMatchObject({ ok: false, errorCode: 'excluded' });
    expect(String(result.error)).toContain('Allow access to file URLs');
  });

  it('stages local documents larger than the old 25 MB transport limit and serves chunks', async () => {
    const bytes = new Uint8Array(25 * 1024 * 1024 + 17);
    bytes.set([37, 80, 68, 70, 45]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })));
    const service = loadFactory()({
      tabs: { get: vi.fn(), query: vi.fn(), create: vi.fn(), remove: vi.fn(), onUpdated: eventHook() },
      scripting: { executeScript: vi.fn() },
      extension: { isAllowedFileSchemeAccess: vi.fn(async () => true) },
    });

    const staged = await service.readDocument({
      requestId: 'local-large',
      url: 'file:///Users/test/large-paper.pdf',
    });
    expect(staged).toMatchObject({ ok: true, byteLength: bytes.byteLength });
    expect(staged).not.toHaveProperty('base64');

    const first = service.readDocumentChunk({
      documentToken: staged.documentToken,
      offset: 0,
    });
    expect(first).toMatchObject({ ok: true, offset: 0, done: false });
    expect(typeof first.base64).toBe('string');
    expect(service.releaseDocument({ documentToken: staged.documentToken })).toEqual({ ok: true });
  });

});
