/** Categorization embed text — lean by default; snippet fallback when thin. */

export const SNIPPET_MAX_CHARS = 2000;
export const LEAN_TEXT_MIN_FOR_SNIPPET_FALLBACK = 80;

const SNIPPET_BOILER_LINE =
  /^(?:\s*|\*+|#+\s*)?(?:cookie|cookies|sign\s*in|sign\s*up|log\s*in|log\s*out|subscribe|newsletter|accept\s+all|reject\s+all|privacy\s+policy|terms\s+of|all\s+rights\s+reserved|skip\s+to|menu|navigation|breadcrumb|share\s+on|follow\s+us|advertisement|sponsored|loading\.\.\.|please\s+enable\s+javascript)/i;

export function stripSnippetBoilerplate(snippet) {
  const lines = snippet.split('\n');
  const kept = [];
  let blankRun = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (++blankRun <= 2) kept.push('');
      continue;
    }
    blankRun = 0;
    if (t.length < 4) continue;
    if (SNIPPET_BOILER_LINE.test(t)) continue;
    if (/^[\s|·•\-–—]{3,}$/.test(t)) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function substantiveTextLength(item) {
  let n = 0;
  const title = (item.title || '').trim();
  if (title) n += title.length;
  const notes = (item.notes || '').trim();
  if (notes) n += notes.length;
  const host = hostFromUrl(item.url || '');
  if (host) n += host.length;
  const tags = item.aiTags?.filter((t) => t?.trim()) ?? [];
  if (tags.length) n += tags.join(' ').length;
  const aiSummary = item.aiSummary?.trim() || '';
  if (aiSummary) n += aiSummary.length;
  const keyPoints = item.aiKeyPoints?.filter((p) => p?.trim()) ?? [];
  if (keyPoints.length) n += keyPoints.join(' ').length;
  if (item.quotedText) n += item.quotedText.length;
  if (item.description?.trim()) n += item.description.trim().length;
  return n;
}

export function buildCategorizationTextFromCorpus(item, { includeSnippet = false } = {}) {
  const lines = [];
  const title = (item.title || '').trim();
  if (title) lines.push(`Title: ${title}`);

  const host = hostFromUrl(item.url || '');
  if (host) lines.push(`Host: ${host}`);

  const notes = (item.notes || '').trim();
  if (notes) lines.push(`Notes:\n${notes}`);

  const tags = item.aiTags?.filter((t) => t?.trim()) ?? [];
  if (tags.length) lines.push(`Tags: ${tags.join(', ')}`);

  const aiSummary = item.aiSummary?.trim() || '';
  if (aiSummary) lines.push(`Summary:\n${aiSummary}`);

  const keyPoints = item.aiKeyPoints?.filter((p) => p?.trim()) ?? [];
  if (keyPoints.length) {
    lines.push(`Key points:\n${keyPoints.map((p) => `- ${p.trim()}`).join('\n')}`);
  }

  if (item.quotedText) {
    const qa = item.quotedAuthor ? ` (${item.quotedAuthor})` : '';
    lines.push(`Quoted${qa}:\n${item.quotedText}`);
  }
  if (item.channel) lines.push(`Channel: ${item.channel}`);
  if (item.description?.trim()) lines.push(`Description: ${item.description.trim()}`);

  if (includeSnippet) {
    const raw = item.snippet?.trim() || '';
    const snippet = raw ? stripSnippetBoilerplate(raw) : '';
    if (snippet) lines.push(`Snippet:\n${snippet.slice(0, SNIPPET_MAX_CHARS)}`);
  }

  return lines.join('\n\n');
}

/** Title + AI summary only — used for clustering embeddings (no tags). */
export function buildClusterEmbedTextFromCorpus(item) {
  const lines = [];
  const title = (item.title || '').trim();
  if (title) lines.push(`Title: ${title}`);
  const aiSummary = item.aiSummary?.trim() || '';
  if (aiSummary) lines.push(`Summary:\n${aiSummary}`);
  return lines.join('\n\n');
}

export function clusterSubstantiveLength(item) {
  let n = 0;
  const title = (item.title || '').trim();
  if (title) n += title.length;
  const aiSummary = item.aiSummary?.trim() || '';
  if (aiSummary) n += aiSummary.length;
  return n;
}

/** Full lean text — used for classification / LLM review (includes tags). */
export function buildClassifyTextFromCorpus(item, { includeSnippet = false, allowSnippetFallback = true } = {}) {
  return buildCategorizationEmbedTextFromCorpus(item, { includeSnippet, allowSnippetFallback });
}

/** Lean default; auto snippet when substantive fields are thin and fallback allowed. */
export function buildCategorizationEmbedTextFromCorpus(
  item,
  { includeSnippet = false, allowSnippetFallback = true } = {}
) {
  const lean = buildCategorizationTextFromCorpus(item, { includeSnippet: false });
  const substantive = substantiveTextLength(item);

  if (
    substantive >= LEAN_TEXT_MIN_FOR_SNIPPET_FALLBACK ||
    includeSnippet ||
    !item.snippet?.trim() ||
    !allowSnippetFallback
  ) {
    const text =
      includeSnippet && item.snippet?.trim() && allowSnippetFallback
        ? buildCategorizationTextFromCorpus(item, { includeSnippet: true })
        : lean;
    return { text, usedSnippetFallback: false, substantiveLength: substantive };
  }

  return {
    text: buildCategorizationTextFromCorpus(item, { includeSnippet: true }),
    usedSnippetFallback: true,
    substantiveLength: substantive,
  };
}
