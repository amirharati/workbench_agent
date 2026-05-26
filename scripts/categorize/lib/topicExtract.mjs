/**
 * LLM concurrent topic extraction from title + summary (few-shot).
 * Maps to classify decisions: existing (topicIds), none (skip), new_category (proposed).
 */

import { parseReviewJson, compactItem, chunk } from './llmReviewShared.mjs';
import { normalizeTag } from './naming.mjs';
import {
  buildGroupedLeafCatalog,
  formatGroupedCatalogMarkdown,
  resolveTopicAssignments,
  TOPIC_CATALOG_RULES,
} from './taxonomyCatalog.mjs';

const MAX_CLASSIFY_PREVIEW = 1600;

/** Few-shot examples — ids match seed_* leaf ids in categories.seed.json */
export const TOPIC_FEW_SHOT = [
  {
    title: 'Key Concepts in RL — Spinning Up documentation',
    summary: 'Intro to RL: policies, value functions, policy gradients, MDPs.',
    output: {
      skip: false,
      topicIds: ['seed_reinforcement-learning'],
      proposed: [],
      confidence: 0.92,
      reason: 'Core RL theory tutorial.',
    },
  },
  {
    title: 'QuantConnect - Open Source Algorithmic Trading Platform',
    summary: 'LEAN engine, backtesting, live algorithmic trading.',
    output: {
      skip: false,
      topicIds: ['seed_algo-trading-platforms', 'seed_trading-strategies-education'],
      proposed: [],
      confidence: 0.9,
      reason: 'Algo platform plus systematic trading.',
    },
  },
  {
    title: 'Towards Data Science — Implementing ViT in PyTorch',
    summary: 'Vision transformer implementation walkthrough.',
    output: {
      skip: false,
      topicIds: ['seed_nlp-transformers', 'seed_ml-theory-tutorials'],
      proposed: [],
      confidence: 0.88,
      reason: 'Transformers + ML tutorial.',
    },
  },
  {
    title: 'Silent PC | Fanless PCs and Quiet Servers',
    summary: 'Fanless workstations and quiet PC hardware.',
    output: {
      skip: false,
      topicIds: ['seed_quiet-pc-hardware'],
      proposed: [],
      confidence: 0.95,
      reason: 'Quiet PC hardware retail.',
    },
  },
  {
    title: 'Are all sausages bad for you?',
    summary: 'Health and nutrition analysis of processed meats.',
    output: {
      skip: false,
      topicIds: ['seed_health-nutrition'],
      proposed: [],
      confidence: 0.85,
      reason: 'Food health topic.',
    },
  },
  {
    title: 'How to Have Sex Dreams: Erotic Lucid Dreaming Explained',
    summary: 'Guide to inducing sex dreams and lucid dreaming for erotic dream control; wellness-focused article.',
    output: {
      skip: false,
      topicIds: ['seed_sexuality-wellness-education'],
      proposed: [],
      confidence: 0.88,
      reason: 'Sexuality/wellness education — not explicit adult video.',
    },
  },
  {
    title: "Girl licks man's feet and allows him to put leg on head",
    summary: 'Explicit adult video: dominance, fetish, sexual scene on tube site.',
    output: {
      skip: false,
      topicIds: ['seed_adult-erotic-content'],
      proposed: [],
      confidence: 0.9,
      reason: 'Explicit adult video — classify for library tracking.',
    },
  },
  {
    title: 'Market microstructure overview (practitioner blog)',
    summary: 'Broad quant markets perspective without a specific platform or strategy focus.',
    output: {
      skip: false,
      topicPaths: [['quant-finance', 'seed_quant-finance-general']],
      topicIds: ['seed_quant-finance-general'],
      proposed: [],
      confidence: 0.78,
      reason: 'Quant domain clear; no specific sibling leaf fits.',
    },
  },
  {
    title: 'Installing Singularity — Singularity Admin Guide',
    summary: 'Container runtime installation for HPC.',
    output: {
      skip: false,
      topicPaths: [['infra-hosting', 'seed_infra-hosting-general']],
      topicIds: ['seed_infra-hosting-general'],
      proposed: [],
      confidence: 0.82,
      reason: 'HPC containers — infra fallback.',
    },
  },
  {
    title: 'YouTube',
    summary: '',
    output: {
      skip: true,
      topicIds: [],
      proposed: [],
      confidence: 0.95,
      reason: 'Generic login/home — no topic.',
    },
  },
];

