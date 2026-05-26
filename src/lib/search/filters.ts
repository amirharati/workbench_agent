import type { SearchDocument, SearchFilters } from './types';

export function applySearchFilters(
  documents: SearchDocument[],
  filters?: SearchFilters
): SearchDocument[] {
  if (!filters) return documents;
  let out = documents;

  if (filters.projectId) {
    out = out.filter((d) => d.projectIds.includes(filters.projectId!));
  }
  if (filters.collectionId) {
    out = out.filter((d) => d.collectionIds.includes(filters.collectionId!));
  }
  if (filters.domain) {
    const dom = filters.domain.toLowerCase().replace(/^www\./, '');
    out = out.filter((d) => d.domain.toLowerCase().includes(dom));
  }
  if (filters.sourceKind) {
    out = out.filter((d) => d.sourceKind === filters.sourceKind);
  }
  if (filters.updatedAfter != null) {
    out = out.filter((d) => d.updatedAt >= filters.updatedAfter!);
  }
  if (filters.updatedBefore != null) {
    out = out.filter((d) => d.updatedAt <= filters.updatedBefore!);
  }

  return out;
}
