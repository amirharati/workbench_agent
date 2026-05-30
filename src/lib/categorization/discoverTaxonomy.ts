import { runAICompletion } from '../ai/client';
import { aiSettingsForBatchJob } from '../ai/settings';
import type { AISettings } from '../ai/types';
import {
  buildGeneralLeafDefinition,
  buildGroupedLeafCatalog,
  formatGroupedCatalogMarkdown,
  isGeneralLeafId,
} from './taxonomyCatalog';
import { normalizeTag, slugFromTerms } from './naming';
import { stripFences } from './parseReview';
import type { AiCategory } from './types';

function normalizeNameKey(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function leafIdFromProposal(p: { name: string; canonicalTags?: string[] }, index: number): string {
  const tags = p.canonicalTags?.filter(Boolean) ?? [];
  const slug = slugFromTerms(tags.length ? tags : [normalizeNameKey(p.name).slice(0, 40)]);
  return `${slug || 'topic'}_${index}`;
}

export function parentIdFromProposal(name: string, existingIds: Set<string>): string {
  let base = slugFromTerms([name]);
  if (!base || base === 'topic') base = 'domain';
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

export interface DiscoverSampleItem {
  itemId: string;
  title: string;
  aiSummary: string;
  /** Why this item is in a discover batch (drives gap-fill prompting). */
  stuckKind?: 'pending_discover' | 'general' | 'unassigned' | 'manual_review';
}

export interface DiscoveryParentProposal {
  id?: string;
  name: string;
  description?: string;
}

export interface DiscoveryLeafProposal {
  id?: string;
  parentId: string;
  name: string;
  description?: string;
  canonicalTags?: string[];
}

export interface DiscoveryBatchResponse {
  newParents?: DiscoveryParentProposal[];
  newLeaves?: DiscoveryLeafProposal[];
  itemResults?: Array<{
    itemId?: string;
    action?: string;
    categoryId?: string;
    proposedLeafId?: string;
    reason?: string;
  }>;
}

function buildDiscoveryPrompt(
  parents: Array<{ id: string; name: string; description?: string }>,
  leavesSoFar: AiCategory[],
  batchItems: DiscoverSampleItem[],
  maxNewParents: number,
  maxNewLeaves: number,
  gapFillMode = false
): string {
  const grouped = buildGroupedLeafCatalog(leavesSoFar, parents);
  const catalogMd = formatGroupedCatalogMarkdown(grouped);
  const stuckCount = batchItems.filter((i) => i.stuckKind && i.stuckKind !== 'manual_review').length;
  return [
    '## Task',
    gapFillMode
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
    ...(gapFillMode
      ? [
          '- When stuckKind is general or pending_discover, you MUST add matching entries in newLeaves[] (not only itemResults).',
          '- Each new leaf: unique name vs catalog, valid parentId, 2–5 word atomic topic.',
        ]
      : []),
    `- Propose at most ${maxNewParents} new parents in newParents[]`,
    `- Propose at most ${maxNewLeaves} new leaves in newLeaves[]`,
    '',
    '## Items (JSON)',
    '```json',
    JSON.stringify(
      batchItems.map((i) => ({
        itemId: i.itemId,
        title: i.title,
        summary: i.aiSummary.slice(0, 800),
        ...(i.stuckKind ? { stuckKind: i.stuckKind } : {}),
      })),
      null,
      2
    ),
    '```',
    '',
    '## Response (JSON only)',
    JSON.stringify({
      newParents: [
        {
          id: 'optional slug e.g. sports-media',
          name: 'Broad domain (2-5 words)',
          description: 'what belongs in this domain; what does not',
        },
      ],
      newLeaves: [
        {
          id: 'slug unique in batch',
          parentId: 'existing or new parent id from newParents',
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
          proposedLeafId: 'optional slug when assign_new',
          reason: 'short',
        },
      ],
    }),
  ].join('\n');
}

export function mergeDiscoveryParents(
  categories: AiCategory[],
  proposals: DiscoveryParentProposal[],
  maxNew: number,
  now: number
): { categories: AiCategory[]; addedParents: AiCategory[]; parentIds: Set<string> } {
  const parentIds = new Set(
    categories.filter((c) => c.kind === 'parent').map((c) => c.id)
  );
  const byName = new Map(
    categories
      .filter((c) => c.kind === 'parent')
      .map((c) => [normalizeNameKey(c.name), c])
  );
  const addedParents: AiCategory[] = [];
  const cap = maxNew > 0 ? maxNew : proposals.length;

  for (const p of proposals.slice(0, cap)) {
    if (!p?.name?.trim()) continue;
    const nameKey = normalizeNameKey(p.name);
    if (byName.has(nameKey)) continue;

    let id =
      typeof p.id === 'string' ? p.id.trim().replace(/[^a-z0-9-]/g, '-') : '';
    if (!id || parentIds.has(id)) {
      id = parentIdFromProposal(p.name, parentIds);
    }
    parentIds.add(id);

    const parentRow: AiCategory = {
      id,
      name: p.name.trim().slice(0, 80),
      kind: 'parent',
      status: 'ai_proposed',
      assignable: false,
      description: (p.description || '').trim().slice(0, 300),
      source: 'discovered',
      childLeafCount: 1,
      itemCount: 0,
      primaryItemCount: 0,
      secondaryItemCount: 0,
      created_at: now,
      updated_at: now,
    };
    categories.push(parentRow);
    addedParents.push(parentRow);
    byName.set(nameKey, parentRow);

    const gen = buildGeneralLeafDefinition({ id, name: parentRow.name });
    const generalId = gen.id.startsWith('seed_') ? gen.id : gen.id;
    if (!categories.some((c) => c.id === generalId)) {
      const generalLeaf: AiCategory = {
        id: generalId,
        name: gen.name,
        kind: 'leaf',
        status: 'ai_proposed',
        assignable: true,
        parentId: id,
        parentName: parentRow.name,
        description: gen.description,
        source: 'discovered',
        canonicalTags: gen.canonicalTags,
        isGeneralFallback: true,
        centroid: [],
        itemCount: 0,
        primaryItemCount: 0,
        secondaryItemCount: 0,
        created_at: now,
        updated_at: now,
      };
      categories.push(generalLeaf);
    }
  }

  return { categories, addedParents, parentIds };
}

export function mergeDiscoveryLeaves(
  categories: AiCategory[],
  proposals: DiscoveryLeafProposal[],
  parentIds: Set<string>,
  maxNewPerBatch: number,
  now: number
): { categories: AiCategory[]; added: AiCategory[] } {
  const byKey = new Map(
    categories.filter((l) => l.kind === 'leaf').map((l) => [normalizeNameKey(l.name), l])
  );
  const added: AiCategory[] = [];
  const cap = maxNewPerBatch > 0 ? maxNewPerBatch : proposals.length;

  for (const p of proposals.slice(0, cap)) {
    if (!p?.name || !parentIds.has(p.parentId)) continue;
    if (p.name.includes('/')) continue;
    if (isGeneralLeafId(p.id ?? '')) continue;
    const key = normalizeNameKey(p.name);
    if (byKey.has(key)) continue;

    let id = typeof p.id === 'string' ? p.id.trim().replace(/[^a-z0-9-]/g, '-') : '';
    if (!id || categories.some((l) => l.id === id)) {
      id = leafIdFromProposal(p, categories.length + added.length);
    }

    const tags = (p.canonicalTags ?? [])
      .map((t) => (typeof t === 'string' ? normalizeTag(t) : null))
      .filter((t): t is string => Boolean(t))
      .slice(0, 6);

    const parentName =
      categories.find((c) => c.kind === 'parent' && c.id === p.parentId)?.name ?? p.parentId;

    const leaf: AiCategory = {
      id,
      name: p.name.trim().slice(0, 80),
      kind: 'leaf',
      status: 'ai_proposed',
      assignable: true,
      parentId: p.parentId,
      parentName,
      description: (p.description || '').trim().slice(0, 300),
      source: 'discovered',
      canonicalTags: tags.length ? tags : id.split('-').filter((t) => t.length > 2).slice(0, 4),
      centroid: [],
      itemCount: 0,
      created_at: now,
      updated_at: now,
    };
    byKey.set(key, leaf);
    added.push(leaf);
    categories.push(leaf);
  }

  return { categories, added };
}

/** Turn assign_new rows into leaf proposals when the model omitted newLeaves[]. */
export function leafProposalsFromItemResults(
  itemResults: DiscoveryBatchResponse['itemResults'],
  parentIds: Set<string>
): DiscoveryLeafProposal[] {
  const out: DiscoveryLeafProposal[] = [];
  for (const row of itemResults ?? []) {
    const action = String(row?.action ?? '').toLowerCase();
    if (action !== 'assign_new') continue;
    const slug =
      typeof row.proposedLeafId === 'string' ? row.proposedLeafId.trim().replace(/[^a-z0-9-]/g, '-') : '';
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

/** Create one leaf from a Classify `proposed` draft when parentId is known. */
export function promoteProposedLeaf(
  categories: AiCategory[],
  draft: {
    name: string;
    description?: string;
    canonicalTags?: string[];
    parentId?: string;
  },
  now: number
): { categories: AiCategory[]; leaf: AiCategory | null } {
  const parentIds = new Set(
    categories.filter((c) => c.kind === 'parent').map((c) => c.id)
  );
  const parentId = draft.parentId?.trim();
  if (!parentId || !parentIds.has(parentId)) {
    return { categories, leaf: null };
  }
  const merged = mergeDiscoveryLeaves(
    categories,
    [
      {
        parentId,
        name: draft.name,
        description: draft.description ?? '',
        canonicalTags: draft.canonicalTags,
      },
    ],
    parentIds,
    1,
    now
  );
  return { categories: merged.categories, leaf: merged.added[0] ?? null };
}

/** Merge new parents then leaves from one discovery LLM response. */
export function mergeDiscoveryTaxonomy(
  categories: AiCategory[],
  data: DiscoveryBatchResponse,
  opts: { maxNewParents: number; maxNewLeaves: number; now: number }
): { categories: AiCategory[]; addedParents: AiCategory[]; addedLeaves: AiCategory[] } {
  const parentMerge = mergeDiscoveryParents(
    categories,
    data.newParents ?? [],
    opts.maxNewParents,
    opts.now
  );
  let cats = parentMerge.categories;
  const fromResults = leafProposalsFromItemResults(data.itemResults, parentMerge.parentIds);
  const leafProposals = [...(data.newLeaves ?? []), ...fromResults];
  const leafMerge = mergeDiscoveryLeaves(
    cats,
    leafProposals,
    parentMerge.parentIds,
    opts.maxNewLeaves,
    opts.now
  );
  return {
    categories: leafMerge.categories,
    addedParents: parentMerge.addedParents,
    addedLeaves: leafMerge.added,
  };
}

export async function callDiscoveryBatch(
  settings: AISettings,
  parents: Array<{ id: string; name: string; description?: string }>,
  leavesSoFar: AiCategory[],
  batchItems: DiscoverSampleItem[],
  opts: { maxNewParents: number; maxNewLeaves: number; gapFillMode?: boolean; signal?: AbortSignal }
): Promise<{ ok: boolean; data?: DiscoveryBatchResponse; error?: string }> {
  try {
    const gapFill = opts.gapFillMode === true;
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, 4500),
      {
        taskType: 'general',
        signal: opts.signal,
        messages: [
          {
            role: 'system',
            content:
              'You build a personal bookmark taxonomy with top-level domains (parents) and atomic topics (leaves). ' +
              'Return only valid JSON. ' +
              (gapFill
                ? 'Many items lack a specific topic — add newLeaves[] for distinct clusters. *-general is not enough.'
                : 'You MAY propose newParents when the corpus needs a new domain. Reuse existing categories when they fit.') +
              ' Never skip items as inappropriate solely for adult/erotic content.',
          },
          {
            role: 'user',
            content: buildDiscoveryPrompt(
              parents,
              leavesSoFar,
              batchItems,
              opts.maxNewParents,
              opts.maxNewLeaves,
              gapFill
            ),
          },
        ],
      }
    );
    if (opts.signal?.aborted) throw new Error('Cancelled');
    const parsed = JSON.parse(stripFences(response.text)) as DiscoveryBatchResponse;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Failed to parse discovery JSON' };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof Error && e.message === 'Cancelled')) throw new Error('Cancelled');
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const DISCOVER_CATALOG_RULES = [
  'Parents are broad domains (e.g. Sports, News, Gaming). Leaves are atomic topics under one parent.',
  'Add newParents when a cluster of items does not fit ANY existing parent — not when only a leaf is missing.',
  'Each newParents entry needs a unique id slug; newLeaves under it must use that parentId.',
  'Each existing leaf includes path and pathIds. itemResults must use leaf id from catalog, never a parent id.',
  'Reuse *-general leaves for in-domain items when no specific leaf fits; do not add duplicate General/Other leaves.',
  'NEVER skip or omit items solely because they are adult/erotic/pornographic — propose or assign under health-lifestyle or a fitting parent.',
  'Explicit adult video/tube → adult-erotic-content or new parent if needed. Sexuality wellness → sexuality-wellness-education.',
];
