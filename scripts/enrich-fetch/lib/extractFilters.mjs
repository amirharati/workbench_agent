/** CLI mirror of src/lib/enrichment/extractFilters.ts — keep in sync. */

export const GENERIC_EXTRACT_TAGS = new Set([
  'cookie', 'cookies', 'privacy', 'gdpr', 'consent', 'user consent', 'login', 'log in',
  'sign in', 'signin', 'sign up', 'signup', 'authentication', 'authorize', 'captcha',
  'newsletter', 'subscribe', 'password', 'account management', 'user interface',
  'website management', 'multilingual support', 'guest mode', 'error page', '404',
  'page not found', 'not found', 'access denied', 'forbidden',
]);

export const MIN_BODY_AFTER_CHROME_STRIP = 120;

const CHROME_LINE =
  /^(?:\s*|\*+|#+\s*)?(?:skip to|sign\s*in|sign\s*up|log\s*in|log\s*out|join\s+linkedin|cookie|cookies|privacy\s+policy|accept\s+all|reject\s+all|subscribe|newsletter|enable\s+javascript|all\s+rights\s+reserved|menu|navigation|breadcrumb|loading\.\.\.|create\s+account|forgot\s+password|continue\s+with\s+google|continue\s+with\s+sso|email\s*or\s*(?:username|phone)|password\s*[\*:]|remember\s+me|agree\s*&\s*join|not\s+your\s+computer|guest\s+mode|member-only\s+story|value\s+must\s+not\s+be\s+empty)/i;

const CHROME_INLINE =
  /\b(?:sign\s*in|log\s*in|sign\s*up|forgot\s+password|create\s+account|accept\s+all\s+cookies|manage\s+cookies|privacy\s+preference)\b/i;

const CHROME_SUMMARY =
  /\b(cookie\s+consent|privacy\s+preference|login\s+(?:page|interface|screen|form)|sign[- ]?in\s+(?:page|screen)|authentication\s+(?:page|required)|captcha|consent\s+management|manage\s+(?:your\s+)?cookies)\b/i;

const GENERIC_TITLE_EXACT =
  /^(?:welcome|home|sign\s*up|log\s*in|youtube|linkedin|untitled|error|undefined|gmail|grok)$/i;

export function isGenericExtractTag(tag) {
  const t = tag.trim().toLowerCase();
  return !t || t.length < 3 || GENERIC_EXTRACT_TAGS.has(t);
}

function lineLooksLikeChrome(line) {
  const t = line.trim();
  if (!t || t.length < 4) return true;
  if (CHROME_LINE.test(t)) return true;
  if (t.length < 80 && CHROME_INLINE.test(t) && !/\b(platform|product|service|tool|guide|docs)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function prefilterExtractBody(body) {
  const lines = body.split('\n');
  const kept = [];
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

export function substantiveBodyLength(body) {
  let n = 0;
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (t.length < 12) continue;
    if (lineLooksLikeChrome(line)) continue;
    n += t.length;
  }
  return n;
}

export function isDescriptiveTitle(title) {
  const t = (title || '').trim();
  return t.length >= 18 && !GENERIC_TITLE_EXACT.test(t);
}

export function prepareExtractInput(title, rawBody, sourceKind) {
  const filtered = prefilterExtractBody(rawBody);
  const substantive = substantiveBodyLength(filtered);

  if (sourceKind === 'video' && isDescriptiveTitle(title)) {
    return { body: filtered, shouldSkip: false, substantiveLength: substantive };
  }
  if (sourceKind === 'x') {
    return {
      body: filtered,
      shouldSkip: substantive < 40,
      substantiveLength: substantive,
      skipReason: substantive < 40 ? 'No tweet content after chrome strip' : undefined,
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

export function isChromeDominatedInput(title, body, sourceKind) {
  return prepareExtractInput(title, body, sourceKind).shouldSkip;
}

function filterKeyPoints(points) {
  if (!points?.length) return undefined;
  const kept = points
    .map((p) => p.trim())
    .filter((p) => p.length >= 12 && !CHROME_SUMMARY.test(p) && !CHROME_LINE.test(p))
    .slice(0, 8);
  return kept.length ? kept : undefined;
}

function isChromeOnlySummary(summary, tags) {
  if (!summary?.trim()) return true;
  if (!CHROME_SUMMARY.test(summary)) return false;
  return (tags ?? []).filter((t) => !isGenericExtractTag(t)).length === 0;
}

export function sanitizeExtractOutput(data) {
  const tags = data.tags?.map((t) => t.trim().toLowerCase()).filter((t) => !isGenericExtractTag(t));
  let cleanSummary = data.summary?.trim();
  if (cleanSummary && isChromeOnlySummary(cleanSummary, tags)) cleanSummary = undefined;
  return {
    summary: cleanSummary || undefined,
    keyPoints: filterKeyPoints(data.keyPoints),
    improvedTitle: data.improvedTitle?.trim() || undefined,
    tags: tags?.length ? tags.slice(0, 8) : undefined,
  };
}

export function hasSubstantiveExtract(data) {
  if (!data) return false;
  const tags = data.tags?.filter((t) => !isGenericExtractTag(t)) ?? [];
  const hasSummary = Boolean(data.summary?.trim() && !isChromeOnlySummary(data.summary, data.tags));
  const hasPoints = Boolean(data.keyPoints?.length);
  const hasTitle = Boolean(
    data.improvedTitle?.trim() && !GENERIC_TITLE_EXACT.test(data.improvedTitle.trim())
  );
  return hasSummary || hasPoints || tags.length > 0 || hasTitle;
}
