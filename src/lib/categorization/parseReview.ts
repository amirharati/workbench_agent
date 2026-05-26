export const MAX_CLASSIFY_PREVIEW = 1600;

export function stripFences(text: string): string {
  const trimmed = (text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

export function parseReviewJson(text: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(stripFences(text)) as { results?: unknown[] } | unknown[];
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (Array.isArray(parsed.results)) return parsed.results as Record<string, unknown>[];
    return [];
  } catch {
    return [];
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
