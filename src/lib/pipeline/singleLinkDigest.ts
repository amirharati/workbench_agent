import { loadAISettings } from '../ai/settings';
import { classifyIncremental } from '../categorization';
import { notifyDataChanged } from '../dataChangeNotifier';
import { getItem } from '../db';
import {
  enrichOne,
  getEnrichment,
  checkEligibility,
  type EnrichmentResult,
} from '../enrichment';
import { findTabForUrl, resolveTabSessionForUrl } from '../enrichment/tabSessionExtract';
import { needsClassifyForDigest } from './digestClassifyPolicy';

export type SingleLinkDigestPhase = 'check' | 'enrich' | 'extract' | 'classify' | 'done';

export interface SingleLinkDigestProgress {
  phase: SingleLinkDigestPhase;
  label: string;
}

export interface SingleLinkDigestResult {
  itemId: string;
  enrich: EnrichmentResult;
  classifyAttempted: boolean;
  classifyProcessed: number;
  classifyError?: string;
  message: string;
}

const inFlight = new Set<string>();

function buildUserMessage(input: {
  enrich: EnrichmentResult;
  classifyAttempted: boolean;
  classifyProcessed: number;
  classifyError?: string;
}): string {
  const { enrich, classifyAttempted, classifyProcessed, classifyError } = input;

  if (enrich.status === 'failed') {
    const detail = enrich.message || enrich.errorCode || 'fetch failed';
    return `Bookmark saved — summary failed: ${detail}`;
  }

  if (enrich.skipped) {
    const skip = enrich.message?.trim();
    if (skip === 'content_unchanged') {
      if (!classifyAttempted) return 'Page unchanged — summary and categories kept';
      if (classifyProcessed > 0) return 'Page unchanged — category updated';
      return 'Page unchanged — no re-classify needed';
    }
    if (!classifyAttempted) {
      return skip ? `Already up to date (${skip})` : 'Already up to date';
    }
    if (classifyError) {
      return classifyError;
    }
    if (classifyProcessed > 0) {
      return 'Category updated';
    }
    return skip ? `Up to date (${skip})` : 'Up to date';
  }

  if (enrich.status !== 'ok') {
    return 'Digest finished with limited processing';
  }

  if (classifyError) {
    return `Summary ready — ${classifyError}`;
  }

  if (classifyProcessed > 0) {
    return 'Digest complete — summary and category ready';
  }

  if (!classifyAttempted) {
    return 'Summary ready — add an AI key in Settings to classify';
  }

  return 'Digest complete — summary ready';
}

export function formatDigestProgressLabel(phase: SingleLinkDigestPhase): string {
  switch (phase) {
    case 'check':
      return 'Checking saved content…';
    case 'enrich':
      return 'Fetching page…';
    case 'extract':
      return 'Extracting summary with AI…';
    case 'classify':
      return 'Classifying…';
    case 'done':
      return 'Digest complete';
    default:
      return 'Digesting…';
  }
}

/** User-facing label before enrichOne runs (fetch vs local-only vs unchanged). */
export async function resolveEnrichProgressLabel(
  itemId: string,
  options?: { force?: boolean }
): Promise<string> {
  const item = await getItem(itemId);
  if (!item?.url) return formatDigestProgressLabel('check');

  const existing = await getEnrichment(itemId);
  const elig = checkEligibility(item, existing, { force: options?.force });

  if (!elig.eligible) {
    if (elig.reason === 'unchanged') {
      return 'Nothing changed — skipping fetch and AI';
    }
    if (elig.reason === 'backoff') {
      return 'Waiting before retry…';
    }
    return formatDigestProgressLabel('check');
  }

  if (elig.skipFetch && !options?.force) {
    return 'Using saved notes — extracting with AI…';
  }

  if (item.url && (await findTabForUrl(item.url, 'any'))) {
    return 'Reading open browser tab…';
  }

  if (existing?.contentHash || existing?.fetchedAt) {
    return 'Fetching page to compare with saved content…';
  }

  return 'Fetching page…';
}

