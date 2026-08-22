import type { AiCategory, ClassifyState } from '../categorization/types';

/** Optional overlay filters — applied before candidate generation. */
export interface SearchFilters {
  projectId?: string;
  collectionId?: string;
  /** Exact AI category membership used by Search-local category tabs. */
  categoryId?: string;
  /** Exact normalized tag membership used by Search-local tag tabs. */
  tag?: string;
  /** Exclude items already organized anywhere in this project. */
  excludeProjectId?: string;
  /** Exclude items already organized in this collection. */
  excludeCollectionId?: string;
  domain?: string;
  sourceKind?: string;
  updatedAfter?: number;
  updatedBefore?: number;
}

export interface SearchWeights {
  lexical: number;
  embedding: number;
  category: number;
  qualityBoost: number;
  freshnessBoost: number;
  domainBoost: number;
  generalPenalty: number;
  manualReviewPenalty: number;
  /** Extra lexical boost when full query phrase appears in title. */
  phraseBoost: number;
}

export const DEFAULT_SEARCH_WEIGHTS: SearchWeights = {
  lexical: 0.4,
  embedding: 0.4,
  category: 0.2,
  qualityBoost: 0.05,
  freshnessBoost: 0.04,
  domainBoost: 0.08,
  generalPenalty: 0.06,
  manualReviewPenalty: 0.04,
  phraseBoost: 0.25,
};

export interface SearchDocument {
  itemId: string;
  title: string;
  url: string;
  domain: string;
  notes: string;
  tags: string[];
  summary: string;
  keyPoints: string[];
  sourceKind?: string;
  updatedAt: number;
  createdAt: number;
  collectionIds: string[];
  projectIds: string[];
  embedding?: number[];
  /** True when the canonical worker has a vector even if the tab cache strips it. */
  hasEmbedding?: boolean;
  primaryCategoryId?: string;
  categoryIds: string[];
  /** Best link score per category id for this item. */
  categoryScores: Record<string, number>;
  classifyState?: ClassifyState;
  hasQualityEnrichment: boolean;
}

export interface SearchIndex {
  documents: SearchDocument[];
  categories: AiCategory[];
  categoryById: Map<string, AiCategory>;
  itemsByCategory: Map<string, string[]>;
}

export interface ScoreBreakdown {
  lexical: number;
  embedding: number;
  category: number;
  qualityBoost: number;
  freshnessBoost: number;
  domainBoost: number;
  generalPenalty: number;
  manualReviewPenalty: number;
  baseScore: number;
  finalScore: number;
  matchedTerms: string[];
  matchedCategories: string[];
  candidateSources: Array<'lexical' | 'embedding' | 'category'>;
}

export interface SearchResult {
  itemId: string;
  title: string;
  url: string;
  domain: string;
  primaryCategoryId?: string;
  primaryCategoryName?: string;
  breakdown: ScoreBreakdown;
}

export interface SearchCategoryResult {
  categoryId: string;
  name: string;
  parentName?: string;
  description?: string;
  itemCount: number;
  score: number;
  nameScore: number;
  semanticScore: number;
  sources: Array<'name' | 'semantic'>;
}

export interface HybridSearchOptions {
  query: string;
  limit?: number;
  candidateLimit?: number;
  categoryTopK?: number;
  weights?: Partial<SearchWeights>;
  filters?: SearchFilters;
  queryEmbedding?: number[];
  /** Worker-computed similarities keyed by item id; vectors never leave the DB owner. */
  embeddingScores?: Record<string, number>;
  /** Worker-computed query similarities against persisted category prototypes. */
  categoryEmbeddingScores?: Record<string, number>;
  mode?: 'hybrid' | 'lexical-only';
}

export interface HybridSearchResult {
  query: string;
  mode: 'hybrid' | 'lexical-only';
  results: SearchResult[];
  /** Candidates scored before top-k trim. */
  totalCandidates: number;
  matchedCategoryIds: string[];
  /** Optional for backward-compatible restoration of pre-category-profile searches. */
  categoryResults?: SearchCategoryResult[];
  embeddingPathUsed: boolean;
  /** Why Hybrid Search fell back to text ranking, when caused by the AI backend. */
  semanticWarning?: string;
}
