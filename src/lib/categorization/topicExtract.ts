import { runAICompletion } from '../ai/client';
import { aiSettingsForBatchJob } from '../ai/settings';
import type { AISettings } from '../ai/types';
import { normalizeTag } from './naming';
import { LLM_BATCH_RETRY_ROUNDS, LLM_SINGLE_FALLBACK_CAP } from './llmBatchRetry';
import { chunk, MAX_CLASSIFY_PREVIEW, parseReviewJson } from './parseReview';
import {
  buildGroupedLeafCatalog,
  formatGroupedCatalogMarkdown,
  resolveTopicAssignments,
  TOPIC_CATALOG_RULES,
} from './taxonomyCatalog';
import type { AiCategory, ProposedCategoryDraft, TopicExtractDecision } from './types';
import { TOPIC_FEW_SHOT } from './topicFewShot';

export function topicExtractBatchSize(leafCount: number, requested = 20): number {
  if (leafCount > 34) return Math.min(requested, 8);
  if (leafCount > 28) return Math.min(requested, 12);
  return requested;
}

export interface ClassifyBatchItem {
  itemId: string;
  title: string;
  textForClassification: string;
  enrichmentAiTags?: string[];
}

function compactItemForTopics(item: ClassifyBatchItem): ClassifyBatchItem {
  return {
    itemId: item.itemId,
    title: item.title || '',
    textForClassification: item.textForClassification.slice(0, MAX_CLASSIFY_PREVIEW),
    enrichmentAiTags: item.enrichmentAiTags?.filter((t) => t?.trim()).slice(0, 6),
  };
}

export function buildTopicExtractPrompt(
  topicCatalog: ReturnType<typeof buildGroupedLeafCatalog>,
  batchItems: ClassifyBatchItem[]
): string {
  const catalogMarkdown = formatGroupedCatalogMarkdown(topicCatalog);
  const rules = [
    'Each specific topic is ONE atomic subject (2-5 words). Never slash-separated mashups.',
    ...TOPIC_CATALOG_RULES,
    'NEVER skip or reject links because they are adult/erotic/porn — assign adult-erotic-content or sexuality-wellness-education.',
    'NEVER put substantive pages in link-quality (generic-low-signal, etc.): movie/TV lists, immigration/visa, directories, tutorials, adult — always a normal topic leaf, *-general, or proposed.',
    'Login/auth walls (YouTube sign-in, etc.) → login-auth-required (attention basket — keep bookmark). Removal leaves: 404/5xx, example.com, fetch fail, blank pages only.',
    'url-redirect-mismatch: RARE — only when summary explicitly states saved URL does not match fetched page (article→hub). NEVER for www/https, t.co→tweet, or when unsure — prefer normal topic.',
    'If the summary describes a real topic, NEVER use link-quality (even if the URL looks generic).',
    'Singularity/containers/HPC runtime → infra-hosting-general unless a specific infra leaf fits.',
    'Indie hackers / business ideas → product-gtm-general or propose one specific GTM leaf.',
    'Immigration / embassy / visa process → government-forms-requests (or propose under health-lifestyle).',
    'Movies / TV / streaming site lists → movies-tv-streaming (or propose).',
    'Do not invent topics from URL alone; use summary substance.',
    'Use judgment: if the item clearly belongs to a parent domain, pick the best leaf — specific if it fits, otherwise that parent\'s *-general. Do NOT force-fit unrelated categories.',
    'Leave topicIds empty only when no parent domain fits at all — it will go to discover.',
    'Only propose a new leaf when the domain is clear but no sibling leaf even loosely fits.',
    'Dead links: 404/5xx/placeholder → link-quality; never generic-low-signal for those (use page-not-found or placeholder-junk).',
    'Return one result object per item in items[] — same itemId, no omissions.',
  ];

  return [
    '## Task',
    'Extract concurrent ATOMIC topics for each bookmark from title + textForClassification.',
    '',
    catalogMarkdown,
    '',
    '## Rules',
    rules.map((r) => `- ${r}`).join('\n'),
    '',
    '## Few-shot examples (JSON)',
    '```json',
    JSON.stringify(TOPIC_FEW_SHOT, null, 2),
    '```',
    '',
    '## Items to classify (JSON)',
    '```json',
    JSON.stringify(batchItems.map(compactItemForTopics), null, 2),
    '```',
    '',
    '## Response format (JSON only, no markdown fences)',
    JSON.stringify({
      results: [
        {
          itemId: 'string — must match every item above',
          skip: 'boolean',
          topicIds: ['leafId from catalog', 'max 3'],
          topicPaths: [['parentId', 'leafId'], 'optional'],
          proposed: [{ parentId: 'string', name: 'string', description: 'string', canonicalTags: ['string'] }],
          confidence: '0..1',
          reason: 'short',
        },
      ],
    }),
  ].join('\n');
}

