import { createHash } from 'crypto';
import { normalizeTag, slugFromTerms } from './naming.mjs';
import { l2Normalize, cosineSimilarity } from './math.mjs';
import {
  buildGroupedLeafCatalog,
  DISCOVER_CATALOG_RULES,
  DISCOVER_SKIP_RULES,
  ensureGeneralFallbackLeaves,
  formatGroupedCatalogMarkdown,
  isGeneralLeafId,
} from './taxonomyCatalog.mjs';

/** Initial parent buckets — discovery may add more via newParents[]. */
export const DEFAULT_PARENTS = [
  {
    id: 'quant-finance',
    name: 'Quantitative finance & trading',
    description:
      'Algorithmic trading, backtesting, market systems, and trading education — not generic personal budgeting.',
  },
  {
    id: 'machine-learning',
    name: 'Machine learning & AI research',
    description:
      'ML theory, models, training, diffusion, transformers, RL — not SaaS productivity wrappers unless core topic is the model.',
  },
  {
    id: 'ai-productivity',
    name: 'AI tools & research workflows',
    description:
      'AI assistants, research tools, writing partners, browser automation, and ML infrastructure APIs for builders.',
  },
  {
    id: 'software-dev',
    name: 'Software development',
    description:
      'Programming languages, frameworks, mobile, native integration, and developer tooling.',
  },
  {
    id: 'product-gtm',
    name: 'Product, demos & go-to-market',
    description:
      'Interactive demos, sales enablement, onboarding products, and no-code site builders.',
  },
  {
    id: 'personal-finance',
    name: 'Personal finance & investing',
    description:
      'Retail investing education, budgeting, and personal money topics — not health, sexuality, or adult content.',
  },
  {
    id: 'health-lifestyle',
    name: 'Health, sexuality & lifestyle',
    description:
      'Health, nutrition, sexuality education, adult content, and personal civic/lifestyle topics — not trading or personal finance.',
  },
  {
    id: 'infra-hosting',
    name: 'Infrastructure & hosting',
    description:
      'Cloud hosting, servers, DevOps, and platform operations for self-hosted or VPS workloads.',
  },
  {
    id: 'hardware',
    name: 'Hardware & workstations',
    description: 'PC builds, fanless/quiet systems, components, and physical workstation topics.',
  },
];

