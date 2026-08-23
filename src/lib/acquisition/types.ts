import type { EnrichmentErrorCode, SourceKind } from '../enrichment/types';

export type FetchEngine = 'legacy' | 'v2';
export type AcquisitionPrivacy = 'public' | 'authenticated' | 'local';
export type AcquisitionModality =
  | 'html'
  | 'pdf'
  | 'local-file'
  | 'video-metadata'
  | 'social'
  | 'unknown';
export type TranscriptState = 'available' | 'not_available' | 'not_applicable';

export type PageMetadataV2 = {
  title?: string;
  structuredTitle?: string;
  headingTitle?: string;
  description?: string;
  canonicalUrl?: string;
  previewImage?: string;
  author?: string;
  published?: string;
  jsonLd: string[];
};

export type PageFrameEvidenceV2 = {
  frameId: number;
  url: string;
  title?: string;
  html: string;
  visibleText: string;
  semanticText: string;
  metadata: PageMetadataV2;
  transcript?: string;
  transcriptState: TranscriptState;
  truncated: boolean;
};

export type BrowserEvidenceV2 = {
  requestedUrl: string;
  finalUrl: string;
  tabId?: number;
  usedExistingTab: boolean;
  frames: PageFrameEvidenceV2[];
};

export type RemoteDocumentTargetV2 = {
  url: string;
  sessionUrl: string;
};

export type AcquisitionCandidateResult = {
  id: string;
  provider: string;
  external: boolean;
  applicable: boolean;
  ok: boolean;
  markdown?: string;
  title?: string;
  previewImage?: string;
  requestedUrl?: string;
  finalUrl?: string;
  errorCode?: EnrichmentErrorCode;
  error?: string;
  durationMs: number;
  rawBytesApprox?: number;
  qualityScore?: number;
  rejectionReason?: string;
  transcriptState?: TranscriptState;
  diagnostics?: Record<string, string | number | boolean | undefined>;
};

export type AcquisitionRequest = {
  itemId: string;
  url: string;
  normalizedUrl: string;
  sourceKind: SourceKind;
  signal?: AbortSignal;
  preferredTabId?: number;
  browserWindowId?: number;
  tabSessionOnly?: boolean;
};

export type AcquisitionResult = {
  ok: boolean;
  engine: 'v2';
  markdown?: string;
  title?: string;
  previewImage?: string;
  requestedUrl: string;
  finalUrl?: string;
  errorCode?: EnrichmentErrorCode;
  error?: string;
  rawBytesApprox?: number;
  fetchSourceId: string;
  modality: AcquisitionModality;
  privacy: AcquisitionPrivacy;
  transcriptState: TranscriptState;
  winner?: string;
  candidates: AcquisitionCandidateResult[];
};

export type BrowserAcquisitionResponseV2 = {
  ok: boolean;
  evidence?: BrowserEvidenceV2;
  bytes?: Uint8Array;
  base64?: string;
  documentToken?: string;
  byteLength?: number;
  offset?: number;
  done?: boolean;
  contentType?: string;
  finalUrl?: string;
  errorCode?: EnrichmentErrorCode;
  error?: string;
};
