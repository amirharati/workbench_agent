import { buildRedirectContext } from '../enrichment/fetchRedirect';
import { htmlToMarkdown } from '../enrichment/htmlExtract';
import { extractPdfText } from '../enrichment/pdfTextExtract';
import { jinaProvider } from '../enrichment/providers/jina';
import { syndicationProvider } from '../enrichment/providers/syndication';
import type { FetchProviderResult } from '../enrichment/providers/types';
import { browserFetchHeaders } from '../enrichment/providers/xCdn';
import type { EnrichmentErrorCode } from '../enrichment/types';
import { timedAbortSignal } from '../enrichment/fetchAbort';
import { ENRICHMENT_DEFAULTS } from '../enrichment/types';
import { captureBrowserEvidenceV2, readDocumentBytesV2 } from './browserClient';
import { evaluateCandidates } from './evaluator';
import { remoteDocumentTargetsV2 } from './documentTargets';
import { candidatesFromBrowserEvidence } from './parsers';
import type {
  AcquisitionCandidateResult,
  AcquisitionModality,
  AcquisitionPrivacy,
  AcquisitionRequest,
  AcquisitionResult,
  TranscriptState,
} from './types';

function isFileUrl(url: string): boolean {
  return /^file:\/\//i.test(url.trim());
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(?:$|[?#])/i.test(url);
}

function modalityFor(request: AcquisitionRequest): AcquisitionModality {
  if (isFileUrl(request.url)) return isPdfUrl(request.url) ? 'pdf' : 'local-file';
  if (isPdfUrl(request.url)) return 'pdf';
  if (request.sourceKind === 'video') return 'video-metadata';
  if (request.sourceKind === 'x') return 'social';
  return 'html';
}

function privacyFor(request: AcquisitionRequest, winner?: AcquisitionCandidateResult): AcquisitionPrivacy {
  if (isFileUrl(request.url)) return 'local';
  if (winner?.provider.startsWith('authenticated-chrome')) return 'authenticated';
  return 'public';
}

function providerCandidate(
  id: string,
  provider: string,
  external: boolean,
  startedAt: number,
  result: FetchProviderResult
): AcquisitionCandidateResult {
  return {
    id,
    provider,
    external,
    applicable: true,
    ok: result.ok,
    markdown: result.markdown,
    title: result.title,
    previewImage: result.previewImage,
    requestedUrl: result.requestedUrl,
    finalUrl: result.finalUrl,
    errorCode: result.errorCode,
    error: result.error,
    durationMs: Date.now() - startedAt,
    rawBytesApprox: result.rawBytesApprox,
  };
}

async function browserCandidates(request: AcquisitionRequest): Promise<AcquisitionCandidateResult[]> {
  const startedAt = Date.now();
  const response = await captureBrowserEvidenceV2(request.url, {
    preferredTabId: request.preferredTabId,
    browserWindowId: request.browserWindowId,
    signal: request.signal,
  });
  if (!response.ok || !response.evidence) {
    return [{
      id: 'browser-visible',
      provider: 'authenticated-chrome',
      external: false,
      applicable: true,
      ok: false,
      errorCode: response.errorCode,
      error: response.error || 'Browser evidence capture failed',
      durationMs: Date.now() - startedAt,
    }];
  }
  return candidatesFromBrowserEvidence(response.evidence);
}

async function directHttpCandidate(request: AcquisitionRequest): Promise<AcquisitionCandidateResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(request.url, {
      method: 'GET',
      credentials: 'include',
      redirect: 'follow',
      headers: browserFetchHeaders(),
      signal: request.signal,
    });
    if (!response.ok) {
      return {
        id: 'direct-http', provider: 'direct-http', external: false, applicable: true, ok: false,
        errorCode: response.status === 401 || response.status === 403 ? 'auth_required' : 'provider_error',
        error: `Direct HTTP ${response.status}`,
        durationMs: Date.now() - startedAt,
      };
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('application/pdf')) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const parsed = await extractPdfText(bytes, {
        signal: request.signal,
        url: response.url || request.url,
        maxBytes: null,
      });
      return {
        id: 'pdfjs', provider: 'direct-http+pdfjs', external: false, applicable: true,
        ok: Boolean(parsed.markdown.trim()), markdown: parsed.markdown, title: parsed.title,
        finalUrl: response.url || request.url, durationMs: Date.now() - startedAt,
        rawBytesApprox: bytes.byteLength,
      };
    }
    const html = await response.text();
    const parsed = htmlToMarkdown(html, response.url || request.url);
    return {
      id: 'direct-http', provider: 'direct-http', external: false, applicable: true,
      ok: Boolean(parsed?.markdown.trim()), markdown: parsed?.markdown, title: parsed?.title,
      previewImage: parsed?.previewImage, finalUrl: response.url || request.url,
      errorCode: parsed ? undefined : 'parse_empty', error: parsed ? undefined : 'No readable direct HTML',
      durationMs: Date.now() - startedAt,
      rawBytesApprox: html.length,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return {
      id: 'direct-http', provider: 'direct-http', external: false, applicable: true, ok: false,
      errorCode: 'network', error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function documentCandidate(request: AcquisitionRequest): Promise<AcquisitionCandidateResult> {
  const startedAt = Date.now();
  const response = await readDocumentBytesV2(request.url, {
    preferredTabId: request.preferredTabId,
    browserWindowId: request.browserWindowId,
    signal: request.signal,
    documentTargets: isFileUrl(request.url) ? undefined : remoteDocumentTargetsV2(request.url),
  });
  if (!response.ok || !response.bytes) {
    return {
      id: 'pdfjs', provider: isFileUrl(request.url) ? 'local-file+pdfjs' : 'authenticated-chrome+pdfjs',
      external: false, applicable: true, ok: false,
      errorCode: response.errorCode, error: response.error || 'Could not read document bytes',
      durationMs: Date.now() - startedAt,
    };
  }
  try {
    const parsed = await extractPdfText(response.bytes, {
      signal: request.signal,
      url: response.finalUrl || request.url,
      maxBytes: null,
    });
    return {
      id: 'pdfjs', provider: isFileUrl(request.url) ? 'local-file+pdfjs' : 'authenticated-chrome+pdfjs',
      external: false, applicable: true, ok: Boolean(parsed.markdown.trim()),
      markdown: parsed.markdown, title: parsed.title, finalUrl: response.finalUrl || request.url,
      errorCode: parsed.markdown.trim() ? undefined : 'parse_empty',
      error: parsed.markdown.trim() ? undefined : 'PDF contains no selectable text',
      durationMs: Date.now() - startedAt, rawBytesApprox: response.bytes.byteLength,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return {
      id: 'pdfjs', provider: isFileUrl(request.url) ? 'local-file+pdfjs' : 'authenticated-chrome+pdfjs',
      external: false, applicable: true, ok: false, errorCode: 'parse_empty',
      error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt,
    };
  }
}

async function jinaCandidate(request: AcquisitionRequest): Promise<AcquisitionCandidateResult> {
  const startedAt = Date.now();
  return providerCandidate('jina', 'jina', true, startedAt, await jinaProvider.fetchUrl({
    url: request.url,
    normalizedUrl: request.normalizedUrl,
    hints: { sourceKind: request.sourceKind, requestedUrl: request.url },
    signal: request.signal,
  }));
}

async function xCandidate(request: AcquisitionRequest): Promise<AcquisitionCandidateResult> {
  const startedAt = Date.now();
  return providerCandidate('x-syndication', 'x-syndication', true, startedAt, await syndicationProvider.fetchUrl({
    url: request.url,
    normalizedUrl: request.normalizedUrl,
    hints: {
      sourceKind: request.sourceKind,
      requestedUrl: request.url,
      browserWindowId: request.browserWindowId,
    },
    signal: request.signal,
  }));
}

function failureFromCandidates(candidates: AcquisitionCandidateResult[]): {
  errorCode: EnrichmentErrorCode;
  error: string;
} {
  const meaningful = candidates.find((candidate) => candidate.errorCode && candidate.error);
  return {
    errorCode: meaningful?.errorCode ?? 'parse_empty',
    error: meaningful?.error ?? 'No acquisition candidate produced substantive content',
  };
}

async function acquireContentWithinDeadline(
  request: AcquisitionRequest,
  userSignal?: AbortSignal
): Promise<AcquisitionResult> {
  if (request.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const modality = modalityFor(request);
  const candidateGroups: Array<Promise<AcquisitionCandidateResult | AcquisitionCandidateResult[]>> = [];

  if (modality === 'pdf') {
    candidateGroups.push(documentCandidate(request));
    if (!isFileUrl(request.url) && !request.tabSessionOnly) candidateGroups.push(jinaCandidate(request));
  } else {
    candidateGroups.push(browserCandidates(request));
    if (isHttpUrl(request.url) && !request.tabSessionOnly) {
      if (request.sourceKind === 'x') candidateGroups.push(xCandidate(request));
      else candidateGroups.push(directHttpCandidate(request), jinaCandidate(request));
    }
  }

  const settled = await Promise.allSettled(candidateGroups);
  const candidates: AcquisitionCandidateResult[] = [];
  for (const row of settled) {
    if (row.status === 'fulfilled') {
      candidates.push(...(Array.isArray(row.value) ? row.value : [row.value]));
    } else {
      candidates.push({
        id: 'candidate-exception', provider: 'candidate-runner', external: false, applicable: true,
        ok: false, errorCode: 'provider_error',
        error: row.reason instanceof Error ? row.reason.message : String(row.reason), durationMs: 0,
      });
    }
  }
  if (request.signal?.aborted) {
    if (userSignal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    return {
      ok: false,
      engine: 'v2',
      requestedUrl: request.url,
      errorCode: 'timeout',
      error: `Acquisition exceeded ${Math.round(ENRICHMENT_DEFAULTS.fetchOverallTimeoutMs / 1_000)} seconds`,
      fetchSourceId: 'acquisition-v2',
      modality,
      privacy: privacyFor(request),
      transcriptState: request.sourceKind === 'video' ? 'not_available' : 'not_applicable',
      candidates,
    };
  }

  const evaluated = evaluateCandidates(candidates, request.url);
  const winner = evaluated.winner;
  const transcriptState: TranscriptState = winner?.transcriptState ?? (
    request.sourceKind === 'video' ? 'not_available' : 'not_applicable'
  );
  if (!winner?.markdown) {
    const failed = failureFromCandidates(evaluated.candidates);
    return {
      ok: false, engine: 'v2', requestedUrl: request.url, errorCode: failed.errorCode,
      error: failed.error, fetchSourceId: 'acquisition-v2', modality,
      privacy: privacyFor(request), transcriptState, candidates: evaluated.candidates,
    };
  }

  const finalUrl = winner.finalUrl || request.url;
  return {
    ok: true,
    engine: 'v2',
    markdown: winner.markdown,
    title: winner.title,
    previewImage: winner.previewImage,
    requestedUrl: request.url,
    finalUrl,
    rawBytesApprox: winner.rawBytesApprox ?? new TextEncoder().encode(winner.markdown).length,
    fetchSourceId: `v2:${winner.provider}`,
    modality,
    privacy: privacyFor(request, winner),
    transcriptState,
    winner: winner.id,
    candidates: evaluated.candidates,
  };
}

export async function acquireContentV2(request: AcquisitionRequest): Promise<AcquisitionResult> {
  const deadline = timedAbortSignal(ENRICHMENT_DEFAULTS.fetchOverallTimeoutMs, request.signal);
  try {
    return await acquireContentWithinDeadline(
      { ...request, signal: deadline.signal },
      request.signal
    );
  } finally {
    deadline.dispose();
  }
}

export function acquisitionResultToFetchResult(result: AcquisitionResult): FetchProviderResult {
  return {
    ok: result.ok,
    markdown: result.markdown,
    title: result.title,
    previewImage: result.previewImage,
    requestedUrl: result.requestedUrl,
    finalUrl: result.finalUrl,
    redirectContext: buildRedirectContext(result.requestedUrl, result.finalUrl ?? result.requestedUrl),
    errorCode: result.errorCode,
    error: result.error,
    rawBytesApprox: result.rawBytesApprox,
    fetchSourceId: result.fetchSourceId,
  };
}
