export const MAX_CLASSIFY_PREVIEW = 1600;

export function stripFences(text) {
  const trimmed = (text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

export function parseReviewJson(text) {
  try {
    const parsed = JSON.parse(stripFences(text));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.results)) return parsed.results;
    return [];
  } catch {
    return [];
  }
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function compactItem(item, candidateCategories = null) {
  const classifyText = item.classifyText ?? item.text ?? '';
  const tags = item.enrichmentAiTags?.filter((t) => t?.trim()).slice(0, 6) ?? [];
  const payload = {
    itemId: item.itemId,
    title: item.title || '',
    url: item.url || '',
    sourceKind: item.sourceKind || 'article',
    textForClassification: classifyText.slice(0, MAX_CLASSIFY_PREVIEW),
  };
  if (tags.length) payload.extractedTagsHint = tags;
  if (candidateCategories?.length) payload.candidateCategories = candidateCategories;
  return payload;
}
