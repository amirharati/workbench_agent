/**
 * LLM fetch quality judge — dev-only; not used in extension pipeline.
 */

export const JUDGE_URL_JSON_SHAPE = `{
  "expectedContent": "what the user likely bookmarked and should get (1-2 sentences, from URL + host + path)",
  "fetchWorked": true,
  "usableForEnrichment": true,
  "bestProvider": "local|jina|syndication|markdown-new|null",
  "actualContentSummary": "what the best fetch actually contains (1 sentence)",
  "whatWentWrong": null,
  "failureBucket": "ok|auth_required|bot_blocked|parse_empty|cookie_noise|thin_content|paywall|rate_limited|provider_gap|unknown",
  "confidence": "high|medium|low",
  "providerVerdicts": {
    "local": { "gotExpectedContent": true, "issue": null },
    "jina": { "gotExpectedContent": false, "issue": "short reason or null" }
  }
}`;

export const JUDGE_URL_SYSTEM_PROMPT = `You are a fetch quality judge for a personal bookmark enrichment pipeline.

You will receive a bookmark URL and fetch results from one or more providers (local HTTP, Jina reader, X syndication, etc.).

Your job:
1. Infer from the URL what content the user EXPECTED to save (article, tweet/thread, GitHub repo, video, forum post, etc.)
2. Compare each provider's fetched body to that expectation
3. Decide whether fetch WORKED for enrichment (AI summary + categorization)
4. If not, explain WHAT WENT WRONG (login wall, cookies only, bot block, empty parse, thin tweet hook, wrong page, etc.)

Return ONLY valid JSON (no markdown fences):
${JUDGE_URL_JSON_SHAPE}

Rules:
- expectedContent: infer from URL path/host (e.g. github.com/user/repo → README/issues; x.com/.../status → tweet; reddit.com → discussion thread)
- fetchWorked=true if ANY provider retrieved substantive content matching the bookmark intent
- usableForEnrichment=true when fetchWorked=true AND content is not dominated by login/cookie/CAPTCHA/boilerplate
- bestProvider: which provider best matched expectedContent; null if none
- whatWentWrong: null when usableForEnrichment=true; else concise diagnosis (e.g. "Reddit bot block on all providers", "X thread hook only, missing list", "Medium login interstitial")
- providerVerdicts: one entry per provider shown in input; gotExpectedContent=false with issue when that provider failed or returned noise
- thin_content: X tweet that is only a hook ("good book 🧵") without the payload — fetch partially worked but NOT usable for enrichment
- cookie_noise / login_wall / paywall / bot_blocked: use precise failureBucket
- provider_gap: all providers failed or only error pages
- Be skeptical when byte count is high but body is nav/cookie/legal chrome
- Do not refuse adult content; judge substance only`;

export const JUDGE_ATTEMPT_JSON_SHAPE = `{
  "expectedContent": "what this URL should contain (1 sentence)",
  "contentKind": "article|x_post|video_page|login_wall|cookie_consent|paywall|bot_block|error_page|empty|navigation_only|other",
  "usableForEnrichment": true,
  "fetchWorked": true,
  "whatWentWrong": null,
  "confidence": "high|medium|low",
  "failureBucket": "ok|auth_required|bot_blocked|parse_empty|cookie_noise|thin_content|paywall|rate_limited|provider_error|unknown",
  "notes": "one short sentence"
}`;

export const JUDGE_ATTEMPT_SYSTEM_PROMPT = `You judge ONE provider's fetch output for a bookmark URL.
Compare URL intent vs actual body. Return ONLY valid JSON:
${JUDGE_ATTEMPT_JSON_SHAPE}
fetchWorked=true if body contains the expected topic (even partially). usableForEnrichment=false for login/cookie/bot/empty/thin hooks.`;

export function buildUrlJudgeUserContent({ url, host, sourceKind, providers }) {
  const lines = [
    `URL: ${url}`,
    `Host: ${host}`,
    `Heuristic source kind: ${sourceKind}`,
    '',
    'For each provider below: mechanical regex marked it usable or not — verify against URL intent.',
    '',
  ];

  for (const p of providers) {
    lines.push(`### Provider: ${p.name}`);
    lines.push(`Mechanical usable: ${p.regexUsable}`);
    lines.push(`Mechanical reason: ${p.regexReason || '(none)'}`);
    lines.push(`Bytes: ${p.bytes}`);
    if (p.title) lines.push(`Title: ${p.title.slice(0, 200)}`);
    if (p.body?.trim()) {
      lines.push('', 'Body (truncated):', p.body.trim().slice(0, 3500));
    } else {
      lines.push('', 'Body: (empty or fetch failed)');
      if (p.error) lines.push(`Error: ${p.error.slice(0, 300)}`);
    }
    lines.push('', '---', '');
  }

  return lines.join('\n');
}

