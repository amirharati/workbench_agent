import type { ClassifyState, ClassifyInputQualityTier, AiSignalStatus, LlmReviewSnapshot } from './types';
import { MAX_CLASSIFY_RETRIES } from './classifyPolicy';
import { resolveClassifyQueueBlocker } from './classifyQueueBlocker';
import type { ItemEnrichment } from '../enrichment/types';

export type ClassifyQueueReasonInput = {
  classifyState?: ClassifyState;
  signal?: {
    eligibilityReason?: string;
    lastClassifySkipReason?: string;
    classifyRetryCount?: number;
    inputQualityTier?: ClassifyInputQualityTier;
    llmReview?: LlmReviewSnapshot;
    signalStatus?: AiSignalStatus;
  };
  /** Live eligibility check (may differ from stale signal). */
  eligibleNow?: boolean;
  eligibilityReasonNow?: string;
  hasPrimaryTopic?: boolean;
  enrichment?: ItemEnrichment;
  hasSignal?: boolean;
};

export type ClassifyQueueActionId =
  | 'force_reclassify'
  | 'classify_item'
  | 'retry_manual';

export type ClassifyQueueReason = {
  stateLabel: string;
  primaryReason: string;
  detail?: string;
  suggestedAction?: string;
  actionId?: ClassifyQueueActionId;
};

const STATE_LABELS: Record<ClassifyState, string> = {
  pending_classify: 'Pending classify',
  pending_reclassify: 'Pending reclassify',
  pending_discover: 'Pending discover',
  classified: 'Classified (specific)',
  classified_general: 'General / Other topic',
  classified_removal: 'Removal candidate (broken/junk link)',
  classified_attention: 'Login/auth required (re-fetch when signed in)',
  ineligible: 'Ineligible (quality gate)',
  manual_review: 'Manual review',
  skipped: 'Skipped',
  manual_only: 'Manual only',
};

export function formatClassifySkipReason(code?: string): string {
  if (!code) return 'Skipped by classify policy';
  const map: Record<string, string> = {
    unchanged_hash_specific: 'Text unchanged since last specific topic assignment',
    unchanged_hash_skipped: 'Text unchanged; LLM previously skipped this item',
    manual_review: 'Auto-retry limit reached — needs manual classify',
    manual_only: 'User accepted category — locked until force reclassify',
    not_fair_game: 'Not in classify scope (failed quality gate or terminal state)',
    quality_gate: 'Failed quality gate before LLM',
    llm_error: 'LLM batch error',
    llm_skip_confident: 'LLM confidently returned no topic',
    manual_review_error: `LLM error after ${MAX_CLASSIFY_RETRIES} auto-retries`,
    manual_review_unassigned: `Unassigned after ${MAX_CLASSIFY_RETRIES} auto-retries`,
    manual_review_general: `Stuck on general/Other after ${MAX_CLASSIFY_RETRIES} auto-retries`,
    manual_review_new_category: `Could not promote new category after ${MAX_CLASSIFY_RETRIES} retries`,
    unassigned: 'LLM returned no matching topic',
    general: 'Assigned to parent general/Other leaf',
    pending_discover: 'Unassigned — queued for discover gap-fill',
  };
  return map[code] ?? code.replace(/_/g, ' ');
}

/** LLM sometimes echoes the bookmark title/summary instead of explaining the skip. */
export function isLikelyEchoNotReason(text: string | undefined): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  const lower = t.toLowerCase();
  const rationaleMarkers = [
    'because',
    'no clear',
    'not enough',
    'generic',
    'landing',
    'insufficient',
    'paywall',
    'too vague',
    'unclear',
    'cannot',
    "can't",
    'unable',
    'lack of',
    'missing',
    'ambiguous',
    'not a good fit',
    'does not match',
    "doesn't match",
    'no matching',
    'not suitable',
    'course',
    'index',
    'navigation',
  ];
  if (rationaleMarkers.some((m) => lower.includes(m))) return false;
  // Short title-like phrase without rationale wording
  if (t.length < 180 && !lower.includes('topic') && !lower.includes('classif')) return true;
  return false;
}

function resolveSkipReasonText(
  lastClassifySkipReason?: string,
  llmReason?: string
): { primaryReason: string; detail?: string } {
  const defaultReason = formatClassifySkipReason('llm_skip_confident');
  const raw = lastClassifySkipReason ?? llmReason;
  if (!raw?.trim()) {
    return { primaryReason: defaultReason };
  }
  if (/^[a-z0-9_]+$/.test(raw.trim())) {
    return {
      primaryReason: formatClassifySkipReason(raw.trim()),
      detail:
        llmReason && llmReason !== raw && !isLikelyEchoNotReason(llmReason)
          ? llmReason
          : undefined,
    };
  }
  if (!isLikelyEchoNotReason(raw)) {
    return { primaryReason: raw, detail: llmReason && llmReason !== raw ? llmReason : undefined };
  }
  const detail =
    llmReason && llmReason !== raw && !isLikelyEchoNotReason(llmReason) ? llmReason : undefined;
  return { primaryReason: defaultReason, detail };
}

