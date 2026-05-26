import { stripSnippetBoilerplate } from './itemText.mjs';

export const MIN_SEMANTIC_SUBSTANCE = 100;
export const MIN_AI_SUMMARY_LENGTH = 50;
export const MIN_NOTES_LENGTH = 80;
export const MIN_SNIPPET_SUBSTANCE = 120;

const GENERIC_TITLE =
  /^(?:welcome|home|sign\s*up|log\s*in|youtube|linkedin|facebook|twitter|x|untitled|page not found|404|error|undefined)\s*$/i;
const GENERIC_TITLE_SUFFIX = /\s[-—|]\s*(?:youtube|linkedin|facebook)\s*$/i;
const FAILED_AI = new Set(['empty_response', 'parse_failed', 'api_error', 'content_too_short']);

export function isGenericTitle(title) {
  const t = (title || '').trim();
  if (!t || t.length < 3) return true;
  if (GENERIC_TITLE.test(t)) return true;
  if (t.length < 18 && GENERIC_TITLE_SUFFIX.test(t)) return true;
  return false;
}

export function snippetSubstance(snippet) {
  const cleaned = stripSnippetBoilerplate(snippet || '');
  if (cleaned.length < MIN_SNIPPET_SUBSTANCE) return 0;
  const words = cleaned.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  if (new Set(words).size < 12) return 0;
  return cleaned.length;
}

export function semanticSubstanceLength(item) {
  let n = 0;
  const title = (item.title || '').trim();
  if (title && !isGenericTitle(title)) n += title.length;
  const notes = (item.notes || '').trim();
  if (notes) n += notes.length;
  const tags = item.aiTags?.filter((t) => t?.trim()) ?? [];
  if (tags.length) n += tags.join(' ').length;
  const summary = item.aiSummary?.trim() || '';
  if (summary) n += summary.length;
  const keyPoints = item.aiKeyPoints?.filter((p) => p?.trim()) ?? [];
  if (keyPoints.length) n += keyPoints.join(' ').length;
  if (item.quotedText?.trim()) n += item.quotedText.trim().length;
  if (item.description?.trim()) n += item.description.trim().length;
  return n;
}

export function assessCategorizationEligibility(item) {
  const aiStatus = item.aiStatus;
  const summary = item.aiSummary?.trim() || '';
  const semanticLength = semanticSubstanceLength(item);
  const notes = (item.notes || '').trim();
  const title = (item.title || '').trim();
  const genericTitle = isGenericTitle(title);

  const aiOk = aiStatus === 'ok' && summary.length >= MIN_AI_SUMMARY_LENGTH;
  const notesOk = notes.length >= MIN_NOTES_LENGTH;
  const substanceOk = semanticLength >= MIN_SEMANTIC_SUBSTANCE;
  const snippetOk = snippetSubstance(item.snippet) > 0;
  const allowSnippetFallback =
    aiOk || (!FAILED_AI.has(aiStatus) && snippetOk && !genericTitle);

  if (aiOk || notesOk || substanceOk) {
    return { eligible: true, semanticLength, allowSnippetFallback };
  }

  if (FAILED_AI.has(aiStatus)) {
    return {
      eligible: false,
      reason: `AI extraction failed (${aiStatus}) and insufficient semantic text (${semanticLength})`,
      semanticLength,
      allowSnippetFallback: false,
    };
  }

  if (genericTitle && summary.length < MIN_AI_SUMMARY_LENGTH) {
    return {
      eligible: false,
      reason: 'generic title without AI summary',
      semanticLength,
      allowSnippetFallback: false,
    };
  }

  return {
    eligible: false,
    reason: `insufficient semantic text (${semanticLength} < ${MIN_SEMANTIC_SUBSTANCE})`,
    semanticLength,
    allowSnippetFallback,
  };
}
