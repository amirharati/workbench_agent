import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { extractPdfText } from './pdfTextExtract';

(globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: unknown } }).pdfjsWorker = {
  WorkerMessageHandler,
};

function minimalTextPdf(text: string): Uint8Array {
  const stream = `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('PDF text extraction', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('extracts selectable text without an external reader service', async () => {
    const result = await extractPdfText(minimalTextPdf('Homebase PDF extraction works'));
    expect(result.markdown).toContain('Homebase PDF extraction works');
    expect(result.pageCount).toBe(1);
  });

  it('falls back to the authenticated browser page when an extension fetch gets 403', async () => {
    const pdf = minimalTextPdf('Authenticated OpenReview PDF works');
    const sendMessage = vi.fn(async (message: { action?: string }) => {
      expect(message.action).toBe('fetch-pdf');
      return {
        ok: true,
        base64: bytesToBase64(pdf),
        contentType: 'application/pdf',
        finalUrl: 'https://openreview.net/pdf/paper.pdf',
      };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));
    const { localProvider } = await import('./providers/local');

    const result = await localProvider.fetchUrl({
      url: 'https://openreview.net/pdf/paper.pdf',
      normalizedUrl: 'https://openreview.net/pdf/paper.pdf',
      hints: { browserWindowId: 17 },
    });

    expect(result.ok, result.error).toBe(true);
    expect(result.fetchSourceId).toBe('tab-session-pdf');
    expect(result.markdown).toContain('Authenticated OpenReview PDF works');
  });

  it('retries an OpenReview file hash through the authenticated API endpoint', async () => {
    const pdf = minimalTextPdf('Authenticated OpenReview API PDF works');
    const messages: Array<{ action?: string; url?: string; sessionUrl?: string }> = [];
    const sendMessage = vi.fn(async (message: { action?: string; url?: string; sessionUrl?: string }) => {
      messages.push(message);
      if (
        message.url?.startsWith('https://openreview.net/') ||
        message.url?.endsWith('.pdf')
      ) {
        return { ok: false, errorCode: 'auth_required', error: 'HTTP 403' };
      }
      return {
        ok: true,
        base64: bytesToBase64(pdf),
        contentType: 'application/pdf',
        finalUrl: message.url,
      };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { fetchAuthenticatedPdf } = await import('./providers/local');
    const url = 'https://openreview.net/pdf/1cfaa7fe8d48f5b256d6894b0e27688521a274c9.pdf';

    const result = await fetchAuthenticatedPdf(url, { windowId: 17 });

    expect(result?.ok, result?.error).toBe(true);
    expect(result?.fetchSourceId).toBe('tab-session-pdf');
    expect(result?.finalUrl).toBe(url);
    expect(result?.markdown).toContain('Authenticated OpenReview API PDF works');
    expect(messages.map((message) => [message.url, message.sessionUrl])).toEqual([
      [url, 'https://openreview.net/'],
      [
        'https://api2.openreview.net/pdf/1cfaa7fe8d48f5b256d6894b0e27688521a274c9.pdf',
        'https://api2.openreview.net/notes?limit=1',
      ],
      [
        'https://api2.openreview.net/pdf/1cfaa7fe8d48f5b256d6894b0e27688521a274c9',
        'https://api2.openreview.net/notes?limit=1',
      ],
    ]);
  });

  const livePdfUrl = process.env.HOMEBASE_LIVE_PDF_URL;
  it.runIf(Boolean(livePdfUrl))(
    'extracts a live PDF through the local provider',
    async () => {
      const { localProvider } = await import('./providers/local');
      const result = await localProvider.fetchUrl({
        url: livePdfUrl!,
        normalizedUrl: livePdfUrl!,
      });
      expect(result.ok, result.error).toBe(true);
      expect(result.fetchSourceId).toBe('local-pdf');
      expect(result.markdown?.length ?? 0).toBeGreaterThan(1_000);
    },
    30_000
  );
});