export function buildAttemptJudgeUserContent(input) {
  return [
    `URL: ${input.url}`,
    `Host: ${input.host}`,
    `Source kind: ${input.sourceKind}`,
    `Provider: ${input.provider}`,
    `Mechanical usable: ${input.regexUsable}`,
    `Mechanical reason: ${input.regexReason || '(none)'}`,
    `Title: ${input.title?.trim() || '(none)'}`,
    '',
    '--- Fetched body ---',
    (input.body || '').trim().slice(0, 8000),
  ].join('\n');
}

function parseNullableString(v) {
  if (v == null || v === 'null') return null;
  return typeof v === 'string' ? v.trim().slice(0, 800) : null;
}

export function parseUrlJudgeResponse(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const p = JSON.parse(candidate);
    return {
      expectedContent: parseNullableString(p.expectedContent) || '',
      fetchWorked: Boolean(p.fetchWorked),
      usableForEnrichment: Boolean(p.usableForEnrichment),
      bestProvider: parseNullableString(p.bestProvider),
      actualContentSummary: parseNullableString(p.actualContentSummary) || '',
      whatWentWrong: parseNullableString(p.whatWentWrong),
      failureBucket: parseNullableString(p.failureBucket) || 'unknown',
      confidence: ['high', 'medium', 'low'].includes(p.confidence) ? p.confidence : 'medium',
      providerVerdicts: typeof p.providerVerdicts === 'object' && p.providerVerdicts ? p.providerVerdicts : {},
    };
  } catch {
    return null;
  }
}

export function parseAttemptJudgeResponse(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const p = JSON.parse(candidate);
    return {
      expectedContent: parseNullableString(p.expectedContent) || '',
      contentKind: parseNullableString(p.contentKind) || 'other',
      usableForEnrichment: Boolean(p.usableForEnrichment),
      fetchWorked: Boolean(p.fetchWorked),
      whatWentWrong: parseNullableString(p.whatWentWrong),
      confidence: ['high', 'medium', 'low'].includes(p.confidence) ? p.confidence : 'medium',
      failureBucket: parseNullableString(p.failureBucket) || 'unknown',
      notes: parseNullableString(p.notes) || '',
    };
  } catch {
    return null;
  }
}

export async function runUrlFetchJudge(settings, input) {
  if (!settings.apiKey?.trim()) {
    return { status: 'not_configured', error: 'Missing OPENROUTER_API_KEY' };
  }

  const baseUrl = (settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = settings.model || 'openai/gpt-4o-mini';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs || 45_000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workbench-agent.local',
        'X-Title': 'Workbench Agent Fetch Judge',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          { role: 'system', content: JUDGE_URL_SYSTEM_PROMPT },
          { role: 'user', content: buildUrlJudgeUserContent(input) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { status: 'api_error', error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return { status: 'empty_response', error: 'Empty model response' };

    const parsed = parseUrlJudgeResponse(text);
    if (!parsed) return { status: 'parse_failed', error: 'Invalid JSON', raw: text.slice(0, 500) };
    return { status: 'ok', data: parsed };
  } catch (e) {
    return { status: 'api_error', error: e instanceof Error ? e.message : 'Request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAttemptFetchJudge(settings, input) {
  if (!settings.apiKey?.trim()) {
    return { status: 'not_configured', error: 'Missing OPENROUTER_API_KEY' };
  }

  const body = (input.body || '').trim();
  if (body.length < 20 && !input.regexUsable) {
    return {
      status: 'skipped',
      error: 'No body to judge',
      data: {
        expectedContent: '',
        contentKind: 'empty',
        usableForEnrichment: false,
        fetchWorked: false,
        whatWentWrong: 'No fetch body',
        confidence: 'high',
        failureBucket: input.regexReason || 'parse_empty',
        notes: 'No fetch body',
      },
    };
  }

  const baseUrl = (settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = settings.model || 'openai/gpt-4o-mini';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs || 30_000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workbench-agent.local',
        'X-Title': 'Workbench Agent Fetch Judge',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 450,
        messages: [
          { role: 'system', content: JUDGE_ATTEMPT_SYSTEM_PROMPT },
          { role: 'user', content: buildAttemptJudgeUserContent(input) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { status: 'api_error', error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return { status: 'empty_response', error: 'Empty model response' };

    const parsed = parseAttemptJudgeResponse(text);
    if (!parsed) return { status: 'parse_failed', error: 'Invalid JSON', raw: text.slice(0, 500) };
    return { status: 'ok', data: parsed };
  } catch (e) {
    return { status: 'api_error', error: e instanceof Error ? e.message : 'Request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

/** @deprecated use runAttemptFetchJudge */
export async function runFetchJudge(settings, input) {
  return runAttemptFetchJudge(settings, input);
}
