import type { EnrichmentAIExtract } from './aiExtract';
import type { SourceKind } from './types';

/** Tags that describe page chrome, not bookmark topics — strip from extraction output. */
export const GENERIC_EXTRACT_TAGS = new Set([
  'cookie',
  'cookies',
  'privacy',
  'gdpr',
  'consent',
  'user consent',
  'login',
  'log in',
  'sign in',
  'signin',
  'sign up',
  'signup',
  'authentication',
  'authorize',
  'captcha',
  'newsletter',
  'subscribe',
  'password',
  'account management',
  'user interface',
  'website management',
  'multilingual support',
  'guest mode',
  'error page',
  '404',
  'page not found',
  'not found',
  'access denied',
  'forbidden',
]);

/** Min chars of non-chrome body after strip before we call the LLM (articles). */
export const MIN_BODY_AFTER_CHROME_STRIP = 120;

/** X tweets: call LLM unless truly empty — cheap vs missing image-only / thin posts. */
export const MIN_X_EXTRACT_RAW_CHARS = 20;

/** Articles / generic: minimum raw markdown before LLM. */
export const MIN_ARTICLE_EXTRACT_RAW_CHARS = 80;

const CHROME_LINE =
  /^(?:\s*|\*+|#+\s*)?(?:skip to|sign\s*in|sign\s*up|log\s*in|log\s*out|join\s+linkedin|cookie|cookies|privacy\s+policy|accept\s+all|reject\s+all|subscribe|newsletter|enable\s+javascript|all\s+rights\s+reserved|menu|navigation|breadcrumb|loading\.\.\.|create\s+account|forgot\s+password|continue\s+with\s+google|continue\s+with\s+sso|email\s*or\s*(?:username|phone)|password\s*[\*:]|remember\s+me|agree\s*&\s*join|not\s+your\s+computer|guest\s+mode|member-only\s+story|value\s+must\s+not\s+be\s+empty)/i;

const CHROME_INLINE =
  /\b(?:sign\s*in|log\s*in|sign\s*up|forgot\s+password|create\s+account|accept\s+all\s+cookies|manage\s+cookies|privacy\s+preference)\b/i;

const CHROME_SUMMARY =
  /\b(cookie\s+consent|privacy\s+preference|login\s+(?:page|interface|screen|form)|sign[- ]?in\s+(?:page|screen)|authentication\s+(?:page|required)|captcha|consent\s+management|manage\s+(?:your\s+)?cookies)\b/i;

const GENERIC_TITLE_EXACT =
  /^(?:welcome|home|sign\s*up|log\s*in|youtube|linkedin|untitled|error|undefined|gmail|grok)$/i;

export type ChromePageKind = 'login' | 'cookie_consent' | 'error' | 'generic_title' | null;

export function isGenericExtractTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  if (!t || GENERIC_EXTRACT_TAGS.has(t)) return true;
  if (t.length < 3) return true;
  for (const g of GENERIC_EXTRACT_TAGS) {
    if (t === g || t.startsWith(`${g} `) || t.endsWith(` ${g}`)) return true;
  }
  return false;
}

function lineLooksLikeChrome(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 4) return true;
  if (CHROME_LINE.test(t)) return true;
  if (t.length < 80 && CHROME_INLINE.test(t) && !/\b(platform|product|service|tool|guide|docs)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Drop login/nav/legal lines; keep product copy, docs, error context with substance. */
export function prefilterExtractBody(body: string): string {
  const lines = body.split('\n');
  const kept: string[] = [];
  let blankRun = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (++blankRun <= 2) kept.push('');
      continue;
    }
    blankRun = 0;
    if (lineLooksLikeChrome(line)) continue;
    kept.push(line);
  }

  const out = kept.join('\n').trim();
  return out.length > 0 ? out : body.trim();
}

/** How much readable text remains after chrome strip (not counting title). */
export function substantiveBodyLength(body: string): number {
  let n = 0;
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (t.length < 12) continue;
    if (lineLooksLikeChrome(line)) continue;
    n += t.length;
  }
  return n;
}

export function isDescriptiveTitle(title: string | undefined): boolean {
  const t = (title || '').trim();
  return t.length >= 18 && !GENERIC_TITLE_EXACT.test(t);
}

