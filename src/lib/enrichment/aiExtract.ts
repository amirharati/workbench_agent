import { AIClientError } from '../ai/types';
import type { AISettings } from '../ai/types';
import { runAICompletion } from '../ai/client';
import { loadAISettings } from '../ai/settings';
import type { EnrichmentAIStatus, SourceKind } from './types';
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
    return {
      summary: summary || undefined,
      keyPoints,
      improvedTitle: improvedTitle || undefined,
      tags: tags?.length ? tags : undefined,
    };
  } catch {
    return null;
  }
}

function hasUsefulExtract(data: EnrichmentAIExtract): boolean {
  return Boolean(
    data.summary?.trim() ||
      data.keyPoints?.length ||
      data.improvedTitle?.trim() ||
      (data.tags && data.tags.length > 0)
  );
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

  const body = markdown.trim().slice(0, 12_000);
  if (body.length < 80) {
    return {
      status: 'content_too_short',
      error: 'Fetched text too short for AI extraction.',
      at,
    };
  }

  const sourceKind = options?.sourceKind ?? 'article';
  const variant = options?.promptVariant ?? 'v2';
  const maxOutputTokens = Math.max(settings.maxOutputTokens, variant === 'v2' ? 1200 : 700);

  try {
    const response = await runAICompletion(
      { ...settings, maxOutputTokens },
      {
        taskType: 'summarize',
        messages: [
          { role: 'system', content: getSystemPrompt(variant, sourceKind) },
          {
            role: 'user',
            content: buildExtractUserContent(url, title, body, options?.hints),
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
    if (!hasUsefulExtract(parsed)) {
      return {
        status: 'empty_response',
        error: 'AI returned no summary, title, or tags (login wall or unclear content).',
        at,
      };
    }
    return { status: 'ok', data: parsed, at };
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
