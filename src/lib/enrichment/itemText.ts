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
  const snippet = enrichment?.snippet?.trim() || '';
  const aiSummary = enrichment?.aiStatus === 'ok' ? enrichment.summary?.trim() || '' : '';

  if (snippet) {
    lines.push(`Enrichment:\n${snippet}`);
  } else if (aiSummary) {
    lines.push(`Enrichment:\n${aiSummary}`);
  }

  if (aiSummary && aiSummary !== snippet) {
    lines.push(`Summary:\n${aiSummary}`);
  }

  const keyPoints =
    enrichment?.aiStatus === 'ok' ? enrichment.aiKeyPoints?.filter((p) => p.trim()) : undefined;
  if (keyPoints?.length) {
    lines.push(`Key points:\n${keyPoints.map((p) => `- ${p.trim()}`).join('\n')}`);
  }

  if (enrichment?.references?.length) {
    lines.push(
      `Resources:\n${enrichment.references
        .map((r) => `- ${r.label}: ${r.url}`)
        .join('\n')}`
    );
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