/**
 * Run fetch → AI extract → embed → classify for one bookmark.
 * Safe to call after save; skips work when eligibility/hash rules apply.
 */
export async function runSingleLinkDigest(
  itemId: string,
  options?: {
    forceEnrich?: boolean;
    skipClassify?: boolean;
    onProgress?: (update: SingleLinkDigestProgress) => void;
    signal?: AbortSignal;
    preferTabSession?: boolean;
    tabId?: number;
  }
): Promise<SingleLinkDigestResult> {
  if (inFlight.has(itemId)) {
    const enrich = await getEnrichment(itemId);
    return {
      itemId,
      enrich: {
        itemId,
        status: enrich?.status ?? 'none',
        skipped: true,
        message: 'digest_already_running',
      },
      classifyAttempted: false,
      classifyProcessed: 0,
      message: 'Digest already running for this item',
    };
  }

  inFlight.add(itemId);
  const report = (phase: SingleLinkDigestPhase, label: string) => {
    options?.onProgress?.({ phase, label });
  };

  try {
    report('check', await resolveEnrichProgressLabel(itemId, { force: options?.forceEnrich }));
    const tabSession = await resolveTabSessionForUrl(
      (await getItem(itemId))?.url ?? '',
      options?.tabId
    );
    const enrich = await enrichOne(itemId, {
      force: options?.forceEnrich,
      signal: options?.signal,
      preferTabSession: options?.preferTabSession ?? tabSession.preferTabSession,
      tabId: options?.tabId ?? tabSession.tabId,
    });

    if (enrich.skipped) {
      const skip = enrich.message?.trim();
      if (skip === 'content_unchanged') {
        report('check', 'Page unchanged — kept existing summary');
      } else if (skip === 'skipped_sufficient_local') {
        report('extract', 'Using saved notes — no fetch needed');
      } else if (skip === 'unchanged') {
        report('check', 'Nothing changed — skipping');
      } else if (skip) {
        report('check', `Skipped fetch (${skip})`);
      }
    } else if (enrich.status === 'ok') {
      report('extract', formatDigestProgressLabel('extract'));
    } else if (enrich.status === 'failed') {
      report('enrich', 'Fetch or extract failed');
    }

    let classifyAttempted = false;
    let classifyProcessed = 0;
    let classifyError: string | undefined;

    const enrichment = await getEnrichment(itemId);
    const aiReady = enrichment?.aiStatus === 'ok';
    const shouldClassify =
      !options?.skipClassify &&
      enrich.status !== 'failed' &&
      aiReady &&
      (await needsClassifyForDigest(itemId, enrich));

    if (shouldClassify) {
      const settings = await loadAISettings();
      if (!settings.apiKey.trim()) {
        classifyError = 'classification skipped (no AI key)';
      } else {
        report('classify', formatDigestProgressLabel('classify'));
        classifyAttempted = true;
        try {
          const result = await classifyIncremental({
            itemIds: [itemId],
            maxItems: 1,
            autoDiscover: false,
          });
          classifyProcessed = result.summary.processed;
          if (classifyProcessed === 0 && result.summary.skippedHash > 0) {
            classifyError = undefined;
          }
        } catch (e) {
          classifyError =
            e instanceof Error ? e.message : 'classification failed';
        }
      }
    } else if (aiReady && enrich.status !== 'failed') {
      report('check', 'Categories up to date — skipping classify');
    }

    report('done', formatDigestProgressLabel('done'));
    notifyDataChanged('enrichment.update');

    const message = buildUserMessage({
      enrich,
      classifyAttempted,
      classifyProcessed,
      classifyError,
    });

    return {
      itemId,
      enrich,
      classifyAttempted,
      classifyProcessed,
      classifyError,
      message,
    };
  } finally {
    inFlight.delete(itemId);
  }
}