function stripFences(text) {
  const trimmed = (text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function parseDiscoveryJson(text) {
  try {
    const parsed = JSON.parse(stripFences(text));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeNameKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function leafIdFromProposal(p, index) {
  const tags = p.canonicalTags?.filter(Boolean) ?? [];
  const slug = slugFromTerms(tags.length ? tags : [normalizeNameKey(p.name).slice(0, 40)]);
  return `${slug || 'topic'}_${index}`;
}

export function parentIdFromProposal(name, existingIds) {
  let base = slugFromTerms([name]);
  if (!base || base === 'topic') base = 'domain';
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

export function mergeNewParents(parentsSoFar, proposals, { maxNewPerBatch }) {
  const parentIds = new Set(parentsSoFar.map((p) => p.id));
  const byName = new Map(parentsSoFar.map((p) => [normalizeNameKey(p.name), p]));
  const added = [];
  const cap = maxNewPerBatch > 0 ? maxNewPerBatch : proposals.length;

  for (const p of (proposals ?? []).slice(0, cap)) {
    if (!p?.name?.trim()) continue;
    const key = normalizeNameKey(p.name);
    if (byName.has(key)) continue;
    let id = typeof p.id === 'string' ? p.id.trim().replace(/[^a-z0-9-]/g, '-') : '';
    if (!id || parentIds.has(id)) id = parentIdFromProposal(p.name, parentIds);
    parentIds.add(id);
    const row = {
      id,
      name: p.name.trim().slice(0, 80),
      description: (p.description || '').trim().slice(0, 300),
    };
    parentsSoFar.push(row);
    added.push(row);
    byName.set(key, row);
  }
  return { parentsSoFar, added, parentIds };
}

export function filterItemsForDiscovery(items) {
  return items.filter((item) => {
    if (item.categorizationEligible === false) return false;
    const clusterText = (item.clusterText ?? '').trim();
    const summary = (item.aiSummary ?? '').trim();
    if (clusterText.length < 40 && summary.length < 40) return false;
    return true;
  });
}

/**
 * Greedy diverse ordering: prefer items far from already-picked embeddings.
 */
export function orderItemsByDiversity(items, embeddings, { maxSimilarity = 0.92 } = {}) {
  const indexed = items
    .map((item, i) => ({ item, embedding: embeddings[i] }))
    .filter((x) => x.embedding?.length);

  if (!indexed.length) return [];

  const picked = [];
  const remaining = [...indexed];

  while (remaining.length) {
    let bestIdx = 0;
    if (picked.length) {
      let bestMinDist = -1;
      for (let i = 0; i < remaining.length; i++) {
        let minSim = 1;
        for (const p of picked) {
          const sim = cosineSimilarity(remaining[i].embedding, p.embedding);
          if (sim < minSim) minSim = sim;
        }
        if (minSim < bestMinDist || bestMinDist < 0) {
          bestMinDist = minSim;
          bestIdx = i;
        }
      }
      const chosen = remaining.splice(bestIdx, 1)[0];
      if (picked.length && bestMinDist >= maxSimilarity) {
        /* still include but deprioritized — skip near-dup of last pick only */
      }
      picked.push(chosen);
    } else {
      picked.push(remaining.shift());
    }
  }

  return picked.map((p) => p.item);
}

export function chunkItems(items, batchSize) {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

function compactDiscoveryItem(item) {
  const summary = (item.aiSummary ?? item.summary ?? '').trim().slice(0, 800);
  const row = {
    itemId: item.itemId,
    title: (item.title || '').slice(0, 120),
    summary: summary || '(no summary)',
  };
  if (item.stuckKind) row.stuckKind = item.stuckKind;
  return row;
}

/** Turn assign_new rows into leaf proposals when the model omitted newLeaves[]. */
export function leafProposalsFromItemResults(itemResults, parentIds) {
  const out = [];
  for (const row of itemResults ?? []) {
    const action = String(row?.action ?? '').toLowerCase();
    if (action !== 'assign_new') continue;
    const slug =
      typeof row.proposedLeafId === 'string'
        ? row.proposedLeafId.trim().replace(/[^a-z0-9-]/g, '-')
        : '';
    if (!slug) continue;
    let parentId = typeof row.categoryId === 'string' ? row.categoryId.trim() : '';
    if (!parentIds.has(parentId)) parentId = '';
    if (!parentId) continue;
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
    out.push({
      id: slug,
      parentId,
      name,
      description: (row.reason || '').trim().slice(0, 300),
      canonicalTags: slug.split('-').filter((t) => t.length > 2).slice(0, 4),
    });
  }
  return out;
}

function buildDiscoveryPrompt(parents, leavesSoFar, batchItems, opts) {
  const { maxNewPerBatch, maxNewParents, bootstrapMode, gapFillMode } = opts;
  const grouped = buildGroupedLeafCatalog(
    leavesSoFar.map((l) => ({
      ...l,
      parentName: parents.find((p) => p.id === l.parentId)?.name,
    })),
    parents
  );
  const catalogMd = formatGroupedCatalogMarkdown(grouped);
  const stuckCount = batchItems.filter((i) => i.stuckKind && i.stuckKind !== 'manual_review').length;
  return [
    '## Task',
    bootstrapMode
      ? '**BOOTSTRAP:** Invent newParents (domains) and newLeaves (topics) from this batch, then assign items.'
      : gapFillMode
        ? '**Gap-fill:** These bookmarks did NOT get a specific topic from Classify (unassigned or stuck on *-general / Other). ' +
          'Add **newLeaves[]** (and **newParents[]** if needed) so distinct clusters become assignable specific topics. ' +
          'Reusing only *-general is NOT sufficient for stuck items.'
        : 'Grow a personal bookmark taxonomy: reuse existing parents and leaves when they fit. ' +
          'When bookmarks clearly belong to a **new top-level domain** not covered by any parent below, add `newParents` and put new leaves under that parent id.',
    stuckCount > 0
      ? `\n**${stuckCount}/${batchItems.length} items in this batch are stuck** (see stuckKind) — prioritize new atomic leaves for them.`
      : '',
    '',
    catalogMd,
    '',
    '## Rules',
    DISCOVER_CATALOG_RULES.map((r) => `- ${r}`).join('\n'),
    ...(gapFillMode && !bootstrapMode
      ? [
          '- When stuckKind is general or pending_discover, you MUST add matching entries in newLeaves[] (not only itemResults).',
          '- Each new leaf: unique name vs catalog, valid parentId, 2–5 word atomic topic.',
        ]
      : []),
    `- Propose at most ${maxNewParents ?? 5} new parents in newParents[]`,
    bootstrapMode
      ? `- In bootstrap, propose up to ${Math.min(maxNewPerBatch, 15)} new leaves`
      : `- Propose at most ${maxNewPerBatch} new leaves in newLeaves[]`,
    '- itemResults.categoryId MUST be a leaf id — NEVER a parent id.',
    DISCOVER_SKIP_RULES,
    '',
    '## Items (JSON)',
    '```json',
    JSON.stringify(batchItems.map(compactDiscoveryItem), null, 2),
    '```',
    '',
    '## Response (JSON only)',
    JSON.stringify({
      newParents: [{ id: 'optional slug', name: 'broad domain', description: 'what belongs' }],
      newLeaves: [
        {
          id: 'slug unique in batch',
          parentId: 'parent id',
          name: 'atomic topic',
          description: 'one sentence',
          canonicalTags: ['tag1'],
          exemplarItemIds: ['itemId'],
        },
      ],
      itemResults: [
        {
          itemId: 'string',
          action: 'assign_existing | assign_new | skip',
          categoryId: 'existing leaf id when assign_existing',
          proposedLeafId: 'slug when assign_new',
          reason: 'short',
        },
      ],
    }),
  ].join('\n');
}

export function sanitizeDiscoveryItemResults(itemResults, parentIds, leafIds) {
  const out = [];
  for (const row of itemResults ?? []) {
    if (!row?.itemId) continue;
    const action = String(row.action || '').toLowerCase();
    const cid = typeof row.categoryId === 'string' ? row.categoryId.trim() : '';
    if (action === 'assign_existing' && cid && parentIds.has(cid)) {
      out.push({
        ...row,
        action: 'skip',
        categoryId: undefined,
        reason: `${row.reason || ''} (invalid: parent id used as category)`.trim(),
      });
      continue;
    }
    if (action === 'assign_existing' && cid && !leafIds.has(cid)) {
      out.push({
        ...row,
        action: 'assign_new',
        proposedLeafId: row.proposedLeafId || cid,
        categoryId: undefined,
        reason: `${row.reason || ''} (leaf missing from categoriesSoFar)`.trim(),
      });
      continue;
    }
    out.push(row);
  }
  return out;
}

export async function callDiscoveryBatch(settings, parents, leavesSoFar, batchItems, opts) {
  const endpoint = `${(settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs || 90_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workbench-agent.local',
        'X-Title': 'Workbench Taxonomy Discovery',
      },
      body: JSON.stringify({
        model: settings.model || 'openai/gpt-4o-mini',
        temperature: settings.temperature ?? 0.15,
        max_tokens: settings.maxOutputTokens ?? 4000,
        messages: [
          {
            role: 'system',
            content:
              'You build a personal bookmark taxonomy with parents (domains) and leaves (topics). Return only valid JSON. You MAY propose newParents. Reuse existing categories when reasonable. Never skip items as inappropriate solely for adult/erotic content.',
          },
          {
            role: 'user',
            content: buildDiscoveryPrompt(parents, leavesSoFar, batchItems, {
              maxNewPerBatch: opts.maxNewPerBatch,
              maxNewParents: opts.maxNewParents ?? 5,
              bootstrapMode: opts.bootstrapMode,
              gapFillMode: opts.gapFillMode ?? (!opts.bootstrapMode && leavesSoFar.length > 0),
            }),
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
    const parsed = parseDiscoveryJson(text);
    if (!parsed) return { ok: false, error: 'Failed to parse JSON from model' };
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export function mergeNewLeaves(leavesSoFar, proposals, parentIds, { maxNewPerBatch }) {
  const byKey = new Map(leavesSoFar.map((l) => [normalizeNameKey(l.name), l]));
  const added = [];
  const list = Array.isArray(proposals) ? proposals : [];

  const cap = maxNewPerBatch > 0 ? maxNewPerBatch : list.length;
  for (const p of list.slice(0, cap)) {
    if (!p?.name || !parentIds.has(p.parentId)) continue;
    if ((p.name || '').includes('/')) continue;
    if (isGeneralLeafId(p.id)) continue;
    const key = normalizeNameKey(p.name);
    if (byKey.has(key)) continue;
    if (leavesSoFar.some((l) => l.parentId === p.parentId && isGeneralLeafId(l.id))) {
      const nk = normalizeNameKey(p.name);
      if (nk.includes('general') || nk.includes('other') || /^other\b/i.test(p.name)) continue;
    }

    let id = typeof p.id === 'string' ? p.id.trim().replace(/[^a-z0-9-]/g, '-') : '';
    if (!id || leavesSoFar.some((l) => l.id === id)) {
      id = leafIdFromProposal(p, leavesSoFar.length + added.length);
    }

    const leaf = {
      id,
      parentId: p.parentId,
      name: p.name.trim().slice(0, 80),
      description: (p.description || '').trim().slice(0, 300),
      canonicalTags: (p.canonicalTags ?? [])
        .map((t) => (typeof t === 'string' ? normalizeTag(t) : null))
        .filter(Boolean)
        .slice(0, 6),
      discoveredFrom: p.exemplarItemIds ?? [],
    };
    if (!leaf.canonicalTags.length) {
      leaf.canonicalTags = id.split('-').filter((t) => t.length > 2).slice(0, 4);
    }
    byKey.set(key, leaf);
    added.push(leaf);
    leavesSoFar.push(leaf);
  }

  return { leavesSoFar, added };
}

export function buildSeedDocument({ parents, leaves, taxonomyVersion, corpusMeta }) {
  return {
    version: 1,
    taxonomyVersion: taxonomyVersion ?? 1,
    description:
      'LLM-discovered taxonomy (parents + leaves) from batched title+summary samples. Used for topic-extract classify.',
    discoveredAt: new Date().toISOString(),
    corpusMeta: corpusMeta ?? {},
    parents,
    leaves,
  };
}

export function discoveryStats(leaves, itemResults) {
  const assigned = itemResults.filter((r) => r.action?.startsWith('assign')).length;
  const skipped = itemResults.filter((r) => r.action === 'skip').length;
  return {
    leafCount: leaves.length,
    discoveryAssigned: assigned,
    discoverySkipped: skipped,
  };
}

export function hashRunId(parts) {
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 12);
}
