import type { Item } from '../db';
import { loadRawBody } from './rawBodyStore';
import type { ItemEnrichment } from './types';

export interface BuildItemTextOptions {
  loadRaw?: boolean;
}

export function getPlacementNotes(item: Item): string {
  const parts: string[] = [];
  if (item.notes?.trim()) parts.push(item.notes.trim());
  const placements = item.placements || {};
  for (const p of Object.values(placements)) {
    if (p.notes?.trim()) parts.push(p.notes.trim());
  }
  return parts.join('\n\n');
}

export function buildItemText(
  item: Item,
  enrichment?: ItemEnrichment | null,
  _options?: BuildItemTextOptions
): string {
  const lines: string[] = [];
  const title = (item.title || '').trim();
  const url = (item.url || '').trim();

  if (title) lines.push(`Title: ${title}`);
  if (url) {
    lines.push(`URL: ${url}`);
    try {
      lines.push(`Host: ${new URL(url).hostname}`);
    } catch {
      /* ignore */
    }
  }

  const localNotes = getPlacementNotes(item);
  if (localNotes) lines.push(`Notes:\n${localNotes}`);

  if (enrichment?.quotedText) {
    const qa = enrichment.quotedAuthor ? ` (${enrichment.quotedAuthor})` : '';
    lines.push(`Quoted${qa}:\n${enrichment.quotedText}`);
  }
  if (enrichment?.channel) lines.push(`Channel: ${enrichment.channel}`);
  if (enrichment?.description) lines.push(`Description: ${enrichment.description}`);
  if (enrichment?.snippet?.trim()) {
    lines.push(`Enrichment:\n${enrichment.snippet.trim()}`);
  } else if (enrichment?.summary?.trim()) {
    lines.push(`Enrichment:\n${enrichment.summary.trim()}`);
  }

  return lines.join('\n\n');
}

/** Async variant when full disk dump is needed. */
export async function buildItemTextAsync(
  item: Item,
  enrichment?: ItemEnrichment | null,
  options?: BuildItemTextOptions
): Promise<string> {
  if (options?.loadRaw && enrichment?.rawRef && enrichment.hasRawBody) {
    const raw = await loadRawBody(enrichment.rawRef);
    if (raw?.trim()) {
      return `${buildItemText(item, enrichment)}\n\nRaw:\n${raw.trim().slice(0, 50_000)}`;
    }
  }
  return buildItemText(item, enrichment, options);
}