/** Tweet/thread fetch has enough context to try LLM even when word count is low. */
export function hasXExtractSignal(body: string, title?: string): boolean {
  const raw = body.trim();
  if (!raw) return isDescriptiveTitle(title);
  if (/^#\s*@\w+/m.test(raw)) return true;
  if (/^##\s*\d+\/\d+/m.test(raw)) return true;
  if (/photo\(s\)\s+attached|media item\(s\) attached/i.test(raw)) return true;
  if (/pbs\.twimg\.com\/media\//i.test(raw)) return true;
  if (/\bImage:\s*https?:\/\//i.test(raw)) return true;
  if (/https?:\/\/t\.co\/\S+/i.test(raw) && raw.length >= MIN_X_EXTRACT_RAW_CHARS) return true;
  if (isDescriptiveTitle(title)) return true;
  return false;
}

export function minExtractRawChars(sourceKind?: SourceKind, forceShort?: boolean): number {
  if (forceShort) return 1;
  if (sourceKind === 'x') return MIN_X_EXTRACT_RAW_CHARS;
  if (sourceKind === 'video') return 40;
  return MIN_ARTICLE_EXTRACT_RAW_CHARS;
}

export function isTrulyEmptyExtractInput(
  rawBody: string,
  title?: string,
  sourceKind?: SourceKind
): boolean {
  const trimmed = rawBody.trim();
  if (!trimmed) return !isDescriptiveTitle(title);
  if (sourceKind === 'x' && hasXExtractSignal(trimmed, title)) return false;
  if (isDescriptiveTitle(title) && trimmed.length >= 12) return false;
  return trimmed.length < 12;
}

export interface PrepareExtractInputResult {
  body: string;
  shouldSkip: boolean;
  skipReason?: string;
  substantiveLength: number;
}

/**
 * Strip chrome from fetch body; only skip LLM when almost nothing remains.
 * Login landing pages often include product copy — we extract that, not the form.
 */
export function prepareExtractInput(
  title: string | undefined,
  rawBody: string,
  sourceKind?: SourceKind
): PrepareExtractInputResult {
  const filtered = prefilterExtractBody(rawBody);
  const substantive = substantiveBodyLength(filtered);

  if (sourceKind === 'video' && isDescriptiveTitle(title)) {
    return { body: filtered, shouldSkip: false, substantiveLength: substantive };
  }
  if (sourceKind === 'x') {
    const trulyEmpty = isTrulyEmptyExtractInput(filtered, title, 'x');
    return {
      body: filtered,
      shouldSkip: trulyEmpty,
      substantiveLength: substantive,
      skipReason: trulyEmpty ? 'No tweet content after chrome strip' : undefined,
    };
  }

  if (substantive >= MIN_BODY_AFTER_CHROME_STRIP) {
    return { body: filtered, shouldSkip: false, substantiveLength: substantive };
  }

  if (substantive >= 50 && isDescriptiveTitle(title)) {
    return { body: filtered, shouldSkip: false, substantiveLength: substantive };
  }

  if (filtered.length < 40 && !isDescriptiveTitle(title)) {
    return {
      body: filtered,
      shouldSkip: true,
      skipReason: 'Only login/form chrome after strip',
      substantiveLength: substantive,
    };
  }

  if (substantive < 40) {
    return {
      body: filtered,
      shouldSkip: true,
      skipReason: `Only ${substantive} chars after removing login/cookie chrome`,
      substantiveLength: substantive,
    };
  }

  return { body: filtered, shouldSkip: false, substantiveLength: substantive };
}

/** @deprecated Use prepareExtractInput — kept for categorization eligibility hints. */
export function detectChromePageKind(title: string | undefined, body: string): ChromePageKind | null {
  const { shouldSkip, substantiveLength } = prepareExtractInput(title, body);
  if (!shouldSkip) return null;
  if (GENERIC_TITLE_EXACT.test((title || '').trim())) return 'generic_title';
  if (substantiveLength < 20 && /\b404|not found\b/i.test(body)) return 'error';
  return 'login';
}

export function isChromeDominatedInput(
  title: string | undefined,
  body: string,
  sourceKind?: SourceKind
): boolean {
  return prepareExtractInput(title, body, sourceKind).shouldSkip;
}

function filterKeyPoints(points: string[] | undefined): string[] | undefined {
  if (!points?.length) return undefined;
  const kept = points
    .map((p) => p.trim())
    .filter((p) => p.length >= 12 && !CHROME_SUMMARY.test(p) && !CHROME_LINE.test(p))
    .slice(0, 8);
  return kept.length ? kept : undefined;
}

function isChromeOnlySummary(summary: string, tags: string[] | undefined): boolean {
  if (!summary.trim()) return true;
  if (!CHROME_SUMMARY.test(summary)) return false;
  const substantiveTags = (tags ?? []).filter((t) => !isGenericExtractTag(t));
  return substantiveTags.length === 0;
}

/** Post-process model JSON — remove chrome tags; keep summaries about product/topic. */
export function sanitizeExtractOutput(data: EnrichmentAIExtract): EnrichmentAIExtract {
  const tags = data.tags?.map((t) => t.trim().toLowerCase()).filter((t) => !isGenericExtractTag(t));
  const summary = data.summary?.trim();
  const keyPoints = filterKeyPoints(data.keyPoints);
  const improvedTitle = data.improvedTitle?.trim();

  let cleanSummary = summary;
  if (summary && isChromeOnlySummary(summary, tags)) {
    cleanSummary = undefined;
  }

  return {
    summary: cleanSummary || undefined,
    keyPoints,
    improvedTitle: improvedTitle || undefined,
    tags: tags?.length ? tags.slice(0, 8) : undefined,
    pageMatchesBookmark: data.pageMatchesBookmark,
    redirectNote: data.redirectNote?.trim() || undefined,
  };
}

export function hasSubstantiveExtract(data: EnrichmentAIExtract): boolean {
  const tags = data.tags?.filter((t) => !isGenericExtractTag(t)) ?? [];
  const hasSummary = Boolean(data.summary?.trim() && !isChromeOnlySummary(data.summary, data.tags));
  const hasPoints = Boolean(data.keyPoints?.length);
  const hasTitle = Boolean(data.improvedTitle?.trim() && !GENERIC_TITLE_EXACT.test(data.improvedTitle.trim()));
  return hasSummary || hasPoints || tags.length > 0 || hasTitle;
}
