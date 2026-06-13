import type { AICallAuditHook } from '../ai/callAudit';
import { AIClientError, type AISettings } from '../ai/types';
import { runAICompletion } from '../ai/client';
import { loadAISettings } from '../ai/settings';
import type { EnrichmentAIStatus, SourceKind } from './types';
import { isLikelyListingUrl } from './urlPolicy';
import { looksLikeListingMarkdown } from './listingExtract';
import { titleLooksWeak } from './eligibility';
import {
  hasSubstantiveExtract,
  isTrulyEmptyExtractInput,
  minExtractRawChars,
  prepareExtractInput,
  sanitizeExtractOutput,
} from './extractFilters';
import {
  buildExtractUserContent,
  getSystemPrompt,
  type EnrichmentAIHints,
  type PromptVariant,
} from './prompts';

export type EnrichmentAIExtract = {
  summary?: string;
  keyPoints?: string[];
  improvedTitle?: string;
  tags?: string[];
  pageMatchesBookmark?: boolean;
  redirectNote?: string;
};

export type EnrichmentAIOutcome = {
  status: EnrichmentAIStatus;
  data?: EnrichmentAIExtract;
  error?: string;
  at: number;
};

export type ExtractEnrichmentOptions = {
  sourceKind?: SourceKind;
  hints?: EnrichmentAIHints;
  /** CLI / tests — skip chrome.storage lookup */
  settings?: AISettings;
  promptVariant?: PromptVariant;
  /** Bypass minimum text length gates (inspector "run anyway"). */
  forceShort?: boolean;
  signal?: AbortSignal;
  audit?: { record: AICallAuditHook };
};

const SUMMARY_MAX = 3000;
const KEY_POINT_MAX = 400;

function parseKeyPoints(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points = value
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim().slice(0, KEY_POINT_MAX))
    .slice(0, 8);
  return points.length ? points : undefined;
}

export function parseJsonResponse(text: string): EnrichmentAIExtract | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, SUMMARY_MAX) : undefined;
    const improvedTitle =
      typeof parsed.improvedTitle === 'string'
        ? parsed.improvedTitle.trim().slice(0, 300)
        : undefined;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.trim().toLowerCase().slice(0, 40))
          .slice(0, 8)
      : undefined;
    const keyPoints = parseKeyPoints(parsed.keyPoints);
    const pageMatchesBookmark =
      typeof parsed.pageMatchesBookmark === 'boolean' ? parsed.pageMatchesBookmark : undefined;
    const redirectNote =
      typeof parsed.redirectNote === 'string'
        ? parsed.redirectNote.trim().slice(0, 500)
        : undefined;
    return {
      summary: summary || undefined,
      keyPoints,
      improvedTitle: improvedTitle || undefined,
      tags: tags?.length ? tags : undefined,
      pageMatchesBookmark,
      redirectNote: redirectNote || undefined,
    };
  } catch {
    return null;
  }
}

function hasUsefulExtract(data: EnrichmentAIExtract): boolean {
  return hasSubstantiveExtract(data);
}

/** Cloud LLM extraction after a successful fetch. Always returns a structured outcome. */
export async function extractEnrichmentWithAI(
  markdown: string,
  url: string,
  title?: string,
  options?: ExtractEnrichmentOptions
): Promise<EnrichmentAIOutcome> {
  const at = Date.now();
  const settings = options?.settings ?? (await loadAISettings());
  if (!settings.apiKey.trim()) {
    return {
      status: 'not_configured',
      error: 'Missing API key. Add one in Settings > AI.',
      at,
    };
  }

  const sourceKind = options?.sourceKind ?? 'article';
  const listingPage = isLikelyListingUrl(url) || looksLikeListingMarkdown(markdown);
  const effectiveKind = listingPage ? 'generic' : sourceKind;
  const rawBody = markdown.trim().slice(0, 12_000);
  const minChars = minExtractRawChars(effectiveKind, options?.forceShort);

  if (isTrulyEmptyExtractInput(rawBody, title, effectiveKind) && !options?.forceShort) {
    return {
      status: 'empty_response',
      error: 'No content to summarize.',
      at,
    };
  }

  if (rawBody.length < minChars && !options?.forceShort) {
    return {
      status: 'content_too_short',
      error: 'Fetched text too short for AI extraction.',
      at,
    };
  }

  const prepared = prepareExtractInput(title, rawBody, effectiveKind);
  if (prepared.shouldSkip && !options?.forceShort) {
    return {
      status: 'empty_response',
      error: prepared.skipReason ?? 'No substantive text after removing login/cookie chrome.',
      at,
    };
  }

  const body = prepared.shouldSkip ? rawBody : prepared.body;
  if (body.length < minChars) {
    return {
      status: 'content_too_short',
      error: 'Fetched text too short after chrome strip.',
      at,
    };
  }

  const variant = options?.promptVariant ?? 'v2';
  const maxOutputTokens = Math.max(settings.maxOutputTokens, variant === 'v2' ? 1200 : 700);

  try {
    const response = await runAICompletion(
      { ...settings, maxOutputTokens },
      {
        taskType: 'summarize',
        signal: options?.signal,
        audit: options?.audit
          ? { purpose: 'enrich_summary', record: options.audit.record }
          : undefined,
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(variant, effectiveKind, options?.hints),
          },
          {
            role: 'user',
            content: buildExtractUserContent(url, title, body, options?.hints, {
              listingPage,
              weakCurrentTitle: titleLooksWeak(title ?? '', url),
            }),
          },
        ],
      }
    );
    const parsed = parseJsonResponse(response.text);
    if (!parsed) {
      return {
        status: 'parse_failed',
        error: 'Could not parse AI response as JSON.',
        at,
      };
    }
    const sanitized = sanitizeExtractOutput(parsed);
    if (!hasUsefulExtract(sanitized)) {
      return {
        status: 'empty_response',
        error: 'No substantive content after filtering login/cookie/error chrome.',
        at,
      };
    }
    return { status: 'ok', data: sanitized, at };
  } catch (e) {
    const message =
      e instanceof AIClientError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'AI request failed.';
    return { status: 'api_error', error: message, at };
  }
}