export function topicRowToDecision(
  raw: Record<string, unknown>,
  categoryIds: Set<string>,
  leafById: Map<string, { id: string; parentId?: string | null }>
): TopicExtractDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const itemId = typeof raw.itemId === 'string' ? raw.itemId : null;
  if (!itemId) return null;

  const confidence = Number.isFinite(raw.confidence as number)
    ? Math.max(0, Math.min(1, raw.confidence as number))
    : undefined;
  const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 280) : undefined;

  if (raw.skip === true) {
    return { itemId, decisionType: 'none', confidence, reason, needsReclassify: false, status: 'ok' };
  }

  const topicIds = resolveTopicAssignments(
    raw as { topicPaths?: string[][]; topicIds?: string[]; categoryIds?: string[] },
    categoryIds,
    leafById
  );
  if (topicIds.length) {
    return {
      itemId,
      decisionType: 'existing',
      categoryIds: topicIds,
      confidence,
      reason,
      needsReclassify: false,
      status: 'ok',
    };
  }

  const proposedList = Array.isArray(raw.proposed) ? raw.proposed : [];
  const p = (proposedList[0] ?? raw.proposedCategory) as Record<string, unknown> | undefined;
  if (p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim()) {
    const canonicalTags = Array.isArray(p.canonicalTags)
      ? (p.canonicalTags as string[])
          .map((t) => (typeof t === 'string' ? normalizeTag(t) : null))
          .filter((t): t is string => Boolean(t))
          .slice(0, 6)
      : [];
    const draft: ProposedCategoryDraft = {
      name: p.name.trim().slice(0, 120),
      description: (typeof p.description === 'string' ? p.description : '').trim().slice(0, 300),
      canonicalTags: canonicalTags.length ? canonicalTags : ['misc'],
      parentId: typeof p.parentId === 'string' ? p.parentId : undefined,
    };
    return {
      itemId,
      decisionType: 'new_category',
      proposedCategory: draft,
      confidence,
      reason,
      needsReclassify: true,
      status: 'ok',
    };
  }

  return { itemId, decisionType: 'none', confidence, reason, needsReclassify: false, status: 'ok' };
}

export async function callTopicExtractBatch(
  settings: AISettings,
  categories: AiCategory[],
  batchItems: ClassifyBatchItem[],
  parents: Array<{ id: string; name: string; description?: string }> = [],
  signal?: AbortSignal
): Promise<{ ok: boolean; rows?: Record<string, unknown>[]; error?: string }> {
  const topicCatalog = buildGroupedLeafCatalog(categories, parents);
  const prompt = buildTopicExtractPrompt(topicCatalog, batchItems);
  try {
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, 4000),
      {
        taskType: 'general',
        signal,
        messages: [
          {
            role: 'system',
            content:
              'You extract atomic topics for bookmarks (JSON only). Prefer specific leaves over *-general. link-quality removal: 404, 5xx, example.com, fetch fail. Login walls → login-auth-required (attention, not removal). Never link-quality when summary has a real subject. Adult → adult-erotic-content. Missing leaf → propose or *-general.',
          },
          { role: 'user', content: prompt },
        ],
      }
    );
    if (signal?.aborted) throw new Error('Cancelled');
    const rows = parseReviewJson(response.text);
    if (!rows.length) return { ok: false, error: 'Empty or unparseable model response' };
    return { ok: true, rows };
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.message === 'Cancelled')) throw new Error('Cancelled');
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface TopicExtractBatchRetryResult {
  decisions: Map<string, TopicExtractDecision>;
  unresolvedItemIds: string[];
  lastError?: string;
}