function compactItemForTopics(item) {
  const classifyText = item.classifyText ?? item.text ?? '';
  return {
    itemId: item.itemId,
    title: item.title || '',
    textForClassification: classifyText.slice(0, MAX_CLASSIFY_PREVIEW),
  };
}

/** Grouped parent → leaves with path / pathIds (preferred for classify prompts). */
export function buildTopicCatalog(categories, parents = []) {
  return buildGroupedLeafCatalog(categories, parents);
}

export function buildTopicExtractPrompt(topicCatalog, batchItems) {
  const catalogMarkdown = formatGroupedCatalogMarkdown(topicCatalog);
  const rules = [
    'Each specific topic is ONE atomic subject (2-5 words). Never slash-separated mashups.',
    ...TOPIC_CATALOG_RULES,
    'NEVER skip or reject links because they are adult/erotic/porn — assign adult-erotic-content or sexuality-wellness-education.',
    'Singularity/containers/HPC runtime → infra-hosting-general unless a specific infra leaf fits.',
    'Indie hackers / business ideas → product-gtm-general or propose one specific GTM leaf.',
    'proposed: parentId one of quant-finance, machine-learning, ai-productivity, software-dev, product-gtm, personal-finance, health-lifestyle, infra-hosting, hardware.',
    'Do not invent topics from URL alone; use summary substance.',
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
    JSON.stringify(batchItems, null, 2),
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

/** @deprecated use resolveTopicAssignments */
export function resolveTopicIds(raw, categoryIds, leafById = null) {
  const map =
    leafById ??
    new Map(
      [...categoryIds].map((id) => [id, { id, parentId: null }])
    );
  return resolveTopicAssignments(raw, categoryIds, map);
}

/** Convert topic-extract row → llmReview decision shape */
export function topicRowToDecision(raw, categoryIds, leafById = null) {
  if (!raw || typeof raw !== 'object') return null;
  const itemId = typeof raw.itemId === 'string' ? raw.itemId : null;
  if (!itemId) return null;

  const confidence = Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence))
    : undefined;
  const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 280) : undefined;

  if (raw.skip === true) {
    return { itemId, decisionType: 'none', confidence, reason, needsReclassify: false };
  }

  const byLeaf =
    leafById ??
    new Map([...categoryIds].map((id) => [id, { id, parentId: null }]));
  const topicIds = resolveTopicAssignments(raw, categoryIds, byLeaf);
  if (topicIds.length) {
    return {
      itemId,
      decisionType: 'existing',
      categoryIds: topicIds,
      confidence,
      reason,
      needsReclassify: false,
    };
  }

  const proposedList = Array.isArray(raw.proposed) ? raw.proposed : [];
  const p = proposedList[0] ?? raw.proposedCategory;
  if (p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim()) {
    const canonicalTags = Array.isArray(p.canonicalTags)
      ? p.canonicalTags
          .map((t) => (typeof t === 'string' ? normalizeTag(t) : null))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    return {
      itemId,
      decisionType: 'new_category',
      proposedCategory: {
        name: p.name.trim().slice(0, 120),
        description: (p.description || '').trim().slice(0, 300),
        canonicalTags: canonicalTags.length ? canonicalTags : ['misc'],
        parentId: p.parentId,
      },
      confidence,
      reason,
      needsReclassify: true,
    };
  }

  return { itemId, decisionType: 'none', confidence, reason, needsReclassify: false };
}

export async function callTopicExtractBatch(settings, categories, batchItems, { parents = [] } = {}) {
  const endpoint = `${(settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs || 90_000);
  const topicCatalog = buildTopicCatalog(categories, parents);
  const items = batchItems.map((i) =>
    i.textForClassification != null ? i : compactItemForTopics(i)
  );

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workbench-agent.local',
        'X-Title': 'Workbench Topic Extract',
      },
      body: JSON.stringify({
        model: settings.model || 'openai/gpt-4o-mini',
        temperature: settings.temperature ?? 0.12,
        max_tokens: settings.maxOutputTokens ?? 4000,
        messages: [
          {
            role: 'system',
            content:
              'You extract concurrent atomic topics for bookmarks. Return only valid JSON. Use leafId or topicPaths from grouped topicCatalog. Prefer specific leaves over *-general fallbacks. skip only for junk/login/placeholder pages — always classify valid adult/erotic pages (adult-erotic-content), never skip as inappropriate.',
          },
          {
            role: 'user',
            content: buildTopicExtractPrompt(topicCatalog, items),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 240)}` };
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return { ok: false, error: 'Empty model response' };
    return { ok: true, rows: parseReviewJson(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