export function classifyOutcomeReason(
  outcome: 'specific' | 'general' | 'unassigned' | 'error' | 'skipped',
  opts: { retryCount?: number; routedToManualReview?: boolean; llmReason?: string } = {}
): string | undefined {
  if (outcome === 'skipped' && opts.llmReason) return opts.llmReason;
  if (outcome === 'error') {
    return opts.routedToManualReview
      ? formatClassifySkipReason('manual_review_error')
      : opts.llmReason ?? formatClassifySkipReason('llm_error');
  }
  if (outcome === 'unassigned') {
    return opts.routedToManualReview
      ? formatClassifySkipReason('manual_review_unassigned')
      : formatClassifySkipReason('pending_discover');
  }
  if (outcome === 'general') {
    return opts.routedToManualReview
      ? formatClassifySkipReason('manual_review_general')
      : formatClassifySkipReason('general');
  }
  return undefined;
}

export function describeClassifyQueueStatus(input: ClassifyQueueReasonInput): ClassifyQueueReason {
  const st = input.classifyState ?? 'pending_classify';
  const stateLabel = STATE_LABELS[st] ?? st.replace(/_/g, ' ');
  const sig = input.signal;
  const retries = sig?.classifyRetryCount ?? 0;

  if (st === 'ineligible') {
    const stored = sig?.eligibilityReason;
    const live = input.eligibilityReasonNow;
    const primaryReason = stored ?? live ?? 'Failed categorization quality gate';
    const stale = input.eligibleNow && stored;
    return {
      stateLabel,
      primaryReason,
      detail: stale
        ? 'Current enrichment looks eligible — reload or run Classify to re-queue (stale signal).'
        : live && live !== stored
          ? `Live check: ${live}`
          : sig?.signalStatus === 'insufficient_enrichment'
            ? 'Signal status: insufficient enrichment'
            : undefined,
      suggestedAction: input.eligibleNow
        ? 'Run Classify pending (will reconcile on load)'
        : 'Add notes, re-fetch, or re-run AI to improve text',
      actionId: input.eligibleNow ? 'classify_item' : undefined,
    };
  }

  if (st === 'manual_review') {
    return {
      stateLabel,
      primaryReason:
        sig?.lastClassifySkipReason ?? formatClassifySkipReason('manual_review'),
      detail: retries > 0 ? `${retries} auto classify attempt(s) on general/unassigned/error` : undefined,
      suggestedAction: 'Use Retry manual or force Re-classify all',
      actionId: 'retry_manual',
    };
  }

  if (st === 'skipped') {
    const resolved = resolveSkipReasonText(sig?.lastClassifySkipReason, sig?.llmReview?.reason);
    return {
      stateLabel,
      primaryReason: resolved.primaryReason,
      detail:
        resolved.detail ??
        'Legacy skip — reload or run Classify to move into pending discover for gap-fill.',
      suggestedAction: 'Force re-classify if you disagree',
      actionId: 'force_reclassify',
    };
  }

  if (st === 'pending_discover' || st === 'classified_general') {
    return {
      stateLabel,
      primaryReason:
        sig?.lastClassifySkipReason ??
        (st === 'pending_discover'
          ? formatClassifySkipReason('pending_discover')
          : formatClassifySkipReason('general')),
      detail: sig?.llmReview?.reason,
      suggestedAction: 'Run Discover stuck to add a specific topic',
    };
  }

  if (st === 'pending_classify' || st === 'pending_reclassify') {
    if (sig?.lastClassifySkipReason) {
      return {
        stateLabel,
        primaryReason: sig.lastClassifySkipReason,
        detail: 'Last run skipped or re-queued this item',
        suggestedAction: 'Run Classify pending',
        actionId: 'classify_item',
      };
    }
    const blocker = resolveClassifyQueueBlocker({
      item: { id: '', url: '', title: '', collectionIds: [], tags: [], created_at: 0, updated_at: 0, source: 'manual' },
      enrichment: input.enrichment,
      classifyState: st,
      hasSignal: input.hasSignal ?? !!sig,
      eligible: input.eligibleNow ?? false,
      eligibilityReason: input.eligibilityReasonNow ?? sig?.eligibilityReason,
    });
    return {
      stateLabel: blocker.stateLabel,
      primaryReason: blocker.detail,
      detail: blocker.hint,
      suggestedAction:
        blocker.code === 'ready_for_classify' || blocker.code === 'reclassify_queued'
          ? st === 'pending_reclassify'
            ? 'Force reclassify'
            : 'Run Classify pending'
          : blocker.code === 'not_enriched'
            ? 'Run digest or re-fetch'
            : blocker.code === 'no_ai_summary'
              ? 'Re-run AI extract'
              : 'Improve text then classify',
      actionId:
        blocker.code === 'ready_for_classify' || blocker.code === 'reclassify_queued'
          ? st === 'pending_reclassify'
            ? 'force_reclassify'
            : 'classify_item'
          : undefined,
    };
  }

  if (st === 'classified') {
    return {
      stateLabel,
      primaryReason: sig?.lastClassifySkipReason ?? 'Has specific primary topic',
      detail: sig?.llmReview?.reason,
    };
  }

  return {
    stateLabel,
    primaryReason: sig?.lastClassifySkipReason ?? sig?.eligibilityReason ?? stateLabel,
    detail: sig?.llmReview?.reason,
  };
}
