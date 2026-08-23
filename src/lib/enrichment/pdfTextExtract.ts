const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 250;
const MAX_PDF_TEXT_CHARS = 180_000;

type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

let pdfModulePromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

async function loadPdfModule(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  if (!pdfModulePromise) {
    pdfModulePromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfModulePromise;
}

function abortError(): DOMException {
  return new DOMException('PDF extraction cancelled', 'AbortError');
}

function pageText(items: PdfTextItem[]): string {
  let text = '';
  for (const item of items) {
    const value = item.str?.replace(/\s+/g, ' ').trim();
    if (value) {
      if (text && !text.endsWith('\n') && !text.endsWith(' ')) text += ' ';
      text += value;
    }
    if (item.hasEOL && text && !text.endsWith('\n')) text += '\n';
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export type PdfTextExtractResult = {
  markdown: string;
  title?: string;
  pageCount: number;
  truncated: boolean;
};

/** Decode an already-authorized PDF response; no second network/provider hop. */
export async function extractPdfText(
  bytes: Uint8Array,
  options?: { signal?: AbortSignal; url?: string }
): Promise<PdfTextExtractResult> {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF is too large to extract (${Math.ceil(bytes.byteLength / 1024 / 1024)} MB)`);
  }
  if (options?.signal?.aborted) throw abortError();

  const pdfjs = await loadPdfModule();
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    docBaseUrl: options?.url,
    useSystemFonts: true,
    isOffscreenCanvasSupported: false,
  });
  const onAbort = () => void loadingTask.destroy();
  options?.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const pdf = await loadingTask.promise;
    const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const sections: string[] = [];
    let textChars = 0;
    let truncated = pdf.numPages > pageLimit;

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      if (options?.signal?.aborted) throw abortError();
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = pageText(content.items as PdfTextItem[]);
      page.cleanup();
      if (!text) continue;

      const remaining = MAX_PDF_TEXT_CHARS - textChars;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const included = text.slice(0, remaining);
      sections.push(`## Page ${pageNumber}\n\n${included}`);
      textChars += included.length;
      if (included.length < text.length) {
        truncated = true;
        break;
      }
    }

    const metadata = await pdf.getMetadata().catch(() => null);
    const info = metadata?.info as { Title?: unknown } | undefined;
    const title = typeof info?.Title === 'string' ? info.Title.trim() || undefined : undefined;
    const pageCount = pdf.numPages;
    await pdf.cleanup();

    let markdown = sections.join('\n\n').trim();
    if (title) markdown = `# ${title}\n\n${markdown}`.trim();
    if (truncated) {
      markdown += '\n\n---\n\n[PDF text truncated for enrichment.]';
    }
    return { markdown, title, pageCount, truncated };
  } finally {
    options?.signal?.removeEventListener('abort', onAbort);
    await loadingTask.destroy().catch(() => undefined);
  }
}