function pendingTopicExtractItems(
  batchItems: ClassifyBatchItem[],
  decisions: Map<string, TopicExtractDecision>
): ClassifyBatchItem[] {
  return batchItems.filter((item) => !decisions.has(item.itemId));
}

function absorbTopicExtractRows(
  rows: Record<string, unknown>[] | undefined,
  categoryIds: Set<string>,
  leafById: Map<string, { id: string; parentId?: string | null }>,
  decisions: Map<string, TopicExtractDecision>
): void {
  if (!rows?.length) return;
  for (const row of rows) {
    const d = topicRowToDecision(row, categoryIds, leafById);
    if (d) decisions.set(d.itemId, d);
  }
}

/** Classify a batch with re-chunked retries; singles only for stubborn leftovers. */
export async function resolveTopicExtractBatchWithRetry(
  settings: AISettings,
  categories: AiCategory[],
  batchItems: ClassifyBatchItem[],
  categoryIds: Set<string>,
  leafById: Map<string, { id: string; parentId?: string | null }>,
  parents: Array<{ id: string; name: string; description?: string }>,
  batchSize: number,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void
): Promise<TopicExtractBatchRetryResult> {
  const decisions = new Map<string, TopicExtractDecision>();
  let lastError: string | undefined;
  if (!batchItems.length) {
    return { decisions, unresolvedItemIds: [] };
  }

  const runBatch = async (items: ClassifyBatchItem[]): Promise<ClassifyBatchItem[]> => {
    if (signal?.aborted) throw new Error('Cancelled');
    const resp = await callTopicExtractBatch(settings, categories, items, parents, signal);
    if (resp.ok && resp.rows?.length) {
      absorbTopicExtractRows(resp.rows, categoryIds, leafById, decisions);
    } else {
      lastError = resp.error ?? lastError ?? 'Empty or unparseable model response';
    }
    return pendingTopicExtractItems(items, decisions);
  };

  let pending = await runBatch(batchItems);

  for (let round = 1; round <= LLM_BATCH_RETRY_ROUNDS && pending.length > 0; round++) {
    if (signal?.aborted) throw new Error('Cancelled');
    onProgress?.(`Retry batch round ${round}/${LLM_BATCH_RETRY_ROUNDS} (${pending.length} items)…`);
    const chunks = chunk(pending, batchSize);
    const nextPending: ClassifyBatchItem[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkItems = chunks[i]!;
      onProgress?.(
        chunks.length > 1
          ? `Retry batch ${round}.${i + 1} (${chunkItems.length} items)…`
          : `Retry batch ${round} (${chunkItems.length} items)…`
      );
      nextPending.push(...(await runBatch(chunkItems)));
    }
    pending = nextPending;
  }

  if (pending.length > 1) {
    onProgress?.(`Final batch retry (${pending.length} items)…`);
    pending = await runBatch(pending);
  }

  if (pending.length > 0) {
    const singles = pending.slice(0, LLM_SINGLE_FALLBACK_CAP);
    onProgress?.(`Single-item retry for ${singles.length} stubborn item(s)…`);
    for (let i = 0; i < singles.length; i++) {
      if (signal?.aborted) throw new Error('Cancelled');
      const item = singles[i]!;
      onProgress?.(`Single retry ${i + 1}/${singles.length}…`);
      pending = await runBatch([item]);
    }
  }

  const unresolvedItemIds = batchItems
    .map((item) => item.itemId)
    .filter((itemId) => !decisions.has(itemId));

  return { decisions, unresolvedItemIds, lastError };
}

export { chunk as chunkClassifyBatch };
