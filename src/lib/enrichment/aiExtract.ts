import { AIClientError } from '../ai/types';
import { runAICompletion } from '../ai/client';
import { loadAISettings } from '../ai/settings';
import type { EnrichmentAIStatus } from './types';

export type EnrichmentAIExtract = {
  summary?: string;
  improvedTitle?: string;
  tags?: string[];
};

export type EnrichmentAIOutcome = {
  status: EnrichmentAIStatus;
  data?: EnrichmentAIExtract;
  error?: string;
  at: number;
};

const SYSTEM_PROMPT = `You extract structured metadata from web page content for a bookmark manager.
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "summary": "2-3 sentence summary of the main content",
  "improvedTitle": "clean human-readable title without site suffix",
  "tags": ["tag1", "tag2", "tag3"]
}
Rules:
- summary: factual, concise, no fluff
- improvedTitle: omit " | Medium", " - Reddit", etc.; empty string if unknown
- tags: 3-5 lowercase topic tags; empty array if unclear
- If content is a login wall, paywall, or error page, return {"summary":"","improvedTitle":"","tags":[]}`;

function parseJsonResponse(text: string): EnrichmentAIExtract | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 2000) : undefined;
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
    return {
      summary: summary || undefined,
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
      data.improvedTitle?.trim() ||
      (data.tags && data.tags.length > 0)
  );
}

/** Cloud LLM extraction after a successful fetch. Always returns a structured outcome. */
export async function extractEnrichmentWithAI(
  markdown: string,
  url: string,
  title?: string
): Promise<EnrichmentAIOutcome> {
  const at = Date.now();
  const settings = await loadAISettings();
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

  try {
    const response = await runAICompletion(settings, {
      taskType: 'summarize',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `URL: ${url}\nCurrent title: ${title || '(none)'}\n\nContent:\n${body}`,
        },
      ],
    });
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
