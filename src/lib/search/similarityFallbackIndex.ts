import { tokenize } from './tokenize';
import type { SearchDocument } from './types';

export interface SimilarityFallbackHit {
  itemId: string;
  score: number;
}

function documentTokens(document: SearchDocument): Set<string> {
  return new Set(tokenize([
    document.title,
    ...document.tags,
    document.summary,
    ...document.keyPoints,
  ].join(' ')));
}

/** Lightweight inverted fallback used only when an item has no vector. */
export class WorkerSimilarityFallbackIndex {
  private readonly documentById = new Map<string, SearchDocument>();
  private readonly tokensByItemId = new Map<string, Set<string>>();
  private readonly itemIdsByToken = new Map<string, Set<string>>();
  private readonly itemIdsByDomain = new Map<string, Set<string>>();

  load(documents: Iterable<SearchDocument>): void {
    this.clear();
    for (const document of documents) this.upsert(document);
  }

  clear(): void {
    this.documentById.clear();
    this.tokensByItemId.clear();
    this.itemIdsByToken.clear();
    this.itemIdsByDomain.clear();
  }

  upsert(document: SearchDocument): void {
    this.remove(document.itemId);
    this.documentById.set(document.itemId, document);
    const tokens = documentTokens(document);
    this.tokensByItemId.set(document.itemId, tokens);
    for (const token of tokens) {
      const ids = this.itemIdsByToken.get(token) ?? new Set<string>();
      ids.add(document.itemId);
      this.itemIdsByToken.set(token, ids);
    }
    const domain = document.domain.trim().toLowerCase();
    if (domain) {
      const ids = this.itemIdsByDomain.get(domain) ?? new Set<string>();
      ids.add(document.itemId);
      this.itemIdsByDomain.set(domain, ids);
    }
  }

  remove(itemId: string): void {
    const previous = this.documentById.get(itemId);
    if (!previous) return;
    for (const token of this.tokensByItemId.get(itemId) ?? []) {
      const ids = this.itemIdsByToken.get(token);
      ids?.delete(itemId);
      if (ids?.size === 0) this.itemIdsByToken.delete(token);
    }
    const domain = previous.domain.trim().toLowerCase();
    const domainIds = this.itemIdsByDomain.get(domain);
    domainIds?.delete(itemId);
    if (domainIds?.size === 0) this.itemIdsByDomain.delete(domain);
    this.documentById.delete(itemId);
    this.tokensByItemId.delete(itemId);
  }

  query(
    itemId: string,
    options: { limit: number; allowedItemIds?: ReadonlySet<string>; excludeSelf?: boolean }
  ): SimilarityFallbackHit[] {
    const anchor = this.documentById.get(itemId);
    if (!anchor) return [];
    const anchorTokens = this.tokensByItemId.get(itemId) ?? new Set<string>();
    const candidates = new Set<string>();
    for (const token of anchorTokens) {
      for (const candidateId of this.itemIdsByToken.get(token) ?? []) candidates.add(candidateId);
    }
    const domain = anchor.domain.trim().toLowerCase();
    for (const candidateId of this.itemIdsByDomain.get(domain) ?? []) candidates.add(candidateId);

    const hits: SimilarityFallbackHit[] = [];
    for (const candidateId of candidates) {
      if (options.excludeSelf !== false && candidateId === itemId) continue;
      if (options.allowedItemIds && !options.allowedItemIds.has(candidateId)) continue;
      const candidate = this.documentById.get(candidateId);
      if (!candidate) continue;
      const candidateTokens = this.tokensByItemId.get(candidateId) ?? new Set<string>();
      let overlap = 0;
      for (const token of anchorTokens) {
        if (candidateTokens.has(token)) overlap++;
      }
      const union = anchorTokens.size + candidateTokens.size - overlap;
      const tokenScore = union > 0 ? overlap / union : 0;
      const domainScore = domain && candidate.domain.trim().toLowerCase() === domain ? 0.2 : 0;
      const score = Math.min(1, tokenScore + domainScore);
      if (score > 0) hits.push({ itemId: candidateId, score });
    }
    hits.sort((left, right) => right.score - left.score || left.itemId.localeCompare(right.itemId));
    return hits.slice(0, Math.max(0, Math.floor(options.limit)));
  }
}
