import { runAICompletion } from '../ai/client';
import { aiSettingsForBatchJob } from '../ai/settings';
import type { AISettings } from '../ai/types';
import { normalizeTag } from './naming';
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
    'Singularity/containers/HPC runtime → infra-hosting-general unless a specific infra leaf fits.',
    'Indie hackers / business ideas → product-gtm-general or propose one specific GTM leaf.',
    'proposed: parentId one of quant-finance, machine-learning, ai-productivity, software-dev, product-gtm, personal-finance, health-lifestyle, infra-hosting, hardware.',
    'Do not invent topics from URL alone; use summary substance.',
    'If no catalog leaf fits, return empty topicIds and a proposed leaf — do NOT skip valid articles, tutorials, or product pages.',
    'Use skip:true ONLY for empty/login/placeholder/captcha pages with no substantive content.',
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
  parents: Array<{ id: string; name: string; description?: string }> = []
): Promise<{ ok: boolean; rows?: Record<string, unknown>[]; error?: string }> {
  const topicCatalog = buildGroupedLeafCatalog(categories, parents);
  const prompt = buildTopicExtractPrompt(topicCatalog, batchItems);
  try {
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, 4000),
      {
        taskType: 'general',
        messages: [
          {
            role: 'system',
            content:
              'You extract concurrent atomic topics for bookmarks. Return only valid JSON. Use leafId or topicPaths from grouped topicCatalog. Prefer specific leaves over *-general fallbacks. If nothing fits, propose a new leaf under the best parent — do not skip substantive pages. skip:true only for junk/login/placeholder pages with no real content.',
          },
          { role: 'user', content: prompt },
        ],
      }
    );
    const rows = parseReviewJson(response.text);
    if (!rows.length) return { ok: false, error: 'Empty or unparseable model response' };
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function retryMissingTopicExtract(
  settings: AISettings,
  categories: AiCategory[],
  missing: ClassifyBatchItem[],
  categoryIds: Set<string>,
  leafById: Map<string, { id: string; parentId?: string | null }>,
  parents: Array<{ id: string; name: string; description?: string }>
): Promise<TopicExtractDecision[]> {
  const recovered: TopicExtractDecision[] = [];
  for (const item of missing) {
    const one = await callTopicExtractBatch(settings, categories, [item], parents);
    if (one.ok && one.rows?.length) {
      const d = topicRowToDecision(one.rows[0], categoryIds, leafById);
      if (d) recovered.push(d);
    }
  }
  return recovered;
}

export { chunk as chunkClassifyBatch };
