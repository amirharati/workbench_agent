import type { EnrichmentErrorCode } from '../types';
import { classifySourceKind } from '../eligibility';
import { describeHttpFetchError, httpStatusToErrorCode } from '../errorMessages';
import { cleanXMarkdown, detectFetchFailure, stripProviderWrapper } from '../fetchQuality';
import { normalizeVideoMarkdown } from '../videoExtract';
import type { FetchProvider } from './types';

const JINA_BASE = 'https://r.jina.ai/';

export const jinaProvider: FetchProvider = {
  id: 'jina',
  async fetchUrl({ url, signal }) {
    const target = `${JINA_BASE}${url}`;
    try {
      const res = await fetch(target, {
        method: 'GET',
        headers: { Accept: 'text/markdown, text/plain, */*' },
        signal,
      });

      if (res.status === 429) {
        return { ok: false, errorCode: 'rate_limited', error: describeHttpFetchError(429, 'Jina') };
      }
      if (!res.ok) {
        const bodyPreview = await res.text().catch(() => '');
        const errorCode = httpStatusToErrorCode(res.status);
        return {
          ok: false,
          errorCode,
          error: describeHttpFetchError(res.status, 'Jina', bodyPreview),
        };
      }

      let text = stripProviderWrapper(await res.text());
      if (classifySourceKind(url) === 'x') {
        text = cleanXMarkdown(text);
      } else if (classifySourceKind(url) === 'video') {
        const normalized = normalizeVideoMarkdown(text);
        if (normalized) text = normalized;
      }
      const title = extractTitleFromMarkdown(text);
      return {
        ok: true,
        markdown: text,
        title,
        rawBytesApprox: new TextEncoder().encode(text).length,
        fetchSourceId: 'jina',
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { ok: false, errorCode: 'timeout', error: 'Jina fetch timed out' };
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return { ok: false, errorCode: 'network', error: 'Network error reaching Jina reader' };
      }
      return { ok: false, errorCode: 'network', error: msg || 'Jina fetch failed' };
    }
  },
};

function extractTitleFromMarkdown(md: string): string | undefined {
  const line = md.split('\n').find((l) => /^#\s+/.test(l.trim()));
  if (!line) return undefined;
  return line.replace(/^#\s+/, '').trim().slice(0, 300) || undefined;
}

/** @deprecated use detectFetchFailure from fetchQuality */
export function detectAuthOrEmpty(markdown: string): EnrichmentErrorCode | undefined {
  return detectFetchFailure(markdown);
}
